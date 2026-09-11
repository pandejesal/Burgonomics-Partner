import React, { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import {
  Cpu,
  Database,
  Zap,
  Activity,
  CheckCircle,
  AlertTriangle,
  HardDrive,
  Users,
  RefreshCw,
} from "lucide-react";
import { partnerFunctionsApi } from "@/services/partnerFunctionsApi";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  status: "healthy" | "warning" | "critical" | "offline";
  subtext: string;
}

const MiniStatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, status, subtext }) => {
  const statusColor = {
    healthy: "text-emerald-400 bg-emerald-500/10 border-emerald-950",
    warning: "text-amber-400 bg-amber-500/10 border-amber-950",
    critical: "text-red-400 bg-red-500/10 border-red-950",
    offline: "text-gray-400 bg-gray-500/10 border-gray-950",
  }[status];

  return (
    <div
      className={`p-5 rounded-[20px] bg-[#0c130e] border ${statusColor} shadow-lg transition-all hover:scale-[1.02]`}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 font-mono">
          {title}
        </span>
        <div className="p-1.5 rounded-lg bg-black/40">
          <Icon size={16} />
        </div>
      </div>
      <div className="mt-3">
        <span className="text-xl font-bold font-mono tracking-tight text-white">{value}</span>
        <span className="block text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-wider">
          {subtext}
        </span>
      </div>
    </div>
  );
};

export const SystemDashboardTab: React.FC = () => {
  const [cpuVal, setCpuVal] = useState(24);
  const [memVal, setMemVal] = useState(48.5);
  const [activeUsers, setActiveUsers] = useState(115);
  // Loop 30/120: latency is MEASURED (null = no successful probe yet), never
  // the old random walk.
  const [respTime, setRespTime] = useState<number | null>(null);
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Terminus dynamic health status states — Loop 30/120: no live per-service
  // probes exist (the old fetch hit a nonexistent endpoint and left everything
  // stuck "healthy"). Unmonitored until real probes land; never claim knowledge.
  type ServiceStatus = "healthy" | "critical" | "warning" | "unmonitored";
  const [dbStatus, setDbStatus] = useState<ServiceStatus>("unmonitored");
  const [redisStatus, setRedisStatus] = useState<ServiceStatus>("unmonitored");
  const [petpoojaStatus, setPetpoojaStatus] = useState<ServiceStatus>("unmonitored");
  const [razorpayStatus, setRazorpayStatus] = useState<ServiceStatus>("unmonitored");
  // firebaseStatus folded into apiReachable (Firebase row derives from probe).

  const fetchHealthCheck = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await partnerFunctionsApi.checkApiHealth();
      setApiReachable(res.ok);
      if (res.ok) setRespTime(Math.round(res.latencyMs));
    } catch (err) {
      setApiReachable(false);
      console.error("API liveness probe failed", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealthCheck();
    const interval = setInterval(fetchHealthCheck, 30000); // refresh system health every 30s
    return () => clearInterval(interval);
  }, [fetchHealthCheck]);

  // Bouncing hardware simulator
  useEffect(() => {
    const interval = setInterval(() => {
      setCpuVal((prev) => Math.min(99, Math.max(10, prev + Math.floor(Math.random() * 7) - 3)));
      setMemVal((prev) => {
        const next = Math.min(95, Math.max(40, prev + Math.random() * 0.8 - 0.4));
        return Math.round(next * 10) / 10;
      });
      setActiveUsers((prev) => Math.max(90, prev + Math.floor(Math.random() * 3) - 1));
      // Loop 30/120: latency is measured by the probe, not simulated.
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "healthy":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Healthy</span>
          </span>
        );
      case "warning":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span>Warning</span>
          </span>
        );
      case "critical":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping" />
            <span>Critical</span>
          </span>
        );
      case "unmonitored":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-500/10 text-gray-400 border border-gray-500/20 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
            <span>Unmonitored</span>
          </span>
        );
    }
  };

  // Loop 30/120: per-service numbers below were fiction ("Latency: 2.1ms",
  // "Hit Ratio: 98.2%") on an endpoint that never existed. Unmonitored rows
  // say so until real probes land.
  const healthChecks = [
    {
      name: "Database Cluster",
      status: dbStatus,
      value: "Firestore (live reads)",
      details: "No dedicated probe wired — Firestore reads succeed across the app.",
    },
    {
      name: "Redis Memory Cache",
      status: redisStatus,
      value: "No cache layer deployed",
      details: "No Redis in this stack — nothing to monitor.",
    },
    {
      name: "Petpooja POS Bridge",
      status: petpoojaStatus,
      value: "POS Sync Gateway Node",
      details:
        petpoojaStatus === "unmonitored"
          ? "No live probe wired — see Petpooja sync logs for sync truth."
          : "Scraper endpoints slow or circuit-breaker open",
    },
    {
      name: "Razorpay Checkout Gateway",
      status: razorpayStatus,
      value: "Automated Checkout Ledger",
      details:
        razorpayStatus === "unmonitored"
          ? "No live probe wired — see payment webhooks + audits for truth."
          : "Razorpay API handshake failure",
    },
    {
      name: "Firebase Service Suite",
      status: apiReachable === null ? "unmonitored" : apiReachable ? "healthy" : "critical",
      value: "Auth + Firestore + FCM",
      details:
        apiReachable === null
          ? "API liveness probe has not run yet."
          : apiReachable
            ? "API reachable — Firebase services responding via live reads."
            : "API UNREACHABLE — check connectivity and Functions deployment.",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Stat Block */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MiniStatCard
          title="CPU Core Load"
          value={`${cpuVal}%`}
          icon={Cpu}
          status={cpuVal > 85 ? "critical" : cpuVal > 65 ? "warning" : "healthy"}
          subtext="Simulated demo animation"
        />
        <MiniStatCard
          title="Server RAM Buffer"
          value={`${memVal}%`}
          icon={HardDrive}
          status="healthy"
          subtext="Simulated demo animation"
        />
        <MiniStatCard
          title="Active Sessions"
          value={activeUsers}
          icon={Users}
          status="healthy"
          subtext="Simulated demo animation"
        />
        <MiniStatCard
          title="Avg API Response Time"
          value={respTime === null ? "—" : `${respTime}ms`}
          icon={Activity}
          status={respTime !== null && respTime > 300 ? "warning" : "healthy"}
          subtext={respTime === null ? "No successful probe yet" : "Measured API probe"}
        />
      </div>

      {/* Live System Health Dashboard */}
      <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div>
            <h3 className="text-base font-black tracking-tight text-white font-mono">
              SYSTEM HEALTH REGISTRIES
            </h3>
            <p className="text-xs text-gray-400 uppercase tracking-widest mt-1 font-bold">
              API liveness probe every 30 seconds · per-service probes pending
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={fetchHealthCheck}
              className="p-1.5 rounded bg-black border border-gray-800 text-gray-400 hover:text-white flex items-center gap-1.5 text-xs font-mono"
            >
              <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
              <span>Force Poll</span>
            </button>
            <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 font-mono">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Telemetries active</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {healthChecks.map((item, index) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="p-4 rounded-xl bg-black/40 border border-gray-900/60 flex flex-col justify-between space-y-3 hover:border-gray-800 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="block text-xs font-bold text-white tracking-tight leading-none">
                    {item.name}
                  </span>
                  <span className="block text-[10px] text-gray-500 mt-1 font-mono">
                    {item.value}
                  </span>
                </div>
                {getStatusBadge(item.status)}
              </div>
              <p className="text-[10px] text-gray-400 font-mono leading-relaxed bg-[#050906] p-2 rounded-lg border border-emerald-950/20">
                {item.details}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
