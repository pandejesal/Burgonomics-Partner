import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P2 — the legacy Delivery alias read is a PRIVILEGED read.
 *
 * `orders` rules (root `firestore.rules:390-395`) allow a read only for the
 * order's own customer/user, or `ownsBranch(resource.data.branchId)`. A
 * `where('store.id','in',…)` query carries NO `branchId` predicate, so a
 * branch-scoped operator cannot satisfy `ownsBranch` with it — rules are not
 * filters, the query is simply refused. Issuing it anyway is a guaranteed
 * `permission-denied` per snapshot (noisy logs, and a KDS merge that can only
 * fail), so the helper must not issue it at all unless the caller holds a
 * capability that permits a store-only query: `brand_owner` or `developer`.
 *
 * ORACLE: the Firestore boundary. Every refused role must produce ZERO
 * `store.id` reads — a refusal that still sends the request is exactly the
 * defect under test.
 *
 * `isGlobalRole()` is NOT an oracle: `support` and `regional_manager` appear
 * there for SELECTION visibility only (src/utils/branchScope.ts:3-14) and have
 * no brand-wide order read. They are denial cases here, and the support/regional
 * primary-read policy remains an explicit OPEN GAP (see the slice report) — this
 * file does not claim those roles are handled.
 *
 * The capability argument is `{ role }` and is REQUIRED. The call is cast so the
 * file compiles against both the pre-fix two-argument export and the fixed
 * three-argument export: the RED must be behavioural (a forbidden read really
 * issued), never an import/arity/type failure.
 */

const h = vi.hoisted(() => ({
  /** Every `store.id` predicate the code under test asked Firestore for. */
  storeIdWheres: [] as Array<{ field: string; op: string; value: unknown }>,
  /** Reads that actually carried a `store.id` predicate: the violation count. */
  storeIdReads: 0,
  /** All reads, whatever their shape. */
  getDocsCalls: 0,
  rows: [] as Array<{ id: string; data: Record<string, any> }>,
  rejectStoreIdReads: false as boolean,
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  where: (field: string, op: string, value: unknown) => {
    if (field === 'store.id') h.storeIdWheres.push({ field, op, value });
    return { kind: 'where', field, op, value };
  },
  query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
  getDocs: vi.fn(async (q?: any) => {
    const constraints: any[] = q?.constraints ?? [];
    const usesStoreId = constraints.some((c) => c?.kind === 'where' && c.field === 'store.id');
    if (usesStoreId) {
      h.storeIdReads += 1;
      if (h.rejectStoreIdReads) {
        throw Object.assign(new Error('Missing or insufficient permissions.'), {
          code: 'permission-denied',
        });
      }
    }
    h.getDocsCalls += 1;
    return { docs: h.rows.map((row) => ({ id: row.id, data: () => row.data })) };
  }),
}));

import { fetchAliasedStoreOrders } from '@/utils/orderContract';

type AliasCapability = { role: string | null | undefined };
type RawDoc = { id: string; data: Record<string, any> };

/**
 * Structural adapter: the pre-fix export takes `(db, branchIds)` and ignores a
 * third argument, so the RED is the forbidden request, not an arity error.
 */
const fetchAliased = fetchAliasedStoreOrders as unknown as (
  db: unknown,
  branchIds: string[],
  capability: AliasCapability,
) => Promise<RawDoc[]>;

/** Cannot satisfy `ownsBranch` with a store-only predicate, so must be refused. */
const FORBIDDEN: Array<{ label: string; role: string | null | undefined }> = [
  { label: 'branch_owner', role: 'branch_owner' },
  { label: 'branch_staff', role: 'branch_staff' },
  { label: 'support', role: 'support' },
  { label: 'regional_manager', role: 'regional_manager' },
  { label: 'empty string', role: '' },
  { label: 'null', role: null },
  { label: 'undefined', role: undefined },
  { label: 'unknown role', role: 'franchise_partner' },
];

describe('fetchAliasedStoreOrders — fail-closed legacy store read', () => {
  beforeEach(() => {
    h.storeIdWheres = [];
    h.storeIdReads = 0;
    h.getDocsCalls = 0;
    h.rejectStoreIdReads = false;
    h.rows = [
      { id: 'delivery_row', data: { store: { id: 'demo' }, totals: { grandTotal: 10 } } },
    ];
  });

  describe.each(FORBIDDEN)('role $label', ({ role }) => {
    it('issues ZERO store.id reads (the request itself is the violation)', async () => {
      // 'demo' is the one VERIFIED store↔branch link, so a mapped branch exists:
      // an empty result can never be mistaken for "nothing was mapped".
      const rows = await fetchAliased({}, ['demo'], { role });

      // Boundary first: the failure message must name the forbidden request,
      // not merely a surprising row set.
      expect(h.storeIdReads).toBe(0);
      expect(h.getDocsCalls).toBe(0);
      expect(rows).toEqual([]);
    });
  });

  it('a missing capability is a denial, not an implicit brand-wide grant', async () => {
    const rows = await fetchAliased({}, ['demo'], undefined as unknown as AliasCapability);

    expect(rows).toEqual([]);
    expect(h.storeIdReads).toBe(0);
    expect(h.getDocsCalls).toBe(0);
  });

  describe.each(['brand_owner', 'developer'])('role %s', (role) => {
    it('still reads the mapped legacy rows, with the mapped ids unchanged', async () => {
      const rows = await fetchAliased({}, ['demo'], { role });

      expect(h.storeIdWheres).toEqual([{ field: 'store.id', op: 'in', value: ['demo'] }]);
      expect(h.storeIdReads).toBe(1);
      expect(rows.map((r) => r.id)).toEqual(['delivery_row']);
      expect(rows[0].data.store.id).toBe('demo');
    });
  });

  it('a brand role with no mapped store still issues no read', async () => {
    const rows = await fetchAliased({}, ['branch_unmapped'], { role: 'brand_owner' });

    expect(rows).toEqual([]);
    expect(h.storeIdReads).toBe(0);
    expect(h.getDocsCalls).toBe(0);
  });

  it('the capability never converts a rules denial into a silent success', async () => {
    // The client hint is not permission. A permitted-shape query the server
    // still refuses must surface, not resolve to an empty page.
    h.rejectStoreIdReads = true;

    await expect(fetchAliased({}, ['demo'], { role: 'developer' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(h.storeIdReads).toBe(1);
  });
});
