import React, { useState } from 'react';
import { X, Clock, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { MenuItem } from '@/types';

export type EightSixDuration = '2_hours' | 'rest_of_day' | 'indefinite';

interface Instant86ingModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MenuItem | null;
  onConfirm86: (itemId: string, duration: EightSixDuration, reason: string) => Promise<void>;
  loading?: boolean;
}

export function Instant86ingModal({
  isOpen,
  onClose,
  item,
  onConfirm86,
  loading = false,
}: Instant86ingModalProps) {
  const [duration, setDuration] = useState<EightSixDuration>('rest_of_day');
  const [reason, setReason] = useState<string>('Raw material / inventory stockout');

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm86(item.id, duration, reason);
    onClose();
  };

  const durationOptions: { id: EightSixDuration; label: string; subtext: string }[] = [
    {
      id: '2_hours',
      label: 'Next 2 Hours',
      subtext: 'Auto-reactivates after kitchen rush (prep time recovery)',
    },
    {
      id: 'rest_of_day',
      label: 'Rest of Today',
      subtext: 'Automatically re-enables at 06:00 AM tomorrow',
    },
    {
      id: 'indefinite',
      label: 'Turn Off Indefinitely',
      subtext: 'Remains unavailable until manually switched back ON',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#112415] border border-[#1E3A24] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 bg-[#0A0A0A] border-b border-[#1E3A24] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">86 Item (Mark Out of Stock)</h2>
              <p className="text-[11px] text-zinc-400">Syncs immediately with POS & Customer App</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3 bg-[#0A0A0A] rounded-xl border border-[#1E3A24] flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-white">{item.name}</div>
              <div className="text-[10px] text-zinc-400 font-mono">₹{item.price} • {item.category || item.categoryId}</div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
              86ing
            </span>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-zinc-300">
              Select 86 Duration
            </label>
            <div className="space-y-2">
              {durationOptions.map((opt) => (
                <label
                  key={opt.id}
                  onClick={() => setDuration(opt.id)}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                    duration === opt.id
                      ? 'bg-[#0E4825] border-[#4ADE80] text-white shadow-sm'
                      : 'bg-[#0A0A0A] border-[#1E3A24] text-zinc-300 hover:border-[#4ADE80]/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="duration"
                    value={opt.id}
                    checked={duration === opt.id}
                    onChange={() => setDuration(opt.id)}
                    className="mt-0.5 text-[#FF6600] focus:ring-[#FF6600]"
                  />
                  <div>
                    <div className="text-xs font-bold">{opt.label}</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">{opt.subtext}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-300">
              Reason / Kitchen Notes
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-xs text-white focus:outline-none focus:border-[#4ADE80]"
            >
              <option value="Raw material / inventory stockout">Raw material / inventory stockout</option>
              <option value="Equipment breakdown / fryer offline">Equipment breakdown / fryer offline</option>
              <option value="Packaging shortage">Packaging shortage</option>
              <option value="Quality check failure">Quality check failure</option>
              <option value="Peak rush throttling">Peak rush throttling</option>
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#0A0A0A] text-zinc-300 hover:text-white rounded-xl text-xs font-bold border border-[#1E3A24] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-[#FF6600] hover:bg-[#e05a00] text-white rounded-xl text-xs font-bold transition-colors shadow-md disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{loading ? 'Disabling...' : 'Confirm 86 Item'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
