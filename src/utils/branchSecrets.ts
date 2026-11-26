import { collection, doc, getDoc, getDocs, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { isBrandRole } from '@/core/auth/routePolicy';
import type { UserRole } from '@/types';

/**
 * SEC-11: the branch POS/payment identifiers moved OFF `branches/{id}` into the
 * brand-only `branch_secrets/{branchId}` document.
 *
 * WHY: `branches/{id}` stays readable to every operator role (directory, dispatch
 * and analytics all query it), so it carried `petpooja`, `petpoojaStoreId` and
 * `restIDs` — the credentials needed to talk to an outlet's POS — in a
 * staff-readable collection. The new document is `allow read, write: if
 * isBrandOwner()` (brand_owner + developer only).
 *
 * Shape (written by the backend mirror and by this app; Admin SDK not needed):
 *   { branchId, petpooja?: {...}, petpoojaStoreId?: string,
 *     restIDs?: string[], mirroredAt, updatedAt }
 *
 * `razorpayAccountId` is RETIRED: Razorpay Route per-order transfers are gone
 * and no reader exists in functions/src. Do NOT migrate it, read it or write it
 * — a blank "linked account" field is the honest state, not a fake id.
 */

export const BRANCH_SECRETS_COLLECTION = 'branch_secrets';

/** Keys that belong in `branch_secrets`, never in a `branches` payload. */
export const BRANCH_SECRET_KEYS = ['petpoojaStoreId', 'petpooja', 'restIDs'] as const;

export interface BranchSecrets {
  branchId: string;
  petpoojaStoreId?: string | null;
  petpooja?: Record<string, unknown> | null;
  restIDs?: string[];
  mirroredAt?: unknown;
  updatedAt?: unknown;
}

/** Rules: `branch_secrets` is brand-only. Everyone else would be denied. */
export function canReadBranchSecrets(role: UserRole | undefined): boolean {
  return isBrandRole(role);
}

/**
 * The `branch_secrets` patch for a branch save, or `null` when the settings
 * carry none of those keys (the common case — an ordinary branch edit must not
 * write a secrets document at all).
 */
export function branchSecretsPatch(
  branchId: string,
  settings: Record<string, unknown>,
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = { branchId, updatedAt: Timestamp.now() };
  let touched = false;
  for (const key of BRANCH_SECRET_KEYS) {
    if (!(key in settings)) continue;
    patch[key] = settings[key] ?? null;
    touched = true;
  }
  return touched ? patch : null;
}

/**
 * `restIDs` for a POS store id. Petpooja's own bridge lists one restID per
 * outlet; the store id IS that restID for a single-outlet terminal, which is
 * exactly what the backend mirror writes. Empty store id → no restIDs (never a
 * fabricated entry).
 */
export function restIDsForStoreId(petpoojaStoreId: string | null | undefined): string[] {
  const value = typeof petpoojaStoreId === 'string' ? petpoojaStoreId.trim() : '';
  return value ? [value] : [];
}

/** Read one outlet's secrets. Denied roles get `null`, never a thrown page. */
export async function readBranchSecrets(
  branchId: string,
): Promise<BranchSecrets | null> {
  if (!branchId) return null;
  try {
    const snap = await getDoc(doc(db, BRANCH_SECRETS_COLLECTION, branchId));
    if (!snap.exists()) return null;
    return { branchId, ...(snap.data() as Record<string, unknown>) } as BranchSecrets;
  } catch (err) {
    // A denial is expected for non-brand roles; the caller already gates on
    // `canReadBranchSecrets`, so this is a genuine read fault, not a blank id
    // to present as "not linked".
    console.warn(`[branchSecrets] Could not read ${BRANCH_SECRETS_COLLECTION}/${branchId}:`, err);
    return null;
  }
}

/** Every outlet's secrets, keyed by branch id (brand roles only). */
export async function readAllBranchSecrets(): Promise<Record<string, BranchSecrets>> {
  const out: Record<string, BranchSecrets> = {};
  try {
    const snap = await getDocs(collection(db, BRANCH_SECRETS_COLLECTION));
    snap.docs.forEach((d) => {
      out[d.id] = { branchId: d.id, ...(d.data() as Record<string, unknown>) } as BranchSecrets;
    });
  } catch (err) {
    console.warn(`[branchSecrets] Could not list ${BRANCH_SECRETS_COLLECTION}:`, err);
  }
  return out;
}

/** Merge-write one outlet's secrets (brand roles only; rules enforce that). */
export async function writeBranchSecrets(
  branchId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  // `mirroredAt` marks the document as written by the app rather than the
  // backend mirror, which is what the ops tooling distinguishes.
  await setDoc(
    doc(db, BRANCH_SECRETS_COLLECTION, branchId),
    { branchId, ...patch, updatedAt: Timestamp.now() },
    { merge: true },
  );
}
