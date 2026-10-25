import React, { type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '../src/types';
import { QueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { useBranchMenu } from '../src/features/menu/hooks/useBranchMenu';

// This repo has neither jsdom nor Testing Library. Exercise page handlers and
// render their resulting JSX with React's server renderer, without a new dep.
const harness = vi.hoisted(() => ({
  states: [] as unknown[], cursor: 0,
  toggle: vi.fn(), sync: vi.fn(), mark86: vi.fn(),
  actualHook: false, queryClient: undefined as QueryClient | undefined,
  updateDoc: vi.fn(), pushStock: vi.fn(), errorToast: vi.fn(), warningToast: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => { harness.states[index] = value; }];
  },
}));
const item: MenuItem = {
  id: 'burger', name: 'Burger', description: '', price: 100,
  categoryId: 'burgers', isVeg: true, isAvailable: false, inStock: false,
};
vi.mock('@/features/menu/hooks/useBranchMenu', async (original) => {
  const actual = await original<typeof import('../src/features/menu/hooks/useBranchMenu')>();
  return { useBranchMenu: () => harness.actualHook ? actual.useBranchMenu() : ({
    items: [item], categories: [], isLoading: false,
    toggleAvailability: { mutateAsync: harness.toggle },
    syncPetpooja: { mutateAsync: harness.sync },
    markItem86: { mutateAsync: harness.mark86 },
    createComboMeal: {},
  }) };
});
// Run real React Query mutation lifecycles without a DOM renderer. Only the
// React bindings are replaced; MutationObserver owns ordering and rejection.
vi.mock('@tanstack/react-query', async (original) => {
  const actual = await original<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => harness.queryClient!,
    useMutation: <Data, Variables, Context,>(options: UseMutationOptions<Data, Error, Variables, Context>) => {
      const observer = new actual.MutationObserver(harness.queryClient!, options);
      return { mutateAsync: observer.mutate.bind(observer) };
    },
  };
});
vi.mock('@/hooks/useMenu', () => ({ useMenu: () => ({
  items: [item], categories: [], isLoading: false,
  syncPetpooja: { mutateAsync: harness.sync },
}) }));
vi.mock('@/stores/appStore', () => ({ useAppStore: () => ({ selectedBranchId: 'branch' }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { branchIds: ['branch'] } }) }));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'product-ref'), updateDoc: harness.updateDoc,
  Timestamp: { now: () => 'now' },
}));
vi.mock('@/services/partnerFunctionsApi', () => ({ partnerFunctionsApi: { toggle86Item: harness.pushStock } }));
vi.mock('sonner', () => ({ toast: { error: harness.errorToast, warning: harness.warningToast } }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: { role: 'brand_owner' } }) }));
vi.mock('@/admin/dashboard/hooks/useDashboardData', () => ({ useSyncHealth: () => ({}) }));
vi.mock('@/features/menu/components/MenuItemToggleRow', () => ({ MenuItemToggleRow: () => null }));
vi.mock('@/features/menu/components/Instant86ingModal', () => ({ Instant86ingModal: () => null }));
vi.mock('@/features/menu/components/ComboBuilderDrawer', () => ({ ComboBuilderDrawer: () => null }));
import { MenuPage } from '../src/pages/MenuPage';
import { MenuItemToggleRow } from '../src/features/menu/components/MenuItemToggleRow';
import { Instant86ingModal } from '../src/features/menu/components/Instant86ingModal';

function page() {
  harness.cursor = 0;
  return MenuPage();
}
function findElement(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement<Record<string, unknown>>(child)) continue;
    if (predicate(child)) return child;
    const found = findElement(child.props.children as ReactNode, predicate);
    if (found) return found;
  }
}
async function enable() {
  const row = findElement(page(), element => element.type === MenuItemToggleRow);
  await (row!.props.onToggleStock as (value: MenuItem) => Promise<void>)(item);
  return renderToStaticMarkup(page());
}

describe('menu feedback', () => {
  beforeEach(() => {
    harness.states = [];
    harness.actualHook = false;
    harness.queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
    vi.clearAllMocks();
    harness.updateDoc.mockReset();
    harness.pushStock.mockReset();
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { harness.queryClient?.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('announces confirmed app + POS success with success tokens/icon', async () => {
    harness.toggle.mockResolvedValue({ posStatus: 'synced' });
    const html = await enable();
    expect(harness.toggle).toHaveBeenCalledWith({ itemId: 'burger', isAvailable: true, notifyError: false });
    expect(html).toContain('Burger is now back IN STOCK on customer app &amp; POS');
    expect(html).toContain('role="status"');
    expect(html).toContain('border-success');
    expect(html).toContain('text-success');
    expect(html).toContain('lucide-circle-check');
  });

  it('announces skipped POS as app-only, without success styling', async () => {
    harness.toggle.mockResolvedValue({ posStatus: 'skipped' });
    const html = await enable();
    expect(html).toContain('Burger is now back IN STOCK on customer app only — POS sync skipped.');
    expect(html).toContain('role="status"');
    expect(html).toContain('border-warning');
    expect(html).toContain('text-warning');
    expect(html).not.toContain('border-success');
  });

  it('leaves failed POS feedback to the hook warning, clearing earlier local success', async () => {
    harness.toggle.mockResolvedValueOnce({ posStatus: 'synced' });
    expect(await enable()).toContain('border-success');
    harness.toggle.mockResolvedValueOnce({ posStatus: 'failed' });
    const html = await enable();
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('border-success');
    expect(html).not.toContain('IN STOCK on customer app');
  });

  it('announces rejected app writes as errors, never success', async () => {
    harness.toggle.mockRejectedValue(new Error('permission denied'));
    const html = await enable();
    expect(html).toContain('Could not re-enable Burger — no changes were made.');
    expect(html).toContain('role="alert"');
    expect(html).toContain('border-error');
    expect(html).toContain('text-error');
    expect(html).not.toContain('border-success');
    expect(html).not.toContain('IN STOCK on customer app');
    expect(html).not.toContain('permission denied');
  });

  it('announces manual sync rejection as an error', async () => {
    harness.sync.mockRejectedValue(new Error('offline'));
    const button = findElement(page(), element => element.type === 'button' && typeof element.props.onClick === 'function' && renderToStaticMarkup(element).includes('Sync POS'));
    await (button!.props.onClick as () => Promise<void>)();
    const html = renderToStaticMarkup(page());
    expect(html).toContain('role="alert"');
    expect(html).toContain('border-error');
    expect(html).not.toContain('border-success');
  });

  it('rolls back a real rejected re-enable write and produces exactly one page error', async () => {
    harness.actualHook = true;
    const previous = [item];
    const cache = harness.queryClient!;
    cache.setQueryData(['menuItems', 'branch'], previous);
    harness.updateDoc.mockImplementationOnce(async () => {
      expect(cache.getQueryData<MenuItem[]>(['menuItems', 'branch'])?.[0]).toMatchObject({ inStock: true, isAvailable: true });
      throw new Error('permission denied');
    });

    const html = await enable();

    expect(harness.updateDoc).toHaveBeenCalledOnce();
    expect(cache.getQueryData(['menuItems', 'branch'])).toEqual(previous);
    expect(harness.errorToast).not.toHaveBeenCalled();
    expect((html.match(/role="alert"/g) ?? []).length + harness.errorToast.mock.calls.length).toBe(1);
    expect(harness.warningToast).not.toHaveBeenCalled();
    expect(html).toContain('Could not re-enable Burger — no changes were made.');
    expect(html).toContain('border-error');
    expect(html).toContain('text-error');
    expect(html).not.toContain('border-success');
    expect(html).not.toContain('lucide-circle-check');
  });

  it('defaults other real hook callers to an error toast and still rolls back', async () => {
    harness.actualHook = true;
    harness.queryClient!.setQueryData(['menuItems', 'branch'], [item]);
    harness.updateDoc.mockRejectedValueOnce(new Error('permission denied'));

    await expect(useBranchMenu().toggleAvailability.mutateAsync({ itemId: item.id, isAvailable: true })).rejects.toThrow('permission denied');

    expect(harness.queryClient!.getQueryData(['menuItems', 'branch'])).toEqual([item]);
    expect(harness.errorToast).toHaveBeenCalledExactlyOnceWith('Could not update item stock', { description: 'permission denied' });
  });

  it('keeps a real POS failure to exactly one warning and no page success', async () => {
    harness.actualHook = true;
    item.petpoojaItemId = 'pos-burger';
    harness.updateDoc.mockResolvedValueOnce(undefined);
    harness.pushStock.mockRejectedValueOnce(new Error('POS offline'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const html = await enable();
      expect(harness.warningToast).toHaveBeenCalledExactlyOnceWith('Item updated in app — Petpooja POS sync failed.', {
        description: 'The POS may still show the old stock state. Toggle again to re-push.',
      });
      expect(harness.errorToast).not.toHaveBeenCalled();
      expect(html).not.toContain('role="alert"');
      expect(html).not.toContain('role="status"');
      expect(html).not.toContain('border-success');
    } finally {
      delete item.petpoojaItemId;
      warning.mockRestore();
    }
  });

  it('restores EVERY availability flag the readers consume (F4 legacy available:false)', async () => {
    harness.actualHook = true;
    // A legacy doc: 86'd by inStock and by the older `available` flag. Writing
    // only inStock left isAvailable/available false, so the item stayed sold
    // out after a "restore".
    const legacy = { ...item, inStock: false, isAvailable: false, available: false };
    harness.queryClient!.setQueryData(['menuItems', 'branch'], [legacy]);
    harness.updateDoc.mockResolvedValueOnce(undefined);

    await expect(
      useBranchMenu().toggleAvailability.mutateAsync({ itemId: legacy.id, available: true }),
    ).resolves.toMatchObject({ available: true });

    expect(harness.updateDoc).toHaveBeenCalledWith(
      'product-ref',
      expect.objectContaining({
        inStock: true,
        isAvailable: true,
        available: true,
        disabledUntil: null,
        eightSixDuration: null,
        eightSixReason: null,
      }),
    );

    // The reader that gates the 86 drawer now agrees: sellable.
    const { isItemInStock } = await import('../src/features/kds/components/KDSQuick86Drawer');
    expect(
      isItemInStock({
        ...legacy,
        inStock: true,
        isAvailable: true,
        available: true,
      }),
    ).toBe(true);
  });

  it('announces a rejected real 86 write with exactly ONE error, not two', async () => {
    // The old case set actualHook=false (mocked mutateAsync), so the hook's
    // onError could never fire — it could not see the duplicate. Drive the
    // REAL hook: a rejected write reaches BOTH the hook onError and the page
    // catch. MenuPage passes notifyError:false, so the hook must stay silent
    // and the severity-aware role="alert" is the sole error surface. Removing
    // that gate makes the hook toast too, so the count below goes 1 -> 2.
    harness.actualHook = true;
    harness.updateDoc.mockRejectedValueOnce(new Error('permission denied'));

    const modal = findElement(page(), element => element.type === Instant86ingModal);
    await (modal!.props.onConfirm86 as (id: string, duration: string, reason: string) => Promise<void>)('burger', 'indefinite', 'Unavailable');

    const html = renderToStaticMarkup(page());
    expect(harness.updateDoc).toHaveBeenCalledOnce();
    expect(harness.errorToast).not.toHaveBeenCalled();
    expect((html.match(/role="alert"/g) ?? []).length + harness.errorToast.mock.calls.length).toBe(1);
    expect(html).toContain('Could not update stock — no changes were made.');
    expect(html).toContain('border-error');
    expect(html).toContain('text-error');
    expect(html).not.toContain('border-success');
    expect(html).not.toContain('permission denied');
  });

  it('still notifies when a real 86 caller does not opt out', async () => {
    harness.actualHook = true;
    harness.updateDoc.mockRejectedValueOnce(new Error('permission denied'));

    await expect(
      useBranchMenu().markItem86.mutateAsync({ itemId: item.id, duration: 'indefinite', reason: 'Unavailable' })
    ).rejects.toThrow('permission denied');

    expect(harness.errorToast).toHaveBeenCalledExactlyOnceWith(
      'Could not 86 this item — it was NOT marked out of stock.',
      { description: 'permission denied' }
    );
  });
});
