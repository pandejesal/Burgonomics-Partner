import { collection, doc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { Order } from '@/types';

/**
 * Counter (walk-in) orders have no customer account, so `customerId` is the
 * fixed sentinel `cust_walkin`. firestore.rules /orders/{orderId} create is
 *
 *   request.resource.data.customerId == request.auth.uid ||
 *   request.resource.data.userId     == request.auth.uid
 *
 * — the sentinel alone can never satisfy it, so every counter order MUST also
 * stamp `userId` with the signed-in operator uid. Both fields are required on
 * every order this modal writes.
 */
export const WALK_IN_CUSTOMER_ID = 'cust_walkin';

/**
 * Firestore auto-ids are 20 random base64url characters (~120 bits of
 * entropy). The previous id, `ord_pos_<Date.now().slice(-6)>`, wrapped every
 * ~16.7 minutes — and the blind `setDoc` that followed silently OVERWROTE the
 * earlier walk-in order (real revenue + KOT lost with no error).
 *
 * `makeAutoId` is injectable so tests never touch a Firestore instance.
 */
export function generateWalkInOrderId(makeAutoId?: () => string): string {
  const autoId = makeAutoId ? makeAutoId() : doc(collection(db, 'orders')).id;
  return `ord_pos_${autoId}`;
}

/**
 * True when a pre-create probe was refused by security rules. For a
 * brand-new auto-id a denial means "not readable", never "exists": the orders
 * read rule is keyed off `resource.data.*`, and `resource` is null for a
 * missing document — so a create-time probe is expected to be denied.
 */
export function isOrderProbeDenial(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'permission-denied') return true;
  return /permission denied|insufficient permissions/i.test(
    err instanceof Error ? err.message : ''
  );
}

/** Injectable Firestore surface so the create path is unit-testable. */
export interface OrderDocProbe {
  get: (ref: unknown) => Promise<{ exists: () => boolean }>;
  set: (ref: unknown, data: unknown) => Promise<void>;
}

/**
 * Creates an order doc only when nothing is already stored at that id.
 *
 * A Firestore `runTransaction` cannot be used here: its `tx.get()` runs under
 * the same rules, and the orders read rule denies missing docs (null
 * `resource`), which would make every counter-order create fail. Instead the
 * random auto-id makes a collision astronomically unlikely, and this probe
 * makes it impossible to silently overwrite when the caller CAN read the doc.
 *
 * Throws when a doc already exists — an existing order is never overwritten.
 */
export async function createOrderDocIfAbsent(
  ref: unknown,
  order: Order,
  probe: OrderDocProbe
): Promise<void> {
  let existing: { exists: () => boolean } | null = null;
  try {
    existing = await probe.get(ref);
  } catch (err) {
    if (!isOrderProbeDenial(err)) throw err;
    // Denied read on a brand-new id → treat as absent, then create.
  }

  if (existing?.exists()) {
    throw new Error(
      `Order ${(order as { id: string }).id} already exists — refusing to overwrite it.`
    );
  }

  await probe.set(ref, order);
}
