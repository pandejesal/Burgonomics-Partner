import React from 'react';
import { BellRing, VolumeX } from 'lucide-react';

interface KDSAudioUnlockModalProps {
  open: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}

/**
 * One-time onboarding modal explaining why audio must be unlocked.
 * Persist the dismissal in localStorage so it never repeats.
 */
export function KDSAudioUnlockModal({ open, onEnable, onDismiss }: KDSAudioUnlockModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kds-audio-title"
        className="max-w-md w-full rounded-2xl border border-neutral-700 bg-[#0A0A0A] p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <span className="shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-500/50">
            <BellRing className="h-6 w-6 text-amber-400" />
          </span>
          <div>
            <h2 id="kds-audio-title" className="text-lg font-black text-white tracking-tight">
              Enable Kitchen Audio Alarms
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              Browsers block sound until you tap once. Enable audio so new KOTs and the
              repeating alarm can alert the kitchen — the alarm always follows the live
              order stream.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onEnable}
            className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 px-4 text-sm font-black text-black hover:bg-amber-400 transition-colors cursor-pointer"
          >
            <BellRing className="h-4 w-4" />
            Enable Audio Alarm
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex items-center justify-center gap-2 rounded-xl border border-neutral-700 py-3 px-4 text-sm font-bold text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <VolumeX className="h-4 w-4" />
            Not now — keep silent
          </button>
        </div>
      </div>
    </div>
  );
}

export default KDSAudioUnlockModal;
