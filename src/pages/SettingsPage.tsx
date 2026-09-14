import React, { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useBranches } from '@/hooks/useBranches';
import {
  ThermalPrinterSettings,
  AudioNotificationTester,
  StoreOperatingToggle,
} from '@/features/settings';
import { DevDiagnosticsModal } from '@/components/admin/DevDiagnosticsModal';
import {
  User,
  Shield,
  Phone,
  Mail,
  Building,
  LogOut,
  Info,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import type { Branch } from '@/types';

const roleLabels: Record<string, string> = {
  brand_owner: '👑 Brand Owner / Global Admin',
  developer: '💻 Developer Team Admin',
  support: '🎧 Support Operations Team',
  regional_manager: '🏢 Regional City Manager',
  branch_owner: '🏪 Branch Owner / Outlet Manager',
  branch_staff: '👨‍🍳 Kitchen Staff (KDS Operator)',
};

export function SettingsPage() {
  const { user, signOut } = useAuthStore();
  const { branches } = useBranches();
  const [showDevDiagnostics, setShowDevDiagnostics] = useState(false);

  const myBranch =
    branches.find((b) => user?.branchIds?.includes(b.id)) ||
    branches[0] ||
    null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 select-none">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-wide">
          Settings & Operational Preferences
        </h1>
        <p className="text-xs text-neutral-400">
          Hardware configuration, live KOT thermal printing, acoustic alerts, and store surge controls
        </p>
      </div>

      {/* 1. Store Operating & Surge Status */}
      <StoreOperatingToggle branch={myBranch} />

      {/* 2. Thermal KOT Printer Setup */}
      <ThermalPrinterSettings />

      {/* 3. Audio & FCM Push Notification Tester */}
      <AudioNotificationTester />

      {/* 4. Operator Profile & Auth Role Card */}
      <div className="p-6 rounded-3xl bg-neutral-900 border border-neutral-800 space-y-4 text-white">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#0E4825] border border-emerald-500/40 flex items-center justify-center text-emerald-300 font-black text-lg">
              {user?.name?.slice(0, 1).toUpperCase() || 'B'}
            </div>
            <div>
              <h3 className="font-black text-base text-white">{user?.name || 'Store Operator'}</h3>
              <p className="text-xs text-emerald-400 font-bold">
                {roleLabels[user?.role || 'branch_staff'] || user?.role}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => signOut()}
            className="px-3.5 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 text-rose-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-2xl bg-neutral-950 border border-neutral-850 space-y-1">
            <span className="text-neutral-500 font-bold uppercase text-[10px] block">Email</span>
            <p className="font-semibold text-neutral-200 truncate">{user?.email || 'N/A'}</p>
          </div>

          <div className="p-3 rounded-2xl bg-neutral-950 border border-neutral-850 space-y-1">
            <span className="text-neutral-500 font-bold uppercase text-[10px] block">Assigned Outlet</span>
            <p className="font-semibold text-neutral-200 truncate">
              {myBranch?.name || user?.branchIds?.[0] || 'Surat Adajan'}
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-neutral-950 border border-neutral-850 space-y-1">
            <span className="text-neutral-500 font-bold uppercase text-[10px] block">RBAC Security</span>
            <p className="font-semibold text-emerald-400">Authenticated Session ✓</p>
          </div>
        </div>
      </div>

      {/* 5. System Diagnostics & Info */}
      <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-850 flex items-center justify-between text-xs text-neutral-400">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-[#FF6600]" />
          <span>Burgonomics Partner POS • v2.4.0 (Petpooja Bridge Active)</span>
        </div>

        <button
          type="button"
          onClick={() => setShowDevDiagnostics(true)}
          className="text-neutral-400 hover:text-white font-bold text-[11px] underline cursor-pointer"
        >
          Dev Diagnostics
        </button>
      </div>

      {/* Dev Diagnostics Modal */}
      <DevDiagnosticsModal
        isOpen={showDevDiagnostics}
        onClose={() => setShowDevDiagnostics(false)}
      />
    </div>
  );
}

export default SettingsPage;
