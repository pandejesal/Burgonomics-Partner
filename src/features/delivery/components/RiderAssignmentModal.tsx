import React, { useState } from 'react';
import { X, UserCheck } from 'lucide-react';
import type { Order } from '@/types';
import type { InHouseRiderInfo } from '../hooks/usePorterLogistics';
import { isSafeTelNumber } from '@/utils/urlSafety';

interface RiderAssignmentModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmAssign: (orderId: string, rider: InHouseRiderInfo) => void;
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

  if (!isOpen || !order) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    const riderInfo: InHouseRiderInfo = {
      name: customName.trim(),
      phone: customPhone.trim(),
      vehicleNumber: customVehicle.trim() || undefined,
    };

    onConfirmAssign(order.id, riderInfo);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#0F0F0F] border border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-black text-white">
              Assign In-House Delivery Staff
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <p className="text-neutral-400">
            Assign internal store rider for Order #{order.id.slice(-6).toUpperCase()} to bypass 3PL courier fees.
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
          </div>

          {/* Rider form */}
          <div className="pt-2 border-t border-neutral-800">
            <div className="mt-3 space-y-3 p-3 rounded-2xl bg-neutral-950 border border-neutral-800">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-400 mb-1">Rider Full Name</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Rahul Dave"
                    className="w-full px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-700 text-white text-xs font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-400 mb-1">Mobile Phone Number</label>
                  <input
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
                  <label className="block text-[11px] font-bold text-neutral-400 mb-1">Vehicle Registration #</label>
                  <input
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
              className="px-4 py-2 rounded-xl bg-neutral-900 text-neutral-300 hover:text-white font-bold"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#0E4825] hover:bg-[#135d30] text-emerald-300 font-black uppercase tracking-wider shadow-md transition-all cursor-pointer"
            >
              Assign Rider
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RiderAssignmentModal;
