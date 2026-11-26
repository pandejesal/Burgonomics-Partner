import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useBranches, type CreateBranchInput } from '@/hooks/useBranches';
import { useAuthStore } from '@/stores/authStore';
import { canReadFranchiseLeads, canPublishBranchAnnouncement, isBrandRole } from '@/core/auth/routePolicy';
import { BranchConfigModal } from '@/features/branches/components/BranchConfigModal';
import { BranchSettingsModal } from '@/components/stores/BranchSettingsModal';
import {
  applyStaffStoreStatus,
  splitOperatingStatusChange,
} from '@/features/stores/services/storeOperatingStatus';
import { isStoreClosedByStaff } from '@/features/stores/services/operatingGate';
import { FranchiseLeadsPipeline } from '@/components/stores/FranchiseLeadsPipeline';
import { LaunchBroadcastModal } from '@/components/stores/LaunchBroadcastModal';
import {
  Building2,
  Plus,
  MapPin,
  Phone,
  Clock,
  Sparkles,
  CheckCircle2,
  Power,
  Users,
  Store,
  Settings,
  Megaphone,
  Bike,
  ShieldCheck,
  DollarSign,
  Send,
  Cpu,
  CreditCard,
} from 'lucide-react';
import type { Branch } from '@/types';
import type { FranchiseLead } from '@/hooks/useFranchiseLeads';
import { toast } from 'sonner';
import { canReadBranchSecrets, readAllBranchSecrets, type BranchSecrets } from '@/utils/branchSecrets';

const isActiveBranch = (branch: Branch): boolean =>
  branch.status === 'active' || (branch.active && !branch.status);

export function BranchesPage() {
  const { user } = useAuthStore();
  const {
    branches,
    isLoading,
    createBranch,
    broadcastLaunchAlert,
    activateStore,
    updateBranchSettings,
    toggleBranchStatus,
  } = useBranches();

  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'upcoming' | 'franchise_leads'>('all');
  const [showAddBranchModal, setShowAddBranchModal] = useState(false);
  const [branchInitialData, setBranchInitialData] = useState<Partial<CreateBranchInput> | null>(null);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [broadcastingBranch, setBroadcastingBranch] = useState<Branch | null>(null);
  const [activatingBranch, setActivatingBranch] = useState<Branch | null>(null);
  const [petpoojaInputId, setPetpoojaInputId] = useState('');
  // SEC-11: the POS store id lives in the brand-only `branch_secrets/{branchId}`,
  // not on `branches/*` (readable by every operator role). The cards render the
  // id from THIS map; a role that cannot read the collection sees no id at all
  // rather than a blank "not linked" claim about a live outlet. The gate is
  // DERIVED below, so a denied role never renders a stale map and the effect
  // does asynchronous work only.
  const [branchSecrets, setBranchSecrets] = useState<Record<string, BranchSecrets>>({});
  const canSeeSecrets = canReadBranchSecrets(user?.role);
  const visibleSecrets = canSeeSecrets ? branchSecrets : {};
  useEffect(() => {
    if (!canSeeSecrets) return;
    let active = true;
    void readAllBranchSecrets().then((all) => {
      if (active) setBranchSecrets(all);
    });
    return () => {
      active = false;
    };
  }, [canSeeSecrets]);

  // Defense-in-depth page guard: router-level ProtectedRoute is the primary
  // gate, but this page must never render branch data for roles outside the
  // brand-level allowlist (mirrors allowedRoles on the /branches route).
  const BRANCH_PAGE_ROLES = ['brand_owner', 'developer', 'support', 'regional_manager'] as const;
  if (!user || !(BRANCH_PAGE_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  const isGlobalRole =
    user?.role === 'brand_owner' || user?.role === 'developer' || user?.role === 'support';

  // Franchise lead PII is readable by brand roles only (canonical rules:
  // isBrandOwner() = brand_owner + developer). support/regional_manager reach
  // /branches but must not be offered a tab that can only fail or show empty.
  const canSeeFranchiseLeads = canReadFranchiseLeads(user?.role);
  const showFranchiseTab = canSeeFranchiseLeads && activeTab === 'franchise_leads';

  const canEditBranch = (branchId: string) => {
    if (isGlobalRole) return true;
    if (user?.role === 'branch_owner' && user.branchIds?.includes(branchId)) return true;
    return false;
  };

  const filteredBranches = branches.filter((b) => {
    if (activeTab === 'active') return isActiveBranch(b);
    if (activeTab === 'upcoming') return b.status === 'coming_soon';
    return true;
  });

  const handleCreateBranch = async (data: CreateBranchInput) => {
    await createBranch.mutateAsync(data);
    setBranchInitialData(null);
  };

  const handleSaveBranchSettings = async (branchId: string, settings: Partial<Branch>) => {
    // Rule C (fix wave 2026-11-20): this modal's name/phone/hours save also
    // carried `acceptingOrdersStatus`, so a "close" here wrote a branch flag no
    // ordering path reads. Split it: an open/closed CHANGE goes to the server
    // gate (which also owns `active` and the POS override); "busy" and every
    // other field stay a branch save.
    // r2 A5: use the FRESH branch from the live list (the query updates across
    // operator sessions) and pass the whole doc — including `storeStatusOverride`
    // — so a surge save from a stale form cannot reopen a closed store.
    const target = branches.find((b) => b.id === branchId) ?? editingBranch;
    const split = splitOperatingStatusChange({
      current: { ...(target ?? {}) },
      settings: settings as Record<string, unknown>,
    });

    if (split.gate) {
      await applyStaffStoreStatus({ branchId, status: split.gate.status });
    }
    if (Object.keys(split.branchSettings).length > 0) {
      await updateBranchSettings.mutateAsync({
        branchId,
        settings: split.branchSettings as Partial<Branch>,
      });
    }
  };

  /**
   * Go Offline / Go Live on a branch card.
   *
   * Rule C (fix wave 2026-11-20): this used to call `toggleBranchStatus` only,
   * which writes `branches/{id}.active` + `.status` — lifecycle metadata no
   * ordering path reads. "Go Offline" therefore left customers ordering, while
   * the card said the outlet was down.
   *
   * Now the CUSTOMER GATE moves first (server route, staff close outranks a POS
   * "open"), and only then do the lifecycle fields follow. A refused gate stops
   * the whole action: writing `active: false` would claim the outlet went
   * offline while customers keep ordering.
   */
  const handleToggleBranchOperatingStatus = async (branch: Branch) => {
    // r3 A5: derive from the EFFECTIVE status. A stale card showing "open"
    // while a staff override is in force is still closed — the action must not
    // silently request a reopen.
    const closing = !isStoreClosedByStaff(branch) && branch.active !== false;
    try {
      await applyStaffStoreStatus({
        branchId: branch.id,
        status: closing ? 'closed' : 'open',
      });
      // The lifecycle write is fire-and-forget metadata: `toggleBranchStatus`
      // derives `status: active ? 'active' : 'inactive'` itself.
      toggleBranchStatus.mutate(
        { branchId: branch.id, active: !closing },
        {
          // A rejected lifecycle write still leaves the gate moved — say what
          // is true rather than pretending nothing happened.
          onError: () =>
            toast.error(
              `Could not update ${branch.name}. The outlet itself is now ${closing ? 'CLOSED' : 'OPEN'} — only the lifecycle fields failed to save.`
            ),
        }
      );
      toast.success(
        closing
          ? `${branch.name} is now CLOSED — customers stop ordering, and Petpooja cannot reopen it.`
          : `${branch.name} is now OPEN — customers can order again; Petpooja owns open/closed from here.`
      );
    } catch (err) {
      const message = (err as Error)?.message || 'the server refused the change';
      toast.error(`Could not update ${branch.name}. The outlet status is unchanged.`, {
        description: message,
      });
    }
  };

  const handleActivateStoreConfirm = async () => {
    if (!activatingBranch) return;
    // SEC-11: the existing POS id is read from `branch_secrets`, not from the
    // branch directory document (which no longer carries it).
    const existingId = visibleSecrets[activatingBranch.id]?.petpoojaStoreId ?? undefined;
    await activateStore.mutateAsync({
      branchId: activatingBranch.id,
      petpoojaStoreId: petpoojaInputId || existingId,
    });
    setActivatingBranch(null);
    setPetpoojaInputId('');
  };

  const handleConvertToBranch = (lead: FranchiseLead) => {
    setBranchInitialData({
      name: `Burgonomics ${lead.city} ${lead.preferredLocation || 'Outlet'}`,
      city: lead.city,
      address: lead.notes || `${lead.preferredLocation || 'Prime Commercial Area'}, ${lead.city}`,
      phone: lead.phone,
      status: 'active',
      // SEC-11: the retired Route account id is never seeded — it is not a
      // concept any more. The POS store id is entered on the new outlet's
      // branch_secrets record, not on the directory document.
      monthlyFee: 2500,
    });
    setShowAddBranchModal(true);
  };

  const handleBroadcastAlert = async (data: {
    branchId: string;
    branchName: string;
    title: string;
    body: string;
  }) => {
    await broadcastLaunchAlert.mutateAsync(data);
  };

  return (
    <div className="space-y-6 select-none text-white">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-white tracking-wide">
              Store & Branch Network
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0E4825] text-[#4ADE80] border border-[#4ADE80]/40 font-mono uppercase">
              Operations Hub
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure live restaurant outlet delivery settings, geofence radius, fixed monthly fee, and franchise CRM
          </p>
        </div>

        {isGlobalRole && (
          <button
            onClick={() => {
              setBranchInitialData(null);
              setShowAddBranchModal(true);
            }}
            className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 bg-[#0E4825] hover:bg-[#155e32] text-white rounded-xl font-bold text-xs transition-colors shadow-md border border-[#4ADE80]/30 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#4ADE80]" />
            <span>Add New Branch</span>
          </button>
        )}
      </div>

      {/* 4-Tab Filter Bar */}
      <div className="flex items-center space-x-2 border-b border-[#1E3A24] pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('all')}
          className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'all'
              ? 'bg-[#0E4825] text-white shadow-sm border border-[#4ADE80]/30'
              : 'bg-[#112415] text-zinc-400 hover:text-white border border-[#1E3A24]'
          }`}
        >
          All Branches ({branches.length})
        </button>
        <button
          onClick={() => setActiveTab('active')}
          className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'active'
              ? 'bg-[#0E4825] text-white shadow-sm border border-[#4ADE80]/30'
              : 'bg-[#112415] text-zinc-400 hover:text-white border border-[#1E3A24]'
          }`}
        >
          Active Live Outlets ({branches.filter(isActiveBranch).length})
        </button>
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'upcoming'
              ? 'bg-[#0E4825] text-white shadow-sm border border-[#4ADE80]/30'
              : 'bg-[#112415] text-zinc-400 hover:text-white border border-[#1E3A24]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Coming Soon ({branches.filter((b) => b.status === 'coming_soon').length})</span>
        </button>
        {canSeeFranchiseLeads && (
          <button
            onClick={() => setActiveTab('franchise_leads')}
            className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'franchise_leads'
                ? 'bg-[#0E4825] text-white shadow-sm border border-[#4ADE80]/30'
                : 'bg-[#112415] text-zinc-400 hover:text-white border border-[#1E3A24]'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span>Franchise Leads (CRM)</span>
          </button>
        )}
      </div>

      {/* Render Tab 4: Franchise Leads CRM (brand roles only) */}
      {showFranchiseTab ? (
        <FranchiseLeadsPipeline onConvertToBranch={handleConvertToBranch} />
      ) : (
        /* Render Tabs 1, 2, 3: Branches Grid */
        <div>
          {isLoading ? (
            <div className="p-16 text-center text-zinc-400 text-xs">Loading store network...</div>
          ) : filteredBranches.length === 0 ? (
            <div className="text-center py-16 bg-[#112415] rounded-2xl border border-[#1E3A24] p-8 space-y-3">
              <Store className="w-12 h-12 mx-auto text-zinc-600" />
              <h3 className="font-bold text-white text-sm">No branches found in this view</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Use the "Add New Branch" button above to publish an outlet or upcoming store.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredBranches.map((branch) => {
                const isComingSoon = branch.status === 'coming_soon';
                const userCanEdit = canEditBranch(branch.id);
                // r4: the action label/style MUST use the same effective state as
                // the handler at line ~139. A stale `active:true` mirror under an
                // override is closed, so it shows "Go Live" (reopen), never
                // "Go Offline" (which would reopen via a close intent).
                const closing = !isStoreClosedByStaff(branch) && branch.active !== false;

                return (
                  <div
                    key={branch.id}
                    className="bg-[#112415] rounded-2xl border border-[#1E3A24] overflow-hidden flex flex-col justify-between shadow-xl hover:border-[#4ADE80]/50 transition-all"
                  >
                    {/* Banner for Upcoming */}
                    {isComingSoon && branch.bannerImage && (
                      <div className="h-32 w-full relative overflow-hidden bg-black/40">
                        <img
                          src={branch.bannerImage}
                          alt={branch.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-[#0E4825] text-white text-[10px] font-black uppercase tracking-wider shadow-md flex items-center gap-1 border border-[#4ADE80]/40">
                          <Sparkles className="w-3 h-3 text-amber-300" />
                          <span>Coming Soon</span>
                        </div>
                      </div>
                    )}

                    <div className="p-5 space-y-4">
                      {/* Title & Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-white text-sm">{branch.name}</h3>
                          <p className="text-xs font-bold text-[#4ADE80] mt-0.5">{branch.city}</p>
                        </div>

                        {!isComingSoon && (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              isStoreClosedByStaff(branch)
                                ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                                : branch.acceptingOrdersStatus === 'busy'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                : branch.active
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                            }`}
                          >
                            {isStoreClosedByStaff(branch)
                              ? 'Offline / Closed'
                              : branch.acceptingOrdersStatus === 'busy'
                              ? 'Busy (Delays)'
                              : branch.active
                              ? 'Accepting Orders'
                              : 'Offline / Closed'}
                          </span>
                        )}
                      </div>

                      {/* Store Address & Details */}
                      <div className="space-y-2 text-xs text-zinc-300">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-2 leading-relaxed text-zinc-400">
                            {branch.address}
                          </span>
                        </div>

                        {branch.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <span className="font-mono text-zinc-300">{branch.phone}</span>
                          </div>
                        )}

                        {branch.operatingHours && (
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <span>
                              {branch.operatingHours.open} – {branch.operatingHours.close}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Store Metrics Badges */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#1E3A24] text-[10px]">
                        <div className="p-2 rounded-xl bg-[#0A0A0A] border border-[#1E3A24]">
                          <div className="text-zinc-400 flex items-center gap-1">
                            <Bike className="w-3 h-3 text-[#4ADE80]" />
                            <span>Delivery Radius:</span>
                          </div>
                          <div className="font-mono font-bold text-white mt-0.5">
                            {branch.deliveryRadiusKm
                              ? `${branch.deliveryRadiusKm} km Geofence`
                              : 'Not configured'}
                          </div>
                        </div>

                        <div className="p-2 rounded-xl bg-[#0A0A0A] border border-[#1E3A24]">
                          <div className="text-zinc-400 flex items-center gap-1">
                            <CreditCard className="w-3 h-3 text-[#FF6600]" />
                            <span>Monthly Fee:</span>
                          </div>
                          <div className="font-mono font-bold text-white mt-0.5">
                            {branch.monthlyFee != null
                              ? `₹${branch.monthlyFee.toLocaleString()} / month`
                              : '₹2,500 / month (default)'}
                          </div>
                        </div>
                      </div>

                      {/* Petpooja Integration Tag — SEC-11: the POS id is read
                          from the brand-only branch_secrets document. */}
                      {visibleSecrets[branch.id]?.petpoojaStoreId && (
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 bg-[#0A0A0A] px-2.5 py-1.5 rounded-lg border border-[#1E3A24]">
                          <Cpu className="w-3 h-3 text-[#4ADE80]" />
                          <span>Petpooja POS Bridge:</span>
                          <span className="font-mono font-bold text-white">
                            {visibleSecrets[branch.id].petpoojaStoreId}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action Bar */}
                    <div className="p-4 bg-[#0A0A0A] border-t border-[#1E3A24] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {userCanEdit && (
                          <button
                            onClick={() => setEditingBranch(branch)}
                            className="px-3 py-1.5 rounded-xl bg-[#112415] hover:bg-[#16301B] text-zinc-200 hover:text-white border border-[#1E3A24] font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Settings className="w-3.5 h-3.5 text-[#4ADE80]" />
                            <span>Config</span>
                          </button>
                        )}

                        {isComingSoon && canPublishBranchAnnouncement(user?.role) && (
                          <button
                            onClick={() => setBroadcastingBranch(branch)}
                            className="px-3 py-1.5 rounded-xl bg-[#0E4825] hover:bg-[#155e32] text-white border border-[#4ADE80]/30 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Broadcast</span>
                          </button>
                        )}
                      </div>

                      {userCanEdit && !isComingSoon && (
                        <button
                          onClick={() => handleToggleBranchOperatingStatus(branch)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                            closing
                              ? 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-900/60'
                              : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/60'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>{closing ? 'Go Offline' : 'Go Live'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add / Provision Branch Modal */}
      <BranchConfigModal
        isOpen={showAddBranchModal}
        onClose={() => setShowAddBranchModal(false)}
        onSubmit={handleCreateBranch}
        initialData={branchInitialData}
        isSuperAdmin={isGlobalRole}
        canEditMonthlyFee={isBrandRole(user?.role)}
        loading={createBranch.isPending}
      />

      {/* Edit Branch Modal */}
      {editingBranch && (
        <BranchSettingsModal
          isOpen={!!editingBranch}
          onClose={() => setEditingBranch(null)}
          branch={editingBranch}
          onSave={handleSaveBranchSettings}
          loading={updateBranchSettings.isPending}
          readOnly={user?.role === 'support' || user?.role === 'regional_manager'}
        />
      )}

      {/* Launch Broadcast Alert Modal */}
      {broadcastingBranch && (
        <LaunchBroadcastModal
          isOpen={!!broadcastingBranch}
          onClose={() => setBroadcastingBranch(null)}
          branch={broadcastingBranch}
          onBroadcast={handleBroadcastAlert}
          loading={broadcastLaunchAlert.isPending}
        />
      )}
    </div>
  );
}

export default BranchesPage;
