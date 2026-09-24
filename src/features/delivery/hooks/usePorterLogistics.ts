import { useState, useMemo, useCallback } from 'react';
import { useOrders } from '@/hooks/useOrders';
import { useBranches } from '@/hooks/useBranches';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { getPorterDeliveryQuote, manualBranchDispatch, type PorterDeliveryQuote } from '@/services/porterDelivery';
import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';
import { toast } from 'sonner';
import { logger } from '@/core/logging/logger';
import type { Order } from '@/types';

export interface InHouseRiderInfo {
  name: string;
  phone: string;
  vehicleNumber?: string;
}

export function usePorterLogistics() {
  const { selectedBranchId } = useAppStore();
  const { orders = [], isLoading, updateOrderStatus } = useOrders();
  const { branches = [] } = useBranches();
  const staffName = useAuthStore((s) => s.user?.name || s.user?.email) || 'Branch Staff';

  const [quotes, setQuotes] = useState<Record<string, PorterDeliveryQuote>>({});
  const [loadingQuotes, setLoadingQuotes] = useState<Record<string, boolean>>({});
  const [dispatchingOrderIds, setDispatchingOrderIds] = useState<Record<string, boolean>>({});
  const [rebookingOrderIds, setRebookingOrderIds] = useState<Record<string, boolean>>({});

  // Filter only active delivery orders for branch. Fail-closed like the
  // KDS makeline: unroutable orders (no branchId) never render anywhere.
  const activeDeliveryOrders = useMemo(() => {
    return orders.filter((o) => {
      if (selectedBranchId && o.branchId !== selectedBranchId) {
        return false;
      }
      const fulfillment = (o as any).fulfillment || o.orderType;
      if (fulfillment !== 'delivery') return false;

      const status = (o.status || '').toLowerCase();
      return (
        status === 'ready' ||
        status === 'preparing' ||
        status === 'out_for_delivery' ||
        status === 'pending' ||
        status === 'placed' ||
        status === 'accepted'
      );
    });
  }, [orders, selectedBranchId]);

  // Fetch Porter Quote for specific order. Pickup comes from the branch
  // record's real coordinates (never fabricated defaults); a missing pin on
  // either end throws inside getPorterDeliveryQuote and lands in the
  // "quote unavailable" path below.
  const fetchOrderQuote = useCallback(async (order: Order) => {
    const cached = quotes[order.id];
    const fresh = cached && cached.expiresAt && cached.expiresAt > Date.now();
    if (fresh || loadingQuotes[order.id]) return;

    setLoadingQuotes((prev) => ({ ...prev, [order.id]: true }));
    try {
      const branchId = (order as any).branchId || selectedBranchId;
      const branch = branches.find((b) => b.id === branchId);
      const q = await getPorterDeliveryQuote({
        pickupLat: branch?.coordinates?.lat,
        pickupLng: branch?.coordinates?.lng,
        dropLat: order.deliveryAddress?.lat,
        dropLng: order.deliveryAddress?.lng,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
      });
      setQuotes((prev) => ({ ...prev, [order.id]: q }));
    } catch (err: any) {
      // Redacted id (full ids link logs to customer PII) + message only.
      logger.warn(`[PorterLogistics] Quote unavailable for order …${order.id.slice(-6)}`, {
        message: err?.message,
      });
    } finally {
      setLoadingQuotes((prev) => ({ ...prev, [order.id]: false }));
    }
  }, [quotes, loadingQuotes, branches, selectedBranchId]);

  // Dispatch Porter 2-Wheeler
  // Loop 16/120: book the REAL courier FIRST via POST /porter/book. The old
  // flow flipped status to out_for_delivery and toasted "dispatched" with a
  // mere quote fare while booking nothing — a fake fulfillment signal. Status
  // flips only after the server confirms the booking; failures stay loud
  // with no status change. (Mock-mode servers return clearly-marked [TEST]
  // riders, so both modes stay honest.)
  const dispatchPorter = useCallback(async (order: Order) => {
    setDispatchingOrderIds((prev) => ({ ...prev, [order.id]: true }));
    try {
      const booking = await partnerFunctionsApi.bookPorterRider(order.id, staffName);

      if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
        await updateOrderStatus.mutateAsync({
          orderId: order.id,
          status: 'out_for_delivery',
        });
      }

      toast.success(`Porter courier booked: ${booking.riderName}`, {
        description: `Order #${order.id.slice(-6).toUpperCase()} · ${booking.porterOrderId}`,
      });
    } catch (err) {
      toast.error('Porter booking failed — no courier dispatched.', {
        description: err instanceof Error ? err.message : 'Could not reach the dispatcher.',
      });
    } finally {
      setDispatchingOrderIds((prev) => ({ ...prev, [order.id]: false }));
    }
  }, [quotes, updateOrderStatus, staffName]);

  // Assign In-House Rider. Persists rider identity server-side via
  // POST /orders/manualDispatch (riderName/Phone, dispatched status) instead
  // of a bare status flip that loses who is carrying the order. Guarded
  // against double-assignment over a live Porter booking.
  const assignInHouseRider = useCallback(async (orderId: string, rider: InHouseRiderInfo) => {
    const existing = orders.find((o) => o.id === orderId) as any;
    const deliveryStatus = existing?.deliveryStatus as string | undefined;
    if (
      existing?.riderName ||
      deliveryStatus === 'dispatched' ||
      deliveryStatus === 'driver_allocated' ||
      deliveryStatus === 'in_transit'
    ) {
      toast.error('A courier is already assigned — refresh before re-assigning.');
      return;
    }
    try {
      await manualBranchDispatch({
        orderId,
        riderName: rider.name,
        riderPhone: rider.phone,
        staffName,
      });
      if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
        await updateOrderStatus.mutateAsync({
          orderId,
          status: 'out_for_delivery',
        });
      }
      toast.success(`Assigned in-house rider ${rider.name} to order #${orderId.slice(-6).toUpperCase()}`);
    } catch (err) {
      logger.warn('dispatch.inhouse_failed', {
        orderId,
        message: err instanceof Error ? err.message : String(err),
      });
      toast.error('Failed to assign in-house rider');
    }
  }, [orders, updateOrderStatus, staffName]);

  // Cancel Porter Ride — server POST /porter/cancel releases the order
  // locally (rider_cancelled + needsRebook for the rebook flow) and asks
  // staff to confirm in the Porter dashboard (no provider cancel API is
  // documented). Status flips only after the server confirms.
  const cancelPorter = useCallback(async (orderId: string) => {
    try {
      await partnerFunctionsApi.cancelPorterRider(orderId);
      if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
        await updateOrderStatus.mutateAsync({
          orderId,
          status: 'ready',
        });
      }
      toast.success(`Porter booking cancelled for order #${orderId.slice(-6).toUpperCase()}`);
    } catch (err) {
      toast.error('Failed to cancel Porter booking', {
        description: err instanceof Error ? err.message : 'Could not reach the dispatcher.',
      });
    }
  }, [updateOrderStatus]);

  // Rebook Porter Ride (delivery_porter.md §4) — 1-Click Rebook from the
  // no-driver alert card. POST /porter/rebook requests a NEW rider for an
  // order whose previous driver cancelled or was never found. The order must
  // be in a rebookable server state (needsRebook true / rider_cancelled), so
  // stale taps surface the server's NOT_REBOOKABLE refusal instead of faking
  // a booking. Status flips only after the server confirms the new booking.
  const rebookPorter = useCallback(async (order: Order) => {
    setRebookingOrderIds((prev) => ({ ...prev, [order.id]: true }));
    try {
      const booking = await partnerFunctionsApi.rebookPorterRider(order.id, staffName);

      if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
        await updateOrderStatus.mutateAsync({
          orderId: order.id,
          status: 'out_for_delivery',
        });
      }

      toast.success(`New Porter courier booked: ${booking.riderName}`, {
        description: `Order #${order.id.slice(-6).toUpperCase()} · ${booking.porterOrderId}`,
      });
    } catch (err) {
      toast.error('Porter rebook failed — no new courier dispatched.', {
        description: err instanceof Error ? err.message : 'Could not reach the dispatcher.',
      });
    } finally {
      setRebookingOrderIds((prev) => ({ ...prev, [order.id]: false }));
    }
  }, [updateOrderStatus, staffName]);

  return {
    deliveryOrders: activeDeliveryOrders,
    isLoading,
    quotes,
    loadingQuotes,
    dispatchingOrderIds,
    rebookingOrderIds,
    fetchOrderQuote,
    dispatchPorter,
    assignInHouseRider,
    cancelPorter,
    rebookPorter,
  };
}

export default usePorterLogistics;
