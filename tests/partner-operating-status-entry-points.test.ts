import { describe, it, expect } from 'vitest';

/**
 * Rule C applies to EVERY open/close entry point, not just Settings (fix wave
 * 2026-11-20).
 *
 * Two more places could "close" an outlet and toast success:
 *
 *   - the Dashboard master switch (`BranchSwitcher.onToggleStoreStatus`), and
 *   - the outlet settings modal on the Branches screen, whose name/phone/hours
 *     save also carried `acceptingOrdersStatus`.
 *
 * Both wrote `branches/{id}.acceptingOrdersStatus` and nothing else, so they had
 * the same defect as the Settings toggle: customers kept ordering, and a
 * Petpooja "open" could overwrite the staff decision.
 *
 * The split rule pinned here (pure, so it can be proven without mounting the
 * pages): an open/closed change goes to the server gate; every OTHER branch
 * field still saves to the branch document; "busy" is a surge flag and stays on
 * the branch. A submission that does not change the status is a plain branch
 * save.
 */
import {
  splitOperatingStatusChange,
} from '../src/features/stores/services/storeOperatingStatus';

describe('splitOperatingStatusChange — one decision for every outlet screen', () => {
  it('routes a changed open/closed to the server gate and leaves it out of the branch save', () => {
    const split = splitOperatingStatusChange({
      current: { acceptingOrdersStatus: 'open', active: true },
      settings: {
        acceptingOrdersStatus: 'closed',
        name: 'Adajan',
        prepTimeMinutes: 25,
      },
    });

    expect(split.gate).toEqual({ status: 'closed' });
    expect(split.branchSettings).toEqual({ name: 'Adajan', prepTimeMinutes: 25 });
    // The gate is never written twice: the branch flag follows server-side.
    expect('acceptingOrdersStatus' in split.branchSettings).toBe(false);
  });

  it('treats a closed→open reopen as a gate change too (it clears the override)', () => {
    const split = splitOperatingStatusChange({
      current: { acceptingOrdersStatus: 'closed', active: false },
      settings: { acceptingOrdersStatus: 'open' },
    });

    expect(split.gate).toEqual({ status: 'open' });
    expect(split.branchSettings).toEqual({});
  });

  it('keeps "busy" a surge control on the branch (it is not a close)', () => {
    const split = splitOperatingStatusChange({
      current: { acceptingOrdersStatus: 'open', active: true },
      settings: { acceptingOrdersStatus: 'busy', prepTimeMinutes: 35 },
    });

    expect(split.gate).toBeNull();
    expect(split.branchSettings).toEqual({
      acceptingOrdersStatus: 'busy',
      prepTimeMinutes: 35,
    });
  });

  it('does nothing to the gate when the status is unchanged (a plain settings save)', () => {
    const split = splitOperatingStatusChange({
      current: { acceptingOrdersStatus: 'open', active: true },
      settings: { acceptingOrdersStatus: 'open', phone: '+919820011223' },
    });

    expect(split.gate).toBeNull();
    expect(split.branchSettings).toEqual({ phone: '+919820011223' });
  });

  it('reads the branch as closed when the flag is absent but the branch is inactive', () => {
    const split = splitOperatingStatusChange({
      current: { active: false },
      settings: { acceptingOrdersStatus: 'open' },
    });

    expect(split.gate).toEqual({ status: 'open' });
  });
});
