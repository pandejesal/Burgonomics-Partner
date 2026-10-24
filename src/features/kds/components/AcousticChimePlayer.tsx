import React from 'react';
import { Volume2, VolumeX, BellRing, Sparkles, BellOff } from 'lucide-react';
import { acknowledgeKDSAlarm, playKDSChime } from '@/utils/kdsAudio';

interface AcousticChimePlayerProps {
  isMuted: boolean;
  audioUnlocked: boolean;
  onToggleMute: () => void;
  onUnlockAudio: () => void;
  /** Optional: live pending-order count. Shows the Acknowledge button when > 0. */
  pendingCount?: number;
  /** Optional: parent callback fired after a staff acknowledge, with the live pending count. */
  onAcknowledge?: (pendingCount: number) => void;
  className?: string;
}

export function AcousticChimePlayer({
  isMuted,
  audioUnlocked,
  onToggleMute,
  onUnlockAudio,
  pendingCount = 0,
  onAcknowledge = acknowledgeKDSAlarm,
  className = '',
}: AcousticChimePlayerProps) {
  const handleTestChime = () => {
    if (!audioUnlocked) {
      onUnlockAudio();
    }
    playKDSChime();
  };

  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      {!audioUnlocked ? (
        <button
          type="button"
          onClick={onUnlockAudio}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-300 hover:bg-amber-500/30 text-xs font-bold transition-colors cursor-pointer animate-pulse"
          title="Click to enable Kitchen Display audio alarms"
        >
          <BellRing className="w-4 h-4 text-amber-400" />
          <span>Click to Enable Audio Alarm</span>
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={handleTestChime}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 text-xs font-bold transition-colors cursor-pointer"
            title="Test KDS Alarm Chime"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Test Chime</span>
          </button>
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => onAcknowledge(pendingCount)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/50 text-amber-300 text-xs font-bold transition-colors cursor-pointer"
              title="Acknowledge alarm — silence until new orders arrive"
            >
              <BellOff className="w-3.5 h-3.5" />
              <span>Acknowledge</span>
            </button>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onToggleMute}
        className={`p-2 rounded-xl border transition-colors cursor-pointer ${
          isMuted
            ? 'bg-red-950/40 border-red-800 text-red-400 hover:bg-red-900/50'
            : 'bg-neutral-800/80 border-neutral-700 text-emerald-400 hover:bg-neutral-700'
        }`}
        title={isMuted ? 'Unmute KDS Audio Alarm' : 'Mute KDS Audio Alarm'}
      >
        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default AcousticChimePlayer;
