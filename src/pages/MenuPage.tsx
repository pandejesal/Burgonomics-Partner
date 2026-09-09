import React, { useState, useRef, useEffect } from 'react';
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
  // App↔POS divergence: the Firestore write landed but the Petpooja push did
  // not (or was skipped for an unlinked item). Shown until a retry succeeds.
  const [posDivergence, setPosDivergence] = useState<{
    itemId: string;
    itemName: string;
    isAvailable: boolean;
    reason: 'push-failed' | 'unlinked';
  } | null>(null);

  const canEdit =
    user?.role === 'brand_owner' ||
    user?.role === 'developer' ||
    user?.role === 'branch_owner';

  const showToast = (msg: string) => {
    // Single toast at a time: each action replaces the previous message so
    // rapid taps can't stack duplicate success toasts.
    setToastMessage(msg);
  };

  // Auto-dismiss the single toast; the timer resets on every new message.
  const toastTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!toastMessage) return;
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 4000);
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [toastMessage]);

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

  const notePosOutcome = (
    item: MenuItem,
    isAvailable: boolean,
    outcome: { posSynced: boolean; posSkipped: boolean }
  ) => {
    if (outcome.posSynced) {
      if (posDivergence?.itemId === item.id) setPosDivergence(null);
      showToast(
        isAvailable
          ? `${item.name} is now back IN STOCK on customer app & POS`
          : `${item.name} marked 86ed — customer app & POS updated`
      );
    } else if (outcome.posSkipped) {
      setPosDivergence({ itemId: item.id, itemName: item.name, isAvailable, reason: 'unlinked' });
      showToast(`${item.name} saved in app — no POS item linked, POS unchanged.`);
    } else {
      setPosDivergence({ itemId: item.id, itemName: item.name, isAvailable, reason: 'push-failed' });
      showToast(`${item.name} saved in app — POS push failed, divergence flagged below.`);
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
      const outcome = await toggleAvailability.mutateAsync({ itemId: item.id, isAvailable: true });
      notePosOutcome(item, true, outcome);
    } catch (err) {
      console.error('Re-enable failed:', err);
      showToast(`Could not re-enable ${item.name} — no changes were made.`);
    }
  };

  const handleConfirm86 = async (itemId: string, duration: EightSixDuration, reason: string) => {
    const item = items?.find((i) => i.id === itemId);
    try {
      const outcome = await markItem86.mutateAsync({ itemId, duration, reason });
      if (item) notePosOutcome(item, false, outcome);
      else showToast('Item marked out of stock');
    } catch (err) {
      console.error('86-ing failed:', err);
      showToast('Could not update stock — no changes were made.');
    }
  };

  const handleRetryPosPush = async () => {
    if (!posDivergence) return;
    const item = items?.find((i) => i.id === posDivergence.itemId);
    if (!item) {
      setPosDivergence(null);
      return;
    }
    try {
      const outcome = await toggleAvailability.mutateAsync({
        itemId: item.id,
        isAvailable: posDivergence.isAvailable,
      });
      notePosOutcome(item, posDivergence.isAvailable, outcome);
    } catch (err) {
      console.error('POS retry failed:', err);
      showToast('POS retry failed — app state unchanged, divergence kept.');
    }
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

      {/* App↔POS divergence banner: the app write landed but the POS does
          not match. Dismissable only via a successful retry. */}
      {posDivergence && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between bg-amber-950/60 border border-amber-800 rounded-2xl p-4"
        >
          <p className="text-xs text-amber-200">
            <span className="font-bold">POS divergence:</span> {posDivergence.itemName} is{' '}
            {posDivergence.isAvailable ? 'IN STOCK' : '86ed'} in the app but{' '}
            {posDivergence.reason === 'unlinked'
              ? 'has no linked POS item, so the POS was not updated.'
              : 'the POS push failed, so the POS may still show the old state.'}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {posDivergence.reason === 'push-failed' && (
              <button
                type="button"
                onClick={handleRetryPosPush}
                disabled={toggleAvailability.isPending}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs cursor-pointer"
              >
                {toggleAvailability.isPending ? 'Retrying…' : 'Retry POS push'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPosDivergence(null)}
              className="px-3.5 py-2 rounded-xl border border-amber-800 text-amber-200 font-bold text-xs cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

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
