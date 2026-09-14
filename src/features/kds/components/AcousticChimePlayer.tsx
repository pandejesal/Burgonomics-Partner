import React from 'react';
import { Volume2, VolumeX, BellRing, Sparkles } from 'lucide-react';
import { playKDSChime } from '@/utils/kdsAudio';

interface AcousticChimePlayerProps {
  isMuted: boolean;
  audioUnlocked: boolean;
  onToggleMute: () => void;
  onUnlockAudio: () => void;
  className?: string;
}

export function AcousticChimePlayer({
  isMuted,
  audioUnlocked,
  onToggleMute,
  onUnlockAudio,
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
        <button
          type="button"
          onClick={handleTestChime}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 text-xs font-bold transition-colors cursor-pointer"
          title="Test KDS Alarm Chime"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>Test Chime</span>
        </button>
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
