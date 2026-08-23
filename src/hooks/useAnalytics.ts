import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { startOfWeek, startOfMonth, subDays, format } from 'date-fns';

export interface DailyRevenue {
  date: string;
  revenue: number;
  orders: number;
}

export interface TopItem {
  name: string;
  quantity: number;
  revenue: number;
}

export interface BranchStats {
  branchId: string;
  branchName: string;
  orders: number;
  revenue: number;
}

export function useAnalytics(period: 'week' | 'month' | 'year' = 'month') {
  const { user } = useAuth();
  const { selectedBranchId } = useAppStore();

  return useQuery({
    queryKey: ['analytics', user?.id, user?.role, selectedBranchId, period],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      let branchIds: string[] = [];
      const branchNames: Record<string, string> = {};

      try {
        if (selectedBranchId) {
          branchIds = [selectedBranchId];
          const branchesSnap = await getDocs(collection(db, 'branches'));
          branchesSnap.docs.forEach((d) => {
            branchNames[d.id] = d.data().name || d.id;
          });
        } else if (user.role === 'brand_owner') {
          const branchesSnap = await getDocs(collection(db, 'branches'));
          branchesSnap.docs.forEach((d) => {
            branchIds.push(d.id);
            branchNames[d.id] = d.data().name || d.id;
          });
        } else if (user.role === 'regional_manager') {
          const cityIds = user.cityIds?.length ? user.cityIds : ['Ahmedabad', 'Surat'];
          const branchesSnap = await getDocs(
            query(collection(db, 'branches'), where('city', 'in', cityIds))
          );
          branchesSnap.docs.forEach((d) => {
            branchIds.push(d.id);
            branchNames[d.id] = d.data().name || d.id;
          });
        } else {
          const userBranches = user.branchIds?.length ? user.branchIds : [];
          branchIds.push(...userBranches);
          if (branchIds.length > 0) {
            const branchesSnap = await getDocs(
              query(collection(db, 'branches'), where('__name__', 'in', branchIds.slice(0, 10)))
            );
            branchesSnap.docs.forEach((d) => {
              branchNames[d.id] = d.data().name || d.id;
            });
          }
        }
      } catch (err) {
        console.warn('Error querying branches for analytics:', err);
      }

      // Fallback sample branch names if empty
      if (branchIds.length === 0) {
        branchIds.push('store-ahmedabad-prahladnagar', 'store-surat-adajan');
        branchNames['store-ahmedabad-prahladnagar'] = 'Prahlad Nagar (Ahmedabad)';
        branchNames['store-surat-adajan'] = 'Adajan (Surat)';
      }

      // Date range calculation
      const now = new Date();
      let startDate: Date;

      if (period === 'week') {
        startDate = startOfWeek(now, { weekStartsOn: 1 });
      } else if (period === 'month') {
        startDate = startOfMonth(now);
      } else {
        startDate = subDays(now, 365);
      }

      const startTimestamp = Timestamp.fromDate(startDate);

      let orders: any[] = [];
      try {
        const ordersSnap = await getDocs(
          query(
            collection(db, 'orders'),
            where('createdAt', '>=', startTimestamp),
            orderBy('createdAt', 'asc')
          )
        );

        orders = ordersSnap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }))
          .filter((o: any) => !branchIds.length || (o.branchId && branchIds.includes(o.branchId)));
      } catch (err) {
        console.warn('Error querying orders for analytics:', err);
      }

      // Calculate daily revenue
      const dailyRevenue: DailyRevenue[] = [];
      const ordersByDate: Record<string, any[]> = {};

      orders.forEach((order: any) => {
        const orderDate = order.createdAt?.toDate
          ? order.createdAt.toDate()
          : order.createdAt instanceof Date
          ? order.createdAt
          : new Date();
        const dateStr = format(orderDate, 'yyyy-MM-dd');
        if (!ordersByDate[dateStr]) ordersByDate[dateStr] = [];
        ordersByDate[dateStr].push(order);
      });

      Object.entries(ordersByDate).forEach(([date, dayOrders]) => {
        dailyRevenue.push({
          date,
          revenue: dayOrders.reduce(
            (sum: number, o: any) => sum + (o.total || 0),
            0
          ),
          orders: dayOrders.length,
        });
      });

      // Calculate top items
      const itemStats: Record<string, { name: string; quantity: number; revenue: number }> = {};
      orders.forEach((order: any) => {
        order.items?.forEach((item: any) => {
          const key = item.itemId || item.name || 'item';
          if (!itemStats[key]) {
            itemStats[key] = {
              name: item.name || 'Special Burger',
              quantity: 0,
              revenue: 0,
            };
          }
          itemStats[key].quantity += item.quantity || 1;
          itemStats[key].revenue += (item.quantity || 1) * (item.price || 0);
        });
      });

      const topItems = Object.values(itemStats)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      // Calculate branch stats
      const branchStats: BranchStats[] = branchIds.map((branchId) => {
        const branchOrders = orders.filter((o: any) => o.branchId === branchId);
        return {
          branchId,
          branchName: branchNames[branchId] || branchId,
          orders: branchOrders.length,
          revenue: branchOrders.reduce(
            (sum: number, o: any) => sum + (o.total || 0),
            0
          ),
        };
      });

      // Summary totals
      const totalRevenue = orders.reduce(
        (sum: number, o: any) => sum + (o.total || 0),
        0
      );
      const totalOrders = orders.length;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      return {
        dailyRevenue,
        topItems,
        branchStats,
        totalRevenue,
        totalOrders,
        averageOrderValue,
      };
    },
    enabled: !!user,
  });
}
