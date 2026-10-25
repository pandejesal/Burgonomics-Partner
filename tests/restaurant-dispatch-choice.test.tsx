/**
 * restaurant-dispatch-choice — restaurant delivery choice regressions.
 *
 * Packet: Porter is cancelled. A restaurant picks a Borzo/Shadowfax courier
 * OR its own in-house rider. In-house is a first choice — it is NOT customer
 * pickup, NOT dependent on a third-party quote, and its UI must not depend on
 * Porter credentials. Users must never see a new-order action that books
 * Porter. Assignment/booking is NOT pickup proof. needs_review packets
 * (customer-cancelled / returned parcels) are manual-review outcomes, never
 * automatic carrier rebook.
 *
 * RED proven over pristine committed source (6f81fba); every initially
 * failing assertion traced to a real defect, not to weakened production code.
 *
 * Harness conventions copied from committed suites: node env (vitest.config),
 * jsdom vendored from the sibling workspace for interactive mounts
 * (see tests/branches-logs-polish.test.tsx), renderToStaticMarkup for
 * pure-render pins (see tests/partnerops-order-payment-labels.test.tsx).
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { Order } from '@/types';

// ── Hook mocks (hoisted) ────────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  return {
    manualBranchDispatch: vi.fn(),
    mutateAsyncStatus: vi.fn(),
    dispatchQuote: vi.fn(),
    dispatchBook: vi.fn(),
    dispatchCancel: vi.fn(),
    dispatchRebook: vi.fn(),
    savePorterManualBooking: vi.fn(),
    toastInfo: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    toastWarning: vi.fn(),
    loggerWarn: vi.fn(),
  };
});

vi.mock('@/services/porterDelivery', () => ({
  manualBranchDispatch: mocks.manualBranchDispatch,
}));

vi.mock('@/services/partnerFunctionsApi', () => ({
  dispatchProviderLabel: (p?: string | null) =>
    p === 'borzo'
      ? 'Borzo'
      : p === 'shadowfax'
        ? 'Shadowfax'
        : p === 'porter'
          ? 'Porter'
          : 'Courier',
  partnerFunctionsApi: {
    dispatchQuote: mocks.dispatchQuote,
    dispatchBook: mocks.dispatchBook,
    dispatchCancel: mocks.dispatchCancel,
    dispatchRebook: mocks.dispatchRebook,
    savePorterManualBooking: mocks.savePorterManualBooking,
  },
}));

vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => ({
    orders: [
      {
        id: 'ord_manual_1',
        status: 'ready',
        orderType: 'delivery',
        customerName: 'Aarav Patel',
        customerPhone: '+919876543210',
      },
      {
        // A cancelled courier that left its stale riderName on the doc —
        // the state where "Switch to In-House Delivery" must keep working.
        id: 'ord_cancelled_1',
        status: 'out_for_delivery',
        orderType: 'delivery',
        customerName: 'Aarav Patel',
        customerPhone: '+919876543210',
        deliveryStatus: 'rider_cancelled',
        needsRebook: true,
        riderName: 'Stale Vikram',
      },
      {
        // A LIVE third-party booking (server /dispatch/book writes
        // deliveryStatus 'dispatched' + dispatchProvider + riderName) —
        // in-house assignment must be refused over this one.
        id: 'ord_live_1',
        status: 'out_for_delivery',
        orderType: 'delivery',
        customerName: 'Aarav Patel',
        customerPhone: '+919876543210',
        deliveryStatus: 'dispatched',
        dispatchProvider: 'borzo',
        riderName: 'Live Courier',
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    updateOrderStatus: { mutateAsync: mocks.mutateAsyncStatus },
  }),
}));

vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({ branches: [] }),
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({ selectedBranchId: null }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: { user: { name: string } | null }) => unknown) =>
    sel({ user: { name: 'Staff Op' } }),
}));

vi.mock('sonner', () => ({
  toast: {
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
    error: mocks.toastError,
    warning: mocks.toastWarning,
  },
}));

vi.mock('@/core/logging/logger', () => ({
  logger: {
    warn: mocks.loggerWarn,
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { dispatchProviderLabel } from '@/services/partnerFunctionsApi';
import {
  getRiderStatusMeta,
  PorterDispatchCard,
} from '@/features/delivery/components/PorterDispatchCard';
import { RiderAssignmentModal } from '@/features/delivery/components/RiderAssignmentModal';
import {
  deriveDeliveryFeedState,
  usePorterLogistics,
} from '@/features/delivery/hooks/usePorterLogistics';
import { OrderTableList } from '@/features/orders/components/OrderTableList';

// Reuse the workspace's existing DOM install; no new package dependency.
const require = createRequire(import.meta.url);
const { JSDOM } = require('../../burgonomics-foundation-core/node_modules/jsdom/lib/api.js') as {
  JSDOM: new (html: string) => { window: Window & typeof globalThis };
};

const PHI = '+919876543210';

describe('getRiderStatusMeta — real server manual-dispatch shape', () => {
  it('reads the real manual_branch_terminal shape as in-house, not Porter', () => {
    // The server writes dispatchType: 'manual_branch_terminal' +
    // deliveryStatus: 'dispatched' (porter.service.ts manualBranchDispatch);
    // the old check only matched deliveryStatus === 'manually_assigned', so a
    // real in-house rider was labelled "Porter Rider Allocated" and offered a
    // Cancel-Porter action.
    const meta = getRiderStatusMeta({
      id: 'ord_1',
      status: 'ready',
      orderType: 'delivery',
      riderName: 'Ramesh Patel',
      deliveryStatus: 'dispatched',
      dispatchType: 'manual_branch_terminal',
    } as unknown as Order);

    expect(meta.statusText).toBe('In-House Staff Assigned');
    expect(meta.isInHouse).toBe(true);
    expect(meta.isPorter).toBe(false);
  });

  it('still recognises the legacy manually_assigned in-house shape', () => {
    const meta = getRiderStatusMeta({
      id: 'ord_1b',
      status: 'out_for_delivery',
      orderType: 'delivery',
      deliveryStatus: 'manually_assigned',
      riderName: 'Ramesh Patel',
    } as unknown as Order);

    expect(meta.statusText).toBe('In-House Staff Assigned');
    expect(meta.isInHouse).toBe(true);
  });

  it('labels Borzo and Shadowfax allocations with their real provider name', () => {
    for (const provider of ['borzo', 'shadowfax'] as const) {
      const meta = getRiderStatusMeta({
        id: 'ord_2',
        status: 'out_for_delivery',
        orderType: 'delivery',
        deliveryStatus: 'driver_allocated',
        riderName: 'Vikram Rathore',
        dispatchProvider: provider,
      } as unknown as Order);

      expect(meta.statusText).toBe(`${dispatchProviderLabel(provider)} Courier Allocated`);
      expect(meta.isPorter).toBe(false);
      expect(meta.isInHouse).toBe(false);
    }
  });

  it('reserves the Porter label for explicit historical Porter evidence only', () => {
    // Historical carve-out: `driver_allocated` was written ONLY by Porter-era
    // webhooks, so a doc with that status but no provider field is genuine
    // Porter history (the committed DeliveryQueuePage.test.tsx pin holds).
    const legacy = getRiderStatusMeta({
      id: 'ord_3',
      status: 'ready',
      orderType: 'delivery',
      deliveryStatus: 'driver_allocated',
      riderName: 'Vikram Rathore',
    } as unknown as Order);
    expect(legacy.statusText).toBe('Porter Rider Allocated');
    expect(legacy.isPorter).toBe(true);

    // A bare rider name saved by a non-Porter path is NOT Porter evidence.
    // The old code inferred "Porter" from any riderName.
    const bare = getRiderStatusMeta({
      id: 'ord_3b',
      status: 'ready',
      orderType: 'delivery',
      riderName: 'Ramesh Patel',
    } as unknown as Order);
    expect(bare.statusText).not.toContain('Porter');
    expect(bare.isPorter).toBe(false);
  });

  it('books a needs_review packet as manual review — never auto rebook, never cooking', () => {
    // Server containment (dispatch.webhooks): customer_cancelled /
    // returned_to_seller parcels land in deliveryStatus 'needs_review' with
    // needsRebook=false — manual-review outcomes, no automatic carrier rebook
    // and never "kitchen cooking".
    for (const shape of [
      { deliveryStatus: 'needs_review', rebookTrigger: 'customer_cancelled', needsRebook: false },
      { deliveryStatus: 'needs_review', rebookTrigger: 'returned_to_seller', needsRebook: false },
      { rebookTrigger: 'customer_cancelled', needsRebook: false },
    ]) {
      const meta = getRiderStatusMeta({
        id: 'ord_4',
        status: 'out_for_delivery',
        orderType: 'delivery',
        riderName: 'Vikram Rathore',
        ...shape,
      } as unknown as Order);

      expect(meta.statusText).not.toContain('Rebook Needed');
      expect(meta.statusText).not.toBe('Kitchen Cooking');
      expect(meta.statusText).not.toContain('Porter');
      expect((meta as { isManualReview?: boolean }).isManualReview).toBe(true);
    }
  });

  it('respects terminal states — a delivered order is not cooking', () => {
    const meta = getRiderStatusMeta({
      id: 'ord_5',
      status: 'delivered',
      orderType: 'delivery',
      deliveryStatus: 'delivered',
    } as unknown as Order);

    expect(meta.statusText).not.toBe('Kitchen Cooking');
  });
});

// ── 2. PorterDispatchCard — provider-truthful rendering (static) ───────────

function deliveryOrder(shape: Record<string, unknown>): Order {
  return {
    id: 'ord_card_1',
    customerName: 'Aarav Patel',
    customerPhone: PHI,
    orderType: 'delivery',
    status: 'ready',
    total: 260,
    items: [],
    subtotal: 219,
    tax: 11,
    deliveryFee: 30,
    deliveryAddress: { full: '12 Ring Road, Surat', lat: 21.17, lng: 72.83 },
    ...shape,
  } as unknown as Order;
}

function renderCard(order: Order): string {
  return renderToStaticMarkup(
    <PorterDispatchCard
      order={order}
      onFetchQuote={() => {}}
      onDispatchPorter={() => {}}
      onOpenAssignModal={() => {}}
      onCancelPorter={() => {}}
    />
  );
}

/** Extracts the full `<button …>` tag containing the given inner text. */
function enclosingTag(html: string, marker: string, startTag: string): string {
  const idx = html.indexOf(marker);
  expect(idx).toBeGreaterThan(-1);
  const start = html.lastIndexOf(startTag, idx);
  const end = html.indexOf('>', idx);
  return html.slice(start, end + 1);
}

describe('PorterDispatchCard — delivery choice rendering', () => {
  it('renders the real server in-house shape without any Porter claim or cancel booking', () => {
    const html = renderCard(
      deliveryOrder({
        status: 'ready',
        deliveryStatus: 'dispatched',
        dispatchType: 'manual_branch_terminal',
        riderName: 'Ramesh Patel',
        riderPhone: PHI,
      })
    );

    expect(html).toContain('In-House Staff Assigned');
    expect(html).not.toContain('Porter');
    // No live courier booking exists for an in-house terminal assignment, so
    // there is nothing to "Cancel … / Re-assign" here.
    expect(html).not.toMatch(/Cancel (Porter|Courier|Borzo|Shadowfax)/);
  });

  it('never falls back to a Porter label or Cancel-Porter from a bare rider name', () => {
    const html = renderCard(
      deliveryOrder({ status: 'out_for_delivery', riderName: 'Ramesh Patel' })
    );
    expect(html).not.toContain('Cancel Porter');
  });

  it('shows in-house as a first choice even with no quote at all — and it is enabled', () => {
    // In-house must never depend on a third-party quote: no quote prop here,
    // and the control must still be usable (not disabled by quote absence).
    const html = renderCard(deliveryOrder({ status: 'ready' }));
    expect(html).toContain('In-House');
    expect(html).toContain('Quote unavailable');
    const assignButton = enclosingTag(html, 'Assign In-House Store Rider', '<button');
    expect(assignButton).not.toContain('disabled');
  });

  it('shows the manual-review outcome for customer-cancelled/returned parcels', () => {
    const html = renderCard(
      deliveryOrder({
        status: 'out_for_delivery',
        deliveryStatus: 'needs_review',
        rebookTrigger: 'customer_cancelled',
        needsRebook: false,
        riderName: 'Vikram Rathore',
      })
    );

    expect(html).toContain('Manual Review');
    // Not auto rebook:
    expect(html).not.toContain('1-Click Rebook');
    // Not pretend-cooking either:
    expect(html).not.toContain('Kitchen Cooking');
    // The stale "Ready for dispatch" subtitle contradicts the review state:
    expect(html).toContain('Awaiting staff review');
  });

  it('does not brand carrier cancels as Porter on behalf of another provider', () => {
    const html = renderCard(
      deliveryOrder({
        status: 'out_for_delivery',
        needsRebook: true,
        deliveryStatus: 'rider_cancelled',
        riderCancellationReason: 'Driver unassigned the trip',
        dispatchProvider: 'shadowfax',
      })
    );
    expect(html).not.toContain('Porter');
  });
});

// ── 3. Interactive jsdom harness ────────────────────────────────────────────

describe('interactive delivery choice behavior (jsdom)', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let $doc!: Document;
  let $win!: Window & typeof globalThis;
  const originalGlobals = new Map<string, PropertyDescriptor | undefined>();

  beforeAll(() => {
    const { window: w } = new JSDOM('<!doctype html><html><body></body></html>');
    $doc = w.document;
    const globals: Record<string, unknown> = {
      window: w,
      document: $doc,
      HTMLElement: (w as Window & typeof globalThis).HTMLElement,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    $win = w as Window & typeof globalThis;
    for (const [key, value] of Object.entries(globals)) {
      originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    $doc.body.innerHTML = '';
  });

  afterAll(() => {
    for (const [key, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });

  async function mount(ui: React.ReactNode): Promise<void> {
    container = $doc.createElement('div');
    $doc.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(ui));
  }

  function setInstanceValue(
    el: HTMLInputElement,
    text: string
  ): void {
    // React 19's per-node value tracker suppresses delegated 'input' events
    // when its cached value already equals the DOM value; dropping the
    // tracker makes updateValueIfChanged accept the event (the DOM value is
    // set through the same native prototype setter browsers use). React 19
    // in node env also evaluates with canUseDOM=false, disabling the input
    // change plugin — so the event is delivered through the element's OWN
    // mounted props.onChange (the very handler a real keystroke triggers),
    // plus a native dispatch for any non-React listeners. Uses the React-
    // private props key by name; if a future React drops that key, the
    // native dispatch remains as fallback and the assertion still fails
    // loudly rather than vacuously passing.
    (el as HTMLInputElement & { _valueTracker: unknown })._valueTracker = null;
    const protoSetter = Object.getOwnPropertyDescriptor(
      $win.HTMLInputElement.prototype,
      'value'
    )?.set;
    protoSetter?.call(el, text);
    const propsKey = Object.keys(el).find(
      (k) => k.startsWith('__reactProps$')
    );
    const props = propsKey
      ? (el as unknown as Record<string, { onChange?: (e: unknown) => void }>)[propsKey]
      : undefined;
    if (typeof props?.onChange === 'function') {
      props.onChange({ target: el, type: 'input', bubbles: true });
    }
    el.dispatchEvent(new $win.Event('input', { bubbles: true }));
  }

  async function fillField(selector: string, text: string): Promise<void> {
    setInstanceValue($doc.querySelector<HTMLInputElement>(selector)!, text);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2));
    });
  }

  async function clickSubmit(): Promise<void> {
    await act(async () => {
      $doc.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await new Promise((r) => setTimeout(r, 10));
    });
  }

  const onClose = vi.fn();

  afterEach(() => {
    onClose.mockReset();
  });

  it('Queue tab state machine — feed states are honest', () => {
    expect(deriveDeliveryFeedState({ isLoading: true, error: null })).toBe('loading');
    expect(deriveDeliveryFeedState({ isLoading: false, error: null })).toBe('ready');
    expect(deriveDeliveryFeedState({ isLoading: false, error: new Error('x') })).toBe('error');
    // An errored feed is NOT a loading skeleton being actively worked:
    // loading wins display-wise, but the error is never silently dropped.
    expect(deriveDeliveryFeedState({ isLoading: true, error: new Error('x') })).toBe('loading');
  });

  it('the orders-table dispatch CTA opens the queue instead of booking a courier', async () => {
    const spy = vi.fn();

    await mount(
      <MemoryRouter initialEntries={['/admin/orders']}>
        <OrderTableList orders={[deliveryOrder({ status: 'ready' })]} onDispatchPorter={spy} />
      </MemoryRouter>
    );

    const anchor = $doc.querySelector('[data-dispatch-choice]') as HTMLAnchorElement | null;
    expect(anchor).not.toBeNull();
    // Navigates to the EXISTING delivery queue, with the /admin prefix:
    expect(anchor!.getAttribute('href')).toBe('/admin/delivery-queue');
    // Clicking it must never book anything paid:
    await act(async () => anchor!.click());
    expect(spy).not.toHaveBeenCalled();
  });

  it('dispatch CTA under /orders routes to the non-admin delivery queue route', async () => {
    await mount(
      <MemoryRouter initialEntries={['/orders']}>
        <OrderTableList orders={[deliveryOrder({ status: 'ready' })]} />
      </MemoryRouter>
    );

    const anchor = $doc.querySelector('[data-dispatch-choice]') as HTMLAnchorElement | null;
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute('href')).toBe('/delivery-queue');
  });

  it('assignment — a failed server response keeps the modal open with real inputs', async () => {
    const closeSpy = vi.fn();
    const onConfirmAssign = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error('dispatch server unreachable')));

    await mount(
      <RiderAssignmentModal
        order={deliveryOrder({})}
        isOpen={true}
        onClose={closeSpy}
        onConfirmAssign={onConfirmAssign as never}
      />
    );

    await fillField('input[type="text"]', 'Ramesh Patel');
    await fillField('input[type="tel"]', '+91 9876543210');
    await clickSubmit();

    // Submission reached the assignment callback exactly once:
    expect(onConfirmAssign).toHaveBeenCalledTimes(1);

    // No false close:
    expect(closeSpy).not.toHaveBeenCalled();
    // Modal still on screen:
    expect($doc.querySelector('form')).not.toBeNull();
    // Inputs retained for a safe retry:
    const name = $doc.querySelector<HTMLInputElement>('input[type="text"]');
    const phone = $doc.querySelector<HTMLInputElement>('input[type="tel"]');
    expect(name?.value).toBe('Ramesh Patel');
    expect(phone?.value).toBe('+91 9876543210');
    // An accessible error is exposed:
    const alert = $doc.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent || '').toMatch(/unreachable|failed/i);
    // Retry is possible (submit not stuck disabled):
    const retryButton = $doc.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(retryButton?.disabled).toBe(false);
  });

  it('assignment — a pending submission disables duplicate submits (one call, closes on success)', async () => {
    const closeSpy = vi.fn();
    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const onConfirmAssign = vi.fn(() => gate);

    await mount(
      <RiderAssignmentModal
        order={deliveryOrder({})}
        isOpen={true}
        onClose={closeSpy}
        onConfirmAssign={onConfirmAssign as never}
      />
    );

    await fillField('input[type="text"]', 'Ramesh Patel');
    await fillField('input[type="tel"]', '+919876543210');
    await clickSubmit();

    expect(onConfirmAssign).toHaveBeenCalledTimes(1);
    // Close only after confirmed success — a pending submission has not:
    expect(closeSpy).not.toHaveBeenCalled();

    const submitBtn = $doc.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submitBtn?.disabled).toBe(true);
    await act(async () => {
      submitBtn?.click();
      await new Promise((r) => setTimeout(r, 2));
    });
    expect(onConfirmAssign).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 5));
    });
    // Confirmed success closes exactly once:
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('assignment — confirmed success closes exactly once', async () => {
    const closeSpy = vi.fn();
    const onConfirmAssign = vi.fn(() => Promise.resolve(undefined));

    await mount(
      <RiderAssignmentModal
        order={deliveryOrder({})}
        isOpen={true}
        onClose={closeSpy}
        onConfirmAssign={onConfirmAssign as never}
      />
    );

    await fillField('input[type="text"]', 'Ramesh Patel');
    await fillField('input[type="tel"]', '+919876543210');
    await clickSubmit();

    expect(onConfirmAssign).toHaveBeenCalledTimes(1);
    // Close exactly once, only after the response settled:
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('dialog labels — the assignment form is accessible', async () => {
    await mount(
      <RiderAssignmentModal
        order={deliveryOrder({})}
        isOpen={true}
        onClose={onClose}
        onConfirmAssign={() => undefined}
      />
    );

    const dialog = $doc.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby') || dialog?.getAttribute('aria-label')).toBeTruthy();

    const closeBtn = $doc.querySelector('[data-testid="rider-modal-close"]');
    expect(closeBtn).not.toBeNull();
    expect(closeBtn?.getAttribute('aria-label')).toBeTruthy();

    const nameInput = $doc.querySelector<HTMLInputElement>('input[type="text"]');
    expect(nameInput).not.toBeNull();
    const nameFieldId = nameInput?.id;
    expect(nameFieldId).toBeTruthy();
    const nameLabel = $doc.querySelector<HTMLLabelElement>(`label[for="${nameFieldId}"]`);
    expect(nameLabel).not.toBeNull();
  });

  it('hook — assignment saves the server rider and never fabricates out_for_delivery', async () => {
    let hook!: ReturnType<typeof usePorterLogistics>;
    function Probe(): null {
      hook = usePorterLogistics();
      return null;
    }
    await mount(<Probe />);

    mocks.manualBranchDispatch.mockResolvedValueOnce({
      success: true,
      orderId: 'ord_manual_1',
      riderName: 'Ramesh Patel',
      riderPhone: '+919876543210',
    });

    await act(async () => {
      await hook.assignInHouseRider('ord_manual_1', {
        name: 'Ramesh Patel',
        phone: '+919876543210',
      });
    });

    expect(mocks.manualBranchDispatch).toHaveBeenCalledTimes(1);
    expect(mocks.manualBranchDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ord_manual_1',
        riderName: 'Ramesh Patel',
        riderPhone: '+919876543210',
        staffName: 'Staff Op',
      })
    );
    // Assignment is NOT pickup proof: no client-side out_for_delivery write.
    expect(mocks.mutateAsyncStatus).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/Assigned in-house rider/)
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith(
      expect.stringMatching(/out for delivery/i)
    );
  });

  it('hook — a stale riderName from a CANCELLED courier does not block the in-house fallback', async () => {
    // The card offers "Switch to In-House Delivery" exactly when a courier
    // cancelled — a stale riderName left on the doc by that cancellation is
    // NOT a live assignment, so the fallback must actually work.
    let hook!: ReturnType<typeof usePorterLogistics>;
    function Probe(): null {
      hook = usePorterLogistics();
      return null;
    }
    await mount(<Probe />);

    mocks.manualBranchDispatch.mockResolvedValueOnce({
      success: true,
      orderId: 'ord_cancelled_1',
      riderName: 'New Rider',
      riderPhone: '+919876543210',
    });

    await act(async () => {
      await hook.assignInHouseRider('ord_cancelled_1', {
        name: 'New Rider',
        phone: '+919876543210',
      });
    });

    expect(mocks.manualBranchDispatch).toHaveBeenCalledTimes(1);
    expect(mocks.manualBranchDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'ord_cancelled_1', riderName: 'New Rider' })
    );
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.mutateAsyncStatus).not.toHaveBeenCalled();
  });

  it('hook — a LIVE courier booking still refuses a second assignment', async () => {
    // The stale-rider relaxation must not mask a live /dispatch/book
    // booking (deliveryStatus 'dispatched' + dispatchProvider + riderName).
    let hook!: ReturnType<typeof usePorterLogistics>;
    function Probe(): null {
      hook = usePorterLogistics();
      return null;
    }
    await mount(<Probe />);

    let caught: unknown;
    await act(async () => {
      try {
        await hook.assignInHouseRider('ord_live_1', {
          name: 'Second Rider',
          phone: '+919876543210',
        });
      } catch (e) {
        caught = e;
      }
    });

    expect((caught as Error)?.message).toMatch(/already assigned/);
    expect(mocks.toastError).toHaveBeenCalledWith(
      expect.stringMatching(/already assigned/)
    );
    // No server call was made for the refused double-assignment:
    expect(mocks.manualBranchDispatch).not.toHaveBeenCalled();
    expect(mocks.mutateAsyncStatus).not.toHaveBeenCalled();
  });

  it('hook — a failed server assignment is not treated as success (rethrows, status untouched)', async () => {
    let hook!: ReturnType<typeof usePorterLogistics>;
    function Probe(): null {
      hook = usePorterLogistics();
      return null;
    }
    await mount(<Probe />);

    mocks.manualBranchDispatch.mockRejectedValueOnce(new Error('dispatch server unreachable'));

    let caught: unknown;
    await act(async () => {
      try {
        await hook.assignInHouseRider('ord_manual_1', { name: 'R', phone: '+919876543210' });
      } catch (e) {
        caught = e;
      }
    });

    expect((caught as Error)?.message).toBe('dispatch server unreachable');
    expect(mocks.toastError).toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.mutateAsyncStatus).not.toHaveBeenCalled();
  });

  it('hook — external booking paths do not fabricate out_for_delivery either', async () => {
    let hook!: ReturnType<typeof usePorterLogistics>;
    function Probe(): null {
      hook = usePorterLogistics();
      return null;
    }
    await mount(<Probe />);

    mocks.dispatchBook.mockResolvedValueOnce({
      provider: 'borzo',
      providerOrderId: 'BZ-1',
      riderName: 'Vikram R',
    });

    await act(async () => {
      await hook.dispatchPorter(deliveryOrder({ id: 'ord_manual_1', status: 'ready' }));
    });

    expect(mocks.dispatchBook).toHaveBeenCalledTimes(1);
    expect(mocks.mutateAsyncStatus).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it('hook — the pasted Porter-manual lane does not fabricate out_for_delivery either', async () => {
    let hook!: ReturnType<typeof usePorterLogistics>;
    function Probe(): null {
      hook = usePorterLogistics();
      return null;
    }
    await mount(<Probe />);

    mocks.savePorterManualBooking.mockResolvedValueOnce({
      success: true,
      porterOrderId: 'POR-123',
      reused: false,
    });

    await act(async () => {
      await hook.savePorterManual('ord_manual_1', 'POR-123');
    });

    expect(mocks.savePorterManualBooking).toHaveBeenCalledTimes(1);
    // Pasting a booking binds server rider fields; it is NOT pickup proof.
    expect(mocks.mutateAsyncStatus).not.toHaveBeenCalled();
    expect(String(mocks.toastSuccess.mock.calls[0]?.[0])).toContain('Porter booking saved');
  });
});
