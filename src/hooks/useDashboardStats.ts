import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';

interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  openTickets: number;
  ordersToday: number;
  revenueToday: number;
  recentOrders: any[];
}

export function useDashboardStats() {
  const { user } = useAuth();
  const { selectedBranchId } = useAppStore();

  return useQuery<DashboardStats>({
    queryKey: ['dashboard', user?.id, user?.role, selectedBranchId],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      let branchIds: string[] = [];

      if (selectedBranchId) {
        branchIds = [selectedBranchId];
      } else {
        // Get branches based on role
        if (user.role === 'brand_owner') {
          const branchesSnap = await getDocs(collection(db, 'branches'));
          branchIds = branchesSnap.docs.map((d) => d.id);
        } else if (user.role === 'regional_manager') {
          const branchesSnap = await getDocs(
            query(
              collection(db, 'branches'),
              where('city', 'in', user.cityIds || ['Ahmedabad', 'Surat'])
            )
          );
          branchIds = branchesSnap.docs.map((d) => d.id);
        } else {
          branchIds = user.branchIds || [];
        }
      }

      // Safe fallback if branchIds is empty
      if (branchIds.length === 0) {
        branchIds = ['default-branch'];
      }

      // Get today's date range
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let orders: any[] = [];
      try {
        const ordersSnap = await getDocs(
          query(
            collection(db, 'orders'),
            where('branchId', 'in', branchIds.slice(0, 10))
          )
        );

        orders = ordersSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
      } catch (err) {
        console.warn('Error fetching orders for dashboard stats:', err);
      }

      // Get customers
      let customers: any[] = [];
      try {
        const customersSnap = await getDocs(collection(db, 'customers'));
        customers = customersSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
      } catch (err) {
        console.warn('Error fetching customers for dashboard:', err);
      }

      // Get tickets
      let tickets: any[] = [];
      try {
        const ticketsSnap = await getDocs(
          query(
            collection(db, 'tickets'),
            where('branchId', 'in', branchIds.slice(0, 10))
          )
        );

        tickets = ticketsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
      } catch (err) {
        console.warn('Error fetching tickets for dashboard:', err);
      }

      // Calculate stats
      const todayOrders = orders.filter((o: any) => {
        const orderDate = o.createdAt?.toDate
          ? o.createdAt.toDate()
          : o.createdAt instanceof Date
          ? o.createdAt
          : new Date();
        return orderDate >= today;
      });

      return {
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum: number, o: any) => sum + (o.total || 0), 0),
        totalCustomers: customers.length,
        openTickets: tickets.filter((t: any) => t.status === 'open').length,
        ordersToday: todayOrders.length,
        revenueToday: todayOrders.reduce(
          (sum: number, o: any) => sum + (o.total || 0),
          0
        ),
        recentOrders: orders
          .sort((a: any, b: any) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
          })
          .slice(0, 5),
      };
    },
    enabled: !!user,
  });
}
