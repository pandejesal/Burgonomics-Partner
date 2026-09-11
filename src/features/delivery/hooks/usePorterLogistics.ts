import { useState, useMemo, useCallback } from 'react';
import { useOrders } from '@/hooks/useOrders';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { getPorterDeliveryQuote, type PorterDeliveryQuote } from '@/services/porterDelivery';
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
  const staffName = useAuthStore((s) => s.user?.name || s.user?.email) || 'Branch Staff';

  const [quotes, setQuotes] = useState<Record<string, PorterDeliveryQuote>>({});
  const [loadingQuotes, setLoadingQuotes] = useState<Record<string, boolean>>({});
  const [dispatchingOrderIds, setDispatchingOrderIds] = useState<Record<string, boolean>>({});

  // Filter only active delivery orders for branch
  const activeDeliveryOrders = useMemo(() => {
    return orders.filter((o) => {
      if (selectedBranchId && o.branchId && o.branchId !== selectedBranchId) {
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

  // Fetch Porter Quote for specific order
  const fetchOrderQuote = useCallback(async (order: Order) => {
    if (quotes[order.id] || loadingQuotes[order.id]) return;

    setLoadingQuotes((prev) => ({ ...prev, [order.id]: true }));
    try {
      const q = await getPorterDeliveryQuote({
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
  }, [quotes, loadingQuotes]);

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

  // Assign In-House Rider
  const assignInHouseRider = useCallback(async (orderId: string, rider: InHouseRiderInfo) => {
    try {
      if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
        await updateOrderStatus.mutateAsync({
          orderId,
          status: 'out_for_delivery',
        });
      }
      toast.success(`Assigned in-house rider ${rider.name} to order #${orderId.slice(-6).toUpperCase()}`);
    } catch (err) {
      toast.error('Failed to assign in-house rider');
    }
  }, [updateOrderStatus]);

  // Cancel Porter Ride
  const cancelPorter = useCallback(async (orderId: string) => {
    try {
      if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
        await updateOrderStatus.mutateAsync({
          orderId,
          status: 'ready',
        });
      }
      toast.info(`Porter dispatch cancelled for order #${orderId.slice(-6).toUpperCase()}. Reverted to Ready queue.`);
    } catch (err) {
      toast.error('Failed to cancel Porter dispatch');
    }
  }, [updateOrderStatus]);

  return {
    deliveryOrders: activeDeliveryOrders,
    isLoading,
    quotes,
    loadingQuotes,
    dispatchingOrderIds,
    fetchOrderQuote,
    dispatchPorter,
    assignInHouseRider,
    cancelPorter,
  };
}

export default usePorterLogistics;
