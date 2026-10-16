import React from "react";
import { Boxes, AlertTriangle } from "lucide-react";

/**
 * Queue diagnostics — standby only.
 *
 * #30: this tab used to fetch `/api/v1/admin/ops/queues*` behind
 * `if (!accessToken) return;`. `useAdmin().accessToken` is permanently null
 * (useAdmin.tsx:64 — single sign-in migration) and no queue route exists on
 * the API, so every request was dead code that could never fire. The dead
 * fetch paths and the state that only fed them are removed; nothing runs on
 * mount. The copy below is honest: no server-side queue executor is wired,
 * so there is no depth to count and no local pause/retry that could claim to
 * have acted.
 */
export const SystemQueueTab: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-amber-950/15 border border-amber-900/40 text-amber-400 font-mono text-xs flex items-start gap-3">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block uppercase tracking-wider text-[10px]">
            No Queue Telemetry — No Backend Endpoint
          </span>
          <p className="mt-1 leading-relaxed text-amber-200">
            No BullMQ queue executor is deployed for this console and no queue
            endpoint exists on the API. Queue depth, failed-job inspection, and
            pause / retry / DLQ controls are unavailable — nothing here is
            measured or acted on.
          </p>
        </div>
      </div>

      <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
        <div className="border-b border-gray-800 pb-4">
          <h3 className="text-sm font-black tracking-wider text-white font-mono uppercase">
            BULLMQ EXECUTOR REGISTRY
          </h3>
          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
            Standby — queues will be listed once a server-side executor is deployed
          </p>
        </div>

        <div className="py-16 text-center space-y-2">
          <Boxes size={24} className="text-gray-700 mx-auto" />
          <p className="text-xs text-gray-500 font-mono leading-relaxed">
            No queues to inspect — no server-side queue executor is connected to
            this console.
          </p>
        </div>
      </div>
    </div>
  );
};
