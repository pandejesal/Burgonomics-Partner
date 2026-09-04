import React, { useState } from 'react';
import { Store, Power, AlertCircle, CheckCircle2, ChevronDown, Lock } from 'lucide-react';
import { toast } from 'sonner';

export interface BranchOption {
  id: string;
  name: string;
  city: string;
  isAcceptingOrders?: boolean;
}

interface BranchSwitcherProps {
  branches: BranchOption[];
  selectedBranchId: string;
  isSuperadmin: boolean;
  onSelectBranch: (branchId: string) => void;
  onToggleStoreStatus?: (branchId: string, isAccepting: boolean) => Promise<void> | void;
}

export function BranchSwitcher({
  branches,
  selectedBranchId,
  isSuperadmin,
  onSelectBranch,
  onToggleStoreStatus,
}: BranchSwitcherProps) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const selectedBranch =
    branches.find((b) => b.id === selectedBranchId) || branches[0] || {
      id: 'branch_all',
      name: 'All Outlets (Enterprise)',
      city: 'Gujarat',
      isAcceptingOrders: true,
    };

  const isAccepting = selectedBranch.isAcceptingOrders !== false;

  const handleToggleClick = () => {
    setShowConfirmModal(true);
  };

  const handleConfirmToggle = async () => {
    setIsToggling(true);
    try {
      const nextStatus = !isAccepting;
      if (onToggleStoreStatus) {
        await onToggleStoreStatus(selectedBranch.id, nextStatus);
      }
      toast.success(
        nextStatus
          ? `${selectedBranch.name} is now LIVE & Accepting Orders!`
          : `${selectedBranch.name} is now PAUSED (Kitchen Offline)`
      );
      setShowConfirmModal(false);
    } catch (err) {
      toast.error('Failed to update store operational status');
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <>
      <div className="flex w-full min-w-0 flex-col gap-3 rounded-3xl border border-neutral-800 bg-[#0D0D0D] p-3.5 shadow-md select-none sm:flex-row sm:items-center sm:justify-between">
        {/* Branch Selector */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="shrink-0 rounded-2xl border border-emerald-500/40 bg-[#0E4825] p-2 text-emerald-300">
            <Store className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Active Store Outlet
            </span>

            {isSuperadmin ? (
              <select
                value={selectedBranchId}
                onChange={(e) => onSelectBranch(e.target.value)}
                className="w-full max-w-full truncate rounded-xl border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-xs font-bold text-white focus:border-[#FF6600] focus:outline-none sm:w-auto sm:max-w-[240px]"
              >
                <option value="all">All Outlets</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.city})
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-xs font-black text-white">{selectedBranch.name}</span>
                <span className="shrink-0 text-[10px] font-bold text-neutral-500">({selectedBranch.city})</span>
                <span title="Scoped to your assigned branch">
                  <Lock className="ml-1 h-3 w-3 shrink-0 text-neutral-500" />
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Master Store Online / Offline Toggle */}
        <div className="flex w-full shrink-0 items-center sm:w-auto">
          <button
            type="button"
            onClick={handleToggleClick}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer active:scale-95 sm:w-auto ${
              isAccepting
                ? 'border border-emerald-500/40 bg-[#0E4825] text-emerald-300 hover:bg-[#135d30]'
                : 'border border-rose-500/40 bg-rose-950 text-rose-300 hover:bg-rose-900'
            }`}
          >
            <Power className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{isAccepting ? 'Store Online' : 'Store Paused'}</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0F0F0F] border border-neutral-800 rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2.5 rounded-2xl border ${
                  isAccepting
                    ? 'bg-rose-950 border-rose-500/40 text-rose-400'
                    : 'bg-emerald-950 border-emerald-500/40 text-emerald-400'
                }`}
              >
                <Power className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-white text-sm">
                  {isAccepting ? 'Pause Store Operations?' : 'Re-open Store Operations?'}
                </h3>
                <p className="text-[11px] text-neutral-400">{selectedBranch.name}</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              {isAccepting
                ? 'Pausing store will prevent new customers on the mobile app from placing delivery and takeaway orders.'
                : 'Re-opening will immediately make the menu live and open the checkout gates for customers.'}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-neutral-900 text-neutral-300 hover:text-white font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isToggling}
                onClick={handleConfirmToggle}
                className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer ${
                  isAccepting
                    ? 'bg-rose-900 hover:bg-rose-800 text-white'
                    : 'bg-[#0E4825] hover:bg-[#135d30] text-emerald-300'
                }`}
              >
                {isToggling
                  ? 'Updating...'
                  : isAccepting
                  ? 'Yes, Pause Store'
                  : 'Yes, Open Store'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default BranchSwitcher;
