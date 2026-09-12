import React, { useState } from 'react';
import {
  X,
  UserPlus,
  Shield,
  Store,
  MapPin,
  CheckCircle2,
  KeyRound,
  Sparkles,
} from 'lucide-react';
import { useBranches } from '@/hooks/useBranches';
import type { UserRole } from '@/types';

interface CreateStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (userData: {
    name: string;
    email: string;
    phone: string;
    role: UserRole;
    branchIds: string[];
    cityIds: string[];
  }) => Promise<void>;
  loading?: boolean;
}

export function CreateStaffModal({
  isOpen,
  onClose,
  onInvite,
  loading = false,
}: CreateStaffModalProps) {
  const { branches } = useBranches();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'branch_staff' as UserRole,
    branchIds: ['branch_surat_01'] as string[],
    cityIds: ['Surat'] as string[],
    // Readiness-6: no PIN collected — the strict server schema 400s it. Staff
    // set their own POS PIN at first sign-in via the server-side flow.
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!formData.name.trim() || !formData.email.trim()) {
      setValidationError('Please provide both staff member name and email address.');
      return;
    }

    if (
      (formData.role === 'branch_staff' || formData.role === 'branch_owner') &&
      (!formData.branchIds || formData.branchIds.length === 0)
    ) {
      setValidationError('Please select an assigned store outlet for this staff member.');
      return;
    }

    await onInvite(formData);
    onClose();
  };

  const getRoleDescription = (role: UserRole) => {
    switch (role) {
      case 'brand_owner':
        return '👑 Brand Executive: Full network oversight of all 16+ branches, Route royalty financials, and staff RBAC.';
      case 'regional_manager':
        return '🏢 Regional Manager: Supervise franchise store operations across assigned metro regions.';
      case 'branch_owner':
        return '🏪 Branch Owner / GM: Manage assigned store orders, rider dispatch, inventory 86 stock, and local tickets.';
      case 'branch_staff':
        return '👨‍🍳 Kitchen Staff: Locked to assigned branch; operates live KDS bump screen, cashier POS, and order prep.';
      case 'support':
        return '🎧 Support Specialist: Resolves customer support tickets and manages Razorpay Route customer refunds.';
      case 'developer':
        return '💻 Developer: Lead engineering team; access to P0 error snapshots, simulator, and API logs.';
      default:
        return 'Team Member';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="bg-[#112415] border border-[#1E3A24] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl text-white">
        {/* Header */}
        <div className="p-6 border-b border-[#1E3A24] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-[#0E4825] text-[#4ADE80] border border-[#4ADE80]/30">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Onboard Staff Member</h2>
              <p className="text-xs text-zinc-400">
                Grant role-based credentials and branch binding (POS PIN is set by staff at first sign-in)
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(100vh-14rem)] overflow-y-auto">
          {validationError && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs">
              {validationError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Full Name <span className="text-[#4ADE80]">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Ramesh Patel"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ADE80]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Email Address <span className="text-[#4ADE80]">*</span>
              </label>
              <input
                type="email"
                required
                placeholder="staff@burgonomics.in"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ADE80]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Mobile Number
              </label>
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ADE80]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Assigned Role Tier <span className="text-[#4ADE80]">*</span>
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-white focus:outline-none focus:border-[#4ADE80]"
              >
                <option value="branch_staff">👨‍🍳 Kitchen Staff (KDS Operator)</option>
                <option value="branch_owner">🏪 Branch Owner / Store GM</option>
                <option value="regional_manager">🏢 Regional City Manager</option>
                <option value="support">🎧 Support Specialist</option>
                <option value="developer">💻 Developer / Lead Engineer</option>
                <option value="brand_owner">👑 Brand Executive (CEO)</option>
              </select>
            </div>

            {/* Readiness-6: no PIN collected here — staff set their own
              POS PIN at first sign-in via the server-side flow. */}
            <div className="rounded-xl border border-[#1E3A24] bg-[#0A0A0A] p-3 text-[11px] text-zinc-400">
              No POS PIN is set at invite time. The new staff member sets
              their own 4-digit PIN on first sign-in.
            </div>
          </div>

          {/* Role Capability Callout */}
          <div className="p-3 bg-[#0A0A0A] rounded-xl border border-[#1E3A24] text-xs text-zinc-300">
            {getRoleDescription(formData.role)}
          </div>

          {/* Branch Binding */}
          {(formData.role === 'branch_staff' || formData.role === 'branch_owner') && (
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Assigned Store Outlet <span className="text-[#4ADE80]">*</span>
              </label>
              <select
                value={formData.branchIds[0] || ''}
                onChange={(e) => setFormData({ ...formData, branchIds: [e.target.value] })}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-white focus:outline-none focus:border-[#4ADE80]"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.city})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* City Assignment (if regional manager) */}
          {formData.role === 'regional_manager' && (
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Supervised Metro Cities
              </label>
              <div className="grid grid-cols-2 gap-2 p-3 bg-[#0A0A0A] rounded-xl border border-[#1E3A24] text-xs">
                {['Surat', 'Ahmedabad', 'Vadodara', 'Mumbai', 'Pune', 'Rajkot'].map((city) => {
                  const isChecked = formData.cityIds.includes(city);
                  return (
                    <label key={city} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, cityIds: [...formData.cityIds, city] });
                          } else {
                            setFormData({
                              ...formData,
                              cityIds: formData.cityIds.filter((c) => c !== city),
                            });
                          }
                        }}
                        className="accent-[#FF6600]"
                      />
                      <span>{city}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

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
              <span>{loading ? 'Onboarding...' : 'Complete Onboarding'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateStaffModal;
