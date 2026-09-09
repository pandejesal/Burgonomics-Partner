import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Ticket } from '@/types';

/** Payload the page turns into the real `updateTicket` mutation. */
export interface TicketResolutionPayload {
  ticketId: string;
  action: string;
  notes: string;
  grillCoinsAmount?: number;
}

interface TicketResolutionModalProps {
  ticket: Ticket | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmResolution: (payload: TicketResolutionPayload) => Promise<void> | void;
}

const ACTIONS = [
  { id: 'standard', label: 'Standard resolution' },
  { id: 'refund', label: 'Refund issued' },
  { id: 'goodwill', label: 'Goodwill (coupon / coins)' },
  { id: 'escalate_brand', label: 'Escalated to brand support' },
  { id: 'escalate_dev', label: 'Escalated to developer team' },
];

/**
 * TicketResolutionModal — form shell only. Collects action + notes (+ optional
 * Grill Coins credit) and hands the payload to the page, which confirms and
 * performs the real mutation. Validation is inline (no alert()); failures
 * surface inline — the page already toasts.
 */
export function TicketResolutionModal({
  ticket,
  isOpen,
  onClose,
  onConfirmResolution,
}: TicketResolutionModalProps) {
  const [action, setAction] = useState('standard');
  const [notes, setNotes] = useState('');
  const [grillCoins, setGrillCoins] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAction('standard');
      setNotes('');
      setGrillCoins('');
      setFormError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, ticket?.id]);

  if (!isOpen || !ticket) return null;

  const handleConfirm = async () => {
    const trimmed = notes.trim();
    if (!trimmed) {
      setFormError('Resolution notes are required — describe what was done.');
      return;
    }
    let grillCoinsAmount: number | undefined;
    if (grillCoins.trim()) {
      const parsed = Number(grillCoins);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setFormError('Grill Coins must be a positive whole number, or left empty.');
        return;
      }
      grillCoinsAmount = parsed;
    }
    setFormError(null);
    setIsSubmitting(true);
    try {
      await onConfirmResolution({ ticketId: ticket.id, action, notes: trimmed, grillCoinsAmount });
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Resolution failed — ticket still active, retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Resolve ticket ${ticket.ticketNumber || ticket.id}`}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-white uppercase tracking-wider">Resolve ticket</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close resolution dialog"
            className="p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-xl bg-neutral-950 border border-neutral-700 text-neutral-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-neutral-400">
          {ticket.ticketNumber || ticket.id.slice(0, 8)} — {ticket.title}
        </p>

        <label className="block space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Resolution action
          </span>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-neutral-950 border border-neutral-700 text-white text-xs font-bold focus:outline-none focus:border-[#FF6600] cursor-pointer"
          >
            {ACTIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Resolution notes (required)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What was done to resolve this incident?"
            className="w-full px-3 py-2.5 rounded-xl bg-neutral-950 border border-neutral-700 text-white placeholder-neutral-500 text-xs font-medium focus:outline-none focus:border-[#FF6600]"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Grill Coins credit (optional)
          </span>
          <input
            type="number"
            min={1}
            step={1}
            value={grillCoins}
            onChange={(e) => setGrillCoins(e.target.value)}
            placeholder="e.g. 50"
            className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-neutral-950 border border-neutral-700 text-white placeholder-neutral-500 text-xs font-medium focus:outline-none focus:border-[#FF6600]"
          />
        </label>

        {formError && (
          <p role="alert" className="text-xs font-bold text-rose-400">
            {formError}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 min-h-[44px] rounded-xl bg-neutral-950 border border-neutral-700 text-neutral-300 hover:text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#0E4825] hover:bg-[#135d30] disabled:opacity-50 text-emerald-300 font-bold text-xs transition-colors cursor-pointer"
          >
            {isSubmitting ? 'Resolving…' : 'Confirm resolution'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TicketResolutionModal;
