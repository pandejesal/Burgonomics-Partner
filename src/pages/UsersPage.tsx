import React, { useState } from 'react';
import { toast } from 'sonner';
import { useUsers, type TeamUser } from '@/hooks/useUsers';
import { useBranches } from '@/hooks/useBranches';
import { useAuthStore } from '@/stores/authStore';
import { CreateStaffModal } from '@/features/users/components/CreateStaffModal';
import { EditUserModal } from '@/components/users/EditUserModal';
import { StaffMemberTable } from '@/features/users/components/StaffMemberTable';
import {
  UserPlus,
  Users,
  CheckCircle2,
  ChefHat,
  Cpu,
  Search,
  AlertTriangle,
} from 'lucide-react';

export function UsersPage() {
  const { user: currentUser } = useAuthStore();
  const { users, isLoading, inviteUser, updateUser, toggleUserStatus, revokeUser } = useUsers();
  const { branches } = useBranches();

  const [roleFilter, setRoleFilter] = useState<'all' | 'exec_regional' | 'store_staff' | 'support_dev'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingUser, setEditingUser] = useState<TeamUser | null>(null);
  const [revokingUser, setRevokingUser] = useState<TeamUser | null>(null);

  const filteredUsers = users.filter((member) => {
    const matchesSearch =
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (member.phone && member.phone.includes(searchQuery));

    if (!matchesSearch) return false;

    if (roleFilter === 'exec_regional') {
      return member.role === 'brand_owner' || member.role === 'regional_manager';
    }
    if (roleFilter === 'store_staff') {
      return member.role === 'branch_owner' || member.role === 'branch_staff';
    }
    if (roleFilter === 'support_dev') {
      return member.role === 'support' || member.role === 'developer';
    }
    return true;
  });

  // Loop 43/120: staff mutations hit rules walls (invite creates others'
  // docs, revoke deletes, cross-user edits) — every one of these used to
  // fail silently (hung modal / phantom revoke). Loud now; a server staff-
  // invite endpoint is QUEUED (client cannot mint roles by rules design).
  const handleInviteSubmit = async (data: any) => {
    try {
      await inviteUser.mutateAsync(data);
      toast.success('Staff invite recorded.');
    } catch (err) {
      toast.error('Invite NOT recorded — staff invites need a server endpoint.', {
        description: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  const handleEditSave = async (userId: string, updates: Partial<TeamUser>) => {
    try {
      await updateUser.mutateAsync({ userId, updates });
    } catch (err) {
      toast.error('Edit NOT saved — check role permissions.', {
        description: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokingUser) return;
    try {
      await revokeUser.mutateAsync(revokingUser.id);
      setRevokingUser(null);
    } catch (err) {
      toast.error('Revoke FAILED — user was not removed.', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="space-y-6 select-none text-white">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-white tracking-wide">
              Team & Staff RBAC Management
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0E4825] text-[#4ADE80] border border-[#4ADE80]/40 font-mono uppercase">
              Staff Matrix
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage partner roles, multi-branch assignments, KDS kitchen staff access, and 4-digit PIN credentials
          </p>
        </div>

        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0E4825] hover:bg-[#155e32] text-white rounded-xl font-bold text-xs transition-colors shadow-md border border-[#4ADE80]/30 cursor-pointer"
        >
          <UserPlus className="w-4 h-4 text-[#4ADE80]" />
          <span>Onboard Team Member</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#112415] p-5 rounded-2xl border border-[#1E3A24] shadow-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold">
            <span>Total Team Roster</span>
            <Users className="w-4 h-4 text-[#4ADE80]" />
          </div>
          <div className="font-mono font-black text-2xl text-white mt-2">
            {users.length}
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">Across 6 Role Tiers</div>
        </div>

        <div className="bg-[#112415] p-5 rounded-2xl border border-[#1E3A24] shadow-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold">
            <span>Active Live</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-mono font-black text-2xl text-emerald-400 mt-2">
            {users.filter((u) => u.active !== false).length}
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">Operational Accounts</div>
        </div>

        <div className="bg-[#112415] p-5 rounded-2xl border border-[#1E3A24] shadow-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold">
            <span>Store & Kitchen Staff</span>
            <ChefHat className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-mono font-black text-2xl text-amber-300 mt-2">
            {users.filter((u) => u.role === 'branch_owner' || u.role === 'branch_staff').length}
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">Outlet POS & KDS Operators</div>
        </div>

        <div className="bg-[#112415] p-5 rounded-2xl border border-[#1E3A24] shadow-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-bold">
            <span>Support & Engineering</span>
            <Cpu className="w-4 h-4 text-rose-400" />
          </div>
          <div className="font-mono font-black text-2xl text-rose-300 mt-2">
            {users.filter((u) => u.role === 'support' || u.role === 'developer').length}
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">Incident Escalation Desk</div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-[#112415] p-3 rounded-2xl border border-[#1E3A24] flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          {(
            [
              { key: 'all', label: 'All Team Members' },
              { key: 'exec_regional', label: '👑 Brand & Regional' },
              { key: 'store_staff', label: '🏪 Store Managers & Staff' },
              { key: 'support_dev', label: '💻 Support & Dev Desk' },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRoleFilter(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                roleFilter === key
                  ? 'bg-[#0E4825] text-white shadow-sm border border-[#4ADE80]/30'
                  : 'bg-[#0A0A0A] text-zinc-400 hover:text-white border border-[#1E3A24]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search staff, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ADE80]"
          />
        </div>
      </div>

      {/* Roster List */}
      {isLoading ? (
        <div className="p-16 text-center text-zinc-400 text-xs">Loading team roster...</div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-16 bg-[#112415] rounded-2xl border border-[#1E3A24] p-8 space-y-3">
          <Users className="w-12 h-12 mx-auto text-zinc-600" />
          <h3 className="font-bold text-white text-sm">No team members found</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Use the "Onboard Team Member" button above to add managers, kitchen staff, or developers.
          </p>
        </div>
      ) : (
        <StaffMemberTable
          users={filteredUsers}
          branches={branches}
          onEdit={(user) => setEditingUser(user)}
          onToggleStatus={(userId, active) => toggleUserStatus.mutate({ userId, active })}
          onRevoke={(user) => setRevokingUser(user)}
        />
      )}

      {/* Create Staff Modal */}
      <CreateStaffModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onInvite={handleInviteSubmit}
        loading={inviteUser.isPending}
      />

      {/* Edit User Modal */}
      <EditUserModal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        user={editingUser}
        onSave={handleEditSave}
        loading={updateUser.isPending}
      />

      {/* Revoke Confirmation Modal */}
      {revokingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
          <div className="bg-[#112415] border border-[#1E3A24] rounded-2xl w-full max-w-md p-6 space-y-4 text-white shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center space-x-2 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              <span>Revoke Access for {revokingUser.name}?</span>
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Revoking access will immediately disable this user's POS & KDS credentials and log an audit security event.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setRevokingUser(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#0A0A0A] text-zinc-300 hover:text-white border border-[#1E3A24] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                disabled={revokeUser.isPending}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50 cursor-pointer"
              >
                {revokeUser.isPending ? 'Revoking...' : 'Confirm Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UsersPage;
