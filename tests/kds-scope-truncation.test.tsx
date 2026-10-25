import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';

/**
 * F6 — the KDS reads only the first 10 outlets a scoped role owns (Firestore
 * `in` cap). That truncation used to be silent; the header must say so.
 */
const h = vi.hoisted(() => ({
  scopeBranchIds: [] as string[],
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'u1', role: 'branch_owner', branchIds: h.scopeBranchIds },
  }),
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({ selectedBranchId: null, setSelectedBranchId: vi.fn() }),
}));
vi.mock('react-router-dom', () => ({
  Link: (props: any) => React.createElement('a', { href: props.to }, props.children),
}));
vi.mock('@/utils/kdsAudio', () => ({
  isKDSAudioMuted: () => false,
  setKDSAudioMuted: vi.fn(),
  unlockKDSAudio: vi.fn(async () => true),
  isKDSAudioUnlocked: () => true,
  acknowledgeKDSAlarm: vi.fn(),
}));
vi.mock('@/features/kds', () => ({
  useKDSRealtimeStream: () => ({
    isOnline: true,
    isLoading: false,
    streamError: null,
    activeOrders: [],
    pendingOrders: [],
    preparingOrders: [],
    readyOrders: [],
    bumpOrder: vi.fn(),
    bumpingIds: {},
    recallLastOrder: vi.fn(),
    canRecall: false,
    lastBumpedOrder: null,
    refresh: vi.fn(),
    lastRefreshAt: Date.now(),
    scopeBranchIds: h.scopeBranchIds,
  }),
  AcousticChimePlayer: () => null,
  KDSAudioUnlockModal: () => null,
  KDSOrderCard: () => null,
  KDSQuick86Drawer: () => null,
  KOTTimerBadge: () => null,
}));

import { KDSPage } from '../src/pages/KDSPage';

describe('KDSPage header — scope truncation is stated (F6)', () => {
  it('shows the truncation notice when more than 10 outlets are assigned', () => {
    h.scopeBranchIds = Array.from({ length: 12 }, (_, i) => `branch_${i}`);
    const html = renderToString(<KDSPage />);

    expect(html).toContain('role="note"');
    expect(html).toContain('first 10 of 12 assigned outlets');
    expect(html).toMatch(/narrow the outlet filter/i);
  });

  it('stays silent when the whole scope fits', () => {
    h.scopeBranchIds = ['branch_1', 'branch_2'];
    const html = renderToString(<KDSPage />);

    expect(html).not.toContain('first 10 of');
  });
});
