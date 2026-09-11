import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/config/firebase';
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { startOfWeek, startOfMonth, subDays, format } from 'date-fns';
import { fetchAliasedStoreOrders, normalizeOrderDoc } from '@/utils/orderContract';

export interface DailyRevenue {
  date: string;
  revenue: number;
  orders: number;
}

export interface TopItem {
  name: string;
  category: string;
  quantity: number;
  revenue: number;
  image?: string;
  isVeg: boolean;
}

export interface BranchStats {
  branchId: string;
  branchName: string;
  city: string;
  orders: number;
  revenue: number;
  brandRoyalty: number; // 5%
  netBranchPayout: number; // 95%
  averageOrderValue: number;
  linkedAccountId: string;
  linkedStatus: 'active' | 'pending' | 'verified';
  deliveryOrders: number;
  takeawayOrders: number;
  dineinOrders: number;
}

export interface HourlyRushData {
  hour: number;
  label: string;
  orders: number;
  revenue: number;
  avgPrepMinutes: number;
  isPeak: boolean;
}

export interface ChannelStat {
  channel: 'delivery' | 'takeaway' | 'dinein';
  label: string;
  orders: number;
  revenue: number;
  percentage: number;
  avgTicket: number;
}

export interface LogisticsSummary {
  deliveryFeesCollected: number;
  porterIncurredCost: number;
  netMargin: number;
  totalDeliveryTrips: number;
  avgDeliveryDistanceKm: number;
}

export interface AnalyticsResult {
  period: 'week' | 'month' | 'year';
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  brandRoyaltyEarned: number; // 5%
  netBranchPayoutTotal: number; // 95%
  dailyRevenue: DailyRevenue[];
  topItems: TopItem[];
  branchStats: BranchStats[];
  hourlyRush: HourlyRushData[];
  fulfillmentBreakdown: ChannelStat[];
  logistics: LogisticsSummary;
  /** Data sources that failed — numbers below may be partial. Never silent. */
  warnings: string[];
}

export function useAnalytics(period: 'week' | 'month' | 'year' = 'month') {
  const { user } = useAuthStore();
  const { selectedBranchId, selectedCity } = useAppStore();

  return useQuery<AnalyticsResult>({
    queryKey: ['analytics', user?.id, user?.role, selectedBranchId, selectedCity, period],
    queryFn: async (): Promise<AnalyticsResult> => {
      if (!user) throw new Error('Not authenticated');

      const warnings: string[] = [];
      let branchIds: string[] = [];
      const branchMeta: Record<string, { name: string; city: string; accountId: string }> = {
        branch_surat_01: {
          name: 'Surat Adajan Outlet',
          city: 'Surat',
          accountId: 'acc_Rzp_Surat_01',
        },
        branch_ahmedabad_01: {
          name: 'Ahmedabad SG Highway Flagship',
          city: 'Ahmedabad',
          accountId: 'acc_Rzp_Ahmd_01',
        },
      };

      try {
        if (selectedBranchId && selectedBranchId !== 'all') {
          branchIds = [selectedBranchId];
        } else if (['brand_owner', 'developer', 'support'].includes(user.role)) {
          const branchesSnap = await getDocs(
            query(collection(db, 'branches'), limit(100))
          );
          branchesSnap.docs.forEach((d) => {
            branchIds.push(d.id);
            const data = d.data();
            branchMeta[d.id] = {
              name: data.name || d.id,
              city: data.city || 'Gujarat',
              accountId: data.razorpayAccountId || `acc_Rzp_${d.id}`,
            };
          });
        } else if (user.role === 'regional_manager') {
          const cityIds = user.cityIds?.length ? user.cityIds : ['Ahmedabad', 'Surat'];
          const branchesSnap = await getDocs(
            query(collection(db, 'branches'), where('city', 'in', cityIds), limit(100))
          );
          branchesSnap.docs.forEach((d) => {
            branchIds.push(d.id);
            const data = d.data();
            branchMeta[d.id] = {
              name: data.name || d.id,
              city: data.city || 'Gujarat',
              accountId: data.razorpayAccountId || `acc_Rzp_${d.id}`,
            };
          });
        } else {
          // Loop 51/120: no hardcoded fallback outlet — unassigned staff see
          // unfiltered analytics, never another branch's numbers as their own.
          const userBranches = user.branchIds?.length ? user.branchIds : [];
          branchIds.push(...userBranches);
        }
      } catch (err) {
        console.warn('Error querying branches for analytics:', err);
        warnings.push('Branch list failed to load — figures cover all outlets.');
      }

      // Loop 51/120: no hardcoded fallback outlets — empty scope means
      // unfiltered (all branches), never two invented ones.
      if (branchIds.length === 0) {
        warnings.push('No branch scope resolved — figures cover all outlets.');
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
        // Loop 51/120: bounded — a year view must not pull unbounded history.
        const ORDER_CAP = 2000;
        const ordersQuery =
          branchIds.length > 0
            ? query(
                collection(db, 'orders'),
                where('branchId', 'in', branchIds.slice(0, 10)),
                where('createdAt', '>=', startTimestamp),
                orderBy('createdAt', 'asc'),
                limit(ORDER_CAP)
              )
            : query(
                collection(db, 'orders'),
                where('createdAt', '>=', startTimestamp),
                orderBy('createdAt', 'asc'),
                limit(ORDER_CAP)
              );

        const ordersSnap = await getDocs(ordersQuery);

        // Normalize: delivery-app docs share this collection with a nested shape.
        const rawDocs = ordersSnap.docs.map((d) => ({
          id: d.id,
          data: d.data() as Record<string, any>,
        }));
        // Linked Delivery stores (registry; no extra reads when unmapped).
        if (branchIds.length > 0) {
          try {
            const aliased = await fetchAliasedStoreOrders(db, branchIds);
            const seen = new Set(rawDocs.map((d) => d.id));
            for (const doc of aliased) {
              if (!seen.has(doc.id)) {
                seen.add(doc.id);
                rawDocs.push(doc);
              }
            }
          } catch (err) {
            console.warn('Alias store order fetch failed, using direct results:', err);
            warnings.push('Linked delivery stores could not be loaded.');
          }
        }
        orders = rawDocs
          .map((d) => normalizeOrderDoc(d.id, d.data))
          .filter((o: any) => !branchIds.length || (o.branchId && branchIds.includes(o.branchId)));
      } catch (err) {
        console.warn('Error querying orders for analytics:', err);
        warnings.push('Order data failed to load — figures below are incomplete.');
      }

      // Dev-only benchmark seed model (Runbook §8) — production with sparse
      // Firestore reports real (possibly zero) numbers, never invented revenue.
      const demo = import.meta.env.DEV;
      const daysCount = period === 'week' ? 7 : period === 'month' ? 30 : 12;
      const seedDailyRevenue: DailyRevenue[] = [];
      const baseDailyRevs = [
        38420, 42150, 41200, 46800, 58900, 68400, 64200, 39100, 43500, 45200, 51000, 63400,
        71200, 66800, 41200, 44800, 47900, 52600, 65900, 74500, 69800, 43100, 46200, 49800,
        54200, 67800, 76200, 72400, 45100, 48900,
      ];

      if (demo) {
        for (let i = daysCount - 1; i >= 0; i--) {
          const d = subDays(now, i);
          const dateStr = format(d, 'yyyy-MM-dd');
          const rev = baseDailyRevs[i % baseDailyRevs.length] + Math.floor(Math.random() * 2500);
          const ordCount = Math.floor(rev / 480);
          seedDailyRevenue.push({
            date: dateStr,
            revenue: rev,
            orders: ordCount,
          });
        }
      }

      const totalRevenue =
        orders.length > 0
          ? orders.reduce((sum, o) => sum + (o.total || 0), 0)
          : demo
            ? seedDailyRevenue.reduce((s, d) => s + d.revenue, 0)
            : 0;

      const totalOrders =
        orders.length > 0
          ? orders.length
          : demo
            ? seedDailyRevenue.reduce((s, d) => s + d.orders, 0)
            : 0;

      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // 5% Brand Royalty vs 95% Net Branch Payout
      const brandRoyaltyEarned = Math.round(totalRevenue * 0.05);
      const netBranchPayoutTotal = totalRevenue - brandRoyaltyEarned;

      // Loop 51/120: everything below aggregates the REAL fetched orders.
      // The old code scaled fixed percentages (58/56 splits, 60/25/15
      // channels, menu images) off totals — fabricated analytics rendered
      // as measured. Unknowns stay zero/empty, never invented.
      type NormOrder = {
        branchId?: string;
        branchName?: string;
        city?: string;
        orderType?: string;
        total?: number;
        deliveryFee?: number;
        createdAt?: any;
        items?: Array<{ name?: string; quantity?: number; price?: number }>;
      };
      const liveOrders = orders as unknown as NormOrder[];
      const orderDay = (o: NormOrder): string => {
        const c = o.createdAt;
        const d =
          c?.toDate?.() instanceof Date
            ? c.toDate()
            : c?.toMillis
              ? new Date(c.toMillis())
              : c
                ? new Date(c)
                : null;
        return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
      };
      const dayRange: string[] = [];
      {
        const days = period === "week" ? 7 : period === "month" ? 30 : 365;
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 86400000);
          dayRange.push(d.toISOString().slice(0, 10));
        }
      }
      const realDailyRevenue: DailyRevenue[] = dayRange.map((date) => {
        const dayOrders = liveOrders.filter((o) => orderDay(o) === date);
        return {
          date,
          revenue: dayOrders.reduce((s, o) => s + (Number(o.total) || 0), 0),
          orders: dayOrders.length,
        };
      });
      const itemAgg = new Map<string, { name: string; quantity: number; revenue: number }>();
      for (const o of liveOrders) {
        for (const it of o.items || []) {
          const name = String(it?.name || "Item");
          const q = Number(it?.quantity) || 0;
          const rev = q * (Number(it?.price) || 0);
          const cur = itemAgg.get(name) || { name, quantity: 0, revenue: 0 };
          cur.quantity += q;
          cur.revenue += rev;
          itemAgg.set(name, cur);
        }
      }
      const realTopItems: TopItem[] = [...itemAgg.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
        .map((t) => ({
          name: t.name,
          category: "Menu",
          quantity: t.quantity,
          revenue: Math.round(t.revenue),
          // Whole menu is pure veg; no image source exists for live items.
          isVeg: true,
        }));
      const branchAgg = new Map<
        string,
        { name: string; city: string; orders: number; revenue: number; delivery: number; takeaway: number; dinein: number }
      >();
      for (const o of liveOrders) {
        const bid = String(o.branchId || "unassigned");
        const cur = branchAgg.get(bid) || {
          name: String(o.branchName || branchMeta[bid]?.name || bid),
          city: String(o.city || branchMeta[bid]?.city || ""),
          orders: 0,
          revenue: 0,
          delivery: 0,
          takeaway: 0,
          dinein: 0,
        };
        cur.orders += 1;
        cur.revenue += Number(o.total) || 0;
        const ch = String(o.orderType || "delivery");
        if (ch === "takeaway") cur.takeaway += 1;
        else if (ch === "dinein") cur.dinein += 1;
        else cur.delivery += 1;
        branchAgg.set(bid, cur);
      }

      // Top Selling Items — real line-item aggregation (see realTopItems
      // above). The old list scaled fixed percentages off totals with stock
      // food photos for items never ordered.
      const topItems: TopItem[] = realTopItems;

      // Multi-Branch Stats & Royalty Ledger — real per-branch grouping. The
      // old code split totals 58/56 with fabricated account IDs + "verified"
      // statuses + fixed channel shares. Royalty stays a computed 5% policy
      // rate; linked accounts show the real Razorpay id or 'unlinked'.
      const branchStats: BranchStats[] = [...branchAgg.entries()].map(([bid, b]) => {
        const realAccount = branchMeta[bid]?.accountId;
        const hasRealAccount = !!realAccount && !realAccount.startsWith('acc_Rzp_');
        return {
          branchId: bid,
          branchName: b.name,
          city: b.city,
          orders: b.orders,
          revenue: Math.round(b.revenue),
          brandRoyalty: Math.round(b.revenue * 0.05),
          netBranchPayout: Math.round(b.revenue * 0.95),
          averageOrderValue: b.orders > 0 ? Math.round(b.revenue / b.orders) : 0,
          linkedAccountId: hasRealAccount ? realAccount : 'unlinked',
          linkedStatus: hasRealAccount ? 'verified' : 'pending',
          deliveryOrders: b.delivery,
          takeawayOrders: b.takeaway,
          dineinOrders: b.dinein,
        };
      });

      // 24-Hour Peak Ordering Rush Heatmap — real per-hour buckets from
      // order timestamps. avgPrepMinutes is unmeasured: 0, never 13.5/8.2.
      const hourAgg = new Map<number, { orders: number; revenue: number }>();
      for (const o of liveOrders) {
        const c = (o as any).createdAt;
        const d =
          c?.toDate?.() instanceof Date
            ? c.toDate()
            : c?.toMillis
              ? new Date(c.toMillis())
              : c
                ? new Date(c)
                : null;
        if (!d || isNaN(d.getTime())) continue;
        const h = d.getHours();
        const cur = hourAgg.get(h) || { orders: 0, revenue: 0 };
        cur.orders += 1;
        cur.revenue += Number((o as any).total) || 0;
        hourAgg.set(h, cur);
      }
      const hourlyRush: HourlyRushData[] = Array.from({ length: 24 }, (_, hour) => {
        const cur = hourAgg.get(hour) || { orders: 0, revenue: 0 };
        const isPeak = (hour >= 12 && hour <= 14) || (hour >= 19 && hour <= 22);
        const periodLabel = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;

        return {
          hour,
          label: periodLabel,
          orders: cur.orders,
          revenue: Math.round(cur.revenue),
          avgPrepMinutes: 0,
          isPeak,
        };
      });

      // 3-Way Fulfillment Breakdown — real channel counts off orderType.
      const chanAgg = { delivery: { orders: 0, revenue: 0 }, takeaway: { orders: 0, revenue: 0 }, dinein: { orders: 0, revenue: 0 } };
      for (const o of liveOrders) {
        const ch = String((o as any).orderType || "delivery");
        const slot = ch === "takeaway" ? chanAgg.takeaway : ch === "dinein" ? chanAgg.dinein : chanAgg.delivery;
        slot.orders += 1;
        slot.revenue += Number((o as any).total) || 0;
      }
      const pct = (n: number) => (totalOrders > 0 ? Math.round((n / totalOrders) * 100) : 0);
      const ticket = (rev: number, n: number) => (n > 0 ? Math.round(rev / n) : 0);
      const fulfillmentBreakdown: ChannelStat[] = [
        {
          channel: 'delivery',
          label: '🛵 Delivery',
          orders: chanAgg.delivery.orders,
          revenue: Math.round(chanAgg.delivery.revenue),
          percentage: pct(chanAgg.delivery.orders),
          avgTicket: ticket(chanAgg.delivery.revenue, chanAgg.delivery.orders),
        },
        {
          channel: 'takeaway',
          label: '🛍️ Takeaway',
          orders: chanAgg.takeaway.orders,
          revenue: Math.round(chanAgg.takeaway.revenue),
          percentage: pct(chanAgg.takeaway.orders),
          avgTicket: ticket(chanAgg.takeaway.revenue, chanAgg.takeaway.orders),
        },
        {
          channel: 'dinein',
          label: '🍽️ Dine-In',
          orders: chanAgg.dinein.orders,
          revenue: Math.round(chanAgg.dinein.revenue),
          percentage: pct(chanAgg.dinein.orders),
          avgTicket: ticket(chanAgg.dinein.revenue, chanAgg.dinein.orders),
        },
      ];

      // Logistics Margin Summary — delivery fees really collected; Porter
      // invoice costs are UNKNOWN (no porter billing source): 0 with margin
      // equal to collected, never a fabricated ₹31/trip cost.
      const deliveryFeesCollected = liveOrders
        .filter((o) => String((o as any).orderType || "delivery") === "delivery")
        .reduce((s, o) => s + (Number((o as any).deliveryFee) || 0), 0);
      const deliveryOrders = chanAgg.delivery.orders;

      const logistics: LogisticsSummary = {
        deliveryFeesCollected: Math.round(deliveryFeesCollected),
        porterIncurredCost: 0,
        netMargin: Math.round(deliveryFeesCollected),
        totalDeliveryTrips: deliveryOrders,
        avgDeliveryDistanceKm: 0,
      };

      return {
        period,
        totalRevenue,
        totalOrders,
        warnings,
        averageOrderValue: Math.round(averageOrderValue),
        brandRoyaltyEarned,
        netBranchPayoutTotal,
        // Loop 51/120: real daily buckets; DEV-empty keeps the seeded demo
        // series (prod-empty is honest zeros).
        dailyRevenue: orders.length > 0 ? realDailyRevenue : seedDailyRevenue,
        topItems,
        branchStats,
        hourlyRush,
        fulfillmentBreakdown,
        logistics,
      };
    },
    enabled: !!user,
  });
}
