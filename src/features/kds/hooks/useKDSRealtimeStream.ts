import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logger } from '@/core/logging/logger';
import { useOrders } from '@/hooks/useOrders';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { db } from '@/config/firebase';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import type { QueryConstraint } from 'firebase/firestore';
import {
  fetchAliasedStoreOrders,
  normalizeOrderDoc,
  orderDocTimeMs,
  createKdsIngestionGate,
} from '@/utils/orderContract';
import { FIRESTORE_IN_LIMIT, isGlobalRole, resolveScopedBranchIds } from '@/utils/branchScope';
import { playKDSArrivalCue, stopRepeatingKDSAlarm, resetKDSAlarmState, syncKDSAlarmState } from '@/utils/kdsAudio';
import {
  capNewOrderIds,
  type KdsNewOrderAlertState,
} from '@/features/kds/newOrderAlert';
import { isStaleOrderConflict } from '@/utils/orderConflict';
import { orderPaymentChannel } from '@/utils/analyticsMath';
import type { Order, OrderStatus } from '@/types';

export interface RecalledOrderHistory {
  order: Order;
  previousStatus: OrderStatus;
  timestamp: number;
  /**
   * Authorisation scope this bump happened under. Optional only for
   * backwards-compatible consumers of the type; every record this hook creates
   * is tagged, and an UNTAGGED record is never displayed (fail closed).
   */
  scopeKey?: string;
}

/** One queued offline bump. `queuedAt`/`expectedStatus` were added in v2. */
export interface PendingKdsBump {
  orderId: string;
  targetStatus: OrderStatus;
  /** Epoch ms the operator tapped — replays past the TTL are dropped. */
  queuedAt?: number;
  /** Status the KDS card showed when queued — lost-update precondition. */
  expectedStatus?: OrderStatus;
  /**
   * Authorisation scope that PRODUCED this bump (`kdsAuthScopeKey`).
   *
   * Optional for backwards compatibility with rows already on disk. A row
   * without it is never replayed under a guessed owner: it is retained and
   * reported. This field is queue metadata only and is NEVER sent to the
   * backend — the wire payload stays orderId/status/expectedStatus.
   */
  scopeKey?: string;
}

/**
 * An offline bump older than this is dropped instead of replayed. A queue
 * entry from last night must never flip a delivered/cancelled order back to
 * "preparing" as if it were fresh work.
 */
export const KDS_BUMP_TTL_MS = 10 * 60 * 1000;

const PENDING_BUMPS_KEY = 'kds-pending-bumps:v1';

/**
 * Shape-validates the persisted outbox and drops entries past the TTL.
 * Entries written by older builds carry no `queuedAt` — those are treated as
 * expired rather than replayed with unknown age.
 */
export function readPendingKdsBumps(
  raw: string | null,
  nowMs: number = Date.now()
): { fresh: PendingKdsBump[]; stale: PendingKdsBump[] } {
  const fresh: PendingKdsBump[] = [];
  const stale: PendingKdsBump[] = [];
  if (!raw) return { fresh, stale };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { fresh, stale };
  }
  if (!Array.isArray(parsed)) return { fresh, stale };
  for (const entry of parsed) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof (entry as PendingKdsBump).orderId !== 'string' ||
      typeof (entry as PendingKdsBump).targetStatus !== 'string'
    ) {
      continue;
    }
    const bump = entry as PendingKdsBump;
    const queuedAt = typeof bump.queuedAt === 'number' ? bump.queuedAt : null;
    if (queuedAt === null || nowMs - queuedAt > KDS_BUMP_TTL_MS) {
      stale.push(bump);
      continue;
    }
    fresh.push(bump);
  }
  return { fresh, stale };
}

export function writePendingKdsBumps(queue: PendingKdsBump[]): void {
  try {
    window.localStorage.setItem(PENDING_BUMPS_KEY, JSON.stringify(queue));
  } catch {
    /* storage unavailable — ephemeral queue only */
  }
}

/**
 * Why the live onSnapshot listener stopped delivering. A missing composite
 * index is a deployment gap, not a data failure — but the operator-facing
 * consequence is identical, so the feed is not live either way.
 */
export type KdsStreamFailureKind = 'missing_index' | 'listener_error';

/**
 * One failing listener within a stream generation. A global role reads TWO
 * feeds (`createdAt` + the Delivery `placedAt` feed); the makeline is only
 * live when BOTH are healthy, so failures are tracked per feed rather than as
 * one shared flag that any healthy snapshot could erase.
 */
export type KdsFeedId = 'primary' | 'delivery';

export { createKdsIngestionGate } from '@/utils/orderContract';
export type { KdsIngestionGate } from '@/utils/orderContract';

/**
 * STRESS SWEEP 2026-10-24 (H3): eviction for the chime-dedupe set must not
 * evict ids that are STILL PENDING — the blind FIFO delete re-alarmed
 * long-pending tickets once their id scrolled out of the first 100 entries.
 */
export const pruneKdsSeenOrderIds = (
  seen: Set<string>,
  pendingIds: readonly string[],
  cap = 500,
  slice = 100
): void => {
  if (seen.size <= cap) return;
  const pendingSet = new Set(pendingIds);
  let evicted = 0;
  for (const id of seen) {
    if (evicted >= slice) break;
    if (pendingSet.has(id)) continue; // never evict an active ticket
    seen.delete(id);
    evicted++;
  }
};

/**
 * Classify an onSnapshot error callback argument. `failed-precondition` is
 * Firestore's code for "this query needs an index that isn't deployed"; the
 * message check catches the same rejection surfaced without the code.
 */
export function classifyKdsStreamFailure(err: unknown): KdsStreamFailureKind {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  const message = (err as { message?: unknown } | null | undefined)?.message;
  if (code === 'failed-precondition') return 'missing_index';
  return /failed[- ]precondition|\bindex\b/i.test(String(message ?? ''))
    ? 'missing_index'
    : 'listener_error';
}

/**
 * Operator-readable error for the index-gap degradation. A module-level
 * instance keeps identity stable, so a repeatedly failing listener does not
 * re-render (or re-announce) the page on every identical rejection.
 */
export const KDS_STREAM_INDEX_ERROR: Error = Object.assign(
  new Error(
    'Live makeline stream unavailable — the Firestore index for this branch view is not deployed. Last good data stays on screen.'
  ),
  { name: 'KdsStreamIndexError' }
);

/** What the KDS header may honestly claim about the makeline feed. */
export type KdsStreamStatus = 'connecting' | 'live' | 'live_unavailable';

export interface KdsFeedStateInput {
  /** The branch-scoped onSnapshot listener has delivered ≥1 snapshot. */
  streamHydrated: boolean;
  /** The listener fired its error callback and no snapshot has arrived since. */
  listenerFailed: boolean;
  /** The one-shot useOrders query (seed/fallback) is still in flight. */
  oneShotLoading: boolean;
  /** The one-shot useOrders query rejected — fallback data is unavailable. */
  oneShotError: unknown;
  /**
   * Orders already verified in an earlier generation of the SAME scope are
   * still on screen. Optional; absent/false means "no verified history", which
   * preserves the cold-start controls below.
   */
  hasVerifiedLiveData?: boolean;
}

/**
 * Header-badge state for the makeline feed. A failed listener must NEVER
 * read as live, and "live" is claimed only once some source has actually
 * delivered data — never from an unverified, silently-stalled stream.
 *
 * A one-shot failure only means the FALLBACK read failed. When previously
 * verified orders are still displayed (a same-scope refresh, mid-resubscribe),
 * that is not an unreadable makeline: the honest state is "connecting" while
 * the new generation proves itself. With no verified history a cold start plus
 * a failed one-shot is genuinely unavailable.
 */
export function deriveKdsStreamStatus(input: KdsFeedStateInput): KdsStreamStatus {
  if (input.listenerFailed) return 'live_unavailable';
  if (input.streamHydrated) return 'live';
  if (input.oneShotError && !input.hasVerifiedLiveData) return 'live_unavailable';
  if (input.oneShotLoading) return 'connecting';
  return 'connecting';
}

/**
 * Authorisation identity for the makeline. Everything a KDS read depends on:
 * who it is, what role, which branches are actually resolved for reading, and
 * the UI selection. `selectedBranchId` alone is NOT an authorisation boundary —
 * two users can share a selection while seeing different tickets, and the same
 * user can narrow role or branch assignment without changing the selection.
 *
 * `resolvedBranchIds` is the sorted, normalised set `resolveScopedBranchIds`
 * produced (i.e. exactly what the query is clamped to), so a global role with
 * no selection ("all") is distinguishable from a scoped role that happens to
 * have the same empty selection.
 */
export function kdsAuthScopeKey(input: {
  userId: string | null | undefined;
  role: string | null | undefined;
  resolvedBranchIds: readonly string[];
  selectedBranchId: string | null | undefined;
}): string {
  const branches = [...new Set(input.resolvedBranchIds.map((id) => String(id).trim()))]
    .filter((id) => id.length > 0)
    .sort();
  return [
    input.userId ?? 'anonymous',
    input.role ?? 'no-role',
    branches.join(','),
    input.selectedBranchId ?? 'all',
  ].join('::');
}

/**
 * Whether the data on screen was ever verified by the live stream or by a
 * successful one-shot read. Without this the columns would present an
 * unreadable feed as an empty kitchen ("grill is clear").
 */
export function kdsDataVerified(input: {
  streamHydrated: boolean;
  oneShotLoading: boolean;
  oneShotError: unknown;
}): boolean {
  return input.streamHydrated || (!input.oneShotLoading && !input.oneShotError);
}

/** Column body state — one source of truth for all three KDS columns. */
export type KdsColumnState = 'loading' | 'error' | 'empty' | 'orders';

/**
 * Decide what a makeline column renders. `error` requires that NO verified
 * data exists (dead listener AND unusable fallback); when the listener died
 * after data was verified the last good orders keep rendering instead of
 * being replaced by an error panel.
 */
export function deriveKdsColumnState(input: {
  isLoading: boolean;
  dataVerified: boolean;
  itemCount: number;
}): KdsColumnState {
  if (input.isLoading) return 'loading';
  if (!input.dataVerified) return 'error';
  return input.itemCount === 0 ? 'empty' : 'orders';
}

/**
 * Freshness label for the data-age chip. When the live feed is down the age
 * describes the LAST GOOD read, so a stale makeline can never masquerade as
 * fresh data.
 */
export function formatKdsDataAge(
  nowMs: number,
  lastRefreshAtMs: number,
  streamLive: boolean
): string {
  const ageSec = Math.max(0, Math.round((nowMs - lastRefreshAtMs) / 1000));
  const value = ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`;
  return streamLive ? `data ${value} old` : `last good data ${value} old`;
}

/**
 * F11: a 409 / stale-precondition rejection means ANOTHER terminal already
 * moved this order. Reporting "order unchanged" is a lie in that case — and
 * leaves the operator staring at a stale card. Surface the conflict and force
 * a resubscribe so the board catches up.
 */
export { isStaleOrderConflict } from '@/utils/orderConflict';

export function useKDSRealtimeStream() {
  const { user } = useAuthStore();
  const { selectedBranchId } = useAppStore();
  const {
    orders = [],
    isLoading,
    error: ordersError,
    updateOrderStatus,
    ordersDataScope,
    dataUpdatedAt = 0,
    refetch: refetchOrders,
  } = useOrders();

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Live makeline source: seeded from the one-shot useOrders query and then
  // owned exclusively by the branch-scoped Firestore snapshot (below).
  const [liveOrders, setLiveOrders] = useState<Order[]>(orders);
  // The auth scope `liveOrders` was populated under. A render-time fence
  // compares this against the CURRENT scope, so an identity switch can never
  // paint the previous identity's rows for even one commit — an effect-only
  // reset runs after render and would be too late.
  const [liveOrdersScope, setLiveOrdersScope] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<Error | null>(null);
  const [listenerEpoch, setListenerEpoch] = useState(0);
  const streamHydratedRef = useRef<boolean>(false);
  // Render-time mirror of streamHydratedRef: the header badge and the
  // column state must re-render the moment the listener's first snapshot
  // lands (or its failure proves no snapshot is coming).
  const [streamHydrated, setStreamHydrated] = useState<boolean>(false);

  // HISTORICAL verification of the dataset currently displayed. Deliberately
  // separate from per-generation `streamHydrated`: a same-scope refresh starts
  // a new generation (readiness resets to "connecting") but the orders on
  // screen were already verified, so the columns must keep rendering them
  // instead of flipping to an error panel. Tagged with the scope it was earned
  // under and cleared on any authorisation change.
  const [hasVerifiedLiveData, setHasVerifiedLiveData] = useState<boolean>(false);
  const [verifiedScope, setVerifiedScope] = useState<string | null>(null);

  // Primitive identity inputs. Depending on the raw `user` object meant a fresh
  // but equivalent object (same uid/role/branches) rebuilt everything below.
  const scopeUserId = user?.id ?? null;
  const scopeRole = user?.role ?? null;
  const regional = scopeRole === 'regional_manager';
  // Only the canonical feed can prove a regional assignment. In particular,
  // session branchIds and the shared global-selection helper grant nothing.
  const regionalBranchSignature = regional && ordersDataScope
    && ordersDataScope.userId === scopeUserId
    && ordersDataScope.role === scopeRole
    && ordersDataScope.selectedBranchId === (selectedBranchId ?? null)
    && !ordersError && !isLoading
    ? JSON.stringify(ordersDataScope.resolvedBranchIds)
    : '[]';
  // Normalise BEFORE joining: an equal effective branch set must produce the
  // same signature even when the caller reorders, duplicates or pads ids.
  // A raw join would hash [y,z] and [z,y] differently while they mean the same.
  const scopeBranchListSignature = (user?.branchIds ?? [])
    .map((id) => String(id).trim())
    .filter((id) => id.length > 0)
    .filter((id, index, all) => all.indexOf(id) === index)
    .sort()
    .join('\u0000');

  // The typed minimal input `resolveScopedBranchIds` needs, rebuilt from the
  // stable signature — never from the raw `user` object, whose identity would
  // otherwise leak into every dependency list below. `null` when there is no
  // role at all: the resolver already accepts `null`, and fabricating a role
  // would be a silent authorisation claim.
  const scopeIdentity = useMemo(
    () =>
      scopeRole === null
        ? null
        : {
            role: scopeRole,
            branchIds: scopeBranchListSignature ? scopeBranchListSignature.split('\u0000') : [],
          },
    [scopeRole, scopeBranchListSignature]
  );

  // F6: the branch scope the stream actually reads — surfaced so the KDS
  // header can say when the Firestore `in` cap truncates it (no silent drop).
  // Declared early because the seeding path and the render fence both need it.
  // Stabilised: trimmed, deduped, sorted, so an equal fresh array (or a
  // reordered one) yields the SAME array instance.
  const scopeBranchIds = useMemo(
    () =>
      (regional
        ? JSON.parse(regionalBranchSignature) as string[]
        : resolveScopedBranchIds(scopeIdentity, selectedBranchId))
        .map((id) => String(id).trim())
        .filter((id) => id.length > 0)
        .filter((id, index, all) => all.indexOf(id) === index)
        .sort(),
    [regional, regionalBranchSignature, scopeIdentity, selectedBranchId]
  );

  // Full authorisation identity (uid + role + resolved branches + selection).
  const authScopeKey = useMemo(
    () =>
      kdsAuthScopeKey({
        userId: user?.id ?? null,
        role: user?.role ?? null,
        resolvedBranchIds: scopeBranchIds,
        selectedBranchId: selectedBranchId ?? null,
      }),
    [user?.id, user?.role, scopeBranchIds, selectedBranchId]
  );

  /**
   * PROVENANCE. The one-shot rows may only be trusted when the cache entry that
   * produced them was keyed by THIS authorisation scope. The descriptor is null
   * while the query is pending or serving a placeholder from a previous query,
   * so a lagging A result can never be attributed to B.
   */
  const oneShotOwnedByScope = useMemo(() => {
    if (!ordersDataScope) return false;
    return (
      kdsAuthScopeKey({
        userId: ordersDataScope.userId,
        role: ordersDataScope.role,
        resolvedBranchIds: ordersDataScope.resolvedBranchIds,
        selectedBranchId: ordersDataScope.selectedBranchId,
      }) === authScopeKey
    );
  }, [ordersDataScope, authScopeKey]);
  const regionalFeedVerified = regional && oneShotOwnedByScope && !isLoading && !ordersError;

  // Latest scope for async callbacks. A captured local compared against another
  // captured local is a tautology; this ref is what a resolution must check.
  const latestAuthScopeKeyRef = useRef<string>(authScopeKey);
  latestAuthScopeKeyRef.current = authScopeKey;

  // Last page per global feed, retained ACROSS same-scope refreshes so a new
  // generation's first primary snapshot cannot drop the Delivery tickets that
  // were already on screen. Reset whenever the authorised scope changes.
  const globalPagesRef = useRef<Map<string, Array<{ id: string; data: Record<string, any> }>>>(
    new Map(),
  );
  const pageScopeRef = useRef<string | null>(null);

  // Resubscribe + refetch. Declared before bumpOrder so a stale-precondition
  // (409) failure can force the board to catch up with the terminal that won.
  const queryClient = useQueryClient();
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    if (regional) void refetchOrders();
    else setListenerEpoch((epoch) => epoch + 1);
  }, [queryClient, regional, refetchOrders]);

  // Surface the live-stream error when present, else the one-shot query error.
  const streamError = regional ? ordersError ?? null : liveError ?? ordersError ?? null;

  // Recall stack (each entry active for 60 seconds, max 5 deep): rapid
  // successive bumps used to overwrite a single recall slot, stranding the
  // earlier bump with no undo. Expired entries are pruned on read.
  const [recallStack, setRecallStack] = useState<RecalledOrderHistory[]>([]);

  const pruneRecallStack = (stack: RecalledOrderHistory[]): RecalledOrderHistory[] => {
    const now = Date.now();
    const fresh = stack.filter((e) => now - e.timestamp < 60000);
    return fresh.slice(-5);
  };

  /**
   * Recall entries belonging to the CURRENT authorisation scope only.
   *
   * The render fence is the security boundary: an effect-only clear would let
   * the first render of a new scope paint the old operator's Recall button.
   * An untagged entry is foreign by definition and never surfaces.
   */
  const scopedRecallStack = pruneRecallStack(recallStack).filter(
    (entry) => entry.scopeKey === authScopeKey
  );
  const liveRecallStack = scopedRecallStack;
  const recallHistory = liveRecallStack.length > 0 ? liveRecallStack[liveRecallStack.length - 1] : null;

  // Audio deduplication: store order IDs that have already chimed
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef<boolean>(false);

  // Non-audio arrival signal (A11Y-14): ids that arrived since the previous
  // snapshot. The chime is best-effort; the page renders these as a visible
  // banner plus a polite live region so a muted/blocked speaker is never the
  // difference between seeing and missing a ticket. Only a capped tail is
  // retained (the full burst size is kept as `total`) so an ignored banner on
  // a long-lived tab cannot grow one aria-live string without bound.
  const [newOrderAlert, setNewOrderAlert] = useState<KdsNewOrderAlertState | null>(null);
  // Scope the alert was raised under. A bare `KdsNewOrderAlertState` carries no
  // owner, so the tag is kept beside it rather than widening the exported type.
  const [newOrderAlertScope, setNewOrderAlertScope] = useState<string | null>(null);
  const dismissNewOrderAlert = useCallback(() => {
    setNewOrderAlert(null);
    setNewOrderAlertScope(null);
  }, []);

  /** Arrival banner, render-fenced to the current auth scope. */
  const scopedNewOrderAlert = newOrderAlertScope === authScopeKey ? newOrderAlert : null;

  // Online / offline listeners + outbox drain. Queued bumps replay in
  // order when connectivity returns; entries that still fail stay queued.
  // drainingRef keeps the drain single-flight across awaits. The effect now
  // depends on the stable `mutateAsync` FUNCTION plus scope/connectivity, not
  // on the mutation object (which react-query recreates every render).
  const drainingRef = useRef<boolean>(false);
  // Retry token: its VALUE is an effect dependency, so bumping it genuinely
  // re-runs the drain effect. (Previously the setter was destructured and the
  // value discarded, so the bump could never re-run anything.)
  const [drainRetry, setDrainRetry] = useState(0);
  // Last scope we told the operator about, so the unowned notice fires once.
  const unownedNoticeRef = useRef<string | null>(null);
  // Mounted for THIS hook instance. StrictMode's setup→cleanup→setup keeps this
  // true across the synthetic cycle; a real unmount sets it false for good.
  const mountedRef = useRef<boolean>(true);
  // A drain trigger arrived while an old flight was still awaiting. The
  // finalizer consumes it exactly once.
  const rerunRequestedRef = useRef<boolean>(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // The mutation FUNCTION, not the fresh `{ mutateAsync }` object: React Query
  // returns a new mutation object every render, so depending on the object made
  // this effect clean up (and cancel its own drain) on every re-render.
  const mutateAsyncFn =
    updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function'
      ? updateOrderStatus.mutateAsync
      : null;

  /**
   * Remove exactly ONE entry that was just acknowledged, by re-reading storage.
   *
   * Never writes a batch snapshot: a concurrent enqueue or a newer replacement
   * of the same orderId must survive. Identity is the full tuple, so an old ack
   * cannot delete a newer same-order row.
   */
  const retireAcknowledged = (acked: PendingKdsBump): void => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(PENDING_BUMPS_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(parsed)) return;
    const index = parsed.findIndex((candidate) => {
      if (!candidate || typeof candidate !== 'object') return false;
      const row = candidate as PendingKdsBump;
      return (
        row.orderId === acked.orderId &&
        row.targetStatus === acked.targetStatus &&
        row.queuedAt === acked.queuedAt &&
        row.expectedStatus === acked.expectedStatus &&
        row.scopeKey === acked.scopeKey
      );
    });
    if (index < 0) return;
    const next = [...parsed.slice(0, index), ...parsed.slice(index + 1)];
    try {
      window.localStorage.setItem(PENDING_BUMPS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — the row stays for a later attempt */
    }
  };

  useEffect(() => {
    if (!isOnline) return;
    if (drainingRef.current) {
      // A trigger (new scope / reconnect) arrived while an old flight still
      // awaits. Record it; the finalizer will start exactly ONE follow-up.
      // Ignored after unmount, so no retry is queued for a dead instance.
      if (mountedRef.current) rerunRequestedRef.current = true;
      return;
    }

    // Admission mirrors the one-shot seed effect: a signed-in operator AND
    // either a resolved branch scope or a genuinely global role. Without this,
    // an anonymous or no-access session whose key matches a forged persisted
    // row would drain it. Checked BEFORE any storage read/write.
    if (!scopeUserId) return;
    if (regional && (!regionalFeedVerified || scopeBranchIds.length === 0)) return;
    if (scopeBranchIds.length === 0 && !isGlobalRole(scopeRole ?? undefined)) return;

    // The operator this drain runs for. Anything else in the queue is foreign.
    const drainScope = authScopeKey;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(PENDING_BUMPS_KEY);
    } catch {
      raw = null;
    }
    const { fresh, stale } = readPendingKdsBumps(raw);
    if (stale.length > 0) {
      // Existing TTL policy: expired rows are dropped, loudly, once. Only the
      // expired rows are removed — every still-fresh row (owned, foreign or
      // legacy) is written back untouched.
      writePendingKdsBumps(fresh);
      toast.error(`${stale.length} offline bump(s) expired — discarded`, {
        description: `Queued bumps older than ${Math.round(KDS_BUMP_TTL_MS / 60000)} minutes are never replayed. Re-bump the order if it still needs to move.`,
      });
    }

    // Fail closed, never guess: only rows stamped with THIS scope are replayed.
    // Unscoped (legacy) and foreign rows are retained untouched.
    const eligible = fresh.filter((item) => item.scopeKey === drainScope);
    const unowned = fresh.filter((item) => item.scopeKey !== drainScope);

    // The unowned notice must fire whether or not anything is eligible — a
    // mixed queue (owned + legacy) still leaves an unreplayable row behind.
    // Once per drain scope via the ref, so re-renders cannot spam it.
    if (unowned.length > 0 && unownedNoticeRef.current !== drainScope) {
      unownedNoticeRef.current = drainScope;
      toast.error(`${unowned.length} queued bump(s) belong to another sign-in`, {
        description:
          'They are kept, not replayed, because this session cannot prove which operator queued them.',
      });
    }

    if (eligible.length === 0) return;

    drainingRef.current = true;
    let cancelled = false;
    (async () => {
      let acked = 0;
      for (const item of eligible) {
        // Re-check before EVERY I/O: a scope change or unmount mid-drain must
        // stop new requests (already-issued ones cannot be retracted).
        if (cancelled || latestAuthScopeKeyRef.current !== drainScope) break;
        if (!mutateAsyncFn) break;
        try {
          await mutateAsyncFn({
            orderId: item.orderId,
            status: item.targetStatus,
            ...(item.expectedStatus ? { expectedStatus: item.expectedStatus } : {}),
          });
          acked += 1;
          // The ack retires its OWN row even if the scope has since changed.
          retireAcknowledged(item);
        } catch {
          // Leave the row queued; no retry loop from here.
        }
      }
      // Feedback is gated on MOUNTED + SAME OWNER, not on `cancelled`. A flight
      // that already acknowledged rows must still report its count even when
      // its effect was superseded by an equivalent same-scope re-render; but
      // nothing is reported under another scope (N2b) or after unmount (N5).
      if (mountedRef.current && latestAuthScopeKeyRef.current === drainScope && acked > 0) {
        toast.success('Queued bumps applied', {
          description: `${acked} offline bump(s) synced.`,
        });
      }
    })().finally(() => {
      drainingRef.current = false;
      // The OLD effect's cleanup already set `cancelled`, so `!cancelled` here
      // was never satisfiable after a scope change — that is why OB5 stranded.
      // Correct predicate: run ONE follow-up when a trigger was deferred while
      // this flight awaited, or the current scope differs from the one drained.
      // Never on unmount (no setState/retry/toast after teardown).
      const scopeMoved = latestAuthScopeKeyRef.current !== drainScope;
      const wantsFollowUp = rerunRequestedRef.current || scopeMoved;
      if (!mountedRef.current || !wantsFollowUp) return;
      rerunRequestedRef.current = false;
      setDrainRetry((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [isOnline, mutateAsyncFn, authScopeKey, drainRetry, scopeUserId, scopeBranchIds, scopeRole, regional, regionalFeedVerified]);

  // Seed the makeline from the one-shot query only until the live stream
  // delivers its first snapshot (never clobber the stream afterward).
  //
  // Ownership rule: adoption requires the cache-derived descriptor to name the
  // CURRENT authorisation scope. The previous version compared a scope stamp
  // this hook had just written itself, which proved nothing about the rows — a
  // lagging A result was adopted under B.
  useEffect(() => {
    if (regional) return; // Never retain a regional last-good copy outside the authoritative feed.
    if (!scopeUserId) return;
    if (scopeBranchIds.length === 0 && !isGlobalRole(scopeRole ?? undefined)) return;
    if (streamHydratedRef.current) return;
    if (orders.length === 0) return;
    if (!oneShotOwnedByScope) return;
    setLiveOrders(orders);
    setLiveOrdersScope(authScopeKey);
  }, [
    orders,
    scopeUserId,
    scopeBranchIds,
    scopeRole,
    authScopeKey,
    oneShotOwnedByScope,
    regional,
  ]);

  // RENDER-TIME FENCE. An identity switch can render once before the effect
  // above runs, so the reset alone is too late: every derived value is gated on
  // the dataset/verification actually belonging to the CURRENT scope.
  const datasetOwnedByScope = liveOrdersScope === authScopeKey;
  const verifiedForScope = datasetOwnedByScope && verifiedScope === authScopeKey;
  const displayedOrders = regional
    ? regionalFeedVerified ? orders : []
    : datasetOwnedByScope ? liveOrders : [];

  // Filter KDS active orders for current branch. Fail-closed: an order
  // without a branchId is unroutable (normalizeOrderDoc already resolves
  // branchId via the store↔branch registry), so it must not render on
  // every branch's makeline.
  const activeOrders = displayedOrders.filter((o) => {
    if (orderPaymentChannel(o) === 'unpaid') return false;
    if (selectedBranchId && o.branchId !== selectedBranchId) {
      return false;
    }
    const status = o.status as string;
    return (
      status === 'pending' ||
      status === 'placed' ||
      status === 'preparing' ||
      status === 'accepted' ||
      status === 'ready' ||
      status === 'ready_for_pickup'
    );
  });

  const pendingOrders = activeOrders.filter(
    (o) => o.status === 'pending' || (o.status as string) === 'placed'
  );
  const preparingOrders = activeOrders.filter(
    (o) => o.status === 'preparing' || (o.status as string) === 'accepted'
  );
  const readyOrders = activeOrders.filter(
    (o) => o.status === 'ready' || (o.status as string) === 'ready_for_pickup'
  );

  useEffect(() => {
    resetKDSAlarmState();
    return () => resetKDSAlarmState();
  }, [authScopeKey]);

  // Audio chime alarm triggering on new pending orders
  useEffect(() => {
    // Arm the dedupe set only once the makeline has actually delivered data.
    // Priming on the very first render (query still in flight, stream not yet
    // hydrated) recorded an EMPTY set, so every pre-existing ticket then
    // counted as "new" and a plain page refresh chime-blasted — and started
    // the 10s repeating alarm in — a kitchen that had done nothing wrong.
    // `streamHydratedRef` flips on the first snapshot even when it is empty;
    // a settled one-shot query covers listener startup failures.
    if (!scopeUserId) return;
    const dataReady = regional ? regionalFeedVerified : streamHydratedRef.current || !isLoading;
    if (!dataReady) return;

    if (!initialLoadDoneRef.current) {
      // Prime the set of known orders on initial load so page refresh doesn't blast chime
      pendingOrders.forEach((o) => seenOrderIdsRef.current.add(o.id));
      initialLoadDoneRef.current = true;
      return;
    }

    // Check for genuinely new orders (the seen-set still tracks them)
    let hasNewOrder = false;
    const arrivedIds: string[] = [];
    pendingOrders.forEach((o) => {
      if (!seenOrderIdsRef.current.has(o.id)) {
        seenOrderIdsRef.current.add(o.id);
        arrivedIds.push(o.id);
        hasNewOrder = true;
      }
    });

    if (hasNewOrder) {
      // Arrival order for the banner: activeOrders is newest-first, so reverse
      // before trimming to keep the MOST RECENT ids when the cap applies.
      setNewOrderAlert({
        ids: capNewOrderIds([...arrivedIds].reverse()),
        total: arrivedIds.length,
      });
      // Tag with the scope that OBSERVED this arrival (this render's key), never
      // the live ref — stamping old data with a newer scope is exactly the
      // misattribution the fence exists to prevent.
      setNewOrderAlertScope(authScopeKey);
    }

    // Exactly one immediate cue for the arrival, without double-firing with
    // the repeating alarm or the acknowledge latch (candidate behaviour).
    playKDSArrivalCue(hasNewOrder, pendingOrders.length);

    // Sync repeating alarm for unacknowledged orders
    syncKDSAlarmState(pendingOrders.length);

    // Cap the chime dedupe set — bounded (no slow leak), and ACTIVE tickets
    // are never evicted (H3): the blind FIFO delete re-alarmed long-pending
    // orders once their id scrolled out of the first 100 entries.
    //
    // There must be exactly ONE eviction path. A second, blind eviction above
    // this call silently deleted still-pending ids before this pending-aware
    // helper could protect them; once the set passed its cap the next snapshot
    // treated an old ticket as new and re-chimed it (reproduced at the 56th
    // production-sized batch).
    pruneKdsSeenOrderIds(seenOrderIdsRef.current, pendingOrders.map((o) => o.id));
  }, [pendingOrders.length, activeOrders]);

  // Clean up timer on recall-stack expiration (60s) + 1s tick while any
  // recall is live: canRecall is computed during render, so without a
  // ticking clock the Recall button stayed visible past expiry until some
  // unrelated render happened.
  const [, setRecallTick] = useState(0);
  useEffect(() => {
    if (liveRecallStack.length === 0) return;

    const oldestExpiryMs =
      60000 - (Date.now() - liveRecallStack[0].timestamp);
    const timer = setTimeout(() => {
      setRecallStack((curr) => pruneRecallStack(curr));
    }, Math.max(0, oldestExpiryMs));
    const ticker = setInterval(() => setRecallTick((t) => t + 1), 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(ticker);
    };
    // Dep on state identity (stable between sets), NOT the derived pruned
    // array (new identity every render would churn the timers).
  }, [recallStack]);

  // In-flight bump guard (drives button disabled state on cards).
  const [bumpingIds, setBumpingIds] = useState<Record<string, boolean>>({});
  // Synchronous ref guard: setState commits async, so two rapid taps before
  // re-render both passed the bumpingIds check and double-bumped (each bump
  // now pushes its own recall entry, so both stay undoable).
  const bumpingRef = useRef<Set<string>>(new Set());

  // Offline bump outbox: a bump that fails for connectivity reasons is
  // queued in localStorage (shape-validated + TTL-filtered on read by
  // readPendingKdsBumps above) and replayed when the browser comes back
  // online — the operator no longer has to remember to re-bump after an
  // airplane-mode tap.

  // Bump Bar Action: recall history is recorded ONLY after the mutation
  // succeeds. The old code set it before awaiting — an offline bump looked
  // accepted (card gone + Recall offered) while Firestore never changed.
  const bumpOrder = useCallback(
    async (orderId: string, targetStatus: OrderStatus) => {
      // `authScopeKey` is this CALLBACK RENDER's scope. Reading the ref here
      // instead made the "before I/O" check a tautology: a handler captured in
      // scope A would stamp itself with the already-committed B and admit work.
      const callScope = authScopeKey;
      // Stale callback from a superseded scope: no lookup, no ref, no I/O, no
      // state. A no-op, leaving the current scope's state untouched.
      if (latestAuthScopeKeyRef.current !== callScope) return;
      const order = activeOrders.find((o) => o.id === orderId);
      if (!order) return;
      if (bumpingRef.current.has(orderId)) return;
      bumpingRef.current.add(orderId);
      setBumpingIds((prev) => ({ ...prev, [orderId]: true }));
      // Precondition: the status THIS card is showing. The client sends
      // expectedStatus as containment; transaction-side lost-update
      // enforcement is owned by the backend lane.
      const currentStatus = displayedOrders.find((o) => o.id === orderId)?.status;
      try {
        if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
          await updateOrderStatus.mutateAsync({
            orderId,
            status: targetStatus,
            ...(currentStatus ? { expectedStatus: currentStatus } : {}),
          });
        }
        const targetOrder = displayedOrders.find((o) => o.id === orderId);
        // A late success from an abandoned scope must not publish a recall
        // entry into the newly mounted scope. The request itself was already
        // issued and cannot be un-sent; only this UI record is withheld.
        if (targetOrder && latestAuthScopeKeyRef.current === callScope) {
          const entry: RecalledOrderHistory = {
            order: { ...targetOrder },
            previousStatus: targetOrder.status,
            timestamp: Date.now(),
            scopeKey: callScope,
          };
          setRecallStack((curr) => [...pruneRecallStack(curr), entry].slice(-5));
        }
      } catch (err: any) {
        // Everything below is operator feedback/queueing for THIS scope only.
        if (latestAuthScopeKeyRef.current !== callScope) return;
        const offline =
          (typeof navigator !== 'undefined' && navigator.onLine === false) ||
          /offline|network|failed to fetch|firestore/i.test(err?.message || '');
        if (offline) {
          const { fresh } = readPendingKdsBumps(window.localStorage.getItem(PENDING_BUMPS_KEY));
          // Dedup only against a row THIS scope owns. A foreign or unscoped row
          // for the same order must never block this operator's legitimate
          // enqueue (and must not be overwritten either).
          const alreadyOwned = fresh.some(
            (q) => q.orderId === orderId && q.scopeKey === callScope,
          );
          if (!alreadyOwned) {
            fresh.push({
              orderId,
              targetStatus,
              queuedAt: Date.now(),
              ...(currentStatus ? { expectedStatus: currentStatus } : {}),
              // Producer scope, captured at tap time — never the live ref.
              scopeKey: callScope,
            });
            writePendingKdsBumps(fresh);
          }
          logger.warn('kds.bump_queued_offline', { orderId });
          toast.error('Offline — bump queued', {
            description: 'It will apply automatically when you are back online.',
          });
        } else if (isStaleOrderConflict(err)) {
          // F11: the order DID change — another terminal got there first. Do
          // not claim "unchanged"; reload so the card shows the winning state.
          logger.warn('kds.bump_conflict', { orderId, message: err?.message });
          toast.error('Another terminal already moved this order — refreshing', {
            description: 'Your tap was not applied. The board is loading the latest status.',
          });
          refresh();
        } else {
          logger.warn('kds.bump_failed', { orderId, message: err?.message });
          toast.error('Bump failed — order unchanged', {
            description: err?.message || 'Check connection and retry.',
          });
        }
      } finally {
        bumpingRef.current.delete(orderId);
        setBumpingIds((prev) => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      }
    },
    [activeOrders, displayedOrders, updateOrderStatus, refresh, authScopeKey]
  );

  // Recall the most recent bump within 60s (stack depth 5 — rapid
  // successive bumps each stay undoable). Guarded: empty/expired stack or
  // a failed write returns false (never an unhandled throw). A popped entry
  // is consumed — a second recall undoes the bump before it.
  const recallLastOrder = useCallback(async () => {
    // Scope of THIS callback render, not the live ref — see bumpOrder.
    const callScope = authScopeKey;
    // A stale handler must be a pure no-op: returning false must not clear the
    // current scope's recall stack (`setRecallStack([])` here wiped a fresh
    // entry the new operator had legitimately earned).
    if (latestAuthScopeKeyRef.current !== callScope) return false;
    const live = pruneRecallStack(recallStack).filter((e) => e.scopeKey === callScope);
    if (live.length === 0) {
      setRecallStack([]);
      return false;
    }
    const head = live[live.length - 1];

    try {
      const { order, previousStatus } = head;
      // Precondition: what the card shows right now (the status this recall
      // is undoing), not the pre-bump status stored on the stack entry.
      const currentStatus = displayedOrders.find((o) => o.id === order.id)?.status;
      if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
        await updateOrderStatus.mutateAsync({
          orderId: order.id,
          status: previousStatus,
          ...(currentStatus ? { expectedStatus: currentStatus } : {}),
        });
      }
      // A scope change while the request was in flight: drop the local pop so a
      // superseded scope's entry is not consumed from another operator's view.
      if (latestAuthScopeKeyRef.current !== callScope) return false;
      setRecallStack(live.slice(0, -1));
      return true;
    } catch (err: any) {
      logger.warn('kds.recall_failed', { message: err?.message });
      if (latestAuthScopeKeyRef.current !== callScope) return false;
      if (isStaleOrderConflict(err)) {
        toast.error('Another terminal already moved this order — refreshing', {
          description: 'Your recall was not applied. The board is loading the latest status.',
        });
        refresh();
      } else {
        toast.error('Recall failed — order unchanged', {
          description: err?.message || 'Check connection and retry.',
        });
      }
      return false;
    }
  }, [recallStack, updateOrderStatus, displayedOrders, refresh, authScopeKey]);

  const canRecall = liveRecallStack.length > 0;

  // Realtime, backend-driven makeline. The one-shot read in useOrders cannot
  // keep the KDS current, and 15s getDocs polling left a frozen green "Live"
  // dot whenever Firestore stalled. This branch-scoped, RBAC-clamped
  // onSnapshot replaces the poll; every snapshot is truth. lastRefreshAt
  // tracks the last successful stream delivery — never a manual tap
  // (refresh() resubscribes to force a fresh snapshot) and NEVER the
  // background HTTP poll: a successful useOrders refetch proves the REST
  // read worked, not that the displayed makeline moved, so stamping it here
  // is exactly the frozen-board lie this field exists to prevent.
  const [lastRefreshAt, setLastRefreshAt] = useState<number>(Date.now());

  useEffect(() => {
    // ANY authorisation change (uid, role, resolved branches, selection)
    // invalidates everything scoped: readiness, faults, retained pages, the
    // displayed dataset and its verification. A same-scope refresh must clear
    // none of these.
    if (pageScopeRef.current !== authScopeKey) {
      pageScopeRef.current = authScopeKey;
      globalPagesRef.current = new Map();
      setHasVerifiedLiveData(false);
      setVerifiedScope(null);
      setStreamHydrated(false);
      streamHydratedRef.current = false;
      setLiveError(null);
      // Clear scope-owned recall/arrival state on a real scope change so a
      // return to the previous scope cannot resurrect the old entry. (The render
      // fences above already withhold it on the first frame; this is the
      // retention half, not the security boundary.)
      setRecallStack([]);
      setNewOrderAlert(null);
      setNewOrderAlertScope(null);
      // Deliberately leave `liveOrders` AND `liveOrdersScope` alone. The owner
      // stamp still names the OLD scope, so the render fence withholds those
      // rows from the new identity instead of presenting them; new data (or a
      // provenance-verified one-shot adoption) re-stamps both. Publishing an
      // empty array here would instead emit an artificial empty frame that
      // resets the audio acknowledge latch.
    }

    // Regional useOrders already owns the registry, complete query chunks and
    // retirement fences. A second KDS subscription could expose another user's
    // cached global rows before rules reject it, then retain them on denial.
    if (regional) return;

    // Both early exits below still publish an honest, non-live state. They used
    // to return BEFORE the resets, so leaving a healthy scope for a scoped user
    // with no branches kept reporting "live" and carried any old error across.
    if (!scopeUserId) {
      setLiveOrders([]);
      setLiveOrdersScope(authScopeKey);
      setStreamHydrated(false);
      streamHydratedRef.current = false;
      setHasVerifiedLiveData(false);
      setVerifiedScope(null);
      setLiveError(null);
      return;
    }

    // Scoped roles with no assigned branches must never read the global
    // collection (mirrors useOrders' fail-closed read guard).
    if (scopeBranchIds.length === 0 && !isGlobalRole(scopeRole ?? undefined)) {
      setLiveOrders([]);
      setLiveOrdersScope(authScopeKey);
      setStreamHydrated(false);
      streamHydratedRef.current = false;
      setHasVerifiedLiveData(false);
      setVerifiedScope(null);
      setLiveError(null);
      return;
    }

    // Select the newest page before applying the cap. The scoped composite
    // is in the root index manifest; its deployment is an ops prerequisite.
    // Client sorting alone cannot rescue tickets omitted by an unordered cap.
    const constraints: QueryConstraint[] = [
      ...(scopeBranchIds.length
        ? [where('branchId', 'in', scopeBranchIds.slice(0, FIRESTORE_IN_LIMIT))]
        : []),
      orderBy('createdAt', 'desc'),
      limit(100),
    ];

    let alive = true;
    // H1 sweep fix: every merge into state checks in through the generation
    // gate — a slower earlier alias-fetch must never overwrite a newer
    // snapshot's makeline.
    const ingestionGate = createKdsIngestionGate();

    // A new listener generation starts with clean fault and readiness truth.
    // The previous generation's `liveError` is React state and outlives this
    // effect, so without this reset a manual retry stayed "Live Unavailable"
    // forever even after every new feed delivered. Last-good ORDER DATA is
    // deliberately untouched here: `liveOrders` keeps rendering, so a retry
    // never flashes an empty kitchen or erases verified history.
    setLiveError(null);

    // Readiness is per generation and per feed. A global role reads TWO feeds;
    // claiming "live" on one delivery would advertise a feed that has never
    // proven it can deliver. Scoped reads need only their single feed.
    const requiredFeeds: KdsFeedId[] =
      scopeBranchIds.length === 0 ? ['primary', 'delivery'] : ['primary'];
    const deliveredFeeds = new Set<KdsFeedId>();
    const publishReadiness = (): void => {
      if (!alive) return;
      setStreamHydrated(requiredFeeds.every((feed) => deliveredFeeds.has(feed)));
    };
    publishReadiness();

    // Per-feed failure state for THIS listener generation. A global role reads
    // two feeds and either one dying means no new tickets from that schema. A
    // single shared `liveError` was cleared by `ingest()` on any healthy
    // snapshot, so one healthy feed masked the other's death. Each feed clears
    // only its OWN entry, and only when it actually delivers again.
    const feedFailures = new Map<KdsFeedId, Error>();

    /**
     * Publish the current aggregate: any failing feed in this generation keeps
     * the makeline "unavailable". Called after every failure and every
     * successful delivery so a recovered feed can restore `live`.
     */
    const publishFeedHealth = (): void => {
      if (!alive) return;
      const firstFailure = feedFailures.values().next();
      setLiveError(firstFailure.done ? null : firstFailure.value);
    };

    const recordFeedFailure = (feed: KdsFeedId, err: unknown): void => {
      if (!alive) return;
      // Firestore error callbacks are TERMINAL: that listener is torn down and
      // will never deliver again. Any alias merge already in flight must be
      // invalidated, otherwise its late resolution calls ingest() and clears
      // this newer failure. Advancing the gate makes `isCurrent(token)` false
      // for every outstanding merge.
      ingestionGate.next();
      const kind = classifyKdsStreamFailure(err);
      const code = (err as { code?: string } | null)?.code;
      if (kind === 'missing_index') {
        logger.warn('kds.stream_index_missing', { message: (err as any)?.message, code });
        feedFailures.set(feed, KDS_STREAM_INDEX_ERROR);
        publishFeedHealth();
        return;
      }
      logger.warn('kds.stream_error', { message: (err as any)?.message, code });
      feedFailures.set(
        feed,
        err instanceof Error
          ? err
          : new Error(String((err as { message?: unknown } | null)?.message ?? 'Live order stream failed')),
      );
      publishFeedHealth();
    };

    /**
     * A delivery from `feed` proves only THAT listener recovered — but never
     * after IT has errored in this generation. A terminal error is cleared only
     * by a new generation (refresh()/scope change), so a straggling snapshot
     * from the dead generation cannot resurrect a live claim.
     */
    const clearFeedFailure = (feed: KdsFeedId): void => {
      if (feedFailures.has(feed)) return; // errored in this generation → terminal
      publishFeedHealth();
    };

    const ingest = (
      rawDocs: Array<{ id: string; data: Record<string, any> }>,
      from: KdsFeedId = 'primary',
    ): void => {
      if (!alive) return;
      // A feed that errored in this generation is terminal: a late snapshot or
      // merge from it must not publish data or advertise recovery.
      if (feedFailures.has(from)) return;
      streamHydratedRef.current = true;
      setHasVerifiedLiveData(true);
      setVerifiedScope(authScopeKey);
      // Any snapshot — including an EMPTY one — proves this feed delivers.
      // Readiness is only published once every REQUIRED feed has done so.
      deliveredFeeds.add(from);
      publishReadiness();
      // Latest-first is restored here, never in Firestore: ordering the
      // scoped `in` read server-side would demand a composite index, and
      // orderDocTimeMs compares Timestamps and ISO-string dates alike.
      const sorted = [...rawDocs].sort(
        (a, b) => orderDocTimeMs(b.data) - orderDocTimeMs(a.data)
      );
      setLiveOrders(sorted.map((d) => normalizeOrderDoc(d.id, d.data)));
      // Tag the dataset with the scope it belongs to; the render fence compares
      // this against the live scope.
      setLiveOrdersScope(authScopeKey);
      // Only THIS feed recovered; a still-dead sibling keeps the makeline
      // honestly unavailable.
      clearFeedFailure(from);
      setLastRefreshAt(Date.now());
    };

    // Retained ACROSS same-scope refreshes (the ref outlives this effect), so a
    // new generation's first primary snapshot replaces only the primary page
    // and never deletes the Delivery tickets already on screen. A scope change
    // clears the ref above.
    const ingestGlobalPage = (field: string, page: Array<{ id: string; data: Record<string, any> }>) => {
      if (!alive) return;
      // The secondary date feed owns only documents missing createdAt; it
      // must never overwrite the primary feed with a delayed older snapshot.
      globalPagesRef.current.set(
        field,
        field === 'placedAt' ? page.filter((doc) => doc.data.createdAt === undefined) : page,
      );
      const merged = new Map(
        [...globalPagesRef.current.values()].flat().map((doc) => [doc.id, doc]),
      );
      // Attribute the delivery to the feed that produced it, so only that
      // feed's own failure is cleared.
      ingest([...merged.values()], field === 'placedAt' ? 'delivery' : 'primary');
    };
    const handleStreamError = (feed: KdsFeedId) => (err: any) => {
      // Preserve last-good data on an index deployment gap; a cold query
      // failure remains visible through useOrders' error state.
      recordFeedFailure(feed, err);
      // lastRefreshAt tracks successful deliveries, never failed reads.
    };

    const unsubscribe = onSnapshot(
      query(collection(db, 'orders'), ...constraints),
      (snap) => {
        const direct = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, any> }));

        // Branch-scoped reads can't see Delivery docs (they store store.id,
        // not branchId) — merge the aliased store orders like useOrders does.
        if (scopeBranchIds.length === 0) {
          ingestGlobalPage('createdAt', direct);
          return;
        }
        // Gate the async merge: snapshot #5 must not be overwritten by
        // snapshot #1's slower fetch resolving later.
        const mergeToken = ingestionGate.next();
        // Capture the scope this merge was started for. `alive` alone is not
        // enough, and comparing two captured locals is a tautology — the ref
        // holds the LATEST rendered scope, so a resolution that outlives an
        // identity switch is rejected.
        const mergeScope = authScopeKey;
        // The role captured for THIS listener generation. The alias read is
        // privileged (a store.id query has no branchId predicate to prove
        // ownership), so the helper refuses to send it for anyone but a brand
        // reader. `scopeRole` is the exact role this subscription was built
        // for; `isGlobalRole` is a selection test and is never used here.
        fetchAliasedStoreOrders(db, scopeBranchIds, { role: scopeRole })
          .then((aliased) => {
            if (!ingestionGate.isCurrent(mergeToken)) return;
            if (latestAuthScopeKeyRef.current !== mergeScope) return;
            const seen = new Set(direct.map((d) => d.id));
            const merged = [...direct];
            for (const doc of aliased) {
              if (!seen.has(doc.id)) {
                seen.add(doc.id);
                merged.push(doc);
              }
            }
            merged.sort((a, b) => orderDocTimeMs(b.data) - orderDocTimeMs(a.data));
            ingest(merged, 'primary');
          })
          .catch((err) => {
            logger.warn('kds.alias_stream_merge_failed', { message: err?.message });
            if (!ingestionGate.isCurrent(mergeToken)) return;
            if (latestAuthScopeKeyRef.current !== mergeScope) return;
            ingest(direct, 'primary');
          });
      },
      (err) => {
        // A failed listener must NEVER render as a live makeline, and a
        // missing composite index (`failed-precondition`) is a deployment gap
        // with the same operator consequence: no new tickets will ever arrive.
        // Both kinds therefore record a PRIMARY failure. A healthy `placedAt`
        // feed cannot clear it — only this listener delivering again can.
        recordFeedFailure('primary', err);
        // lastRefreshAt is deliberately NOT touched here: it tracks the last
        // SUCCESSFUL data delivery, so the age label stays honest about how
        // stale the on-screen (last good) data is.
      }
    );
    // The global feed cannot use branch aliases. Listen to the Delivery date
    // field too, otherwise orderBy(createdAt) hides that entire order schema.
    const unsubscribeDelivery = scopeBranchIds.length === 0 ? onSnapshot(
      query(collection(db, 'orders'), orderBy('placedAt', 'desc'), limit(100)),
      (snap) => ingestGlobalPage('placedAt', snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
      handleStreamError('delivery')
    ) : null;

    return () => {
      alive = false;
      unsubscribe();
      unsubscribeDelivery?.();
      // Resubscribing is keyed by the primitive authorisation key, not the raw
      // `user` object, so an equivalent fresh object cannot churn listeners;
      // listenerEpoch lets refresh() force one.
    };
  }, [authScopeKey, listenerEpoch, scopeBranchIds, scopeUserId, scopeRole, regional]);

  // Derived feed honesty for the header/columns: what the makeline may
  // claim about liveness, and whether the data on screen was ever verified
  // by the stream or by a successful one-shot read. Both are fenced on scope
  // ownership so a pre-effect render of a new identity cannot inherit either.
  const streamStatus = deriveKdsStreamStatus({
    streamHydrated: regional ? regionalFeedVerified : streamHydrated && datasetOwnedByScope,
    listenerFailed: regional ? !!ordersError : liveError !== null,
    oneShotLoading: isLoading,
    oneShotError: ordersError,
    // Verified orders still on screen mean a failed one-shot is a fallback
    // problem, not an unreadable makeline.
    hasVerifiedLiveData: regional ? regionalFeedVerified : verifiedForScope,
  });
  // Column state uses HISTORICAL verification plus a successful one-shot read.
  // Using per-generation `streamHydrated` here would flip a same-scope refresh
  // from "orders" to "error" even though the displayed dataset was verified.
  // The one-shot arm is gated on PROVENANCE too: a scope-mismatched fallback
  // must not verify a foreign dataset.
  const dataVerified = regional ? regionalFeedVerified : verifiedForScope || (!isLoading && !ordersError && oneShotOwnedByScope);

  return {
    isOnline,
    isLoading,
    streamError,
    streamStatus,
    dataVerified,
    activeOrders,
    pendingOrders,
    preparingOrders,
    readyOrders,
    bumpOrder,
    bumpingIds,
    recallLastOrder,
    canRecall,
    lastBumpedOrder: recallHistory?.order || null,
    newOrderIds: scopedNewOrderAlert?.ids ?? [],
    newOrderTotal: scopedNewOrderAlert?.total ?? 0,
    dismissNewOrderAlert,
    refresh,
    // The scoped feed stamps its last complete snapshot; before one exists the
    // mount time keeps the age label finite (columns still show unverified).
    lastRefreshAt: regional && dataUpdatedAt > 0 ? dataUpdatedAt : lastRefreshAt,
    /** Branch scope this stream reads (F6: render truncation honestly). */
    scopeBranchIds,
    /** Regional rows come from useOrders, which queries every ≤10-id chunk. */
    readsCompleteScope: regional,
  };
}

export default useKDSRealtimeStream;
