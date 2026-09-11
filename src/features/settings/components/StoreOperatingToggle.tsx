import React, { useState } from 'react';
import {
  Store,
  Clock,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  CloudRain,
  Flame,
} from 'lucide-react';
import { useBranches } from '@/hooks/useBranches';
import { toast } from 'sonner';
import type { Branch, AcceptingOrdersStatus } from '@/types';

interface StoreOperatingToggleProps {
  branch?: Branch | null;
}

export function StoreOperatingToggle({ branch }: StoreOperatingToggleProps) {
  const { updateBranchSettings } = useBranches();
  const [status, setStatus] = useState<AcceptingOrdersStatus>(
    branch?.acceptingOrdersStatus || (branch?.active ? 'open' : 'closed')
  );
  const [prepTime, setPrepTime] = useState<number>(branch?.prepTimeMinutes || 20);
  const [emergencyReason, setEmergencyReason] = useState<string | null>(null);

  const handleUpdateStatus = async (
    newStatus: AcceptingOrdersStatus,
    reasonText?: string,
    bufferMins?: number
  ) => {
    setStatus(newStatus);
    setEmergencyReason(reasonText || null);
    if (bufferMins) {
      setPrepTime(bufferMins);
    }

    if (branch?.id) {
      try {
        await updateBranchSettings.mutateAsync({
          branchId: branch.id,
          settings: {
            acceptingOrdersStatus: newStatus,
            active: newStatus !== 'closed',
            prepTimeMinutes: bufferMins || prepTime,
          },
        });
        toast.success(`Store operations status updated: ${newStatus.toUpperCase()}`);
      } catch (err) {
        toast.error('Failed to update branch operating status');
      }
    } else {
      // Loop: was toast.success("updated locally") while persisting NOTHING
      // (component state only, lost on unmount). Fail loud instead.
      toast.error('No branch linked — status was not saved.');
    }
  };

  return (
    <div className="p-6 rounded-3xl bg-[#0E4825]/10 border border-emerald-500/30 space-y-6 text-white">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-[#0E4825] border border-emerald-500/40 text-emerald-300">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight text-white flex items-center gap-2">
              <span>Store Operating Status & Surge Controls</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                  status === 'open'
                    ? 'bg-emerald-950 border-emerald-500/40 text-emerald-400'
                    : status === 'busy'
                    ? 'bg-amber-950 border-amber-500/40 text-amber-400'
                    : 'bg-rose-950 border-rose-500/40 text-rose-400'
                }`}
              >
                {status.toUpperCase()}
              </span>
            </h2>
            <p className="text-xs text-neutral-400">
              Live online ordering toggle, kitchen prep time buffer, and emergency rush pause
            </p>
          </div>
        </div>

        {emergencyReason && (
          <span className="text-xs px-3 py-1 rounded-xl bg-amber-950/80 border border-amber-800/60 text-amber-300 font-bold">
            Active: {emergencyReason}
          </span>
        )}
      </div>

      {/* Main Status Tri-State Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => handleUpdateStatus('open', undefined, 20)}
          className={`p-4 rounded-2xl border text-left transition-colors cursor-pointer ${
            status === 'open'
              ? 'bg-[#0E4825] border-emerald-500 text-white shadow-xs'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-black text-sm text-emerald-300">● Open for Orders</span>
            {status === 'open' && <CheckCircle2 className="w-4 h-4 text-emerald-300" />}
          </div>
          <p className="text-[11px] text-neutral-300">Accepting regular delivery & takeaway</p>
        </button>

        <button
          type="button"
          onClick={() => handleUpdateStatus('busy', 'Rush Hours (+15m buffer)', 35)}
          className={`p-4 rounded-2xl border text-left transition-colors cursor-pointer ${
            status === 'busy'
              ? 'bg-amber-950 border-amber-500 text-white shadow-xs'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-black text-sm text-amber-300">▲ Kitchen Busy</span>
            {status === 'busy' && <CheckCircle2 className="w-4 h-4 text-amber-300" />}
          </div>
          <p className="text-[11px] text-neutral-300">Adds 15m prep buffer to customer ETA</p>
        </button>

        <button
          type="button"
          onClick={() => handleUpdateStatus('closed', 'Manually Paused', 0)}
          className={`p-4 rounded-2xl border text-left transition-colors cursor-pointer ${
            status === 'closed'
              ? 'bg-rose-950 border-rose-500 text-white shadow-xs'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-black text-sm text-rose-300">■ Store Closed</span>
            {status === 'closed' && <CheckCircle2 className="w-4 h-4 text-rose-300" />}
          </div>
          <p className="text-[11px] text-neutral-300">Temporarily pauses all online orders</p>
        </button>
      </div>

      {/* Emergency Closure Quick Actions & Prep Time Slider */}
      <div className="pt-2 border-t border-neutral-800/80 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Quick Emergency Buttons */}
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase text-neutral-400">
            Emergency Store Pause Controls
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleUpdateStatus('busy', '30 Mins Rush Break', 40)}
              className="px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>30m Rush Break</span>
            </button>

            <button
              type="button"
              onClick={() => handleUpdateStatus('closed', '1 Hour Rain Pause', 0)}
              className="px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <CloudRain className="w-3.5 h-3.5 text-cyan-400" />
              <span>1h Rain Pause</span>
            </button>
          </div>
        </div>

        {/* Prep Time Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase text-neutral-400">
              Kitchen Preparation Time Buffer
            </label>
            <span className="font-mono font-bold text-xs text-[#4ADE80]">{prepTime} mins</span>
          </div>

          <input
            type="range"
            min="10"
            max="60"
            step="5"
            value={prepTime}
            onChange={(e) => setPrepTime(Number(e.target.value))}
            className="w-full accent-[#FF6600] h-2 bg-neutral-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}

export default StoreOperatingToggle;
