import React, { useState, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Bell,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  playKDSChime,
  unlockKDSAudio,
  isKDSAudioUnlocked,
  isKDSAudioMuted,
  setKDSAudioMuted,
} from '@/utils/kdsAudio';
import { toast } from 'sonner';

export function AudioNotificationTester() {
  const [volume, setVolume] = useState<number>(85);
  const [isMuted, setIsMuted] = useState<boolean>(isKDSAudioMuted());
  const [isAudioUnlocked, setIsAudioUnlocked] = useState<boolean>(isKDSAudioUnlocked());
  const [repeatAlarm, setRepeatAlarm] = useState<boolean>(true);
  const [isPlayingTest, setIsPlayingTest] = useState<boolean>(false);

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'default'
  );

  const handleToggleMute = (muted: boolean) => {
    setIsMuted(muted);
    setKDSAudioMuted(muted);
    if (!muted) {
      unlockKDSAudio().then(() => setIsAudioUnlocked(true));
    }
  };

  const handleTestChime = async () => {
    setIsPlayingTest(true);
    await unlockKDSAudio();
    setIsAudioUnlocked(true);
    playKDSChime();

    toast.success('Played kitchen acoustic alarm test tone (E5-G#5-B5)!');
    setTimeout(() => {
      setIsPlayingTest(false);
    }, 1200);
  };

  const handleRequestPushPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Browser does not support desktop notifications');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === 'granted') {
        new Notification('Burgonomics Kitchen POS', {
          body: '🔔 Push notification channel verified! New order alarms are active.',
          icon: '/favicon.ico',
        });
        toast.success('Notification permission granted & test push sent!');
      } else {
        toast.error('Notification permission was not granted.');
      }
    } catch (err) {
      console.warn('Error requesting notification permission:', err);
      toast.error('Failed to request notification permission');
    }
  };

  return (
    <div className="p-6 rounded-3xl bg-[#0E4825]/10 border border-emerald-500/30 space-y-6 text-white">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-[#0E4825] border border-emerald-500/40 text-emerald-300">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight text-white flex items-center gap-2">
              <span>Acoustic Chime & Push Notification Alarm</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400 font-mono font-bold">
                High Priority Alert
              </span>
            </h2>
            <p className="text-xs text-neutral-400">
              Configure speaker volume, Web Audio API synthesis, and browser push notification permissions
            </p>
          </div>
        </div>

        {/* Permission Status Badges */}
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
              isAudioUnlocked
                ? 'bg-emerald-950 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-950 border-amber-500/40 text-amber-300'
            }`}
          >
            Audio: {isAudioUnlocked ? 'UNLOCKED ✓' : 'LOCKED'}
          </span>

          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
              notificationPermission === 'granted'
                ? 'bg-emerald-950 border-emerald-500/40 text-emerald-300'
                : 'bg-neutral-900 border-neutral-700 text-neutral-400'
            }`}
          >
            Push: {notificationPermission.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Acoustic Volume Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase text-neutral-400">
              Kitchen Buzzer Volume
            </label>
            <span className="font-mono font-bold text-xs text-[#4ADE80]">{isMuted ? 'Muted' : `${volume}%`}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleToggleMute(!isMuted)}
              className="p-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-300 hover:text-white cursor-pointer"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>

            <input
              type="range"
              min="0"
              max="100"
              value={isMuted ? 0 : volume}
              disabled={isMuted}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 accent-[#FF6600] h-2 bg-neutral-800 rounded-lg cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              disabled={isPlayingTest}
              onClick={handleTestChime}
              className="px-3.5 py-2 rounded-xl bg-[#0E4825] hover:bg-[#135d30] text-emerald-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isPlayingTest ? 'Playing Chime...' : 'Test Kitchen Chime'}</span>
            </button>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-300">
              <input
                type="checkbox"
                checked={repeatAlarm}
                onChange={(e) => setRepeatAlarm(e.target.checked)}
                className="rounded border-neutral-700 text-[#0E4825] focus:ring-0 cursor-pointer"
              />
              <span className="font-semibold text-xs">Repeat every 15s until acknowledged</span>
            </label>
          </div>
        </div>

        {/* Browser Push Permission & FCM Tester */}
        <div className="space-y-3 p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-white font-bold text-xs mb-1">
              <Bell className="w-4 h-4 text-[#FF6600]" />
              <span>Browser Push & Background Wakeup</span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Enables background KOT chime alerts and dispatch status notifications even when the POS tab is minimized.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRequestPushPermission}
            className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs flex items-center justify-center gap-2 border border-neutral-700 transition-colors cursor-pointer"
          >
            <Bell className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {notificationPermission === 'granted'
                ? 'Send Test Push Alert'
                : 'Request Permission & Test FCM'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default AudioNotificationTester;
