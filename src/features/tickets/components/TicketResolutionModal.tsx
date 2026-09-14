import React, { useState } from 'react';
import { X, CheckCircle2, Coins, RefreshCw, MessageSquare, AlertCircle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { Ticket } from '@/types';

export type ResolutionActionCode =
  | 'REFUND_ORDER'
  | 'CREDIT_GRILL_COINS'
  | 'REMAKE_BURGER'
  | 'EXPLAINED_TO_CUSTOMER';

export interface TicketResolutionPayload {
  ticketId: string;
  action: ResolutionActionCode;
  notes: string;
  grillCoinsAmount?: number;
  refundAmount?: number;
  isInternalOnly?: boolean;
}

interface TicketResolutionModalProps {
  ticket: Ticket | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmResolution: (payload: TicketResolutionPayload) => Promise<void> | void;
}

const ACTION_OPTIONS: { code: ResolutionActionCode; label: string; icon: string; description: string }[] = [
  {
    code: 'CREDIT_GRILL_COINS',
    label: 'Apology Grill Coins Credit',
    icon: '🪙',
    description: 'Instantly reward customer loyalty wallet with apology points',
  },
  {
    code: 'REFUND_ORDER',
    label: 'Order Refund via Razorpay',
    icon: '💳',
    description: 'Process full or partial payment refund to customer account',
  },
  {
    code: 'REMAKE_BURGER',
    label: 'Kitchen Remake / Fresh Re-dispatch',
    icon: '🍔',
    description: 'Send replacement order ticket to KDS for priority grilling',
  },
  {
    code: 'EXPLAINED_TO_CUSTOMER',
    label: 'Apology & Customer Explanation',
    icon: '💬',
    description: 'Clarify delivery delay or store policy directly with customer',
  },
];

export function TicketResolutionModal({
  ticket,
  isOpen,
  onClose,
  onConfirmResolution,
}: TicketResolutionModalProps) {
  const [action, setAction] = useState<ResolutionActionCode>('CREDIT_GRILL_COINS');
  const [notes, setNotes] = useState('');
  const [coins, setCoins] = useState<number>(100);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !ticket) return null;

  const shortCode =
    (ticket as any).ticketNumber || ticket.id.slice(-6).toUpperCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      toast.error('Please enter resolution notes');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirmResolution({
        ticketId: ticket.id,
        action,
        notes: notes.trim(),
        grillCoinsAmount: action === 'CREDIT_GRILL_COINS' ? coins : undefined,
      });
      toast.success(`Ticket #${shortCode} successfully resolved`);
      onClose();
    } catch (err) {
      toast.error('Failed to resolve support ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#0F0F0F] border border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#0E4825] border border-emerald-500/40 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">Resolve Support Ticket</h2>
              <p className="text-[11px] text-neutral-400">
                Ticket #{shortCode} • {ticket.title || (ticket as any).subject || 'Customer Issue'}
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
          {/* Action Code Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase text-neutral-400">
              Resolution Action Code
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ACTION_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setAction(opt.code)}
                  className={`p-3 rounded-2xl border text-left transition-colors cursor-pointer ${
                    action === opt.code
                      ? 'bg-[#0E4825] border-emerald-500 text-white shadow-xs'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white'
                  }`}
                >
                  <div className="text-lg mb-1">{opt.icon}</div>
                  <span className="font-bold text-xs block leading-tight">{opt.label}</span>
                  <span className="text-[10px] text-neutral-400 block mt-0.5 leading-snug">
                    {opt.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Grill Coins Options if selected */}
          {action === 'CREDIT_GRILL_COINS' && (
            <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase text-amber-400 flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5" />
                  <span>Apology Grill Coins to Credit</span>
                </label>
                <span className="font-mono font-black text-sm text-white">{coins} 🪙</span>
              </div>
              <div className="flex items-center gap-2">
                {[50, 100, 150, 200, 500].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCoins(val)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      coins === val
                        ? 'bg-amber-950 border-amber-500 text-amber-300'
                        : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:text-white'
                    }`}
                  >
                    +{val}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Resolution Notes */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase text-neutral-400">
              Resolution Note & Customer Reply
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Apologized for the delay and credited 100 Grill Coins to wallet. Customer satisfied."
              className="w-full px-3 py-2 rounded-2xl bg-neutral-900 border border-neutral-700 text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-[#FF6600]"
              required
            />
          </div>

          {/* Actions */}
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
              disabled={isSubmitting || !notes.trim()}
              className="px-5 py-2.5 rounded-xl bg-[#0E4825] hover:bg-[#135d30] text-emerald-300 font-black text-xs uppercase tracking-wider shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Confirm & Close Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TicketResolutionModal;
