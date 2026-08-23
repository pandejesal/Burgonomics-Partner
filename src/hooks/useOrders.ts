import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
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
  const { selectedBranchId } = useAppStore();
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading, error } = useQuery<Order[]>({
    queryKey: ['orders', user?.id, user?.role, selectedBranchId, params],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      let branchIds: string[] = [];

      if (selectedBranchId) {
        branchIds = [selectedBranchId];
      } else {
        if (user.role === 'brand_owner') {
          const branchesSnap = await getDocs(collection(db, 'branches'));
          branchIds = branchesSnap.docs.map((d) => d.id);
        } else if (user.role === 'regional_manager') {
          const branchesSnap = await getDocs(
            query(collection(db, 'branches'), where('city', 'in', user.cityIds || ['Ahmedabad', 'Surat']))
          );
          branchIds = branchesSnap.docs.map((d) => d.id);
        } else {
          branchIds = user.branchIds || [];
        }
      }

      if (branchIds.length === 0) {
        branchIds = ['default-branch'];
      }

      const constraints: any[] = [
        where('branchId', 'in', branchIds.slice(0, 10)),
        orderBy('createdAt', 'desc'),
      ];

      if (params.status && params.status !== 'all') {
        constraints.unshift(where('status', '==', params.status));
      }

      try {
        const ordersSnap = await getDocs(query(collection(db, 'orders'), ...constraints));

        return ordersSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Order[];
      } catch (err) {
        console.warn('Error fetching orders:', err);
        return [];
      }
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
