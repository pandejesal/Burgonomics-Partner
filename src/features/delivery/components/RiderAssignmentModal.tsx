import React, { useEffect, useState } from 'react';
import { X, UserCheck, Loader2 } from 'lucide-react';
import type { Order } from '@/types';
import type { InHouseRiderInfo } from '../hooks/usePorterLogistics';
import { isSafeTelNumber } from '@/utils/urlSafety';

interface RiderAssignmentModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  /** May be async: a failed server response must NOT close or reset anything. */
  onConfirmAssign: (orderId: string, rider: InHouseRiderInfo) => unknown;
}

export function RiderAssignmentModal({
  order,
  isOpen,
  onClose,
  onConfirmAssign,
}: RiderAssignmentModalProps) {
  // No preset rider list: the old STORE_RIDERS hardcoded real people's
  // names/phones/plates and pre-selected the first entry, so taps without
  // touching the list booked a stranger. Every assignment now requires an
  // explicitly typed name + validated phone.
  const [customName, setCustomName] = useState('');
  const [customPhone, setCustomPhone] = useState('+91 ');
  const [customVehicle, setCustomVehicle] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  // Async truth: submission in flight (duplicate submits disabled) and the
  // real server failure (inputs retained, modal stays open for a retry).
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Errors are per-attempt AND per-order: opening the modal again (or for a
  // different order) must not show a stale failure from a previous one. The
  // typed rider itself is kept across attempts (the modal instance is reused)
  // so a same-order retry needs no re-typing.
  useEffect(() => {
    setSubmitError(null);
    setFormError(null);
    setPhoneError(null);
  }, [order?.id, isOpen]);

  if (!isOpen || !order) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Pending submission guard: one server call per confirmed attempt.
    if (submitting) return;
    // Loop: custom rider phone was type=tel + required only — the '+91 '
    // stub and short/invalid numbers sailed through into dispatch records
    // (and tel: links). Require a real name and a real 10+-digit number,
    // fail loud inline. No placeholder fallbacks (99999/Store Fleet).
    if (!customName.trim()) {
      setFormError('Enter the rider\u2019s full name.');
      return;
    }
    const digits = customPhone.replace(/\D/g, '');
    if (!isSafeTelNumber(customPhone) || digits.length < 10) {
      setPhoneError('Enter a valid 10-digit mobile number.');
      return;
    }
    setFormError(null);
    setPhoneError(null);
    setSubmitError(null);
    const riderInfo: InHouseRiderInfo = {
      name: customName.trim(),
      phone: customPhone.trim(),
      vehicleNumber: customVehicle.trim() || undefined,
    };

    setSubmitting(true);
    try {
      await onConfirmAssign(order.id, riderInfo);
    } catch (err) {
      // FAILED assignment: keep the modal open, keep every input, and say
      // the failure out loud. Close/reset happens ONLY after confirmed
      // success. No fake rider fallback.
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Could not reach the dispatcher.';
      setSubmitError(`Assignment failed — ${message} Your entry was kept; retry when ready.`);
      setSubmitting(false);
      return;
    }
    // Confirmed success: clear retention, then close once.
    setCustomName('');
    setCustomPhone('+91 ');
    setCustomVehicle('');
    setFormError(null);
    setPhoneError(null);
    setSubmitError(null);
    setSubmitting(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rider-modal-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-[#0F0F0F] border border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-black text-white" id="rider-modal-title">
              Assign In-House Delivery Staff
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close assign rider dialog"
            data-testid="rider-modal-close"
            onClick={onClose}
            disabled={submitting}
            className="p-2 min-h-[44px] min-w-[44px] grid place-items-center text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <p className="text-neutral-400">
          Assign your own store rider for Order #{order.id.slice(-6).toUpperCase()} — a first-choice delivery path that needs no third-party courier quote.
          </p>

          {/* Rider details (always explicit — no preset list) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase text-neutral-400">
              Rider Details
            </label>
            {formError && (
              <p role="alert" className="text-[11px] font-bold text-rose-400">
                {formError}
              </p>
            )}
            {submitError && (
              <p role="alert" className="text-[11px] font-bold text-rose-400">
                {submitError}
              </p>
            )}
          </div>

          {/* Rider form */}
          <div className="pt-2 border-t border-neutral-800">
            <div className="mt-3 space-y-3 p-3 rounded-2xl bg-neutral-950 border border-neutral-800">
                <div>
                  <label htmlFor="rider-name" className="block text-[11px] font-bold text-neutral-400 mb-1">Rider Full Name</label>
                  <input
                    id="rider-name"
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Rahul Dave"
                    className="w-full px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-700 text-white text-xs font-semibold"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="rider-phone" className="block text-[11px] font-bold text-neutral-400 mb-1">Mobile Phone Number</label>
                  <input
                    id="rider-phone"
                    type="tel"
                    value={customPhone}
                    onChange={(e) => {
                      setCustomPhone(e.target.value);
                      if (phoneError) setPhoneError(null);
                    }}
                    aria-invalid={!!phoneError}
                    className="w-full px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-700 text-white text-xs font-semibold"
                    required
                  />
                  {phoneError && (
                    <p role="alert" className="text-[11px] font-bold text-rose-400 mt-1">
                      {phoneError}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="rider-vehicle" className="block text-[11px] font-bold text-neutral-400 mb-1">Vehicle Registration #</label>
                  <input
                    id="rider-vehicle"
                    type="text"
                    value={customVehicle}
                    onChange={(e) => setCustomVehicle(e.target.value)}
                    placeholder="e.g. GJ-01-XX-1234"
                    className="w-full px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-700 text-white text-xs font-semibold"
                  />
                </div>
              </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-neutral-900 text-neutral-300 hover:text-white font-bold min-h-[44px] disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-[#0E4825] hover:bg-[#135d30] text-emerald-300 font-black uppercase tracking-wider shadow-md transition-all cursor-pointer min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              <span>{submitting ? 'Assigning…' : 'Assign Rider'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RiderAssignmentModal;
