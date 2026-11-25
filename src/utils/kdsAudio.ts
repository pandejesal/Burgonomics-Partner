/**
 * Burgonomics KDS Web Audio API Synthesizer & Alarm Manager
 * Generates pleasant multi-tone QSR chimes without external audio assets.
 */

let audioCtx: AudioContext | null = null;
let repeatIntervalId: ReturnType<typeof setInterval> | null = null;
let isAudioUnlocked = false;
let currentPendingCount = 0;
let acknowledgedPendingCount: number | null = null;

/**
 * UX audit 2026-11-26 #3: "the chime is scheduled on a SUSPENDED context".
 *
 * A suspended AudioContext's clock does not advance, so tones scheduled into it
 * do not play — but they are not discarded either. When the context is finally
 * resumed every queued tone fires together: a burst of overlapping chimes
 * exactly at the moment the kitchen thought audio came back.
 *
 * The rule enforced below is therefore absolute: NOTHING is ever scheduled
 * unless `ctx.state === 'running'`. A resume is attempted first; while it is in
 * flight every further request coalesces into ONE pending cue (never a queue),
 * and if the resume is refused nothing plays and the board says so.
 */
let resumeInFlight: Promise<boolean> | null = null;
/** One coalesced cue waiting for the in-flight resume to settle. */
let queuedChimeGain: number | null = null;
/** True while the context exists but is not running (sound cannot be honest). */
let audioBlocked = false;
const blockedSubscribers = new Set<(blocked: boolean) => void>();

/** Repeating alarm interval — pending orders chime every 10 seconds. */
export const KDS_ALARM_REPEAT_MS = 10000;

/** Default chime gains (A5 / D6) before any staff volume multiplier. */
const CHIME_GAIN_A5 = 0.3;
const CHIME_GAIN_D6 = 0.35;

/** Clamp a caller-supplied multiplier into the range that is actually audible. */
function clampGainMultiplier(multiplier: number | undefined): number {
  if (multiplier === undefined || !Number.isFinite(multiplier)) return 1;
  // 0 would schedule a silent "success"; keep a floor so a chime that reports
  // itself as played can really be heard.
  return Math.min(2, Math.max(0.05, multiplier));
}

function setAudioBlocked(next: boolean): void {
  if (audioBlocked === next) return;
  audioBlocked = next;
  for (const notify of blockedSubscribers) {
    try {
      notify(next);
    } catch {
      /* a listener throwing must not break the alarm path */
    }
  }
}

/**
 * Subscribe to the honest "audio is blocked" flag. Returns an unsubscribe
 * function. The KDS toolbar uses this so a refused resume turns the button
 * back into the enable prompt instead of leaving a green "unmuted" icon over a
 * silent kitchen.
 */
export function subscribeKDSAudioBlocked(listener: (blocked: boolean) => void): () => void {
  blockedSubscribers.add(listener);
  listener(audioBlocked);
  return () => {
    blockedSubscribers.delete(listener);
  };
}

/** True when the audio context exists but is not running (no sound possible). */
export function isKDSAudioBlocked(): boolean {
  return audioBlocked;
}

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
 * Unlocks AudioContext upon user gesture (click/touch).
 *
 * UX #3: the result is the CONTEXT's real state. A resume the autoplay policy
 * refuses resolves normally but leaves `state === 'suspended'`; reporting
 * `true` there is what made the toolbar advertise sound over a silent kitchen.
 */
export async function unlockKDSAudio(): Promise<boolean> {
  try {
    const ctx = getAudioContext();
    if (!ctx) {
      isAudioUnlocked = false;
      setAudioBlocked(true);
      return false;
    }
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const running = ctx.state === 'running';
    isAudioUnlocked = running;
    // A refused resume also throws away any cue that was waiting on it: the
    // tone was never heard, and replaying it later would be the burst.
    if (!running) queuedChimeGain = null;
    setAudioBlocked(!running);
    return running;
  } catch (err) {
    console.warn('[KDSAudio] Failed to unlock audio context:', err);
    isAudioUnlocked = false;
    queuedChimeGain = null;
    setAudioBlocked(true);
    return false;
  }
}

export function isKDSAudioUnlocked(): boolean {
  const ctx = getAudioContext();
  const running = !!(isAudioUnlocked && ctx && ctx.state === 'running');
  // UX #3: reading the real state also keeps the "blocked" flag honest, so the
  // toolbar never shows a green unmuted icon over a suspended context.
  setAudioBlocked(!running);
  return running;
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
 *
 * UX audit 2026-11-26 #3: a chime is only ever scheduled on a RUNNING context.
 * Scheduling into a suspended one is silent now and a burst later, because a
 * suspended context's clock does not advance. The call resumes first and plays
 * after the resume resolves; repeated calls during that resume coalesce into
 * ONE cue (newest gain wins) instead of stacking.
 *
 * `gainMultiplier` lets the Settings tester honour its volume slider without
 * changing the alarm's own loudness.
 */
export function playKDSChime(gainMultiplier?: number): void {
  if (isKDSAudioMuted()) return;

  const ctx = getAudioContext();
  if (!ctx) {
    setAudioBlocked(true);
    return;
  }

  if (ctx.state === 'running') {
    setAudioBlocked(false);
    scheduleChime(ctx, gainMultiplier);
    return;
  }

  // Not running: remember the newest request only, and try to resume once.
  queuedChimeGain = clampGainMultiplier(gainMultiplier);
  setAudioBlocked(true);

  if (resumeInFlight) {
    // A resume is already in flight; this call's gain replaced the queued one,
    // so the eventual output stays a single cue rather than a pile-up.
    return;
  }

  resumeInFlight = (async () => {
    try {
      await ctx.resume();
    } catch (e) {
      console.debug('[KDSAudio] resume blocked until user gesture:', (e as Error)?.message);
    } finally {
      resumeInFlight = null;
    }
    return ctx.state === 'running';
  })();

  void resumeInFlight.then((running) => {
    const pendingGain = queuedChimeGain;
    queuedChimeGain = null;
    if (!running) {
      // Refused resume: the cue was never heard. Dropping it is the honest
      // outcome — replaying it when audio returns later would be the burst.
      isAudioUnlocked = false;
      setAudioBlocked(true);
      return;
    }
    isAudioUnlocked = true;
    setAudioBlocked(false);
    if (pendingGain !== null) scheduleChime(ctx, pendingGain);
  });
}

/** Schedule the two tones. Only called with a context already `running`. */
function scheduleChime(ctx: AudioContext, gainMultiplier?: number): void {
  const multiplier = clampGainMultiplier(gainMultiplier);
  const now = ctx.currentTime;
  const notes = [
    { freq: 880.0, time: 0.0, duration: 0.35, gain: CHIME_GAIN_A5 * multiplier }, // A5
    { freq: 1174.66, time: 0.18, duration: 0.65, gain: CHIME_GAIN_D6 * multiplier }, // D6
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
    startRepeatingAlarmLoop();
  }
}

/**
 * Arm the 10s repeat loop WITHOUT an immediate cue. Used when the arrival cue
 * already supplied the audible signal for this ticket (see
 * playKDSArrivalCue) — starting the loop with its own chime would double-fire.
 */
function startRepeatingAlarmLoop(): void {
  if (repeatIntervalId) return;
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

/**
 * Exactly one immediate cue for a ticket that arrives while syncKDSAlarmState
 * stays silent: either the 10s repeat loop is already sounding (so it plays
 * nothing), or an acknowledge latch suppresses the alarm because the count is
 * at or below the acknowledged level. In both cases without this the next
 * audible cue would be the loop's next tick — or, after an acknowledge, no cue
 * at all until a third ticket arrives. When syncKDSAlarmState does play its own
 * immediate chime (loop starting from rest, or the count rising past the
 * acknowledged level) this is a no-op — playing both was the 0→N double-fire.
 *
 * F3: a new ticket that only REFILLS the acknowledged count (A+B acknowledged,
 * A bumped to preparing, C arrives → 2 again) must do more than chime once.
 * Clearing the latch here and arming the repeat loop means the kitchen keeps
 * being reminded while C is still pending; previously the count-based latch
 * stayed set and the 10s loop never re-armed.
 */
export function playKDSArrivalCue(hasNewOrder: boolean, pendingCount: number): void {
  if (!hasNewOrder) return;
  const silencedByAcknowledge =
    acknowledgedPendingCount !== null && pendingCount <= acknowledgedPendingCount;
  if (isKDSAlarmRepeating() || silencedByAcknowledge) {
    playKDSChime();
  }
  if (silencedByAcknowledge) {
    acknowledgedPendingCount = null;
    // Arm silently: the cue above is this ticket's immediate signal, and the
    // follow-up syncKDSAlarmState must not chime again.
    startRepeatingAlarmLoop();
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
