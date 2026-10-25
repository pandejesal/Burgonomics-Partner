import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  playKDSChime,
  playKDSArrivalCue,
  syncKDSAlarmState,
  stopRepeatingKDSAlarm,
  acknowledgeKDSAlarm,
  isKDSAlarmRepeating,
  isKDSAudioMuted,
  setKDSAudioMuted,
  KDS_ALARM_REPEAT_MS,
  __resetKDSAudioStateForTests,
} from './kdsAudio';

// ---- Web Audio API mocks ----
interface MockOsc {
  type: string;
  frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface MockGain {
  gain: {
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
}

const createdOscillators: MockOsc[] = [];
const createdGains: MockGain[] = [];

const mockCtx = {
  currentTime: 100,
  state: 'running' as string,
  destination: {},
  resume: vi.fn().mockResolvedValue(undefined),
  createOscillator: vi.fn(() => {
    const osc: MockOsc = {
      type: '',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    createdOscillators.push(osc);
    return osc;
  }),
  createGain: vi.fn(() => {
    const g: MockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    createdGains.push(g);
    return g;
  }),
};

function installBrowserMocks() {
  const store = new Map<string, string>();
  const localStorageMock = {
    getItem: vi.fn((k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => void store.set(k, v)),
    removeItem: vi.fn((k: string) => void store.delete(k)),
    clear: vi.fn(() => store.clear()),
  };
  (globalThis as unknown as Record<string, unknown>).window = {
    AudioContext: vi.fn(function (this: unknown) {
      return mockCtx;
    }),
  };
  (globalThis as unknown as Record<string, unknown>).localStorage = localStorageMock;
  return { store, localStorageMock };
}

describe('kdsAudio — two-tone doorbell chime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createdOscillators.length = 0;
    createdGains.length = 0;
    mockCtx.createOscillator.mockClear();
    mockCtx.createGain.mockClear();
    mockCtx.state = 'running';
    installBrowserMocks();
    __resetKDSAudioStateForTests();
  });

  afterEach(() => {
    __resetKDSAudioStateForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as unknown as Record<string, unknown>).window;
    delete (globalThis as unknown as Record<string, unknown>).localStorage;
  });

  it('plays a two-tone doorbell: A5 880Hz then D6 1174.66Hz with sine + exponential decay', () => {
    playKDSChime();

    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
    expect(mockCtx.createGain).toHaveBeenCalledTimes(2);
    expect(createdOscillators).toHaveLength(2);

    // Tone 1: 880.00 Hz (A5), ~0.35s, gain 0.30
    const [osc1, osc2] = createdOscillators;
    expect(osc1.type).toBe('sine');
    expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(880, 100);
    expect(osc1.start).toHaveBeenCalledWith(100);
    expect(osc1.stop).toHaveBeenCalledWith(100 + 0.35);

    // Tone 2: 1174.66 Hz (D6), start +0.18s, ~0.65s, gain 0.35
    expect(osc2.type).toBe('sine');
    expect(osc2.frequency.setValueAtTime).toHaveBeenCalledWith(1174.66, 100 + 0.18);
    expect(osc2.start).toHaveBeenCalledWith(100 + 0.18);
    expect(osc2.stop).toHaveBeenCalledWith(100 + 0.18 + 0.65);

    // Exponential decay envelope on both tones
    const [gain1, gain2] = createdGains;
    expect(gain1.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.3, 100 + 0.03);
    expect(gain1.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 100 + 0.35);
    expect(gain2.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.35, 100 + 0.18 + 0.03);
    expect(gain2.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 100 + 0.18 + 0.65);
  });

  it('mute toggle blocks playback and persists state', () => {
    expect(isKDSAudioMuted()).toBe(false);

    setKDSAudioMuted(true);
    expect(isKDSAudioMuted()).toBe(true);

    playKDSChime();
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    setKDSAudioMuted(false);
    expect(isKDSAudioMuted()).toBe(false);

    playKDSChime();
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('repeats the chime every 10 seconds while orders are pending', () => {
    expect(KDS_ALARM_REPEAT_MS).toBe(10000);

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    syncKDSAlarmState(2);

    // Immediate chime on first sync
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10000);
    expect(isKDSAlarmRepeating()).toBe(true);

    // Advance 10s → second chime
    mockCtx.createOscillator.mockClear();
    vi.advanceTimersByTime(10000);
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);

    // Advance another 10s → third chime
    mockCtx.createOscillator.mockClear();
    vi.advanceTimersByTime(10000);
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);

    // Clearing the makeline stops the loop
    syncKDSAlarmState(0);
    expect(isKDSAlarmRepeating()).toBe(false);

    mockCtx.createOscillator.mockClear();
    vi.advanceTimersByTime(30000);
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();
  });

  it('acknowledgeKDSAlarm silences the loop until the pending count increases', () => {
    syncKDSAlarmState(3);
    expect(isKDSAlarmRepeating()).toBe(true);

    acknowledgeKDSAlarm(3);
    expect(isKDSAlarmRepeating()).toBe(false);

    // Same count re-sync must NOT restart the alarm
    mockCtx.createOscillator.mockClear();
    syncKDSAlarmState(3);
    expect(isKDSAlarmRepeating()).toBe(false);
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    // Timer must stay silent while acknowledged
    vi.advanceTimersByTime(30000);
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    // A count increase (new orders) resumes alarming
    syncKDSAlarmState(4);
    expect(isKDSAlarmRepeating()).toBe(true);
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('latches the caller-supplied live count, not a stale module count', () => {
    // Module counter 2 from an earlier snapshot; the page returns showing 5.
    syncKDSAlarmState(2);
    expect(isKDSAlarmRepeating()).toBe(true);

    acknowledgeKDSAlarm(5);
    expect(isKDSAlarmRepeating()).toBe(false);

    // Next snapshot carries the displayed count: the latch must hold, or the
    // acknowledge is silently discarded and the loop restarts.
    mockCtx.createOscillator.mockClear();
    syncKDSAlarmState(5);
    expect(isKDSAlarmRepeating()).toBe(false);
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30000);
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();
  });

  it('latches the displayed count so a genuine increase still escalates', () => {
    // Module counter 6 is stale; only 2 tickets are actually pending.
    syncKDSAlarmState(6);
    expect(isKDSAlarmRepeating()).toBe(true);

    acknowledgeKDSAlarm(2);
    expect(isKDSAlarmRepeating()).toBe(false);

    mockCtx.createOscillator.mockClear();
    syncKDSAlarmState(2);
    expect(isKDSAlarmRepeating()).toBe(false);
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    // A third ticket must escalate above the acknowledged 2, not the stale 6.
    syncKDSAlarmState(3);
    expect(isKDSAlarmRepeating()).toBe(true);
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('muting stops the repeating alarm', () => {
    syncKDSAlarmState(2);
    expect(isKDSAlarmRepeating()).toBe(true);

    setKDSAudioMuted(true);
    expect(isKDSAlarmRepeating()).toBe(false);

    stopRepeatingKDSAlarm();
  });
});

describe('kdsAudio — arrival cue is heard exactly once', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createdOscillators.length = 0;
    createdGains.length = 0;
    mockCtx.createOscillator.mockClear();
    mockCtx.createGain.mockClear();
    mockCtx.state = 'running';
    installBrowserMocks();
    __resetKDSAudioStateForTests();
  });

  afterEach(() => {
    __resetKDSAudioStateForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as unknown as Record<string, unknown>).window;
    delete (globalThis as unknown as Record<string, unknown>).localStorage;
  });

  it('initial 0→N load: the alarm is the only cue, no manual arrival chime', () => {
    // The hook's priming pass marks existing tickets as seen, so no arrival.
    playKDSArrivalCue(false, 2);
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    syncKDSAlarmState(2);
    // One chime == two oscillators (A5 + D6).
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
    expect(isKDSAlarmRepeating()).toBe(true);
  });

  it('a growth from a nonzero pending count while the loop is armed produces exactly one cue', () => {
    syncKDSAlarmState(2);
    expect(isKDSAlarmRepeating()).toBe(true);
    mockCtx.createOscillator.mockClear();

    playKDSArrivalCue(true, 3);
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);

    // The same effect then syncs the new count; the armed loop must not
    // chime again on that call.
    syncKDSAlarmState(3);
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('a first arrival while the loop is not armed is cued once by the alarm, not twice', () => {
    playKDSArrivalCue(true, 1);
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    syncKDSAlarmState(1);
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('an acknowledged kitchen cues a new ticket that refills the count AND re-arms the repeat loop', () => {
    // A + B pending, loop armed; staff acknowledge, which stops the loop at ack=2.
    syncKDSAlarmState(2);
    acknowledgeKDSAlarm(2);
    expect(isKDSAlarmRepeating()).toBe(false);

    // Kitchen bumps A to preparing: pending=1, still under the latch — silent.
    mockCtx.createOscillator.mockClear();
    syncKDSAlarmState(1);
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    // C arrives: pending is back at 2, not ABOVE ack=2, so sync stays silent.
    // The arrival cue is the one immediate signal, and the latch is released
    // so the repeat loop arms for as long as C stays pending (F3).
    playKDSArrivalCue(true, 2);
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
    syncKDSAlarmState(2);
    // The follow-up sync must not double-chime.
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
    expect(isKDSAlarmRepeating()).toBe(true);

    // The loop now keeps reminding the kitchen every 10s.
    mockCtx.createOscillator.mockClear();
    vi.advanceTimersByTime(10000);
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);

    // The next snapshot of the same count must not cue again (the loop's own
    // tick is the only sound).
    mockCtx.createOscillator.mockClear();
    playKDSArrivalCue(false, 2);
    syncKDSAlarmState(2);
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    expect(isKDSAlarmRepeating()).toBe(true);
  });

  it('an unchanged snapshot produces no cue', () => {
    syncKDSAlarmState(3);
    mockCtx.createOscillator.mockClear();

    playKDSArrivalCue(false, 3);
    syncKDSAlarmState(3);
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();
  });
});
