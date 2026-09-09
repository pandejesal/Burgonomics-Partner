import React from 'react';
import { BellRing, CheckCircle2 } from 'lucide-react';

interface ActiveOrdersPulseProps {
  pendingKotCount: number;
  inPrepCount: number;
}

/**
 * ActiveOrdersPulse — presentational kitchen-load strip. Counts arrive via
 * props (computed in DashboardPage); zero-zero renders a calm "clear" state,
 * never a fake rush.
 */
export function ActiveOrdersPulse({ pendingKotCount, inPrepCount }: ActiveOrdersPulseProps) {
  const hasLoad = pendingKotCount > 0 || inPrepCount > 0;

  if (!hasLoad) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-4">
        <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
        <div>
          <p className="text-xs font-bold text-emerald-300">Kitchen clear</p>
          <p className="text-[11px] text-neutral-400">No pending KOTs, nothing in preparation.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-2xl border border-amber-800/60 bg-amber-950/30 p-4"
    >
      <BellRing className="w-5 h-5 shrink-0 text-amber-300" />
      <div>
        <p className="text-xs font-bold text-amber-200">
          {pendingKotCount} pending KOT{pendingKotCount === 1 ? '' : 's'} · {inPrepCount} in
          preparation
        </p>
        <p className="text-[11px] text-amber-200/70">Kitchen display needs attention.</p>
      </div>
    </div>
  );
}

export default ActiveOrdersPulse;
