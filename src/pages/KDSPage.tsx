import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import {
  AcousticChimePlayer,
  KDSAudioUnlockModal,
  KDSOrderCard,
  KDSQuick86Drawer,
  KOTTimerBadge,
  useKDSRealtimeStream,
} from '@/features/kds';
import {
  isKDSAudioMuted,
  setKDSAudioMuted,
  unlockKDSAudio,
  isKDSAudioUnlocked,
} from '@/utils/kdsAudio';
import {
  deriveKdsColumnState,
  formatKdsDataAge,
  type KdsColumnState,
} from '@/features/kds';
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
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  WifiOff,
  Store,
  Ban,
} from 'lucide-react';
import type { Order, OrderType, OrderStatus } from '@/types';

export function KDSPage() {
  const { user } = useAuthStore();
  const { selectedBranchId, setSelectedBranchId } = useAppStore();

  const {
    isOnline,
    isLoading,
    streamError,
    streamStatus,
    dataVerified,
    activeOrders,
    pendingOrders,
    preparingOrders,
    readyOrders,
    bumpOrder,
    bumpingIds,
    recallLastOrder,
    canRecall,
    lastBumpedOrder,
    refresh,
    lastRefreshAt,
  } = useKDSRealtimeStream();
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 15000);
    return () => window.clearInterval(t);
  }, []);
  void nowTick;

  // Feed honesty: a failed listener must never read as "Makeline Live", and
  // the data-age chip must say the numbers on screen are the LAST GOOD read
  // whenever the live stream is not delivering.
  const liveUnavailable = streamStatus === 'live_unavailable';
  const streamLive = streamStatus === 'live';
  const freshnessLabel = formatKdsDataAge(Date.now(), lastRefreshAt, streamLive);

  // Channel filter: 'all' | 'delivery' | 'takeaway' | 'dinein'
  const [channelFilter, setChannelFilter] = useState<OrderType | 'all'>('all');

  // MT-12: 1-tap 86 quick-toggle drawer visibility
  const [is86DrawerOpen, setIs86DrawerOpen] = useState(false);

  // Item bump checklist state: key = `${orderId}_${itemIndex}`.
  // Persisted per order in this device's localStorage so a refresh or a
  // second device doesn't silently reset progress. Shape-validated on read;
  // corrupt entries are discarded, never trusted.
  const CHECKLIST_KEY = 'kds-checklist:v1';
  const readPersistedChecklist = (): Record<string, boolean> => {
    try {
      const raw = window.localStorage.getItem(CHECKLIST_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        window.localStorage.removeItem(CHECKLIST_KEY);
        return {};
      }
      const clean: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'boolean') clean[k] = v;
      }
      return clean;
    } catch {
      try {
        window.localStorage.removeItem(CHECKLIST_KEY);
      } catch {
        /* storage unavailable — ephemeral state only */
      }
      return {};
    }
  };
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(readPersistedChecklist);

  // Audio mute & unlock state
  const [isMuted, setIsMuted] = useState<boolean>(isKDSAudioMuted());
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(isKDSAudioUnlocked());

  // One-time unlock-audio onboarding. Dismissal is persisted so the modal
  // never nags on every visit; the amber toolbar button stays as the manual
  // path. Shape-validated read; corrupt values just re-show the modal.
  const AUDIO_INTRO_KEY = 'kds-audio-intro-seen:v1';
  const readAudioIntroDismissed = (): boolean => {
    try {
      return window.localStorage.getItem(AUDIO_INTRO_KEY) === 'true';
    } catch {
      return false;
    }
  };
  const [audioIntroDismissed, setAudioIntroDismissed] = useState<boolean>(readAudioIntroDismissed);
  const dismissAudioIntro = () => {
    setAudioIntroDismissed(true);
    try {
      window.localStorage.setItem(AUDIO_INTRO_KEY, 'true');
    } catch {
      /* storage unavailable — ephemeral dismissal only */
    }
  };

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

  const handleUnlockAudio = async (): Promise<boolean> => {
    const unlocked = await unlockKDSAudio();
    if (unlocked) {
      setAudioUnlocked(true);
    }
    return unlocked;
  };

  const handleEnableAudioFromIntro = async () => {
    const unlocked = await handleUnlockAudio();
    if (unlocked) dismissAudioIntro();
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    setKDSAudioMuted(nextMuted);
    if (!nextMuted) {
      handleUnlockAudio();
    }
  };

  const CHECKLIST_SEP = '::';
  const handleToggleItemCheck = (orderId: string, itemIdx: number) => {
    const key = `${orderId}${CHECKLIST_SEP}${itemIdx}`;
    setCheckedItems((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — ephemeral state only */
      }
      return next;
    });
  };

  // Drop checklist entries for orders that left the makeline so the stored
  // map doesn't grow without bound. Runs on settled data only. Keyed on the
  // sorted live id-join (NOT length): a swap that keeps the same depth used
  // to skip pruning and leak stale keys forever. Separator '::' survives
  // order ids containing '_' (the old lastIndexOf('_') split mis-attributed
  // them).
  const liveOrderIdsKey = activeOrders.map((o: Order) => o.id).sort().join('|');
  useEffect(() => {
    if (isLoading || streamError) return;
    const live = new Set(activeOrders.map((o: Order) => o.id));
    setCheckedItems((prev) => {
      const keys = Object.keys(prev).filter((k) => {
        const orderId = k.split(CHECKLIST_SEP).slice(0, -1).join(CHECKLIST_SEP);
        return live.has(orderId);
      });
      if (keys.length === Object.keys(prev).length) return prev;
      const next: Record<string, boolean> = {};
      for (const k of keys) next[k] = prev[k];
      try {
        window.localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — ephemeral state only */
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, streamError, liveOrderIdsKey]);

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

  // One decision function per column. `error` only renders when NO verified
  // data exists at all (dead listener AND unusable one-shot fallback) — a
  // listener that died after data was verified keeps its last good orders on
  // screen under the degraded banner, instead of blanking the makeline.
  const columnState = (items: Order[]): KdsColumnState =>
    deriveKdsColumnState({ isLoading, dataVerified, itemCount: items.length });
  const pendingColumn = columnState(filteredPending);
  const preparingColumn = columnState(filteredPreparing);
  const readyColumn = columnState(filteredReady);

  // Shared column bodies: loading / degraded error (with Retry) / honest
  // empty / live cards. Keeping one implementation per state is what makes
  // every column behave identically under the same failure.
  const renderColumnBody = (
    state: KdsColumnState,
    orders: Order[],
    emptyState: React.ReactNode,
    loadingLabel: string
  ) => {
    if (state === 'loading') {
      return (
        <div className="h-48 rounded-xl border border-neutral-800 flex flex-col items-center justify-center text-center p-4 text-neutral-400" aria-busy="true" aria-label={loadingLabel}>
          <RefreshCw className="w-8 h-8 stroke-1 text-neutral-500 mb-1 animate-spin" aria-hidden="true" />
          <p className="text-xs font-bold">Loading…</p>
        </div>
      );
    }
    if (state === 'error') {
      return (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/20 flex flex-col items-center justify-center text-center p-4 text-rose-200">
          <AlertTriangle className="w-8 h-8 stroke-1 mb-1" aria-hidden="true" />
          <p className="text-xs font-bold">Order stream failed</p>
          <p className="text-xs opacity-80">{(streamError as Error)?.message || 'Check connection and retry.'}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-2 min-h-11 inline-flex items-center px-3 py-1.5 rounded-lg bg-rose-900 text-white text-xs font-bold cursor-pointer"
          >
            Retry
          </button>
        </div>
      );
    }
    if (state === 'empty') {
      return emptyState;
    }
    return orders.map((order) => (
      <KDSOrderCard
        key={order.id}
        order={order}
        checkedItems={checkedItems}
        onToggleItemCheck={handleToggleItemCheck}
        onBumpOrder={bumpOrder} isBumping={!!bumpingIds[order.id]}
      />
    ));
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans select-none">
      {/* Offline Loss Alert Banner */}
      {!isOnline && (
        <div
          role="alert"
          className="bg-red-600 text-white px-4 py-2.5 pt-[calc(env(safe-area-inset-top,0px)_+_0.625rem)] flex items-center justify-center gap-2 font-black text-sm uppercase tracking-wider animate-pulse shadow-md z-50"
        >
          <WifiOff className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
          <span>⚠️ KITCHEN OFFLINE - CHECK INTERNET & RECONNECTING WEBSOCKET...</span>
        </div>
      )}

      {/* One-time audio-unlock onboarding (dismissible, persisted) */}
      {!isMuted && !audioUnlocked && !audioIntroDismissed && (
        <KDSAudioUnlockModal
          open
          onEnable={() => void handleEnableAudioFromIntro()}
          onDismiss={dismissAudioIntro}
        />
      )}

      {/* Live-stream degradation banner. Announced politely (role=status),
          never claimed live while the listener is dead. The data-age chip in
          the header carries the staleness number so this banner's text stays
          static and does not re-announce on every tick. */}
      {liveUnavailable && (
        <div
          role="status"
          className="bg-amber-950/60 border-b border-amber-500/40 text-amber-200 px-4 py-2.5 pt-[calc(env(safe-area-inset-top,0px)_+_0.625rem)] flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs font-bold"
        >
          <AlertTriangle className="w-4 h-4 stroke-[2.5] text-amber-400 shrink-0" aria-hidden="true" />
          <span>
            {dataVerified
              ? 'Live makeline stream unavailable — showing last good data. New tickets will not appear until the stream recovers.'
              : 'Live makeline stream unavailable and no order data could be read.'}
          </span>
          <button
            type="button"
            onClick={refresh}
            className="min-h-11 inline-flex items-center px-3 py-1.5 rounded-lg bg-amber-900/80 border border-amber-500/50 text-amber-100 font-bold cursor-pointer hover:bg-amber-900 transition-colors"
          >
            Retry live stream
          </button>
        </div>
      )}

      {/* Top Operations Toolbar. On a notched/punch-hole phone the WebView
          starts at y=0, so the toolbar keeps the OS inset ABOVE the existing
          12px rhythm instead of sitting under the status bar (verified at
          360 CSS px: header top0/paddingTop12 in DEVICE_CHECKS.md). */}
      <header
        className="px-4 py-3 bg-[#0A0A0A] border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-40"
        style={{ paddingTop: 'calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 0.75rem)' }}
      >
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
          <Link
            to="/dashboard"
            aria-label="Exit KDS to Dashboard"
            className="min-h-11 min-w-11 flex items-center justify-center p-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            title="Exit KDS to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </Link>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            {/* Status dot mirrors the badge (never colour alone — the badge
                text carries the same state). */}
            <span
              aria-hidden="true"
              className={`w-3 h-3 rounded-full shrink-0 ${
                liveUnavailable
                  ? 'bg-amber-500'
                  : streamLive
                    ? 'bg-emerald-500 animate-ping'
                    : 'bg-neutral-600'
              }`}
            />
            <h1 className="text-base sm:text-xl font-black tracking-tight text-white flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              <span className="whitespace-nowrap">Burgonomics KDS</span>
              {liveUnavailable ? (
                <span
                  role="status"
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-950 border border-amber-500/40 text-amber-300 font-bold whitespace-nowrap"
                  title="The live order stream is not delivering. Data on screen is the last good read."
                >
                  <AlertTriangle className="w-3 h-3 stroke-[2.5]" aria-hidden="true" />
                  Live Unavailable
                </span>
              ) : streamStatus === 'connecting' ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-400 font-bold whitespace-nowrap">
                  Connecting…
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#0E4825] border border-emerald-500/40 text-emerald-300 font-bold whitespace-nowrap">
                  Makeline Live
                </span>
              )}
            </h1>
            {/* Data-age chip. 11px/neutral-400 (was 10px/neutral-500 ≈ 4.2:1
                on the #0A0A0A toolbar, under the 4.5:1 text floor). */}
            <span
              className="text-[11px] font-mono text-neutral-400 whitespace-nowrap"
              title={
                streamLive
                  ? 'Age of the last data received from the live order stream'
                  : 'Age of the last good data — the live stream is unavailable, so this read may be stale'
              }
            >
              {freshnessLabel}
            </span>
            <button
              type="button"
              onClick={refresh}
              aria-label="Refresh order stream now"
              className="min-h-11 min-w-11 flex items-center justify-center p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Center: Fulfillment Channel Filters. Device-measured 28px tall at
            360 CSS px (below the 44px touch aim) — same visual weight, taller
            hit area, single scrolling row so the toolbar keeps its height. */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-neutral-900 border border-neutral-800 overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setChannelFilter('all')}
            aria-pressed={channelFilter === 'all'}
            className={`min-h-11 shrink-0 inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
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
            aria-pressed={channelFilter === 'delivery'}
            className={`min-h-11 shrink-0 inline-flex items-center gap-1 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              channelFilter === 'delivery'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Bike className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Delivery</span>
          </button>

          <button
            type="button"
            onClick={() => setChannelFilter('takeaway')}
            aria-pressed={channelFilter === 'takeaway'}
            className={`min-h-11 shrink-0 inline-flex items-center gap-1 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              channelFilter === 'takeaway'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Takeaway</span>
          </button>

          <button
            type="button"
            onClick={() => setChannelFilter('dinein')}
            aria-pressed={channelFilter === 'dinein'}
            className={`min-h-11 shrink-0 inline-flex items-center gap-1 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              channelFilter === 'dinein'
                ? 'bg-cyan-700 text-white shadow-xs'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Dine-In</span>
          </button>
        </div>

        {/* Right Actions: Recall Last KOT, Audio Chime Player, Fullscreen */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Recall Last Bumped Order Button — hidden while loading or on
              stream error so a dead backend never offers a fake undo. */}
          {canRecall && !isLoading && !streamError && (
            <button
              type="button"
              onClick={() => void recallLastOrder()}
              aria-label={`Recall order #${lastBumpedOrder?.id.slice(0, 6) || ''} back to Makeline`}
              className="min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer animate-bounce whitespace-nowrap"
              title={`Recall #${lastBumpedOrder?.id.slice(0, 6) || ''} back to Makeline`}
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Recall Last KOT</span>
            </button>
          )}

          {/* Acoustic Audio Chime Controller */}
          <AcousticChimePlayer
            isMuted={isMuted}
            audioUnlocked={audioUnlocked}
            onToggleMute={toggleMute}
            onUnlockAudio={handleUnlockAudio}
          />

          <button
            type="button"
            onClick={() => setIs86DrawerOpen(true)}
            aria-label="Open 86 and stock quick toggle"
            className="min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 hover:bg-rose-900/50 font-bold text-xs transition-colors cursor-pointer whitespace-nowrap"
            title="1-Tap 86 Quick Toggle"
          >
            <Ban className="w-3.5 h-3.5" aria-hidden="true" />
            <span>86 / Stock</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit Kitchen Fullscreen' : 'Enter Kitchen Fullscreen'}
            className="min-h-11 min-w-11 flex items-center justify-center p-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Kitchen Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="w-4 h-4" aria-hidden="true" />
            )}
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
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                New KOTs (To Start)
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400 font-mono text-xs font-black">
              {filteredPending.length}
            </span>
          </div>

          <div className="flex-1 p-3 space-y-3.5 overflow-y-auto">
            {renderColumnBody(
              pendingColumn,
              filteredPending,
              <div className="h-48 rounded-xl border border-dashed border-neutral-800 flex flex-col items-center justify-center text-center p-4 text-neutral-300">
                <ChefHat className="w-8 h-8 stroke-1 text-neutral-500 mb-1" aria-hidden="true" />
                <p className="text-xs font-bold">No new orders waiting.</p>
                <p className="text-xs text-neutral-400">Kitchen grill is clear.</p>
              </div>,
              'Loading new KOTs'
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
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF6600]" aria-hidden="true" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                On The Grill (Cooking)
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-orange-950 border border-orange-500/40 text-orange-400 font-mono text-xs font-black">
              {filteredPreparing.length}
            </span>
          </div>

          <div className="flex-1 p-3 space-y-3.5 overflow-y-auto">
            {renderColumnBody(
              preparingColumn,
              filteredPreparing,
              <div className="h-48 rounded-xl border border-dashed border-neutral-800 flex flex-col items-center justify-center text-center p-4 text-neutral-300">
                <Flame className="w-8 h-8 stroke-1 text-neutral-500 mb-1" aria-hidden="true" />
                <p className="text-xs font-bold">No burgers on the grill.</p>
                <p className="text-xs text-neutral-400">Accept orders to start cooking.</p>
              </div>,
              'Loading grill orders'
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
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" aria-hidden="true" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                Ready at Counter (Packing)
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-blue-950 border border-blue-500/40 text-blue-400 font-mono text-xs font-black">
              {filteredReady.length}
            </span>
          </div>

          <div className="flex-1 p-3 space-y-3.5 overflow-y-auto">
            {renderColumnBody(
              readyColumn,
              filteredReady,
              <div className="h-48 rounded-xl border border-dashed border-neutral-800 flex flex-col items-center justify-center text-center p-4 text-neutral-300">
                <CheckCircle2 className="w-8 h-8 stroke-1 text-neutral-500 mb-1" aria-hidden="true" />
                <p className="text-xs font-bold">No orders waiting for handover.</p>
                <p className="text-xs text-neutral-400">All prepared orders dispatched.</p>
              </div>,
              'Loading ready orders'
            )}
          </div>
        </section>
      </main>

      <KDSQuick86Drawer isOpen={is86DrawerOpen} onClose={() => setIs86DrawerOpen(false)} />
    </div>
  );
}

export default KDSPage;

