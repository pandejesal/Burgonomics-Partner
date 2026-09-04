import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import type { Order, OrderItem, OrderStatus } from '@/types';
import {
  branchIdForDeliveryStore,
  deliveryStoreIdsForBranches,
} from './storeBranchRegistry';

/**
 * orderContract — Partner ↔ Delivery (customer app) order interop adapter.
 *
 * Both apps share Firebase project `burgonomics-7faa8` and the `orders`
 * collection, but they were built with different doc shapes:
 *
 *   Delivery writes : { store: {id…}, status: {code:'PLACED'…},
 *                       totals: {grandTotal…}, items: CartLine[],
 *                       fulfillment, placedAt, address: {contactName…} }
 *   Partner expects : { branchId, customerName, subtotal/total,
 *                       status: 'pending'|'…', orderType, createdAt }
 *
 * This module is the single place that translates between the two.
 * Delivery shape is read-normalized to Partner `Order`; Partner status
 * writes go out in Delivery's `{code,label,kind,terminal}` object form so
 * customer-side tracking keeps working after a kitchen bump.
 * Store↔branch identity resolves via storeBranchRegistry.
 *
 * Out of scope (separate break): the `petpooja_products` vs
 * `menu/{branchId}/items` menu paths.
 */

/** Delivery UPPERCASE code (or legacy lowercase) → Partner status. */
const DELIVERY_TO_PARTNER: Record<string, OrderStatus> = {
  PLACED: 'pending',
  CONFIRMED: 'accepted',
  PREPARING: 'preparing',
  READY_FOR_PICKUP: 'ready',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  // Partner has no takeaway-complete state; delivered is the terminal bucket.
  PICKED_UP: 'delivered',
  READY_TO_SERVE: 'ready',
  COMPLETED: 'delivered',
  CANCELLED: 'cancelled',
  // Partner has no failed state; cancelled keeps it out of active buckets.
  FAILED: 'cancelled',
  // Legacy lowercase variants already seen in the wild (KDS-tolerated).
  pending: 'pending',
  placed: 'pending',
  accepted: 'accepted',
  preparing: 'preparing',
  ready: 'ready',
  ready_for_pickup: 'ready',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  cancelled: 'cancelled',
};

export interface DeliveryStatusMeta {
  code: string;
  label: string;
  kind: 'upcoming' | 'in_progress' | 'completed' | 'cancelled' | 'failed' | 'unknown';
  terminal: boolean;
}

/** Partner status → Delivery meta (mirrors delivery STATUS_CATALOG wording). */
const PARTNER_TO_DELIVERY: Record<OrderStatus, DeliveryStatusMeta> = {
  pending: { code: 'PLACED', label: 'Order placed', kind: 'upcoming', terminal: false },
  accepted: { code: 'CONFIRMED', label: 'Order confirmed', kind: 'upcoming', terminal: false },
  preparing: { code: 'PREPARING', label: 'Preparing your order', kind: 'in_progress', terminal: false },
  ready: { code: 'READY_FOR_PICKUP', label: 'Ready for pickup', kind: 'in_progress', terminal: false },
  out_for_delivery: { code: 'OUT_FOR_DELIVERY', label: 'Out for delivery', kind: 'in_progress', terminal: false },
  delivered: { code: 'DELIVERED', label: 'Delivered', kind: 'completed', terminal: true },
  cancelled: { code: 'CANCELLED', label: 'Cancelled', kind: 'cancelled', terminal: true },
};

/** Normalize any status shape (object, UPPER, lower) to Partner status. */
export function toPartnerStatus(raw: unknown): OrderStatus {
  if (typeof raw === 'string') {
    return DELIVERY_TO_PARTNER[raw] ?? DELIVERY_TO_PARTNER[raw.toUpperCase()] ?? 'pending';
  }
  if (raw && typeof raw === 'object') {
    const code = (raw as { code?: unknown }).code;
    if (typeof code === 'string') {
      return DELIVERY_TO_PARTNER[code] ?? DELIVERY_TO_PARTNER[code.toUpperCase()] ?? 'pending';
    }
  }
  return 'pending';
}

/** Partner status → Delivery `{code,label,kind,terminal}` object for writes. */
export function toDeliveryStatusMeta(status: OrderStatus): DeliveryStatusMeta {
  return PARTNER_TO_DELIVERY[status];
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function normalizeItems(raw: unknown): OrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((it: any, idx: number) => ({
    itemId: str(it?.itemId ?? it?.productId, `item_${idx}`),
    petpoojaItemId: str(it?.petpoojaItemId ?? it?.meta?.petpoojaItemId),
    name: str(it?.name, 'Item'),
    quantity: num(it?.quantity, 1),
    price: num(it?.price ?? it?.unitPrice, 0),
    specialInstructions: it?.specialInstructions ?? it?.notes,
  }));
}

/**
 * Normalize one Firestore `orders` doc (either app's shape) to Partner `Order`.
 * Idempotent for already-Partner-shaped docs (incl. seed data).
 */
export function normalizeOrderDoc(id: string, data: Record<string, any>): Order {
  const store = (data.store ?? {}) as Record<string, any>;
  const address = (data.address ?? {}) as Record<string, any>;
  const totals = (data.totals ?? {}) as Record<string, any>;
  const payment = (data.payment ?? {}) as Record<string, any>;
  const petpoojaDetails = (data.petpoojaDetails ?? {}) as Record<string, any>;

  const methodRaw = str(data.paymentMethod ?? payment.method, 'razorpay');
  const paymentMethod =
    methodRaw === 'cod' ? 'cod' : methodRaw === 'upi' ? 'upi' : 'razorpay';

  const payStatusRaw = str(data.paymentStatus ?? payment.status, 'pending');
  const paymentStatus =
    payStatusRaw === 'completed' || payStatusRaw === 'paid'
      ? 'completed'
      : payStatusRaw === 'failed'
        ? 'failed'
        : 'pending';

  const petpoojaRaw = str(
    data.petpoojaSyncStatus ?? data.petpoojaStatus,
    ''
  ).toLowerCase();
  const petpoojaSyncStatus =
    petpoojaRaw === 'synced'
      ? 'synced'
      : petpoojaRaw === 'failed'
        ? 'failed'
        : petpoojaRaw === 'not_applicable'
          ? 'not_applicable'
          : 'pending';

  const createdAt = (data.createdAt ?? data.placedAt ?? new Date().toISOString()) as Timestamp;
  const updatedAt = (data.updatedAt ?? data.createdAt ?? data.placedAt ?? new Date().toISOString()) as Timestamp;

  // Branch identity: explicit field wins; Delivery nested store id resolves
  // via the registry; unmapped stores keep their raw id (truthful display,
  // matches no branch filter — they surface under "All Outlets" only).
  const rawStoreId = str(store.id);
  const branchId =
    str(data.branchId) || branchIdForDeliveryStore(rawStoreId) || rawStoreId;

  return {
    id,
    customerId: str(data.customerId ?? data.userId),
    customerName: str(data.customerName ?? address.contactName, 'Customer'),
    customerPhone: str(data.customerPhone ?? address.contactPhone),
    branchId,
    branchName: data.branchName ?? store.name,
    city: data.city ?? store.city ?? address.city,
    items: normalizeItems(data.items),
    subtotal: num(data.subtotal ?? totals.subtotal),
    tax: num(data.tax ?? totals.taxes ?? totals.tax),
    deliveryFee: num(data.deliveryFee ?? totals.deliveryFee),
    total: num(data.total ?? totals.grandTotal),
    orderType: (data.orderType ?? data.fulfillment ?? 'delivery') as Order['orderType'],
    deliveryAddress: data.deliveryAddress,
    tableNumber: data.tableNumber,
    status: toPartnerStatus(data.status),
    paymentMethod: paymentMethod as Order['paymentMethod'],
    paymentStatus: paymentStatus as Order['paymentStatus'],
    petpoojaOrderId: data.petpoojaOrderId ?? petpoojaDetails.posOrderId,
    petpoojaSyncStatus: petpoojaSyncStatus as Order['petpoojaSyncStatus'],
    porterOrderId: data.porterOrderId,
    deliveryStatus: data.deliveryStatus,
    riderName: data.riderName,
    riderPhone: data.riderPhone,
    riderVehicleNumber: data.riderVehicleNumber,
    riderTrackingUrl: data.riderTrackingUrl,
    kotPrinted: data.kotPrinted,
    kotPrintedAt: data.kotPrintedAt,
    cancellationReason: data.cancellationReason,
    specialInstructions: data.specialInstructions ?? data.notes,
    createdAt,
    updatedAt,
  };
}

export interface RawOrderDoc {
  id: string;
  data: Record<string, any>;
}

/**
 * Fetch Delivery-shaped docs for branch-scoped views.
 *
 * `where('branchId', 'in', …)` never matches Delivery docs (they carry the
 * store id nested at `store.id`), so scoped views run this second query and
 * merge the results. Zero Firestore reads when no linked stores exist.
 * Deliberately no `orderBy` (avoids a composite index and the missing
 * `createdAt` field on Delivery docs) — callers sort client-side.
 */
export async function fetchAliasedStoreOrders(
  db: Firestore,
  branchIds: string[]
): Promise<RawOrderDoc[]> {
  const storeIds = deliveryStoreIdsForBranches(branchIds).slice(0, 10);
  if (storeIds.length === 0) return [];
  const snap = await getDocs(
    query(collection(db, 'orders'), where('store.id', 'in', storeIds))
  );
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, any> }));
}

/** Sort key both apps' timestamps satisfy (ISO string, Timestamp, or number). */
export function orderDocTimeMs(data: Record<string, any>): number {
  const v = data.createdAt ?? data.placedAt ?? data.updatedAt ?? 0;
  try {
    if (v && typeof (v as any).toMillis === 'function') return (v as any).toMillis();
    if (v && typeof (v as any).toDate === 'function') return +(v as any).toDate();
    const t = new Date(v as any).getTime();
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}
