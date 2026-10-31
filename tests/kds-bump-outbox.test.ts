import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

// Regression cover for two KDS lane findings:
//   F3 — a status bump lost-update precondition (`expectedStatus`) must be
//        sent on the wire with every POST /orders/bumpStatus.
//   F4 — the offline bump outbox replays entries of unknown age forever, so a
//        bump queued last night could flip a delivered order back to
//        "preparing". Entries now carry `queuedAt`/`expectedStatus` and the
//        reader drops anything past KDS_BUMP_TTL_MS.
//   F8 — leaving /kds must silence the module-level 10s repeating alarm.

vi.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  getAppCheckToken: async () => null,
}));

import {
  readPendingKdsBumps,
  writePendingKdsBumps,
  KDS_BUMP_TTL_MS,
  type PendingKdsBump,
} from '../src/features/kds/hooks/useKDSRealtimeStream';
import { partnerFunctionsApi } from '../src/services/partnerFunctionsApi';

const NOW = 1_700_000_000_000;
const bump = (over: Partial<PendingKdsBump> = {}): PendingKdsBump => ({
  orderId: 'ord_1',
  targetStatus: 'preparing',
  queuedAt: NOW - 1000,
  expectedStatus: 'pending',
  ...over,
});

describe('F4 — KDS offline bump outbox TTL + shape validation', () => {
  it('caps replay age at 10 minutes', () => {
    expect(KDS_BUMP_TTL_MS).toBe(10 * 60 * 1000);
  });

  it('keeps a bump queued inside the TTL, with its precondition intact', () => {
    const { fresh, stale } = readPendingKdsBumps(JSON.stringify([bump()]), NOW);
    expect(stale).toHaveLength(0);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].expectedStatus).toBe('pending');
  });

  it('drops a bump older than the TTL instead of replaying it', () => {
    const old = bump({ queuedAt: NOW - KDS_BUMP_TTL_MS - 1 });
    const { fresh, stale } = readPendingKdsBumps(JSON.stringify([old]), NOW);
    expect(fresh).toHaveLength(0);
    expect(stale).toEqual([old]);
  });

  it('treats a bump with no queuedAt (older build) as expired', () => {
    const legacy = { orderId: 'ord_2', targetStatus: 'ready' };
    const { fresh, stale } = readPendingKdsBumps(JSON.stringify([legacy]), NOW);
    expect(fresh).toHaveLength(0);
    expect(stale).toHaveLength(1);
  });

  it('ignores malformed payloads without throwing', () => {
    expect(readPendingKdsBumps(null, NOW)).toEqual({ fresh: [], stale: [] });
    expect(readPendingKdsBumps('not json', NOW)).toEqual({ fresh: [], stale: [] });
    expect(readPendingKdsBumps('{"orderId":"x"}', NOW)).toEqual({ fresh: [], stale: [] });
    const junk = JSON.stringify([null, { orderId: 7, targetStatus: 'ready' }, bump()]);
    const { fresh, stale } = readPendingKdsBumps(junk, NOW);
    expect(fresh).toHaveLength(1);
    expect(stale).toHaveLength(0);
  });

  it('round-trips through localStorage when a window exists', () => {
    const store = new Map<string, string>();
    (globalThis as unknown as Record<string, unknown>).window = {
      localStorage: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
    try {
      const queue = [bump()];
      writePendingKdsBumps(queue);
      const raw = (globalThis as any).window.localStorage.getItem('kds-pending-bumps:v1');
      expect(readPendingKdsBumps(raw, NOW).fresh).toEqual(queue);
    } finally {
      delete (globalThis as unknown as Record<string, unknown>).window;
    }
  });
});

describe('F3 — bumpOrderStatus carries the expectedStatus precondition', () => {
  const realFetch = globalThis.fetch;
  let body: any;

  beforeEach(() => {
    vi.stubEnv('VITE_FUNCTIONS_API_URL', 'https://example.invalid/api');
    globalThis.fetch = (async (_url: any, init: any) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ orderId: 'ord_1', status: { code: 'preparing' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it('POSTs expectedStatus alongside orderId/status', async () => {
    await partnerFunctionsApi.bumpOrderStatus({
      orderId: 'ord_1',
      status: 'preparing',
      expectedStatus: 'pending',
    });
    expect(body).toMatchObject({
      orderId: 'ord_1',
      status: 'preparing',
      expectedStatus: 'pending',
    });
  });

  it('still sends a valid bump when the caller has no precondition', async () => {
    await partnerFunctionsApi.bumpOrderStatus({ orderId: 'ord_2', status: 'ready' });
    expect(body).toMatchObject({ orderId: 'ord_2', status: 'ready' });
    expect(body.expectedStatus).toBeUndefined();
  });
});

describe('F8 — leaving /kds silences the module-level repeating alarm', () => {
  // Structural guard: the hook cannot be mounted here (no DOM/renderer in
  // this suite), so this asserts the wiring itself — that the ONLY
  // unmount-only effect returns stopRepeatingKDSAlarm, and that the alarm it
  // stops is the one kdsAudio.test.ts already proves stops chiming.
  const source = readFileSync(
    new URL('../src/features/kds/hooks/useKDSRealtimeStream.ts', import.meta.url),
    'utf8'
  );

  it('registers an unmount-only cleanup that stops the repeating alarm', () => {
    expect(source).toMatch(
      /useEffect\(\(\) => \{\s*return \(\) => stopRepeatingKDSAlarm\(\);\s*\}, \[\]\);/
    );
  });

  it('registers the alarm stop exactly once, in an empty-dep effect', () => {
    const cleanups = source.match(
      /useEffect\(\(\) => \{\s*return \(\) => stopRepeatingKDSAlarm\(\);\s*\}, \[\]\);/g
    );
    expect(cleanups).toHaveLength(1);
    // The pending-count-0 stop stays inside syncKDSAlarmState — unmount must
    // not be the only path that silences the loop.
    expect(source).toContain('syncKDSAlarmState(pendingOrders.length)');
  });
});
