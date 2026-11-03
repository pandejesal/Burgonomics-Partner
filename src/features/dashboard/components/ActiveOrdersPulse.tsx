import React from 'react';
import { Link } from 'react-router-dom';
import { Flame, Bell, ChevronRight, Utensils } from 'lucide-react';

interface ActiveOrdersPulseProps {
  pendingKotCount: number;
  inPrepCount: number;
}

export function ActiveOrdersPulse({
  pendingKotCount,
  inPrepCount,
}: ActiveOrdersPulseProps) {
  const hasPending = pendingKotCount > 0;

  return (
    <div className="p-4 rounded-3xl bg-gradient-to-r from-[#0E4825] to-[#0A2614] border border-emerald-500/40 text-white shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 select-none">
      {/* min-w-0 + wrapping rows: at enlarged text sizes the badge and caption
          used to push the card 23-92px past a phone screen. */}
      <div className="flex min-w-0 max-w-full items-center gap-3.5">
        <div className="relative shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-amber-950/80 border border-amber-500/50 flex items-center justify-center text-[#FF6600]">
            <Flame className="w-6 h-6 animate-pulse" />
          </div>
          {hasPending && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF6600] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-[#FF6600] text-[9px] font-black text-white items-center justify-center">
                {pendingKotCount}
              </span>
            </span>
          )}
        </div>

        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-black text-sm text-white">Kitchen Orders Board</h3>
            <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-400/40 text-emerald-300 font-bold text-[10px] uppercase">
              Auto-refreshes every 30s
            </span>
          </div>
          <p className="break-words text-xs text-emerald-100/80">
            {hasPending
              ? `🔥 ${pendingKotCount} new KOT(s) awaiting kitchen bump! ${inPrepCount} currently on grill.`
              : `All caught up! ${inPrepCount} burger(s) currently grilling.`}
          </p>
        </div>
      </div>

      <Link
        to="/kds"
        className="px-4 py-2.5 rounded-2xl bg-[#FF6600] hover:bg-[#e05a00] text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer shrink-0 max-w-full"
      >
        <Utensils className="w-4 h-4 shrink-0" />
        <span className="min-w-0 break-words">Open KDS Station</span>
        <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

export default ActiveOrdersPulse;
