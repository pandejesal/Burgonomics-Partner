import React, { useState } from 'react';
import { useBranches, type CreateBranchInput } from '@/hooks/useBranches';
import { useAuthStore } from '@/stores/authStore';
import { BranchConfigModal } from '@/features/branches/components/BranchConfigModal';
import { BranchSettingsModal } from '@/components/stores/BranchSettingsModal';
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

  const isGlobalRole =
    user?.role === 'brand_owner' || user?.role === 'developer' || user?.role === 'support';

  const canEditBranch = (branchId: string) => {
    if (isGlobalRole) return true;
    if (user?.role === 'branch_owner' && user.branchIds?.includes(branchId)) return true;
    return false;
  };

  const filteredBranches = branches.filter((b) => {
    if (activeTab === 'active') return b.status === 'active' || (b.active && !b.status);
    if (activeTab === 'upcoming') return b.status === 'coming_soon';
    return true;
  });

  const handleCreateBranch = async (data: CreateBranchInput) => {
    await createBranch.mutateAsync(data);
    setBranchInitialData(null);
  };

  const handleSaveBranchSettings = async (branchId: string, settings: Partial<Branch>) => {
    await updateBranchSettings.mutateAsync({ branchId, settings });
  };

  const handleActivateStoreConfirm = async () => {
    if (!activatingBranch) return;
    await activateStore.mutateAsync({
      branchId: activatingBranch.id,
      petpoojaStoreId: petpoojaInputId || activatingBranch.petpoojaStoreId,
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
      // Loop: no fabricated account id (see useBranches.createBranch) — the
      // operator must paste the real Razorpay linked account; empty stays
      // empty and the Route worker skips the branch with a log.
      razorpayAccountId: '',
      brandRoyaltyPercent: 5.0,
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
            Configure live restaurant outlet delivery settings, geofence radius, Razorpay Route settlements, and franchise CRM
          </p>
        </div>

        {isGlobalRole && (
          <button
            onClick={() => {
              setBranchInitialData(null);
              setShowAddBranchModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0E4825] hover:bg-[#155e32] text-white rounded-xl font-bold text-xs transition-colors shadow-md border border-[#4ADE80]/30 cursor-pointer"
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
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'all'
              ? 'bg-[#0E4825] text-white shadow-sm border border-[#4ADE80]/30'
              : 'bg-[#112415] text-zinc-400 hover:text-white border border-[#1E3A24]'
          }`}
        >
          All Branches ({branches.length})
        </button>
        <button
          onClick={() => setActiveTab('active')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'active'
              ? 'bg-[#0E4825] text-white shadow-sm border border-[#4ADE80]/30'
              : 'bg-[#112415] text-zinc-400 hover:text-white border border-[#1E3A24]'
          }`}
        >
          Active Live Outlets ({branches.filter((b) => b.status !== 'coming_soon').length})
        </button>
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'upcoming'
              ? 'bg-[#0E4825] text-white shadow-sm border border-[#4ADE80]/30'
              : 'bg-[#112415] text-zinc-400 hover:text-white border border-[#1E3A24]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Coming Soon ({branches.filter((b) => b.status === 'coming_soon').length})</span>
        </button>
        <button
          onClick={() => setActiveTab('franchise_leads')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'franchise_leads'
              ? 'bg-[#0E4825] text-white shadow-sm border border-[#4ADE80]/30'
              : 'bg-[#112415] text-zinc-400 hover:text-white border border-[#1E3A24]'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-cyan-400" />
          <span>Franchise Leads (CRM)</span>
        </button>
      </div>

      {/* Render Tab 4: Franchise Leads CRM */}
      {activeTab === 'franchise_leads' ? (
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
                              branch.acceptingOrdersStatus === 'busy'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                : branch.active && branch.acceptingOrdersStatus !== 'closed'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                            }`}
                          >
                            {branch.acceptingOrdersStatus === 'busy'
                              ? 'Busy (Delays)'
                              : branch.active && branch.acceptingOrdersStatus !== 'closed'
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
                            {branch.deliveryRadiusKm || 7} km Geofence
                          </div>
                        </div>

                        <div className="p-2 rounded-xl bg-[#0A0A0A] border border-[#1E3A24]">
                          <div className="text-zinc-400 flex items-center gap-1">
                            <CreditCard className="w-3 h-3 text-[#FF6600]" />
                            <span>Route Royalty:</span>
                          </div>
                          <div className="font-mono font-bold text-white mt-0.5">
                            {branch.brandRoyaltyPercent || 5.0}% Escrow Cut
                          </div>
                        </div>
                      </div>

                      {/* Petpooja Integration Tag */}
                      {branch.petpoojaStoreId && (
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 bg-[#0A0A0A] px-2.5 py-1.5 rounded-lg border border-[#1E3A24]">
                          <Cpu className="w-3 h-3 text-[#4ADE80]" />
                          <span>Petpooja POS Bridge:</span>
                          <span className="font-mono font-bold text-white">{branch.petpoojaStoreId}</span>
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

                        {isComingSoon && (
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
                          onClick={() =>
                            toggleBranchStatus.mutate({
                              branchId: branch.id,
                              active: !branch.active,
                            })
                          }
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                            branch.active
                              ? 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-900/60'
                              : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/60'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>{branch.active ? 'Go Offline' : 'Go Live'}</span>
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
