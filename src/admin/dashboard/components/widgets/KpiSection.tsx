import React from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  TrendingDown,
  IndianRupee,
  ShoppingBag,
  Radio,
  CheckCircle,
  XCircle,
  Calculator,
  Users,
  Store,
  AlertTriangle,
} from "lucide-react";
import {
  useAnalyticsSummary,
  useLiveCounts,
  useRevenueSeries,
  useOrderSeries,
} from "../../hooks/useDashboardData";
import type { OrderStatusBreakdown } from "../../types";

/* ------------------------------------------------------------------ *
 * P0-4 honesty helpers — pure, unit-tested in KpiSection.trend.test.ts.
 * No KPI card below may carry a literal trend %, sparkline shape, or
 * freshness string: trends come from computeTrend() over two real range
 * queries, sparklines from real series buckets, freshness from
 * formatFreshness(query dataUpdatedAt).
 * ------------------------------------------------------------------ */

/** Round to one decimal, halves away from zero (1.25 → 1.3, -1.25 → -1.3). */
export function roundOneDecimal(n: number): number {
  return ((n < 0 ? -1 : 1) * Math.round(Math.abs(n) * 10)) / 10;
}

/**
 * Real period-over-period delta in percent (one decimal), or undefined
 * whenever either side is missing/unusable — no prev baseline loaded,
 * non-finite input, or a zero baseline a percentage cannot divide
 * through. Undefined renders NO trend chip (never a fabricated one).
 */
export function computeTrend(
  current: number | null | undefined,
  previous: number | null | undefined,
): { value: number; isPositive: boolean } | undefined {
  if (typeof current !== "number" || typeof previous !== "number") return undefined;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return undefined;
  if (previous === 0) return undefined; // zero baseline: % change undefined
  const delta = ((current - previous) / previous) * 100;
  if (!Number.isFinite(delta)) return undefined;
  return { value: roundOneDecimal(delta), isPositive: delta >= 0 };
}

/**
 * Honest freshness label derived from a react-query `dataUpdatedAt`
 * (ms since epoch). Never loaded (null/undefined/0) → "—".
 */
export function formatFreshness(
  updatedAt: number | null | undefined,
  now: number = Date.now(),
): string {
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt) || updatedAt <= 0) return "—";
  const seconds = Math.floor(Math.max(0, now - updatedAt) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The shifted comparison window: same duration as `range`, ending one
 * day earlier (today-so-far vs yesterday-same-period). An unparseable
 * range degrades to { from: "", to: "" }, which disables the comparison
 * query — both trend sides then read as unavailable and no chip renders.
 */
export function shiftRangeByOneDay(range: {
  from: string;
  to: string;
}): { from: string; to: string } {
  const fromMs = Date.parse(range.from);
  const toMs = Date.parse(range.to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return { from: "", to: "" };
  return {
    from: new Date(fromMs - ONE_DAY_MS).toISOString(),
    to: new Date(toMs - ONE_DAY_MS).toISOString(),
  };
}

/** Series bucket size for the active range: hours for ≤2-day windows, days beyond. */
export function granularityForRange(range: { from: string; to: string }): "hour" | "day" {
  const fromMs = Date.parse(range.from);
  const toMs = Date.parse(range.to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return "day";
  return toMs - fromMs <= 48 * 60 * 60 * 1000 ? "hour" : "day";
}

/**
 * Count for a status group inside a breakdown. Undefined when the whole
 * breakdown is unavailable (no query data); 0 when it is loaded but has
 * no match — a real zero, not a missing side.
 */
function statusCount(
  breakdown: OrderStatusBreakdown[] | undefined,
  keys: string[],
): number | undefined {
  if (!breakdown) return undefined;
  return breakdown.find((s) => keys.includes(s.status.toUpperCase()))?.count ?? 0;
}

const COMPLETED_STATUSES = ["COMPLETED", "DELIVERED"];
const CANCELLED_STATUSES = ["CANCELLED"];

interface SparklineProps {
  points: number[];
  isPositive: boolean;
}

const Sparkline: React.FC<SparklineProps> = ({ points, isPositive }) => {
  // A series needs at least two real buckets to draw a shape; anything
  // less (empty query, single bucket) renders no line rather than a
  // fabricated or degenerate one.
  if (!points || points.length < 2) return null;

  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min;
  const width = 80;
  const height = 24;

  const coordinates = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * height;
    return `${x},${y}`;
  });

  const pathData = `M ${coordinates.join(" L ")}`;
  const strokeColor = isPositive ? "#16A34A" : "#EF4444";

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<any>;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  sparklineData?: number[];
  lastUpdated?: string;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  navigateTo: string;
}

const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  icon: Icon,
  trend,
  sparklineData,
  lastUpdated,
  isLoading,
  isError,
  refetch,
  navigateTo,
}) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-5 h-[155px] flex flex-col justify-between animate-pulse">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded" />
            <div className="h-7 w-28 bg-gray-100 dark:bg-gray-800 rounded" />
          </div>
          <div className="h-10 w-10 bg-gray-100 dark:bg-gray-800 rounded-xl" />
        </div>
        <div className="flex justify-between items-end border-t border-gray-50/50 dark:border-gray-800/10 pt-3">
          <div className="h-4 w-12 bg-gray-100 dark:bg-gray-800 rounded" />
          <div className="h-3 w-16 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-[20px] border border-red-100 dark:border-red-950/20 bg-red-50/10 dark:bg-red-950/5 p-5 h-[155px] flex flex-col justify-between">
        <div className="flex justify-between items-start">
          <div className="space-y-1.5">
            <span className="block text-[10px] font-bold text-red-500 uppercase tracking-wider">
              {title}
            </span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block pr-2">
              Error loading data
            </span>
          </div>
          <AlertTriangle size={18} className="text-red-500 shrink-0" />
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            refetch();
          }}
          className="w-full text-center py-1.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/15 dark:hover:bg-red-950/25 text-red-600 dark:text-red-400 text-xs font-bold transition-all cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const isPositive = trend?.isPositive ?? true;

  return (
    <div
      onClick={() => navigate(navigateTo as any )}
      className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-5 shadow-[0_4px_16px_rgba(0,0,0,0.01)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.03)] dark:hover:border-emerald-950 hover:border-primary transition-all duration-300 flex flex-col justify-between h-[155px] cursor-pointer group relative overflow-hidden"
    >
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider group-hover:text-primary dark:group-hover:text-emerald-400 transition-colors">
            {title}
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 dark:text-white">
            {value}
          </span>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-900/50 text-primary dark:text-emerald-400 group-hover:bg-primary group-hover:text-white dark:group-hover:bg-emerald-800 dark:group-hover:text-white transition-all">
          <Icon size={18} />
        </div>
      </div>

      <div className="flex justify-between items-end border-t border-gray-50/50 dark:border-gray-800/10 pt-3">
        <div className="flex items-center gap-1.5">
          {/* P0-4: no trend → NO chip at all (the old "STABLE" fallback
              asserted stability that was never measured). */}
          {trend ? (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                isPositive
                  ? "bg-emerald-50 text-[#16A34A] dark:bg-emerald-950/20"
                  : "bg-red-50 text-[#DC2626] dark:bg-red-950/20"
              }`}
            >
              {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              <span>{trend.value}%</span>
            </span>
          ) : null}
          {sparklineData ? (
            <Sparkline points={sparklineData} isPositive={isPositive} />
          ) : null}
        </div>
        {/* P0-4: freshness chip renders only when a real label exists
            (omitted entirely while the query is fetching); its content
            derives from dataUpdatedAt, never a literal. */}
        {lastUpdated !== undefined ? (
          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider shrink-0">
            Sync {lastUpdated}
          </span>
        ) : null}
      </div>
    </div>
  );
};

interface KpiSectionProps {
  dateRange: { from: string; to: string };
  storeId?: string;
}

export const KpiSection: React.FC<KpiSectionProps> = ({ dateRange, storeId }) => {
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
    isFetching: isSummaryFetching,
    dataUpdatedAt: summaryUpdatedAt,
    refetch: refetchSummary,
  } = useAnalyticsSummary(dateRange);

  // P0-4: ONE shifted-window query (same duration, ending one day
  // earlier) — every period-over-period trend below is computed from
  // this real comparison window, never from a literal.
  const prevRange = shiftRangeByOneDay(dateRange);
  const { data: prevSummary } = useAnalyticsSummary(prevRange);

  const {
    data: liveCounts,
    isLoading: isLiveLoading,
    isError: isLiveError,
    isFetching: isLiveFetching,
    dataUpdatedAt: liveUpdatedAt,
    refetch: refetchLive,
  } = useLiveCounts();

  // P0-4: real bucketed series feed the sparklines. Cards without an
  // honest series for their own metric get no sparkline at all.
  const granularity = granularityForRange(dateRange);
  const { data: revenueSeries } = useRevenueSeries({
    from: dateRange.from,
    to: dateRange.to,
    granularity,
  });
  const { data: orderSeries } = useOrderSeries({
    from: dateRange.from,
    to: dateRange.to,
    granularity,
  });
  const revenueSparkline =
    revenueSeries && revenueSeries.length > 1
      ? revenueSeries.map((point) => point.value)
      : undefined;
  const orderSparkline =
    orderSeries && orderSeries.length > 1
      ? orderSeries.map((point) => point.value)
      : undefined;

  // Metrics details
  const todayRevenue = summaryData?.revenue?.totalRevenuePaise
    ? `₹${(summaryData.revenue.totalRevenuePaise / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "₹0.00";

  const todayOrders = summaryData?.revenue?.orderCount ?? 0;
  const aov = summaryData?.revenue?.aov
    ? `₹${(summaryData.revenue.aov / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "₹0.00";

  const newCustomers = summaryData?.customers?.newCustomers ?? 0;

  // Extract completed/cancelled counts from statusBreakdown
  const completedCount =
    statusCount(summaryData?.statusBreakdown, COMPLETED_STATUSES) ?? 0;
  const cancelledCount =
    statusCount(summaryData?.statusBreakdown, CANCELLED_STATUSES) ?? 0;

  const liveOrders = liveCounts?.ordersActive ?? 0;
  const activeStores = liveCounts?.storesActive ?? 0;

  // P0-4: real deltas — (today - prev) / prev * 100, one decimal.
  // Either side unavailable (prev query still loading / errored /
  // disabled) → undefined → the card renders no trend chip.
  const revenueTrend = computeTrend(
    summaryData?.revenue?.totalRevenuePaise,
    prevSummary?.revenue?.totalRevenuePaise,
  );
  const ordersTrend = computeTrend(
    summaryData?.revenue?.orderCount,
    prevSummary?.revenue?.orderCount,
  );
  const aovTrend = computeTrend(summaryData?.revenue?.aov, prevSummary?.revenue?.aov);
  const completedTrend = computeTrend(
    completedCount,
    statusCount(prevSummary?.statusBreakdown, COMPLETED_STATUSES),
  );
  const cancelledTrend = computeTrend(
    cancelledCount,
    statusCount(prevSummary?.statusBreakdown, CANCELLED_STATUSES),
  );
  // New Customers deliberately has NO trend: the summary's newCustomers
  // is a rolling 7-day count that ignores the date range, so the shifted
  // window returns the SAME window, not a previous period — comparing
  // them would fabricate a baseline. undefined → no chip.

  // P0-4: freshness from each query's real dataUpdatedAt. While a query
  // is fetching the chip is omitted entirely (label would be mid-flight);
  // never loaded → formatFreshness renders "—".
  const summaryFreshness = isSummaryFetching
    ? undefined
    : formatFreshness(summaryUpdatedAt);
  const liveFreshness = isLiveFetching ? undefined : formatFreshness(liveUpdatedAt);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {/* Today's Revenue */}
      <KpiCard
        title="Today's Revenue"
        value={todayRevenue}
        icon={IndianRupee}
        trend={revenueTrend}
        sparklineData={revenueSparkline}
        lastUpdated={summaryFreshness}
        isLoading={isSummaryLoading}
        isError={isSummaryError}
        refetch={refetchSummary}
        navigateTo="/admin/payments"
      />

      {/* Today's Orders */}
      <KpiCard
        title="Today's Orders"
        value={todayOrders}
        icon={ShoppingBag}
        trend={ordersTrend}
        sparklineData={orderSparkline}
        lastUpdated={summaryFreshness}
        isLoading={isSummaryLoading}
        isError={isSummaryError}
        refetch={refetchSummary}
        navigateTo="/admin/orders"
      />

      {/* Live Orders */}
      <KpiCard
        title="Live Orders"
        value={liveOrders}
        icon={Radio}
        lastUpdated={liveFreshness}
        isLoading={isLiveLoading}
        isError={isLiveError}
        refetch={refetchLive}
        navigateTo="/admin/orders"
      />

      {/* Completed Orders */}
      <KpiCard
        title="Completed Orders"
        value={completedCount}
        icon={CheckCircle}
        trend={completedTrend}
        lastUpdated={summaryFreshness}
        isLoading={isSummaryLoading}
        isError={isSummaryError}
        refetch={refetchSummary}
        navigateTo="/admin/orders"
      />

      {/* Cancelled Orders */}
      <KpiCard
        title="Cancelled Orders"
        value={cancelledCount}
        icon={XCircle}
        trend={cancelledTrend}
        lastUpdated={summaryFreshness}
        isLoading={isSummaryLoading}
        isError={isSummaryError}
        refetch={refetchSummary}
        navigateTo="/admin/orders"
      />

      {/* Average Order Value */}
      <KpiCard
        title="Avg Order Value"
        value={aov}
        icon={Calculator}
        trend={aovTrend}
        lastUpdated={summaryFreshness}
        isLoading={isSummaryLoading}
        isError={isSummaryError}
        refetch={refetchSummary}
        navigateTo="/admin/analytics-hub"
      />

      {/* New Customers — no trend by design (see above): the metric
          ignores the date range, so no honest previous-period baseline
          exists. */}
      <KpiCard
        title="New Customers"
        value={newCustomers}
        icon={Users}
        lastUpdated={summaryFreshness}
        isLoading={isSummaryLoading}
        isError={isSummaryError}
        refetch={refetchSummary}
        navigateTo="/admin/customers"
      />

      {/* Active Stores */}
      <KpiCard
        title="Active Stores"
        value={`${activeStores} Active`}
        icon={Store}
        lastUpdated={liveFreshness}
        isLoading={isLiveLoading}
        isError={isLiveError}
        refetch={refetchLive}
        navigateTo="/admin/stores"
      />
    </div>
  );
};
