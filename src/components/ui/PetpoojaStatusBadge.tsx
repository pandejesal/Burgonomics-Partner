import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { syncPetpoojaMenuForBranch } from '@/services/petpoojaSync';

interface PetpoojaStatusBadgeProps {
  branchId?: string;
  onSyncComplete?: () => void;
}

export const PetpoojaStatusBadge: React.FC<PetpoojaStatusBadgeProps> = ({
  branchId = 'branch_surat_01',
  onSyncComplete,
}) => {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Just now');
  const [status, setStatus] = useState<'online' | 'syncing' | 'error'>('online');

  useEffect(() => {
    const timer = setInterval(() => {
      // Simulate live timestamp pulse
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

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
    <div className="flex items-center space-x-2 bg-[#132A17]/80 border border-[#234B2A] px-3 py-1.5 rounded-full text-xs text-white">
      <span className="flex h-2 w-2 relative">
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
            status === 'online'
              ? 'bg-emerald-400'
              : status === 'syncing'
              ? 'bg-amber-400'
              : 'bg-rose-400'
          }`}
        />
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            status === 'online'
              ? 'bg-emerald-500'
              : status === 'syncing'
              ? 'bg-amber-500'
              : 'bg-rose-500'
          }`}
        />
      </span>

      <span className="font-medium text-zinc-300 hidden sm:inline">Petpooja POS:</span>
      <span className="text-emerald-400 font-semibold uppercase tracking-wider text-[10px]">
        {status === 'online' ? 'Live' : status === 'syncing' ? 'Syncing' : 'Fallback'}
      </span>

      <span className="text-zinc-500 hidden md:inline text-[11px]">({lastSyncTime})</span>

      <button
        onClick={handleManualSync}
        disabled={syncing}
        title="Sync menu & items from Petpooja POS"
        className="ml-1 p-1 hover:bg-[#1C3D21] rounded-full text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-[#D95D0F]' : ''}`} />
      </button>
    </div>
  );
};
