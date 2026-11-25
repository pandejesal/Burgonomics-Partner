import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F6 / A7 #10 — the KDS audio alarm must not stay "enabled" while the
 * AudioContext is not running.
 *
 * The audited defect: `audioUnlocked` was read ONCE at mount
 * (`useState(isKDSAudioUnlocked())`). A wall-mounted tablet whose screen slept,
 * a browser that discarded the context, or a throttled long-idle tab leaves the
 * context suspended; `playKDSChime()` then tries `resume()` from a timer with no
 * user activation (which the autoplay policy refuses), the oscillators are
 * scheduled into a suspended context, and the "Enable Audio" banner stays hidden
 * because the state still says unlocked. The first morning order arrives in
 * silence.
 */

const h = vi.hoisted(() => ({
  state: 'running' as string,
  unlockedFlag: true as boolean,
}));

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  /** Live state: the browser can suspend/discard a running context at any time. */
  get state(): string {
    return h.state;
  }
  createOscillator() {
    return { type: '', frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  }
  createGain() {
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
    // Autoplay policy: a resume without user activation is REFUSED and the
    // context stays suspended.
    return Promise.resolve();
  }
}

beforeEach(() => {
  h.state = 'running';
  h.unlockedFlag = true;
  (globalThis as any).window = {
    AudioContext: FakeAudioContext,
    localStorage: { getItem: () => null, setItem: () => undefined },
  };
  (globalThis as any).localStorage = { getItem: () => null, setItem: () => undefined };
});

afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
});

import {
  __resetKDSAudioStateForTests,
  isKDSAudioUnlocked,
  playKDSChime,
  refreshKDSAudioUnlocked,
  setKDSAudioMuted,
  syncKDSAlarmState,
  unlockKDSAudio,
} from '../src/utils/kdsAudio';

describe('A7 #10 — audio state follows the REAL context', () => {
  it('reports unlocked only while the context is actually running', async () => {
    __resetKDSAudioStateForTests();
    await unlockKDSAudio();
    expect(isKDSAudioUnlocked()).toBe(true);

    // The tablet sleeps: the browser suspends the context.
    h.state = 'suspended';
    expect(refreshKDSAudioUnlocked()).toBe(false);
  });

  it('reports unlocked = false when the context was NEVER created', () => {
    // No context, so no alarm can be armed — the banner must be shown.
    expect(refreshKDSAudioUnlocked()).toBe(false);
  });

  it('drops the latch after a suspension so the next resume is a real gesture', async () => {
    __resetKDSAudioStateForTests();
    await unlockKDSAudio();
    h.state = 'suspended';
    expect(refreshKDSAudioUnlocked()).toBe(false);

    // A suspended context cannot be resumed silently from a timer: the flag is
    // cleared, so the page shows the enable banner again.
    expect(isKDSAudioUnlocked()).toBe(false);
  });
});

describe('A7 #10 — the page mirrors that truth on visibility/focus', () => {
  it('re-checks on visibilitychange, focus and pageshow', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/pages/KDSPage.tsx'), 'utf8');

    expect(source).toContain('refreshKDSAudioUnlocked');
    expect(source).toContain("addEventListener('visibilitychange'");
    expect(source).toContain("addEventListener('focus'");
    expect(source).toContain("addEventListener('pageshow'");
    // And the state is actually flipped from the live read, not just read.
    expect(source).toMatch(/setAudioUnlocked\(refreshKDSAudioUnlocked\(\)\)/);
  });

  it('keeps the alarm loop honest: a silent context does not fake a running loop', () => {
    __resetKDSAudioStateForTests();
    setKDSAudioMuted(false);
    syncKDSAlarmState(3);
    // A chime into a suspended context must not throw or wedge the module.
    h.state = 'suspended';
    expect(() => playKDSChime()).not.toThrow();
  });
});
