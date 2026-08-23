import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/config/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import type { Order, OrderStatus } from '@/types';

interface UseOrdersParams {
  status?: OrderStatus | 'all';
  dateRange?: 'today' | 'week' | 'month' | 'all';
}

export function useOrders(params: UseOrdersParams = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: orders, isLoading, error } = useQuery<Order[]>({
    queryKey: ['orders', user?.id, user?.role, params],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      let branchIds: string[] = [];

      if (user.role === 'brand_owner') {
        const branchesSnap = await getDocs(collection(db, 'branches'));
        branchIds = branchesSnap.docs.map((d) => d.id);
      } else if (user.role === 'regional_manager') {
        const branchesSnap = await getDocs(
          query(collection(db, 'branches'), where('city', 'in', user.cityIds))
        );
        branchIds = branchesSnap.docs.map((d) => d.id);
      } else {
        branchIds = user.branchIds;
      }

      const constraints: any[] = [
        where('branchId', 'in', branchIds),
        orderBy('createdAt', 'desc'),
      ];

      if (params.status && params.status !== 'all') {
        constraints.unshift(where('status', '==', params.status));
      }

      const ordersSnap = await getDocs(query(collection(db, 'orders'), ...constraints));

      return ordersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Order[];
    },
    enabled: !!user,
  });

  const updateOrderStatus = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        status,
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  return { orders, isLoading, error, updateOrderStatus };
}
