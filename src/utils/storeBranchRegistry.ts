/**
 * storeBranchRegistry — Delivery `stores/*` ↔ Partner `branches/*` ID registry.
 *
 * Why this exists: the customer app scopes everything (menu, orders) by
 * Delivery store id (`str_001`… from the `stores` collection / MOCK_STORES),
 * while the Partner app scopes by branch id (`branch_surat_01`… from the
 * `branches` collection). The two catalogs were seeded independently with
 * different Petpooja ID schemes (`rest_*` vs `PP_*`), so no automatic join
 * key exists today. Without a link, per-branch views silently exclude real
 * customer orders (only "All Outlets" shows them, via normalizeOrderDoc).
 *
 * How to add a link (ops procedure):
 *   1. Confirm in Petpooja that Delivery `petpoojaRestId` and Partner
 *      `petpoojaStoreId` point at the same physical outlet.
 *   2. Append one entry below with verified: true.
 *   3. Per-branch order views pick the linked Delivery stores up
 *      automatically (fetchAliasedStoreOrders in orderContract).
 *
 * Deliberately NOT matched by city/name heuristics: e.g. Delivery
 * `str_012 Pal Road, Surat` is not the same outlet as Partner
 * `branch_surat_01 Surat Adajan`, and attributing orders across outlets
 * would corrupt branch revenue. Unmapped stores surface only under
 * "All Outlets" with their real store name — never under a wrong branch.
 */

export interface StoreBranchLink {
  /** Delivery `stores/*` doc id (e.g. "str_012"). */
  deliveryStoreId: string;
  /** Partner `branches/*` doc id (e.g. "branch_surat_01"). */
  branchId: string;
  /** True only after Petpooja-ID confirmation per the procedure above. */
  verified: boolean;
  note: string;
}

const LINKS: StoreBranchLink[] = [
  // No verified links yet — catalogs were seeded independently.
  // Example of a future entry:
  // { deliveryStoreId: 'str_012', branchId: 'branch_surat_01', verified: true,
  //   note: 'Confirmed: rest_pal_road == PP_SURAT_01 in Petpooja, 2026-09-04' },
];

/** Partner branch for a Delivery store id, or null when unmapped. */
export function branchIdForDeliveryStore(deliveryStoreId: string): string | null {
  const link = LINKS.find((l) => l.deliveryStoreId === deliveryStoreId && l.verified);
  return link ? link.branchId : null;
}

/** All verified Delivery store ids linked to a Partner branch. */
export function deliveryStoreIdsForBranch(branchId: string): string[] {
  return LINKS.filter((l) => l.branchId === branchId && l.verified).map(
    (l) => l.deliveryStoreId
  );
}

/** Union of Delivery store ids for several branches (for one `in` query). */
export function deliveryStoreIdsForBranches(branchIds: string[]): string[] {
  const out = new Set<string>();
  for (const b of branchIds) {
    for (const s of deliveryStoreIdsForBranch(b)) out.add(s);
  }
  return [...out];
}

/** True when the Delivery store has a verified branch link. */
export function isMappedDeliveryStore(deliveryStoreId: string): boolean {
  return branchIdForDeliveryStore(deliveryStoreId) !== null;
}
