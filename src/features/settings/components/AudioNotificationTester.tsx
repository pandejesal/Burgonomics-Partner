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
  KDS_ALARM_REPEAT_MS,
} from '@/utils/kdsAudio';
import { toast } from 'sonner';

export function AudioNotificationTester() {
  const [volume, setVolume] = useState<number>(85);
  const [isMuted, setIsMuted] = useState<boolean>(isKDSAudioMuted());
  const [isAudioUnlocked, setIsAudioUnlocked] = useState<boolean>(isKDSAudioUnlocked());
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
      // Reflect the REAL unlock result, never a hardcoded success.
      unlockKDSAudio().then((ok) => setIsAudioUnlocked(ok));
    }
  };

  const handleTestChime = async () => {
    setIsPlayingTest(true);
    const unlocked = await unlockKDSAudio();
    setIsAudioUnlocked(unlocked);

    // Report the real state: a muted alarm plays nothing (playKDSChime
    // short-circuits on mute) and a failed unlock leaves the context silent,
    // so the toast must never claim a tone that did not play.
    if (isMuted) {
      toast.error('Alarm is muted — nothing played. Unmute to test the chime.');
    } else if (!unlocked) {
      toast.error('Audio could not be unlocked — nothing played. Tap the screen once, then retry.');
    } else {
      playKDSChime();
      toast.success('Played the kitchen alarm test tone (A5 → D6).');
    }

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
        // Local browser notification only — no push service / server delivery
        // is configured, so the copy never claims a background push was sent.
        new Notification('Burgonomics Kitchen POS', {
          body: '🔔 Test browser notification delivered. Kitchen alarms sound only while this app is open.',
          icon: '/favicon.ico',
        });
        toast.success('Permission granted — test browser notification sent.');
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
              <span>Acoustic Chime & Browser Notification Test</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400 font-mono font-bold">
                High Priority Alert
              </span>
            </h2>
            <p className="text-xs text-neutral-400">
              Preview the kitchen chime, set the local mute, and manage browser notification permission
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
            Notifications: {notificationPermission.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Acoustic Volume Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase text-neutral-400">
              Preview Volume
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

          <p className="text-[10px] text-neutral-500">
            Visual reference only — this slider does not change the alarm volume or the
            system volume (use your device volume).
          </p>

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

            <p className="text-[11px] font-semibold text-neutral-300 text-right">
              {`Pending-order alarm repeats every ${KDS_ALARM_REPEAT_MS / 1000}s until acknowledged.`}
            </p>
          </div>
        </div>

        {/* Browser Notifications */}
        <div className="space-y-3 p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-white font-bold text-xs mb-1">
              <Bell className="w-4 h-4 text-[#FF6600]" />
              <span>Browser Notifications</span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Uses the browser Notification API only — no push service is configured, so
              alerts display while this app stays open in a tab.
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
                ? 'Send Test Browser Notification'
                : 'Enable Browser Notifications'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default AudioNotificationTester;
