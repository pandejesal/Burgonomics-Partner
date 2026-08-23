import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
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

  return useQuery<DashboardStats>({
    queryKey: ['dashboard', user?.id, user?.role],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      let branchIds: string[] = [];

      // Get branches based on role
      if (user.role === 'brand_owner') {
        const branchesSnap = await getDocs(collection(db, 'branches'));
        branchIds = branchesSnap.docs.map((d) => d.id);
      } else if (user.role === 'regional_manager') {
        const branchesSnap = await getDocs(
          query(
            collection(db, 'branches'),
            where('city', 'in', user.cityIds)
          )
        );
        branchIds = branchesSnap.docs.map((d) => d.id);
      } else {
        branchIds = user.branchIds;
      }

      // Get today's date range
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get orders
      const ordersSnap = await getDocs(
        query(
          collection(db, 'orders'),
          where('branchId', 'in', branchIds)
        )
      );

      const orders = ordersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      // Get customers
      const customersSnap = await getDocs(collection(db, 'customers'));
      const customers = customersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      // Get tickets
      const ticketsSnap = await getDocs(
        query(
          collection(db, 'tickets'),
          where('branchId', 'in', branchIds)
        )
      );

      const tickets = ticketsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      // Calculate stats
      const todayOrders = orders.filter(
        (o: any) => o.createdAt?.toDate() >= today
      );

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
          .sort((a: any, b: any) => b.createdAt?.toMillis() - a.createdAt?.toMillis())
          .slice(0, 5),
      };
    },
    enabled: !!user,
  });
}
