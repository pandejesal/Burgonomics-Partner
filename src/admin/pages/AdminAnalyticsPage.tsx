import React, { useState, useEffect, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  Legend,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Eye,
  Megaphone,
  Layers,
  Zap,
  Tag,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard, AdminCard } from "../components/Cards";
import { marketingStorage, MarketingCampaign } from "./marketingData";
import {
  useDashboardSnapshot,
  useRevenueSeries,
  useOrderSeries,
} from "../dashboard/hooks/useDashboardData";

const CHART_FILLS = ["#0E4825", "#FF6600", "#F59E0B", "#16A34A", "#7C3AED"];

/** Formats an ISO date bucket (YYYY-MM-DD) as a short label like "12 Aug". */
const formatBucketLabel = (bucket: string) => {
  const d = new Date(`${bucket}T00:00:00`);
  if (isNaN(d.getTime())) return bucket;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const formatINR = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const AdminAnalyticsPage: React.FC = () => {
  const [tab, setTab] = useState<"sales" | "marketing">("sales");
  const [rangeDays, setRangeDays] = useState(7);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);

  useEffect(() => {
    setCampaigns(marketingStorage.getCampaigns());
    const sub = marketingStorage.subscribe(() => {
      setCampaigns(marketingStorage.getCampaigns());
    });
    return () => {
      sub();
    };
  }, []);

  // Live analytics window (now − rangeDays → now)
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - (rangeDays - 1));
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [rangeDays]);
  const to = useMemo(() => new Date().toISOString(), [rangeDays]);

  const {
    data: snapshot,
    isLoading: isSnapshotLoading,
    isError: isSnapshotError,
    refetch: refetchSnapshot,
  } = useDashboardSnapshot({ from, to });
  const {
    data: revenueSeries,
    isLoading: isRevenueLoading,
    isError: isRevenueError,
    refetch: refetchRevenue,
  } = useRevenueSeries({ from, to, granularity: "day" });
  const {
    data: orderSeries,
    isLoading: isOrderLoading,
    isError: isOrderError,
    refetch: refetchOrder,
  } = useOrderSeries({ from, to, granularity: "day" });

  const isAnyError = isSnapshotError || isRevenueError || isOrderError;
  const isSeriesLoading = isRevenueLoading || isOrderLoading;
  const isSeriesError = isRevenueError || isOrderError;
  const hasSnapshot = !isSnapshotLoading && !isSnapshotError && snapshot !== undefined;

  const salesTrend = useMemo(() => {
    if (!revenueSeries || !orderSeries) return [];
    const merged = new Map<string, { revenue: number; orders: number }>();
    for (const pt of revenueSeries) {
      merged.set(pt.bucket, { revenue: pt.value, orders: 0 });
    }
    for (const pt of orderSeries) {
      const prev = merged.get(pt.bucket) || { revenue: 0, orders: 0 };
      merged.set(pt.bucket, { revenue: prev.revenue, orders: pt.value });
    }
    return Array.from(merged.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, v]) => ({
        name: formatBucketLabel(bucket),
        revenue: v.revenue,
        orders: v.orders,
      }));
  }, [revenueSeries, orderSeries]);

  const topProducts = useMemo(
    () =>
      (snapshot?.topProducts || []).slice(0, 5).map((p, i) => ({
        name: p.name,
        sales: p.units,
        fill: CHART_FILLS[i % CHART_FILLS.length],
      })),
    [snapshot],
  );

  const revenuePaise = snapshot?.revenue.netRevenuePaise ?? 0;
  const orderCount = snapshot?.revenue.orderCount ?? 0;
  const aovPaise = snapshot?.revenue.aov ?? 0;

  // Compute dynamic marketing totals
  const totalSent = campaigns.reduce((acc, c) => acc + c.stats.sent, 0);
  const totalDelivered = campaigns.reduce((acc, c) => acc + c.stats.delivered, 0);
  const totalClicked = campaigns.reduce((acc, c) => acc + c.stats.clicked, 0);
  const totalRevenue = campaigns.reduce((acc, c) => acc + c.stats.revenue, 0);

  const deliveryRate = totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) : "—";
  const ctr = totalDelivered > 0 ? ((totalClicked / totalDelivered) * 100).toFixed(1) : "—";

  // Real channel stats derived from campaign records: each campaign's stats
  // are split evenly across the channels it targets (no fabricated numbers).
  const channelPerf = useMemo(() => {
    const byChannel = new Map<string, { Dispatched: number; Delivered: number; Clicked: number }>();
    for (const c of campaigns) {
      const channels = c.channels.length > 0 ? c.channels : ["Unassigned"];
      const share = 1 / channels.length;
      for (const ch of channels) {
        const row = byChannel.get(ch) || { Dispatched: 0, Delivered: 0, Clicked: 0 };
        row.Dispatched += Math.round(c.stats.sent * share);
        row.Delivered += Math.round(c.stats.delivered * share);
        row.Clicked += Math.round(c.stats.clicked * share);
        byChannel.set(ch, row);
      }
    }
    return Array.from(byChannel.entries()).map(([name, v]) => ({ name, ...v }));
  }, [campaigns]);

  // Real campaign revenue bucketed by launch date (no fabricated trends).
  const campaignRevenueTrend = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const c of campaigns) {
      const date = c.createdAt.slice(0, 10);
      byDate.set(date, (byDate.get(date) || 0) + c.stats.revenue);
    }
    return Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, revenue]) => ({ date: formatBucketLabel(date), revenue }));
  }, [campaigns]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Burgonomics Intelligence Suite"
        description="Verify sales revenues, monitor order volumes, audit marketing channel ROI metrics, and compare outlet checkout conversion rates."
        breadcrumbs={[{ label: "Analytics Hub" }]}
      />

      {/* Tabs segment */}
      <div className="flex border-b border-gray-100 dark:border-gray-800 gap-6">
        <button
          onClick={() => setTab("sales")}
          className={`pb-3 text-sm font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            tab === "sales"
              ? "border-primary text-primary dark:border-emerald-500 dark:text-emerald-400 font-black"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          <TrendingUp size={16} />
          <span>Sales & Operations</span>
        </button>

        <button
          onClick={() => setTab("marketing")}
          className={`pb-3 text-sm font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            tab === "marketing"
              ? "border-primary text-primary dark:border-emerald-500 dark:text-emerald-400 font-black"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          <Megaphone size={16} />
          <span>Marketing & Campaigns ROI</span>
        </button>
      </div>

      {/* SALES AND OPERATIONS VIEW */}
      {tab === "sales" && (
        <div className="space-y-6 animate-fadeIn">
          {isAnyError && (
            <div
              role="alert"
              className="p-4 rounded-2xl bg-rose-950/20 border border-rose-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-300 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Analytics data stream unavailable or failed to load. Showing degraded telemetry.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  refetchSnapshot();
                  refetchRevenue();
                  refetchOrder();
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors cursor-pointer self-start sm:self-auto min-h-[36px]"
              >
                Retry Loading
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
              title="Consolidated Revenue"
              value={!hasSnapshot ? "—" : formatINR(revenuePaise)}
              icon={DollarSign}
              subtext={`Net of refunds · last ${rangeDays} days`}
            />
            <StatCard
              title="Consolidated Orders"
              value={!hasSnapshot ? "—" : orderCount.toLocaleString("en-IN")}
              icon={ShoppingBag}
              subtext={`Last ${rangeDays} days`}
            />
            <StatCard
              title="Average Order Value"
              value={!hasSnapshot ? "—" : formatINR(aovPaise)}
              icon={Eye}
              subtext="Net revenue per completed order"
            />
          </div>

          {/* Range selector */}
          <div className="flex items-center gap-1.5 justify-end">
            {[7, 30].map((days) => (
              <button
                key={days}
                onClick={() => setRangeDays(days)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all cursor-pointer border ${
                  rangeDays === days
                    ? "bg-primary text-white border-primary dark:bg-emerald-600 dark:border-emerald-600"
                    : "bg-white dark:bg-[#1A1A1A] text-gray-500 border-gray-100 dark:border-gray-800 hover:border-gray-200"
                }`}
              >
                {days}d
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales trend area chart */}
            <AdminCard
              title="Sales Revenue & Order volume"
              subtitle={`Consolidated performance curves · last ${rangeDays} days`}
            >
              <div className="h-80 w-full font-sans text-xs">
                {isSeriesLoading ? (
                  <div className="h-full w-full flex flex-col items-center justify-center text-center p-6 text-neutral-400">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent mb-3" />
                    <p className="text-xs font-semibold text-neutral-300">Loading performance curves...</p>
                  </div>
                ) : isSeriesError ? (
                  <div className="h-full w-full flex flex-col items-center justify-center text-center p-6 text-rose-400">
                    <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
                    <p className="font-bold text-sm text-neutral-200">Trend data unavailable</p>
                    <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                      Failed to fetch revenue and order series for this {rangeDays}d range.
                    </p>
                  </div>
                ) : salesTrend.length === 0 || salesTrend.every((pt) => pt.revenue === 0 && pt.orders === 0) ? (
                  <div className="h-full w-full flex flex-col items-center justify-center text-center p-6 text-neutral-400">
                    <ShoppingBag className="w-8 h-8 text-neutral-600 mb-2" />
                    <p className="font-bold text-neutral-300 text-sm">No sales or orders in this date range</p>
                    <p className="text-xs text-neutral-500 mt-1 max-w-sm">
                      No order activity recorded in the last {rangeDays} days. Curves will populate once orders are placed.
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0E4825" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#0E4825" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                      <XAxis dataKey="name" stroke="#A3A3A3" fontSize={11} tickLine={false} />
                      <YAxis stroke="#A3A3A3" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "16px",
                          border: "1px solid #EAEAEA",
                          boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
                        }}
                        formatter={(value: any, name?: any) =>
                          name === "revenue"
                            ? [formatINR(Number(value)), "Revenue"]
                            : [value, "Orders"]
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        name="revenue"
                        stroke="#0E4825"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </AdminCard>

            {/* Top products bar chart */}
            <AdminCard
              title="Top-selling products"
              subtitle={`Units sold · last ${rangeDays} days`}
            >
              <div className="h-80 w-full font-sans text-xs">
                {isSnapshotLoading ? (
                  <div className="h-full w-full flex flex-col items-center justify-center text-center p-6 text-neutral-400">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent mb-3" />
                    <p className="text-xs font-semibold text-neutral-300">Loading top product sales...</p>
                  </div>
                ) : isSnapshotError ? (
                  <div className="h-full w-full flex flex-col items-center justify-center text-center p-6 text-rose-400">
                    <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
                    <p className="font-bold text-sm text-neutral-200">Product sales ranking unavailable</p>
                    <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                      Failed to fetch top products telemetry for this {rangeDays}d range.
                    </p>
                  </div>
                ) : topProducts.length === 0 ? (
                  <div className="h-full w-full flex flex-col items-center justify-center text-center p-6 text-neutral-400">
                    <TrendingUp className="w-8 h-8 text-neutral-600 mb-2" />
                    <p className="font-bold text-neutral-300 text-sm">No product sales in this date range</p>
                    <p className="text-xs text-neutral-500 mt-1 max-w-sm">
                      Top selling items will appear here once orders are processed within the selected {rangeDays}d window.
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProducts} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                      <XAxis dataKey="name" stroke="#A3A3A3" fontSize={11} tickLine={false} />
                      <YAxis stroke="#A3A3A3" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "16px",
                          border: "1px solid #EAEAEA",
                        }}
                      />
                      <Bar dataKey="sales" name="Units Sold" radius={[10, 10, 0, 0]}>
                        {topProducts.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </AdminCard>
          </div>
        </div>
      )}

      {/* MARKETING AND CAMPAIGNS VIEW */}
      {tab === "marketing" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Campaign Dispatches"
              value={totalSent.toLocaleString()}
              icon={Layers}
              subtext="Total broadcast volumes"
            />
            <StatCard
              title="Delivery Gate Success"
              value={deliveryRate === "—" ? "—" : `${deliveryRate}%`}
              icon={CheckCircle2}
              subtext="Consolidated gateway receipt rate"
            />
            <StatCard
              title="Open / Click-Through"
              value={ctr === "—" ? "—" : `${ctr}% CTR`}
              icon={Zap}
              subtext="Clicked links per delivered message"
            />
            <StatCard
              title="Voucher Revenue"
              value={`₹${totalRevenue.toLocaleString()}`}
              icon={Tag}
              accent={true}
              subtext="Coupon-driven conversions"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Channel Gateway Performance bar charts */}
            <AdminCard
              title="Delivery Gateway Funnel by Channel"
              subtitle="Campaign stats split evenly across the channels each campaign targets"
            >
              <div className="h-80 w-full font-sans text-xs mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={channelPerf}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                    <XAxis dataKey="name" stroke="#A3A3A3" fontSize={11} tickLine={false} />
                    <YAxis stroke="#A3A3A3" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "16px",
                        border: "1px solid #EAEAEA",
                      }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Bar dataKey="Dispatched" fill="#A3A3A3" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Delivered" fill="#0E4825" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Clicked" fill="#FF6600" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>

            {/* Coupon Redemptions and Revenue generated */}
            <AdminCard
              title="Campaign Revenue by Launch Date"
              subtitle="Real voucher revenue from campaign records, bucketed by launch date"
            >
              <div className="h-80 w-full font-sans text-xs mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={campaignRevenueTrend}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorMktSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF6600" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#FF6600" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                    <XAxis dataKey="date" stroke="#A3A3A3" fontSize={11} tickLine={false} />
                    <YAxis stroke="#A3A3A3" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "16px",
                        border: "1px solid #EAEAEA",
                      }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Campaign Revenue (₹)"
                      stroke="#FF6600"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorMktSales)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>
          </div>
        </div>
      )}
    </div>
  );
};
