/**
 * Staff open/close for an outlet (owner rule C).
 *
 * Two documents matter, and only ONE of them stops ordering:
 *
 *  - `branches/{id}.acceptingOrdersStatus` — what operators read on the outlet
 *    screens. It is NOT a gate: no ordering path consults it.
 *  - `stores/{id}.isOpen` (or `admin_stores/{id}.isOpen` in deployments whose
 *    directory is the `admin_stores` collection) — the gate the customer app
 *    reads (`storesService.mapStoreDoc` → `PaymentRepository` closed-store
 *    refusal → disabled cart/checkout).
 *
 * Firestore rules deny every branch role a write to that gate:
 * `stores/{id}` is brand-owner-only, and the `admin_stores` branch arm
 * (`adminStoreBranchUpdateShape`) allows eight metadata keys — `isOpen` is
 * deliberately not one of them. So a client-side "save" can only ever move the
 * branch flag, which is exactly the reported bug: staff closed the outlet and
 * customers kept ordering.
 *
 * Therefore every Partner open/close control goes through
 * `POST /stores/setOperatingStatus`, which:
 *  - resolves the storefront that actually serves customers,
 *  - writes the gate plus a `storeStatusOverride` that a Petpooja "open" cannot
 *    clear (only staff reopening clears it),
 *  - keeps the branch flag in step,
 *  - re-checks that the caller may manage that branch.
 *
 * A refusal is thrown, never swallowed: callers must not toast success.
 */
import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';
import { isStoreClosedByStaff } from './operatingGate';

export type StoreOperatingStatus = 'open' | 'closed';

export interface StoreOperatingStatusResult {
  branchId: string;
  status: StoreOperatingStatus;
  /** The storefront document the gate was written to, when one is linked. */
  storeId: string;
  /** True while a staff close is still in force (Petpooja cannot reopen). */
  storeStatusOverride: boolean;
}

export async function applyStaffStoreStatus(input: {
  branchId: string;
  status: StoreOperatingStatus;
  reason?: string;
}): Promise<StoreOperatingStatusResult> {
  if (!input?.branchId) {
    throw new Error('No outlet linked — the store status was not saved.');
  }
  const body: { branchId: string; status: StoreOperatingStatus; reason?: string } = {
    branchId: input.branchId,
    status: input.status,
  };
  if (input.reason) body.reason = input.reason;
  return await partnerFunctionsApi.setStoreOperatingStatus(body);
}

/**
 * Drops the cached branch rows after a server-confirmed status change, so the
 * outlet cards re-read the flag the route kept in step.
 *
 * Deliberately NOT `useQueryClient()` at the call site: this must work in a
 * component rendered outside a QueryClientProvider (the reflow suite renders
 * `StoreOperatingToggle` standalone, and a provider-requiring hook would throw
 * there). The shared client is the same instance the app provides.
 */
export async function refreshBranchCache(): Promise<void> {
  const { queryClient } = await import('@/core/query/queryClient');
  await queryClient.invalidateQueries({ queryKey: ['branches'] });
}

/**
 * Splits a submitted branch-settings patch into "the customer gate changed" and
 * "everything else about the branch".
 *
 * Every outlet screen in the Partner app edits `branches/{id}` with one payload
 * that includes `acceptingOrdersStatus`, which is how three separate controls
 * (Settings, the dashboard master switch, the outlet settings modal) all ended
 * up writing a flag no ordering path reads. This function is the single rule
 * they can share:
 *
 *  - a status CHANGE between `open` and `closed` is the customer gate → the
 *    server route; the branch document must NOT also carry the flag (the route
 *    writes it, plus the override a POS "open" cannot clear);
 *  - `busy` is a surge control, not a close → it stays on the branch;
 *  - an UNCHANGED status is not a gate change → it is dropped from the branch
 *    patch (the route is not called, and re-writing the same value would be a
 *    pointless write that bumps every reader's version);
 *  - every other field (name, phone, hours, prep buffer) is a branch save.
 *
 * The current status is read the same way the screens derive it, so an outlet
 * with no `acceptingOrdersStatus` but `active: false` is honestly "closed".
 */
export type BranchOperatingSettings = Record<string, unknown> & {
  acceptingOrdersStatus?: AcceptingOrdersStatusValue;
  active?: boolean;
};

export type AcceptingOrdersStatusValue = 'open' | 'busy' | 'closed';

export interface OperatingStatusSplit {
  /** A customer-gate change to send to POST /stores/setOperatingStatus. */
  gate: { status: StoreOperatingStatus } | null;
  /** The remaining branch-document patch (never carries the gate flag). */
  branchSettings: Record<string, unknown>;
}

function currentOperatingStatus(current: BranchOperatingSettings): AcceptingOrdersStatusValue {
  const flagged = current?.acceptingOrdersStatus;
  if (flagged === 'open' || flagged === 'busy' || flagged === 'closed') return flagged;
  return current?.active === false ? 'closed' : 'open';
}

export function splitOperatingStatusChange(input: {
  current: BranchOperatingSettings;
  settings: BranchOperatingSettings;
}): OperatingStatusSplit {
  const settings = (input?.settings ?? {}) as BranchOperatingSettings;
  const next = settings.acceptingOrdersStatus;

  // Nothing said about the status: a plain settings save.
  if (next === undefined) {
    return { gate: null, branchSettings: { ...settings } };
  }

  // "busy" is a surge control (prep buffer + flag), deliberately not a close.
  // A5: while a staff close is in force it must NOT write `active: true` or
  // `acceptingOrdersStatus: 'busy'` — that would make an outlet view claim the
  // store accepts orders while the customer gate is still closed. Only the
  // prep-buffer part of the surge may be saved; the surge awaits an explicit
  // reopen, which is the only thing that clears `storeStatusOverride`.
  if (next === 'busy') {
    const branchSettings: Record<string, unknown> = { ...settings };
    if (isStoreClosedByStaff(input.current)) {
      delete branchSettings.acceptingOrdersStatus;
      delete branchSettings.active;
    }
    return { gate: null, branchSettings };
  }

  const branchSettings: Record<string, unknown> = { ...settings };
  delete branchSettings.acceptingOrdersStatus;
  // `active` mirrors the gate; when the server moves the gate it owns this too.
  delete branchSettings.active;

  const changed = next !== currentOperatingStatus(input?.current ?? {});
  return {
    gate: changed ? { status: next } : null,
    branchSettings,
  };
}

/**
 * The branch a directory row belongs to. `partnerBranchId` is the split-era
 * link written by the console; `branchId` is the legacy key older importers
 * wrote. No link at all means the row cannot gate ordering, and the callers
 * must say so instead of pretending the flip worked.
 */
export function storeBranchIdFor(
  store: Record<string, any> | null | undefined,
): string | null {
  if (!store || typeof store !== 'object') return null;
  const link = store.partnerBranchId ?? store.branchId;
  return typeof link === 'string' && link.trim() ? link : null;
}
