import React, { useState } from "react";
import { ShieldAlert, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const SystemSecurityTab: React.FC = () => {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [maintenancePin, setMaintenancePin] = useState("");

  const handleToggleMaintenance = () => {
    // No Default PIN: the old `|| "2026"` fallback meant anyone who opened
    // this console knew the safety PIN. Refuse until the operator sets one.
    const requiredPin = import.meta.env.VITE_ADMIN_MAINTENANCE_PIN as string | undefined;
    if (!requiredPin) {
      toast.warning(
        "Maintenance flag is not configured (set VITE_ADMIN_MAINTENANCE_PIN). Nothing was changed.",
      );
      return;
    }
    if (isMaintenanceMode) {
      setIsMaintenanceMode(false);
      setMaintenancePin("");
      toast.warning(
        "Local flag cleared. This toggle never controls the live API — it marks this console only.",
      );
    } else {
      if (!maintenancePin || maintenancePin !== requiredPin) {
        toast.error("Incorrect confirmation PIN — nothing was changed.");
        return;
      }
      setIsMaintenanceMode(true);
      toast.warning(
        "Local flag set. Customer checkouts are NOT affected by this toggle — it marks this console only.",
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Banner / Security Summary */}
      <div className="p-4 rounded-xl bg-red-950/15 border border-red-900/40 text-red-400 font-mono text-xs flex items-start gap-3">
        <ShieldAlert size={18} className="shrink-0 mt-0.5 animate-pulse" />
        <div>
          <span className="font-bold block uppercase tracking-wider text-[10px]">
            Local Console Controls — No Server Backend
          </span>
          <p className="mt-1 leading-relaxed text-red-200">
            These controls are local to this console. No server-side session revocation,
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
                Local Maintenance Flag
              </span>
            </div>

            <div className="p-4 bg-black/40 rounded-xl border border-gray-900/60 font-mono text-[10px] text-gray-400 leading-relaxed space-y-3">
              <div className="flex items-center gap-2 text-amber-500 font-bold">
                <AlertTriangle size={14} />
                <span className="uppercase text-[9px]">Emergency Maintenance Mode</span>
              </div>
              <p>
                Sets a local flag on this console only — it does not block checkouts, throttle
                traffic, or affect any customer app. A configured confirmation PIN is required;
                real maintenance must be coordinated out-of-band.
              </p>

              {!isMaintenanceMode && (
                <div className="pt-2">
                  <input
                    type="password"
                    placeholder="Enter Administrator Safety PIN..."
                    value={maintenancePin}
                    onChange={(e) => setMaintenancePin(e.target.value)}
                    className="w-full bg-black border border-gray-900 rounded-lg p-2 text-white font-mono placeholder-gray-800 outline-none text-center tracking-widest"
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleToggleMaintenance}
              className={`w-full py-2.5 rounded-lg text-xs font-black font-mono uppercase tracking-wider transition-colors cursor-pointer ${
                isMaintenanceMode
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-red-950/20 border border-red-900 text-red-400 hover:bg-red-950/40"
              }`}
            >
              {isMaintenanceMode ? "Clear Local Flag" : "Set Local Flag (PIN Required)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
