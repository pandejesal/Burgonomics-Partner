import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/config/firebase';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import type { Order, OrderStatus } from '@/types';

export function useOrder(orderId: string) {
  const queryClient = useQueryClient();

  const { data: order, isLoading, error } = useQuery<Order>({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        throw new Error('Order not found');
      }

      return {
        id: orderSnap.id,
        ...orderSnap.data(),
      } as Order;
    },
    enabled: !!orderId,
  });

  const updateStatus = useMutation({
    mutationFn: async (status: OrderStatus) => {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        status,
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  return { order, isLoading, error, updateStatus };
}
