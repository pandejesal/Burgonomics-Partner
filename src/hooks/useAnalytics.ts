import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/config/firebase';
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  limit,
  getDocs,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { subDays, format } from 'date-fns';
import { fetchAliasedStoreOrders, normalizeOrderDoc } from '@/utils/orderContract';
import {
  billableOrders,
  isCompletedOrder,
  istDayKey,
  istDayRange,
  istMonthKey,
  istMonthLabel,
  orderNetEarnings,
  orderPaymentChannel,
  previousIstMonthKey,
  startOfIstDay,
  startOfIstMonth,
  startOfIstMonthKey,
  startOfIstWeek,
  summarizeOrderRevenue,
} from '@/utils/analyticsMath';
import { FIRESTORE_IN_LIMIT, isGlobalRole, resolveScopedBranchIds } from '@/utils/branchScope';

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
  /** Branch earnings from gateway-paid orders (net of courier fee). */
  razorpayRevenue: number;
  razorpayOrders: number;
  /** Counter/cash earnings collected at the outlet (completed orders only). */
  cashRevenue: number;
  cashOrders: number;
  /** In-progress counter orders: a receivable, never earned yet. */
  cashPendingOrders: number;
  unpaidOrders: number;
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

export interface MonthlyStatementRow {
  branchId: string;
  branchName: string;
  city: string;
  linkedAccountId: string;
  linkedStatus: 'active' | 'pending' | 'verified';
  razorpayEarnings: number;
  cashEarnings: number;
  /** Delivery fees the brand paid on completed cash orders (owed by branch). */
  courierOnCash: number;
  /** Null when the ledger read was denied: never a false 0. */
  fee: number | null;
  collected: number | null;
  due: number | null;
}

export interface MonthlyStatementMonth {
  monthKey: string;
  label: string;
  rows: MonthlyStatementRow[];
  /** False when `branch_monthly_fees` could not be read for this role. */
  available: boolean;
  unavailableReason?: 'not_available_for_role' | 'read_failed';
}

export interface AnalyticsResult {
  period: 'week' | 'month' | 'year';
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  razorpayRevenue: number;
  razorpayOrders: number;
  cashRevenue: number;
  cashOrders: number;
  cashPendingOrders: number;
  unpaidOrders: number;
  monthlyStatements: {
    current: MonthlyStatementMonth;
    previous: MonthlyStatementMonth;
  };
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
      const branchMeta: Record<
        string,
        { name: string; city: string; accountId: string; monthlyFee?: number }
      > = {
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

      // Empty, honest result for fail-closed scopes (assigned branches
      // missing) — never unfiltered brand-wide numbers for a scoped role.
      const emptyResult = (warning: string): AnalyticsResult => {
        const mk = istMonthKey(new Date());
        const pk = previousIstMonthKey(mk);
        return {
          period,
          totalRevenue: 0,
          totalOrders: 0,
          averageOrderValue: 0,
          razorpayRevenue: 0,
          razorpayOrders: 0,
          cashRevenue: 0,
          cashOrders: 0,
          cashPendingOrders: 0,
          unpaidOrders: 0,
          monthlyStatements: {
            current: { monthKey: mk, label: istMonthLabel(mk), rows: [], available: true },
            previous: { monthKey: pk, label: istMonthLabel(pk), rows: [], available: true },
          },
          dailyRevenue: [],
          topItems: [],
          branchStats: [],
          hourlyRush: [],
          fulfillmentBreakdown: [],
          logistics: {
            deliveryFeesCollected: 0,
            porterIncurredCost: 0,
            netMargin: 0,
            totalDeliveryTrips: 0,
            avgDeliveryDistanceKm: 0,
          },
          warnings: [warning],
        };
      };

      // Scope resolution — branch_owner/branch_staff are CLAMPED to their
      // assigned branches. The old code read selectedBranchId straight from
      // localStorage (user-writable!) before any role check, so a forged
      // selection handed any branch owner the whole brand's revenue and
      // fee statement; and an unassigned scoped role fell through to an
      // unfiltered all-outlets read. resolveScopedBranchIds fails closed.
      if (!isGlobalRole(user.role)) {
        branchIds = resolveScopedBranchIds(user, selectedBranchId);
        if (branchIds.length === 0) {
          return emptyResult(
            'No branches are assigned to your account — analytics are scoped to your outlets.'
          );
        }
      }

      try {
        if (user.role === 'regional_manager') {
          // Regional managers are CITY-scoped, so their city check runs
          // BEFORE the explicit-selection short-circuit: a forged or stale
          // localStorage `selectedBranchId` must never widen them past their
          // assigned cities (the old code took it verbatim). Fail closed: no
          // assigned cities means NO analytics scope, never a two-city guess.
          const cityIds = user.cityIds ?? [];
          if (cityIds.length === 0) {
            return emptyResult(
              'No cities are assigned to your account - analytics are scoped to your cities.'
            );
          }
          const branchesSnap = await getDocs(
            query(collection(db, 'branches'), where('city', 'in', cityIds), limit(100))
          );
          const allowedBranchIds = new Set<string>();
          branchesSnap.docs.forEach((d) => {
            allowedBranchIds.add(d.id);
            const data = d.data();
            branchMeta[d.id] = {
              name: data.name || d.id,
              city: data.city || 'Gujarat',
              accountId: data.razorpayAccountId || `acc_Rzp_${d.id}`,
              monthlyFee: Number.isFinite(Number(data.monthlyFee))
                ? Number(data.monthlyFee)
                : undefined,
            };
          });
          if (
            selectedBranchId &&
            selectedBranchId !== 'all' &&
            !allowedBranchIds.has(selectedBranchId)
          ) {
            return emptyResult(
              'Selected outlet is outside your assigned cities - analytics are scoped to your cities.'
            );
          }
          branchIds =
            selectedBranchId && selectedBranchId !== 'all'
              ? [selectedBranchId]
              : [...allowedBranchIds];
          if (branchIds.length === 0) {
            // Mirrors useTickets: a city scope that resolves to no outlets is
            // a denial, never an unfiltered all-outlets read.
            return emptyResult(
              'No outlets were found in your assigned cities - analytics are scoped to your cities.'
            );
          }
        } else if (isGlobalRole(user.role)) {
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
                monthlyFee: Number.isFinite(Number(data.monthlyFee))
                  ? Number(data.monthlyFee)
                  : undefined,
              };
            });
          }
        }
      } catch (err) {
        console.warn('Error querying branches for analytics:', err);
        // Fail CLOSED for every role whose scope needed this read: an
        // unresolved scope must never fall through to an unfiltered,
        // all-outlets orders read. Brand-wide roles are the only exception
        // (their empty scope genuinely means "all outlets").
        if (user.role === 'regional_manager' || !isGlobalRole(user.role)) {
          return emptyResult('Could not resolve your outlet scope - analytics are not shown.');
        }
        warnings.push('Branch list failed to load — figures cover all outlets.');
      }

      // Scoped roles (branch_owner/staff) did not read branch docs above; their
      // fee config + names are needed for the monthly statement. Rules allow a
      // member to read their own branch.
      try {
        const missing = branchIds.filter((id) => !branchMeta[id]).slice(0, 100);
        if (missing.length > 0) {
          const snaps = await Promise.all(missing.map((id) => getDoc(doc(db, 'branches', id))));
          snaps.forEach((snap, idx) => {
            if (!snap.exists()) return;
            const data = snap.data();
            branchMeta[missing[idx]] = {
              name: data.name || missing[idx],
              city: data.city || '',
              accountId: data.razorpayAccountId || `acc_Rzp_${missing[idx]}`,
              monthlyFee: Number.isFinite(Number(data.monthlyFee))
                ? Number(data.monthlyFee)
                : undefined,
            };
          });
        }
      } catch {
        warnings.push('Branch fee settings could not be loaded.');
      }

      // Loop 51/120: no hardcoded fallback outlets — empty scope means
      // unfiltered (all branches), never two invented ones.
      if (branchIds.length === 0) {
        warnings.push('No branch scope resolved — figures cover all outlets.');
      }

      // Date range calculation. PAR-01b: the fetch window is anchored to
      // Asia/Kolkata, exactly like the day buckets below — date-fns
      // startOfWeek/startOfMonth use the DEVICE timezone, so a non-IST device
      // asked Firestore for a window that started on a different IST day than
      // the chart bucketed into.
      const now = new Date();
      let startDate: Date;

      if (period === 'week') {
        startDate = startOfIstWeek(now);
      } else if (period === 'month') {
        startDate = startOfIstMonth(now);
      } else {
        // 365 IST buckets end today, so the first bucket starts 364 IST days
        // before today; anchor there instead of an arbitrary instant.
        startDate = startOfIstDay(subDays(now, 364));
      }

      const startTimestamp = Timestamp.fromDate(startDate);

      let orders: any[] = [];
      try {
        // Loop 51/120: bounded — a year view must not pull unbounded history.
        const ORDER_CAP = 2000;
        // `in` + `createdAt >=` + `orderBy createdAt` needs the composite
        // index. An undeployed index is a query error, never an unordered
        // page: arbitrary documents must not be presented as period totals.
        const ordersQuery =
          branchIds.length > 0
            ? query(
                collection(db, 'orders'),
                where('branchId', 'in', branchIds.slice(0, FIRESTORE_IN_LIMIT)),
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

        let rawDocs: Array<{ id: string; data: Record<string, any> }>;
        const ordersSnap = await getDocs(ordersQuery);
        rawDocs = ordersSnap.docs.map((d) => ({
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
        // The aliased merge carries pre-range docs — narrow to the period in
        // memory, where Timestamp and ISO-string createdAt both compare
        // correctly. An unparseable date is excluded, never counted.
        orders = rawDocs
          .map((d) => normalizeOrderDoc(d.id, d.data))
          .filter((o: any) => !branchIds.length || (o.branchId && branchIds.includes(o.branchId)))
          .filter((o: any) => {
            const c = (o as any).createdAt;
            const ms = c?.toMillis?.() ?? (c?.toDate ? c.toDate().getTime() : new Date(c ?? 0).getTime());
            return Number.isFinite(ms) ? ms >= startDate.getTime() : false;
          });
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

      const summary = orders.length > 0 ? summarizeOrderRevenue(orders) : null;
      const totalRevenue = summary
        ? summary.totalRevenue
        : demo
          ? seedDailyRevenue.reduce((s, d) => s + d.revenue, 0)
          : 0;

      // Cancelled and fully refunded orders are not billable: they never count
      // toward order volume. A partially refunded order still counts once.
      const totalOrders = summary
        ? summary.totalOrders
        : demo
          ? seedDailyRevenue.reduce((s, d) => s + d.orders, 0)
          : 0;

      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Owner decision 1 Nov 2026: two real earnings streams, no per-order
      // royalty (fixed monthly branch fee instead). Unpaid online orders earn
      // nothing — only the server `paymentChannel === "razorpay"` marker proves
      // a gateway capture.
      const razorpayRevenue = summary?.razorpayRevenue ?? 0;
      const razorpayOrders = summary?.razorpayOrders ?? 0;
      const cashRevenue = summary?.cashRevenue ?? 0;
      const cashOrders = summary?.cashOrders ?? 0;
      const cashPendingOrders = summary?.cashPendingOrders ?? 0;
      const unpaidOrders =
        (summary?.totalOrders ?? 0) - (summary?.razorpayOrders ?? 0) - (summary?.cashOrders ?? 0) - cashPendingOrders;

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
        paymentChannel?: string;
        customerId?: string;
        paymentMethod?: string;
        refundStatus?: string;
        refundAmount?: number | null;
        refundedTotalPaise?: number;
        createdAt?: any;
        items?: Array<{ name?: string; quantity?: number; price?: number }>;
      };
      // PAR-01: cancelled / fully refunded orders are excluded from every
      // aggregation below (revenue, order volume, daily chart, top items,
      // branch ledger, hourly rush, channel split, delivery fees).
      // Monthly statement (fixed branch fee) — current + previous IST month.
      // Razorpay/cash earnings come from the orders; fee/collected come from
      // the server-written `branch_monthly_fees` ledger. A denied ledger read
      // marks the month unavailable so the UI never shows a false 0.
      const currentMonthKey = istMonthKey(now);
      const previousMonthKey = previousIstMonthKey(currentMonthKey);

      let statementOrders: NormOrder[] = [];
      const statementStart = startOfIstMonthKey(previousMonthKey);
      if (statementStart) {
        try {
          const statementQuery =
            branchIds.length > 0
              ? query(
                  collection(db, 'orders'),
                  where('branchId', 'in', branchIds.slice(0, FIRESTORE_IN_LIMIT)),
                  where('createdAt', '>=', Timestamp.fromDate(statementStart)),
                  orderBy('createdAt', 'asc'),
                  limit(2000)
                )
              : query(
                  collection(db, 'orders'),
                  where('createdAt', '>=', Timestamp.fromDate(statementStart)),
                  orderBy('createdAt', 'asc'),
                  limit(2000)
                );
          const snap = await getDocs(statementQuery);
          statementOrders = snap.docs
            .map((d) => normalizeOrderDoc(d.id, d.data() as Record<string, any>))
            .filter((o: any) => !branchIds.length || branchIds.includes(o.branchId)) as unknown as NormOrder[];
        } catch {
          warnings.push('Monthly statement orders could not be loaded.');
        }
      }

      type LedgerRow = {
        branchId: string;
        monthKey: string;
        feePaise: number;
        feeCollectedPaise: number;
      };
      const ledgerRows = new Map<string, LedgerRow>();
      let ledgerAvailable = true;
      let ledgerUnavailableReason: MonthlyStatementMonth['unavailableReason'];
      try {
        const snap = await getDocs(
          query(
            collection(db, 'branch_monthly_fees'),
            where('monthKey', 'in', [currentMonthKey, previousMonthKey]),
            limit(500)
          )
        );
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, any>;
          const branchId = String(data.branchId ?? '');
          const monthKey = String(data.monthKey ?? '');
          if (!branchId || !monthKey) return;
          ledgerRows.set(`${monthKey}|${branchId}`, {
            branchId,
            monthKey,
            feePaise: Number(data.feePaise) || 0,
            feeCollectedPaise: Number(data.feeCollectedPaise) || 0,
          });
        });
      } catch (err: any) {
        ledgerAvailable = false;
        ledgerUnavailableReason =
          String(err?.code ?? '') === 'permission-denied' ||
          /permission|insufficient/i.test(String(err?.message ?? ''))
            ? 'not_available_for_role'
            : 'read_failed';
      }

      const buildMonthlyStatement = (monthKey: string): MonthlyStatementMonth => {
        const monthOrders = statementOrders.filter((o) => istMonthKey(o.createdAt) === monthKey);
        const ids = new Set<string>();
        branchIds.forEach((id) => ids.add(id));
        monthOrders.forEach((o) => {
          if (o.branchId) ids.add(String(o.branchId));
        });
        if (ledgerAvailable) {
          for (const key of ledgerRows.keys()) {
            if (key.startsWith(`${monthKey}|`)) ids.add(key.slice(monthKey.length + 1));
          }
        }

        const rows: MonthlyStatementRow[] = [...ids]
          .map((bid) => {
            const branchOrders = monthOrders.filter((o) => String(o.branchId ?? '') === bid);
            let razorpayEarnings = 0;
            let cashEarnings = 0;
            let courierOnCash = 0;
            for (const o of branchOrders) {
              const stream = orderPaymentChannel(o);
              if (stream === 'razorpay') {
                razorpayEarnings += orderNetEarnings(o);
              } else if (stream === 'cash' && isCompletedOrder(o)) {
                cashEarnings += orderNetEarnings(o);
                courierOnCash += Number(o.deliveryFee) || 0;
              }
            }

            const ledger = ledgerRows.get(`${monthKey}|${bid}`);
            let fee: number | null;
            let collected: number | null;
            let due: number | null;
            if (!ledgerAvailable) {
              fee = null;
              collected = null;
              due = null;
            } else {
              fee = ledger ? ledger.feePaise / 100 : (branchMeta[bid]?.monthlyFee ?? 2500);
              collected = ledger ? ledger.feeCollectedPaise / 100 : 0;
              due = Math.max(0, fee - collected);
            }

            const firstOrder = branchOrders[0];
            const accountId = branchMeta[bid]?.accountId;
            const hasRealAccount = !!accountId && !accountId.startsWith('acc_Rzp_');
            return {
              branchId: bid,
              branchName: branchMeta[bid]?.name || firstOrder?.branchName || bid,
              city: branchMeta[bid]?.city || firstOrder?.city || '',
              linkedAccountId: hasRealAccount ? accountId : 'unlinked',
              linkedStatus: (hasRealAccount ? 'verified' : 'pending') as MonthlyStatementRow['linkedStatus'],
              razorpayEarnings: Math.round(razorpayEarnings),
              cashEarnings: Math.round(cashEarnings),
              courierOnCash: Math.round(courierOnCash),
              fee,
              collected,
              due,
            };
          })
          .sort((a, b) => a.branchName.localeCompare(b.branchName));

        return {
          monthKey,
          label: istMonthLabel(monthKey),
          rows,
          available: ledgerAvailable,
          ...(ledgerUnavailableReason && !ledgerAvailable
            ? { unavailableReason: ledgerUnavailableReason }
            : {}),
        };
      };

      const monthlyStatements = {
        current: buildMonthlyStatement(currentMonthKey),
        previous: buildMonthlyStatement(previousMonthKey),
      };

      const liveOrders = billableOrders(orders) as unknown as NormOrder[];
      // Money aggregations use earnings (net of refunds and the courier fee).
      // Unpaid online orders are not sales: they stay out of item mix/delivery
      // fees and contribute 0 to every money total.
      const earningOrders = liveOrders.filter((o) => orderPaymentChannel(o) !== 'unpaid');
      // PAR-01: IST day buckets — `toISOString()` is UTC and split the Indian
      // business day at 05:30, so early-morning orders fell on the prior day.
      const orderDay = (o: NormOrder): string => istDayKey(o.createdAt);
      const dayRange: string[] = istDayRange(
        now,
        period === "week" ? 7 : period === "month" ? 30 : 365
      );
      const realDailyRevenue: DailyRevenue[] = dayRange.map((date) => {
        const dayOrders = liveOrders.filter((o) => orderDay(o) === date);
        return {
          date,
          revenue: Math.round(dayOrders.reduce((s, o) => s + orderNetEarnings(o), 0)),
          orders: dayOrders.length,
        };
      });
      const itemAgg = new Map<string, { name: string; quantity: number; revenue: number }>();
      for (const o of earningOrders) {
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
        {
          name: string;
          city: string;
          orders: number;
          revenue: number;
          razorpayRevenue: number;
          razorpayOrders: number;
          cashRevenue: number;
          cashOrders: number;
          cashPendingOrders: number;
          unpaidOrders: number;
          delivery: number;
          takeaway: number;
          dinein: number;
        }
      >();
      for (const o of liveOrders) {
        const bid = String(o.branchId || "unassigned");
        const cur = branchAgg.get(bid) || {
          name: String(o.branchName || branchMeta[bid]?.name || bid),
          city: String(o.city || branchMeta[bid]?.city || ""),
          orders: 0,
          revenue: 0,
          razorpayRevenue: 0,
          razorpayOrders: 0,
          cashRevenue: 0,
          cashOrders: 0,
          cashPendingOrders: 0,
          unpaidOrders: 0,
          delivery: 0,
          takeaway: 0,
          dinein: 0,
        };
        cur.orders += 1;
        const earnings = orderNetEarnings(o);
        cur.revenue += earnings;
        const stream = orderPaymentChannel(o);
        if (stream === "razorpay") {
          cur.razorpayRevenue += earnings;
          cur.razorpayOrders += 1;
        } else if (stream === "cash") {
          if (isCompletedOrder(o)) {
            cur.cashRevenue += earnings;
            cur.cashOrders += 1;
          } else {
            cur.cashPendingOrders += 1;
          }
        } else {
          cur.unpaidOrders += 1;
        }
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

      // Multi-Branch Stats — real per-branch grouping, split into the two
      // earnings streams. No per-order royalty: the owner replaced it with a
      // fixed monthly branch fee (see the monthly statement).
      const branchStats: BranchStats[] = [...branchAgg.entries()].map(([bid, b]) => {
        const realAccount = branchMeta[bid]?.accountId;
        const hasRealAccount = !!realAccount && !realAccount.startsWith('acc_Rzp_');
        return {
          branchId: bid,
          branchName: b.name,
          city: b.city,
          orders: b.orders,
          revenue: Math.round(b.revenue),
          razorpayRevenue: Math.round(b.razorpayRevenue),
          razorpayOrders: b.razorpayOrders,
          cashRevenue: Math.round(b.cashRevenue),
          cashOrders: b.cashOrders,
          cashPendingOrders: b.cashPendingOrders,
          unpaidOrders: b.unpaidOrders,
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
        cur.revenue += orderNetEarnings(o as any);
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
        slot.revenue += orderNetEarnings(o as any);
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
      const deliveryFeesCollected = earningOrders
        .filter((o) => String((o as any).orderType || "delivery") === "delivery")
        .reduce((s, o) => s + (Number((o as any).deliveryFee) || 0), 0);
      const deliveryOrders = chanAgg.delivery.orders;

      // No Porter billing source is wired: the courier cost is UNKNOWN, not
      // zero. It is reported as 0 here and the UI withholds any margin verdict
      // while cost === 0 beside live trips (see FulfillmentDonut).
      const porterIncurredCost = 0;

      const logistics: LogisticsSummary = {
        deliveryFeesCollected: Math.round(deliveryFeesCollected),
        porterIncurredCost,
        netMargin: Math.round(deliveryFeesCollected - porterIncurredCost),
        totalDeliveryTrips: deliveryOrders,
        avgDeliveryDistanceKm: 0,
      };

      return {
        period,
        totalRevenue,
        totalOrders,
        warnings,
        averageOrderValue: Math.round(averageOrderValue),
        razorpayRevenue,
        razorpayOrders,
        cashRevenue,
        cashOrders,
        cashPendingOrders,
        unpaidOrders,
        monthlyStatements,
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
