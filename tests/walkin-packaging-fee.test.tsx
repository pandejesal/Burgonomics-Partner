// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('server-owned walk-in packaging fee', () => {
  let root: Root;
  let container: HTMLDivElement;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv('VITE_FUNCTIONS_API_URL', 'https://example.invalid/api');
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ packagingFee: 20 }), { status: 200 }));
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

  it('uses the server fee instead of a hard-coded 15', async () => {
    await render();
    await vi.waitFor(() => expect(container.textContent).toContain('₹318'));
    expect(container.textContent).toContain('₹20');
    expect(container.textContent).not.toContain('₹313');
  });
  it('disables create while the fee loads and does not guess a fee', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    await render();
    expect(container.textContent).toContain('Loading from server');
    expect(container.textContent).not.toContain('₹318');
    expect(container.textContent).not.toContain('₹313');
    expect(submit().disabled).toBe(true);
  });
  it('shows the fee error, keeps create disabled without a guessed fee, and offers retry', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'server down' }), { status: 500 }));
    await render();
    await vi.waitFor(() => expect(container.textContent).toContain('Could not load the packaging fee'));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(submit().disabled).toBe(true);
    expect(container.textContent).not.toContain('₹313');
    const retry = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Retry packaging fee'));
    expect(retry).toBeDefined();
    await act(async () => { retry!.click(); });
    await vi.waitFor(() => expect(container.textContent).toContain('₹318'));
    expect(submit().disabled).toBe(false);
  });
  it('offers only cash and no delivery option', async () => {
    await render();
    expect(container.textContent).toContain('Cash');
    expect([...container.querySelectorAll('button')].some(button => /delivery|upi|card/i.test(button.textContent ?? ''))).toBe(false);
  });
});
