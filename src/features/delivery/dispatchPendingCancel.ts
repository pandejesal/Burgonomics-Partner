import type { PendingDispatchCancelSummary } from '@/services/partnerFunctionsApi';

/**
 * Reading the durable dispatch-cancellation state the server writes
 * (backend review/20261030-backend, commits 1ebb596 + 2b92d55).
 *
 * `dispatchPendingCancel` (functions/src/modules/dispatch/dispatch.cancelPending.ts:34-59)
 * records a local release whose REMOTE cancellation is unproven. While the
 * state is `pending`, `manual_required` or `dead_lettered` the order still
 * belongs to the old booking: /dispatch/book, /dispatch/rebook and the Porter
 * paste lane all refuse with 409 DISPATCH_CANCEL_UNCONFIRMED, because booking a
 * replacement would put two riders on one order.
 *
 * `dispatchCancelAlert` (shadowfax.reconcile.ts:678-690, 771-781) is the
 * staff-facing alert raised alongside it, e.g.
 * DISPATCH_CANCEL_MANUAL_REQUIRED / DISPATCH_CANCEL_DEAD_LETTERED /
 * DISPATCH_CANCEL_PENDING.
 *
 * These readers are pure and never invent a record: an absent/garbage field is
 * simply "no pending cancellation".
 */

const BLOCKING_STATES = new Set(['pending', 'manual_required', 'dead_lettered']);

export type PendingCancelState = 'pending' | 'manual_required' | 'dead_lettered' | 'confirmed';

/** The stored record, timestamps included (the UI only needs the summary). */
export interface StoredDispatchPendingCancel extends PendingDispatchCancelSummary {
  providerCanCancel?: boolean;
  requestedAt?: unknown;
  lastAttemptAt?: unknown;
  confirmedAt?: unknown;
  confirmedBy?: string | null;
  confirmedByName?: string | null;
  confirmedNote?: string | null;
}

export interface DispatchCancelAlert {
  code: string;
  provider: string | null;
  providerOrderId: string | null;
  reason: string | null;
  requestedBy: string | null;
  message: string | null;
  raisedAt?: unknown;
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** The stored `dispatchPendingCancel`, or null when absent/malformed. */
export function readPendingDispatchCancel(order: unknown): StoredDispatchPendingCancel | null {
  const raw = (order as { dispatchPendingCancel?: unknown } | null | undefined)
    ?.dispatchPendingCancel;
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const state = record.state;
  if (
    state !== 'pending' &&
    state !== 'manual_required' &&
    state !== 'dead_lettered' &&
    state !== 'confirmed'
  ) {
    // An unknown state is not evidence of a confirmed cancellation, but it is
    // also not something this UI can act on; treat it as absent rather than
    // guessing a block (a wrong block would hide the escape hatch).
    return null;
  }
  return {
    provider: (record.provider as StoredDispatchPendingCancel['provider']) ?? null,
    providerOrderId: strOrNull(record.providerOrderId),
    reason: strOrNull(record.reason) ?? '',
    state,
    requestedBy: strOrNull(record.requestedBy),
    attempts: numOrZero(record.attempts),
    lastError: strOrNull(record.lastError),
    staffActionRequired: strOrNull(record.staffActionRequired),
    providerCanCancel: record.providerCanCancel === true,
    requestedAt: record.requestedAt,
    lastAttemptAt: record.lastAttemptAt,
    confirmedAt: record.confirmedAt,
    confirmedBy: strOrNull(record.confirmedBy),
    confirmedByName: strOrNull(record.confirmedByName),
    confirmedNote: strOrNull(record.confirmedNote),
  };
}

/** True while the remote cancellation is unproven — i.e. dispatch is blocked. */
export function isDispatchCancelBlocking(orderOrRecord: unknown): boolean {
  const direct = orderOrRecord as { state?: unknown } | null | undefined;
  const record =
    direct && typeof direct === 'object' && typeof direct.state === 'string'
      ? (direct as { state: string })
      : readPendingDispatchCancel(orderOrRecord);
  if (!record) return false;
  return BLOCKING_STATES.has(record.state as string);
}

/** The stored `dispatchCancelAlert`, or null when absent/cleared. */
export function readDispatchCancelAlert(order: unknown): DispatchCancelAlert | null {
  const raw = (order as { dispatchCancelAlert?: unknown } | null | undefined)?.dispatchCancelAlert;
  if (!raw || typeof raw !== 'object') return null;
  const alert = raw as Record<string, unknown>;
  const code = strOrNull(alert.code);
  if (!code) return null;
  return {
    code,
    provider: strOrNull(alert.provider),
    providerOrderId: strOrNull(alert.providerOrderId),
    reason: strOrNull(alert.reason),
    requestedBy: strOrNull(alert.requestedBy),
    message: strOrNull(alert.message),
    raisedAt: alert.raisedAt,
  };
}

/** Human provider name for the dashboard copy. */
export function providerDashboardName(provider: string | null | undefined): string {
  if (provider === 'borzo') return 'Borzo dashboard';
  if (provider === 'porter') return 'Porter enterprise dashboard';
  if (provider === 'shadowfax') return 'Shadowfax dashboard';
  return 'provider dashboard';
}

/** Plain provider name (no "dashboard") for sentences. */
export function providerShortName(provider: string | null | undefined): string {
  if (provider === 'borzo') return 'Borzo';
  if (provider === 'porter') return 'Porter';
  if (provider === 'shadowfax') return 'Shadowfax';
  return 'the courier';
}
