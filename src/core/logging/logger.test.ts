import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Diagnostic-safety contract for the Partner logger (DIAGNOSTIC-CONTRACT.md).
 *
 * Every log call must produce exactly ONE JSON string argument. Identity comes
 * from a fixed allowlist of source-owned event IDs; anything else becomes
 * `app.log`. Only allowlisted scalars (standard code/type, bounded status,
 * bounded attempt, retryable) may survive; message, stack, identifiers, URLs,
 * headers, payloads and arbitrary context must not appear.
 *
 * Hostile input is modelled explicitly: getters, proxies, `toJSON`, `toString`,
 * BigInt and cycles. All fixtures are synthetic — no real credential, token,
 * identifier or provider response is used.
 */

type LogMethod = 'debug' | 'info' | 'warn' | 'error' | 'critical';

/** Synthetic secret/PII markers that must never appear in output. */
const SENSITIVE = {
  token: 'SYNTHETIC_FCM_TOKEN_do_not_log',
  email: 'synthetic.person@example.invalid',
  phone: '+910000000000',
  orderId: 'ORDER_SYNTHETIC_0001',
  url: 'https://provider.invalid/v1/orders?key=SYNTHETIC_KEY',
  message: 'Synthetic provider said: card declined for synthetic.person@example.invalid',
  stack: 'Error: synthetic\n    at syntheticFunction (file.ts:1:1)',
} as const;

let consoleCalls: Array<{ level: LogMethod; args: unknown[] }> = [];

const spies: Partial<Record<'debug' | 'info' | 'warn' | 'error', ReturnType<typeof vi.spyOn>>> = {};

function installConsoleSpies(): void {
  consoleCalls = [];
  for (const level of ['debug', 'info', 'warn', 'error'] as const) {
    spies[level] = vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleCalls.push({ level, args });
    });
  }
}

function callsFor(level: 'debug' | 'info' | 'warn' | 'error') {
  return consoleCalls.filter((call) => call.level === level);
}

/** Parse the single argument of each captured call as JSON. */
function parsed(level: 'debug' | 'info' | 'warn' | 'error'): Array<Record<string, unknown>> {
  return callsFor(level).map((call) => {
    expect(call.args).toHaveLength(1);
    expect(typeof call.args[0]).toBe('string');
    return JSON.parse(call.args[0] as string) as Record<string, unknown>;
  });
}

/** Load a fresh logger with the given DEV flag (module state is env-driven). */
async function loadLogger(dev: boolean) {
  vi.resetModules();
  vi.stubEnv('DEV', dev);
  vi.stubEnv('PROD', !dev);
  const { logger } = await import('./logger');
  return logger;
}

beforeEach(() => {
  installConsoleSpies();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('logger output shape', () => {
  it('writes exactly one parseable JSON string argument in production', async () => {
    const logger = await loadLogger(false);

    logger.warn('kds.stream_error');

    const [event] = parsed('warn');
    expect(event).toBeDefined();
    expect(event.level).toBe('warn');
    expect(event.event).toBe('kds.stream_error');
    expect(typeof event.timestamp).toBe('string');
    // No raw object/second argument survives.
    expect(callsFor('warn')[0].args).toHaveLength(1);
  });

  it('preserves a known source-owned event ID and an allowlisted error code', async () => {
    const logger = await loadLogger(false);
    const error = Object.assign(new Error(SENSITIVE.message), {
      code: 'permission-denied',
      name: 'Error',
      stack: SENSITIVE.stack,
    });

    logger.error('query.error', error);

    const [event] = parsed('error');
    expect(event.event).toBe('query.error');
    expect(event.code).toBe('permission-denied');
    expect(event.type).toBe('Error');
    // The free-text message and stack are never copied through.
    expect(JSON.stringify(event)).not.toContain('synthetic.person@example.invalid');
    expect(JSON.stringify(event)).not.toContain('syntheticFunction');
  });

  it('collapses unknown or dynamic messages to the generic identity', async () => {
    const logger = await loadLogger(false);

    logger.warn('Something provider-specific happened');
    logger.warn('[PorterLogistics] Quote unavailable for order …ABC123');
    logger.warn(`[PorterLogistics] Quote unavailable for order …${SENSITIVE.orderId}`);
    logger.warn(SENSITIVE.message);

    const events = parsed('warn');
    expect(events).toHaveLength(4);
    for (const event of events) {
      expect(event.event).toBe('app.log');
      expect(JSON.stringify(event)).not.toContain('PorterLogistics');
      expect(JSON.stringify(event)).not.toContain('ABC123');
      expect(JSON.stringify(event)).not.toContain('provider-specific');
    }
  });

  it('omits nested secrets, PII and identifiers from error and context', async () => {
    const logger = await loadLogger(false);
    const error = {
      name: 'Error',
      code: 'unavailable',
      message: SENSITIVE.message,
      stack: SENSITIVE.stack,
      config: { headers: { authorization: `Bearer ${SENSITIVE.token}` }, url: SENSITIVE.url },
      request: { token: SENSITIVE.token },
      response: { data: { phone: SENSITIVE.phone } },
    };
    const context = {
      orderId: SENSITIVE.orderId,
      email: SENSITIVE.email,
      phone: SENSITIVE.phone,
      url: SENSITIVE.url,
      message: SENSITIVE.message,
      headers: { authorization: `Bearer ${SENSITIVE.token}` },
      nested: { deep: { token: SENSITIVE.token } },
      status: 503,
      attempt: 3,
      retryable: true,
    };

    logger.error('mutation.error', error, context);

    const [event] = parsed('error');
    const serialised = JSON.stringify(event);
    for (const secret of Object.values(SENSITIVE)) {
      expect(serialised).not.toContain(secret);
    }
    // Only the allowlisted scalars survive.
    expect(event).toEqual({
      v: 1,
      level: 'error',
      event: 'mutation.error',
      timestamp: expect.any(String),
      code: 'unavailable',
      type: 'Error',
      status: 503,
      attempt: 3,
      retryable: true,
    });
  });

  it('rejects out-of-range or non-standard codes and scalars', async () => {
    const logger = await loadLogger(false);

    logger.warn('kds.bump_failed', {
      status: 99,
      attempt: 1000,
      code: 'SYNTHETIC_CUSTOM_CODE',
      type: 'ProviderAuthError',
      retryable: 'yes',
    });
    logger.warn('kds.bump_failed', {
      status: 600,
      attempt: -1,
      code: 'not a known code',
      type: 'SyntheticError',
    });

    const events = parsed('warn');
    for (const event of events) {
      expect(event.event).toBe('kds.bump_failed');
      expect(event).not.toHaveProperty('status');
      expect(event).not.toHaveProperty('attempt');
      expect(event).not.toHaveProperty('code');
      expect(event).not.toHaveProperty('type');
      expect(event).not.toHaveProperty('retryable');
    }
  });
});

describe('hostile input never escapes or propagates', () => {
  it('does not invoke throwing getters, toJSON or toString', async () => {
    const logger = await loadLogger(false);
    const toJsonSpy = vi.fn(() => {
      throw new Error('toJSON must not run');
    });
    const toStringSpy = vi.fn(() => {
      throw new Error('toString must not run');
    });
    const hostile = {
      code: 'unavailable',
      get message(): string {
        throw new Error('getter must not run');
      },
      get token(): string {
        throw new Error('getter must not run');
      },
      toJSON: toJsonSpy,
      toString: toStringSpy,
    };

    expect(() => logger.warn('native.statusBarFailed', hostile)).not.toThrow();

    const [event] = parsed('warn');
    expect(event.event).toBe('native.statusBarFailed');
    expect(event.code).toBe('unavailable');
    expect(toJsonSpy).not.toHaveBeenCalled();
    expect(toStringSpy).not.toHaveBeenCalled();
  });

  it('survives a proxy whose traps throw', async () => {
    const logger = await loadLogger(false);
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('trap: get');
        },
        getOwnPropertyDescriptor() {
          throw new Error('trap: getOwnPropertyDescriptor');
        },
        getPrototypeOf() {
          throw new Error('trap: getPrototypeOf');
        },
        ownKeys() {
          throw new Error('trap: ownKeys');
        },
      },
    );

    expect(() => logger.error('native.systemBarsFailed', hostile, hostile)).not.toThrow();

    const [event] = parsed('error');
    expect(event.event).toBe('native.systemBarsFailed');
    expect(event.code).toBeUndefined();
  });

  it('survives cyclic and BigInt payloads without recursive serialisation', async () => {
    const logger = await loadLogger(false);
    const cyclic: Record<string, unknown> = { code: 'internal' };
    cyclic.self = cyclic;
    cyclic.token = SENSITIVE.token;

    expect(() => logger.warn('native.splashHideFailed', { cyclic, big: 10n })).not.toThrow();

    const [event] = parsed('warn');
    const serialised = JSON.stringify(event);
    expect(serialised).not.toContain('[object Object]');
    expect(serialised).not.toContain(SENSITIVE.token);
    expect(() => JSON.parse(serialised)).not.toThrow();
  });

  it('never propagates a throwing console sink', async () => {
    const logger = await loadLogger(false);
    // Both sinks must throw: warn is routed to console.warn while error and
    // critical go to console.error, so isolating only warn would leave the
    // error/critical path unexercised.
    spies.warn?.mockImplementation(() => {
      throw new Error('console.warn exploded');
    });
    spies.error?.mockImplementation(() => {
      throw new Error('console.error exploded');
    });

    expect(() => logger.warn('kds.stream_error')).not.toThrow();
    expect(() => logger.error('query.error', new Error('synthetic'))).not.toThrow();
    expect(() => logger.critical('mutation.error', new Error('synthetic'))).not.toThrow();
    // Each call reached its (throwing) sink, so the guards really ran.
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(2);
  });

  it('accepts a raw Error as the warn context and keeps only its Capacitor code/type', async () => {
    const logger = await loadLogger(false);
    // A handled native failure is already an Error: the caller must not need a
    // cast, and the helper must not read `.message`/`.stack` to shape it.
    const nativeFailure = Object.assign(new Error(SENSITIVE.message), {
      code: 'UNIMPLEMENTED',
      stack: SENSITIVE.stack,
    });

    expect(() => logger.warn('native.statusBarFailed', nativeFailure)).not.toThrow();

    const [event] = parsed('warn');
    const serialised = JSON.stringify(event);
    expect(event.event).toBe('native.statusBarFailed');
    expect(event.code).toBe('UNIMPLEMENTED');
    expect(event.type).toBe('Error');
    expect(serialised).not.toContain('Synthetic provider said');
    expect(serialised).not.toContain('syntheticFunction');
    expect(event).toEqual({
      v: 1,
      level: 'warn',
      event: 'native.statusBarFailed',
      timestamp: expect.any(String),
      code: 'UNIMPLEMENTED',
      type: 'Error',
    });
  });

  it('preserves UNAVAILABLE and the recognised FirebaseError type', async () => {
    const logger = await loadLogger(false);
    const clientFailure = Object.assign(new Error('synthetic firebase failure'), {
      name: 'FirebaseError',
      code: 'UNAVAILABLE',
    });

    logger.error('query.error', clientFailure);

    const [event] = parsed('error');
    expect(event.code).toBe('UNAVAILABLE');
    expect(event.type).toBe('FirebaseError');
    expect(JSON.stringify(event)).not.toContain('synthetic firebase failure');
  });
});

describe('severity gating and size bound', () => {
  it('keeps debug/info silent outside DEV and emits them in DEV', async () => {
    const prodLogger = await loadLogger(false);
    prodLogger.debug('app.started');
    prodLogger.info('app.started');
    expect(callsFor('debug')).toHaveLength(0);
    expect(callsFor('info')).toHaveLength(0);

    const devLogger = await loadLogger(true);
    devLogger.debug('app.started');
    devLogger.info('app.started');
    expect(parsed('debug')[0]).toMatchObject({ level: 'debug', event: 'app.started' });
    expect(parsed('info')[0]).toMatchObject({ level: 'info', event: 'app.started' });
  });

  it('keeps warn/error/critical emitting in production', async () => {
    const logger = await loadLogger(false);

    logger.warn('kds.stream_error');
    logger.error('query.error', new Error('synthetic'));
    logger.critical('mutation.error', new Error('synthetic'));

    expect(parsed('warn')[0].level).toBe('warn');
    expect(parsed('error')).toHaveLength(2);
    expect(parsed('error').map((event) => event.level)).toEqual(['error', 'critical']);
  });

  it('bounds every event well under 2 KiB even with oversized input', async () => {
    const logger = await loadLogger(false);
    const huge = 'S'.repeat(64 * 1024);

    logger.error('query.error', { code: 'internal', message: huge, stack: huge }, { message: huge });

    const [call] = callsFor('error');
    expect(call.args).toHaveLength(1);
    expect((call.args[0] as string).length).toBeLessThan(2048);
    expect(call.args[0] as string).not.toContain(huge.slice(0, 128));
  });
});
