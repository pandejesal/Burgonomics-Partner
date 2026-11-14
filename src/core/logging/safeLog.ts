/**
 * Bounded, allowlisted diagnostic serialisation for the Partner logger.
 *
 * Native text capture often flattens object arguments to `[object Object]`,
 * while a raw object argument can leak a token, an order identifier or a
 * provider payload. This module turns one log call into exactly one JSON
 * string whose shape is fixed and whose fields are chosen from fixed lists.
 *
 * Rules enforced here (see DIAGNOSTIC-CONTRACT.md):
 * - Diagnostic identity is one of the source-owned IDs below; any other
 *   message — free text, provider message, order-suffixed quote — collapses to
 *   `app.log`. Nothing is hashed, redacted by regex or copied through.
 * - Only allowlisted scalars survive: a bounded HTTP status, a bounded attempt
 *   count, a retryable flag, and recognised standard error codes/types.
 * - Hostile input (getters, proxies, `toJSON`, `toString`, BigInt, cycles) can
 *   neither leak nor throw. Descriptors and the prototype trap ARE invoked —
 *   they are the only way to inspect a value without reading it — but each
 *   probe is guarded, so a throwing trap ends the walk; accessors, `toJSON`
 *   and `toString` are never called, and nothing is enumerated or recursed.
 * - The output is bounded by construction: every accepted value has a fixed
 *   or short format, so a line cannot approach the 2 KiB ceiling below.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

/** Stable identity for anything that is not an allowlisted event ID. */
export const GENERIC_EVENT_ID = 'app.log';

/** Hard ceiling; the construction below stays far under it. */
const MAX_EVENT_CHARS = 2048;

/**
 * Source-owned identifiers. `query.error` / `mutation.error` and the three
 * native IDs are the migration targets for call sites that still write raw
 * `console.*`; the rest are messages already emitted in identifier form.
 */
const EVENT_IDS = [
  'app.started',
  'query.error',
  'mutation.error',
  'native.systemBarsFailed',
  'native.statusBarFailed',
  'native.splashHideFailed',
  'adminStoresService.listStores_failed',
  'adminStoresService.bulkUpsert_failed',
  'adminStoresService.updateStore_failed',
  'adminStoresService.createStore_failed',
  'adminOrdersService.global_read_denied',
  'adminOrdersService.getHistory_failed',
  'adminOrdersService.updateOrderStatus_failed',
  'adminOrders.status_changed',
  'adminOrders.status_change_failed',
  'dashboardService.scope_resolve_failed',
  'dashboardService.reconciliation_unavailable',
  'kds.bump_queued_offline',
  'kds.bump_conflict',
  'kds.bump_failed',
  'kds.recall_failed',
  'kds.stream_index_missing',
  'kds.stream_error',
  'kds.alias_stream_merge_failed',
  'dispatch.inhouse_failed',
] as const;

const EVENT_ID_SET: ReadonlySet<string> = new Set(EVENT_IDS);

/**
 * Standard gRPC/Firebase/Firestore codes, plus the two Capacitor
 * `ExceptionCode` values a native bridge actually rejects with. Anything else —
 * including a provider response body or a made-up string — is omitted rather
 * than logged. No pattern matching: only these exact literals.
 */
const ALLOWED_CODES = [
  'aborted',
  'already-exists',
  'cancelled',
  'data-loss',
  'deadline-exceeded',
  'failed-precondition',
  'internal',
  'invalid-argument',
  'not-found',
  'out-of-range',
  'permission-denied',
  'resource-exhausted',
  'unauthenticated',
  'unavailable',
  'unimplemented',
  'unknown',
  'UNAVAILABLE',
  'UNIMPLEMENTED',
] as const;

/** Standard error type names; a custom or provider-supplied name is omitted. */
const ALLOWED_TYPES = [
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'EvalError',
  'URIError',
  'AggregateError',
  'AbortError',
  'DataCloneError',
  'EncodingError',
  'NetworkError',
  'NotAllowedError',
  'QuotaExceededError',
  'TimeoutError',
  'FirebaseError',
] as const;

/** Prototype depth allowed when looking for one field. */
const MAX_PROTOTYPE_DEPTH = 4;

/**
 * Read `key` only if it is a data property, walking a short prototype chain.
 * Accessors are returned as `undefined` without calling them, and a throwing
 * proxy trap ends the walk. Nothing is enumerated or recursively visited.
 *
 * The descriptor/prototype traps themselves must run — descriptor inspection
 * is the only way to see a value without invoking a getter — so they are
 * wrapped rather than avoided.
 */
function readDataProperty(source: unknown, key: string): unknown {
  if (
    source === null ||
    (typeof source !== 'object' && typeof source !== 'function')
  ) {
    return undefined;
  }
  let current: object | null = source as object;
  for (let depth = 0; current !== null && depth < MAX_PROTOTYPE_DEPTH; depth += 1) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined) {
        return Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
      }
      current = Object.getPrototypeOf(current);
    } catch {
      // Hostile proxy trap (getOwnPropertyDescriptor / getPrototypeOf).
      return undefined;
    }
  }
  return undefined;
}

function allowedString(value: unknown, allowed: readonly string[]): string | undefined {
  return typeof value === 'string' && allowed.includes(value) ? value : undefined;
}

function boundedInteger(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined;
}

/** The only accepted payload: fixed keys, allowlisted values. */
interface DiagnosticRecord {
  [key: string]: string | number | boolean;
}

function resolveEventId(message: string): string {
  return EVENT_ID_SET.has(message) ? message : GENERIC_EVENT_ID;
}

/**
 * Build the single console argument for one log call. Never throws: every
 * read is guarded, so a proxy trap or a throwing accessor degrades to an
 * omitted field instead of an application error.
 */
export function buildDiagnosticLine(
  level: LogLevel,
  message: string,
  error?: unknown,
  context?: unknown,
): string {
  const timestamp = new Date().toISOString();
  const record: DiagnosticRecord = {
    v: 1,
    level,
    event: resolveEventId(message),
    timestamp,
  };

  // Error and context are probed field by field; neither is serialised,
  // enumerated or stringified, and neither can supply `event`/`level`.
  const sources: readonly unknown[] = [error, context];
  for (const source of sources) {
    const code = allowedString(readDataProperty(source, 'code'), ALLOWED_CODES);
    if (code !== undefined && record.code === undefined) record.code = code;

    const type = allowedString(readDataProperty(source, 'name'), ALLOWED_TYPES);
    if (type !== undefined && record.type === undefined) record.type = type;

    const status = boundedInteger(readDataProperty(source, 'status'), 100, 599);
    if (status !== undefined && record.status === undefined) record.status = status;

    const attempt = boundedInteger(readDataProperty(source, 'attempt'), 0, 99);
    if (attempt !== undefined && record.attempt === undefined) record.attempt = attempt;

    const retryable = readDataProperty(source, 'retryable');
    if (typeof retryable === 'boolean' && record.retryable === undefined) {
      record.retryable = retryable;
    }
  }

  const line = JSON.stringify(record);
  if (line.length <= MAX_EVENT_CHARS) return line;

  // Unreachable with the field set above (longest possible line is well under
  // 300 chars); kept as a guard so a future field cannot blow the ceiling.
  return JSON.stringify({
    v: 1,
    level,
    event: GENERIC_EVENT_ID,
    timestamp,
  });
}
