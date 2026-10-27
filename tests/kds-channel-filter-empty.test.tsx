import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createRequire } from 'node:module';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F3 — a filtered column must never claim the kitchen is clear while tickets
 * are hidden behind the channel filter.
 *
 * When the selected channel's column is empty but OTHER channels hold tickets,
 * the empty state must say how many are hidden by the filter and offer
 * "Show all". Counts stay per-column (pending/preparing/ready each report
 * their own hidden number), and the card mutation callbacks stay wired.
 */
const h = vi.hoisted(() => ({
  pending: [] as any[],
  preparing: [] as any[],
  ready: [] as any[],
  activeOrders: [] as any[],
  bumpOrder: vi.fn(),
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
  useKDSRealtimeStream: () => ({
    isOnline: true,
    isLoading: false,
    streamError: null,
    activeOrders: h.activeOrders,
    pendingOrders: h.pending,
    preparingOrders: h.preparing,
    readyOrders: h.ready,
    bumpOrder: h.bumpOrder,
    bumpingIds: {},
    recallLastOrder: vi.fn(),
    canRecall: false,
    lastBumpedOrder: null,
    refresh: vi.fn(),
    lastRefreshAt: Date.now(),
    scopeBranchIds: ['branch_1'],
  }),
  AcousticChimePlayer: () => null,
  KDSAudioUnlockModal: () => null,
  // Card stub mirrors the production props contract: the page must keep
  // passing onBumpOrder through to every rendered card.
  KDSOrderCard: (props: any) => (
    <div data-testid={`card-${props.order.id}`}>
      <button type="button" onClick={() => props.onBumpOrder(props.order.id, 'preparing')}>
        bump {props.order.id}
      </button>
    </div>
  ),
  KDSQuick86Drawer: () => null,
  KOTTimerBadge: () => null,
}));

import { KDSPage } from '../src/pages/KDSPage';

const order = (id: string, status: string, orderType: string) =>
  ({ id, status, orderType, customerName: 'Aarav Patel', items: [], total: 250 }) as any;

// Reuse the workspace's existing DOM install; no new package dependency.
const require = createRequire(import.meta.url);
const { JSDOM } = require('../../burgonomics-foundation-core/node_modules/jsdom/lib/api.js') as {
  JSDOM: new (html: string, options?: { url?: string }) => { window: Window & typeof globalThis };
};

function textOf(el: Element | null): string {
  return el?.textContent ?? '';
}

function buttonIn(root: Element, label: string): HTMLButtonElement | null {
  return Array.from(root.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === label
  ) ?? null;
}

describe('KDS channel-filter empty states stay truthful', () => {
  let root: Root;
  let container: HTMLDivElement;
  const originalGlobals = new Map<string, PropertyDescriptor | undefined>();

  beforeAll(() => {
    const { window } = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
    const globals: Record<string, unknown> = {
      window,
      document: window.document,
      HTMLElement: window.HTMLElement,
      localStorage: window.localStorage,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    for (const [key, value] of Object.entries(globals)) {
      originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
  });

  beforeEach(() => {
    h.pending = [
      order('ord_p_1', 'pending', 'delivery'),
      order('ord_p_2', 'pending', 'delivery'),
      order('ord_p_3', 'pending', 'delivery'),
    ];
    h.preparing = [
      order('ord_g_1', 'preparing', 'delivery'),
      order('ord_g_2', 'preparing', 'delivery'),
      order('ord_g_3', 'preparing', 'dinein'),
    ];
    h.ready = [order('ord_r_1', 'ready', 'takeaway')];
    h.activeOrders = [...h.pending, ...h.preparing, ...h.ready];
    h.bumpOrder = vi.fn();
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    container?.remove();
  });

  afterAll(() => {
    for (const [key, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });

  async function mount() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <KDSPage />
        </MemoryRouter>
      );
    });
  }

  async function click(button: HTMLButtonElement | null) {
    expect(button).not.toBeNull();
    await act(async () => {
      button!.click();
    });
  }

  it('names the hidden tickets per column and offers Show all instead of claiming clarity', async () => {
    await mount();

    // Sanity: all 7 tickets visible with the All chip.
    expect(buttonIn(container, 'All (7)')).not.toBeNull();

    await click(buttonIn(container, 'Dine-In'));

    const pendingCol = container.querySelector('section[aria-label="New KOTs"]')!;
    const grillCol = container.querySelector('section[aria-label="On The Grill"]')!;
    const readyCol = container.querySelector('section[aria-label="Ready at Counter"]')!;

    // Pending column: 0 dine-in, 3 delivery hidden — must NOT say clear.
    expect(textOf(pendingCol)).toContain('No Dine-In orders waiting.');
    expect(textOf(pendingCol)).toContain('3 hidden by Dine-In filter');
    expect(textOf(pendingCol)).not.toContain('Kitchen grill is clear.');
    expect(buttonIn(pendingCol, 'Show all')).not.toBeNull();

    // Grill column actually holds 1 dine-in ticket — shown, no hidden note.
    expect(grillCol.querySelector('[data-testid="card-ord_g_3"]')).not.toBeNull();
    expect(textOf(grillCol)).not.toContain('hidden by Dine-In filter');

    // Ready column: 0 dine-in, 1 takeaway hidden — its own count, no claim.
    expect(textOf(readyCol)).toContain('1 hidden by Dine-In filter');
    expect(textOf(readyCol)).not.toContain('All prepared orders dispatched.');
    expect(buttonIn(readyCol, 'Show all')).not.toBeNull();
    expect(textOf(readyCol)).not.toContain('3 hidden by Dine-In filter');
  });

  it('preserves per-column counts and restores every ticket on Show all', async () => {
    await mount();
    await click(buttonIn(container, 'Dine-In'));

    const pendingCol = container.querySelector('section[aria-label="New KOTs"]')!;
    expect(pendingCol.querySelector('span.font-mono')?.textContent).toBe('0');

    await click(buttonIn(pendingCol, 'Show all'));

    const restored = container.querySelector('section[aria-label="New KOTs"]')!;
    expect(restored.querySelector('span.font-mono')?.textContent).toBe('3');
    expect(restored.querySelector('[data-testid="card-ord_p_1"]')).not.toBeNull();
    expect(restored.querySelector('[data-testid="card-ord_p_3"]')).not.toBeNull();
    expect(buttonIn(container, 'All (7)')).not.toBeNull();
  });

  it('keeps the card mutation callback wired while a filter is active', async () => {
    await mount();
    await click(buttonIn(container, 'Dine-In'));

    const grillCol = container.querySelector('section[aria-label="On The Grill"]')!;
    const bump = Array.from(grillCol.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('bump ord_g_3')
    );
    expect(bump).toBeTruthy();

    await act(async () => {
      bump!.click();
    });

    expect(h.bumpOrder).toHaveBeenCalledTimes(1);
    expect(h.bumpOrder).toHaveBeenCalledWith('ord_g_3', 'preparing');
  });
});
