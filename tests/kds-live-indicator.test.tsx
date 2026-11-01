import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

/**
 * KDS live-indicator honesty, reconciled to the redesign feed state.
 *
 * The header may claim "Makeline Live" only when the stream reports `live`.
 * A failed/degraded listener is "Live Unavailable" with a last-good-data age —
 * never an emerald pulse and never an empty-kitchen claim. The age chip is
 * about THIS board's last good read, not a provider heartbeat.
 */
const h = vi.hoisted(() => ({
  stream: {
    isOnline: true,
    isLoading: false,
    streamError: null as unknown,
    streamStatus: 'live' as 'connecting' | 'live' | 'live_unavailable',
    dataVerified: true,
    activeOrders: [] as any[],
    pendingOrders: [] as any[],
    preparingOrders: [] as any[],
    readyOrders: [] as any[],
    bumpOrder: vi.fn(),
    bumpingIds: {},
    recallLastOrder: vi.fn(),
    canRecall: false,
    lastBumpedOrder: null,
    newOrderIds: [] as string[],
    newOrderTotal: 0,
    dismissNewOrderAlert: vi.fn(),
    refresh: vi.fn(),
    lastRefreshAt: 0,
    scopeBranchIds: ['branch_1'],
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'u1', role: 'branch_owner', name: 'Op' } }),
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({ selectedBranchId: 'branch_1', setSelectedBranchId: vi.fn() }),
}));
vi.mock('@/utils/kdsAudio', () => ({
  isKDSAudioMuted: () => false,
  setKDSAudioMuted: vi.fn(),
  unlockKDSAudio: vi.fn(async () => true),
  isKDSAudioUnlocked: () => true,
  acknowledgeKDSAlarm: vi.fn(),
}));
vi.mock('@/features/kds', async () => {
  const actual = await vi.importActual<any>('@/features/kds/hooks/useKDSRealtimeStream');
  return {
    deriveKdsColumnState: actual.deriveKdsColumnState,
    formatKdsDataAge: actual.formatKdsDataAge,
    useKDSRealtimeStream: () => h.stream,
    AcousticChimePlayer: () => null,
    KDSAudioUnlockModal: () => null,
    KDSNewOrderAlert: () => null,
    KDSOrderCard: () => null,
    KDSQuick86Drawer: () => null,
    KOTTimerBadge: () => null,
  };
});

import { KDSPage } from '../src/pages/KDSPage';

function renderPage(): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <KDSPage />
    </MemoryRouter>
  );
}

describe('KDS live indicator honesty', () => {
  it('shows the pulsing dot and "Makeline Live" only for a live stream', () => {
    h.stream.streamStatus = 'live';
    h.stream.dataVerified = true;
    h.stream.streamError = null;
    h.stream.lastRefreshAt = Date.now();

    const html = renderPage();
    expect(html).toContain('animate-ping');
    expect(html).toContain('Makeline Live');
  });

  it('a degraded listener says Live Unavailable with no live ping', () => {
    h.stream.streamStatus = 'live_unavailable';
    h.stream.lastRefreshAt = Date.now() - 90_000;

    const html = renderPage();
    expect(html).not.toContain('animate-ping');
    expect(html).toContain('Live Unavailable');
    expect(html).toContain('last good data');
  });

  it('states "Connecting" without a live ping while the first snapshot is pending', () => {
    h.stream.streamStatus = 'connecting';
    h.stream.dataVerified = false;

    const html = renderPage();
    expect(html).not.toContain('animate-ping');
    expect(html).toContain('Connecting');
  });

  it('does not claim live data while offline', () => {
    h.stream.isOnline = false;
    h.stream.streamStatus = 'live_unavailable';

    const html = renderPage();
    expect(html).not.toContain('animate-ping');
    expect(html).toContain('KITCHEN OFFLINE');
    expect(html).not.toContain('Makeline Live');
  });

  it('never claims a provider heartbeat and labels degraded age as last good data', () => {
    h.stream.isOnline = true;
    h.stream.streamStatus = 'live_unavailable';
    h.stream.lastRefreshAt = Date.now();

    const html = renderPage();
    expect(html).toContain('last good data');
    expect(html).not.toMatch(/heartbeat/i);
  });
});
