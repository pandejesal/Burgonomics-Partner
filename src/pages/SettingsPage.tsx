import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useNotifications } from '@/hooks/useNotifications';
import { useBranches } from '@/hooks/useBranches';
import { BranchSettingsModal } from '@/components/stores/BranchSettingsModal';
import {
  User,
  Bell,
  Shield,
  Info,
  LogOut,
  Phone,
  Mail,
  Building,
  Settings,
  Store,
  Clock,
  Bike,
  Megaphone,
} from 'lucide-react';
import type { Branch } from '@/types';

const roleLabels: Record<string, string> = {
  brand_owner: 'Brand Owner / Global Admin',
  developer: 'Developer Team Admin',
  support: 'Support Operations Team',
  regional_manager: 'Regional City Manager',
  branch_owner: 'Branch Owner / Outlet Manager',
};

export function SettingsPage() {
  const { user, signOut } = useAuthStore();
  const { unreadCount } = useNotifications();
  const { branches, updateBranchSettings } = useBranches();
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const myBranch =
    branches.find((b) => user?.branchIds?.includes(b.id)) ||
    branches[0] ||
    null;

  const handleSaveSettings = async (branchId: string, settings: Partial<Branch>) => {
    await updateBranchSettings.mutateAsync({ branchId, settings });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-wide">Settings & Outlet Control</h1>
        <p className="text-xs text-zinc-400">
          Operator profile, live branch delivery parameters, and system diagnostics
        </p>
      </div>

      {/* Outlet & Delivery Sync Panel */}
      {myBranch && (
        <div className="bg-[#132A17] rounded-2xl border border-[#234B2A] p-6 shadow-md text-white space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#234B2A] pb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-[#1E3A24] text-[#D95D0F]">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">{myBranch.name}</h2>
                <p className="text-xs text-zinc-400">
                  Live settings broadcasted to Burgonomics Delivery App
                </p>
              </div>
            </div>

            <button
              onClick={() => setEditingBranch(myBranch)}
              className="flex items-center space-x-1.5 px-4 py-2 bg-[#D95D0F] hover:bg-[#b84d0b] text-white rounded-xl text-xs font-semibold shadow-md transition-colors self-start sm:self-center cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span>Configure Delivery Parameters</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-[#0D0F0D] p-3 rounded-xl border border-[#234B2A]">
              <span className="text-[10px] text-zinc-400 block mb-0.5">Order Acceptance</span>
              <span className="font-bold text-emerald-400">
                {myBranch.acceptingOrdersStatus === 'busy'
                  ? 'Busy (Delays)'
                  : myBranch.active
                  ? 'Accepting Orders'
                  : 'Closed'}
              </span>
            </div>

            <div className="bg-[#0D0F0D] p-3 rounded-xl border border-[#234B2A]">
              <span className="text-[10px] text-zinc-400 block mb-0.5">Kitchen Prep Time</span>
              <span className="font-bold text-white">{myBranch.prepTimeMinutes || 20} mins</span>
            </div>

            <div className="bg-[#0D0F0D] p-3 rounded-xl border border-[#234B2A]">
              <span className="text-[10px] text-zinc-400 block mb-0.5">Delivery Radius</span>
              <span className="font-bold text-cyan-400">{myBranch.deliveryRadiusKm || 7} km</span>
            </div>

            <div className="bg-[#0D0F0D] p-3 rounded-xl border border-[#234B2A]">
              <span className="text-[10px] text-zinc-400 block mb-0.5">Hours</span>
              <span className="font-bold text-zinc-200">
                {myBranch.operatingHours?.open || '11:00 AM'} -{' '}
                {myBranch.operatingHours?.close || '11:30 PM'}
              </span>
            </div>
          </div>

          {myBranch.announcementBanner && (
            <div className="bg-[#0D0F0D] p-3 rounded-xl border border-[#234B2A] text-xs text-amber-300 flex items-center space-x-2">
              <Megaphone className="w-4 h-4 text-[#D95D0F] shrink-0" />
              <span>
                <strong>Live Delivery App Banner:</strong> {myBranch.announcementBanner}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Profile Section */}
      <div className="bg-[#132A17] rounded-2xl border border-[#234B2A] p-6 shadow-md text-white">
        <h2 className="font-bold text-white mb-4 flex items-center gap-2 text-base">
          <User className="w-5 h-5 text-[#D95D0F]" />
          <span>Operator Profile</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3.5 bg-[#0D0F0D] rounded-xl border border-[#234B2A]">
            <label className="text-xs text-zinc-400 flex items-center gap-1.5 mb-1">
              <User className="w-3.5 h-3.5" />
              <span>Full Name</span>
            </label>
            <p className="font-semibold text-white text-sm">{user?.name || 'Operator'}</p>
          </div>

          <div className="p-3.5 bg-[#0D0F0D] rounded-xl border border-[#234B2A]">
            <label className="text-xs text-zinc-400 flex items-center gap-1.5 mb-1">
              <Mail className="w-3.5 h-3.5" />
              <span>Email Address</span>
            </label>
            <p className="font-semibold text-white text-sm font-mono truncate">
              {user?.email || 'N/A'}
            </p>
          </div>

          <div className="p-3.5 bg-[#0D0F0D] rounded-xl border border-[#234B2A]">
            <label className="text-xs text-zinc-400 flex items-center gap-1.5 mb-1">
              <Phone className="w-3.5 h-3.5" />
              <span>Contact Number</span>
            </label>
            <p className="font-semibold text-white text-sm font-mono">
              {user?.phone || '+91 Unassigned'}
            </p>
          </div>

          <div className="p-3.5 bg-[#0D0F0D] rounded-xl border border-[#234B2A]">
            <label className="text-xs text-zinc-400 flex items-center gap-1.5 mb-1">
              <Shield className="w-3.5 h-3.5" />
              <span>Operational Role</span>
            </label>
            <p className="font-semibold text-emerald-400 text-sm">
              {roleLabels[user?.role || ''] || user?.role}
            </p>
          </div>
        </div>
      </div>

      {/* Notifications Link Section */}
      <div className="bg-[#132A17] rounded-2xl border border-[#234B2A] p-6 shadow-md text-white">
        <h2 className="font-bold text-white mb-4 flex items-center gap-2 text-base">
          <Bell className="w-5 h-5 text-[#D95D0F]" />
          <span>Notification Alerts</span>
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-[#0D0F0D] rounded-xl border border-[#234B2A]">
          <div>
            <p className="font-semibold text-white text-sm">Unread System & Order Alerts</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {unreadCount > 0
                ? `You have ${unreadCount} unread notification(s) requiring attention.`
                : 'All alerts and order notifications are up to date.'}
            </p>
          </div>
          <Link
            to="/notifications"
            className="px-4 py-2 bg-[#1E3A24] hover:bg-[#285031] text-zinc-200 hover:text-white rounded-xl font-semibold text-xs transition-colors self-start sm:self-center border border-[#234B2A]"
          >
            View Alert Center
          </Link>
        </div>
      </div>

      {/* App Information Section */}
      <div className="bg-[#132A17] rounded-2xl border border-[#234B2A] p-6 shadow-md text-white">
        <h2 className="font-bold text-white mb-4 flex items-center gap-2 text-base">
          <Info className="w-5 h-5 text-[#D95D0F]" />
          <span>Application Diagnostics</span>
        </h2>

        <div className="divide-y divide-[#1E3A24] text-xs">
          <div className="flex justify-between py-2.5">
            <span className="text-zinc-400">Platform Name</span>
            <span className="font-semibold text-white">Burgonomics Partner Console</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-zinc-400">Release Version</span>
            <span className="font-semibold text-white font-mono">1.2.0 (Gold)</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-zinc-400">Native Container</span>
            <span className="font-semibold text-white">Capacitor 8 (Android API 36)</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-zinc-400">POS Bridge Version</span>
            <span className="font-semibold text-white">Petpooja API v2.1.0 (Live Sync)</span>
          </div>
        </div>
      </div>

      {/* Sign Out CTA */}
      <div className="pt-2">
        <button
          onClick={() => signOut()}
          className="w-full flex items-center justify-center gap-2 py-3 bg-rose-950/60 text-rose-300 hover:bg-rose-900/80 rounded-xl font-bold text-sm border border-rose-800/40 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out of Operator Session</span>
        </button>
      </div>

      {/* Edit Modal */}
      <BranchSettingsModal
        isOpen={!!editingBranch}
        onClose={() => setEditingBranch(null)}
        branch={editingBranch}
        onSave={handleSaveSettings}
        loading={updateBranchSettings.isPending}
      />
    </div>
  );
}

export default SettingsPage;
