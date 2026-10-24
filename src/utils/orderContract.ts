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
 * (Menu pipeline is unified separately on the canonical `products`
 * collection — see Runbook §5/§9.)
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
  // Rider-cancelled orders still need fulfillment (rebook) — they must stay
  // in the actionable dispatch bucket, NEVER 'pending' (which reads as a
  // brand-new order). needsRebook + deliveryStatus ride alongside.
  RIDER_CANCELLED: 'out_for_delivery',
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
  // Quarantined docs stay visible (non-terminal) but never read as fresh or
  // done work. Written only by review flows, never by the kitchen fast path.
  quarantine: { code: 'QUARANTINED', label: 'Needs review', kind: 'unknown', terminal: false },
};

/**
 * STRESS SWEEP 2026-10-24 (K) — canonical forward-transition matrix, exported
 * as a pure helper for future UI gating. NOT wired into any live call path:
 * the 60-second Recall (`recallLastOrder`) and the module's own
 * `toPartnerStatus` semantics treat BACKWARD moves as deliberate operator
 * corrections, and the server's transactional freeze (functions
 * orderStatus.ts) plus the offline-queue TTL already bound the harmful
 * replays. Enabling the matrix as a hard gate is a product decision.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['accepted', 'preparing', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'delivered', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
  quarantine: ['cancelled'],
};

export const canTransitionStatus = (from: OrderStatus, to: OrderStatus): boolean =>
  (ALLOWED_TRANSITIONS[from] ?? []).includes(to);

/** Normalize any status shape (object, UPPER, lower) to Partner status.
 * Unknown codes fail CLOSED to 'quarantine' — never to 'pending', which would
 * surface a corrupt doc as fresh kitchen/dispatch work. */
export function toPartnerStatus(raw: unknown): OrderStatus {
  if (typeof raw === 'string') {
    return DELIVERY_TO_PARTNER[raw] ?? DELIVERY_TO_PARTNER[raw.toUpperCase()] ?? 'quarantine';
  }
  if (raw && typeof raw === 'object') {
    const code = (raw as { code?: unknown }).code;
    if (typeof code === 'string') {
      return DELIVERY_TO_PARTNER[code] ?? DELIVERY_TO_PARTNER[code.toUpperCase()] ?? 'quarantine';
    }
    return 'quarantine';
  }
  return 'quarantine';
}

/** Machine-readable reason for a quarantined status, for the review banner. */
export function quarantineReasonFor(raw: unknown): string {
  if (raw == null) return 'missing status field';
  if (typeof raw === 'string') return `unrecognized status '${raw}'`;
  if (typeof raw === 'object') {
    const code = (raw as { code?: unknown }).code;
    return typeof code === 'string'
      ? `unrecognized status code '${code}'`
      : 'malformed status object (no code)';
  }
  return 'malformed status value';
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

/**
 * The gateway capture id for an order doc. Both screens that can refund
 * (order detail and the Control Room board) resolve it here, so the same
 * document can never send one id from one screen and a different (or empty)
 * id from the other. Ranked by the board's documented order, and blank or
 * whitespace-only fields fall through instead of stopping the chain.
 */
export function resolveGatewayPaymentId(data: Record<string, any>): string | undefined {
  const payment = (data.payment ?? {}) as Record<string, any>;
  for (const candidate of [
    payment.transactionId,
    payment.razorpayPaymentId,
    data.razorpayPaymentId,
    payment.paymentId,
    data.paymentId,
  ]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

/**
 * Coerce one raw modifier/add-on/customization entry to a printable label.
 * Source docs disagree on shape (plain string, `{ name }`, `{ label }`,
 * Petpooja `{ addon_name }`, `{ name, price }`), and a non-string is what
 * used to reach JSX and white-screen the KDS card — so objects collapse to
 * their label and anything unlabelled is dropped, never rendered raw.
 */
export function modifierLabel(v: unknown): string | null {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  for (const key of [
    'name',
    'label',
    'title',
    'displayName',
    // Customer-app cart lines carry the option under `optionName` when the
    // group is the only other field — dropping it would hide the add-on.
    'optionName',
    'option_name',
    'modifierName',
    'addonName',
    'addon_name',
  ]) {
    const candidate = o[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate.trim();
  }
  return null;
}

/** Keys both apps store add-on lines under, in merge order. */
const MODIFIER_KEYS = [
  'modifiers',
  'addons',
  'addonItems',
  'addonitem',
  'selectedModifiers',
  'customizations',
] as const;

/**
 * Modifier labels for one order line, merged (and de-duplicated) across
 * every key spelling either app writes. Empty when the line has none.
 */
export function modifierLabelsFrom(item: unknown): string[] {
  if (!item || typeof item !== 'object') return [];
  const src = item as Record<string, unknown>;
  const seen = new Set<string>();
  for (const key of MODIFIER_KEYS) {
    const raw = src[key];
    if (!Array.isArray(raw)) continue;
    for (const entry of raw) {
      const label = modifierLabel(entry);
      if (label) seen.add(label);
    }
  }
  return [...seen];
}

function normalizeModifiers(it: Record<string, any>): string[] | undefined {
  const labels = modifierLabelsFrom(it);
  return labels.length > 0 ? labels : undefined;
}

function normalizeItems(raw: unknown): OrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((it: any, idx: number) => {
    const modifiers = normalizeModifiers(it);
    return {
      itemId: str(it?.itemId ?? it?.productId, `item_${idx}`),
      petpoojaItemId: str(it?.petpoojaItemId ?? it?.meta?.petpoojaItemId),
      name: str(it?.name, 'Item'),
      quantity: num(it?.quantity, 1),
      price: num(it?.price ?? it?.unitPrice, 0),
      specialInstructions: it?.specialInstructions ?? it?.notes,
      ...(modifiers ? { modifiers } : {}),
    };
  });
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

  // Fail-closed normalization: unknown statuses land in 'quarantine' with a
  // reason (never fail-open to 'pending'); malformed items are quarantined
  // too instead of surfacing as fresh work with invented lines.
  const status = (
    !Array.isArray(data.items) ? 'quarantine' : toPartnerStatus(data.status)
  ) as Order['status'];
  const reasons: string[] = [];
  if (status === 'quarantine' && Array.isArray(data.items)) {
    reasons.push(quarantineReasonFor(data.status));
  }
  const items = normalizeItems(data.items);
  if (!Array.isArray(data.items)) reasons.push('malformed items (not a list)');

  // MT-31: address normalization. Delivery saves it at `data.address`, the
  // Partner shape at `data.deliveryAddress`; partial snapshots may carry only
  // `line1/city/pincode` with no `full` string. Build `full` from parts so
  // every directions affordance gets a readable destination, and coerce
  // lat/lng from either key spelling.
  const rawDelivery = (data.deliveryAddress || data.address || null) as Record<string, any> | null;
  const formattedFull =
    str(rawDelivery?.full) ||
    [
      rawDelivery?.line1,
      rawDelivery?.line2,
      rawDelivery?.landmark,
      rawDelivery?.city,
      rawDelivery?.pincode,
    ]
      .filter(Boolean)
      .join(', ') ||
    str(rawDelivery?.street) ||
    str(rawDelivery?.address) ||
    str(rawDelivery?.label) ||
    '';
  const deliveryAddress = rawDelivery
    ? {
        ...rawDelivery,
        full: formattedFull,
        lat: num(rawDelivery.lat ?? rawDelivery.latitude),
        lng: num(rawDelivery.lng ?? rawDelivery.longitude),
      }
    : null;

  return {
    id,
    customerId: str(data.customerId ?? data.userId),
    customerName: str(data.customerName ?? address.contactName, 'Customer'),
    customerPhone: str(data.customerPhone ?? address.contactPhone),
    branchId,
    branchName: data.branchName ?? store.name,
    city: data.city ?? store.city ?? address.city,
    items,
    subtotal: num(data.subtotal ?? totals.subtotal),
    tax: num(data.tax ?? totals.taxes ?? totals.tax),
    deliveryFee: num(data.deliveryFee ?? totals.deliveryFee),
    total: num(data.total ?? totals.grandTotal),
    orderType: (data.orderType ?? data.fulfillment ?? 'delivery') as Order['orderType'],
    // Delivery (customer app) saves the address at `data.address`, never at
    // `data.deliveryAddress` — without this fallback order.deliveryAddress is
    // undefined and every directions affordance (OrderDetailPage,
    // PorterDispatchCard, dispatch quotes) silently drops out. MT-31 then
    // normalizes `full` from parts and coerces lat/lng key spellings.
    deliveryAddress: deliveryAddress as any,
    store: data.store ? { ...data.store } : undefined,
    branchCoordinates:
      data.branchCoordinates ??
      (typeof store.lat === 'number' && typeof store.lng === 'number'
        ? { lat: store.lat, lng: store.lng }
        : undefined),
    tableNumber: data.tableNumber,
    status,
    ...(reasons.length > 0 ? { quarantineReason: reasons.join('; ') } : {}),
    paymentMethod: paymentMethod as Order['paymentMethod'],
    paymentStatus: paymentStatus as Order['paymentStatus'],
    razorpayPaymentId: resolveGatewayPaymentId(data),
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

export interface KdsIngestionGate {
  /** Issue the next generation token for a started read/fetch. */
  next: () => number;
  /** Whether a generation token is still the newest one (stale merges drop). */
  isCurrent: (token: number) => boolean;
}

/**
 * STRESS SWEEP 2026-10-24 (H1): order views that merge an async alias fetch
 * into a live snapshot ran unsequenced — a SLOWER earlier fetch could resolve
 * AFTER a newer snapshot and clobber the view with stale order states (a
 * bumped ticket reappearing in 'pending' during a rush). The gate is the
 * latest-wins seam shared by the KDS makeline and the Control Room board:
 * every merge checks in before touching state.
 */
export const createKdsIngestionGate = (): KdsIngestionGate => {
  let latest = 0;
  return {
    next: () => ++latest,
    isCurrent: (token: number) => token === latest,
  };
};

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
