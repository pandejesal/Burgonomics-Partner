import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression test for KDS signout cache wipe:
// Validates that clearAppCaches() removes user-data KDS keys ('kds-pending-bumps:v1',
// 'kds-checklist:v1', 'kds-audio-intro-seen:v1') while leaving device-level
// physical mute ('burgonomics_kds_muted') untouched and remaining idempotent.

const { mockQueryClientClear } = vi.hoisted(() => ({
  mockQueryClientClear: vi.fn(),
}));

vi.mock('@/App', () => ({
  queryClient: {
    clear: mockQueryClientClear,
  },
}));

import {
  clearAppCaches,
  USER_DATA_LOCALSTORAGE_KEYS,
} from '../src/core/session/clearAppCaches';
import {
  __resetKDSAudioStateForTests,
  acknowledgeKDSAlarm,
  isKDSAudioMuted,
  isKDSAlarmRepeating,
  syncKDSAlarmState,
} from '../src/utils/kdsAudio';

const KDS_OUTBOX_KEY = 'kds-pending-bumps:v1';
const KDS_CHECKLIST_KEY = 'kds-checklist:v1';
const KDS_AUDIO_INTRO_KEY = 'kds-audio-intro-seen:v1';
const KDS_MUTE_KEY = 'burgonomics_kds_muted';

const sampleOutboxPayload = JSON.stringify([
  {
    orderId: 'ord_rush_42',
    targetStatus: 'preparing',
    queuedAt: 1_700_000_000_000,
    expectedStatus: 'pending',
  },
]);

const sampleChecklistPayload = JSON.stringify({
  ord_rush_42: { item_burger_classic: true, item_fries: false },
});

interface LocalStorageMock {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  readonly length: number;
  key: (index: number) => string | null;
}

let store: Map<string, string>;
let localStorageMock: LocalStorageMock;

function installStorageMocks() {
  store = new Map<string, string>();
  localStorageMock = {
    getItem: vi.fn((k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => void store.set(k, String(v))),
    removeItem: vi.fn((k: string) => void store.delete(k)),
    clear: vi.fn(() => store.clear()),
    get length() {
      return store.size;
    },
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
  };

  (globalThis as unknown as Record<string, unknown>).window = {
    localStorage: localStorageMock,
  };
  (globalThis as unknown as Record<string, unknown>).localStorage = localStorageMock;
}

function uninstallStorageMocks() {
  delete (globalThis as unknown as Record<string, unknown>).window;
  delete (globalThis as unknown as Record<string, unknown>).localStorage;
}

describe('clearAppCaches — KDS signout cache wipe and device mute preservation', () => {
  beforeEach(() => {
    installStorageMocks();
    mockQueryClientClear.mockClear();
  });

  afterEach(() => {
    __resetKDSAudioStateForTests();
    uninstallStorageMocks();
    vi.restoreAllMocks();
  });

  it('wipes KDS outbox, checklist, and audio intro while preserving physical mute state', () => {
    // 1. Populate valid KDS user-data and physical mute key
    localStorageMock.setItem(KDS_OUTBOX_KEY, sampleOutboxPayload);
    localStorageMock.setItem(KDS_CHECKLIST_KEY, sampleChecklistPayload);
    localStorageMock.setItem(KDS_AUDIO_INTRO_KEY, 'true');
    localStorageMock.setItem(KDS_MUTE_KEY, 'true');

    // Confirm initial state
    expect(localStorageMock.getItem(KDS_OUTBOX_KEY)).toBe(sampleOutboxPayload);
    expect(localStorageMock.getItem(KDS_CHECKLIST_KEY)).toBe(sampleChecklistPayload);
    expect(localStorageMock.getItem(KDS_AUDIO_INTRO_KEY)).toBe('true');
    expect(localStorageMock.getItem(KDS_MUTE_KEY)).toBe('true');
    expect(isKDSAudioMuted()).toBe(true);

    // 2. Run real clearAppCaches
    clearAppCaches();

    // 3. Assert three user-data keys are absent
    expect(localStorageMock.getItem(KDS_OUTBOX_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_CHECKLIST_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_AUDIO_INTRO_KEY)).toBeNull();

    // 4. Assert physical mute remains unchanged
    expect(localStorageMock.getItem(KDS_MUTE_KEY)).toBe('true');
    expect(isKDSAudioMuted()).toBe(true);

    // 5. QueryClient cache cleared
    expect(mockQueryClientClear).toHaveBeenCalledTimes(1);
  });

  it('is idempotent across repeated clearAppCaches invocations', () => {
    localStorageMock.setItem(KDS_OUTBOX_KEY, sampleOutboxPayload);
    localStorageMock.setItem(KDS_CHECKLIST_KEY, sampleChecklistPayload);
    localStorageMock.setItem(KDS_AUDIO_INTRO_KEY, 'true');
    localStorageMock.setItem(KDS_MUTE_KEY, 'true');

    // First clear
    clearAppCaches();
    expect(localStorageMock.getItem(KDS_OUTBOX_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_CHECKLIST_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_AUDIO_INTRO_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_MUTE_KEY)).toBe('true');
    expect(isKDSAudioMuted()).toBe(true);

    // Second clear on already-wiped user data
    expect(() => clearAppCaches()).not.toThrow();
    expect(localStorageMock.getItem(KDS_OUTBOX_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_CHECKLIST_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_AUDIO_INTRO_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_MUTE_KEY)).toBe('true');
    expect(isKDSAudioMuted()).toBe(true);

    // Third clear on empty state remains stable
    expect(() => clearAppCaches()).not.toThrow();
    expect(mockQueryClientClear).toHaveBeenCalledTimes(3);
  });

  it('preserves unmuted physical preference (burgonomics_kds_muted = false)', () => {
    localStorageMock.setItem(KDS_OUTBOX_KEY, sampleOutboxPayload);
    localStorageMock.setItem(KDS_CHECKLIST_KEY, sampleChecklistPayload);
    localStorageMock.setItem(KDS_AUDIO_INTRO_KEY, 'true');
    localStorageMock.setItem(KDS_MUTE_KEY, 'false');

    clearAppCaches();

    expect(localStorageMock.getItem(KDS_OUTBOX_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_CHECKLIST_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_AUDIO_INTRO_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_MUTE_KEY)).toBe('false');
    expect(isKDSAudioMuted()).toBe(false);
  });

  it('survives queryClient.clear failure and proceeds to wipe localStorage user keys', () => {
    mockQueryClientClear.mockImplementationOnce(() => {
      throw new Error('queryClient purge failed');
    });

    localStorageMock.setItem(KDS_OUTBOX_KEY, sampleOutboxPayload);
    localStorageMock.setItem(KDS_CHECKLIST_KEY, sampleChecklistPayload);
    localStorageMock.setItem(KDS_AUDIO_INTRO_KEY, 'true');
    localStorageMock.setItem(KDS_MUTE_KEY, 'true');

    expect(() => clearAppCaches()).not.toThrow();

    expect(localStorageMock.getItem(KDS_OUTBOX_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_CHECKLIST_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_AUDIO_INTRO_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_MUTE_KEY)).toBe('true');
  });

  it('continues wiping subsequent keys if one removeItem call throws', () => {
    const errorThrowingRemove = vi.fn((key: string) => {
      if (key === KDS_OUTBOX_KEY) {
        throw new Error('Disk quota or simulated storage failure');
      }
      store.delete(key);
    });
    localStorageMock.removeItem = errorThrowingRemove;

    localStorageMock.setItem(KDS_OUTBOX_KEY, sampleOutboxPayload);
    localStorageMock.setItem(KDS_CHECKLIST_KEY, sampleChecklistPayload);
    localStorageMock.setItem(KDS_AUDIO_INTRO_KEY, 'true');
    localStorageMock.setItem(KDS_MUTE_KEY, 'true');

    expect(() => clearAppCaches()).not.toThrow();

    // Outbox removal threw, but checklist and intro were not blocked
    expect(localStorageMock.getItem(KDS_CHECKLIST_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_AUDIO_INTRO_KEY)).toBeNull();
    expect(localStorageMock.getItem(KDS_MUTE_KEY)).toBe('true');
  });

  it('wipes all declared USER_DATA_LOCALSTORAGE_KEYS while leaving device-level preferences', () => {
    for (const key of USER_DATA_LOCALSTORAGE_KEYS) {
      localStorageMock.setItem(key, `val_${key}`);
    }
    localStorageMock.setItem(KDS_MUTE_KEY, 'true');
    localStorageMock.setItem('device_theme_mode', 'dark');

    clearAppCaches();

    for (const key of USER_DATA_LOCALSTORAGE_KEYS) {
      expect(localStorageMock.getItem(key)).toBeNull();
    }
    expect(localStorageMock.getItem(KDS_MUTE_KEY)).toBe('true');
    expect(localStorageMock.getItem('device_theme_mode')).toBe('dark');
  });

  it('clears the acknowledged KDS alarm latch so the next operator still alarms', () => {
    syncKDSAlarmState(3);
    expect(isKDSAlarmRepeating()).toBe(true);

    acknowledgeKDSAlarm(3);
    expect(isKDSAlarmRepeating()).toBe(false);

    clearAppCaches();

    syncKDSAlarmState(3);
    expect(isKDSAlarmRepeating()).toBe(true);
  });
});
