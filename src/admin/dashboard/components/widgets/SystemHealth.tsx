import React, { useState, useEffect } from "react";
import { useSystemHealth } from "../../hooks/useDashboardData";
import type { SystemHealthResponse } from "../../types";
import {
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Server,
  Database,
  Zap,
  Cpu,
  HardDrive,
} from "lucide-react";

/**
 * P0-5 standby guard: telemetry is "live" only when the backend reported at
 * least one key. Test key COUNT, not presence — `!!{}` is truthy, so an empty
 * `details: {}` / `info: {}` object would defeat a truthiness guard
 * (`!!(health?.details ?? health?.info)`) and render fabricated numbers as if
 * they were measured.
 */
export function hasLiveTelemetry(
  resp?: Pick<SystemHealthResponse, "info" | "details">,
): boolean {
  return (
    Object.keys(resp?.details ?? {}).length > 0 ||
    Object.keys(resp?.info ?? {}).length > 0
  );
}

export const SystemHealth: React.FC = () => {
  const { data: health, isLoading, isError, refetch } = useSystemHealth();

  // Uptime base is DERIVED from the reported payload only — there is no
  // hardcoded fallback number, so no uptime is ever fabricated (P0-5).
  const reportedUptime = (health as any)?.info?.uptime ?? (health as any)?.uptime;
  const uptimeKnown = typeof reportedUptime === "number" && Number.isFinite(reportedUptime);

  const [uptimeSeconds, setUptimeSeconds] = useState<number>(0);

  // Seed the ticker with the real reported value and tick once per second —
  // but ONLY while a reported numeric base exists (`if (!uptimeKnown) return;`).
  // This effect must stay above the early return below (rules of hooks): the
  // conditional render must never change the hook count between renders.
  useEffect(() => {
    if (!uptimeKnown) return;
    setUptimeSeconds(reportedUptime);
    const timer = setInterval(() => {
      setUptimeSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
    // Dep is known-ness: the effect re-seeds whenever uptime transitions
    // from not-reported to reported.
  }, [uptimeKnown]);

  // No live telemetry at all (no backend probes yet): show an honest
  // standby card instead of rendering default "up" statuses and fabricated
  // metric numbers as if they were measured.
  const liveTelemetry = hasLiveTelemetry(health);
  if (!liveTelemetry) {
    return (
      <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-3 h-full">
        <div className="flex justify-between items-center">
          <span className="font-bold text-sm text-gray-900 dark:text-white uppercase font-sans">
            Core Cluster Health
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black border bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-800">
            STANDBY
          </span>
        </div>
        <p className="text-xs font-semibold text-gray-400">
          Live server metrics are not connected. Connect the monitoring backend
          to populate this panel — nothing below is measured until then.
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 text-xs font-bold transition-all cursor-pointer"
        >
          Check Again
        </button>
      </div>
    );
  }

  // Parse health details — unknown (not "up") when the backend omits a field.
  const dbStatus = health?.details?.database?.status || health?.info?.database?.status || "unknown";
  const dbLatency = health?.details?.database?.latency ?? health?.info?.database?.latency ?? null;

  const redisStatus = health?.details?.redis?.status || health?.info?.redis?.status || "unknown";
  const redisLatency = health?.details?.redis?.latency ?? health?.info?.redis?.latency ?? null;

  const queueStatus = (health as any)?.details?.queue?.status || (health as any)?.info?.queue?.status || "unknown";

  const petpoojaApiStatus =
    health?.details?.petpooja?.status || health?.info?.petpooja?.status || "unknown";
  const razorpayApiStatus =
    health?.details?.razorpay?.status || health?.info?.razorpay?.status || "unknown";
  const firebaseApiStatus =
    health?.details?.firebase?.status || health?.info?.firebase?.status || "unknown";

  // Memory & Disk — no numeric fallbacks: a metric we were never given
  // renders as "—", never as an invented constant (P0-5 / ban-list B4).
  const ramUsedBytes = (health as any)?.details?.process?.memory?.heapUsed ?? null;
  const ramLimitBytes = (health as any)?.details?.process?.memory?.heapLimit ?? null;
  const ramPct =
    ramUsedBytes != null && ramLimitBytes
      ? Math.min(100, Math.round((ramUsedBytes / ramLimitBytes) * 100))
      : null;

  const diskUsedBytes = (health as any)?.details?.disk?.used ?? null;
  const diskLimitBytes = (health as any)?.details?.disk?.limit ?? null;
  const diskPct =
    diskUsedBytes != null && diskLimitBytes
      ? Math.min(100, Math.round((diskUsedBytes / diskLimitBytes) * 100))
      : null;

  const formatUptime = (totalSeconds: number) => {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  };

  if (isLoading) {
    return (
      <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4 animate-pulse">
        <div className="h-5 w-40 bg-gray-100 dark:bg-gray-800 rounded" />
        <div className="space-y-3">
          <div className="h-14 bg-gray-50 dark:bg-gray-900 rounded-2xl" />
          <div className="h-14 bg-gray-50 dark:bg-gray-900 rounded-2xl" />
          <div className="h-14 bg-gray-50 dark:bg-gray-900 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-[20px] border border-red-100 dark:border-red-950/20 bg-red-50/10 dark:bg-red-950/5 p-6 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-bold text-sm text-gray-900 dark:text-white uppercase font-sans">
            Core Cluster Health
          </span>
          <AlertTriangle size={18} className="text-red-500" />
        </div>
        <p className="text-xs font-semibold text-gray-400">
          Health check failed — no telemetry available.
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/15 text-red-600 dark:text-red-400 text-xs font-bold transition-all cursor-pointer"
        >
          Retry Diagnostic
        </button>
      </div>
    );
  }

  const overallStatus = health?.status === "ok" ? "HEALTHY" : "WARNING";

  return (
    <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-gray-50 dark:border-gray-800/50 mb-5">
          <div>
            <h4 className="text-sm font-black text-gray-900 dark:text-white font-sans uppercase">
              System Clusters & Health
            </h4>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
              Server-side telemetry reported by the monitoring backend
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
              overallStatus === "HEALTHY"
                ? "bg-emerald-50 text-emerald-600 border-emerald-200/40 dark:bg-emerald-950/20 dark:text-emerald-400"
                : "bg-orange-50 text-orange-600 border-orange-200/40 dark:bg-orange-950/20 dark:text-orange-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${overallStatus === "HEALTHY" ? "bg-[#10B981]" : "bg-accent"}`}
            />
            {overallStatus}
          </span>
        </div>

        {/* Telemetry rows */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {/* Databases */}
          <div className="p-3 rounded-xl border border-gray-50 dark:border-gray-900 bg-gray-50/20 dark:bg-[#1E1E1E]/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="text-gray-400">
                <Database size={15} />
              </div>
              <div>
                <span className="block text-[10px] font-bold text-gray-500 uppercase">
                  PostgreSQL Database
                </span>
                <span className="block text-[9px] font-mono text-gray-400">
                  Latency {dbLatency == null ? "—" : `${dbLatency}ms`}
                </span>
              </div>
            </div>
            <span
              className={`text-[10px] font-black uppercase ${dbStatus === "up" ? "text-emerald-500" : dbStatus === "unknown" ? "text-gray-400" : "text-red-500"}`}
            >
              ● {dbStatus === "up" ? "Online" : dbStatus === "unknown" ? "Unknown" : "Offline"}
            </span>
          </div>

          <div className="p-3 rounded-xl border border-gray-50 dark:border-gray-900 bg-gray-50/20 dark:bg-[#1E1E1E]/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="text-gray-400">
                <Cpu size={15} />
              </div>
              <div>
                <span className="block text-[10px] font-bold text-gray-500 uppercase">
                  Redis Memory Cache
                </span>
                <span className="block text-[9px] font-mono text-gray-400">
                  Latency {redisLatency == null ? "—" : `${redisLatency}ms`}
                </span>
              </div>
            </div>
            <span
              className={`text-[10px] font-black uppercase ${redisStatus === "up" ? "text-emerald-500" : redisStatus === "unknown" ? "text-gray-400" : "text-red-500"}`}
            >
              ● {redisStatus === "up" ? "Online" : redisStatus === "unknown" ? "Unknown" : "Offline"}
            </span>
          </div>

          {/* Third Party API telemetry */}
          <div className="col-span-1 md:col-span-2 p-3 rounded-xl border border-gray-50 dark:border-gray-900 bg-gray-50/10 dark:bg-[#1E1E1E]/10 space-y-2.5">
            <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider">
              Gateway Integrations
            </span>
            <div className="grid grid-cols-3 gap-2 text-[10px] font-bold font-mono">
              <div className="flex items-center justify-between p-1.5 rounded bg-white dark:bg-gray-900 border border-gray-50 dark:border-gray-950">
                <span className="text-gray-400">Petpooja</span>
                <span className={petpoojaApiStatus === "up" ? "text-emerald-500" : petpoojaApiStatus === "unknown" ? "text-gray-400" : "text-red-500"}>
                  {petpoojaApiStatus === "up" ? "CONNECTED" : petpoojaApiStatus === "unknown" ? "UNKNOWN" : "FAIL"}
                </span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded bg-white dark:bg-gray-900 border border-gray-50 dark:border-gray-950">
                <span className="text-gray-400">Razorpay</span>
                <span className={razorpayApiStatus === "up" ? "text-emerald-500" : razorpayApiStatus === "unknown" ? "text-gray-400" : "text-red-500"}>
                  {razorpayApiStatus === "up" ? "CONNECTED" : razorpayApiStatus === "unknown" ? "UNKNOWN" : "FAIL"}
                </span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded bg-white dark:bg-gray-900 border border-gray-50 dark:border-gray-950">
                <span className="text-gray-400">Firebase</span>
                <span className={firebaseApiStatus === "up" ? "text-emerald-500" : firebaseApiStatus === "unknown" ? "text-gray-400" : "text-red-500"}>
                  {firebaseApiStatus === "up" ? "CONNECTED" : firebaseApiStatus === "unknown" ? "UNKNOWN" : "FAIL"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* System Limits progress bars */}
        <div className="space-y-3.5 mb-5 text-xs">
          {/* RAM */}
          <div>
            <div className="flex justify-between items-center mb-1 text-[10px] font-bold">
              <span className="text-gray-400 uppercase">Heap Memory Utilization</span>
              <span className="font-mono text-gray-700 dark:text-gray-300">
                {ramPct == null
                  ? "—"
                  : `${(ramUsedBytes! / 1024 / 1024).toFixed(0)}MB / ${(ramLimitBytes! / 1024 / 1024).toFixed(0)}MB (${ramPct}%)`}
              </span>
            </div>
            {/* Empty gray track when unknown — never a colored bar with a made-up figure */}
            <div className="w-full h-1.5 bg-gray-50 dark:bg-gray-900 rounded-full overflow-hidden">
              {ramPct != null && (
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    ramPct > 80 ? "bg-red-500" : ramPct > 50 ? "bg-accent" : "bg-primary"
                  }`}
                  style={{ width: `${ramPct}%` }}
                />
              )}
            </div>
          </div>

          {/* Disk */}
          <div>
            <div className="flex justify-between items-center mb-1 text-[10px] font-bold">
              <span className="text-gray-400 uppercase">Container Ephemeral Storage</span>
              <span className="font-mono text-gray-700 dark:text-gray-300">
                {diskPct == null
                  ? "—"
                  : `${(diskUsedBytes! / 1024 / 1024 / 1024).toFixed(1)}GB / ${(diskLimitBytes! / 1024 / 1024 / 1024).toFixed(1)}GB (${diskPct}%)`}
              </span>
            </div>
            {/* Empty gray track when unknown — never a colored bar with a made-up figure */}
            <div className="w-full h-1.5 bg-gray-50 dark:bg-gray-900 rounded-full overflow-hidden">
              {diskPct != null && (
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    diskPct > 85 ? "bg-red-500" : diskPct > 60 ? "bg-accent" : "bg-primary"
                  }`}
                  style={{ width: `${diskPct}%` }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Live uptime and manual refetch */}
      <div className="border-t border-gray-50/50 dark:border-gray-800/10 pt-4 flex items-center justify-between text-xs shrink-0">
        <div>
          <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-wider">
            Continuous Uptime
          </span>
          <span className="font-black font-mono text-gray-800 dark:text-gray-200">
            {uptimeKnown ? formatUptime(uptimeSeconds) : "—"}
          </span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-primary dark:hover:border-emerald-800 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all cursor-pointer"
        >
          <RefreshCw size={12} />
        </button>
      </div>
    </div>
  );
};
