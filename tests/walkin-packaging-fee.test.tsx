// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CHANGED FOR F4 (staging 2026-11-21, Test 7).
 *
 * This file used to pin the walk-in modal's SEPARATELY FETCHED packaging fee:
 * it mocked `/checkout/fees` returning `{packagingFee: 20}` and asserted the
 * modal added that to its own food+GST arithmetic (₹298 + ₹20 = ₹318) while
 * never showing the hard-coded ₹15/₹313.
 *
 * That mechanism is exactly what broke staging: the till computed the bill and
 * confirmed its own number, so HL Road's ₹15 packaging went missing from the
 * preview while the booking charged it. There is now ONE server quote
 * (`/orders/walkInQuote`), priced by the same builder the create route uses.
 * The assertions below therefore pin the SERVER bill: the modal must not fetch
 * a separate packaging fee, must not add up money itself, must show the quote's
 * total (packaging included), must block while the quote is unknown, and must
 * surface a quote failure with a retry instead of inventing a number.
 */
const user = { id: 'operator', role: 'branch_staff', branchIds: ['branch_1'] };
vi.mock('@/stores/authStore', () => ({ useAuthStore: Object.assign(() => ({ user }), { getState: () => ({ user }), subscribe: vi.fn(() => () => {}) }) }));
vi.mock('@/stores/appStore', () => ({ useAppStore: Object.assign(() => ({ selectedBranchId: 'branch_1' }), { getState: () => ({ selectedBranchId: 'branch_1' }), subscribe: vi.fn(() => () => {}) }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user, loading: false }) }));
vi.mock('@/config/firebase', () => ({ db: {}, auth: { currentUser: null }, getAppCheckToken: async () => null }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})), query: vi.fn(() => ({})), where: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ empty: false, docs: [
    { id: 'burger', data: () => ({ name: 'Test Burger', branchId: 'branch_1', inStock: true, price: 199 }) },
    { id: 'fries', data: () => ({ name: 'Test Fries', branchId: 'branch_1', inStock: true, price: 99 }) },
  ] })),
  doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), Timestamp: { now: () => ({}) },
}));
import { ManualOrderCreateModal } from '@/features/orders/components/ManualOrderCreateModal';

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

/** The SERVER's bill for burger(199) + fries(99) at a branch charging ₹20 packaging. */
const serverQuote = (packagingFee: number) => {
  const foodSubtotal = 298;
  const grandTotal = foodSubtotal + packagingFee;
  const totalAmountPaise = grandTotal * 100;
  return {
    branchId: 'branch_1',
    branchName: 'Burgonomics - HL Road',
    totals: {
      foodSubtotal, packagingFee, deliveryFee: 0, gst: 14.19, cgst: 7.1, sgst: 7.09,
      discount: 0, loyaltyDiscount: 0, grandTotal, pricingDegraded: false,
      split: { courierFeePaise: 0, branchTransferPaise: totalAmountPaise, totalAmountPaise },
    },
  };
};

describe('server-owned walk-in bill (F4)', () => {
  let root: Root;
  let container: HTMLDivElement;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv('VITE_FUNCTIONS_API_URL', 'https://example.invalid/api');
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    fetchMock = vi.fn(async () => json(serverQuote(20)));
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  async function render() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><ManualOrderCreateModal isOpen onClose={vi.fn()} /></QueryClientProvider>); });
    await vi.waitFor(() => expect(container.textContent).toContain('Test Burger'));
    for (const name of ['Test Burger', 'Test Fries']) {
      const button = [...container.querySelectorAll('button')].find(item => item.textContent?.includes(name));
      await act(async () => { button!.click(); });
    }
  }
  const submit = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!;

  it('shows the server total, packaging included, instead of its own arithmetic', async () => {
    await render();
    await vi.waitFor(() => expect(container.textContent).toContain('Total ₹318'));
    expect(container.textContent).toContain('Store Packaging ₹20');
    expect(container.textContent).toContain('Subtotal ₹298');
    // The old hard-coded ₹15 bill (₹313) must never appear.
    expect(container.textContent).not.toContain('₹313');
    // A single money call: the quote. No separate packaging-fee endpoint.
    const urls = fetchMock.mock.calls.map(call => String(call[0]));
    expect(urls.every(url => url.includes('/orders/walkInQuote'))).toBe(true);
    expect(urls.some(url => url.includes('/checkout/fees'))).toBe(false);
    expect(submit().disabled).toBe(false);
  });

  it('disables create while the server bill is unknown and does not guess a total', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    await render();
    expect(container.textContent).toContain('pricing on the server');
    expect(container.textContent).not.toContain('₹318');
    expect(container.textContent).not.toContain('₹313');
    expect(submit().disabled).toBe(true);
    // Nothing may be submitted while the bill is unknown.
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(fetchMock.mock.calls.filter(call => String(call[0]).includes('/orders/createWalkIn'))).toHaveLength(0);
  });

  it('shows the bill error, keeps create disabled without a guessed total, and offers retry', async () => {
    fetchMock.mockImplementation(async () => json({ code: 'ITEM_UNAVAILABLE', error: 'server down' }, 503));
    await render();
    await vi.waitFor(() => expect(container.textContent).toContain('server down'));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(submit().disabled).toBe(true);
    expect(container.textContent).not.toContain('₹313');
    const retry = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Retry bill'));
    expect(retry).toBeDefined();
    fetchMock.mockImplementation(async () => json(serverQuote(20)));
    await act(async () => { retry!.click(); });
    await vi.waitFor(() => expect(container.textContent).toContain('Total ₹318'));
    expect(submit().disabled).toBe(false);
  });

  it('offers only cash and no delivery option', async () => {
    await render();
    expect(container.textContent).toContain('Cash');
    expect([...container.querySelectorAll('button')].some(button => /delivery|upi|card/i.test(button.textContent ?? ''))).toBe(false);
  });
});
