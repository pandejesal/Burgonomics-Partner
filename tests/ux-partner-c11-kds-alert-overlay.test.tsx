import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

/**
 * UX audit 2026-11-26, Partner High #6 + Medium #15.
 *
 * #6 — the KDS applied `env(safe-area-inset-top)` three times (root `pt-safe`,
 * the header's `calc(var + 0.75rem)`, the offline strip's
 * `calc(env + 0.625rem)`), so a punch-hole phone pushed the toolbar ~48px down
 * and floated the red "KITCHEN OFFLINE" strip away from the status bar.
 *
 * #15 — `KDSNewOrderAlert` sat in the page flow above the header, so every
 * arriving ticket shoved the whole three-column makeline down and back up.
 *
 * The contract below is behavioural, not cosmetic: at NO point on this screen
 * may more than one element claim the top inset, and the arrival banner must be
 * out of flow so the grid never moves.
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
    bumpingIds: {} as Record<string, boolean>,
    recallLastOrder: vi.fn(),
    canRecall: false,
    lastBumpedOrder: null as { id: string } | null,
    newOrderIds: [] as string[],
    newOrderTotal: 0,
    dismissNewOrderAlert: vi.fn(),
    refresh: vi.fn(),
    lastRefreshAt: 0,
    scopeBranchIds: ['branch_1'],
    readsCompleteScope: true,
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
  // Mirrors the partner-c11 branch: the page re-checks the live context on
  // visibility/focus. Present so this harness still resolves after the release
  // merge even though the overlay fix itself does not call it.
  refreshKDSAudioUnlocked: () => true,
  isKDSAudioBlocked: () => false,
  subscribeKDSAudioBlocked: () => () => {},
  acknowledgeKDSAlarm: vi.fn(),
}));
vi.mock('@/features/kds', async () => {
  const actual = await vi.importActual<any>('@/features/kds/hooks/useKDSRealtimeStream');
  const alert = await vi.importActual<any>('@/features/kds/components/KDSNewOrderAlert');
  return {
    deriveKdsColumnState: actual.deriveKdsColumnState,
    formatKdsDataAge: actual.formatKdsDataAge,
    useKDSRealtimeStream: () => h.stream,
    KDSNewOrderAlert: alert.KDSNewOrderAlert,
    AcousticChimePlayer: () => null,
    KDSAudioUnlockModal: () => null,
    KDSOrderCard: () => null,
    KDSQuick86Drawer: () => null,
    KOTTimerBadge: () => null,
  };
});

import { KDSPage } from '../src/pages/KDSPage';
import { KDSNewOrderAlert } from '../src/features/kds/components/KDSNewOrderAlert';
import { KDSOrderCard } from '../src/features/kds/components/KDSOrderCard';

function renderPage(): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <KDSPage />
    </MemoryRouter>,
  );
}

/** Count of real `env(safe-area-inset-top)` uses in rendered markup. */
function topInsetClaims(html: string): number {
  return (html.match(/env\(safe-area-inset-top/g) ?? []).length;
}

describe('UX #6 — the top safe-area inset has exactly one owner', () => {
  it('online: only the toolbar claims the inset, and the root does not', () => {
    h.stream.isOnline = true;
    h.stream.streamStatus = 'live';
    h.stream.newOrderIds = [];
    const html = renderPage();

    expect(html).not.toContain('pt-safe');
    expect(topInsetClaims(html)).toBe(1);
  });

  it('offline: the offline strip owns it and the toolbar drops it', () => {
    h.stream.isOnline = false;
    h.stream.streamStatus = 'live_unavailable';
    h.stream.newOrderIds = [];
    const html = renderPage();

    expect(html).toContain('KITCHEN OFFLINE');
    expect(topInsetClaims(html)).toBe(1);
  });

  it('offline + degraded stream: the two strips never both claim it', () => {
    h.stream.isOnline = false;
    h.stream.streamStatus = 'live_unavailable';
    const html = renderPage();

    expect(html).toContain('Live makeline stream unavailable');
    expect(topInsetClaims(html)).toBe(1);
  });

  it('online + degraded stream: the degraded strip owns it', () => {
    h.stream.isOnline = true;
    h.stream.streamStatus = 'live_unavailable';
    const html = renderPage();

    expect(html).toContain('Live makeline stream unavailable');
    expect(topInsetClaims(html)).toBe(1);
  });
});

describe('UX #15 — the arrival banner is an overlay, never a flow row', () => {
  it('positions the banner absolutely with the published chrome offset', () => {
    const html = renderToStaticMarkup(
      <KDSNewOrderAlert orderIds={['ab12cd99']} onDismiss={() => {}} />,
    );

    const banner = html.match(/<div[^>]*data-testid="kds-new-order-banner"[^>]*>/)?.[0] ?? '';
    expect(banner).toContain('absolute');
    expect(banner).toContain('inset-x-0');
    expect(banner).toContain('z-50');
    // Anchored under the toolbar the page measured, not at a guessed height.
    expect(banner).toContain('var(--kds-chrome-bottom');
    // Pointer-transparent so a tap on the edge reaches the tickets beneath.
    expect(banner).toContain('pointer-events-none');
    // And it is not a flex child of the makeline.
    expect(banner).not.toContain('flex-1');
  });

  it('the makeline grid is not preceded by an in-flow banner slot', () => {
    h.stream.isOnline = true;
    h.stream.streamStatus = 'live';
    h.stream.newOrderIds = ['ab12cd99'];
    h.stream.newOrderTotal = 1;
    const html = renderPage();

    expect(html).toContain('kds-new-order-banner');
    // The page root is a positioning context for the overlay.
    expect(html).toMatch(/<div class="[^"]*relative[^"]*"/);
    // And the banner is out of flow: it never appears as a sibling row before
    // the makeline in the flex column.
    const bannerIndex = html.indexOf('kds-new-order-banner');
    const mainIndex = html.indexOf('<main');
    expect(bannerIndex).toBeGreaterThan(-1);
    expect(bannerIndex).toBeLessThan(mainIndex); // still declared in the tree
    expect(html).toMatch(/data-testid="kds-new-order-banner"[^>]*absolute|absolute[^>]*data-testid="kds-new-order-banner"/);
  });

  it('publishes the measured toolbar bottom so the overlay sits under it', () => {
    const source = readFileSync(new URL('../src/pages/KDSPage.tsx', import.meta.url), 'utf8');
    expect(source).toContain("'--kds-chrome-bottom'");
    expect(source).toContain('setProperty');
  });
});

describe('UX #14 — one scroller per column, no scroller inside a ticket', () => {
  it('the ticket item list grows with the card instead of scrolling inside it', () => {
    const html = renderToStaticMarkup(
      <KDSOrderCard
        order={
          {
            id: 'ord_1',
            customerName: 'Fixture',
            customerPhone: '+910000000000',
            orderType: 'delivery',
            status: 'pending',
            items: [{ name: 'Jr. Hero Burger', quantity: 2, price: 129 }],
            total: 258,
          } as any
        }
        checkedItems={{}}
        onToggleItemCheck={() => {}}
        onBumpOrder={() => {}}
      />,
    );

    expect(html).not.toContain('max-h-[320px]');
    // The bump bar keeps its place at the card's bottom.
    expect(html).toContain('Accept KOT');
  });

  it('the makeline hands scrolling to its columns instead of nesting it', () => {
    const source = readFileSync(new URL('../src/pages/KDSPage.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/<main className="[^"]*md:overflow-hidden/);
    expect((source.match(/min-h-0/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('UX #4 — "Not now — keep silent" really mutes the board', () => {
  it('routes the modal dismissal through the same mute path as the toggle', () => {
    const source = readFileSync(new URL('../src/pages/KDSPage.tsx', import.meta.url), 'utf8');
    expect(source).toContain('handleKeepSilentFromIntro');
    expect(source).toMatch(/setKDSAudioMuted\(true\)/);
    expect(source).toMatch(/onDismiss=\{handleKeepSilentFromIntro\}/);
  });
});

describe('UX #3 — the toolbar icon follows the REAL context, not the mount snapshot', () => {
  it('re-reads isKDSAudioUnlocked on the clock the header already ticks', () => {
    const source = readFileSync(new URL('../src/pages/KDSPage.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/setAudioUnlocked\(/);
    expect(source).toMatch(/isKDSAudioUnlocked\(\)/);
    // Inside the existing 15s ticker, so no second timer is added.
    expect((source.match(/setInterval\(/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});
