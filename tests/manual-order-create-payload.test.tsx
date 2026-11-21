// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Counter-order modal against transport and Firestore boundaries (F4).
 *
 * CHANGED FOR F4 (staging 2026-11-21, Test 7): the modal used to compute the
 * bill itself — food + an inline GST + a packaging fee fetched separately from
 * `/checkout/fees` — and post that number as `expectedTotalPaise`. HL Road
 * charges Rs 15 packaging and the staging preview missed it, so the bill on
 * screen disagreed with the bill the server booked.
 *
 * The till now DISPLAYS the server's quote (`/orders/walkInQuote`) and confirms
 * that exact total. These tests pin the server bill, not a local formula: any
 * arithmetic done here would be the bug again. They also pin the F5 identity
 * rule — a PRICE_CHANGED reconfirmation keeps the SAME request id, because the
 * cashier changed no basket line, only the price they were shown.
 */
const boundary = vi.hoisted(() => ({
  docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
  getDoc: vi.fn(), setDoc: vi.fn(),
}));
const user = { id: 'operator_1', role: 'branch_staff', branchIds: ['branch_1'] };
vi.mock('@/stores/authStore', () => ({ useAuthStore: Object.assign(() => ({ user }), { getState: () => ({ user }), subscribe: vi.fn(() => () => {}) }) }));
vi.mock('@/stores/appStore', () => ({ useAppStore: Object.assign(() => ({ selectedBranchId: 'branch_1' }), { getState: () => ({ selectedBranchId: 'branch_1' }), subscribe: vi.fn(() => () => {}) }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user, loading: false }) }));
vi.mock('@/config/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'test-token' } }, getAppCheckToken: async () => null }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})), query: vi.fn(() => ({})), where: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ empty: boundary.docs.length === 0, docs: boundary.docs })),
  doc: vi.fn(() => ({ id: 'unused' })), getDoc: boundary.getDoc, setDoc: boundary.setDoc,
  Timestamp: { now: () => ({ seconds: 1, nanoseconds: 0 }) },
}));
import { ManualOrderCreateModal } from '../src/features/orders/components/ManualOrderCreateModal';

// The SERVER's bill for burger(199) + fries(99) at a packaging-charging branch.
const totals = {
  foodSubtotal: 298, packagingFee: 15, deliveryFee: 0, gst: 14.19, cgst: 7.1, sgst: 7.09,
  discount: 0, loyaltyDiscount: 0, grandTotal: 313, pricingDegraded: false,
  split: { courierFeePaise: 0, branchTransferPaise: 31300, totalAmountPaise: 31300 },
};
const receipt = {
  orderId: 'order_1', replayed: false,
  status: { code: 'PLACED', label: 'Order placed', kind: 'upcoming', terminal: false },
  paymentStatus: 'pending', totals, settlementAvailable: false,
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Stands in for `/orders/walkInQuote`: the SERVER prices the posted cart from
 * the fixture catalogue. The modal itself never adds money, so this fixture has
 * to answer per request rather than return one canned total.
 */
function quoteBodyFor(body: any): any {
  const lines = (body?.items ?? []) as Array<{ productId: string; quantity: number }>;
  const priceOf = (id: string) =>
    Number(boundary.docs.find((d) => d.id === id)?.data()?.price) || 0;
  const foodSubtotal = Math.round(lines.reduce((sum, line) => sum + priceOf(line.productId) * line.quantity, 0) * 100) / 100;
  // Dine-in carries no packaging (the one P2 rule); takeaway carries the branch fee.
  const packagingFee = body?.orderType === 'dinein' ? 0 : 15;
  const grandTotal = Math.round((foodSubtotal + packagingFee) * 100) / 100;
  const gst = Math.round((foodSubtotal * 0.05 / 1.05) * 100) / 100;
  const totalAmountPaise = Math.round(grandTotal * 100);
  return {
    branchId: body?.branchId ?? 'branch_1',
    branchName: 'Burgonomics - HL Road',
    totals: {
      foodSubtotal, packagingFee, deliveryFee: 0, gst,
      cgst: Math.round((gst / 2) * 100) / 100, sgst: Math.round((gst / 2) * 100) / 100,
      discount: 0, loyaltyDiscount: 0, grandTotal, pricingDegraded: false,
      split: { courierFeePaise: 0, branchTransferPaise: totalAmountPaise, totalAmountPaise },
    },
  };
}
function quoteFor(body: any): Response {
  return json(quoteBodyFor(body));
}

describe('walk-in modal against transport and Firestore boundaries', () => {
  let root: Root;
  let container: HTMLDivElement;
  let fetchMock: ReturnType<typeof vi.fn>;
  const created = vi.fn();
  const close = vi.fn();

  beforeEach(() => {
    vi.stubEnv('VITE_FUNCTIONS_API_URL', 'https://example.invalid/api');
    boundary.docs = [
      { id: 'burger', data: () => ({ name: 'Test Burger', branchId: 'branch_1', inStock: true, price: 199 }) },
      { id: 'fries', data: () => ({ name: 'Test Fries', branchId: 'branch_1', inStock: true, price: 99 }) },
      { id: 'sold', data: () => ({ name: 'Sold Out', branchId: 'branch_1', inStock: false, price: 50 }) },
    ];
    fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
      String(url).includes('/orders/walkInQuote')
        ? quoteFor(JSON.parse(String(init?.body ?? '{}')))
        : json(receipt, 201));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks();
  });
  async function render() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await act(async () => {
      root.render(<QueryClientProvider client={client}><ManualOrderCreateModal isOpen onClose={close} onOrderCreated={created} /></QueryClientProvider>);
    });
    await vi.waitFor(() => expect(container.textContent).toContain('Test Burger'));
  }
  async function click(text: string) {
    const button = [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text));
    expect(button, `button ${text}`).toBeDefined();
    await act(async () => { button!.click(); });
  }
  async function submit() {
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    await act(async () => { form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  }
  function callsTo(path: string): RequestInit[] {
    return fetchMock.mock.calls.filter(call => String(call[0]).includes(path)).map(call => call[1] as RequestInit);
  }
  const orderCalls = () => callsTo('/orders/createWalkIn');
  const quoteCalls = () => callsTo('/orders/walkInQuote');

  it('shows the server bill (packaging included) and posts that exact total', async () => {
    await render();
    const unavailable = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Sold Out'));
    expect(unavailable?.disabled).toBe(true);
    expect(container.textContent).toMatch(/out of stock|unavailable/i);
    await click('Test Burger'); await click('Test Fries');
    // The bill on screen is the server's, packaging included — F4's whole point.
    await vi.waitFor(() => expect(container.textContent).toContain('Total ₹313'));
    expect(container.textContent).toContain('Subtotal ₹298');
    expect(container.textContent).toContain('Store Packaging ₹15');
    expect(container.textContent).toContain('GST (5%, included) ₹14.19');
    // The final quote is the one for the full cart (each add re-quotes).
    const quoteBody = JSON.parse(String(quoteCalls().at(-1)!.body));
    expect(quoteBody.branchId).toBe('branch_1');
    expect(quoteBody.orderType).toBe('takeaway');
    expect(quoteBody.items).toEqual([{ productId: 'burger', quantity: 1 }, { productId: 'fries', quantity: 1 }]);
    expect(quoteBody).not.toHaveProperty('expectedTotalPaise');
    expect(quoteBody).not.toHaveProperty('requestId');
    await submit();
    await vi.waitFor(() => expect(orderCalls()).toHaveLength(1));
    const call = orderCalls()[0];
    const body = JSON.parse(String(call.body));
    expect(body).toEqual({
      requestId: expect.any(String), branchId: 'branch_1', orderType: 'takeaway', tender: 'cash',
      items: [{ productId: 'burger', quantity: 1 }, { productId: 'fries', quantity: 1 }],
      expectedTotalPaise: 31300, customerName: 'Walk-in Customer',
    });
    expect(new Headers(call.headers).get('X-Idempotency-Key')).toBe(body.requestId);
    expect(boundary.getDoc).not.toHaveBeenCalled();
    expect(boundary.setDoc).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(created).toHaveBeenCalledOnce());
    expect(created.mock.calls[0][0]).toMatchObject({ paymentStatus: 'pending' });
  });

  it('never fetches a separate packaging fee: the quote is the only money call', async () => {
    await render();
    await click('Test Burger');
    await vi.waitFor(() => expect(quoteCalls()).toHaveLength(1));
    expect(callsTo('/checkout/fees')).toHaveLength(0);
  });

  it('blocks the order until the server has priced the cart', async () => {
    let release!: (value: Response) => void;
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes('/orders/walkInQuote')) {
        return new Promise<Response>((resolve) => { release = resolve; });
      }
      return json(receipt, 201);
    });
    await render();
    await click('Test Burger');
    const submitButton = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submitButton.disabled).toBe(true);
    expect(container.textContent).toContain('pricing on the server');
    await act(async () => {
      release(json({
        ...quoteFor({ items: [{ productId: 'burger', quantity: 1 }], orderType: 'takeaway' }),
        totals: {
          ...totals, foodSubtotal: 199, packagingFee: 15, gst: 9.48, grandTotal: 214,
          split: { ...totals.split, totalAmountPaise: 21400, branchTransferPaise: 21400 },
        },
      }));
    });
    await vi.waitFor(() => expect(submitButton.disabled).toBe(false));
    expect(container.textContent).toContain('Total ₹214');
    // Never submit a guessed total while the server bill is unknown.
    expect(orderCalls()).toHaveLength(0);
  });

  it('requires reconfirmation after PRICE_CHANGED, keeps the request id, and confirms the server total', async () => {
    const changed = { ...totals, grandTotal: 330, split: { ...totals.split, totalAmountPaise: 33000, branchTransferPaise: 33000 } };
    fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('/orders/walkInQuote')) return quoteFor(JSON.parse(String(init?.body ?? '{}')));
      return orderCalls().length === 1
        ? json({ code: 'PRICE_CHANGED', error: 'Price changed', totals: changed }, 409)
        : json({ ...receipt, totals: changed }, 201);
    });
    await render();
    await click('Test Burger'); await click('Test Fries');
    await vi.waitFor(() => expect(container.textContent).toContain('Total ₹313'));
    await submit();
    await vi.waitFor(() => expect(container.textContent).toContain('Server total is ₹330'));
    expect(close).not.toHaveBeenCalled();
    expect(orderCalls()).toHaveLength(1);
    await submit();
    await vi.waitFor(() => expect(created).toHaveBeenCalledOnce());
    expect(orderCalls()).toHaveLength(2);
    const first = JSON.parse(String(orderCalls()[0].body));
    const second = JSON.parse(String(orderCalls()[1].body));
    expect(second.expectedTotalPaise).toBe(33000);
    // F5: the cart did not change, so this is the SAME order under the same id.
    // Rotating the id would book the same cart twice if the first response was
    // merely lost in transit.
    expect(second.requestId).toBe(first.requestId);
  });

  it('shows the server payable total and calculates change from it before reconfirming', async () => {
    const changed = { ...totals, grandTotal: 330, split: { ...totals.split, totalAmountPaise: 33000, branchTransferPaise: 33000 } };
    fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('/orders/walkInQuote')) return quoteFor(JSON.parse(String(init?.body ?? '{}')));
      return orderCalls().length === 1
        ? json({ code: 'PRICE_CHANGED', error: 'Price changed', totals: changed }, 409)
        : json({ ...receipt, totals: changed }, 201);
    });
    await render();
    await click('Test Burger'); await click('Test Fries');
    await vi.waitFor(() => expect(container.textContent).toContain('Total ₹313'));
    await submit();
    await vi.waitFor(() => expect(container.textContent).toContain('Server total is ₹330'));
    const cash = container.querySelector<HTMLInputElement>('input[type="number"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(cash, '500');
      cash.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.textContent).toContain('Change: ₹170.00');
    expect(container.querySelector('button[type="submit"]')?.textContent).toContain('₹330');
    await submit();
    expect(JSON.parse(String(orderCalls()[1].body)).expectedTotalPaise).toBe(33000);
  });

  it('drops the authoritative total after a basket edit', async () => {
    const changed = { ...totals, grandTotal: 330, split: { ...totals.split, totalAmountPaise: 33000 } };
    fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('/orders/walkInQuote')) return quoteFor(JSON.parse(String(init?.body ?? '{}')));
      return json({ code: 'PRICE_CHANGED', error: 'Price changed', totals: changed }, 409);
    });
    await render();
    await click('Test Burger'); await click('Test Fries');
    await vi.waitFor(() => expect(container.textContent).toContain('Total ₹313'));
    await submit();
    await vi.waitFor(() => expect(container.textContent).toContain('Server total is ₹330'));
    await click('Test Fries');
    expect(container.textContent).not.toContain('Server total is ₹330');
  });

  it('displays the server total verbatim — no client rounding or client GST', async () => {
    // The price the old client formula rounded by hand (1.005 food, 16 total).
    boundary.docs = [{ id: 'burger', data: () => ({ name: 'Test Burger', branchId: 'branch_1', inStock: true, price: 1.005 }) }];
    const odd = {
      ...totals, foodSubtotal: 1, packagingFee: 15, gst: 0.05, cgst: 0.03, sgst: 0.02, grandTotal: 16,
      split: { ...totals.split, totalAmountPaise: 1600, branchTransferPaise: 1600 },
    };
    fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => String(url).includes('/orders/walkInQuote')
      ? json({
          ...quoteBodyFor(JSON.parse(String(init?.body ?? '{}'))),
          totals: odd,
        })
      : json({ ...receipt, totals: odd }, 201));
    await render();
    await click('Test Burger');
    await vi.waitFor(() => expect(container.textContent).toContain('Total ₹16'));
    expect(container.textContent).toContain('Subtotal ₹1');
    await submit();
    await vi.waitFor(() => expect(orderCalls()).toHaveLength(1));
    expect(JSON.parse(String(orderCalls()[0].body)).expectedTotalPaise).toBe(1600);
  });

  it('reuses the request id after transport failure on an identical retry', async () => {
    fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('/orders/walkInQuote')) return quoteFor(JSON.parse(String(init?.body ?? '{}')));
      if (orderCalls().length <= 2) throw new TypeError('network down');
      return json(receipt, 201);
    });
    await render();
    await click('Test Burger');
    await vi.waitFor(() => expect(container.textContent).toContain('Total ₹214'));
    await submit();
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(close).not.toHaveBeenCalled();
    expect(orderCalls().length).toBeGreaterThan(0);
    await submit();
    await vi.waitFor(() => expect(created).toHaveBeenCalledOnce());
    const ids = orderCalls().map(call => JSON.parse(String(call.body)).requestId);
    expect(new Set(ids).size).toBe(1);
  });

  it('rotates the request id after the basket changes following a failure', async () => {
    fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('/orders/walkInQuote')) return quoteFor(JSON.parse(String(init?.body ?? '{}')));
      // apiRequest retries once, so two transport attempts fail before either
      // the failure surfaces or the next submit is allowed through.
      if (orderCalls().length <= 2) throw new TypeError('network down');
      return json(receipt, 201);
    });
    await render();
    await click('Test Burger');
    await vi.waitFor(() => expect(container.textContent).toContain('Total ₹214'));
    await submit();
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    const firstId = JSON.parse(String(orderCalls()[0].body)).requestId;
    await click('Test Fries');
    await submit();
    await vi.waitFor(() => expect(created).toHaveBeenCalledOnce());
    const lastId = JSON.parse(String(orderCalls().at(-1)!.body)).requestId;
    expect(lastId).not.toBe(firstId);
  });

  it('shows the quote failure instead of inventing a total, and can retry', async () => {
    fetchMock.mockImplementation(async (url: string | URL | Request) => String(url).includes('/orders/walkInQuote')
      ? json({ code: 'ITEM_UNAVAILABLE', error: 'An item is unavailable or cannot be verified.' }, 503)
      : json(receipt, 201));
    await render();
    await click('Test Burger');
    await vi.waitFor(() => expect(container.textContent).toContain('An item is unavailable or cannot be verified.'));
    expect(container.querySelector('button[type="submit"]')).toHaveProperty('disabled', true);
    // No invented total anywhere while the server has not priced the cart.
    expect(container.textContent).not.toContain('Total ₹');
    const retry = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Retry bill'));
    expect(retry).toBeDefined();
    fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => String(url).includes('/orders/walkInQuote')
      ? quoteFor(JSON.parse(String(init?.body ?? '{}')))
      : json(receipt, 201));
    await act(async () => { retry!.click(); });
    await vi.waitFor(() => expect(container.textContent).toContain('Total ₹214'));
  });

  it('renders no demo menu or delivery option when the catalog is empty', async () => {
    boundary.docs = [];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(<QueryClientProvider client={client}><ManualOrderCreateModal isOpen onClose={close} /></QueryClientProvider>);
    });
    expect(container.textContent).not.toMatch(/Paneer Makhani|Peri-Peri Crinkle|Delivery/i);
    expect(container.querySelectorAll('button[type="submit"]')[0]).toHaveProperty('disabled', true);
  });
});
