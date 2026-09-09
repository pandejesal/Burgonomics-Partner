import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logger } from '@/core/logging/logger';
import { useOrders } from '@/hooks/useOrders';
import { useAppStore } from '@/stores/appStore';
import { playKDSChime, syncKDSAlarmState } from '@/utils/kdsAudio';
import type { Order, OrderStatus } from '@/types';

export interface RecalledOrderHistory {
  order: Order;
  previousStatus: OrderStatus;
  timestamp: number;
}

export function useKDSRealtimeStream() {
  const { selectedBranchId } = useAppStore();
  const {
    orders = [],
    isLoading,
    error: streamError,
    updateOrderStatus,
    simulateOrder,
  } = useOrders();

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

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

  // Filter KDS active orders for current branch
  const activeOrders = orders.filter((o) => {
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
        const targetOrder = orders.find((o) => o.id === orderId);
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
    [orders, updateOrderStatus, bumpingIds]
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

  // Poll-based freshness: the order stream is one-shot getDocs (no realtime
  // listener), so a Firestore stall with the browser online used to freeze
  // the makeline on a green "Live" dot. Revalidate every 15s while visible +
  // online. lastRefreshAt tracks the last SUCCESSFUL fetch (data age), never
  // the last manual-refresh tap — refresh() only invalidates, the effect
  // below stamps the time once loading settles without error.
  const queryClient = useQueryClient();
  const [lastRefreshAt, setLastRefreshAt] = useState<number>(Date.now());
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  }, [queryClient]);

  useEffect(() => {
    if (!isLoading && !streamError) setLastRefreshAt(Date.now());
  }, [isLoading, streamError, orders]);

  useEffect(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    const timer = window.setInterval(() => {
      if (navigator.onLine) refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

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
