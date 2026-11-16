// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const user = { id: 'operator_1', role: 'branch_staff', branchIds: ['branch_1'] };
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
import { ManualOrderCreateModal } from '../src/features/orders/components/ManualOrderCreateModal';

describe('walk-in cash tender and pending payment truth', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onCreated = vi.fn();
  const fetchMock = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(
    String(url).includes('/checkout/fees') ? { packagingFee: 15 } : {
      orderId: 'order_1', replayed: false, paymentStatus: 'pending', settlementAvailable: false,
      status: { code: 'PLACED', label: 'Order placed', kind: 'upcoming', terminal: false },
      totals: { foodSubtotal: 298, packagingFee: 15, deliveryFee: 0, gst: 14.19, cgst: 7.10, sgst: 7.09, discount: 0, loyaltyDiscount: 0, grandTotal: 313, pricingDegraded: false, split: { courierFeePaise: 0, branchTransferPaise: 31300, totalAmountPaise: 31300 } },
    },
  ), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  beforeEach(async () => {
    vi.stubEnv('VITE_FUNCTIONS_API_URL', 'https://example.invalid/api');
    vi.stubGlobal('fetch', fetchMock); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={client}><ManualOrderCreateModal isOpen onClose={vi.fn()} onOrderCreated={onCreated} /></QueryClientProvider>); });
    await vi.waitFor(() => expect(container.textContent).toContain('Test Burger'));
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
  async function add(name: string) {
    const button = [...container.querySelectorAll('button')].find(element => element.textContent?.includes(name));
    expect(button).toBeDefined(); await act(async () => { button!.click(); });
  }

  it('offers cash only and does not offer UPI or card tender', () => {
    const buttons = [...container.querySelectorAll('button')].map(button => button.textContent ?? '');
    expect(container.textContent).toMatch(/cash/i);
    expect(buttons.some(text => /upi|card/i.test(text))).toBe(false);
    expect(container.textContent).toMatch(/payment pending/i);
    expect(container.textContent).not.toMatch(/KOT (printed|dispatched)/i);
  });

  it('creates a pending cash order through the API and preserves inclusive GST', async () => {
    await add('Test Burger'); await add('Test Fries');
    expect(container.textContent).toContain('GST (5%, included)');
    expect(container.textContent).toContain('₹14.19');
    expect(container.textContent).toContain('₹313');
    expect(container.textContent).not.toContain('₹328');
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    const orderCall = fetchMock.mock.calls.find(call => String(call[0]).includes('/orders/createWalkIn'));
    expect(orderCall).toBeDefined();
    expect(onCreated.mock.calls[0][0]).toMatchObject({ paymentStatus: 'pending' });
  });
});
