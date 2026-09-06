import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import {
  KDSOrderCard,
  KOTTimerBadge,
  AcousticChimePlayer,
  useKDSRealtimeStream,
} from '@/features/kds';
import {
  isKDSAudioMuted,
  setKDSAudioMuted,
  unlockKDSAudio,
  isKDSAudioUnlocked,
} from '@/utils/kdsAudio';
import {
  Flame,
  ChefHat,
  CheckCircle2,
  Maximize2,
  Minimize2,
  ArrowLeft,
  Bike,
  ShoppingBag,
  UtensilsCrossed,
  Plus,
  RotateCcw,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  WifiOff,
  Store,
} from 'lucide-react';
import type { OrderType, OrderStatus } from '@/types';

export function KDSPage() {
  const { user } = useAuthStore();
  const { selectedBranchId, setSelectedBranchId } = useAppStore();

  const {
    isOnline,
    isLoading,
    activeOrders,
    pendingOrders,
    preparingOrders,
    readyOrders,
    bumpOrder,
    bumpingIds,
    recallLastOrder,
    canRecall,
    lastBumpedOrder,
    simulateOrder,
    refresh,
    lastRefreshAt,
  } = useKDSRealtimeStream();
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 15000);
    return () => window.clearInterval(t);
  }, []);
  void nowTick;
  const refreshAgeSec = Math.max(0, Math.round((Date.now() - lastRefreshAt) / 1000));

  // Channel filter: 'all' | 'delivery' | 'takeaway' | 'dinein'
  const [channelFilter, setChannelFilter] = useState<OrderType | 'all'>('all');

  // Item bump checklist state: key = `${orderId}_${itemIndex}`
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // Audio mute & unlock state
  const [isMuted, setIsMuted] = useState<boolean>(isKDSAudioMuted());
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(isKDSAudioUnlocked());

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Handle Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Error enabling fullscreen:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const handleUnlockAudio = async () => {
    const unlocked = await unlockKDSAudio();
    if (unlocked) {
      setAudioUnlocked(true);
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    setKDSAudioMuted(nextMuted);
    if (!nextMuted) {
      handleUnlockAudio();
    }
  };

  const handleToggleItemCheck = (orderId: string, itemIdx: number) => {
    const key = `${orderId}_${itemIdx}`;
    setCheckedItems((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Filter column orders by selected channel
  const filteredPending = useMemo(() => {
    if (channelFilter === 'all') return pendingOrders;
    return pendingOrders.filter((o) => o.orderType === channelFilter);
  }, [pendingOrders, channelFilter]);

  const filteredPreparing = useMemo(() => {
    if (channelFilter === 'all') return preparingOrders;
    return preparingOrders.filter((o) => o.orderType === channelFilter);
  }, [preparingOrders, channelFilter]);

  const filteredReady = useMemo(() => {
    if (channelFilter === 'all') return readyOrders;
    return readyOrders.filter((o) => o.orderType === channelFilter);
  }, [readyOrders, channelFilter]);

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans select-none">
      {/* Offline Loss Alert Banner */}
      {!isOnline && (
        <div
          role="alert"
          className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-center gap-2 font-black text-sm uppercase tracking-wider animate-pulse shadow-md z-50"
        >
          <WifiOff className="w-5 h-5 stroke-[2.5]" />
          <span>⚠️ KITCHEN OFFLINE - CHECK INTERNET & RECONNECTING WEBSOCKET...</span>
        </div>
      )}

      {/* Top Operations Toolbar */}
      <header className="px-4 py-3 bg-[#0A0A0A] border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            title="Exit KDS to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
              <span>Burgonomics KDS</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#0E4825] border border-emerald-500/40 text-emerald-300 font-bold">
                Makeline Live
              </span>
            </h1>
            <span className="text-[10px] font-mono text-neutral-500" title="Last order-stream refresh">
              {refreshAgeSec < 60 ? `${refreshAgeSec}s ago` : `${Math.floor(refreshAgeSec / 60)}m ago`}
            </span>
            <button
              type="button"
              onClick={refresh}
              aria-label="Refresh order stream now"
              className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center: Fulfillment Channel Filters */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-neutral-900 border border-neutral-800 overflow-x-auto">
          <button
            type="button"
            onClick={() => setChannelFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              channelFilter === 'all'
                ? 'bg-[#0E4825] text-emerald-300 shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            All ({activeOrders.length})
          </button>

          <button
            type="button"
            onClick={() => setChannelFilter('delivery')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              channelFilter === 'delivery'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Bike className="w-3.5 h-3.5" />
            <span>Delivery</span>
          </button>

          <button
            type="button"
            onClick={() => setChannelFilter('takeaway')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              channelFilter === 'takeaway'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Takeaway</span>
          </button>

          <button
            type="button"
            onClick={() => setChannelFilter('dinein')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              channelFilter === 'dinein'
                ? 'bg-cyan-700 text-white shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>Dine-In</span>
          </button>
        </div>

        {/* Right Actions: Recall Last KOT, Audio Chime Player, Fullscreen */}
        <div className="flex items-center gap-2">
          {/* Recall Last Bumped Order Button */}
          {canRecall && (
            <button
              type="button"
              onClick={() => void recallLastOrder()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer animate-bounce"
              title={`Recall #${lastBumpedOrder?.id.slice(0, 6) || ''} back to Makeline`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Recall Last KOT</span>
            </button>
          )}

          {/* Simulate New KOT (kitchen training & testing) — dev only: it
              writes fake orders into the live collection in production. */}
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={() => simulateOrder && simulateOrder()}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-xs font-bold transition-colors cursor-pointer"
              title="Simulate incoming order"
            >
              <Plus className="w-3.5 h-3.5 text-[#FF6600]" />
              <span>+ Test KOT</span>
            </button>
          )}

          {/* Acoustic Audio Chime Controller */}
          <AcousticChimePlayer
            isMuted={isMuted}
            audioUnlocked={audioUnlocked}
            onToggleMute={toggleMute}
            onUnlockAudio={handleUnlockAudio}
          />

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Kitchen Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main 3-Column Makeline Kanban Grid */}
      <main className="flex-1 p-3 sm:p-4 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-y-auto">
        {/* Column 1: New KOTs (Pending) */}
        <section
          aria-label="New KOTs"
          className="flex flex-col rounded-2xl bg-[#090909] border border-neutral-800/80 overflow-hidden"
        >
          <div className="p-3 bg-neutral-900/90 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                New KOTs (To Start)
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400 font-mono text-xs font-black">
              {filteredPending.length}
            </span>
          </div>

          <div className="flex-1 p-3 space-y-3.5 overflow-y-auto">
            {filteredPending.length === 0 ? (
              <div className="h-48 rounded-xl border border-dashed border-neutral-800 flex flex-col items-center justify-center text-center p-4 text-neutral-600">
                <ChefHat className="w-8 h-8 stroke-1 text-neutral-700 mb-1" />
                <p className="text-xs font-bold">No new orders waiting.</p>
                <p className="text-[11px] text-neutral-600">Kitchen grill is clear.</p>
              </div>
            ) : (
              filteredPending.map((order) => (
                <KDSOrderCard
                  key={order.id}
                  order={order}
                  checkedItems={checkedItems}
                  onToggleItemCheck={handleToggleItemCheck}
                  onBumpOrder={bumpOrder} isBumping={!!bumpingIds[order.id]}
                />
              ))
            )}
          </div>
        </section>

        {/* Column 2: On The Grill (Preparing) */}
        <section
          aria-label="On The Grill"
          className="flex flex-col rounded-2xl bg-[#090909] border border-neutral-800/80 overflow-hidden"
        >
          <div className="p-3 bg-neutral-900/90 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF6600]" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                On The Grill (Cooking)
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-orange-950 border border-orange-500/40 text-orange-400 font-mono text-xs font-black">
              {filteredPreparing.length}
            </span>
          </div>

          <div className="flex-1 p-3 space-y-3.5 overflow-y-auto">
            {filteredPreparing.length === 0 ? (
              <div className="h-48 rounded-xl border border-dashed border-neutral-800 flex flex-col items-center justify-center text-center p-4 text-neutral-600">
                <Flame className="w-8 h-8 stroke-1 text-neutral-700 mb-1" />
                <p className="text-xs font-bold">No burgers on the grill.</p>
                <p className="text-[11px] text-neutral-600">Accept orders to start cooking.</p>
              </div>
            ) : (
              filteredPreparing.map((order) => (
                <KDSOrderCard
                  key={order.id}
                  order={order}
                  checkedItems={checkedItems}
                  onToggleItemCheck={handleToggleItemCheck}
                  onBumpOrder={bumpOrder} isBumping={!!bumpingIds[order.id]}
                />
              ))
            )}
          </div>
        </section>

        {/* Column 3: Ready / Packing */}
        <section
          aria-label="Ready at Counter"
          className="flex flex-col rounded-2xl bg-[#090909] border border-neutral-800/80 overflow-hidden"
        >
          <div className="p-3 bg-neutral-900/90 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                Ready at Counter (Packing)
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-blue-950 border border-blue-500/40 text-blue-400 font-mono text-xs font-black">
              {filteredReady.length}
            </span>
          </div>

          <div className="flex-1 p-3 space-y-3.5 overflow-y-auto">
            {filteredReady.length === 0 ? (
              <div className="h-48 rounded-xl border border-dashed border-neutral-800 flex flex-col items-center justify-center text-center p-4 text-neutral-600">
                <CheckCircle2 className="w-8 h-8 stroke-1 text-neutral-700 mb-1" />
                <p className="text-xs font-bold">No orders waiting for handover.</p>
                <p className="text-[11px] text-neutral-600">All prepared orders dispatched.</p>
              </div>
            ) : (
              filteredReady.map((order) => (
                <KDSOrderCard
                  key={order.id}
                  order={order}
                  checkedItems={checkedItems}
                  onToggleItemCheck={handleToggleItemCheck}
                  onBumpOrder={bumpOrder} isBumping={!!bumpingIds[order.id]}
                />
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default KDSPage;

