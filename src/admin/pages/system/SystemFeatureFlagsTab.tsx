import React from "react";
import { Flag, AlertTriangle } from "lucide-react";

/**
 * Feature flag control — standby only.
 *
 * #30: this tab used to call `/api/v1/feature-flags` behind
 * `if (!accessToken) return;`. `useAdmin().accessToken` is permanently null
 * (useAdmin.tsx:64 — single sign-in migration) and no feature-flag route
 * exists on the API, so read / toggle / create / delete were all dead code
 * that could never fire. The dead fetch paths and the state that only fed
 * them are removed; nothing runs on mount. No local control remains that
 * could claim to have toggled, created, or deleted a flag.
 */
export const SystemFeatureFlagsTab: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-amber-950/15 border border-amber-900/40 text-amber-400 font-mono text-xs flex items-start gap-3">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block uppercase tracking-wider text-[10px]">
            No Flag Service Wired
          </span>
          <p className="mt-1 leading-relaxed text-amber-200">
            No feature-flag service exists in this deployment. Flags cannot be
            listed, toggled, created, or deleted from this console — nothing
            here is read from or written to a server.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 gap-4">
        <div>
          <h3 className="text-sm font-black tracking-wider text-white font-mono uppercase">
            FEATURE FLAG SEGMENTATIONS
          </h3>
          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
            Standby — no flag service is connected to this console
          </p>
        </div>
      </div>

      <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl">
        <div className="py-16 text-center space-y-2">
          <Flag size={24} className="text-gray-700 mx-auto" />
          <p className="text-xs text-gray-500 font-mono leading-relaxed">
            No feature flags to display — no flag service is connected to this
            console.
          </p>
        </div>
      </div>
    </div>
  );
};
