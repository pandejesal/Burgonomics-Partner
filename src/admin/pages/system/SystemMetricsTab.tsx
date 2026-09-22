import React, { useState } from "react";
import { Clock, Activity, Database } from "lucide-react";

export const SystemMetricsTab: React.FC = () => {
  const [metricView, setMetricView] = useState<"http" | "infrastructure" | "integration">("http");

  return (
    <div className="space-y-6">
      {/* Category Toggles */}
      <div className="flex items-center gap-2 bg-[#0c130e] border border-gray-800 p-1.5 rounded-xl self-start w-fit">
        <button
          onClick={() => setMetricView("http")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            metricView === "http"
              ? "bg-primary text-white shadow"
              : "text-gray-400 hover:text-white"
          }`}
        >
          API & HTTP Engine
        </button>
        <button
          onClick={() => setMetricView("infrastructure")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            metricView === "infrastructure"
              ? "bg-primary text-white shadow"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Durable Infrastructure
        </button>
        <button
          onClick={() => setMetricView("integration")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            metricView === "integration"
              ? "bg-primary text-white shadow"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Integration Queues
        </button>
      </div>

      {/* Grid of Prometheus Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {metricView === "http" && (
          <>
            <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
              <div>
                <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
                  HTTP Request Volume
                </span>
                <span className="block text-[10px] text-gray-500 font-mono uppercase mt-0.5">
                  Prometheus: http_requests_total [1h rate]
                </span>
              </div>
              <div className="h-[240px] flex items-center justify-center text-gray-500 font-mono text-[10px]">
                No live telemetry yet — wire Prometheus scraping to populate this chart.
              </div>
            </div>

            <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
              <div>
                <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
                  HTTP Round-Trip Latency (ms)
                </span>
                <span className="block text-[10px] text-gray-500 font-mono uppercase mt-0.5">
                  Prometheus: http_request_duration_seconds [p95 quantile]
                </span>
              </div>
              <div className="h-[240px] flex items-center justify-center text-gray-500 font-mono text-[10px]">
                No live telemetry yet — wire Prometheus scraping to populate this chart.
              </div>
            </div>
          </>
        )}

        {metricView === "infrastructure" && (
          <>
            <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
              <div>
                <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
                  Database Query Load
                </span>
                <span className="block text-[10px] text-gray-500 font-mono uppercase mt-0.5">
                  Prometheus: pg_stat_statements_calls_total [sum]
                </span>
              </div>
              <div className="h-[240px] flex items-center justify-center text-gray-500 font-mono text-[10px]">
                No live telemetry yet — wire Prometheus scraping to populate this chart.
              </div>
            </div>

            <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
              <div>
                <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
                  Redis Key Storage & Hits
                </span>
                <span className="block text-[10px] text-gray-500 font-mono uppercase mt-0.5">
                  Prometheus: redis_hit_ratio_percent [gauge]
                </span>
              </div>
              <div className="h-[240px] flex items-center justify-center text-gray-500 font-mono text-[10px]">
                No live telemetry yet — wire Prometheus scraping to populate this chart.
              </div>
            </div>
          </>
        )}

        {metricView === "integration" && (
          <>
            <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
              <div>
                <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
                  Async Queue Processing Volume
                </span>
                <span className="block text-[10px] text-gray-500 font-mono uppercase mt-0.5">
                  Prometheus: queue_processed_jobs_total [1h rate]
                </span>
              </div>
              <div className="h-[240px] flex items-center justify-center text-gray-500 font-mono text-[10px]">
                No live telemetry yet — wire Prometheus scraping to populate this chart.
              </div>
            </div>

            <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
              <div>
                <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
                  Server VM CPU & Memory Allocation
                </span>
                <span className="block text-[10px] text-gray-500 font-mono uppercase mt-0.5">
                  Prometheus: node_cpu_seconds_total / node_memory_MemTotal
                </span>
              </div>
              <div className="h-[240px] flex items-center justify-center text-gray-500 font-mono text-[10px]">
                No live telemetry yet — wire Prometheus scraping to populate this chart.
              </div>
            </div>
          </>
        )}
      </div>

      {/* Profiler panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Slowest API Endpoints */}
        <div className="p-5 rounded-[20px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-lg">
          <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-gray-800 pb-2">
            <Clock size={16} className="text-amber-500" />
            <span className="font-mono text-xs uppercase tracking-wider">Slowest REST APIs</span>
          </div>
          <p className="text-xs text-gray-500 font-mono">
            No profiler data yet — slow-API telemetry will appear once the monitoring pipeline reports.
          </p>
        </div>

        {/* Slow Database Queries */}
        <div className="p-5 rounded-[20px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-lg">
          <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-gray-800 pb-2">
            <Database size={16} className="text-emerald-500" />
            <span className="font-mono text-xs uppercase tracking-wider">
              Slow PostgreSQL Queries
            </span>
          </div>
          <p className="text-xs text-gray-500 font-mono">
            No profiler data yet — slow-query telemetry will appear once the monitoring pipeline reports.
          </p>
        </div>

        {/* Largest REST Responses */}
        <div className="p-5 rounded-[20px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-lg">
          <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-gray-800 pb-2">
            <Server size={16} className="text-blue-500" />
            <span className="font-mono text-xs uppercase tracking-wider">
              Largest Payload Sizes
            </span>
          </div>
          <p className="text-xs text-gray-500 font-mono">
            No profiler data yet — payload-size telemetry will appear once the monitoring pipeline reports.
          </p>
        </div>
      </div>
    </div>
  );
};
