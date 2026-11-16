import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { isManualMenuSyncCurrent, useGuardedManualMenuSync } from '@/hooks/useMenu';
import { useAuthStore } from '@/stores/authStore';
import { canSyncPetpoojaMenu, MENU_SYNC_DENIED_COPY } from '@/services/petpoojaMenuSyncRoles';

interface PetpoojaStatusBadgeProps {
  branchId: string;
  onSyncComplete?: () => void;
}

export type PetpoojaBadgeStatus = 'online' | 'syncing' | 'error' | 'unknown';

// Loop 58/120: pure status→label/color map. The badge used to mount as
// 'online'/'Live' with a 'Just now' timestamp it never measured — every
// header render asserted a live POS link with zero verification. It now
// mounts 'unknown' until a real sync succeeds or fails.
export function petpoojaBadgeMeta(status: PetpoojaBadgeStatus): {
  label: string;
  dot: string;
} {
  switch (status) {
    case 'online':
      return { label: 'Live', dot: 'bg-emerald-500' };
    case 'syncing':
      return { label: 'Syncing', dot: 'bg-amber-500' };
    case 'error':
      return { label: 'Fallback', dot: 'bg-rose-500' };
    case 'unknown':
    default:
      return { label: 'Unknown', dot: 'bg-zinc-500' };
  }
}

export const PetpoojaStatusBadge: React.FC<PetpoojaStatusBadgeProps> = ({
  branchId,
  onSyncComplete,
}) => {
  const { user } = useAuthStore();
  const syncPetpooja = useGuardedManualMenuSync(branchId);
  // The server refuses POST /petpooja/syncMenu for anything outside
  // brand_owner/developer/regional_manager/branch_owner, so offering the
  // refresh icon to (say) branch_staff only produced a 403 that looked like a
  // POS outage. The gate is mirrored client-side; the server rule is unchanged.
  const maySync = canSyncPetpoojaMenu(user?.role);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Not checked');
  const [status, setStatus] = useState<PetpoojaBadgeStatus>('unknown');

  useEffect(() => {
    setStatus('unknown');
    setLastSyncTime('Not checked');
  }, [branchId, user?.id, user?.role]);

  // Loop 58/120: no timer pulse — the old 60s interval rewrote the
  // "last sync" timestamp to now() without syncing, so an unverified or
  // long-stale link always looked freshly checked. The timestamp now only
  // updates on real sync outcomes below.
  const handleManualSync = async () => {
    try {
      setSyncing(true);
      setStatus('syncing');
      const outcome = await syncPetpooja.mutateAsync();
      if (!isManualMenuSyncCurrent(outcome)) {
        setStatus('unknown');
        return;
      }
      setStatus('online');
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      if (onSyncComplete) onSyncComplete();
    } catch (err) {
      console.error('Petpooja sync failed:', err);
      setStatus('error');
    } finally {
      setSyncing(false);
    }
  };

  const meta = petpoojaBadgeMeta(status);
  // Phone widths used to hide the "Petpooja POS:" identity (`hidden lg:inline`)
  // and leave a bare "UNKNOWN" pill that read exactly like an unknown *role*
  // badge in the same header. The brand now stays visible at every breakpoint,
  // and the chip carries one complete accessible name instead of relying on
  // desktop-only text.
  // Each state gets its own honest clause; only a completed sync may name a
  // clock time, so 'syncing'/'fallback' never borrow one.
  const statusDescription = (() => {
    switch (status) {
      case 'online':
        return `synced at ${lastSyncTime}`;
      case 'syncing':
        return 'sync in progress';
      case 'error':
        return 'last sync attempt failed';
      case 'unknown':
      default:
        return 'not verified yet';
    }
  })();
  const accessibleLabel = `Petpooja POS: ${meta.label} — ${statusDescription}`;
  // Only a role that may sync is told to tap the icon; the refusal path must
  // not point at a control it does not render.
  const statusHint = !maySync
    ? 'POS link not verified yet — a manager can sync the Petpooja catalog'
    : 'POS link not verified yet — tap the sync icon to verify';

  return (
    // Bounded reflow at narrow widths with large root text: `shrink-0` plus
    // `space-x-*` kept the chip on one unbreakable line, so at 320px CSS px
    // with 200% root text it measured 400px inside a ~272px content box and
    // pushed the document to 424px in real Brave. It now wraps and is capped
    // to the row width. Nothing is truncated, hidden, or shrunk: the full
    // identity, the honest state and the 44px target all stay.
    <div
      role="status"
      aria-label={accessibleLabel}
      className="flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 bg-surface/80 border border-border px-2 sm:px-2.5 py-1.5 rounded-full text-xs text-white">
      <span className="flex h-2 w-2 shrink-0 relative">
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${petpoojaBadgeMeta(status).dot}`}
        />
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${petpoojaBadgeMeta(status).dot}`}
        />
      </span>

      <span className="min-w-0 font-medium text-zinc-300">Petpooja POS:</span>
      <span
        className="min-w-0 font-semibold uppercase tracking-wider text-[10px] text-zinc-300"
        title={status === 'unknown' ? statusHint : undefined}
      >
        {meta.label}
      </span>

      <span className="text-zinc-500 hidden xl:inline text-[11px]">({lastSyncTime})</span>

      {maySync ? (
        <button
          type="button"
          onClick={handleManualSync}
          disabled={syncing}
          aria-label="Sync menu and items from Petpooja POS"
          title="Sync menu & items from Petpooja POS"
          className="ml-1 p-1 min-h-11 min-w-11 shrink-0 inline-flex items-center justify-center hover:bg-[#1C3D21] rounded-full text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-accent-light' : ''}`} />
        </button>
      ) : (
        // No dead button and no 403: the role simply may not sync, and the
        // badge says who can.
        <span
          className="ml-1 text-zinc-500 text-[10px] font-medium hidden sm:inline"
          title={MENU_SYNC_DENIED_COPY}
        >
          Manager action
        </span>
      )}
    </div>
  );
};
