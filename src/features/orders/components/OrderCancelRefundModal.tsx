import React, { useState, useEffect, useRef } from 'react';
import { X, AlertTriangle, RefreshCw, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import type { Order } from '@/types';

interface OrderCancelRefundModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onConfirmCancel: (reason: string, notes: string, shouldRefund: boolean) => Promise<void> | void;
}

const REASON_CODES = [
  { code: 'OUT_OF_STOCK', label: 'Item(s) Out of Stock' },
  { code: 'CUSTOMER_REQUEST', label: 'Customer Requested Cancellation' },
  { code: 'STORE_OVERLOAD', label: 'Store High Volume / Kitchen Overload' },
  { code: 'WRONG_ADDRESS', label: 'Invalid Delivery Address / Out of Range' },
  { code: 'PAYMENT_FAILURE', label: 'Payment Reconciliation Error' },
  { code: 'OTHER', label: 'Other Operational Issue' },
];

export function OrderCancelRefundModal({
  order,
  isOpen,
  onClose,
  onConfirmCancel,
}: OrderCancelRefundModalProps) {
  const { user } = useAuthStore();
  const [selectedReason, setSelectedReason] = useState('CUSTOMER_REQUEST');
  const [customNotes, setCustomNotes] = useState('');
  const [shouldRefund, setShouldRefund] = useState(order.paymentStatus === 'completed');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);

  // ESC closes; focus moves into the dialog on open (hook runs before the
  // early return below — order stays stable across renders).
  useEffect(() => {
    if (!isOpen) return;
    dialogRef.current?.querySelector<HTMLElement>('select, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // RBAC Permission Check — fail CLOSED. The old list named roles that do
  // not exist ('superadmin', 'branch_manager') and granted access when the
  // role was MISSING entirely.
  const allowedRoles = ['brand_owner', 'developer', 'branch_owner'];
  const hasPermission = !!user?.role && allowedRoles.includes(user.role);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onConfirmCancel(selectedReason, customNotes, shouldRefund);
      onClose();
    } catch (err) {
      console.error('Cancellation failed:', err);
      setSubmitError(err instanceof Error ? err.message : 'Cancellation failed — please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-order-title"
        className="bg-[#0F0F0F] border border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-4 bg-red-950/40 border-b border-red-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-400">
            <AlertTriangle className="w-5 h-5" />
            <h2 id="cancel-order-title" className="text-base font-black">Cancel Order #{order.id.slice(-6).toUpperCase()}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cancel order dialog"
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {!hasPermission ? (
          <div className="p-6 text-center space-y-3">
            <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
            <h3 className="font-black text-white text-base">Manager Authorization Required</h3>
            <p className="text-xs text-neutral-400">
              Only Store Managers, Franchise Owners, or Admins can cancel placed orders and trigger financial refunds.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-4 py-2 rounded-xl bg-neutral-800 text-white font-bold text-xs"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
            {/* Reason Selector */}
            <div>
              <label htmlFor="cancel-reason" className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                Cancellation Reason Code
              </label>
              <select
                id="cancel-reason"
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-white font-semibold focus:outline-none focus:border-red-500"
              >
                {REASON_CODES.map((r) => (
                  <option key={r.code} value={r.code} className="bg-neutral-900 text-white">
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Notes */}
            <div>
              <label htmlFor="cancel-notes" className="block text-xs font-bold text-neutral-400 mb-1">
                Internal Remarks / Customer Explanation
              </label>
              <textarea
                id="cancel-notes"
                rows={2}
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                placeholder="Explain reason for store records..."
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-white font-medium focus:outline-none focus:border-red-500"
              />
            </div>

            {/* Refund Options */}
            {order.paymentStatus === 'completed' && (
              <div className="p-3 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shouldRefund}
                    onChange={(e) => setShouldRefund(e.target.checked)}
                    className="rounded border-neutral-700 text-rose-500 focus:ring-0"
                  />
                  <span className="font-bold text-white text-xs">
                    Issue 100% Instant Refund (₹{order.total})
                  </span>
                </label>
                <p className="text-[11px] text-neutral-400 pl-5">
                  Reverses customer transaction via Razorpay API route split back to the original payment source.
                </p>
              </div>
            )}

            {/* Submit Error */}
            {submitError && (
              <div role="alert" className="p-3 rounded-2xl bg-red-950/50 border border-red-900/60 text-rose-200 font-semibold flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Submit Action */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-neutral-900 text-neutral-300 hover:text-white font-bold"
              >
                Go Back
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Confirm Cancellation</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default OrderCancelRefundModal;
