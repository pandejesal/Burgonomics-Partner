import React from 'react';
import type { UserRole } from '@/types';

interface RolePermissionBadgeProps {
  role: UserRole;
  className?: string;
}

export function RolePermissionBadge({ role, className = '' }: RolePermissionBadgeProps) {
  switch (role) {
    case 'brand_owner':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-black bg-purple-950/90 text-purple-300 border border-purple-700/80 uppercase tracking-wide ${className}`}
        >
          👑 Brand Executive
        </span>
      );
    case 'regional_manager':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-950/80 text-blue-300 border border-blue-700/60 uppercase tracking-wide ${className}`}
        >
          🏢 Regional Manager
        </span>
      );
    case 'branch_owner':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 uppercase tracking-wide ${className}`}
        >
          🏪 Branch Owner / GM
        </span>
      );
    case 'branch_staff':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-[#0E4825]/40 text-[#4ADE80] border border-[#4ADE80]/30 uppercase tracking-wide ${className}`}
        >
          👨‍🍳 Kitchen Staff
        </span>
      );
    case 'support':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 uppercase tracking-wide ${className}`}
        >
          🎧 Support Specialist
        </span>
      );
    case 'developer':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-black bg-rose-950/90 text-rose-300 border border-rose-700/80 uppercase tracking-wide ${className}`}
        >
          💻 Lead Engineer
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700 uppercase ${className}`}
        >
          Staff
        </span>
      );
  }
}

export default RolePermissionBadge;
