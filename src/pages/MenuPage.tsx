import React, { useState } from 'react';
import { useBranchMenu } from '@/features/menu/hooks/useBranchMenu';
import { useAuthStore } from '@/stores/authStore';
import { MenuItemToggleRow } from '@/features/menu/components/MenuItemToggleRow';
import { Instant86ingModal, type EightSixDuration } from '@/features/menu/components/Instant86ingModal';
import { ComboBuilderDrawer } from '@/features/menu/components/ComboBuilderDrawer';
import {
  UtensilsCrossed,
  Search,
  RefreshCw,
  CheckCircle2,
  Clock,
  Plus,
  Filter,
  Layers,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { MenuItem } from '@/types';

export function MenuPage() {
  const { user } = useAuthStore();
  const {
    categories,
    items,
    isLoading,
    error: menuError,
    refetch: refetchMenu,
    lastSyncedAt,
    toggleAvailability,
    syncPetpooja,
    markItem86,
    toggleCategoryAvailability,
    createComboMeal,
  } = useBranchMenu();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyJainFilter, setOnlyJainFilter] = useState<boolean>(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [eightSixTargetItem, setEightSixTargetItem] = useState<MenuItem | null>(null);
  const [showComboDrawer, setShowComboDrawer] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const canEdit =
    user?.role === 'brand_owner' ||
    user?.role === 'developer' ||
    user?.role === 'branch_owner';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleManualSync = async () => {
    try {
      await syncPetpooja.mutateAsync();
      setSyncSuccess(true);
      showToast('Catalog refreshed from Petpooja POS bridge');
      setTimeout(() => setSyncSuccess(false), 3000);
    } catch (err) {
      console.error('Petpooja sync failed:', err);
      showToast('Menu sync failed — catalog unchanged. Check connection and retry.');
    }
  };

  const handleToggleStock = async (item: MenuItem) => {
    const isCurrentlyAvailable = item.isAvailable ?? item.inStock ?? true;
    if (isCurrentlyAvailable) {
      // Opening 86ing modal to configure duration
      setEightSixTargetItem(item);
      return;
    }
    // Re-enable item immediately — toast only after the write lands.
    try {
      await toggleAvailability.mutateAsync({ itemId: item.id, isAvailable: true });
      showToast(`${item.name} is now back IN STOCK on customer app & POS`);
    } catch (err) {
      console.error('Re-enable failed:', err);
      showToast(`Could not re-enable ${item.name} — no changes were made.`);
    }
  };

  const handleConfirm86 = async (itemId: string, duration: EightSixDuration, reason: string) => {
    let res: { posSynced: boolean } | undefined;
    try {
      res = await markItem86.mutateAsync({ itemId, duration, reason });
    } catch (err) {
      console.error('86-ing failed:', err);
      showToast('Could not update stock — no changes were made.');
      return;
    }
    // Loop 6: success toast ONLY on success — the old fall-through toasted
    // "marked 86ed" even after a failed write, so staff believed the item
    // was off while it stayed orderable.
    const item = items?.find((i) => i.id === itemId);
    showToast(
      res?.posSynced
        ? `${item?.name || 'Item'} marked 86ed (${duration.replace('_', ' ')}) — customer app & POS`
        : `${item?.name || 'Item'} marked 86ed on customer app — POS sync pending, retry from menu if it lingers`
    );
  };

  const filteredItems = (items || []).filter((item) => {
    if (selectedCategory !== 'all' && item.categoryId !== selectedCategory) {
      return false;
    }
    if (onlyJainFilter && !item.isJain) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.name?.toLowerCase().includes(q);
      const matchCat = (item.category || item.categoryId)?.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      if (!matchName && !matchCat && !matchDesc) return false;
    }
    return true;
  });

  const syncedAgo = (() => {
    try {
      if (lastSyncedAt?.toDate) {
        return formatDistanceToNow(lastSyncedAt.toDate(), { addSuffix: true });
      }
      return 'Just now';
    } catch {
      return 'Recently';
    }
  })();

  const outOfStockCount = (items || []).filter(
    (i) => i.isAvailable === false || i.inStock === false
  ).length;

  return (
    <div className="space-y-6 select-none text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-[#0E4825] border border-[#4ADE80] text-white rounded-xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-[#4ADE80]" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* Header with Title & Petpooja Sync Action */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-white tracking-wide">
              Menu & Catalog Management
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0E4825] text-[#4ADE80] border border-[#4ADE80]/40 font-mono uppercase">
              Petpooja Live
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            100% Pure Veg catalog synced with POS. Manage instant 86ing, category switches & combo meals.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {outOfStockCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/60 border border-amber-800 text-amber-300 text-xs font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>{outOfStockCount} Items 86ed</span>
            </div>
          )}

          {canEdit && (
            <button
              onClick={() => setShowComboDrawer(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#112415] hover:bg-[#16301B] text-zinc-200 hover:text-white border border-[#1E3A24] font-bold text-xs transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-[#4ADE80]" />
              <span>Combo Builder</span>
            </button>
          )}

          <button
            onClick={handleManualSync}
            disabled={syncPetpooja.isPending}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all border cursor-pointer ${
              syncSuccess
                ? 'bg-[#0E4825] text-[#4ADE80] border-[#4ADE80]'
                : 'bg-[#0E4825] hover:bg-[#155e32] text-white border-[#4ADE80]/30 disabled:opacity-50'
            }`}
          >
            {syncSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-[#4ADE80]" />
                <span>Catalog Synced!</span>
              </>
            ) : (
              <>
                <RefreshCw
                  className={`w-3.5 h-3.5 text-[#4ADE80] ${syncPetpooja.isPending ? 'animate-spin' : ''}`}
                />
                <span>{syncPetpooja.isPending ? 'Syncing...' : 'Sync POS'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Search Bar & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-[#112415] p-3 rounded-2xl border border-[#1E3A24]">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search items, ingredients, code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ADE80]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setOnlyJainFilter(!onlyJainFilter)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
              onlyJainFilter
                ? 'bg-amber-950 text-amber-300 border-amber-800'
                : 'bg-[#0A0A0A] text-zinc-400 border-[#1E3A24] hover:text-white'
            }`}
          >
            Jain Friendly Only
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center space-x-2 border-b border-[#1E3A24] pb-3 overflow-x-auto">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            selectedCategory === 'all'
              ? 'bg-[#0E4825] text-white shadow-sm border border-[#4ADE80]/30'
              : 'bg-[#112415] text-zinc-400 hover:text-white border border-[#1E3A24]'
          }`}
        >
          All Items ({items?.length || 0})
        </button>

        {categories?.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              selectedCategory === cat.id
                ? 'bg-[#0E4825] text-white shadow-sm border border-[#4ADE80]/30'
                : 'bg-[#112415] text-zinc-400 hover:text-white border border-[#1E3A24]'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Items List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="p-16 text-center text-zinc-400 text-xs">Loading menu items...</div>
        ) : menuError ? (
          <div role="alert" className="text-center py-16 bg-[#112415] rounded-2xl border border-rose-900/50 p-8 space-y-3">
            <UtensilsCrossed className="w-10 h-10 mx-auto text-rose-400" />
            <h3 className="font-bold text-white text-sm">Menu failed to load</h3>
            <p className="text-xs text-zinc-400">{menuError.message || 'Check connection and permissions, then retry.'}</p>
            <button
              type="button"
              onClick={() => refetchMenu()}
              className="px-4 py-2 rounded-xl bg-[#0E4825] text-emerald-300 font-bold text-xs cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16 bg-[#112415] rounded-2xl border border-[#1E3A24] p-8 space-y-2">
            <UtensilsCrossed className="w-10 h-10 mx-auto text-zinc-600" />
            <h3 className="font-bold text-white text-sm">No items matching filter</h3>
            <p className="text-xs text-zinc-400">Try adjusting your search query or category filter</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="mt-3 px-4 py-2 rounded-xl bg-[#0E4825] hover:bg-[#135d30] text-emerald-300 text-xs font-bold transition-colors cursor-pointer min-h-[44px]"
            >
              Clear filters
            </button>
          </div>
        ) : (
          filteredItems.map((item) => (
            <MenuItemToggleRow
              key={item.id}
              item={item}
              canEdit={canEdit}
              onToggleStock={handleToggleStock}
              disabledUntilText={
                item.eightSixDuration === '2_hours'
                  ? 'Until rush ends'
                  : item.eightSixDuration === 'rest_of_day'
                  ? 'Auto-renews 6 AM'
                  : 'Disabled'
              }
            />
          ))
        )}
      </div>

      {/* 86ing Duration & Reason Modal */}
      <Instant86ingModal
        isOpen={!!eightSixTargetItem}
        onClose={() => setEightSixTargetItem(null)}
        item={eightSixTargetItem}
        onConfirm86={handleConfirm86}
        loading={markItem86.isPending}
      />

      {/* Combo Builder Drawer */}
      <ComboBuilderDrawer
        isOpen={showComboDrawer}
        onClose={() => setShowComboDrawer(false)}
        availableItems={items || []}
        onCreateCombo={async (data) => {
          await createComboMeal.mutateAsync(data);
          showToast(`Combo meal "${data.name}" created at ₹${data.price}!`);
        }}
        loading={createComboMeal.isPending}
      />
    </div>
  );
}

export default MenuPage;
