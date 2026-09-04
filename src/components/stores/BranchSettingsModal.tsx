import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Store,
  Clock,
  MapPin,
  Phone,
  Bike,
  Megaphone,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { Branch, AcceptingOrdersStatus } from '@/types';

interface BranchSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  branch: Branch | null;
  onSave: (branchId: string, updatedSettings: Partial<Branch>) => Promise<void>;
  loading?: boolean;
}

export const BranchSettingsModal: React.FC<BranchSettingsModalProps> = ({
  isOpen,
  onClose,
  branch,
  onSave,
  loading = false,
}) => {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<AcceptingOrdersStatus>('open');
  const [openTime, setOpenTime] = useState('11:00 AM');
  const [closeTime, setCloseTime] = useState('11:30 PM');
  const [prepTime, setPrepTime] = useState(20);
  const [deliveryRadius, setDeliveryRadius] = useState(7);
  const [announcement, setAnnouncement] = useState('');
  const [petpoojaStoreId, setPetpoojaStoreId] = useState('');

  useEffect(() => {
    if (branch) {
      setName(branch.name || '');
      setCity(branch.city || '');
      setAddress(branch.address || '');
      setPhone(branch.phone || '');
      setStatus(branch.acceptingOrdersStatus || (branch.active ? 'open' : 'closed'));
      setOpenTime(branch.operatingHours?.open || '11:00 AM');
      setCloseTime(branch.operatingHours?.close || '11:30 PM');
      setPrepTime(branch.prepTimeMinutes || 20);
      setDeliveryRadius(branch.deliveryRadiusKm || 7);
      setAnnouncement(branch.announcementBanner || '');
      setPetpoojaStoreId(branch.petpoojaStoreId || '');
    }
  }, [branch]);

  if (!isOpen || !branch) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(branch.id, {
      name,
      city,
      address,
      phone,
      active: status !== 'closed',
      acceptingOrdersStatus: status,
      operatingHours: { open: openTime, close: closeTime },
      prepTimeMinutes: prepTime,
      deliveryRadiusKm: deliveryRadius,
      announcementBanner: announcement,
      petpoojaStoreId,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#132A17] border border-[#234B2A] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl text-white">
        {/* Header */}
        <div className="p-6 border-b border-[#234B2A] flex items-center justify-between sticky top-0 bg-[#132A17] z-10">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-[#1E3A24] text-[#D95D0F]">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Delivery & Outlet Settings</h2>
              <p className="text-xs text-zinc-400">
                Live configuration synced in real-time to the Burgonomics Delivery App
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-[#1E3A24] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Order Acceptance Status Switcher */}
          <div className="bg-[#0D0F0D] p-4 rounded-xl border border-[#234B2A] space-y-2">
            <label className="block text-xs font-bold text-zinc-300">
              Live Order Acceptance Status (Delivery App)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setStatus('open')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 ${
                  status === 'open'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-[#132A17] text-zinc-400 hover:text-white border border-[#234B2A]'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-emerald-300"></span>
                <span>Accepting Orders</span>
              </button>

              <button
                type="button"
                onClick={() => setStatus('busy')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 ${
                  status === 'busy'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-[#132A17] text-zinc-400 hover:text-white border border-[#234B2A]'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-amber-300"></span>
                <span>Busy (Delays)</span>
              </button>

              <button
                type="button"
                onClick={() => setStatus('closed')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 ${
                  status === 'closed'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-[#132A17] text-zinc-400 hover:text-white border border-[#234B2A]'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-rose-300"></span>
                <span>Temporarily Closed</span>
              </button>
            </div>
          </div>

          {/* Announcement Banner */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center space-x-1.5">
              <Megaphone className="w-3.5 h-3.5 text-[#D95D0F]" />
              <span>Customer Announcement Banner (Delivery App Header)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 🔥 Weekend Special: Flat 20% off on all Gourmet Burgers!"
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
            />
          </div>

          {/* Operational Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Kitchen Prep Time (Minutes)</span>
              </label>
              <input
                type="number"
                min="5"
                max="90"
                value={prepTime}
                onChange={(e) => setPrepTime(parseInt(e.target.value) || 20)}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white focus:outline-none focus:border-[#D95D0F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center space-x-1.5">
                <Bike className="w-3.5 h-3.5 text-cyan-400" />
                <span>Delivery Radius (Kilometers)</span>
              </label>
              <input
                type="number"
                min="1"
                max="25"
                value={deliveryRadius}
                onChange={(e) => setDeliveryRadius(parseInt(e.target.value) || 7)}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white focus:outline-none focus:border-[#D95D0F]"
              />
            </div>
          </div>

          {/* Operating Hours */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Opening Time
              </label>
              <input
                type="text"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
                placeholder="e.g. 11:00 AM"
                className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white focus:outline-none focus:border-[#D95D0F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Closing Time
              </label>
              <input
                type="text"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                placeholder="e.g. 11:30 PM"
                className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white focus:outline-none focus:border-[#D95D0F]"
              />
            </div>
          </div>

          {/* Contact Details & Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Branch Display Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white focus:outline-none focus:border-[#D95D0F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">City</label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white focus:outline-none focus:border-[#D95D0F]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Full Outlet Address
            </label>
            <textarea
              rows={2}
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white focus:outline-none focus:border-[#D95D0F]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Contact Phone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white focus:outline-none focus:border-[#D95D0F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Petpooja POS Store ID
              </label>
              <input
                type="text"
                value={petpoojaStoreId}
                onChange={(e) => setPetpoojaStoreId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white focus:outline-none focus:border-[#D95D0F]"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 flex items-center justify-end space-x-3 border-t border-[#234B2A]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#1E3A24] text-zinc-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-[#D95D0F] hover:bg-[#b84d0b] text-white disabled:opacity-50 flex items-center space-x-1.5 shadow-md"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'Broadcasting...' : 'Save & Sync to Delivery App'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
