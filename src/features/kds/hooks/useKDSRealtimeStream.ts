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
    simulateOrder,
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

  // Recall state (active for 60 seconds)
  const [recallHistory, setRecallHistory] = useState<RecalledOrderHistory | null>(null);

  // Audio deduplication: store order IDs that have already chimed
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef<boolean>(false);

  // Online / offline listeners
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

  // Seed the makeline from the one-shot query only until the live stream
  // delivers its first snapshot (never clobber the stream afterward).
  useEffect(() => {
    if (!streamHydratedRef.current && orders.length > 0) {
      setLiveOrders(orders);
    }
  }, [orders]);

  // Filter KDS active orders for current branch
  const activeOrders = liveOrders.filter((o) => {
    if (selectedBranchId && o.branchId && o.branchId !== selectedBranchId) {
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

    // Sync repeating alarm for unacknowledged orders
    syncKDSAlarmState(pendingOrders.length);
  }, [pendingOrders.length, activeOrders]);

  // Clean up timer on recallHistory expiration (60s)
  useEffect(() => {
    if (!recallHistory) return;

    const timer = setTimeout(() => {
      setRecallHistory((curr) => {
        if (curr && Date.now() - curr.timestamp >= 60000) {
          return null;
        }
        return curr;
      });
    }, 60000);

    return () => clearTimeout(timer);
  }, [recallHistory]);

  // In-flight bump guard (drives button disabled state on cards).
  const [bumpingIds, setBumpingIds] = useState<Record<string, boolean>>({});

  // Bump Bar Action: recall history is recorded ONLY after the mutation
  // succeeds. The old code set it before awaiting — an offline bump looked
  // accepted (card gone + Recall offered) while Firestore never changed.
  const bumpOrder = useCallback(
    async (orderId: string, targetStatus: OrderStatus) => {
      if (bumpingIds[orderId]) return;
      setBumpingIds((prev) => ({ ...prev, [orderId]: true }));
      try {
        if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
          await updateOrderStatus.mutateAsync({ orderId, status: targetStatus });
        }
        const targetOrder = liveOrders.find((o) => o.id === orderId);
        if (targetOrder) {
          setRecallHistory({
            order: { ...targetOrder },
            previousStatus: targetOrder.status,
            timestamp: Date.now(),
          });
        }
      } catch (err: any) {
        logger.warn('kds.bump_failed', { orderId, message: err?.message });
        toast.error('Bump failed — order unchanged', {
          description: err?.message || 'Check connection and retry.',
        });
      } finally {
        setBumpingIds((prev) => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      }
    },
    [liveOrders, updateOrderStatus, bumpingIds]
  );

  // Recall Last Bumped Order within 60s. Guarded: no history, expired
  // history, or a failed write all return false (never an unhandled throw).
  const recallLastOrder = useCallback(async () => {
    if (!recallHistory) return false;

    if (Date.now() - recallHistory.timestamp > 60000) {
      setRecallHistory(null);
      return false;
    }

    try {
      const { order, previousStatus } = recallHistory;
      if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
        await updateOrderStatus.mutateAsync({ orderId: order.id, status: previousStatus });
      }
      setRecallHistory(null);
      return true;
    } catch (err: any) {
      logger.warn('kds.recall_failed', { message: err?.message });
      toast.error('Recall failed — order unchanged', {
        description: err?.message || 'Check connection and retry.',
      });
      return false;
    }
  }, [recallHistory, updateOrderStatus]);

  const canRecall = !!recallHistory && Date.now() - recallHistory.timestamp < 60000;

  const handleSimulateOrder = useCallback(() => {
    if (simulateOrder && typeof simulateOrder.mutate === 'function') {
      simulateOrder.mutate();
    }
  }, [simulateOrder]);

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

    const constraints: QueryConstraint[] = [
      ...(scopeBranchIds.length
        ? [where('branchId', 'in', scopeBranchIds.slice(0, FIRESTORE_IN_LIMIT))]
        : []),
      orderBy('createdAt', 'desc'),
      limit(100),
    ];

    let alive = true;
    const ingest = (rawDocs: Array<{ id: string; data: Record<string, any> }>): void => {
      if (!alive) return;
      streamHydratedRef.current = true;
      setLiveOrders(rawDocs.map((d) => normalizeOrderDoc(d.id, d.data)));
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
        logger.warn('kds.stream_error', { message: err?.message });
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
    simulateOrder: handleSimulateOrder,
    refresh,
    lastRefreshAt,
  };
}

export default useKDSRealtimeStream;
