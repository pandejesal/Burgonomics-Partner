import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { syncPetpoojaMenuForBranch } from '@/services/petpoojaSync';

interface PetpoojaStatusBadgeProps {
  branchId?: string;
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
  branchId = 'branch_surat_01',
  onSyncComplete,
}) => {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Not checked');
  const [status, setStatus] = useState<PetpoojaBadgeStatus>('unknown');

  // Loop 58/120: no timer pulse — the old 60s interval rewrote the
  // "last sync" timestamp to now() without syncing, so an unverified or
  // long-stale link always looked freshly checked. The timestamp now only
  // updates on real sync outcomes below.
  const handleManualSync = async () => {
    try {
      setSyncing(true);
      setStatus('syncing');
      await syncPetpoojaMenuForBranch(branchId);
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

  return (
    <div className="flex items-center space-x-2 bg-surface/80 border border-border px-3 py-1.5 rounded-full text-xs text-white">
      <span className="flex h-2 w-2 relative">
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${petpoojaBadgeMeta(status).dot}`}
        />
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${petpoojaBadgeMeta(status).dot}`}
        />
      </span>

      <span className="font-medium text-zinc-300 hidden sm:inline">Petpooja POS:</span>
      <span
        className="font-semibold uppercase tracking-wider text-[10px] text-zinc-300"
        title={
          status === 'unknown'
            ? 'POS link not verified yet — tap the sync icon to verify'
            : undefined
        }
      >
        {petpoojaBadgeMeta(status).label}
      </span>

      <span className="text-zinc-500 hidden md:inline text-[11px]">({lastSyncTime})</span>

      <button
        onClick={handleManualSync}
        disabled={syncing}
        title="Sync menu & items from Petpooja POS"
        className="ml-1 p-1 hover:bg-[#1C3D21] rounded-full text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-accent-light' : ''}`} />
      </button>
    </div>
  );
};
