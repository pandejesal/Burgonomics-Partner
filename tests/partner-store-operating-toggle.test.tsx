/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Settings screen's open/close control (rule C).
 *
 * Pre-fix it wrote `branches/{id}.acceptingOrdersStatus` only — a flag no
 * ordering path reads — and toasted success. That is exactly the reported
 * "closing the store does not stop orders" bug.
 *
 * Contract pinned here:
 *   - "Store Closed" / "Open for Orders" go through the server gate route
 *     (`applyStaffStoreStatus`), never a bare branch-flag mutation;
 *   - a refusal leaves the previous status on screen and says so;
 *   - "Kitchen Busy" stays a surge control (branch flag + prep buffer), because
 *     it is not a close and must not touch the customer gate.
 */

const api = vi.hoisted(() => ({
  applyStaffStoreStatus: vi.fn(),
}));
const toastSpy = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  loading: vi.fn(() => 'toast-1'),
  dismiss: vi.fn(),
}));
const branchMutation = vi.hoisted(() => ({
  mutateAsync: vi.fn(async () => ({})),
  isPending: false,
}));
// Rule C leaves the cache refresh to the service so the component never needs
// a QueryClientProvider (the reflow suite renders it standalone).
const refreshBranchCache = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/features/stores/services/storeOperatingStatus', () => ({
  applyStaffStoreStatus: api.applyStaffStoreStatus,
  refreshBranchCache,
  storeBranchIdFor: () => 'branch_1',
}));
vi.mock('sonner', () => ({ toast: toastSpy }));
vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({
    branches: [],
    isLoading: false,
    updateBranchSettings: branchMutation,
  }),
}));

import { StoreOperatingToggle } from '../src/features/settings/components/StoreOperatingToggle';

const branch = {
  id: 'branch_1',
  name: 'Ahmedabad Main',
  city: 'Ahmedabad',
  address: 'SG Highway',
  phone: '+919820011223',
  active: true,
  acceptingOrdersStatus: 'open' as const,
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
  refreshBranchCache.mockClear();
  for (const fn of Object.values(toastSpy)) {
    if (typeof (fn as any).mockClear === 'function') (fn as any).mockClear();
  }
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

async function renderToggle() {
  await act(async () => {
    root.render(<StoreOperatingToggle branch={branch as any} />);
  });
}

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  ) as HTMLButtonElement | undefined;
}

describe('StoreOperatingToggle — close goes through the server gate', () => {
  it('closes via the server route and names the POS override in the confirmation', async () => {
    api.applyStaffStoreStatus.mockResolvedValue({
      branchId: 'branch_1',
      status: 'closed',
      storeId: 'store_1',
      storeStatusOverride: true,
    });
    await renderToggle();

    await act(async () => {
      buttonWithText('Store Closed')!.click();
    });

    expect(api.applyStaffStoreStatus).toHaveBeenCalledWith({
      branchId: 'branch_1',
      status: 'closed',
      reason: 'Manually Paused',
    });
    // The old branch-flag write must NOT be the mechanism any more.
    const statusWrites = branchMutation.mutateAsync.mock.calls.filter(
      (call: any[]) => (call[0]?.settings ?? {}).acceptingOrdersStatus !== undefined,
    );
    expect(statusWrites).toEqual([]);
    expect(refreshBranchCache).toHaveBeenCalled();
    expect(toastSpy.success.mock.calls.join(' ')).toMatch(/Petpooja cannot reopen/i);
  });

  it('reopens via the server route and says Petpooja owns open/closed again', async () => {
    api.applyStaffStoreStatus.mockResolvedValue({
      branchId: 'branch_1',
      status: 'open',
      storeId: 'store_1',
      storeStatusOverride: false,
    });
    await renderToggle();

    await act(async () => {
      buttonWithText('Open for Orders')!.click();
    });

    expect(api.applyStaffStoreStatus).toHaveBeenCalledWith({
      branchId: 'branch_1',
      status: 'open',
    });
    expect(toastSpy.success.mock.calls.join(' ')).toMatch(/Petpooja/i);
  });

  it('keeps the previous status on a refusal and toasts the server reason', async () => {
    api.applyStaffStoreStatus.mockRejectedValue(
      new Error('This outlet is not linked to a storefront — nothing was saved.'),
    );
    await renderToggle();

    await act(async () => {
      buttonWithText('Store Closed')!.click();
    });

    expect(toastSpy.success).not.toHaveBeenCalled();
    expect(toastSpy.error.mock.calls.join(' ')).toMatch(/not linked to a storefront/i);
    // Reverted: the OPEN card is still the active one.
    const openButton = buttonWithText('Open for Orders')!;
    expect(openButton.className).toMatch(/bg-\[#0E4825\]/);
  });

  it('treats Kitchen Busy as a surge control, not a close', async () => {
    await renderToggle();

    await act(async () => {
      buttonWithText('Kitchen Busy')!.click();
    });

    expect(api.applyStaffStoreStatus).not.toHaveBeenCalled();
    expect(branchMutation.mutateAsync).toHaveBeenCalledWith({
      branchId: 'branch_1',
      settings: {
        acceptingOrdersStatus: 'busy',
        active: true,
        prepTimeMinutes: 35,
      },
    });
  });

  it('refuses to claim a save when no outlet is loaded', async () => {
    await act(async () => {
      root.render(<StoreOperatingToggle branch={null} />);
    });
    await act(async () => {
      buttonWithText('Store Closed')!.click();
    });

    expect(api.applyStaffStoreStatus).not.toHaveBeenCalled();
    expect(toastSpy.error).toHaveBeenCalled();
    expect(toastSpy.success).not.toHaveBeenCalled();
  });
});
