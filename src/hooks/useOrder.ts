import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/config/firebase';
import { doc, getDoc, onSnapshot, updateDoc, Timestamp } from 'firebase/firestore';
import type { Order, OrderStatus } from '@/types';
import { normalizeOrderDoc, toDeliveryStatusMeta } from '@/utils/orderContract';
import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';
import { logger } from '@/core/logging/logger';
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
        // A dead listener looks exactly like an idle order — surface it.
        logger.warn('useOrder listener stalled', { orderId, message: (err as any)?.message });
        toast.error('Live order updates stalled — reopen the order', {
          description: (err as any)?.message,
        });
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
      // Server-side bump (POST /orders/bumpStatus): branch-checked write.
      await partnerFunctionsApi.bumpOrderStatus({
        orderId,
        status,
        ...(cancellationReason ? { cancellationReason } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: notifyMutationError('Status update'),
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
    pushToPetpooja,
    autoDispatchPorter,
  };
}
