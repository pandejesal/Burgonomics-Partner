import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Leaving /kds must silence the module-level 10s repeating alarm. The alarm is
 * module state owned by kdsAudio, so the only honest oracle is that module's
 * own state: arm it, mount the hook, unmount it the way React does (run every
 * effect cleanup), and assert the loop is gone.
 */
const h = vi.hoisted(() => ({
  cleanups: [] as Array<() => void>,
  user: { id: 'kds_staff', role: 'branch_staff', branchIds: ['branch_1'] } as any,
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, () => undefined],
  useRef: (current: any) => ({ current }),
  useCallback: (fn: any) => fn,
  useEffect: (effect: () => any) => {
    const cleanup = effect();
    if (typeof cleanup === 'function') h.cleanups.push(cleanup);
  },
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => ({ orders: [], isLoading: true, error: null, updateOrderStatus: undefined }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: Object.assign(() => ({ user: h.user }), {
    getState: () => ({ user: h.user }),
  }),
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(() => ({ selectedBranchId: 'branch_1' }), {
    getState: () => ({ selectedBranchId: 'branch_1' }),
  }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/orderContract', () => ({
  fetchAliasedStoreOrders: vi.fn(async () => []),
  normalizeOrderDoc: vi.fn((id: string) => ({ id })),
  orderDocTimeMs: () => 0,
  createKdsIngestionGate: () => ({ next: () => 1, isCurrent: () => true }),
}));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  onSnapshot: () => vi.fn(),
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { notification: vi.fn(async () => undefined) },
  NotificationType: { Success: 'SUCCESS' },
}));

import {
  __resetKDSAudioStateForTests,
  isKDSAlarmRepeating,
  syncKDSAlarmState,
} from '../src/utils/kdsAudio';
import { useKDSRealtimeStream } from '../src/features/kds/hooks/useKDSRealtimeStream';

describe('KDS alarm lifecycle — the makeline owns the repeating alarm', () => {
  beforeEach(() => {
    h.cleanups.length = 0;
    __resetKDSAudioStateForTests();
    (globalThis as unknown as Record<string, unknown>).window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      localStorage: { getItem: () => null, setItem: () => undefined },
    };
    (globalThis as unknown as Record<string, unknown>).localStorage = {
      getItem: () => null,
      setItem: () => undefined,
    };
  });

  afterEach(() => {
    __resetKDSAudioStateForTests();
    delete (globalThis as unknown as Record<string, unknown>).window;
    delete (globalThis as unknown as Record<string, unknown>).localStorage;
  });

  it('unmounting the KDS hook stops an armed repeating alarm', () => {
    syncKDSAlarmState(2);
    expect(isKDSAlarmRepeating()).toBe(true);

    useKDSRealtimeStream();
    expect(h.cleanups.length).toBeGreaterThan(0);

    for (const cleanup of h.cleanups) cleanup();
    expect(isKDSAlarmRepeating()).toBe(false);
  });
});
