import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCw,
  Activity,
  Server,
  ShieldCheck,
  Timer,
  Wifi,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { StatusBadge } from "../components/Badges";
import { useAdmin } from "../hooks/useAdmin";
import { toast } from "sonner";
import { adminPaymentsService } from "../services/adminPaymentsService";
import { partnerFunctionsApi } from "@/services/partnerFunctionsApi";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export const AdminPaymentHealthPage: React.FC = () => {
  const { role } = useAdmin();

  // Health parameters state
  const [circuitBreakerState, setCircuitBreakerState] = useState<
    "CLOSED" | "OPEN" | "HALF_OPEN" | "UNKNOWN"
  >("UNKNOWN");
  const [retryQueueCount, setRetryQueueCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiPing, setApiPing] = useState<number | null>(null);
  const [discrepancies, setDiscrepancies] = useState<any[]>([]);
  // Real probe history — appended on each successful Run Probe Check.
  const [latencyHistory, setLatencyHistory] = useState<{ time: string; razorpay: number }[]>([]);

  // RBAC checks
  const canModifyInfrastructure = role === "Developer" || role === "Finance";

  useEffect(() => {
    const unsubscribe = adminPaymentsService.listenLiveDiscrepancies(
      (data) => {
        setDiscrepancies(data);
        setRetryQueueCount(data.filter((d) => d.status === "UNRESOLVED").length);
      },
      (err) => console.error("Discrepancy listener error", err),
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Actions
  // Loop 24/120: measures the REAL API liveness endpoint. The old version
  // fabricated latency (210 + random*40) after a timer — a health page that
  // cries healthy during an outage is worse than none.
  const handleRunProbes = async () => {
    setIsRefreshing(true);
    toast.loading("Probing the Burgonomics API...");
    try {
      const res = await partnerFunctionsApi.checkApiHealth();
      const latency = Math.round(res.latencyMs);
      setApiPing(latency);
      setLatencyHistory((prev) => [
        ...prev.slice(-23),
        {
          time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
          razorpay: latency,
        },
      ]);
      toast.dismiss();
      if (res.ok) {
        toast.success("API responding normally.", {
          description: `Measured latency: ${Math.round(res.latencyMs)}ms${res.service ? ` · ${res.service}` : ""}`,
        });
      } else {
        toast.error("API answered but reported unhealthy — investigate before lunch rush.");
      }
    } catch (err) {
      toast.dismiss();
      toast.error("API unreachable — no health signal.", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Loop 24/120 honesty: there is no resolve-all endpoint — the old version
  // zeroed the counter and declared victory while live rows stayed UNRESOLVED
  // (the listener would even restore the count on next snapshot). This now
  // re-reports the live count with resolution directions.
  const handleClearRetryQueue = () => {
    if (!canModifyInfrastructure) {
      toast.error("Access Denied: Your administrative role is unauthorized to clear queues.");
      return;
    }

    if (retryQueueCount === 0) {
      toast.success("Retry queue already empty — nothing to resolve.");
      return;
    }
    toast.warning(`Re-checked: ${retryQueueCount} unresolved discrepanc${retryQueueCount === 1 ? "y" : "ies"} remain.`, {
      description: "Resolve each via Refunds (payout) or support Tickets — there is no bulk-resolve yet.",
    });
  };

  return (
    <div className="space-y-6 font-sans text-xs">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageHeader
          title="Gateway Health & Telemetry Center"
          description="Real-time monitoring console for API latency, BullMQ retry queues, webhook response delivery, secure SSL handshakes, and circuit breaker status thresholds."
          breadcrumbs={[{ label: "Payment Health Core" }]}
        />

        <div className="flex gap-2 self-start md:self-center">
          <AdminButton
            variant="outline"
            size="sm"
            onClick={handleRunProbes}
            isLoading={isRefreshing}
          >
            <RefreshCw size={13} className={`mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Run Probe Check</span>
          </AdminButton>
        </div>
      </div>

      {/* 4 Health KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Circuit Breaker */}
        <AdminCard className="relative overflow-hidden">
          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
            GATEWAY INTEGRATION CIRCUIT
          </span>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                circuitBreakerState === "CLOSED"
                  ? "bg-emerald-500 animate-pulse"
                  : circuitBreakerState === "HALF_OPEN"
                    ? "bg-amber-500"
                    : circuitBreakerState === "OPEN"
                      ? "bg-red-500 animate-ping"
                      : "bg-gray-400"
              }`}
            />
            <span className="text-xl font-black font-mono tracking-tight text-gray-900 dark:text-white uppercase">
              {circuitBreakerState}
            </span>
          </div>
          <span className="block text-[10px] text-gray-400 font-mono mt-2">
            No live circuit-breaker telemetry yet
          </span>
        </AdminCard>

        {/* Latency */}
        <AdminCard className="relative overflow-hidden">
          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
            API PING ROUND-TRIP
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 dark:text-white mt-1">
            {apiPing === null ? "—" : `${apiPing}ms`}
          </span>
          <div className="flex items-center gap-1 text-[10px] text-gray-500 font-bold mt-1">
            <Wifi size={10} />
            <span>{apiPing === null ? "No probe run yet" : `Last measured: ${apiPing}ms`}</span>
          </div>
        </AdminCard>

        {/* Webhook latency */}
        <AdminCard className="relative overflow-hidden">
          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
            WEBHOOK DISPATCH TIME
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 dark:text-white mt-1">
            —
          </span>
          <span className="block text-[10px] text-gray-400 font-mono mt-1">
            No webhook telemetry yet
          </span>
        </AdminCard>

        {/* BullMQ worker queue */}
        <AdminCard className="relative overflow-hidden">
          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
            BULLMQ RETRY QUEUE
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 dark:text-white mt-1">
            {retryQueueCount} items
          </span>
          <span className="block text-[10px] text-gray-400 font-mono mt-1">
            Failed webhooks awaiting retry loop
          </span>
        </AdminCard>
      </div>

      {/* Telemetry Charts & Infrastructure Diagnosis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latency Chart (occupies 2/3) */}
        <div className="lg:col-span-2 space-y-6">
          <AdminCard
            title="Gateway API Latency Diagnostics"
            subtitle="Real round-trip latency measured by probe checks"
          >
            {latencyHistory.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-400 font-sans text-xs">
                No latency history yet — run a probe check to start building the trend.
              </div>
            ) : (
            <div className="h-64 font-mono text-[10px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={latencyHistory}
                  margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0E4825" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0E4825" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="time" stroke="#999" fontSize={8} />
                  <YAxis stroke="#999" fontSize={8} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1A1A1A",
                      border: "none",
                      borderRadius: "12px",
                      color: "#fff",
                      fontSize: "10px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="razorpay"
                    stroke="#0E4825"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorLatency)"
                    name="API ping (ms)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            )}
          </AdminCard>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <AdminCard title="BullMQ Workers Status" icon={Server}>
              <div className="space-y-3 font-sans text-xs">
                <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span className="font-bold text-gray-500">Redis Broker Cluster</span>
                  <span className="text-gray-500 font-bold uppercase font-mono text-[10px]">
                    Configured
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span className="font-bold text-gray-500">Concurrency Threads</span>
                  <span className="text-gray-800 dark:text-gray-200 font-mono font-bold">
                    5 workers configured
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800/40 pb-2">
                  <span className="font-bold text-gray-500">Failed Webhook Retry</span>
                  <span className="text-gray-800 dark:text-gray-200 font-mono">
                    Exponential Backoff (3 max)
                  </span>
                </div>

                {retryQueueCount > 0 && (
                  <div className="pt-2">
                    <button
                      onClick={handleClearRetryQueue}
                      className="w-full text-center py-2 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/15 dark:text-red-400 font-black uppercase tracking-wider text-[9px] rounded-lg transition-all cursor-pointer"
                    >
                      Force Clear Retry Queue
                    </button>
                  </div>
                )}
              </div>
            </AdminCard>

            <AdminCard title="Error Rates Diagnostic" icon={Activity}>
              <div className="h-40 flex items-center justify-center text-gray-400 font-sans text-xs">
                No error-rate telemetry yet — will appear once the monitoring pipeline reports.
              </div>
            </AdminCard>
          </div>
        </div>

        {/* Security SSL & Webhook Secrets (occupies 1/3) */}
        <div className="space-y-6">
          <AdminCard title="Security & Integrity Audits" icon={ShieldCheck}>
            <div className="space-y-4 font-sans text-xs leading-normal text-gray-500">
              <div>
                <span className="block text-[9px] font-black text-gray-400 uppercase tracking-wider font-mono">
                  SHA256 Webhook Signature Secrets
                </span>
                <div className="flex items-center gap-1.5 mt-1 text-gray-600 font-bold">
                  <ShieldCheck size={14} />
                  <span>CONFIGURED</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1 leading-normal">
                  Webhook signature verification is configured for Razorpay endpoints. Live
                  verification status is reported by the gateway.
                </p>
              </div>

              <div>
                <span className="block text-[9px] font-black text-gray-400 uppercase tracking-wider font-mono">
                  SSL / TLS Configuration
                </span>
                <div className="flex items-center gap-1.5 mt-1 text-gray-600 font-bold">
                  <ShieldCheck size={14} />
                  <span>TLS 1.3 CONFIGURED</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1 leading-normal">
                  HTTPS is enforced by the hosting platform; TLS version negotiation is managed by
                  the edge configuration.
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl space-y-1 text-[10px]">
                <span className="font-extrabold text-gray-800 dark:text-gray-200 block">
                  Security Telemetry Snapshot
                </span>
                <div className="font-mono text-gray-400 text-[9px] space-y-0.5 mt-1">
                  <div>SSL Expiry: not monitored from this console</div>
                  <div>IP Access list: managed by platform firewall</div>
                  <div>Auth Protocol: Firebase Identity Token (RSA-256)</div>
                </div>
              </div>
            </div>
          </AdminCard>

          <AdminCard title="Reconciliation Automation Status" icon={Timer}>
            <div className="space-y-3 font-sans text-xs text-gray-500 leading-normal">
              <div>
                <span className="block text-[9px] font-black text-gray-400 uppercase tracking-wider font-mono">
                  CRON RECONCILIATION TASK
                </span>
                <span className="font-extrabold text-gray-800 dark:text-gray-200 block mt-1">
                  Hourly Ledger Verification Sweep
                </span>
                <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">
                  Trigger: Cron (* /60 * * * *)
                </span>
              </div>
              <p className="text-[10px] leading-relaxed">
                Automated scheduler triggers a comparative sync sweep every hour, fetching Razorpay
                captured payments from the previous hour, and matching with the postgres database
                transaction entries. Discrepancies are automatically compiled and flagged.
              </p>
              <div className="flex justify-between font-mono text-[9px] text-gray-400 border-t border-gray-50 dark:border-gray-800/40 pt-2.5">
                <span>Last executed: no run recorded yet</span>
                <span className="text-gray-400 font-sans">Awaiting first scheduled run</span>
              </div>
            </div>
          </AdminCard>
        </div>
      </div>
    </div>
  );
};
export default AdminPaymentHealthPage;
