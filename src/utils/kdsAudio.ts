/**
 * Burgonomics KDS Web Audio API Synthesizer & Alarm Manager
 * Generates pleasant multi-tone QSR chimes without external audio assets.
 */

let audioCtx: AudioContext | null = null;
let repeatIntervalId: ReturnType<typeof setInterval> | null = null;
let isAudioUnlocked = false;

/**
 * Initialize or get active AudioContext
 */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

/**
 * Unlocks AudioContext upon user gesture (click/touch)
 */
export async function unlockKDSAudio(): Promise<boolean> {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }
    isAudioUnlocked = true;
    return true;
  } catch (err) {
    console.warn('[KDSAudio] Failed to unlock audio context:', err);
    return false;
  }
}

export function isKDSAudioUnlocked(): boolean {
  const ctx = getAudioContext();
  return !!(isAudioUnlocked && ctx && ctx.state === 'running');
}

/**
 * Mute state helpers
 */
const MUTE_STORAGE_KEY = 'burgonomics_kds_muted';

export function isKDSAudioMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
}

export function setKDSAudioMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MUTE_STORAGE_KEY, muted ? 'true' : 'false');
  if (muted) {
    stopRepeatingKDSAlarm();
  }
}

/**
 * Synthesize a 3-tone QSR Kitchen Bell Chime
 * Notes: E5 (659Hz) -> G#5 (830Hz) -> B5 (987Hz) with warm harmonics
 */
export function playKDSChime(): void {
  if (isKDSAudioMuted()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    // Intentionally ignored: autoplay policy blocks resume until the first
    // staff tap; the next chime attempt retries. Logged for diagnostics.
    ctx.resume().catch((e) => console.debug('[KDSAudio] resume blocked until user gesture:', e?.message));
  }

  const now = ctx.currentTime;
  const notes = [
    { freq: 659.25, time: 0.00, duration: 0.35, gain: 0.28 }, // E5
    { freq: 830.61, time: 0.12, duration: 0.40, gain: 0.32 }, // G#5
    { freq: 987.77, time: 0.26, duration: 0.65, gain: 0.38 }, // B5
  ];

  notes.forEach(({ freq, time, duration, gain }) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    // Warm sine + subtle triangle blend
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + time);

    // ADSR envelope: Fast attack, natural exponential ring decay
    gainNode.gain.setValueAtTime(0.001, now + time);
    gainNode.gain.linearRampToValueAtTime(gain, now + time + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + time + duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now + time);
    osc.stop(now + time + duration);
  });
}

/**
 * Start or stop repeating alarm (every 15s) when pending orders exist — with native haptics for Kitchen urgency
 */
export function syncKDSAlarmState(pendingCount: number): void {
  if (isKDSAudioMuted() || pendingCount <= 0) {
    stopRepeatingKDSAlarm();
    return;
  }

  // If not already looping, play immediately and start interval
  if (!repeatIntervalId) {
    playKDSChime();
    void triggerKDSHaptic();
    repeatIntervalId = setInterval(() => {
      if (!isKDSAudioMuted()) {
        playKDSChime();
        void triggerKDSHaptic();
      }
    }, 15000); // 15 seconds repeat
  }
}

async function triggerKDSHaptic(): Promise<void> {
  // Try Capacitor Haptics first (native), fallback to Web Vibration
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([30, 80, 30]);
    } catch { /* ignore */ }
  }
}

export function stopRepeatingKDSAlarm(): void {
  if (repeatIntervalId) {
    clearInterval(repeatIntervalId);
    repeatIntervalId = null;
  }
}
