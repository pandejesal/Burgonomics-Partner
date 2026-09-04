import React, { useState } from 'react';
import { X, Store, Calendar, MapPin, Phone, Image, CheckCircle2 } from 'lucide-react';
import type { FutureStoreInput } from '@/types';

interface AddFutureStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (storeData: FutureStoreInput) => Promise<void>;
  loading?: boolean;
}

export const AddFutureStoreModal: React.FC<AddFutureStoreModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
}) => {
  const [formData, setFormData] = useState<FutureStoreInput>({
    name: '',
    city: 'Surat',
    address: '',
    phone: '',
    expectedLaunchDate: 'October 2026',
    bannerImage:
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
    petpoojaStoreId: '',
    allowComingSoonSubscribers: true,
    lat: 21.1702,
    lng: 72.8311,
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.address.trim()) {
      alert('Please provide store name and address');
      return;
    }
    await onSubmit(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#132A17] border border-[#234B2A] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl text-white">
        {/* Header */}
        <div className="p-6 border-b border-[#234B2A] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-[#1E3A24] text-[#D95D0F]">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Add Future Store</h2>
              <p className="text-xs text-zinc-400">
                Publish upcoming outlet to Main Delivery App 'Coming Soon' carousel
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Store Name <span className="text-[#D95D0F]">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Burgonomics Mumbai Bandra West"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">City</label>
              <select
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white focus:outline-none focus:border-[#D95D0F]"
              >
                <option value="Surat">Surat</option>
                <option value="Ahmedabad">Ahmedabad</option>
                <option value="Vadodara">Vadodara</option>
                <option value="Rajkot">Rajkot</option>
                <option value="Mumbai">Mumbai</option>
                <option value="Pune">Pune</option>
                <option value="Bengaluru">Bengaluru</option>
                <option value="Delhi NCR">Delhi NCR</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Expected Launch Timeline
              </label>
              <input
                type="text"
                placeholder="e.g. November 2026 or Q4 2026"
                value={formData.expectedLaunchDate}
                onChange={(e) => setFormData({ ...formData, expectedLaunchDate: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Full Outlet Address <span className="text-[#D95D0F]">*</span>
            </label>
            <textarea
              required
              rows={2}
              placeholder="e.g. Ground Floor, Hill Road, Bandra West, Mumbai 400050"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Contact Phone</label>
              <input
                type="text"
                placeholder="+91 98765 00000"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Petpooja Store ID (Pre-allocation)
              </label>
              <input
                type="text"
                placeholder="e.g. PP_MUM_01 (optional)"
                value={formData.petpoojaStoreId}
                onChange={(e) => setFormData({ ...formData, petpoojaStoreId: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Teaser Banner Image URL
            </label>
            <input
              type="text"
              placeholder="https://..."
              value={formData.bannerImage}
              onChange={(e) => setFormData({ ...formData, bannerImage: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Latitude</label>
              <input
                type="number"
                step="0.0001"
                value={formData.lat}
                onChange={(e) => setFormData({ ...formData, lat: parseFloat(e.target.value) || 0 })}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white focus:outline-none focus:border-[#D95D0F]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Longitude</label>
              <input
                type="number"
                step="0.0001"
                value={formData.lng}
                onChange={(e) => setFormData({ ...formData, lng: parseFloat(e.target.value) || 0 })}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white focus:outline-none focus:border-[#D95D0F]"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between p-3 bg-[#0D0F0D] border border-[#234B2A] rounded-xl">
            <div>
              <p className="text-xs font-semibold text-white">Enable Customer Subscriptions</p>
              <p className="text-[11px] text-zinc-400">
                Allow Delivery App users to click "Notify me when open"
              </p>
            </div>
            <input
              type="checkbox"
              checked={formData.allowComingSoonSubscribers}
              onChange={(e) =>
                setFormData({ ...formData, allowComingSoonSubscribers: e.target.checked })
              }
              className="w-4 h-4 accent-[#D95D0F] rounded cursor-pointer"
            />
          </div>

          {/* Actions */}
          <div className="pt-4 flex items-center justify-end space-x-3 border-t border-[#234B2A]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#1E3A24] text-zinc-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-[#D95D0F] hover:bg-[#b84d0b] text-white transition-colors disabled:opacity-50 flex items-center space-x-1.5 shadow-md"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'Creating Store...' : 'Publish Future Store'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
