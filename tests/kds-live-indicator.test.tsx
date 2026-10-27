import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

/**
 * F1 (page half) — the live indicator must reflect source readiness.
 *
 * The emerald `animate-ping` dot used to render unconditionally (stream error,
 * offline, first load too), and the age read "data Ns old" as if any fetched
 * row refreshed the board. The gate is now online + no stream error + data
 * loaded, and the copy states the last board update without claiming a
 * provider heartbeat.
 */
const h = vi.hoisted(() => ({
  stream: {
    isOnline: true,
    isLoading: false,
    streamError: null as unknown,
    activeOrders: [] as any[],
    pendingOrders: [] as any[],
    preparingOrders: [] as any[],
    readyOrders: [] as any[],
    bumpOrder: vi.fn(),
    bumpingIds: {},
    recallLastOrder: vi.fn(),
    canRecall: false,
    lastBumpedOrder: null,
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
vi.mock('@/features/kds', () => ({
  useKDSRealtimeStream: () => h.stream,
  AcousticChimePlayer: () => null,
  KDSAudioUnlockModal: () => null,
  KDSOrderCard: () => null,
  KDSQuick86Drawer: () => null,
  KOTTimerBadge: () => null,
}));

import { KDSPage } from '../src/pages/KDSPage';

function renderPage(): string {
  h.stream.lastRefreshAt = Date.now();
  return renderToStaticMarkup(
    <MemoryRouter>
      <KDSPage />
    </MemoryRouter>
  );
}

describe('KDS live indicator honesty', () => {
  it('shows the pulsing live dot only when online with no stream error', () => {
    h.stream.isOnline = true;
    h.stream.isLoading = false;
    h.stream.streamError = null;

    const html = renderPage();
    expect(html).toContain('animate-ping');
    expect(html).toContain('Makeline Live');
  });

  it('drops the live ping while the stream is in error', () => {
    h.stream.streamError = new Error('listener died');

    const html = renderPage();
    expect(html).not.toContain('animate-ping');
    expect(html).toContain('Stream Error');
  });

  it('drops the live ping while the board is still loading', () => {
    h.stream.streamError = null;
    h.stream.isLoading = true;

    const html = renderPage();
    expect(html).not.toContain('animate-ping');
    expect(html).toContain('Loading');
  });

  it('drops the live ping and stops claiming "Live" while offline', () => {
    h.stream.isOnline = false;
    h.stream.isLoading = false;
    h.stream.streamError = null;

    const html = renderPage();
    expect(html).not.toContain('animate-ping');
    expect(html).toContain('KITCHEN OFFLINE');
    expect(html).not.toContain('Makeline Live');
  });

  it('states the last board update without claiming a provider heartbeat', () => {
    h.stream.isOnline = true;
    h.stream.isLoading = false;
    h.stream.streamError = null;

    const html = renderPage();
    expect(html).toContain('Last update');
    // The age is evidence about THIS board's own ingestion, so the copy stays
    // out of the provider's vocabulary entirely — even a disclaimer would put
    // the word in front of the operator.
    expect(html).not.toMatch(/heartbeat/i);
    expect(html).not.toContain('data 0s old');
  });
});
