import React, { useState } from 'react';
import { useBranches } from '@/hooks/useBranches';
import { useAuthStore } from '@/stores/authStore';
import { AddFutureStoreModal } from '@/components/stores/AddFutureStoreModal';
import { BranchSettingsModal } from '@/components/stores/BranchSettingsModal';
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
} from 'lucide-react';
import type { Branch, FutureStoreInput } from '@/types';

export function BranchesPage() {
  const { user } = useAuthStore();
  const {
    branches,
    isLoading,
    createFutureStore,
    activateStore,
    updateBranchSettings,
    toggleBranchStatus,
  } = useBranches();

  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'upcoming'>('all');
  const [showAddFutureStore, setShowAddFutureStore] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
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

  const handleCreateFutureStore = async (data: FutureStoreInput) => {
    await createFutureStore.mutateAsync(data);
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

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Store & Branch Network</h1>
          <p className="text-xs text-zinc-400">
            Configure live restaurant outlet delivery settings and publish upcoming stores to the
            Delivery App
          </p>
        </div>

        {isGlobalRole && (
          <button
            onClick={() => setShowAddFutureStore(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#D95D0F] hover:bg-[#b84d0b] text-white rounded-xl font-semibold text-xs transition-colors shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Future Store</span>
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2 border-b border-[#1E3A24] pb-3">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'all'
              ? 'bg-[#D95D0F] text-white'
              : 'bg-[#132A17] text-zinc-400 hover:text-white'
          }`}
        >
          All Branches ({branches.length})
        </button>
        <button
          onClick={() => setActiveTab('active')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'active'
              ? 'bg-[#D95D0F] text-white'
              : 'bg-[#132A17] text-zinc-400 hover:text-white'
          }`}
        >
          Active Live Outlets ({branches.filter((b) => b.status !== 'coming_soon').length})
        </button>
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
            activeTab === 'upcoming'
              ? 'bg-[#D95D0F] text-white'
              : 'bg-[#132A17] text-zinc-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Coming Soon ({branches.filter((b) => b.status === 'coming_soon').length})</span>
        </button>
      </div>

      {/* Content Grid */}
      {isLoading ? (
        <div className="p-16 text-center text-zinc-400 text-xs">Loading store network...</div>
      ) : filteredBranches.length === 0 ? (
        <div className="text-center py-16 bg-[#132A17] rounded-2xl border border-[#234B2A] p-8 space-y-3">
          <Store className="w-12 h-12 mx-auto text-zinc-600" />
          <h3 className="font-semibold text-white text-sm">No branches found in this view</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Use the "Add Future Store" button above to publish an upcoming store to the customer app.
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
                className="bg-[#132A17] rounded-2xl border border-[#234B2A] overflow-hidden flex flex-col justify-between shadow-md hover:border-[#D95D0F]/40 transition-colors"
              >
                {/* Optional Banner for Upcoming */}
                {isComingSoon && branch.bannerImage && (
                  <div className="h-32 w-full relative overflow-hidden bg-black/40">
                    <img
                      src={branch.bannerImage}
                      alt={branch.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-[#D95D0F] text-white text-[10px] font-bold uppercase tracking-wider shadow-md">
                      Coming Soon
                    </div>
                  </div>
                )}

                <div className="p-5 space-y-4">
                  {/* Title & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-white text-sm">{branch.name}</h3>
                      <p className="text-xs font-semibold text-[#D95D0F] mt-0.5">{branch.city}</p>
                    </div>

                    {!isComingSoon && (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
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

                  {/* Details */}
                  <div className="space-y-2 text-xs text-zinc-300">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{branch.address}</span>
                    </div>

                    {branch.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-zinc-500 shrink-0" />
                        <span>{branch.phone}</span>
                      </div>
                    )}

                    {branch.announcementBanner && (
                      <div className="flex items-start gap-2 bg-[#0D0F0D] p-2 rounded-lg border border-[#234B2A] text-amber-300 text-[11px]">
                        <Megaphone className="w-3.5 h-3.5 text-[#D95D0F] shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{branch.announcementBanner}</span>
                      </div>
                    )}

                    {!isComingSoon && (
                      <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-zinc-400">
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Prep: {branch.prepTimeMinutes || 20}m</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Bike className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Radius: {branch.deliveryRadiusKm || 7}km</span>
                        </div>
                      </div>
                    )}

                    {isComingSoon ? (
                      <div className="flex items-center gap-2 text-amber-400 font-medium">
                        <Clock className="w-4 h-4 shrink-0" />
                        <span>Launch: {branch.expectedLaunchDate || 'TBD'}</span>
                      </div>
                    ) : branch.operatingHours ? (
                      <div className="flex items-center gap-2 text-zinc-400">
                        <Clock className="w-4 h-4 shrink-0" />
                        <span>
                          {branch.operatingHours.open} - {branch.operatingHours.close}
                        </span>
                      </div>
                    ) : null}

                    {branch.petpoojaStoreId && (
                      <div className="text-[11px] text-zinc-400">
                        <span className="font-semibold text-zinc-300">Petpooja POS ID:</span>{' '}
                        {branch.petpoojaStoreId}
                      </div>
                    )}

                    {isComingSoon && (
                      <div className="flex items-center space-x-2 pt-2 border-t border-[#1E3A24] text-[11px] text-zinc-400">
                        <Users className="w-3.5 h-3.5 text-[#D95D0F]" />
                        <span>
                          <strong className="text-white">
                            {branch.subscribersCount || 0} customers
                          </strong>{' '}
                          subscribed in Delivery App
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 bg-[#0E1E12] border-t border-[#234B2A] flex items-center justify-between gap-2">
                  {isComingSoon ? (
                    isGlobalRole && (
                      <button
                        onClick={() => {
                          setActivatingBranch(branch);
                          setPetpoojaInputId(branch.petpoojaStoreId || '');
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center justify-center space-x-1.5 shadow-sm"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Activate Outlet for Live Orders</span>
                      </button>
                    )
                  ) : (
                    <>
                      {userCanEdit && (
                        <button
                          onClick={() => setEditingBranch(branch)}
                          className="flex-1 py-2 px-3 rounded-xl bg-[#1E3A24] hover:bg-[#285031] text-zinc-200 hover:text-white font-semibold text-xs transition-colors flex items-center justify-center space-x-1.5 border border-[#234B2A]"
                        >
                          <Settings className="w-3.5 h-3.5 text-[#D95D0F]" />
                          <span>Delivery Settings</span>
                        </button>
                      )}

                      {isGlobalRole && (
                        <button
                          onClick={() =>
                            toggleBranchStatus.mutate({
                              branchId: branch.id,
                              active: !branch.active,
                            })
                          }
                          className={`p-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center ${
                            branch.active
                              ? 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40'
                              : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/40'
                          }`}
                          title={branch.active ? 'Disable Outlet' : 'Enable Outlet'}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Branch Settings Modal */}
      <BranchSettingsModal
        isOpen={!!editingBranch}
        onClose={() => setEditingBranch(null)}
        branch={editingBranch}
        onSave={handleSaveBranchSettings}
        loading={updateBranchSettings.isPending}
      />

      {/* Add Future Store Modal */}
      <AddFutureStoreModal
        isOpen={showAddFutureStore}
        onClose={() => setShowAddFutureStore(false)}
        onSubmit={handleCreateFutureStore}
        loading={createFutureStore.isPending}
      />

      {/* Activate Store Confirmation Modal */}
      {activatingBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#132A17] border border-[#234B2A] rounded-2xl w-full max-w-md p-6 space-y-4 text-white shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>Activate {activatingBranch.name}</span>
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Transitioning this upcoming store to an active branch will enable real-time order
              placement on the Main Burgonomics Delivery App.
            </p>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Petpooja POS Store ID
              </label>
              <input
                type="text"
                placeholder="e.g. PP_MUM_01"
                value={petpoojaInputId}
                onChange={(e) => setPetpoojaInputId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setActivatingBranch(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#1E3A24] text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleActivateStoreConfirm}
                disabled={activateStore.isPending}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                {activateStore.isPending ? 'Activating...' : 'Confirm Activation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
