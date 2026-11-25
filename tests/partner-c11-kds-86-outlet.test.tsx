import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { MenuItem } from '@/types';

/**
 * F6 / A7 #5 — the KDS 86 drawer must write to the outlet the makeline is
 * actually showing, and refuse when there is no single outlet.
 *
 * The audited defect: `useBranchMenu()` resolved
 * `selectedBranchId || user.branchIds[0]`, so a two-outlet owner watching the
 * "all outlets" makeline 86'd outlet A's paneer while outlet B — the one that
 * had really run out — kept selling it. The drawer named no outlet and offered
 * no selector.
 */

const h = vi.hoisted(() => ({
  items: [
    { id: 'item-1', name: 'Paneer Tikka', price: 259, categoryId: 'mains', inStock: true },
  ] as MenuItem[],
  mutate: vi.fn(),
}));

vi.mock('@/features/menu/hooks/useBranchMenu', () => ({
  useBranchMenu: (branchId?: string | null) => ({
    // The hook is handed the drawer's target; the drawer must pass the BOARD's.
    branchId,
    items: h.items,
    toggleAvailability: { mutate: h.mutate, isPending: false },
    markItem86: { mutate: vi.fn(), isPending: false },
  }),
}));

import {
  KDSQuick86Drawer,
  filter86Items,
  isItemInStock,
} from '../src/features/kds/components/KDSQuick86Drawer';
import {
  kds86BranchName,
  resolveKds86BranchId,
} from '../src/features/kds/utils/kds86Outlet';

beforeEach(() => {
  h.mutate.mockClear();
});

describe('A7 #5 — resolve the outlet the board is showing', () => {
  it('uses an explicit outlet selection when there is one', () => {
    expect(resolveKds86BranchId('branch_b', ['branch_a', 'branch_b'])).toBe('branch_b');
  });

  it('resolves the only outlet a scoped user owns', () => {
    expect(resolveKds86BranchId(null, ['branch_a'])).toBe('branch_a');
    expect(resolveKds86BranchId(undefined, ['branch_a'])).toBe('branch_a');
  });

  it('refuses when the board shows more than one outlet', () => {
    expect(resolveKds86BranchId(null, ['branch_a', 'branch_b'])).toBeNull();
    expect(resolveKds86BranchId(null, ['a', 'b', 'c'])).toBeNull();
  });

  it('refuses for a role with no assigned outlet at all', () => {
    expect(resolveKds86BranchId(null, [])).toBeNull();
    expect(resolveKds86BranchId(null, undefined)).toBeNull();
  });

  it('stamps the outlet name from the board rows when it is known', () => {
    expect(
      kds86BranchName('branch_b', [
        { branchId: 'branch_a', branchName: 'Adajan' },
        { branchId: 'branch_b', branchName: 'Pal Road' },
      ]),
    ).toBe('Pal Road');
    expect(kds86BranchName(null, [])).toBeNull();
    expect(kds86BranchName('branch_zz', [])).toBeNull();
  });
});

describe('A7 #5 — the drawer refuses an ambiguous target', () => {
  it('names the outlet it will write to', () => {
    const html = renderToString(
      <KDSQuick86Drawer isOpen onClose={() => {}} branchId="branch_b" branchName="Pal Road" />,
    );
    expect(html).toContain('Outlet: Pal Road');
    expect(html).toContain('Paneer Tikka');
  });

  it('disables the toggles and says "pick an outlet first" when ambiguous', () => {
    const html = renderToString(
      <KDSQuick86Drawer isOpen onClose={() => {}} branchId={null} branchName={null} />,
    );

    expect(html).toContain('Pick an outlet first');
    expect(html).toContain('more than one outlet');
    // Fail closed: every toggle is disabled, so no write can be attempted.
    expect(html.match(/86-toggle-/g)?.length).toBeGreaterThan(0);
    expect(html).toMatch(/disabled=""/);
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it('still toggles a single resolved outlet', () => {
    expect(isItemInStock(h.items[0])).toBe(true);
    expect(filter86Items(h.items, 'paneer')).toHaveLength(1);
  });
});
