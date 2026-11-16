// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const totals = { foodSubtotal: 298, packagingFee: 15, deliveryFee: 0, gst: 14.19, cgst: 7.10, sgst: 7.09, discount: 0, loyaltyDiscount: 0, grandTotal: 313, pricingDegraded: false, split: { courierFeePaise: 0, branchTransferPaise: 31300, totalAmountPaise: 31300 } };
const receipt = { orderId: 'order_1', replayed: false, status: { code: 'PLACED', label: 'Order placed', kind: 'upcoming', terminal: false }, paymentStatus: 'pending', totals, settlementAvailable: false };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

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
    fetchMock = vi.fn(async (url: string | URL | Request) => String(url).includes('/checkout/fees') ? json({ packagingFee: 15 }) : json(receipt, 201));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove();
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks();
  });
  async function render() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><ManualOrderCreateModal isOpen onClose={close} onOrderCreated={created} /></QueryClientProvider>); });
    await vi.waitFor(() => expect(container.textContent).toContain('Test Burger'));
  }
  async function click(text: string) {
    const button = [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text));
    expect(button, `button ${text}`).toBeDefined();
    await act(async () => { button!.click(); });
  }
  async function submit() {
    const form = container.querySelector('form'); expect(form).not.toBeNull();
    await act(async () => { form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  }
  function orderCalls(): RequestInit[] {
    return fetchMock.mock.calls.filter(call => String(call[0]).includes('/orders/createWalkIn')).map(call => call[1] as RequestInit);
  }

  it('sends only contract fields and idempotency header, never writes Firestore', async () => {
    await render();
    const unavailable = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Sold Out'));
    expect(unavailable?.disabled).toBe(true);
    expect(container.textContent).toMatch(/out of stock|unavailable/i);
    await click('Test Burger'); await click('Test Fries');
    expect(container.textContent).toContain('₹14.19');
    expect(container.textContent).toContain('₹313');
    expect(container.textContent).not.toContain('₹328');
    await submit();
    await vi.waitFor(() => expect(orderCalls()).toHaveLength(1));
    const call = orderCalls()[0];
    const body = JSON.parse(String(call.body));
    expect(body).toEqual({ requestId: expect.any(String), branchId: 'branch_1', orderType: 'takeaway', tender: 'cash', items: [{ productId: 'burger', quantity: 1 }, { productId: 'fries', quantity: 1 }], expectedTotalPaise: 31300, customerName: 'Walk-in Customer' });
    expect(new Headers(call.headers).get('X-Idempotency-Key')).toBe(body.requestId);
    expect(boundary.getDoc).not.toHaveBeenCalled(); expect(boundary.setDoc).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(created).toHaveBeenCalledOnce());
    expect(created.mock.calls[0][0]).toMatchObject({ paymentStatus: 'pending' });
  });

  it('requires reconfirmation after PRICE_CHANGED and submits server paise under a fresh id', async () => {
    const changed = { ...totals, grandTotal: 330, split: { ...totals.split, totalAmountPaise: 33000, branchTransferPaise: 33000 } };
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes('/checkout/fees')) return json({ packagingFee: 15 });
      return orderCalls().length === 1 ? json({ code: 'PRICE_CHANGED', error: 'Price changed', totals: changed }, 409) : json({ ...receipt, totals: changed }, 201);
    });
    await render(); await click('Test Burger'); await click('Test Fries'); await submit();
    await vi.waitFor(() => expect(container.textContent).toContain('330'));
    expect(close).not.toHaveBeenCalled(); expect(orderCalls()).toHaveLength(1);
    await submit(); await vi.waitFor(() => expect(orderCalls()).toHaveLength(2));
    const first = JSON.parse(String(orderCalls()[0].body)); const second = JSON.parse(String(orderCalls()[1].body));
    expect(second.expectedTotalPaise).toBe(33000); expect(second.requestId).not.toBe(first.requestId);
  });

  it('shows the server payable total and calculates change from it before reconfirming', async () => {
    const changed = { ...totals, grandTotal: 330, split: { ...totals.split, totalAmountPaise: 33000, branchTransferPaise: 33000 } };
    fetchMock.mockImplementation(async (url: string | URL | Request) => String(url).includes('/checkout/fees')
      ? json({ packagingFee: 15 })
      : orderCalls().length === 1 ? json({ code: 'PRICE_CHANGED', error: 'Price changed', totals: changed }, 409) : json({ ...receipt, totals: changed }, 201));
    await render(); await click('Test Burger'); await click('Test Fries'); await submit();
    await vi.waitFor(() => expect(container.textContent).toContain('Server total is ₹330'));
    const cash = container.querySelector<HTMLInputElement>('input[type="number"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(cash, '500');
      cash.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.textContent).toContain('Total ₹330');
    expect(container.textContent).toContain('Change: ₹170.00');
    expect(container.querySelector('button[type="submit"]')?.textContent).toContain('₹330');
    await submit();
    expect(JSON.parse(String(orderCalls()[1].body)).expectedTotalPaise).toBe(33000);
  });

  it('drops the authoritative total after a basket edit', async () => {
    const changed = { ...totals, grandTotal: 330, split: { ...totals.split, totalAmountPaise: 33000 } };
    fetchMock.mockImplementation(async (url: string | URL | Request) => String(url).includes('/checkout/fees')
      ? json({ packagingFee: 15 }) : json({ code: 'PRICE_CHANGED', error: 'Price changed', totals: changed }, 409));
    await render(); await click('Test Burger'); await click('Test Fries'); await submit();
    await vi.waitFor(() => expect(container.textContent).toContain('Server total is ₹330'));
    await click('Test Fries');
    expect(container.textContent).not.toContain('Server total is ₹330');
    expect(container.textContent).toContain('Total ₹412');
  });

  it('rounds food before packaging in the preview and transport total', async () => {
    boundary.docs = [{ id: 'burger', data: () => ({ name: 'Test Burger', branchId: 'branch_1', inStock: true, price: 1.005 }) }];
    await render(); await click('Test Burger');
    expect(container.textContent).toContain('Subtotal ₹1');
    expect(container.textContent).toContain('Total ₹16');
    expect(container.textContent).not.toContain('Total ₹16.01');
    await submit();
    expect(JSON.parse(String(orderCalls()[0].body)).expectedTotalPaise).toBe(1600);
  });

  it('reuses the request id after transport failure on an identical retry', async () => {
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes('/checkout/fees')) return json({ packagingFee: 15 });
      if (orderCalls().length <= 2) throw new TypeError('network down');
      return json(receipt, 201);
    });
    await render(); await click('Test Burger'); await submit();
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(close).not.toHaveBeenCalled();
    const failed = orderCalls(); expect(failed.length).toBeGreaterThan(0);
    await submit(); await vi.waitFor(() => expect(created).toHaveBeenCalledOnce());
    const ids = orderCalls().map(call => JSON.parse(String(call.body)).requestId);
    expect(new Set(ids).size).toBe(1);
  });

  it('rotates the request id after the payload changes following a failure', async () => {
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes('/checkout/fees')) return json({ packagingFee: 15 });
      if (orderCalls().length <= 2) throw new TypeError('network down');
      return json(receipt, 201);
    });
    await render(); await click('Test Burger'); await submit();
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    const firstId = JSON.parse(String(orderCalls()[0].body)).requestId;
    await click('Test Fries'); await submit();
    await vi.waitFor(() => expect(created).toHaveBeenCalledOnce());
    const lastId = JSON.parse(String(orderCalls().at(-1)!.body)).requestId;
    expect(lastId).not.toBe(firstId);
  });

  it('renders no demo menu or delivery option when the catalog is empty', async () => {
    boundary.docs = [];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><ManualOrderCreateModal isOpen onClose={close} /></QueryClientProvider>); });
    expect(container.textContent).not.toMatch(/Paneer Makhani|Peri-Peri Crinkle|Delivery/i);
    expect(container.querySelectorAll('button[type="submit"]')[0]).toHaveProperty('disabled', true);
  });
});
