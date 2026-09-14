import React, { useState, useEffect } from 'react';
import {
  X,
  Store,
  MapPin,
  Phone,
  Clock,
  CheckCircle2,
  Cpu,
  Sparkles,
} from 'lucide-react';
import type { CreateBranchInput } from '@/hooks/useBranches';
import { GeofenceRadiusSlider } from './GeofenceRadiusSlider';
import { RazorpayRouteAccountCard } from './RazorpayRouteAccountCard';

interface BranchConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (branchData: CreateBranchInput) => Promise<void>;
  initialData?: Partial<CreateBranchInput> | null;
  isSuperAdmin?: boolean;
  loading?: boolean;
}

export function BranchConfigModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isSuperAdmin = true,
  loading = false,
}: BranchConfigModalProps) {
  const [formData, setFormData] = useState<CreateBranchInput>({
    name: '',
    city: 'Surat',
    address: '',
    phone: '',
    status: 'active',
    expectedLaunchDate: 'October 2026',
    bannerImage:
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
    petpoojaStoreId: '',
    razorpayAccountId: '',
    brandRoyaltyPercent: 5.0,
    deliveryRadiusKm: 7,
    prepTimeMinutes: 20,
    operatingHours: { open: '11:00 AM', close: '11:30 PM' },
    coordinates: { lat: 21.1959, lng: 72.7933 },
    allowComingSoonSubscribers: true,
  });

  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({
        ...prev,
        ...initialData,
        name: initialData.name || prev.name,
        city: initialData.city || prev.city,
        address: initialData.address || prev.address,
        phone: initialData.phone || prev.phone,
        status: initialData.status || prev.status,
        deliveryRadiusKm: initialData.deliveryRadiusKm ?? prev.deliveryRadiusKm,
        petpoojaStoreId: initialData.petpoojaStoreId || prev.petpoojaStoreId,
        razorpayAccountId: initialData.razorpayAccountId || prev.razorpayAccountId,
        operatingHours: initialData.operatingHours || prev.operatingHours,
      }));
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!formData.name.trim() || !formData.address.trim()) {
      setValidationError('Please provide both store branch name and physical address.');
      return;
    }

    if (
      formData.deliveryRadiusKm !== undefined &&
      (formData.deliveryRadiusKm < 1 || formData.deliveryRadiusKm > 20)
    ) {
      setValidationError('Delivery geofence radius must be between 1.0 km and 20.0 km.');
      return;
    }

    if (
      formData.razorpayAccountId &&
      !/^acc_[a-zA-Z0-9_]+$/.test(formData.razorpayAccountId)
    ) {
      setValidationError('Razorpay linked account ID must follow the standard format: acc_xxxx.');
      return;
    }

    await onSubmit(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="bg-[#112415] border border-[#1E3A24] rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl text-white">
        {/* Header */}
        <div className="p-6 border-b border-[#1E3A24] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-[#0E4825] text-[#4ADE80] border border-[#4ADE80]/30">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {initialData ? 'Configure Store Outlet' : 'Onboard New Store Outlet'}
              </h2>
              <p className="text-xs text-zinc-400">
                Manage delivery geofencing, Petpooja POS bridge & Razorpay Route settlements
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-[#0A0A0A] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {validationError && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs">
              {validationError}
            </div>
          )}

          {/* Status Mode Toggle */}
          <div className="p-3 bg-[#0A0A0A] rounded-xl border border-[#1E3A24] flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-300">Outlet Operating Status</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, status: 'active' })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  formData.status === 'active'
                    ? 'bg-[#0E4825] text-white border border-[#4ADE80]/40'
                    : 'bg-[#112415] text-zinc-400 border border-[#1E3A24]'
                }`}
              >
                ● Active (Live POS)
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, status: 'coming_soon' })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  formData.status === 'coming_soon'
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-[#112415] text-zinc-400 border border-[#1E3A24]'
                }`}
              >
                🚀 Coming Soon
              </button>
            </div>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Store Name <span className="text-[#4ADE80]">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Burgonomics Surat Adajan"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ADE80]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Metro City <span className="text-[#4ADE80]">*</span>
              </label>
              <select
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-white focus:outline-none focus:border-[#4ADE80]"
              >
                {['Surat', 'Ahmedabad', 'Vadodara', 'Mumbai', 'Pune', 'Rajkot'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Physical Outlet Address <span className="text-[#4ADE80]">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Shop 4, Prime Arcade, Anand Mahal Rd, Adajan"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ADE80]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Store Phone</label>
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ADE80]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Opening Time</label>
              <input
                type="text"
                placeholder="11:00 AM"
                value={formData.operatingHours?.open || '11:00 AM'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    operatingHours: {
                      open: e.target.value,
                      close: formData.operatingHours?.close || '11:30 PM',
                    },
                  })
                }
                className="w-full px-3.5 py-2.5 text-xs bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ADE80]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Closing Time</label>
              <input
                type="text"
                placeholder="11:30 PM"
                value={formData.operatingHours?.close || '11:30 PM'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    operatingHours: {
                      open: formData.operatingHours?.open || '11:00 AM',
                      close: e.target.value,
                    },
                  })
                }
                className="w-full px-3.5 py-2.5 text-xs bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ADE80]"
              />
            </div>
          </div>

          {/* Interactive Geofence Slider */}
          <GeofenceRadiusSlider
            radiusKm={formData.deliveryRadiusKm || 7}
            onChange={(radiusKm) => setFormData({ ...formData, deliveryRadiusKm: radiusKm })}
            coordinates={formData.coordinates}
          />

          {/* Razorpay Route Split Card */}
          <RazorpayRouteAccountCard
            accountId={formData.razorpayAccountId || ''}
            onChange={(accountId) => setFormData({ ...formData, razorpayAccountId: accountId })}
            brandRoyaltyPercent={formData.brandRoyaltyPercent || 5.0}
            isSuperAdmin={isSuperAdmin}
          />

          {/* Petpooja RestID POS Bridge */}
          <div className="p-4 bg-[#0A0A0A] border border-[#1E3A24] rounded-2xl space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[#0E4825] text-[#4ADE80] border border-[#4ADE80]/30">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Petpooja POS Terminal Bridge</h4>
                <p className="text-[10px] text-zinc-400">
                  Maps orders from customer app & partner console to physical thermal KOT printer
                </p>
              </div>
            </div>
            <input
              type="text"
              placeholder="PP_SURAT_01"
              value={formData.petpoojaStoreId || ''}
              onChange={(e) => setFormData({ ...formData, petpoojaStoreId: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#112415] border border-[#1E3A24] rounded-xl text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-[#4ADE80]"
            />
          </div>

          {/* Footer */}
          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-[#1E3A24]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#0A0A0A] text-zinc-300 hover:text-white border border-[#1E3A24] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-[#0E4825] hover:bg-[#155e32] text-white disabled:opacity-50 flex items-center space-x-1.5 shadow-md border border-[#4ADE80]/30 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-[#4ADE80]" />
              <span>{loading ? 'Saving...' : 'Save Outlet Configuration'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default BranchConfigModal;
