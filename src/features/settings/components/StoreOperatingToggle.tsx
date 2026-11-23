import React, { useEffect, useState } from 'react';
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
import {
  applyStaffStoreStatus,
  refreshBranchCache,
} from '@/features/stores/services/storeOperatingStatus';
import { isStoreClosedByStaff } from '@/features/stores/services/operatingGate';
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
  const [lastSavedPrep, setLastSavedPrep] = useState<number | undefined>(branch?.prepTimeMinutes);
  const [emergencyReason, setEmergencyReason] = useState<string | null>(null);

  // A5: the canonical gate is the server-maintained staff close, not the local
  // optimistic `status`. A surge selected while closed must never make any
  // outlet view claim the store is accepting orders.
  const closedByStaff = isStoreClosedByStaff(branch);
  const shownStatus: AcceptingOrdersStatus = closedByStaff ? 'closed' : status;

  const prepDirty = !!branch?.id && prepTime !== (lastSavedPrep ?? 20);

  // 6a: re-mirror the incoming branch into local state. Deps are primitives
  // only, so a background refetch that returns unchanged values cannot
  // clobber a prep-time drag in progress.
  useEffect(() => {
    setStatus(
      closedByStaff ? 'closed' : branch?.acceptingOrdersStatus || (branch?.active ? 'open' : 'closed'),
    );
    setPrepTime(branch?.prepTimeMinutes || 20);
    setLastSavedPrep(branch?.prepTimeMinutes);
  }, [
    branch?.id,
    branch?.acceptingOrdersStatus,
    branch?.active,
    branch?.storeStatusOverride,
    branch?.prepTimeMinutes,
    closedByStaff,
  ]);

  // 6g: prep-time has its own save path — awaited Firestore write first,
  // success toast only after it resolves.
  const savePrepTime = async () => {
    if (!branch?.id) {
      toast.error('No outlet linked — prep time was not saved.');
      return;
    }
    try {
      await updateBranchSettings.mutateAsync({
        branchId: branch.id,
        settings: { prepTimeMinutes: prepTime },
      });
      setLastSavedPrep(prepTime);
      toast.success(`Prep time buffer saved: ${prepTime} mins`);
    } catch {
      setPrepTime(branch.prepTimeMinutes ?? 20);
      toast.error('Prep time save failed — reverted to the last saved value.');
    }
  };

  const prevStatus: AcceptingOrdersStatus = closedByStaff
    ? 'closed'
    : branch?.acceptingOrdersStatus || (branch?.active ? 'open' : 'closed');

  const handleUpdateStatus = async (
    newStatus: AcceptingOrdersStatus,
    reasonText?: string,
    bufferMins?: number
  ) => {
    // A5: a surge on a closed store is NOT a reopen. Change only the prep buffer
    // and say plainly that the outlet is still closed — never write `active:true`
    // or `acceptingOrdersStatus:'busy'`, and never toast that orders are accepted.
    if (newStatus === 'busy' && closedByStaff) {
      if (!branch?.id) {
        toast.error('No outlet linked — the prep buffer was not saved.');
        return;
      }
      try {
        await updateBranchSettings.mutateAsync({
          branchId: branch.id,
          settings: { prepTimeMinutes: bufferMins || prepTime },
        });
        setPrepTime(bufferMins || prepTime);
        setLastSavedPrep(bufferMins || prepTime);
        toast.info('Outlet is closed — prep buffer saved. Reopen it before using Busy/Rush.', {
          description: 'The customer gate is still closed; no orders are being accepted.',
        });
      } catch {
        toast.error('Prep buffer save failed — the outlet is still closed.');
      }
      return;
    }

    setStatus(newStatus);
    setEmergencyReason(reasonText || null);
    if (bufferMins) {
      setPrepTime(bufferMins);
    }

    if (!branch?.id) {
      // No branch id: there is nothing to write to — fail loud instead of
      // pretending component state was persisted.
      toast.error('No branch linked — status was not saved.');
      return;
    }

    // Rule C (owner decision 2026-11-20): open/closed is the CUSTOMER GATE.
    // `acceptingOrdersStatus` alone stops nobody — the customer app reads
    // `stores|admin_stores .isOpen` — so open/closed must go through the
    // server route, which also stamps the staff override a Petpooja "open"
    // cannot clear. "busy" is a surge control (branch flag + prep buffer) and
    // deliberately keeps the outlet open.
    if (newStatus !== 'busy') {
      try {
        await applyStaffStoreStatus({
          branchId: branch.id,
          status: newStatus,
          ...(reasonText ? { reason: reasonText } : {}),
        });
        // The server wrote the gate; drop the cached branch rows so the outlet
        // cards re-read the flag the route kept in step. Routed through the
        // service (never `useQueryClient`) so this component stays renderable
        // outside a provider — the reflow suite renders it standalone.
        void refreshBranchCache();
        toast.success(
          newStatus === 'closed'
            ? 'Outlet CLOSED — customers can no longer order, and Petpooja cannot reopen it.'
            : 'Outlet OPEN — customers can order again; Petpooja owns open/closed from here.',
        );
      } catch (err) {
        setStatus(prevStatus);
        if (bufferMins) {
          setPrepTime(branch.prepTimeMinutes ?? 20);
        }
        setEmergencyReason(null);
        const message = (err as Error)?.message || 'the server refused the change';
        toast.error(`Store status NOT changed — ${message}`, {
          description: 'The previous status is still in force.',
        });
      }
      return;
    }

    try {
      await updateBranchSettings.mutateAsync({
        branchId: branch.id,
        settings: {
          acceptingOrdersStatus: newStatus,
          active: true,
          prepTimeMinutes: bufferMins || prepTime,
        },
      });
      toast.success(`Store operations status updated: ${newStatus.toUpperCase()}`);
    } catch {
      setStatus(prevStatus);
      if (bufferMins) {
        setPrepTime(branch.prepTimeMinutes ?? 20);
      }
      toast.error(
        'Failed to update branch operating status — the previous status is still active.'
      );
    }
  };

  return (
    <div className="p-6 rounded-3xl bg-[#0E4825]/10 border border-emerald-500/30 space-y-6 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between border-b border-neutral-800 pb-4">
        <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-2xl bg-[#0E4825] border border-emerald-500/40 text-emerald-300 shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-black tracking-tight text-white flex flex-wrap items-center gap-2 min-w-0 break-words">
              <span>Store Operating Status & Surge Controls</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border shrink-0 ${
                  !branch
                    ? 'bg-zinc-900 border-zinc-600 text-zinc-300'
                    : shownStatus === 'open'
                    ? 'bg-emerald-950 border-emerald-500/40 text-emerald-400'
                    : shownStatus === 'busy'
                    ? 'bg-amber-950 border-amber-500/40 text-amber-400'
                    : 'bg-rose-950 border-rose-500/40 text-rose-400'
                }`}
              >
                {branch ? shownStatus.toUpperCase() : 'NO OUTLET'}
              </span>
            </h2>
            <p className="text-xs text-neutral-400 min-w-0 break-words">
              Live online ordering toggle, kitchen prep time buffer, and emergency rush pause
            </p>
          </div>
        </div>

        {emergencyReason && (
          <span className="text-xs px-3 py-1 rounded-xl bg-amber-950/80 border border-amber-800/60 text-amber-300 font-bold shrink-0 self-start sm:self-auto">
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
            shownStatus === 'open'
              ? 'bg-[#0E4825] border-emerald-500 text-white shadow-xs'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-black text-sm text-emerald-300">● Open for Orders</span>
            {shownStatus === 'open' && <CheckCircle2 className="w-4 h-4 text-emerald-300" />}
          </div>
          <p className="text-[11px] text-neutral-300">Accepting regular delivery & takeaway</p>
        </button>

        <button
          type="button"
          onClick={() => handleUpdateStatus('busy', 'Rush Hours (+15m buffer)', 35)}
          disabled={closedByStaff || !branch?.id}
          title={
            closedByStaff
              ? 'Reopen the outlet before enabling Busy/Rush'
              : 'Adds 15m prep buffer to customer ETA'
          }
          className={`p-4 rounded-2xl border text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            shownStatus === 'busy'
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
            shownStatus === 'closed'
              ? 'bg-rose-950 border-rose-500 text-white shadow-xs'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-black text-sm text-rose-300">■ Store Closed</span>
            {shownStatus === 'closed' && <CheckCircle2 className="w-4 h-4 text-rose-300" />}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleUpdateStatus('busy', '30 Mins Rush Break', 40)}
              disabled={closedByStaff || !branch?.id}
              title={
                closedByStaff
                  ? 'Reopen the outlet before enabling Busy/Rush'
                  : 'Adds a 30 minute rush buffer'
              }
              className="px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold text-xs flex items-center justify-center sm:justify-start gap-1.5 transition-colors cursor-pointer min-w-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span className="break-words min-w-0">30m Rush Break</span>
            </button>

            <button
              type="button"
              onClick={() => handleUpdateStatus('closed', '1 Hour Rain Pause', 0)}
              className="px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold text-xs flex items-center justify-center sm:justify-start gap-1.5 transition-colors cursor-pointer min-w-0"
            >
              <CloudRain className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="break-words min-w-0">1h Rain Pause</span>
            </button>
          </div>
        </div>

        {/* Prep Time Slider */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="prepTimeSlider" className="text-xs font-bold uppercase text-neutral-400 min-w-0">
              Kitchen Preparation Time Buffer
            </label>
            <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
              {prepDirty && (
                <span className="text-[10px] font-bold uppercase text-amber-400">Unsaved</span>
              )}
              <span className="font-mono font-bold text-xs text-[#4ADE80]">{prepTime} mins</span>
              <button
                type="button"
                onClick={savePrepTime}
                disabled={!prepDirty || updateBranchSettings.isPending}
                className="px-3 py-1.5 rounded-lg bg-[#0E4825] text-white text-[11px] font-black disabled:opacity-50 cursor-pointer min-w-0 max-w-full break-words"
              >
                {updateBranchSettings.isPending ? 'Saving…' : 'Save prep time'}
              </button>
            </div>
          </div>

          <input
            id="prepTimeSlider"
            type="range"
            min="10"
            max="60"
            step="5"
            value={prepTime}
            onChange={(e) => setPrepTime(Number(e.target.value))}
            disabled={!branch?.id}
            className="w-full accent-[#FF6600] h-2 bg-neutral-800 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-w-0"
          />
          {!branch?.id && (
            <p className="text-[10px] text-amber-400">
              No outlet loaded — nothing can be saved yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default StoreOperatingToggle;
