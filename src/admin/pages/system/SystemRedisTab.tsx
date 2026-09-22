import React, { useState } from "react";
import { Database, Search } from "lucide-react";

interface RedisKey {
  key: string;
  type: "string" | "hash" | "set" | "zset";
  group: "menu_cache" | "session_cache" | "otp_cache" | "rate_limit";
  ttlSec: number;
  sizeBytes: number;
  value: string;
}

export const SystemRedisTab: React.FC = () => {
  const [keys] = useState<RedisKey[]>([]);
  const [selectedKey, setSelectedKey] = useState<RedisKey | null>(null);
  const [searchPattern, setSearchPattern] = useState("");
  const [activeGroupFilter, setActiveGroupFilter] = useState<
    "all" | "menu" | "session" | "otp" | "rate"
  >("all");

  const filteredKeys = keys.filter((k) => {
    const matchesPattern = k.key.toLowerCase().includes(searchPattern.toLowerCase());
    let matchesGroup = true;
    if (activeGroupFilter === "menu") matchesGroup = k.group === "menu_cache";
    else if (activeGroupFilter === "session") matchesGroup = k.group === "session_cache";
    else if (activeGroupFilter === "otp") matchesGroup = k.group === "otp_cache";
    else if (activeGroupFilter === "rate") matchesGroup = k.group === "rate_limit";
    return matchesPattern && matchesGroup;
  });

  const getGroupBadge = (group: string) => {
    const colorMap =
      {
        menu_cache: "bg-emerald-950/20 text-emerald-400 border-emerald-900/50",
        session_cache: "bg-blue-950/20 text-blue-400 border-blue-900/50",
        otp_cache: "bg-amber-950/20 text-amber-400 border-amber-900/50",
        rate_limit: "bg-purple-950/20 text-purple-400 border-purple-900/50",
      }[group] || "bg-gray-800 text-gray-400";

    return (
      <span
        className={`inline-block px-2 py-0.5 rounded border text-[9px] font-mono uppercase font-black ${colorMap}`}
      >
        {group.replace("_", " ")}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Redis cache groups row */}
      <div className="p-6 rounded-[20px] bg-[#0c130e] border border-gray-800 flex flex-col items-center justify-center text-center space-y-2">
        <Database size={24} className="text-gray-700" />
        <p className="text-xs text-gray-500 font-mono">
          No cache telemetry yet — this view will populate once a cache layer is deployed and monitored.
        </p>
      </div>

      {/* Redis Explorer Table Suite */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 gap-4">
            <div>
              <h3 className="text-sm font-black tracking-wider text-white font-mono uppercase">
                REDIS TELEMETRY KEY EXPLORER
              </h3>
              <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                Inspect key storage parameters, TTL offsets, and value loads
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-black/40 border border-gray-800 rounded-lg px-2.5 py-1">
                <Search size={12} className="text-gray-500" />
                <input
                  type="text"
                  placeholder="KEYS *pattern*..."
                  value={searchPattern}
                  onChange={(e) => setSearchPattern(e.target.value)}
                  className="bg-transparent border-0 outline-none text-[11px] text-white placeholder-gray-600 font-mono w-[130px]"
                />
              </div>
            </div>
          </div>

          {/* Redis groups selector */}
          <div className="flex items-center gap-1.5 border-b border-gray-900 pb-2 overflow-x-auto no-scrollbar">
            {(["all", "menu", "session", "otp", "rate"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setActiveGroupFilter(g)}
                className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider font-mono ${
                  activeGroupFilter === g
                    ? "bg-primary text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <div className="space-y-2.5 max-h-[340px] overflow-y-auto custom-scrollbar">
            {filteredKeys.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <Database size={24} className="text-gray-700 mx-auto animate-pulse" />
                <p className="text-xs text-gray-500 font-mono">
                  No Redis keys to inspect — the key explorer will populate once a cache layer is deployed.
                </p>
              </div>
            ) : (
              filteredKeys.map((k) => (
                <div
                  key={k.key}
                  onClick={() => setSelectedKey(k)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    selectedKey?.key === k.key
                      ? "bg-primary/15 border-emerald-700/50"
                      : "bg-black/30 border-gray-900/60 hover:border-gray-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-[10px] font-black px-1.5 py-0.5 rounded bg-black/40 text-gray-400 border border-gray-900 font-mono uppercase">
                      {k.type}
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-white font-mono break-all leading-tight">
                        {k.key}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        {getGroupBadge(k.group)}
                        <span className="text-[9px] text-gray-500 font-mono">
                          Size:{" "}
                          {k.sizeBytes > 1000
                            ? `${(k.sizeBytes / 1000).toFixed(1)} KB`
                            : `${k.sizeBytes} B`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 font-mono text-right">
                    <div>
                      <span className="block text-[10px] text-amber-400 font-bold">
                        TTL: {k.ttlSec}s
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Redis Key Value Inspector */}
        <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="border-b border-gray-800 pb-3 flex items-center justify-between">
              <span className="font-mono text-xs font-black text-emerald-400 uppercase tracking-widest">
                Key Inspector
              </span>
            </div>

            {selectedKey ? (
              <div className="space-y-4 font-mono text-xs">
                <div>
                  <span className="block text-[9px] text-gray-500 uppercase font-bold">
                    Target Key Path
                  </span>
                  <span className="text-xs font-bold text-white select-all break-all">
                    {selectedKey.key}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-[10px]">
                  <div>
                    <span className="block text-[9px] text-gray-500 uppercase font-bold">
                      Object Type
                    </span>
                    <span className="text-white uppercase font-bold">{selectedKey.type}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] text-gray-500 uppercase font-bold">
                      Expiration Offset
                    </span>
                    <span className="text-amber-400 font-bold">{selectedKey.ttlSec} seconds</span>
                  </div>
                </div>

                <div>
                  <span className="block text-[9px] text-gray-500 uppercase font-bold">
                    Serialized Value Load
                  </span>
                  <pre className="p-2.5 rounded-lg bg-black text-emerald-400 border border-gray-900 font-mono text-[9px] overflow-x-auto select-all max-h-[160px] leading-relaxed break-all whitespace-pre-wrap">
                    {selectedKey.value}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center space-y-2">
                <Database size={24} className="text-gray-700 mx-auto animate-pulse" />
                <p className="text-xs text-gray-500 font-mono">
                  Select a Redis key row to load its active memory dump
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
