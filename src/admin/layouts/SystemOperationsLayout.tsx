import React, { useState, useEffect } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Activity,
  BarChart3,
  Terminal,
  Boxes,
  Database,
  Server,
  Network,
  ToggleLeft,
  ShieldAlert,
  Clock,
  Settings,
  Shield,
} from "lucide-react";
import { appConfig } from "@/core/config/env";

interface SystemOperationsLayoutProps {
  children?: React.ReactNode;
}

export const SystemOperationsLayout: React.FC<SystemOperationsLayoutProps> = ({ children }) => {
  const location = useLocation();

  // Auto-refresh control (10 seconds as requested)
  const [refreshCountdown, setRefreshCountdown] = useState(10);
  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          // Reset the auto-refresh countdown (display only — no telemetry ping is fired)
          return 10;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const allSystemTabs = [
    { label: "Dashboard", to: "/admin/system", icon: LayoutDashboard },
    { label: "Live Health", to: "/admin/system/health", icon: Activity },
    { label: "Metrics & Charts", to: "/admin/system/metrics", icon: BarChart3 },
    { label: "Queue Manager", to: "/admin/system/queues", icon: Boxes, requiresOps: true },
    { label: "Redis Explorer", to: "/admin/system/redis", icon: Database, requiresOps: true },
    { label: "Database Core", to: "/admin/system/database", icon: Server, requiresOps: true },
    { label: "API Explorer", to: "/admin/system/apis", icon: Network, requiresOps: true },
    { label: "Realtime Logs", to: "/admin/system/logs", icon: Terminal, requiresOps: true },
    { label: "Audits & Events", to: "/admin/system/audit", icon: ShieldAlert, requiresOps: true },
    {
      label: "Feature Flags",
      to: "/admin/system/feature-flags",
      icon: ToggleLeft,
      requiresOps: true,
    },
    { label: "Cron Jobs", to: "/admin/system/jobs", icon: Clock, requiresOps: true },
    { label: "Security Center", to: "/admin/system/security", icon: Shield },
    { label: "System Config", to: "/admin/system/settings", icon: Settings },
  ];

  const systemTabs = allSystemTabs.filter(
    (tab) => !tab.requiresOps || appConfig.featureFlags.adminOps,
  );

  const currentTab = systemTabs.find((t) => location.pathname === t.to) || systemTabs[0];

  return (
    <div className="flex flex-col h-full bg-[#0a0f0c] dark text-gray-200 font-sans selection:bg-accent/30 rounded-[20px] overflow-hidden border border-gray-800 shadow-2xl relative">
      {/* Upper Status HUD Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 bg-[#0f1712] px-6 py-4 shrink-0 gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-[#1b5e34] text-emerald-400 border border-emerald-800 shadow-[0_0_20px_rgba(14,72,37,0.3)] animate-pulse">
            <Activity size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black uppercase tracking-widest text-emerald-400 font-mono">
                DEVELOPER MISSION CONTROL
              </h2>
              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                PROD-A
              </span>
            </div>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5 font-bold">
              Central Operating System • Burgonomics Core Node
            </p>
          </div>
        </div>

        {/* Global Auto-Refresh Indicator & Action Suite */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2 bg-[#121c15] border border-emerald-950 rounded-xl px-3.5 py-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-gray-300 font-bold">SYNC IN {refreshCountdown}s</span>
          </div>

        </div>
      </div>

      {/* Main Core Dashboard Framework */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sub-Navigation Sidebar */}
        <div className="w-[240px] shrink-0 border-r border-gray-800 bg-[#070b08] hidden lg:flex flex-col p-4 space-y-1">
          <div className="text-[10px] font-black tracking-widest text-gray-500 uppercase px-3 py-2 font-mono">
            Sub-Systems
          </div>
          <nav className="flex-1 overflow-y-auto space-y-0.5 pr-2 custom-scrollbar">
            {systemTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = location.pathname === tab.to;
              return (
                <Link
                  key={tab.to}
                  to={tab.to as any}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${
                    isActive
                      ? "bg-primary text-white border border-emerald-700/50 shadow-[0_4px_12px_rgba(14,72,37,0.3)] font-black"
                      : "text-gray-400 hover:text-white hover:bg-gray-800/40"
                  }`}
                >
                  <Icon
                    size={15}
                    className={
                      isActive ? "text-emerald-400" : "text-gray-500 group-hover:text-emerald-400"
                    }
                  />
                  <span className="truncate">{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Dynamic Telemetry Workspace Container */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0f0c]">
          {/* Mobile sub-system selector scroll-bar */}
          <div className="lg:hidden flex items-center gap-1 overflow-x-auto border-b border-gray-800 p-2 shrink-0 bg-[#070b08] no-scrollbar">
            {systemTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = location.pathname === tab.to;
              return (
                <Link
                  key={tab.to}
                  to={tab.to as any}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0 transition-all ${
                    isActive
                      ? "bg-primary text-white border border-emerald-800"
                      : "text-gray-400 bg-gray-900/40 hover:text-white"
                  }`}
                >
                  <Icon size={12} />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar">
            {children ?? <Outlet />}
          </div>
        </div>

      </div>
    </div>
  );
};
