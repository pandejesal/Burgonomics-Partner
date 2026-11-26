/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F6 r2 / LOW finding 5 — stale "Busy/Rush" copy.
 *
 * Owner decision 2026-11-25 #4 removed the two timed pause buttons ("30m Rush
 * Break", "1h Rain Pause"), but three strings kept promising them: the
 * closed-store toast ("before using Busy/Rush"), the header subtitle ("and rush
 * surge"), and the Busy tile's action label/title ("Rush Hours (+15m buffer)" /
 * "Reopen the outlet before enabling Busy/Rush"). An operator reading a control
 * that names a removed feature is being told the wrong thing about what the
 * button does.
 */

const api = vi.hoisted(() => ({ applyStaffStoreStatus: vi.fn() }));
const toastSpy = vi.hoisted(() => ({
  success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(() => 't'), dismiss: vi.fn(),
}));
const branchMutation = vi.hoisted(() => ({
  mutateAsync: vi.fn(async () => ({})), isPending: false,
}));

vi.mock('@/config/firebase', () => ({
  auth: { currentUser: null },
  getAppCheckToken: async () => null,
}));
vi.mock('@/features/stores/services/storeOperatingStatus', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    applyStaffStoreStatus: api.applyStaffStoreStatus,
    refreshBranchCache: vi.fn(async () => undefined),
    storeBranchIdFor: () => 'branch_1',
  };
});
vi.mock('sonner', () => ({ toast: toastSpy }));
vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({ branches: [], isLoading: false, updateBranchSettings: branchMutation }),
}));

import { StoreOperatingToggle } from '../src/features/settings/components/StoreOperatingToggle';

const openBranch = {
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

const closedBranch = { ...openBranch, acceptingOrdersStatus: 'closed' as const, storeStatusOverride: true };

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

/** The three strings Big Pickle flagged, plus the removed buttons' labels. */
const STALE_STRINGS = ['Busy/Rush', 'Rush Hours', 'rush surge', '30m Rush Break', '1h Rain Pause'];

function assertNoStaleCopy(markup: string, where: string) {
  for (const stale of STALE_STRINGS) {
    expect(markup, `${where} still advertises a removed feature: ${stale}`).not.toContain(stale);
  }
}

describe('StoreOperatingToggle — no copy survives for the removed Rush controls', () => {
  it('says nothing about Busy/Rush or a rush surge on an open outlet', async () => {
    await act(async () => { root.render(<StoreOperatingToggle branch={openBranch as any} />); });
    assertNoStaleCopy(container.textContent ?? '', 'open-outlet copy');
  });

  it('says nothing about Busy/Rush while a staff close is in force', async () => {
    await act(async () => { root.render(<StoreOperatingToggle branch={closedBranch as any} />); });
    assertNoStaleCopy(container.textContent ?? '', 'closed-outlet copy');

    // The Busy tile's title is the closed-store explanation — it must name the
    // real action (busy), not a retired feature.
    const busy = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Kitchen Busy'),
    ) as HTMLButtonElement;
    expect(busy).toBeTruthy();
    assertNoStaleCopy(busy.title ?? '', 'Busy tile title');
    expect(busy.title).toMatch(/reopen/i);
  });

  it('the prep-buffer toast for a closed outlet names the busy control, not Busy/Rush', async () => {
    await act(async () => { root.render(<StoreOperatingToggle branch={closedBranch as any} />); });

    const slider = container.querySelector('#prepTimeSlider') as HTMLInputElement;
    expect(slider).toBeTruthy();
    // Prep slider save path: a closed outlet must say it saved the buffer and
    // that a reopen precedes setting busy — with no reference to Rush.
    expect(toastSpy.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Busy/Rush'),
      expect.anything(),
    );
    const infoCalls = toastSpy.info.mock.calls.map((c: any[]) => String(c[0] ?? ''));
    for (const message of infoCalls) assertNoStaleCopy(message, 'closed-store toast');
  });
});
