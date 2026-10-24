/**
 * Burgonomics KDS Web Audio API Synthesizer & Alarm Manager
 * Generates pleasant multi-tone QSR chimes without external audio assets.
 */

let audioCtx: AudioContext | null = null;
let repeatIntervalId: ReturnType<typeof setInterval> | null = null;
let isAudioUnlocked = false;
let currentPendingCount = 0;
let acknowledgedPendingCount: number | null = null;

/** Repeating alarm interval — pending orders chime every 10 seconds. */
export const KDS_ALARM_REPEAT_MS = 10000;

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
  } else if (currentPendingCount > 0 && !repeatIntervalId) {
    // Re-arm the repeating alarm from the live backend count so an unmute
    // never leaves a silent kitchen with unacknowledged orders.
    syncKDSAlarmState(currentPendingCount);
  }
}

/**
 * Synthesize a two-tone doorbell chime (A5 -> D6)
 * Tone 1: 880.00 Hz (A5), ~0.35s, gain 0.30
 * Tone 2: 1174.66 Hz (D6), starts at +0.18s, ~0.65s, gain 0.35
 * Uses Web Audio API sine oscillator with exponential decay envelope.
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
    { freq: 880.0, time: 0.0, duration: 0.35, gain: 0.3 }, // A5
    { freq: 1174.66, time: 0.18, duration: 0.65, gain: 0.35 }, // D6
  ];

  notes.forEach(({ freq, time, duration, gain }) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    // Sine oscillator with exponential decay envelope
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
 * Start or stop repeating alarm (every 10s) when pending orders exist — with native haptics for Kitchen urgency.
 * A staff acknowledge (see acknowledgeKDSAlarm) silences the loop until the
 * pending count rises above the acknowledged level (i.e. new orders arrive).
 */
export function syncKDSAlarmState(pendingCount: number): void {
  // Keep the latest backend truth so the alarm loop follows Firestore, not a
  // standalone front-end clock.
  currentPendingCount = pendingCount;

  if (pendingCount <= 0) {
    acknowledgedPendingCount = null;
    stopRepeatingKDSAlarm();
    return;
  }

  if (isKDSAudioMuted()) {
    stopRepeatingKDSAlarm();
    return;
  }

  // An acknowledged kitchen stays silent until NEW orders push the count
  // above the acknowledged level.
  if (acknowledgedPendingCount !== null) {
    if (pendingCount <= acknowledgedPendingCount) {
      stopRepeatingKDSAlarm();
      return;
    }
    // New orders arrived — clear the acknowledge and resume alarming.
    acknowledgedPendingCount = null;
  }

  // If not already looping, play immediately and start interval
  if (!repeatIntervalId) {
    playKDSChime();
    void triggerKDSHaptic();
    repeatIntervalId = setInterval(() => {
      // Tick against the live pending count captured at the last sync — the
      // loop self-stops the moment the kitchen clears the makeline.
      if (!isKDSAudioMuted() && currentPendingCount > 0) {
        playKDSChime();
        void triggerKDSHaptic();
      } else {
        stopRepeatingKDSAlarm();
      }
    }, KDS_ALARM_REPEAT_MS); // 10 seconds repeat
  }
}

/**
 * Exactly one immediate cue for a ticket that arrives while syncKDSAlarmState
 * stays silent: either the 10s repeat loop is already sounding (so it plays
 * nothing), or an acknowledge latch suppresses the alarm because the count is
 * at or below the acknowledged level. In both cases without this the next
 * audible cue would be the loop's next tick — or, after an acknowledge, no cue
 * at all until a third ticket arrives. When syncKDSAlarmState does play its own
 * immediate chime (loop starting from rest, or the count rising past the
 * acknowledged level) this is a no-op — playing both was the 0→N double-fire.
 */
export function playKDSArrivalCue(hasNewOrder: boolean, pendingCount: number): void {
  if (!hasNewOrder) return;
  const silencedByAcknowledge =
    acknowledgedPendingCount !== null && pendingCount <= acknowledgedPendingCount;
  if (isKDSAlarmRepeating() || silencedByAcknowledge) {
    playKDSChime();
  }
}

/**
 * Staff acknowledge: stop the repeating alarm until the next pending count
 * increase (i.e. new orders arrive). The caller passes the live pending count
 * it is displaying, so the latch can never drift from the visible makeline
 * (the module's last synced count is stale after a route change or before the
 * first post-mount sync). syncKDSAlarmState() resumes only when pendingCount
 * rises above the acknowledged value.
 */
export function acknowledgeKDSAlarm(pendingCount: number): void {
  acknowledgedPendingCount = pendingCount;
  stopRepeatingKDSAlarm();
}

/** True while the 10s repeating alarm loop is armed. */
export function isKDSAlarmRepeating(): boolean {
  return repeatIntervalId !== null;
}

/** Reset the alarm loop plus the synced count and acknowledge latch for a new scope. */
export function resetKDSAlarmState(): void {
  stopRepeatingKDSAlarm();
  currentPendingCount = 0;
  acknowledgedPendingCount = null;
}

/** Test-only alias kept for existing suites. */
export function __resetKDSAudioStateForTests(): void {
  resetKDSAlarmState();
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
