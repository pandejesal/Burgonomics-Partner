import { useState, useEffect, useRef, useCallback } from 'react';
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
import { playKDSArrivalCue, stopRepeatingKDSAlarm, syncKDSAlarmState } from '@/utils/kdsAudio';
import type { Order, OrderStatus } from '@/types';

export interface RecalledOrderHistory {
  order: Order;
  previousStatus: OrderStatus;
  timestamp: number;
}

/** One queued offline bump. `queuedAt`/`expectedStatus` were added in v2. */
export interface PendingKdsBump {
  orderId: string;
  targetStatus: OrderStatus;
  /** Epoch ms the operator tapped — replays past the TTL are dropped. */
  queuedAt?: number;
  /** Status the KDS card showed when queued — lost-update precondition. */
  expectedStatus?: OrderStatus;
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
 * index is a deployment gap, not a data failure: it degrades to the last good
 * snapshot / one-shot read instead of a hard error.
 */
export type KdsStreamFailureKind = 'missing_index' | 'listener_error';

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

export function useKDSRealtimeStream() {
  const { user } = useAuthStore();
  const { selectedBranchId } = useAppStore();
  const {
    orders = [],
    isLoading,
    error: ordersError,
    updateOrderStatus,
  } = useOrders();

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Live makeline source: seeded from the one-shot useOrders query and then
  // owned exclusively by the branch-scoped Firestore snapshot (below).
  const [liveOrders, setLiveOrders] = useState<Order[]>(orders);
  const [liveError, setLiveError] = useState<Error | null>(null);
  const [listenerEpoch, setListenerEpoch] = useState(0);
  const streamHydratedRef = useRef<boolean>(false);

  // Surface the live-stream error when present, else the one-shot query error.
  const streamError = liveError ?? ordersError ?? null;

  // Recall stack (each entry active for 60 seconds, max 5 deep): rapid
  // successive bumps used to overwrite a single recall slot, stranding the
  // earlier bump with no undo. Expired entries are pruned on read.
  const [recallStack, setRecallStack] = useState<RecalledOrderHistory[]>([]);

  const pruneRecallStack = (stack: RecalledOrderHistory[]): RecalledOrderHistory[] => {
    const now = Date.now();
    const fresh = stack.filter((e) => now - e.timestamp < 60000);
    return fresh.slice(-5);
  };

  const liveRecallStack = pruneRecallStack(recallStack);
  const recallHistory = liveRecallStack.length > 0 ? liveRecallStack[liveRecallStack.length - 1] : null;

  // Audio deduplication: store order IDs that have already chimed
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef<boolean>(false);

  // Online / offline listeners + outbox drain. Queued bumps replay in
  // order when connectivity returns; entries that still fail stay queued.
  // drainingRef makes the drain single-flight: its effect deps include a
  // react-query mutation OBJECT (a new identity on every render), so the
  // effect can re-run while a previous drain is still awaiting — without
  // this guard the same queued bump was replayed concurrently twice.
  const drainingRef = useRef<boolean>(false);

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

  useEffect(() => {
    if (!isOnline) return;
    if (drainingRef.current) return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(PENDING_BUMPS_KEY);
    } catch {
      raw = null;
    }
    const { fresh, stale } = readPendingKdsBumps(raw);
    if (stale.length > 0) {
      // Fail-loud: a stale replay silently re-bumping a delivered order is
      // worse than an operator re-tapping. Tell them what was discarded.
      writePendingKdsBumps(fresh);
      toast.error(`${stale.length} offline bump(s) expired — discarded`, {
        description: `Queued bumps older than ${Math.round(KDS_BUMP_TTL_MS / 60000)} minutes are never replayed. Re-bump the order if it still needs to move.`,
      });
    }
    if (fresh.length === 0) return;

    drainingRef.current = true;
    let cancelled = false;
    (async () => {
      const remaining: PendingKdsBump[] = [];
      for (const item of fresh) {
        if (cancelled) {
          remaining.push(item);
          continue;
        }
        try {
          if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
            await updateOrderStatus.mutateAsync({
              orderId: item.orderId,
              status: item.targetStatus,
              ...(item.expectedStatus ? { expectedStatus: item.expectedStatus } : {}),
            });
          }
        } catch {
          remaining.push(item);
        }
      }
      if (!cancelled) {
        writePendingKdsBumps(remaining);
        if (remaining.length < fresh.length) {
          toast.success('Queued bumps applied', {
            description: `${fresh.length - remaining.length} offline bump(s) synced.`,
          });
        }
      }
    })().finally(() => {
      drainingRef.current = false;
    });
    return () => {
      cancelled = true;
    };
  }, [isOnline, updateOrderStatus]);

  // Seed the makeline from the one-shot query only until the live stream
  // delivers its first snapshot (never clobber the stream afterward).
  useEffect(() => {
    if (!streamHydratedRef.current && orders.length > 0) {
      setLiveOrders(orders);
    }
  }, [orders]);

  // Filter KDS active orders for current branch. Fail-closed: an order
  // without a branchId is unroutable (normalizeOrderDoc already resolves
  // branchId via the store↔branch registry), so it must not render on
  // every branch's makeline.
  const activeOrders = liveOrders.filter((o) => {
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

  // Audio chime alarm triggering on new pending orders
  useEffect(() => {
    // Arm the dedupe set only once the makeline has actually delivered data.
    // Priming on the very first render (query still in flight, stream not yet
    // hydrated) recorded an EMPTY set, so every pre-existing ticket then
    // counted as "new" and a plain page refresh chime-blasted — and started
    // the 10s repeating alarm in — a kitchen that had done nothing wrong.
    // `streamHydratedRef` flips on the first snapshot even when it is empty;
    // a settled one-shot query covers listener startup failures.
    if (!user) return;
    const dataReady = streamHydratedRef.current || !isLoading;
    if (!dataReady) return;

    if (!initialLoadDoneRef.current) {
      // Prime the set of known orders on initial load so page refresh doesn't blast chime
      pendingOrders.forEach((o) => seenOrderIdsRef.current.add(o.id));
      initialLoadDoneRef.current = true;
      return;
    }

    // Check for genuinely new orders (the seen-set still tracks them)
    let hasNewOrder = false;
    pendingOrders.forEach((o) => {
      if (!seenOrderIdsRef.current.has(o.id)) {
        seenOrderIdsRef.current.add(o.id);
        hasNewOrder = true;
      }
    });

    // A ticket that arrives while the repeating loop is already sounding — or
    // while an acknowledge latch keeps it silent — has no immediate cue of its
    // own (syncKDSAlarmState plays nothing in either case), so play exactly
    // one here. When the alarm is about to chime on its own, playing both was
    // the H2 double-fire.
    playKDSArrivalCue(hasNewOrder, pendingOrders.length);
    syncKDSAlarmState(pendingOrders.length);

    // Cap the chime dedupe set — bounded (no slow leak), and ACTIVE tickets
    // are never evicted (H3): the blind FIFO delete re-alarmed long-pending
    // orders once their id scrolled out of the first 100 entries.
    pruneKdsSeenOrderIds(seenOrderIdsRef.current, pendingOrders.map((o) => o.id));
  }, [pendingOrders.length, activeOrders]);

  // Leaving /kds must silence the 10s repeating alarm. It is module-level
  // state, so without this unmount cleanup the loop kept chiming on every
  // other screen (and in the background) until the pending count hit 0.
  // pending-count-0 stop still happens inside syncKDSAlarmState above.
  useEffect(() => {
    return () => stopRepeatingKDSAlarm();
  }, []);

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
      if (bumpingRef.current.has(orderId)) return;
      bumpingRef.current.add(orderId);
      setBumpingIds((prev) => ({ ...prev, [orderId]: true }));
      // Precondition: the status THIS card is showing. The client sends
      // expectedStatus as containment; transaction-side lost-update
      // enforcement is owned by the backend lane.
      const currentStatus = liveOrders.find((o) => o.id === orderId)?.status;
      try {
        if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
          await updateOrderStatus.mutateAsync({
            orderId,
            status: targetStatus,
            ...(currentStatus ? { expectedStatus: currentStatus } : {}),
          });
        }
        const targetOrder = liveOrders.find((o) => o.id === orderId);
        if (targetOrder) {
          const entry: RecalledOrderHistory = {
            order: { ...targetOrder },
            previousStatus: targetOrder.status,
            timestamp: Date.now(),
          };
          setRecallStack((curr) => [...pruneRecallStack(curr), entry].slice(-5));
        }
      } catch (err: any) {
        const offline =
          (typeof navigator !== 'undefined' && !navigator.onLine) ||
          /offline|network|failed to fetch|firestore/i.test(err?.message || '');
        if (offline) {
          const { fresh } = readPendingKdsBumps(window.localStorage.getItem(PENDING_BUMPS_KEY));
          if (!fresh.some((q) => q.orderId === orderId)) {
            fresh.push({
              orderId,
              targetStatus,
              queuedAt: Date.now(),
              ...(currentStatus ? { expectedStatus: currentStatus } : {}),
            });
            writePendingKdsBumps(fresh);
          }
          logger.warn('kds.bump_queued_offline', { orderId });
          toast.error('Offline — bump queued', {
            description: 'It will apply automatically when you are back online.',
          });
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
    [liveOrders, updateOrderStatus]
  );

  // Recall the most recent bump within 60s (stack depth 5 — rapid
  // successive bumps each stay undoable). Guarded: empty/expired stack or
  // a failed write returns false (never an unhandled throw). A popped entry
  // is consumed — a second recall undoes the bump before it.
  const recallLastOrder = useCallback(async () => {
    const live = pruneRecallStack(recallStack);
    if (live.length === 0) {
      setRecallStack([]);
      return false;
    }
    const head = live[live.length - 1];

    try {
      const { order, previousStatus } = head;
      // Precondition: what the card shows right now (the status this recall
      // is undoing), not the pre-bump status stored on the stack entry.
      const currentStatus = liveOrders.find((o) => o.id === order.id)?.status;
      if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
        await updateOrderStatus.mutateAsync({
          orderId: order.id,
          status: previousStatus,
          ...(currentStatus ? { expectedStatus: currentStatus } : {}),
        });
      }
      setRecallStack(live.slice(0, -1));
      return true;
    } catch (err: any) {
      logger.warn('kds.recall_failed', { message: err?.message });
      toast.error('Recall failed — order unchanged', {
        description: err?.message || 'Check connection and retry.',
      });
      return false;
    }
  }, [recallStack, updateOrderStatus, liveOrders]);

  const canRecall = liveRecallStack.length > 0;

  // Realtime, backend-driven makeline. The one-shot read in useOrders cannot
  // keep the KDS current, and 15s getDocs polling left a frozen green "Live"
  // dot whenever Firestore stalled. This branch-scoped, RBAC-clamped
  // onSnapshot replaces the poll; every snapshot is truth. lastRefreshAt
  // tracks the last successful stream delivery — never a manual tap
  // (refresh() resubscribes to force a fresh snapshot).
  const queryClient = useQueryClient();
  const [lastRefreshAt, setLastRefreshAt] = useState<number>(Date.now());
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    setListenerEpoch((epoch) => epoch + 1);
  }, [queryClient]);

  useEffect(() => {
    if (!isLoading && !ordersError) setLastRefreshAt(Date.now());
  }, [isLoading, ordersError, orders]);

  useEffect(() => {
    if (!user) return;

    const scopeBranchIds = resolveScopedBranchIds(user, selectedBranchId);
    // Scoped roles with no assigned branches must never read the global
    // collection (mirrors useOrders' fail-closed read guard).
    if (scopeBranchIds.length === 0 && !isGlobalRole(user.role)) {
      setLiveOrders([]);
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
    const ingest = (rawDocs: Array<{ id: string; data: Record<string, any> }>): void => {
      if (!alive) return;
      streamHydratedRef.current = true;
      // Merge the fetched pages by normalized time. Legacy mixed value types
      // still need migration; this sort cannot recover documents excluded by
      // the server's type ordering, missing createdAt field, or page limit.
      const sorted = [...rawDocs].sort(
        (a, b) => orderDocTimeMs(b.data) - orderDocTimeMs(a.data)
      );
      setLiveOrders(sorted.map((d) => normalizeOrderDoc(d.id, d.data)));
      setLiveError(null);
      setLastRefreshAt(Date.now());
    };

    const globalPages = new Map<string, Array<{ id: string; data: Record<string, any> }>>();
    const ingestGlobalPage = (field: string, page: Array<{ id: string; data: Record<string, any> }>) => {
      if (!alive) return;
      // The secondary date feed owns only documents missing createdAt; it
      // must never overwrite the primary feed with a delayed older snapshot.
      globalPages.set(field, field === 'placedAt'
        ? page.filter((doc) => doc.data.createdAt === undefined)
        : page);
      const merged = new Map([...globalPages.values()].flat().map((doc) => [doc.id, doc]));
      ingest([...merged.values()]);
    };
    const handleStreamError = (err: any) => {
      // Preserve last-good data on an index deployment gap; a cold query
      // failure remains visible through useOrders' error state.
      if (!alive) return;
      const kind = classifyKdsStreamFailure(err);
      const code = (err as { code?: string } | null)?.code;
      if (kind === 'missing_index') {
        logger.warn('kds.stream_index_missing', { message: err?.message, code });
        return;
      }
      logger.warn('kds.stream_error', { message: err?.message, code });
      setLiveError(err instanceof Error ? err : new Error(String(err?.message ?? 'Live order stream failed')));
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
        fetchAliasedStoreOrders(db, scopeBranchIds)
          .then((aliased) => {
            if (!ingestionGate.isCurrent(mergeToken)) return;
            const seen = new Set(direct.map((d) => d.id));
            const merged = [...direct];
            for (const doc of aliased) {
              if (!seen.has(doc.id)) {
                seen.add(doc.id);
                merged.push(doc);
              }
            }
            merged.sort((a, b) => orderDocTimeMs(b.data) - orderDocTimeMs(a.data));
            ingest(merged);
          })
          .catch((err) => {
            logger.warn('kds.alias_stream_merge_failed', { message: err?.message });
            if (!ingestionGate.isCurrent(mergeToken)) return;
            ingest(direct);
          });
      },
      handleStreamError
    );
    // The global feed cannot use branch aliases. Listen to the Delivery date
    // field too, otherwise orderBy(createdAt) hides that entire order schema.
    const unsubscribeDelivery = scopeBranchIds.length === 0 ? onSnapshot(
      query(collection(db, 'orders'), orderBy('placedAt', 'desc'), limit(100)),
      (snap) => ingestGlobalPage('placedAt', snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
      handleStreamError
    ) : null;

    return () => {
      alive = false;
      unsubscribe();
      unsubscribeDelivery?.();
      // Resubscribing on user or branch change keeps the stream scoped to
      // the current RBAC decision; listenerEpoch lets refresh() force one.
    };
  }, [user, selectedBranchId, listenerEpoch]);

  return {
    isOnline,
    isLoading,
    streamError,
    activeOrders,
    pendingOrders,
    preparingOrders,
    readyOrders,
    bumpOrder,
    bumpingIds,
    recallLastOrder,
    canRecall,
    lastBumpedOrder: recallHistory?.order || null,
    refresh,
    lastRefreshAt,
  };
}

export default useKDSRealtimeStream;
