/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A5 — while a staff close is in force, Busy/Rush must never make any outlet
 * view claim the store is accepting orders. Surge is disabled until an explicit
 * reopen (the only thing that clears `storeStatusOverride`).
 */
const api = vi.hoisted(() => ({ applyStaffStoreStatus: vi.fn() }));
const toastSpy = vi.hoisted(() => ({
  success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(() => 't'), dismiss: vi.fn(),
}));
const branchMutation = vi.hoisted(() => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }));
const refreshBranchCache = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/config/firebase', () => ({
  auth: { currentUser: null },
  getAppCheckToken: async () => null,
}));
vi.mock('@/features/stores/services/storeOperatingStatus', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    applyStaffStoreStatus: api.applyStaffStoreStatus,
    refreshBranchCache,
    storeBranchIdFor: () => 'branch_1',
  };
});
vi.mock('sonner', () => ({ toast: toastSpy }));
vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({ branches: [], isLoading: false, updateBranchSettings: branchMutation }),
}));

import { StoreOperatingToggle } from '../src/features/settings/components/StoreOperatingToggle';
import { splitOperatingStatusChange } from '../src/features/stores/services/storeOperatingStatus';

const closedBranch = {
  id: 'branch_1',
  name: 'Ahmedabad Main',
  city: 'Ahmedabad',
  address: 'SG Highway',
  phone: '+919820011223',
  active: true,
  acceptingOrdersStatus: 'closed' as const,
  storeStatusOverride: true,
  prepTimeMinutes: 20,
  coordinates: { lat: 23.05, lng: 72.51 },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.applyStaffStoreStatus.mockReset();
  branchMutation.mutateAsync.mockClear();
  for (const fn of Object.values(toastSpy)) {
    if (typeof (fn as any).mockClear === 'function') (fn as any).mockClear();
  }
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});
function buttonWithText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  ) as HTMLButtonElement | undefined;
}

describe('A5 — surge cannot mask a staff close', () => {
  it('disables Busy/Rush and shows CLOSED while the override is in force', async () => {
    await act(async () => { root.render(<StoreOperatingToggle branch={closedBranch as any} />); });

    const busy = buttonWithText('Kitchen Busy')!;
    const rush = buttonWithText('30m Rush Break')!;
    expect(busy.disabled).toBe(true);
    expect(rush.disabled).toBe(true);
    expect(container.textContent).toContain('CLOSED');

    await act(async () => { busy.click(); rush.click(); });
    const acceptingWrites = branchMutation.mutateAsync.mock.calls.filter(
      (c: any[]) => c[0]?.settings?.active === true || c[0]?.settings?.acceptingOrdersStatus === 'busy',
    );
    expect(acceptingWrites).toEqual([]);
    expect(api.applyStaffStoreStatus).not.toHaveBeenCalled();
  });

  it('the shared settings split drops surge flags while closed', () => {
    const split = splitOperatingStatusChange({
      current: { active: true, acceptingOrdersStatus: 'closed', storeStatusOverride: true },
      settings: { active: true, acceptingOrdersStatus: 'busy', prepTimeMinutes: 35 },
    });
    expect(split.gate).toBeNull();
    expect(split.branchSettings).not.toHaveProperty('active');
    expect(split.branchSettings).not.toHaveProperty('acceptingOrdersStatus');
    expect(split.branchSettings.prepTimeMinutes).toBe(35);
  });

  it('a surge on an open outlet is unchanged', () => {
    const split = splitOperatingStatusChange({
      current: { active: true, acceptingOrdersStatus: 'open' },
      settings: { active: true, acceptingOrdersStatus: 'busy', prepTimeMinutes: 35 },
    });
    expect(split.branchSettings).toMatchObject({
      active: true,
      acceptingOrdersStatus: 'busy',
      prepTimeMinutes: 35,
    });
  });
});
