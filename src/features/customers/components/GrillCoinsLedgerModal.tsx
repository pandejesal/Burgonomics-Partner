import React, { useState } from 'react';
import { X, Coins, Plus, Minus, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { Customer } from '@/types';

export type AdjustmentReasonCode =
  | 'CUSTOMER_DELIGHT'
  | 'ORDER_COMPENSATION'
  | 'PROMO_BONUS'
  | 'MANUAL_CORRECTION'
  | 'STORE_COMPENSATION';

export interface WalletAdjustmentPayload {
  customerId: string;
  delta: number;
  reason: AdjustmentReasonCode;
  notes?: string;
}

interface GrillCoinsLedgerModalProps {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmAdjustment: (payload: WalletAdjustmentPayload) => Promise<void> | void;
}

const REASON_OPTIONS: { code: AdjustmentReasonCode; label: string; description: string }[] = [
  {
    code: 'ORDER_COMPENSATION',
    label: 'Order Compensation',
    description: 'Delayed delivery, missing item, or wrong preparation',
  },
  {
    code: 'CUSTOMER_DELIGHT',
    label: 'Customer Delight',
    description: 'VIP recognition or loyalty milestone reward',
  },
  {
    code: 'PROMO_BONUS',
    label: 'Promotional Bonus',
    description: 'Marketing campaign or offline store launch credit',
  },
  {
    code: 'MANUAL_CORRECTION',
    label: 'Manual Balance Correction',
    description: 'Fixing duplicate deduction or reconciliation variance',
  },
  {
    code: 'STORE_COMPENSATION',
    label: 'In-Store Dispute Resolution',
    description: 'Cash counter tender settlement adjustment',
  },
];

export function GrillCoinsLedgerModal({
  customer,
  isOpen,
  onClose,
  onConfirmAdjustment,
}: GrillCoinsLedgerModalProps) {
  const [mode, setMode] = useState<'credit' | 'debit'>('credit');
  const [points, setPoints] = useState<number>(50);
  const [reason, setReason] = useState<AdjustmentReasonCode>('ORDER_COMPENSATION');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen || !customer) return null;

  const currentCoins = customer.loyaltyPoints || 0;
  const delta = mode === 'credit' ? Math.abs(points) : -Math.abs(points);
  const calculatedBalance = currentCoins + delta;
  const isInvalidDebit = calculatedBalance < 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // DOM min/max is advisory (paste/devtools bypass it): enforce integer +
    // 1..5000 cap here too. Server re-validates (±5000, non-zero).
    if (!Number.isInteger(points) || points < 1 || points > 5000) {
      toast.error('Enter a whole number of coins between 1 and 5000.');
      return;
    }
    if (isInvalidDebit) {
      toast.error('Customer wallet balance cannot be negative');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirmAdjustment({
        customerId: customer.id,
        delta,
        reason,
        notes,
      });
      toast.success(
        `Successfully ${mode === 'credit' ? 'credited' : 'debited'} ${Math.abs(delta)} Grill Coins for ${customer.name}`
      );
      onClose();
    } catch (err: any) {
      // Surface the server reason (branch scope, validation) — never a fake success.
      toast.error(err?.message || 'Failed to adjust Grill Coins ledger');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#0F0F0F] border border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-950 border border-amber-500/40 text-amber-400">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">Adjust Grill Coins Ledger</h2>
              <p className="text-[11px] text-neutral-400">
                {customer.name} ({customer.phone})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Current Balance vs Projected */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800">
            <div>
              <span className="text-[10px] font-bold text-neutral-400 block uppercase">
                Current Coins
              </span>
              <span className="font-mono text-xl font-black text-white">{currentCoins} 🪙</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-neutral-400 block uppercase">
                New Projected Balance
              </span>
              <span
                className={`font-mono text-xl font-black ${
                  isInvalidDebit ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {calculatedBalance} 🪙
              </span>
            </div>
          </div>

          {/* Credit vs Debit Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-neutral-950 border border-neutral-800">
            <button
              type="button"
              onClick={() => setMode('credit')}
              className={`py-2 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                mode === 'credit'
                  ? 'bg-[#0E4825] border border-emerald-500/40 text-emerald-300 shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Credit Points</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('debit')}
              className={`py-2 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                mode === 'debit'
                  ? 'bg-rose-950 border border-rose-500/40 text-rose-300 shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Minus className="w-4 h-4" />
              <span>Deduct Points</span>
            </button>
          </div>

          {/* Points Amount Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase text-neutral-400">
              Grill Coins Delta Amount
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="5000"
                value={points}
                onChange={(e) => setPoints(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-white font-mono font-bold text-sm"
                required
              />
            </div>
            {/* Quick Chips */}
            <div className="flex items-center gap-1.5 pt-1">
              {[25, 50, 100, 250, 500].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setPoints(val)}
                  className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 font-mono text-[11px] font-bold text-neutral-300 hover:text-white cursor-pointer"
                >
                  +{val}
                </button>
              ))}
            </div>
          </div>

          {/* Mandatory Reason Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase text-neutral-400">
              Mandatory Audit Reason Code
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as AdjustmentReasonCode)}
              className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-white text-xs font-semibold focus:outline-none focus:border-[#FF6600]"
            >
              {REASON_OPTIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label} — {r.description}
                </option>
              ))}
            </select>
          </div>

          {/* Optional Manager Notes */}
          <div className="space-y-1">
            <label className="block text-xs font-bold uppercase text-neutral-400">
              Internal Audit Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Compensated for 20m late delivery on Order #94821"
              className="w-full px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-700 text-white text-xs placeholder-neutral-500"
            />
          </div>

          {isInvalidDebit && (
            <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-[11px] flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
              <span>Deduction exceeds customer available balance.</span>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-neutral-900 text-neutral-300 hover:text-white font-bold cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || isInvalidDebit || points <= 0}
              className="px-5 py-2 rounded-xl bg-[#0E4825] hover:bg-[#135d30] text-emerald-300 font-black text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Confirm Audit Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default GrillCoinsLedgerModal;
