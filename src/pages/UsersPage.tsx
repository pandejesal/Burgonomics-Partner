import { useState } from 'react';
import { useUsers } from '@/hooks/useUsers';
import { useBranches } from '@/hooks/useBranches';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { UserPlus, Users, Shield, MapPin, Building2, X } from 'lucide-react';
import type { UserRole } from '@/types';

const roleLabels: Record<string, string> = {
  brand_owner: 'Brand Owner',
  regional_manager: 'Regional Manager',
  branch_owner: 'Branch Owner',
};

const roleColors: Record<string, string> = {
  brand_owner: 'bg-purple-100 text-purple-800 border-purple-200',
  regional_manager: 'bg-blue-100 text-blue-800 border-blue-200',
  branch_owner: 'bg-green-100 text-green-800 border-green-200',
};

export function UsersPage() {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const { users, isLoading, deactivateUser } = useUsers();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Team Management</h1>
          <p className="text-sm text-text-secondary">
            Manage partner roles, branch managers, and regional supervisors.
          </p>
        </div>

        <button
          onClick={() => setShowInviteForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary-dark shadow-xs transition-colors cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Invite Team Member</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : !users?.length ? (
        <div className="text-center py-16 bg-surface rounded-2xl border border-border">
          <Users className="w-12 h-12 mx-auto text-text-secondary mb-4 opacity-50" />
          <h3 className="font-semibold text-text-primary">No team members registered yet</h3>
          <p className="text-sm text-text-secondary mt-1">
            Invite managers to give them access to store orders and analytics.
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border divide-y divide-border/70 overflow-hidden shadow-xs">
          {users.map((member) => (
            <div
              key={member.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 hover:bg-primary/5 transition-colors gap-4"
            >
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                  <span className="text-base font-bold text-primary">
                    {member.name?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-text-primary text-sm">{member.name}</p>
                    <Badge className={roleColors[member.role] || 'bg-gray-100 text-gray-800'}>
                      <Shield className="w-3 h-3 mr-1" />
                      {roleLabels[member.role] || member.role}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">{member.email}</p>

                  <div className="flex flex-wrap items-center gap-2.5 mt-2">
                    {member.phone && (
                      <span className="text-xs text-text-secondary font-mono">
                        {member.phone}
                      </span>
                    )}
                    {member.branchIds && member.branchIds.length > 0 && (
                      <span className="text-xs text-text-secondary inline-flex items-center">
                        <Building2 className="w-3 h-3 mr-1 text-primary" />
                        {member.branchIds.length} branch(es) assigned
                      </span>
                    )}
                    {member.cityIds && member.cityIds.length > 0 && (
                      <span className="text-xs text-text-secondary inline-flex items-center">
                        <MapPin className="w-3 h-3 mr-1 text-secondary" />
                        {member.cityIds.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center">
                <Badge
                  className={
                    member.active !== false
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }
                >
                  {member.active !== false ? 'Active' : 'Deactivated'}
                </Badge>

                {member.active !== false && member.role !== 'brand_owner' && (
                  <button
                    onClick={() => deactivateUser.mutate(member.id)}
                    disabled={deactivateUser.isPending}
                    className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-xl text-xs font-semibold border border-red-200 transition-colors cursor-pointer"
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invite Modal */}
      {showInviteForm && <InviteUserModal onClose={() => setShowInviteForm(false)} />}
    </div>
  );
}

function InviteUserModal({ onClose }: { onClose: () => void }) {
  const { inviteUser } = useUsers();
  const { branches } = useBranches();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'branch_owner' as UserRole,
    branchIds: [] as string[],
    cityIds: ['Ahmedabad'] as string[],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await inviteUser.mutateAsync(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md p-6 border border-border shadow-xl">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
          <h2 className="text-lg font-bold text-text-primary">Invite Team Member</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-primary/5 rounded-lg text-text-secondary cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Ramesh Patel"
              className="w-full px-3.5 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="manager@burgonomics.in"
                className="w-full px-3.5 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Mobile Number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+91 98765 43210"
                className="w-full px-3.5 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Assigned Role
            </label>
            <select
              value={formData.role}
              onChange={(e) =>
                setFormData({ ...formData, role: e.target.value as UserRole })
              }
              className="w-full px-3.5 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
            >
              <option value="branch_owner">Branch Owner / Store Manager</option>
              <option value="regional_manager">Regional City Manager</option>
              <option value="brand_owner">Brand Executive / Admin</option>
            </select>
          </div>

          {formData.role === 'branch_owner' && (
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Assign to Outlet
              </label>
              <select
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    branchIds: e.target.value ? [e.target.value] : [],
                  })
                }
                className="w-full px-3.5 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
              >
                <option value="">Select an outlet...</option>
                {branches?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.city})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-border rounded-xl font-semibold text-xs hover:bg-primary/5 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={inviteUser.isPending}
              className="flex-1 py-2.5 bg-primary text-white rounded-xl font-semibold text-xs hover:bg-primary-dark disabled:opacity-50 shadow-xs cursor-pointer"
            >
              {inviteUser.isPending ? 'Sending...' : 'Send Access Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default UsersPage;
