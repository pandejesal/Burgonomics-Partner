import React, { useState, useEffect, useRef } from "react";
import { Terminal, Search, Download, Play, Pause, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";

interface SystemLog {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "CRITICAL";
  subsystem: "AUTH" | "STORE" | "PAYMENT" | "QUEUE" | "WEBHOOK" | "PETPOOJA";
  message: string;
}

const INITIAL_LOGS: SystemLog[] = [
  {
    timestamp: "10:04:12",
    level: "INFO",
    subsystem: "PETPOOJA",
    message: "Initialized full catalog synchronization process for Store node: connaught_place",
  },
  {
    timestamp: "10:04:13",
    level: "INFO",
    subsystem: "WEBHOOK",
    message: "Pulled raw JSON manifest from Petpooja POS bridge (1.42 MB, HTTP 200)",
  },
  {
    timestamp: "10:04:15",
    level: "INFO",
    subsystem: "PETPOOJA",
    message: "Synthesized and validated 124 menu items, 15 sub-categories, 12 add-on groups",
  },
  {
    timestamp: "10:04:16",
    level: "INFO",
    subsystem: "QUEUE",
    message: "Executed transactional database mutations: 2 created, 114 updated, 0 removed",
  },
  {
    timestamp: "10:04:16",
    level: "INFO",
    subsystem: "STORE",
    message: "Cleaned Redis page cached collections for menu grids",
  },
  {
    timestamp: "10:04:16",
    level: "INFO",
    subsystem: "PETPOOJA",
    message: "Job completed successfully in 4120ms. Transmitting webhook confirmation.",
  },
];

export const SystemLogsTab: React.FC = () => {
  // Loop: the seed + 4s streaming interval fabricate log lines (wrong
  // business facts included — Delhi/Gurgaon stores, fake refunds) with
  // ERROR/CRITICAL levels staff could chase. DEV-only: both the seed and the
  // interval are gated on import.meta.env.DEV, and the rendered notice at the
  // top of the tab (and the DEV-only streaming control) declares the
  // simulation so no fabricated line is ever read as a server event.
  const [logs, setLogs] = useState<SystemLog[]>(import.meta.env.DEV ? INITIAL_LOGS : []);
  const [isStreaming, setIsStreaming] = useState(true);
  const [logLevelFilter, setLogLevelFilter] = useState<
    "ALL" | "INFO" | "WARN" | "ERROR" | "CRITICAL"
  >("ALL");
  const [subsystemFilter, setSubsystemFilter] = useState<
    "ALL" | "AUTH" | "STORE" | "PAYMENT" | "QUEUE" | "WEBHOOK" | "PETPOOJA"
  >("ALL");
  const [searchLogs, setSearchLogs] = useState("");
  const logScrollRef = useRef<HTMLDivElement>(null);

  // Stream logs simulator for background container output (benign visual HMR)
  useEffect(() => {
    if (!isStreaming || !import.meta.env.DEV) return;

    const interval = setInterval(() => {
      const timestamp = new Date().toLocaleTimeString();
      const levels: ("INFO" | "WARN" | "ERROR" | "CRITICAL")[] = [
        "INFO",
        "INFO",
        "INFO",
        "WARN",
        "INFO",
        "ERROR",
      ];
      const level = levels[Math.floor(Math.random() * levels.length)];
      const subsystems: ("AUTH" | "STORE" | "PAYMENT" | "QUEUE" | "WEBHOOK" | "PETPOOJA")[] = [
        "AUTH",
        "STORE",
        "PAYMENT",
        "QUEUE",
        "WEBHOOK",
        "PETPOOJA",
      ];
      const subsystem = subsystems[Math.floor(Math.random() * subsystems.length)];

      const messagesMap = {
        AUTH: [
          "Generated new OTP challenge hash on Redis memory",
          "Token validated successfully for sessionusr_94",
          "OTP Rate limit bucket evaluated for IP 127.0.0.1",
        ],
        STORE: [
          "Store Connaught Place ping responsive: latency 2.5ms",
          "Updated active orders cache for Delhi store network",
          "Fetched 12 menu categories from store memory pool",
        ],
        PAYMENT: [
          "Razorpay checkout session token acknowledged",
          "Refunding order total 420.00 to original UPI link",
          "Payments ledger reconciliation complete: zero anomalies",
        ],
        QUEUE: [
          "BullMQ worker poll: empty queue",
          "Successfully scheduled backup cron trigger at 12:00:00",
          "Worker processed 1 jobs in 140ms",
        ],
        WEBHOOK: [
          "Received order callback payload from POS client node",
          "Processed incoming menu synchronization webhook successfully",
          "Forwarding receipt event payload to whatsapp daemon",
        ],
        PETPOOJA: [
          "Acquired POS catalog token from Petpooja credentials key",
          "Sync complete for store Gurgaon Cyber City catalog",
          "Warning: Petpooja server response delayed by 1200ms",
        ],
      };

      const messages = messagesMap[subsystem];
      const message = messages[Math.floor(Math.random() * messages.length)];

      setLogs((prev) => [...prev.slice(-99), { timestamp, level, subsystem, message }]);
    }, 4000);

    return () => clearInterval(interval);
  }, [isStreaming]);

  // #30: the audit trail used to be fetched from `/api/v1/admin/audit` behind
  // `if (!accessToken) return;`. `useAdmin().accessToken` is permanently null
  // (useAdmin.tsx:64 — single sign-in migration) and no audit route exists on
  // the API, so the fetch and export were dead code that could never fire.
  // Both are removed; the panel below says so instead of reporting a false
  // "no records" result from a query that never ran.

  // Scroll to bottom on stream
  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleDownloadLogs = () => {
    // Loop: was a bare alert() claiming a download that never happened.
    // Download the actually-visible log lines as text (possibly empty).
    try {
      const lines = logs.map((l) => `${l.timestamp} [${l.level}] (${l.subsystem}) ${l.message}`);
      const file = new Blob([lines.join("\n") || "No log lines in view."], { type: "text/plain" });
      const element = document.createElement("a");
      element.href = URL.createObjectURL(file);
      element.download = `burgonomics-system-logs-${Date.now()}.txt`;
      document.body.appendChild(element);
      element.click();
      element.remove();
      toast.success("Log view downloaded.");
    } catch {
      toast.error("Could not download logs.");
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const filteredLogs = logs.filter((log) => {
    const matchesLevel = logLevelFilter === "ALL" || log.level === logLevelFilter;
    const matchesSubsystem = subsystemFilter === "ALL" || log.subsystem === subsystemFilter;
    const matchesSearch = log.message.toLowerCase().includes(searchLogs.toLowerCase());
    return matchesLevel && matchesSubsystem && matchesSearch;
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case "INFO":
        return "text-emerald-400";
      case "WARN":
        return "text-amber-400";
      case "ERROR":
        return "text-red-400";
      default:
        return "text-purple-400 font-extrabold";
    }
  };

  return (
    <div className="space-y-6">
      {import.meta.env.DEV && (
        <div className="p-3 rounded-xl bg-amber-950/15 border border-amber-900/40 text-amber-400 font-mono text-[10px] leading-relaxed">
          DEV simulation — fabricated log lines and severity labels; not server events
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Streaming Logs Panel */}
        <div className="lg:col-span-2 p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl flex flex-col justify-between h-[480px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 gap-4">
            <div className="flex items-center gap-2.5">
              <Terminal size={18} className="text-emerald-400 animate-pulse" />
              <div>
                <h3 className="text-sm font-black tracking-wider text-white font-mono uppercase">
                  CONSOLE LOG BUFFER
                </h3>
                <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                  Local buffer only — no server log stream is wired to this console
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono">
              <div className="flex items-center gap-1 bg-black border border-gray-900 rounded-lg px-2 py-1 text-[10px] text-gray-400">
                <Search size={10} />
                <input
                  type="text"
                  placeholder="Filter string..."
                  value={searchLogs}
                  onChange={(e) => setSearchLogs(e.target.value)}
                  className="bg-transparent border-0 outline-none text-white font-mono placeholder-gray-700 w-[90px]"
                />
              </div>

              {import.meta.env.DEV && (
                <button
                  type="button"
                  onClick={() => setIsStreaming(!isStreaming)}
                  aria-label={
                    isStreaming
                      ? "Pause the simulated log stream"
                      : "Resume the simulated log stream"
                  }
                  title="Simulated stream (dev only) — no server log stream exists"
                  className={`p-1.5 rounded bg-black border border-gray-900 hover:text-white transition-colors cursor-pointer text-[10px] font-bold ${
                    isStreaming ? "text-emerald-400" : "text-gray-500"
                  }`}
                >
                  {isStreaming ? <Pause size={12} /> : <Play size={12} />}
                </button>
              )}
              <button
                onClick={handleDownloadLogs}
                className="p-1.5 rounded bg-primary/20 border border-emerald-950 text-emerald-400 hover:bg-primary/40 transition-all cursor-pointer"
              >
                <Download size={12} />
              </button>
              <button
                onClick={handleClearLogs}
                className="p-1.5 rounded bg-red-950/20 border border-red-900/40 text-red-400 hover:bg-red-950/40 transition-all cursor-pointer"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex items-center gap-2 border-b border-gray-900 pb-2.5 mt-2.5 overflow-x-auto no-scrollbar font-mono text-[9px] font-bold text-gray-500">
            <span className="shrink-0 uppercase">Level:</span>
            {["ALL", "INFO", "WARN", "ERROR", "CRITICAL"].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLogLevelFilter(lvl as any)}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer uppercase ${
                  logLevelFilter === lvl
                    ? "bg-primary text-white border border-emerald-800"
                    : "hover:text-white"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Logs scroll container */}
          <div
            ref={logScrollRef}
            className="flex-1 overflow-y-auto bg-black border border-gray-950/60 rounded-xl p-4 mt-4 font-mono text-[10px] text-gray-300 leading-normal space-y-1.5 shadow-inner custom-scrollbar select-all"
          >
            {filteredLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center select-none">
                <Terminal size={24} className="text-gray-700" />
                <p className="text-xs text-gray-500 font-mono leading-relaxed">
                  {logs.length === 0
                    ? "No log lines in the local buffer — no server log stream is wired to this console."
                    : "No log lines match the current filters."}
                </p>
              </div>
            ) : (
              filteredLogs.map((log, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 border-b border-gray-950 pb-1 last:border-0 hover:bg-white/5 p-0.5 rounded transition-colors"
                >
                  <span className="text-gray-600 shrink-0 select-none">[{log.timestamp}]</span>
                  <span className={`font-black shrink-0 select-none ${getLevelColor(log.level)}`}>
                    {log.level.padEnd(5)}
                  </span>
                  <span className="text-blue-400 font-extrabold shrink-0 select-none">
                    [{log.subsystem}]
                  </span>
                  <span className="text-gray-300 break-all select-all">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Audit Trail Panel */}
        <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl flex flex-col h-[480px]">
          <div className="border-b border-gray-800 pb-3 flex items-center gap-2">
            <UserCheck size={16} className="text-emerald-400" />
            <span className="font-mono text-xs font-black text-white uppercase tracking-widest">
              Administrative Audit Trail
            </span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-4">
            <UserCheck size={24} className="text-gray-700" />
            <p className="text-xs text-gray-500 font-mono leading-relaxed">
              Audit records are not available — no audit endpoint is wired to
              this console, so no records are read from or written to a server
              here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
