import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createRequire } from 'node:module';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * F2 — the page's Cancel / Refund button must match the modal's (and the
 * server's) role gate exactly.
 *
 * support / regional_manager have /orders access but the modal hard-refuses
 * them, so the button used to open a dead-end "Manager Authorization
 * Required" wall. The oracle is behavioural equivalence across ALL roles:
 * page affordance present ⇔ modal accepts. Refund permissions stay a
 * separate, stricter matrix (pinned at the bottom).
 */
const h = vi.hoisted(() => ({
  role: 'branch_owner' as string | null | undefined,
  order: {
    id: 'ord_gate_1',
    status: 'pending',
    orderType: 'takeaway',
    paymentStatus: 'completed',
    total: 499,
    customerName: 'Aarav Patel',
    customerPhone: '+919876543210',
    branchId: 'branch_1',
    items: [],
    createdAt: { toDate: () => new Date('2026-10-20T12:00:00Z') },
  } as any,
  updateStatus: vi.fn(),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user:
      h.role === null || h.role === undefined
        ? null
        : { id: 'u1', name: 'Op', role: h.role, branchIds: ['branch_1'], cityIds: [] },
  }),
}));
vi.mock('@/hooks/useOrder', () => ({
  useOrder: () => ({
    order: h.order,
    isLoading: false,
    error: null,
    updateStatus: h.updateStatus,
    pushToPetpooja: vi.fn(),
    autoDispatchPorter: vi.fn(),
  }),
}));
vi.mock('@/hooks/useBranches', () => ({ useBranches: () => ({ branches: [] }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/services/partnerFunctionsApi', () => ({
  partnerFunctionsApi: { dispatchQuote: vi.fn(), releaseRefund: vi.fn() },
  dispatchProviderLabel: (winner: unknown) => String(winner),
}));
vi.mock('@/config/firebase', () => ({ app: {}, auth: {}, db: {}, messaging: null }));
vi.mock('@/core/config/firebase', () => ({ db: {} }));
vi.mock('@/components/DeliveryOtpModal', () => ({ DeliveryOtpModal: () => null }));
vi.mock('@/features/orders', async () => {
  const actual = await vi.importActual<typeof import('@/features/orders')>('@/features/orders');
  return {
    ...actual,
    KOTPrintPreview: () => null,
    OrderStatusStepper: () => null,
    PetpoojaTestRunnerModal: () => null,
  };
});

import { OrderCancelRefundModal } from '../src/features/orders/components/OrderCancelRefundModal';
import { OrderDetailPage } from '../src/pages/OrderDetailPage';
import { canCancelOrder } from '../src/features/orders/orderCancelRoles';
import { canReleaseRefund } from '../src/admin/pages/refundRoles';

// Reuse the workspace's existing DOM install; no new package dependency.
const require = createRequire(import.meta.url);
const { JSDOM } = require('../../burgonomics-foundation-core/node_modules/jsdom/lib/api.js') as {
  JSDOM: new (html: string, options?: { url?: string }) => { window: Window & typeof globalThis };
};

const ACCEPTED = ['brand_owner', 'developer', 'branch_owner', 'branch_staff'];
const REJECTED = ['support', 'regional_manager', 'customer'];

function modalAllowsCancel(role: string): boolean {
  h.role = role;
  const html = renderToStaticMarkup(
    <OrderCancelRefundModal order={h.order} isOpen onClose={() => {}} onConfirmCancel={() => {}} />
  );
  return html.includes('Confirm Cancellation');
}

describe('OrderDetailPage Cancel / Refund affordance matches the modal gate', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
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

  afterEach(async () => {
    if (root) {
      const current = root;
      root = null;
      await act(async () => current.unmount());
    }
    container?.remove();
    container = null;
  });

  afterAll(() => {
    for (const [key, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });

  async function mount(role: string): Promise<HTMLButtonElement | null> {
    h.role = role;
    container = document.createElement('div');
    document.body.appendChild(container);
    const localRoot = createRoot(container);
    root = localRoot;
    await act(async () => {
      localRoot.render(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={[`/orders/${h.order.id}`]}>
            <Routes>
              <Route path="/orders/:id" element={<OrderDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    // Render sanity: the page really painted (gate checks are not vacuous).
    expect(container.textContent).toContain('Ordered Items');
    return (
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Cancel / Refund')
      ) ?? null
    );
  }

  it('offers the button to the same roles the modal accepts, and to no others', async () => {
    for (const role of [...ACCEPTED, ...REJECTED]) {
      const button = await mount(role);
      expect(!!button).toBe(ACCEPTED.includes(role));
      // Single source: the page never offers what the modal will refuse.
      expect(!!button).toBe(modalAllowsCancel(role));
      await act(async () => root!.unmount());
      root = null;
      container!.remove();
      container = null;
    }
  });

  it('opens the cancellation dialog from the button for an accepted role', async () => {
    const button = await mount('branch_owner');
    expect(button).not.toBeNull();
    await act(async () => button!.click());
    const dialog = container!.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain('Cancel Order #');
  });

  it('leaves a rejected role with no destructive cancellation option to tap', async () => {
    const button = await mount('support');
    expect(button).toBeNull();
    expect(container!.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps cancel and refund as distinct, stricter-separate role matrices', () => {
    // branch staff may cancel but may never release money…
    expect(canCancelOrder('branch_staff')).toBe(true);
    expect(canReleaseRefund('branch_staff')).toBe(false);
    // …and support may release a refund but may never cancel an order.
    expect(canCancelOrder('support')).toBe(false);
    expect(canReleaseRefund('support')).toBe(true);
    // Fails closed on absent/unknown roles.
    expect(canCancelOrder(undefined)).toBe(false);
    expect(canCancelOrder(null)).toBe(false);
    expect(canCancelOrder('customer')).toBe(false);
  });
});
