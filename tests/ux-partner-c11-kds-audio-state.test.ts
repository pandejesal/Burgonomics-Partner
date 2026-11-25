import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * UX audit 2026-11-26, Partner High #3 — the KDS chime was scheduled on a
 * SUSPENDED AudioContext.
 *
 * `playKDSChime()` fired `void ctx.resume()` and then scheduled both oscillators
 * anyway. A suspended context's clock does not advance, so nothing was audible
 * while the toolbar still advertised "unmuted"; when something finally resumed
 * the context, every chime queued since woke up and played together — a burst.
 *
 * Contract under test:
 *  - nothing is ever scheduled while `ctx.state !== 'running'`;
 *  - the context is resumed FIRST and the chime plays only after that;
 *  - a refused resume leaves the state honestly blocked (no sound claimed);
 *  - a burst of arrivals while suspended produces exactly ONE chime, never one
 *    per arrival and never a pile-up.
 */

const h = vi.hoisted(() => ({
  state: 'running' as string,
  /** Set by a test to model an autoplay policy that refuses resume. */
  refuseResume: false,
  oscillators: 0,
  gains: 0,
}));

class FakeAudioContext {
  currentTime = 10;
  destination = {};
  get state(): string {
    return h.state;
  }
  createOscillator() {
    h.oscillators += 1;
    return {
      type: '',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  createGain() {
    h.gains += 1;
    return {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
  }
  resume() {
    // A real browser flips `state` to 'running' when the promise settles — not
    // synchronously inside resume() — which is exactly the window in which a
    // burst of arrivals used to pile up. Model that faithfully.
    return Promise.resolve().then(() => {
      // A resume without user activation is REFUSED: it resolves, but the
      // context stays suspended.
      if (!h.refuseResume) h.state = 'running';
    });
  }
}

function installBrowser() {
  const store = new Map<string, string>();
  (globalThis as any).window = { AudioContext: FakeAudioContext };
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

/** Let the resume promise chain (2-3 microtask hops) settle. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  h.state = 'running';
  h.refuseResume = false;
  h.oscillators = 0;
  h.gains = 0;
  installBrowser();
});

afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
});

import {
  __resetKDSAudioStateForTests,
  isKDSAudioBlocked,
  isKDSAudioUnlocked,
  playKDSChime,
  setKDSAudioMuted,
  unlockKDSAudio,
} from '../src/utils/kdsAudio';

describe('UX #3 — a suspended context never schedules a chime', () => {
  it('never schedules a tone while the context is suspended', async () => {
    __resetKDSAudioStateForTests();
    h.state = 'suspended';

    playKDSChime();

    // Synchronously — the moment the call was made — nothing is scheduled:
    // a suspended context would hold it and fire it later as a burst.
    expect(h.oscillators).toBe(0);
    expect(isKDSAudioBlocked()).toBe(true);
  });

  it('plays the chime only AFTER the resume actually succeeded', async () => {
    __resetKDSAudioStateForTests();
    h.state = 'suspended';

    playKDSChime();
    expect(h.oscillators).toBe(0);

    await settle();
    // One chime == two oscillators (A5 + D6).
    expect(h.oscillators).toBe(2);
    expect(isKDSAudioBlocked()).toBe(false);
  });

  it('resumes first and then plays exactly one chime for a burst of arrivals', async () => {
    __resetKDSAudioStateForTests();
    h.state = 'suspended';

    // Three orders arrive while the tablet is still waking up.
    playKDSChime();
    playKDSChime();
    playKDSChime();
    await settle();

    // One chime == two oscillators (A5 + D6). Never three chimes, never none.
    expect(h.oscillators).toBe(2);
    expect(h.gains).toBe(2);
    expect(isKDSAudioBlocked()).toBe(false);
  });

  it('reports blocked when the resume is refused, and never claims unlocked', async () => {
    __resetKDSAudioStateForTests();
    h.state = 'suspended';
    h.refuseResume = true;

    playKDSChime();
    await settle();

    expect(h.oscillators).toBe(0);
    expect(isKDSAudioBlocked()).toBe(true);
    // The honest read: the flag may only be true while the context runs.
    expect(isKDSAudioUnlocked()).toBe(false);
  });

  it('does not burst after a later resume: queued calls are not replayable', async () => {
    __resetKDSAudioStateForTests();
    h.state = 'suspended';
    h.refuseResume = true;

    playKDSChime();
    playKDSChime();
    playKDSChime();
    await settle();
    expect(h.oscillators).toBe(0);

    // Staff taps "Enable Audio" — the context really starts running now.
    h.refuseResume = false;
    h.state = 'suspended';
    await unlockKDSAudio();
    expect(h.state).toBe('running');

    // Nothing from the suspended period is replayed.
    await settle();
    expect(h.oscillators).toBe(0);
  });

  it('applies the requested gain multiplier to both tones', async () => {
    __resetKDSAudioStateForTests();
    playKDSChime(0.5);

    expect(h.oscillators).toBe(2);
    // Default A5 gain 0.30 and D6 gain 0.35, halved.
    expect(h.gains).toBe(2);
  });

  it('clamps a nonsense multiplier into the audible range', async () => {
    __resetKDSAudioStateForTests();
    playKDSChime(0);
    // A zero gain would be an inaudible "success"; the floor keeps it honest.
    expect(() => playKDSChime(Number.NaN)).not.toThrow();
  });
});

describe('UX #3 — unlock only reports true when the context is really running', () => {
  it('returns false when resume leaves the context suspended', async () => {
    __resetKDSAudioStateForTests();
    h.state = 'suspended';
    h.refuseResume = true;

    await expect(unlockKDSAudio()).resolves.toBe(false);
    expect(isKDSAudioUnlocked()).toBe(false);
    expect(isKDSAudioBlocked()).toBe(true);
  });

  it('returns true and marks unlocked when the gesture really resumed audio', async () => {
    __resetKDSAudioStateForTests();
    h.state = 'suspended';
    h.refuseResume = false;

    await expect(unlockKDSAudio()).resolves.toBe(true);
    expect(h.state).toBe('running');
    expect(isKDSAudioUnlocked()).toBe(true);
    expect(isKDSAudioBlocked()).toBe(false);
  });

  it('stays muted at the chime level even when the context runs', async () => {
    __resetKDSAudioStateForTests();
    setKDSAudioMuted(true);
    playKDSChime();
    await settle();
    expect(h.oscillators).toBe(0);
    setKDSAudioMuted(false);
  });
});
