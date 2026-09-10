import React, { useState } from 'react';
import { X, UserCheck, Bike, CheckCircle2 } from 'lucide-react';
import type { Order } from '@/types';
import type { InHouseRiderInfo } from '../hooks/usePorterLogistics';
import { isSafeTelNumber } from '@/utils/urlSafety';

interface RiderAssignmentModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmAssign: (orderId: string, rider: InHouseRiderInfo) => void;
}

const STORE_RIDERS: InHouseRiderInfo[] = [
  { name: 'Ramesh Patel', phone: '+91 98250 11223', vehicleNumber: 'GJ-01-EE-8821' },
  { name: 'Sanjay Varma', phone: '+91 97123 44556', vehicleNumber: 'GJ-27-AK-1029' },
  { name: 'Jayesh Parmar', phone: '+91 99090 77881', vehicleNumber: 'GJ-06-BQ-5544' },
];

export function RiderAssignmentModal({
  order,
  isOpen,
  onClose,
  onConfirmAssign,
}: RiderAssignmentModalProps) {
  const [selectedRider, setSelectedRider] = useState<InHouseRiderInfo>(STORE_RIDERS[0]);
  const [customName, setCustomName] = useState('');
  const [customPhone, setCustomPhone] = useState('+91 ');
  const [customVehicle, setCustomVehicle] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  if (!isOpen || !order) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Loop: custom rider phone was type=tel + required only — the '+91 '
    // stub and short/invalid numbers sailed through into dispatch records
    // (and tel: links). Require a real 10+-digit number, fail loud inline.
    if (useCustom) {
      const digits = customPhone.replace(/\D/g, '');
      if (!isSafeTelNumber(customPhone) || digits.length < 10) {
        setPhoneError('Enter a valid 10-digit mobile number.');
        return;
      }
      setPhoneError(null);
    }
    const riderInfo: InHouseRiderInfo = useCustom
      ? {
          name: customName || 'Store In-House Rider',
          phone: customPhone || '+91 99999 99999',
          vehicleNumber: customVehicle || 'Store Fleet',
        }
      : selectedRider;

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

          {/* Pre-defined Store Riders List */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase text-neutral-400">
              Select Available Staff
            </label>
            <div className="space-y-2">
              {STORE_RIDERS.map((r, idx) => {
                const isSelected = !useCustom && selectedRider.name === r.name;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSelectedRider(r);
                      setUseCustom(false);
                    }}
                    className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#0E4825] border-emerald-500 text-white shadow-xs'
                        : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white'
                    }`}
                  >
                    <div>
                      <p className="font-black text-sm">{r.name}</p>
                      <p className="text-[11px] text-neutral-400">{r.phone} • {r.vehicleNumber}</p>
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-emerald-300" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toggle Custom Rider */}
          <div className="pt-2 border-t border-neutral-800">
            <button
              type="button"
              onClick={() => setUseCustom(!useCustom)}
              className="text-[#FF6600] font-bold text-xs hover:underline cursor-pointer"
            >
              {useCustom ? '← Choose from staff list' : '+ Enter other rider details'}
            </button>

            {useCustom && (
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
            )}
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
