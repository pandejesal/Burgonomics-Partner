import React from "react";
import { ShieldAlert, AlertTriangle } from "lucide-react";

export const SystemSecurityTab: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Alert Banner / Security Summary */}
      <div className="p-4 rounded-xl bg-red-950/15 border border-red-900/40 text-red-400 font-mono text-xs flex items-start gap-3">
        <ShieldAlert size={18} className="shrink-0 mt-0.5 animate-pulse" />
        <div>
          <span className="font-bold block uppercase tracking-wider text-[10px]">
            Security controls unavailable
          </span>
          <p className="mt-1 leading-relaxed text-red-200">
            No server-side session revocation,
            audit ledger, or backup endpoint is wired — do not rely on them for production
            incident response.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Maintenance / Emergency Mode */}
        <div className="lg:col-start-2 p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="border-b border-gray-800 pb-3">
              <span className="font-mono text-xs font-black text-emerald-400 uppercase tracking-widest">
                Maintenance status
              </span>
            </div>

            <div className="p-4 bg-black/40 rounded-xl border border-gray-900/60 font-mono text-[10px] text-gray-400 leading-relaxed space-y-3">
              <div className="flex items-center gap-2 text-amber-500 font-bold">
                <AlertTriangle size={14} />
                <span className="uppercase text-[9px]">Emergency Maintenance Mode</span>
              </div>
              <p>
                Maintenance status is unavailable in this console. Real maintenance must be
                coordinated out-of-band.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
