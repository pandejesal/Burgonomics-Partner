import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/config/firebase';
import { doc, getDoc, onSnapshot, updateDoc, Timestamp } from 'firebase/firestore';
import type { Order, OrderStatus } from '@/types';
import { normalizeOrderDoc, toDeliveryStatusMeta, toPartnerStatus } from '@/utils/orderContract';
import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';
import { toast } from 'sonner';

function notifyMutationError(action: string) {
  return (err: unknown) => {
    const message = err instanceof Error ? err.message : 'Order update failed with no details.';
    console.error(`[useOrder] ${action} failed:`, err);
    toast.error(`${action} failed`, { description: message });
  };
}

export function useOrder(orderId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orderId) return;
    const orderRef = doc(db, 'orders', orderId);
    const unsubscribe = onSnapshot(
      orderRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const liveOrder = normalizeOrderDoc(snapshot.id, snapshot.data() as Record<string, any>);
          queryClient.setQueryData(['order', orderId], liveOrder);
        }
      },
      (err) => {
        console.warn('useOrder onSnapshot listener error:', err);
      }
    );
    return () => unsubscribe();
  }, [orderId, queryClient]);

  const { data: order, isLoading, error } = useQuery<Order>({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        throw new Error('Order not found');
      }

      return normalizeOrderDoc(orderSnap.id, orderSnap.data() as Record<string, any>);
    },
    enabled: !!orderId,
  });


  const updateStatus = useMutation({
    mutationFn: async ({
      status,
      cancellationReason,
    }: {
      status: OrderStatus;
      cancellationReason?: string;
    }) => {
      const orderRef = doc(db, 'orders', orderId);
      const payload: Record<string, any> = {
        status: toDeliveryStatusMeta(status),
        updatedAt: Timestamp.now(),
      };
      if (cancellationReason) {
        payload.cancellationReason = cancellationReason;
      }
      await updateDoc(orderRef, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: notifyMutationError('Status update'),
  });

  const assignRider = useMutation({
    mutationFn: async (riderData: {
      riderName: string;
      riderPhone: string;
      riderVehicleNumber?: string;
      riderTrackingUrl?: string;
      markOutForDelivery?: boolean;
    }) => {
      const orderRef = doc(db, 'orders', orderId);
      const nextStatus = toPartnerStatus(
        riderData.markOutForDelivery ? 'out_for_delivery' : (order?.status || 'ready')
      );
      await updateDoc(orderRef, {
        riderName: riderData.riderName,
        riderPhone: riderData.riderPhone,
        riderVehicleNumber: riderData.riderVehicleNumber || 'GJ-01-BK-4092',
        riderTrackingUrl: riderData.riderTrackingUrl || `https://porter.in/track/ord_${orderId.slice(-6)}`,
        deliveryStatus: 'manually_assigned',
        status: toDeliveryStatusMeta(nextStatus),
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: notifyMutationError('Rider assignment'),
  });

  const pushToPetpooja = useMutation({
    mutationFn: async () => {
      return await partnerFunctionsApi.pushOrderToPetpooja(orderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: notifyMutationError('Petpooja KOT push'),
  });

  const autoDispatchPorter = useMutation({
    mutationFn: async (staffName?: string) => {
      return await partnerFunctionsApi.bookPorterRider(orderId, staffName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: notifyMutationError('Porter dispatch'),
  });

  return {
    order,
    isLoading,
    error,
    updateStatus,
    assignRider,
    pushToPetpooja,
    autoDispatchPorter,
  };
}
