import React from 'react';
import type { TeamUser } from '@/hooks/useUsers';
import type { Branch } from '@/types';
import { RolePermissionBadge } from './RolePermissionBadge';
import {
  Store,
  MapPin,
  Edit2,
  Power,
  Trash2,
  KeyRound,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface StaffMemberTableProps {
  users: TeamUser[];
  branches: Branch[];
  onEdit: (user: TeamUser) => void;
  onToggleStatus: (userId: string, active: boolean) => void;
  onRevoke: (user: TeamUser) => void;
}

export function StaffMemberTable({
  users,
  branches,
  onEdit,
  onToggleStatus,
  onRevoke,
}: StaffMemberTableProps) {
  const getBranchName = (branchId: string) => {
    const branch = branches.find((b) => b.id === branchId);
    return branch ? `${branch.name} (${branch.city})` : branchId;
  };

  return (
    <div className="grid grid-cols-1 gap-3.5">
      {users.map((member) => {
        const isActive = member.active !== false;

        return (
          <div
            key={member.id}
            className={`bg-[#112415] hover:bg-[#16301B] rounded-2xl border p-5 transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 ${
              !isActive
                ? 'border-zinc-800 opacity-60'
                : member.role === 'developer'
                ? 'border-rose-800/60'
                : 'border-[#1E3A24] hover:border-[#4ADE80]/50'
            }`}
          >
            {/* Member Info */}
            <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 border ${
                  member.role === 'brand_owner'
                    ? 'bg-purple-950/80 text-purple-300 border-purple-700/60'
                    : member.role === 'developer'
                    ? 'bg-rose-950/80 text-rose-300 border-rose-700/60'
                    : member.role === 'branch_owner'
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                    : 'bg-[#0A0A0A] text-[#4ADE80] border-[#1E3A24]'
                }`}
              >
                {member.name.charAt(0).toUpperCase()}
              </div>

              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-white text-sm">{member.name}</span>
                  <RolePermissionBadge role={member.role} />

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                      isActive
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {isActive ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Active</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3 text-rose-400" />
                        <span>Suspended</span>
                      </>
                    )}
                  </span>

                  {member.pinSet && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#0A0A0A] text-[#4ADE80] border border-[#1E3A24]">
                      <KeyRound className="w-3 h-3 text-[#4ADE80]" />
                      <span>PIN Set</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300">
                  <span className="text-zinc-400">{member.email}</span>
                  {member.phone && (
                    <>
                      <span>•</span>
                      <span className="font-mono text-zinc-300">{member.phone}</span>
                    </>
                  )}
                  {member.lastActiveAt && (
                    <>
                      <span>•</span>
                      <span className="text-[11px] text-zinc-400 font-mono">
                        Active: {member.lastActiveAt}
                      </span>
                    </>
                  )}
                </div>

                {/* Assigned Outlets / Cities */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {member.branchIds && member.branchIds.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#0A0A0A] border border-[#1E3A24] text-[11px] text-zinc-300">
                      <Store className="w-3.5 h-3.5 text-[#4ADE80]" />
                      <span>{getBranchName(member.branchIds[0])}</span>
                    </span>
                  )}

                  {member.cityIds && member.cityIds.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#0A0A0A] border border-[#1E3A24] text-[11px] text-zinc-300">
                      <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Cities: {member.cityIds.join(', ')}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2.5 w-full lg:w-auto justify-between lg:justify-end pt-2 lg:pt-0 border-t lg:border-t-0 border-[#1E3A24]">
              <button
                type="button"
                onClick={() => onEdit(member)}
                className="px-3 py-1.5 rounded-xl bg-[#0A0A0A] hover:bg-[#162E1B] text-zinc-200 hover:text-white border border-[#1E3A24] font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 text-[#4ADE80]" />
                <span>Edit</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleStatus(member.id, !isActive)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                  isActive
                    ? 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-900/60'
                    : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/60'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{isActive ? 'Suspend' : 'Re-activate'}</span>
              </button>

              {member.role !== 'brand_owner' && (
                <button
                  type="button"
                  onClick={() => onRevoke(member)}
                  className="p-2 rounded-xl bg-rose-950/40 text-rose-300 border border-rose-800/40 hover:bg-rose-900/60 transition-colors cursor-pointer"
                  title="Revoke User Access"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default StaffMemberTable;
