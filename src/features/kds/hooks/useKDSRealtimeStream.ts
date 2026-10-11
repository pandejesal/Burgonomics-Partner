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
} from '@/utils/orderContract';
import { FIRESTORE_IN_LIMIT, isGlobalRole, resolveScopedBranchIds } from '@/utils/branchScope';
import { playKDSChime, syncKDSAlarmState } from '@/utils/kdsAudio';
import type { Order, OrderStatus } from '@/types';

export interface RecalledOrderHistory {
  order: Order;
  previousStatus: OrderStatus;
  timestamp: number;
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
    const queue = readPendingBumps();
    if (queue.length === 0) return;
    let cancelled = false;
    (async () => {
      const remaining: typeof queue = [];
      for (const item of queue) {
        if (cancelled) {
          remaining.push(item);
          continue;
        }
        try {
          if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
            await updateOrderStatus.mutateAsync({ orderId: item.orderId, status: item.targetStatus });
          }
        } catch {
          remaining.push(item);
        }
      }
      if (!cancelled) {
        writePendingBumps(remaining);
        if (remaining.length < queue.length) {
          toast.success('Queued bumps applied', {
            description: `${queue.length - remaining.length} offline bump(s) synced.`,
          });
        }
      }
    })();
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

    // Check for genuinely new orders
    let hasNewOrder = false;
    pendingOrders.forEach((o) => {
      if (!seenOrderIdsRef.current.has(o.id)) {
        seenOrderIdsRef.current.add(o.id);
        hasNewOrder = true;
      }
    });

    if (hasNewOrder) {
      playKDSChime();
    }

    // Cap the chime dedupe set: a 12h rush on a busy makeline adds thousands
    // of ids and never releases them (Set is insertion-ordered, so the
    // oldest are the no-longer-pending ones). Bounded = no slow leak, and
    // the current pending set always stays fully covered.
    if (seenOrderIdsRef.current.size > 500) {
      const it = seenOrderIdsRef.current.values();
      for (let i = 0; i < 100; i++) {
        const next = it.next();
        if (next.done) break;
        seenOrderIdsRef.current.delete(next.value);
      }
    }

    // Sync repeating alarm for unacknowledged orders
    syncKDSAlarmState(pendingOrders.length);
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
  // queued in localStorage (shape-validated on read) and replayed when the
  // browser comes back online — the operator no longer has to remember to
  // re-bump after an airplane-mode tap.
  const PENDING_BUMPS_KEY = 'kds-pending-bumps:v1';
  const readPendingBumps = (): Array<{ orderId: string; targetStatus: OrderStatus }> => {
    try {
      const raw = window.localStorage.getItem(PENDING_BUMPS_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        window.localStorage.removeItem(PENDING_BUMPS_KEY);
        return [];
      }
      return parsed.filter(
        (e): e is { orderId: string; targetStatus: OrderStatus } =>
          !!e && typeof e === 'object' && typeof (e as any).orderId === 'string'
      );
    } catch {
      try {
        window.localStorage.removeItem(PENDING_BUMPS_KEY);
      } catch {
        /* storage unavailable */
      }
      return [];
    }
  };
  const writePendingBumps = (queue: Array<{ orderId: string; targetStatus: OrderStatus }>) => {
    try {
      window.localStorage.setItem(PENDING_BUMPS_KEY, JSON.stringify(queue));
    } catch {
      /* storage unavailable — ephemeral queue only */
    }
  };

  // Bump Bar Action: recall history is recorded ONLY after the mutation
  // succeeds. The old code set it before awaiting — an offline bump looked
  // accepted (card gone + Recall offered) while Firestore never changed.
  const bumpOrder = useCallback(
    async (orderId: string, targetStatus: OrderStatus) => {
      if (bumpingRef.current.has(orderId)) return;
      bumpingRef.current.add(orderId);
      setBumpingIds((prev) => ({ ...prev, [orderId]: true }));
      try {
        if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
          await updateOrderStatus.mutateAsync({ orderId, status: targetStatus });
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
          const queue = readPendingBumps();
          if (!queue.some((q) => q.orderId === orderId)) {
            queue.push({ orderId, targetStatus });
            writePendingBumps(queue);
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
      if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
        await updateOrderStatus.mutateAsync({ orderId: order.id, status: previousStatus });
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
  }, [recallStack, updateOrderStatus]);

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

    // `in` + `orderBy('createdAt')` on different fields is exactly what
    // forces a composite (compound) index — `FirebaseError: The query
    // requires an index` whenever it is not deployed, and a dead listener.
    // Scoped reads therefore pass only the `in` filter; the stream already
    // sorts client-side at merge time (orderDocTimeMs below). The global
    // branch-less read keeps the latest-first orderBy (single-field index).
    const constraints: QueryConstraint[] = [
      ...(scopeBranchIds.length
        ? [where('branchId', 'in', scopeBranchIds.slice(0, FIRESTORE_IN_LIMIT))]
        : [orderBy('createdAt', 'desc')]),
      limit(100),
    ];

    let alive = true;
    const ingest = (rawDocs: Array<{ id: string; data: Record<string, any> }>): void => {
      if (!alive) return;
      streamHydratedRef.current = true;
      // Latest-first is restored here, never in Firestore: ordering the
      // scoped `in` read server-side would demand a composite index, and
      // orderDocTimeMs compares Timestamps and ISO-string dates alike.
      const sorted = [...rawDocs].sort(
        (a, b) => orderDocTimeMs(b.data) - orderDocTimeMs(a.data)
      );
      setLiveOrders(sorted.map((d) => normalizeOrderDoc(d.id, d.data)));
      setLiveError(null);
      setLastRefreshAt(Date.now());
    };

    const unsubscribe = onSnapshot(
      query(collection(db, 'orders'), ...constraints),
      (snap) => {
        const direct = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, any> }));

        // Branch-scoped reads can't see Delivery docs (they store store.id,
        // not branchId) — merge the aliased store orders like useOrders does.
        if (scopeBranchIds.length === 0) {
          ingest(direct);
          return;
        }
        fetchAliasedStoreOrders(db, scopeBranchIds)
          .then((aliased) => {
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
            ingest(direct);
          });
      },
      (err) => {
        // Missing composite index (`failed-precondition`, or a message that
        // names the index requirement) is a deployment gap, not a data
        // failure — warn and degrade gracefully instead of flipping the whole
        // makeline into an error state (the one-shot useOrders read and any
        // already-delivered snapshots stay usable).
        const code = (err as { code?: string } | null)?.code;
        const missingIndex =
          code === 'failed-precondition' ||
          /failed[- ]precondition|\bindex\b/i.test(err?.message || '');
        if (missingIndex) {
          logger.warn('kds.stream_index_missing', { message: err?.message, code });
          return;
        }
        logger.warn('kds.stream_error', { message: err?.message, code });
        if (!alive) return;
        setLiveError(err);
        setLastRefreshAt(Date.now());
      }
    );

    return () => {
      alive = false;
      unsubscribe();
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
