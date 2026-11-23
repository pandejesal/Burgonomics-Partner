/**
 * The canonical "is this outlet closed by staff?" question, answered from the
 * branch mirror the server route maintains (A5, owner rule C).
 *
 * `storeStatusOverride` is stamped by `POST /stores/setOperatingStatus` on the
 * customer gate AND on the branch; only a staff reopen clears it. `active` and
 * `acceptingOrdersStatus` are the legacy mirrors. A surge (Busy/Rush) must never
 * be allowed to read as "open" while any of these says the store is closed.
 */
export interface OperatingGateShape {
  storeStatusOverride?: unknown;
  acceptingOrdersStatus?: unknown;
  active?: unknown;
}

export function isStoreClosedByStaff(current: OperatingGateShape | null | undefined): boolean {
  if (!current || typeof current !== 'object') return false;
  return (
    current.storeStatusOverride === true ||
    current.acceptingOrdersStatus === 'closed' ||
    current.active === false
  );
}
