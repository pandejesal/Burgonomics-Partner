import React, { useState, useEffect } from 'react';
import { X, Shield, Store, MapPin, CheckCircle2, User } from 'lucide-react';
import { useBranches } from '@/hooks/useBranches';
import type { TeamUser } from '@/hooks/useUsers';
import type { UserRole } from '@/types';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: TeamUser | null;
  onSave: (userId: string, updates: Partial<TeamUser>) => Promise<void>;
  loading?: boolean;
}

/**
 * The roles POST /auth/assignRole accepts (backend
 * functions/src/core/validation.ts → assignRoleSchema). Brand-level roles are
 * provisioned outside this console, so they can neither be assigned here nor
 * edited through the claims route (PAR-02b).
 */
export const ASSIGNABLE_USER_ROLES: UserRole[] = [
  'branch_staff',
  'branch_owner',
  'regional_manager',
  'support',
];

const ROLE_LABELS: Record<UserRole, string> = {
  branch_staff: 'Kitchen Staff (KDS Operator)',
  branch_owner: 'Branch Owner / Store GM',
  regional_manager: 'Regional City Manager',
  support: 'Support Specialist',
  developer: 'Developer / Lead Engineer',
  brand_owner: 'Brand Executive (CEO)',
  customer: 'Customer',
};

export function isBrandLevelRole(role: UserRole): boolean {
  return role === 'brand_owner' || role === 'developer';
}

export interface UserEditFormData {
  name: string;
  phone: string;
  role: UserRole;
  branchIds: string[];
  cityIds: string[];
}

/**
 * Builds the update payload for the edit modal. A brand-level target (current
 * role) and a brand-level request are both stripped to non-privileged profile
 * fields: the claims route rejects those roles, and a direct role write is
 * exactly the defect PAR-02 removed.
 */
export function buildUserEditUpdates(
  target: Pick<TeamUser, 'role'>,
  formData: UserEditFormData
): Partial<TeamUser> {
  const profile = { name: formData.name, phone: formData.phone };
  if (isBrandLevelRole(target.role) || isBrandLevelRole(formData.role)) {
    return profile;
  }
  return {
    ...profile,
    role: formData.role,
    branchIds: formData.branchIds,
    cityIds: formData.cityIds,
  };
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  isOpen,
  onClose,
  user,
  onSave,
  loading = false,
}) => {
  const { branches } = useBranches();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    role: 'branch_staff' as UserRole,
    branchIds: [] as string[],
    cityIds: [] as string[],
  });

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        phone: user.phone || '',
        role: user.role,
        branchIds: user.branchIds || [],
        cityIds: user.cityIds || [],
      });
    }
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    await onSave(user.id, buildUserEditUpdates(user, formData));
    onClose();
  };

  const roleLocked = isBrandLevelRole(user.role);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl text-white">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-surface-hover text-accent-light border border-border">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Edit Team Member</h2>
              <p className="text-xs text-zinc-400">{user.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-surface-hover cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(100vh-14rem)] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Full Name <span className="text-accent-light">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs bg-bg border border-border rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Mobile Number
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs bg-bg border border-border rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Role Permission Tier
            </label>
            {roleLocked ? (
              <>
                <div className="w-full px-3.5 py-2.5 text-xs bg-bg border border-border rounded-xl text-zinc-300">
                  {ROLE_LABELS[user.role]}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                  This brand-level role cannot be changed from the partner console — the
                  role API only assigns Kitchen Staff, Branch Owner, Regional Manager and
                  Support. Name and phone can still be updated.
                </p>
              </>
            ) : (
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                className="w-full px-3.5 py-2.5 text-xs bg-bg border border-border rounded-xl text-white focus:outline-none focus:border-accent"
              >
                {ASSIGNABLE_USER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Branch Mapping */}
          {(formData.role === 'branch_staff' || formData.role === 'branch_owner') && (
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Assigned Store Outlet
              </label>
              <select
                value={formData.branchIds[0] || ''}
                onChange={(e) => setFormData({ ...formData, branchIds: [e.target.value] })}
                className="w-full px-3.5 py-2.5 text-xs bg-bg border border-border rounded-xl text-white focus:outline-none focus:border-accent"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.city})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* City Mapping */}
          {formData.role === 'regional_manager' && (
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Supervised Metro Cities
              </label>
              <div className="grid grid-cols-2 gap-2 p-3 bg-bg rounded-xl border border-border text-xs">
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
                        className="accent-[#D95D0F]"
                      />
                      <span>{city}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-surface-hover text-zinc-300 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-accent hover:bg-accent-hover text-white disabled:opacity-50 flex items-center space-x-1.5 shadow-md cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditUserModal;
