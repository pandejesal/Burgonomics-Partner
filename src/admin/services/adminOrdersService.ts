import { db } from "@/core/config/firebase";
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import type { RichOrder } from "../pages/ordersData";
import type {
  CartLine,
  CartTotals,
  OrderAddressSnapshot,
  OrderPaymentInfo,
  OrderStoreSnapshot,
  PaymentDisplayStatus,
} from "@/features/orders/models";
import type { PaymentMethod } from "@/features/payments/models";
import type { Fulfillment } from "@/features/stores/models/Store";
import { useAuthStore } from "@/stores/authStore";
import {
  chunkOrderBranchIds,
  resolveOrderReadScope,
  type OrderReadScope,
} from "@/utils/branchScope";
import {
  normalizeOrderDoc,
  fetchAliasedStoreOrders,
  orderDocTimeMs,
  createKdsIngestionGate,
  resolveGatewayPaymentId,
} from "@/utils/orderContract";
import type { Order as NormalizedOrder } from "@/types";
import { branchIdForDeliveryStore } from "@/utils/storeBranchRegistry";
import { logger } from "@/core/logging/logger";
import { orderStatusWriteErrorMessage } from "@/utils/orderErrors";
import type { QueryConstraint, QuerySnapshot } from "firebase/firestore";

/** A caller identity as the store exposes it (never a token fallback). */
type SessionUser = ReturnType<typeof useAuthStore.getState>["user"];

function orderSessionKey(user: SessionUser | null | undefined): string {
  const scoped = user?.role === "branch_owner" || user?.role === "branch_staff";
  return JSON.stringify([
    user?.id ?? null,
    user?.role ?? null,
    scoped && Array.isArray(user?.branchIds) ? [...user.branchIds].sort() : [],
  ]);
}

function orderScopeKey(scope: OrderReadScope): string {
  return JSON.stringify([scope.global, [...scope.branchIds].sort()]);
}

/**
 * Resolve the Control Room ORDERS read policy from the caller's authoritative
 * assignment. Orders-only: it narrows reads and never grants a write.
 *
 * - brand_owner / developer / support: brand-wide (`support` only through the
 *   new orders read grant). A selected outlet narrows the read.
 * - regional_manager: the ONLY authority is the server-confirmed
 *   `admins/{uid}` registry (`role` + non-empty `branchIds`). Session claims,
 *   token fallbacks, the local selection and city names grant nothing.
 * - branch_owner / branch_staff: the session assignment.
 *
 * The outlet selection is INTERSECTED with the assignment — it can narrow,
 * never add. (The old live constraint unioned the selection into the branch
 * scope, so a forged localStorage outlet widened a scoped read.)
 */
function resolveAdminOrderReadScope(
  user: SessionUser | null | undefined,
  selection: string | null,
  regionalRegistry: unknown,
): OrderReadScope {
  return resolveOrderReadScope(
    user?.role,
    Array.isArray(user?.branchIds) ? user.branchIds : [],
    selection,
    regionalRegistry,
  );
}

/** A scope authorises at least one branch, or the whole brand. */
function scopeIsAuthorised(scope: OrderReadScope): boolean {
  return scope.global || scope.branchIds.length > 0;
}

/**
 * The authoritative regional registry. A cache-served snapshot cannot prove a
 * CURRENT assignment, so it resolves to `null` (a denial) exactly like a
 * missing document; a read error propagates so the board shows its error state
 * instead of a phantom-empty list.
 */
async function readRegionalRegistry(uid: string): Promise<unknown> {
  const snapshot = await getDoc(doc(db, "admins", uid));
  if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || !snapshot.exists()) return null;
  return snapshot.data();
}

/**
 * Keep only rows this scope actually owns. A chunk listener or the alias read
 * can deliver a row outside the authorised set (a revocation racing a page);
 * a branchless Delivery row is reachable only through a brand reader's
 * store-selected alias read.
 */
function rowBelongsToScope(
  data: Record<string, any>,
  scope: OrderReadScope,
  selection: string | null,
): boolean {
  if (scope.global && !selection) return true;
  const branchId = typeof data.branchId === "string" ? data.branchId : null;
  if (branchId && scope.branchIds.includes(branchId)) return true;
  if (!scope.global) return false;
  const storeId = typeof data.store?.id === "string" ? data.store.id : data.storeId;
  return storeId === selection;
}

/** Newest-first merge of every page read for this scope. */
function sortMergedDocs(
  merged: Map<string, Record<string, any>>,
): Array<{ id: string; data: Record<string, any> }> {
  return [...merged.entries()]
    .map(([id, data]) => ({ id, data }))
    .sort((a, b) => orderDocTimeMs(b.data) - orderDocTimeMs(a.data));
}

/** Partner status → admin board status. */
function toRichStatus(o: NormalizedOrder, raw: Record<string, any>): RichOrder["orderStatus"] {
  if (raw.refundStatus === "refunded") return "Refunded";
  switch (o.status) {
    case "pending":
      return "New";
    case "accepted":
      return "Accepted";
    case "preparing":
      return "Preparing";
    case "ready":
      return "Ready";
    case "out_for_delivery":
      return "Out for Delivery";
    case "delivered":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      // Fail CLOSED. 'quarantine' (unknown code / corrupt shape — normalizeOrderDoc
      // already refused to map it) and any status a future writer invents must
      // never land in an actionable bucket: the old fall-through returned "New",
      // which lit up the kitchen board with corrupt docs as fresh work. No order
      // id in the log — the codebase treats full ids as PII; the raw status value
      // is the actionable part of this warning.
      console.warn("adminOrdersService.toRichStatus: unrecognized status quarantined", {
        rawStatus: raw.status ?? null,
        normalizedStatus: o.status,
      });
      return "Needs Review";
  }
}

/**
 * Raw payment state → the one display bucket both `payment.status` (invoice /
 * receipt) and `paymentStatus` (board chip) read, so the two can never drift.
 * Refund lives only on the raw doc — normalizeOrderDoc does not carry it.
 */
function toPaymentDisplayStatus(o: NormalizedOrder, raw: Record<string, any>): PaymentDisplayStatus {
  if (raw.refundStatus === "refunded") return "refunded";
  switch (o.paymentStatus) {
    case "completed":
      return "paid";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

/** Display bucket → board chip. Store-pending settlements are not "Paid". */
const RICH_PAYMENT_STATUS: Record<PaymentDisplayStatus, RichOrder["paymentStatus"]> = {
  paid: "Paid",
  pending: "Pending",
  failed: "Failed",
  refunded: "Refunded",
  PAY_AT_STORE: "Pending",
  CASH_PENDING: "Pending",
};

const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "online",
  "cash",
  "upi",
  "card",
  "netbanking",
  "wallet",
];

const PAYMENT_METHOD_LABELS: Record<OrderPaymentInfo["method"], string> = {
  online: "Online Payment",
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  netbanking: "Net Banking",
  wallet: "Wallet",
  cod: "Cash on Delivery",
  unknown: "Method not recorded",
};

/**
 * Doc payment method → board enum. `razorpay` is a gateway, not an instrument,
 * so it buckets under "online" (the board's payment filter groups it there).
 * An absent/unknown method stays "unknown" — the contract's silent "razorpay"
 * default would otherwise claim a gateway the doc never named.
 */
function toPaymentMethod(rawMethod: unknown): OrderPaymentInfo["method"] {
  const v = strOf(rawMethod).toLowerCase();
  if (v === "cod") return "cod";
  if (v === "razorpay") return "online";
  if (v && (PAYMENT_METHODS as readonly string[]).includes(v)) return v as PaymentMethod;
  return "unknown";
}

/** Normalized money state + raw doc → the full `payment` block. */
function toPaymentInfo(o: NormalizedOrder, raw: Record<string, any>): OrderPaymentInfo {
  const src = (raw.payment ?? {}) as Record<string, any>;
  const method = toPaymentMethod(strOf(src.method) || raw.paymentMethod);
  const transactionId = resolveGatewayPaymentId(raw);
  const paidAtRaw = src.paidAt ?? raw.paidAt;
  const paidAt = paidAtRaw ? isoTime(paidAtRaw, "") : "";
  return {
    method,
    // A doc-provided label (e.g. "UPI · GooglePay") wins; otherwise the method
    // name — never "" (the receipt upper-cases and prints this verbatim).
    label: strOf(src.label) || strOf(raw.paymentLabel) || PAYMENT_METHOD_LABELS[method],
    status: toPaymentDisplayStatus(o, raw),
    ...(transactionId ? { transactionId } : {}),
    ...(paidAt ? { paidAt } : {}),
  };
}

function toRichPetpooja(raw: Record<string, any>): RichOrder["petpoojaStatus"] {
  const v = raw.petpoojaSyncStatus ?? raw.petpoojaStatus;
  // Ambiguous KOT (P1-K): the push may be at the POS or the POS accepted it
  // without an id. It must not read as "Pending" — that state means "not
  // pushed yet", while this one needs a human at the printer.
  if (
    v === "accepted_unconfirmed" ||
    v === "reconciliation_required" ||
    raw.petpoojaAmbiguousProcessing === true ||
    raw.petpoojaAcceptedUnrecorded === true ||
    (raw.petpoojaAcceptedNoId === true && !raw.petpoojaOrderId)
  ) {
    return "Unconfirmed";
  }
  if (v === "synced") return "Synced";
  if (v === "failed") return "Failed";
  if (v === "not_applicable") return "Bypassed";
  return "Pending";
}

function isoTime(v: unknown, fallback: string): string {
  try {
    if (v && typeof (v as any).toMillis === "function") return new Date((v as any).toMillis()).toISOString();
    if (v && typeof (v as any).toDate === "function") return (v as any).toDate().toISOString();
    if (typeof v === "string" && v) return new Date(v).toISOString();
    if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString();
  } catch {
    /* fall through to fallback */
  }
  return fallback;
}

function numOf(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function strOf(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

const FULFILLMENTS: readonly Fulfillment[] = ["delivery", "takeaway", "dinein"];

/**
 * `orderType` (contract) → `fulfillment` (board). A value the contract never
 * validated falls back to the contract's own default instead of leaking a raw
 * string into the fulfillment chips/filters.
 */
function toFulfillment(o: NormalizedOrder): Fulfillment {
  return (FULFILLMENTS as readonly string[]).includes(o.orderType) ? o.orderType : "delivery";
}

/**
 * Display code for the UI/receipt. Doc field when the writer provided one,
 * otherwise the id-derived fallback the rest of the app uses (OrderDetailPage).
 */
function toShortCode(raw: Record<string, any>, id: string): string {
  return strOf(raw.shortCode) || strOf(raw.orderNumber) || id.slice(-6).toUpperCase();
}

/**
 * Money totals. Delivery writes `totals.*`, Partner writes flat
 * `subtotal/tax/deliveryFee/total`; normalizeOrderDoc already unified both into
 * `o`, so the raw doc wins where it exists and `o` is the cross-shape fallback.
 * Nothing is invented: a doc that omitted a value yields 0, never a derived sum.
 */
function toTotals(o: NormalizedOrder, raw: Record<string, any>): CartTotals {
  const src = (raw.totals ?? {}) as Record<string, any>;
  const subtotal = numOf(src.subtotal ?? raw.subtotal, o.subtotal);
  const taxes = numOf(src.taxes ?? src.tax ?? raw.tax, o.tax);
  const deliveryFee = numOf(src.deliveryFee ?? raw.deliveryFee, o.deliveryFee);
  const packingFee = numOf(src.packingFee ?? src.packagingCharge, 0);
  const itemDiscount = numOf(src.itemDiscount, 0);
  const promoDiscount = numOf(src.promoDiscount, 0);
  return {
    subtotal,
    itemDiscount,
    promoDiscount,
    taxes,
    deliveryFee,
    packingFee,
    grandTotal: numOf(src.grandTotal ?? raw.total, o.total),
    currency: "INR",
    deliveryCharge: numOf(src.deliveryCharge, deliveryFee),
    packagingCharge: numOf(src.packagingCharge, packingFee),
    tax: taxes,
    // The drawer + receipt read `discount`; mirror the component discounts so a
    // Delivery doc (promoDiscount only) still shows its deduction.
    discount: numOf(src.discount ?? raw.discount, itemDiscount + promoDiscount),
  };
}

/**
 * Delivery address snapshot — every required key is a string, defaulted to ""
 * (never undefined): the drawer renders this block for delivery orders and the
 * history table walks `address.contactName` as a nested path.
 * Partner docs nest the same data at `deliveryAddress.full`.
 */
function toAddressSnapshot(raw: Record<string, any>): OrderAddressSnapshot {
  const src = (raw.address && typeof raw.address === "object" ? raw.address : {}) as Record<string, any>;
  const alt = (
    raw.deliveryAddress && typeof raw.deliveryAddress === "object" ? raw.deliveryAddress : {}
  ) as Record<string, any>;
  const line2 = strOf(src.line2);
  const landmark = strOf(src.landmark);
  return {
    label: strOf(src.label) || strOf(alt.label),
    contactName: strOf(src.contactName) || strOf(src.name) || strOf(raw.customerName),
    contactPhone: strOf(src.contactPhone) || strOf(src.phone) || strOf(raw.customerPhone),
    line1: strOf(src.line1) || strOf(src.full) || strOf(alt.full) || strOf(alt.line1),
    ...(line2 ? { line2 } : {}),
    ...(landmark ? { landmark } : {}),
    city: strOf(src.city) || strOf(alt.city) || strOf(raw.city),
    state: strOf(src.state) || strOf(alt.state),
    pincode: strOf(src.pincode) || strOf(alt.pincode),
  };
}

/** Store snapshot at placement time — all required keys present as strings. */
function toStoreSnapshot(
  raw: Record<string, any>,
  o: NormalizedOrder,
  storeId: string,
): OrderStoreSnapshot {
  const src = (raw.store && typeof raw.store === "object" ? raw.store : {}) as Record<string, any>;
  return {
    id: storeId,
    // Priority the old code had: nested store name → branch name → the id.
    name: strOf(src.name) || strOf(raw.branchName) || strOf(o.branchName) || storeId,
    address: strOf(src.address) || strOf(src.addressLine1) || strOf(raw.branchAddress),
    area: strOf(src.area),
    city: strOf(src.city) || strOf(raw.city) || strOf(o.city),
    phone: strOf(src.phone),
  };
}

/**
 * Raw cart line → CartLine. Mapped from the raw doc rather than the normalized
 * OrderItem[] because normalizeItems drops lineId/productId/customizations the
 * KOT receipt prints. A non-array (quarantined) item list stays empty.
 */
function toCartLines(rawItems: unknown, storeId: string): CartLine[] {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((it: any, idx: number) => {
    const unitPrice = numOf(it?.unitPrice ?? it?.price, 0);
    const lineId = strOf(it?.lineId) || strOf(it?.itemId) || strOf(it?.productId) || `item_${idx}`;
    const notes = strOf(it?.notes) || strOf(it?.specialInstructions);
    const customizations = Array.isArray(it?.customizations) ? it.customizations : [];
    return {
      lineId,
      id: strOf(it?.id) || lineId,
      productId: strOf(it?.productId) || strOf(it?.itemId) || lineId,
      storeId: strOf(it?.storeId) || storeId,
      name: strOf(it?.name, "Item"),
      unitPrice,
      price: unitPrice,
      quantity: numOf(it?.quantity, 1),
      modifiers: [],
      ...(customizations.length > 0 ? { customizations } : {}),
      ...(notes ? { notes } : {}),
      availability: it?.availability === "unavailable" ? "unavailable" : "available",
    };
  });
}

/** POS sync details — only carried when the doc actually has them. */
function toPetpoojaDetails(raw: Record<string, any>): RichOrder["petpoojaDetails"] {
  const src = (raw.petpoojaDetails ?? {}) as Record<string, any>;
  const kotId = strOf(src.kotId ?? raw.kotId);
  const posOrderId = strOf(src.posOrderId ?? raw.petpoojaOrderId);
  const syncError = strOf(src.syncError);
  const lastAttemptAtRaw = src.lastAttemptAt ?? src.syncedAt;
  if (!kotId && !posOrderId && !syncError && !lastAttemptAtRaw) return undefined;
  return {
    ...(kotId ? { kotId } : {}),
    ...(posOrderId ? { posOrderId } : {}),
    ...(syncError ? { syncError } : {}),
    ...(lastAttemptAtRaw ? { lastAttemptAt: isoTime(lastAttemptAtRaw, "") } : {}),
  };
}

/** Rider assignment — Porter/partner docs carry it flat, others nested. */
function toDeliveryPartner(raw: Record<string, any>): RichOrder["deliveryPartner"] {
  const src = (
    raw.deliveryPartner && typeof raw.deliveryPartner === "object" ? raw.deliveryPartner : {}
  ) as Record<string, any>;
  const name = strOf(src.name) || strOf(raw.riderName);
  const phone = strOf(src.phone) || strOf(raw.riderPhone);
  const vehicleNumber = strOf(src.vehicleNumber) || strOf(raw.riderVehicleNumber);
  if (!name && !phone && !vehicleNumber) return undefined;
  return {
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    ...(vehicleNumber ? { vehicleNumber } : {}),
  };
}

/**
 * Normalized contract order → admin RichOrder.
 *
 * Every required field of the contract is mapped explicitly from the doc (or a
 * shape-correct empty default) — never `undefined`, never a fabricated money
 * value — and there is deliberately no cast at the end, so TypeScript rejects
 * the mapping the moment the contract grows a field. The old
 * `as unknown as RichOrder` hid a half-built object that crashed the drawer
 * on `order.totals.grandTotal.toFixed(2)`.
 */
/**
 * Exported for the KOT-state contract test: the mapping is the thing under
 * test, and going through the live service would need Firestore.
 */
export const toRichOrderForTest: (id: string, raw: Record<string, any>) => RichOrder = toRichOrder;

function toRichOrder(id: string, raw: Record<string, any>): RichOrder {
  const o = normalizeOrderDoc(id, raw);
  const createdAt = isoTime(raw.createdAt ?? raw.placedAt, new Date().toISOString());
  const placedAt = isoTime(raw.placedAt ?? raw.createdAt, createdAt);
  const storeId =
    typeof raw.store?.id === "string" && raw.store.id
      ? raw.store.id
      : typeof raw.storeId === "string" && raw.storeId
        ? raw.storeId
        : o.branchId;
  const payment = toPaymentInfo(o, raw);
  const petpoojaDetails = toPetpoojaDetails(raw);
  const deliveryPartner = toDeliveryPartner(raw);
  const notes = strOf(raw.notes) || strOf(raw.specialInstructions);
  const fulfillmentInstructions = strOf(raw.fulfillmentInstructions);
  const tableNumber = strOf(raw.tableNumber) || strOf(o.tableNumber);
  const kitchenNotes = strOf(raw.kitchenNotes);
  const customerEmail = strOf(raw.customerEmail);
  // Timestamps are carried only when the doc has them — an invalid raw value
  // must not silently become "now".
  const estimatedAtRaw = raw.estimatedAt ?? raw.eta;
  const completedAtRaw = raw.completedAt ?? raw.deliveredAt ?? raw.cancelledAt;
  const estimatedAt = estimatedAtRaw ? isoTime(estimatedAtRaw, "") : "";
  const completedAt = completedAtRaw ? isoTime(completedAtRaw, "") : "";

  return {
    id,
    shortCode: toShortCode(raw, id),
    fulfillment: toFulfillment(o),
    store: toStoreSnapshot(raw, o, storeId),
    address: toAddressSnapshot(raw),
    items: toCartLines(raw.items, storeId),
    totals: toTotals(o, raw),
    payment,
    placedAt,
    orderStatus: toRichStatus(o, raw),
    paymentStatus: RICH_PAYMENT_STATUS[payment.status],
    petpoojaStatus: toRichPetpooja(raw),
    // Ambiguous KOT marker for the drawer prompt: the raw state is the server's
    // and is not part of the display model, so carry the decision derived from
    // the same fields the server's `resolvable` predicate reads.
    petpoojaKotUnconfirmed:
      toRichPetpooja(raw) === "Unconfirmed" && !raw.petpoojaResolution && raw.kotPrinted !== true,
    timeline: Array.isArray(raw.timeline)
      ? raw.timeline.map((t: any) => ({
          title: String(t?.title ?? ""),
          timestamp: isoTime(t?.timestamp, createdAt),
          actor: String(t?.actor ?? t?.actorName ?? ""),
          description: String(t?.description ?? t?.message ?? ""),
        }))
      : [],
    ...(notes ? { notes } : {}),
    ...(fulfillmentInstructions ? { fulfillmentInstructions } : {}),
    ...(tableNumber ? { tableNumber } : {}),
    ...(kitchenNotes ? { kitchenNotes } : {}),
    ...(customerEmail ? { customerEmail } : {}),
    ...(estimatedAt ? { estimatedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(petpoojaDetails ? { petpoojaDetails } : {}),
    ...(deliveryPartner ? { deliveryPartner } : {}),
  };
}

/**
 * Bounded scoped order fetch shared by live + history: one `branchId in` page
 * per chunk of the authorised set (never a global fallback, never a silent
 * truncation) plus the Delivery-aliased store merge (same contract as the KDS
 * makeline). No composite indexes (single-field `in` + client-side sort/filter).
 */
async function fetchScopedOrders(
  scope: OrderReadScope,
  selection: string | null,
  readRole: string | null,
): Promise<Array<{ id: string; data: Record<string, any> }>> {
  const merged = new Map<string, Record<string, any>>();

  if (scope.global && scope.branchIds.length === 0) {
    // Both order schemas need an ordered page: Delivery docs can lack createdAt.
    const pages = await Promise.all(["createdAt", "placedAt"].map((field) =>
      getDocs(query(collection(db, "orders"), orderBy(field, "desc"), limit(100)))
    ));
    for (const [index, snap] of pages.entries()) snap.forEach((d) => {
      const data = d.data() as Record<string, any>;
      if (index === 0 || data.createdAt === undefined) merged.set(d.id, data);
    });
    return sortMergedDocs(merged);
  }

  for (const chunk of chunkOrderBranchIds([...scope.branchIds])) {
    const snap = await getDocs(
      query(collection(db, "orders"), where("branchId", "in", chunk), orderBy("createdAt", "desc"), limit(100))
    );
    snap.forEach((d) => merged.set(d.id, d.data() as Record<string, any>));
  }

  // Delivery-shaped docs carry store.id, not branchId. The helper refuses the
  // store.id-only query for any role that cannot prove brand-wide access, so a
  // regional operator issues no such read (no branchId-less regional alias).
  const aliasScope = selection
    ? [...new Set([selection, branchIdForDeliveryStore(selection)].filter((id): id is string => !!id))]
    : [...scope.branchIds];
  for (const aliased of await fetchAliasedStoreOrders(db, aliasScope, { role: readRole })) {
    if (!merged.has(aliased.id)) merged.set(aliased.id, aliased.data);
  }

  return sortMergedDocs(merged).filter(({ data }) => rowBelongsToScope(data, scope, selection));
}

const LIVE_STATUSES: ReadonlySet<RichOrder["orderStatus"]> = new Set([
  "New",
  "Accepted",
  "Preparing",
  "Ready",
  "Out for Delivery",
]);

const HISTORY_STATUSES: ReadonlySet<RichOrder["orderStatus"]> = new Set([
  "Completed",
  "Cancelled",
  "Refunded",
  // Quarantined docs stay OUT of the live kitchen board but remain visible in
  // the history/audit table — hiding corrupt docs entirely would be a silent
  // data-loss fail-open of its own.
  "Needs Review",
]);

export const adminOrdersService = {
  /**
   * Listen for live incoming orders (normalized contract — the old
   * collectionGroup query on phantom `store.id`/`orderStatus` fields could
   * never match real docs, so this board was permanently empty).
   * An outlet selection only narrows the caller's orders-only read scope.
   */
  listenLiveOrders(
    storeId: string | null,
    onUpdate: (orders: RichOrder[]) => void,
    onError: (err: Error) => void,
  ) {
    const user = useAuthStore.getState().user;
    const selection = storeId && storeId !== "all" ? storeId : null;
    const sessionKey = orderSessionKey(user);
    let cancelled = false;
    let revision = 0;
    let scopeKey: string | null = null;
    let orderUnsubscribers: Array<() => void> = [];
    let unsubscribeRegistry = () => {};
    let unsubscribeAuth = () => {};
    const current = () => !cancelled && orderSessionKey(useAuthStore.getState().user) === sessionKey;
    const clearListeners = () => {
      revision++;
      orderUnsubscribers.forEach((unsubscribe) => unsubscribe());
      orderUnsubscribers = [];
    };
    const retire = () => {
      cancelled = true;
      clearListeners();
      unsubscribeRegistry();
      unsubscribeAuth();
    };
    unsubscribeAuth = useAuthStore.subscribe((state) => {
      if (orderSessionKey(state.user) !== sessionKey) {
        retire();
        onUpdate([]);
      }
    });

    const startScope = (registry: unknown) => {
      if (!current()) return;
      const scope = resolveAdminOrderReadScope(user, selection, registry);
      const nextKey = orderScopeKey(scope);
      if (nextKey === scopeKey) return;
      const replacing = scopeKey !== null;
      scopeKey = nextKey;
      clearListeners();
      if (replacing || !scopeIsAuthorised(scope)) onUpdate([]);
      if (!scopeIsAuthorised(scope)) return;
      const generation = revision;
      const pages = new Map<string, Map<string, Record<string, any>>>();
      const ingestionGate = createKdsIngestionGate();
      const active = () => current() && generation === revision;
      const fail = (error: unknown) => {
        if (!active()) return;
        scopeKey = null;
        clearListeners();
        onUpdate([]);
        onError(error instanceof Error ? error : new Error(String(error)));
      };
      const receivePage = (key: string, field: string) => (snapshot: QuerySnapshot) => {
        if (!active()) return;
        const token = ingestionGate.next();
        const page = new Map<string, Record<string, any>>();
        snapshot.forEach((d) => {
          const data = d.data() as Record<string, any>;
          if ((field === "createdAt" || data.createdAt === undefined) && rowBelongsToScope(data, scope, selection)) page.set(d.id, data);
        });
        pages.set(key, page);
        void (async () => {
          try {
            const aliasScope = selection ? [selection] : scope.branchIds;
            const aliased = await fetchAliasedStoreOrders(db, aliasScope, { role: user?.role ?? null });
            if (!active() || !ingestionGate.isCurrent(token)) return;
            const merged = new Map([...pages.values()].flatMap((p) => [...p.entries()]));
            for (const row of aliased) {
              if (!merged.has(row.id) && rowBelongsToScope(row.data, scope, selection)) merged.set(row.id, row.data);
            }
            const live = sortMergedDocs(merged).map(({ id, data }) => toRichOrder(id, data))
              .filter((order) => LIVE_STATUSES.has(order.orderStatus))
              .sort((a, b) => orderDocTimeMs({ placedAt: a.placedAt }) - orderDocTimeMs({ placedAt: b.placedAt }));
            onUpdate(live);
          } catch (error) {
            if (ingestionGate.isCurrent(token)) fail(error);
          }
        })();
      };
      const subscribe = (key: string, field: string, predicates: QueryConstraint[]) => {
        if (!active()) return;
        const unsubscribe = onSnapshot(
          query(collection(db, "orders"), ...predicates, orderBy(field, "desc"), limit(100)),
          receivePage(key, field),
          fail,
        );
        if (active()) orderUnsubscribers.push(unsubscribe);
        else unsubscribe();
      };
      if (scope.global && scope.branchIds.length === 0) {
        subscribe("createdAt", "createdAt", []);
        subscribe("placedAt", "placedAt", []);
      } else {
        chunkOrderBranchIds(scope.branchIds).forEach((chunk, index) => {
          subscribe(`branch:${index}`, "createdAt", [where("branchId", "in", chunk)]);
        });
      }
    };

    if (user?.role === "regional_manager" && user.id) {
      onUpdate([]);
      unsubscribeRegistry = onSnapshot(doc(db, "admins", user.id), { includeMetadataChanges: true }, (snapshot) => {
        startScope(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || !snapshot.exists() ? null : snapshot.data());
      }, (error) => {
        if (!current()) return;
        clearListeners();
        scopeKey = null;
        onUpdate([]);
        onError(error);
      });
    } else {
      startScope(null);
    }
    return retire;
  },

  /**
   * Notify whenever the caller's authoritative order-read scope changes, so a
   * one-shot reader (history) can clear and reload.
   *
   * A regional scope is the server registry (`admins/{uid}`), which can be
   * revoked or reassigned with no UI event. Cached or pending registry
   * snapshots prove nothing and resolve as denied. Other roles' scope changes
   * only with the session, which retires this watcher.
   */
  watchOrderReadScope(
    storeId: string | null,
    onScopeChange: () => void,
    onError: (err: Error) => void,
  ): () => void {
    const user = useAuthStore.getState().user;
    const selection = storeId && storeId !== "all" ? storeId : null;
    const sessionKey = orderSessionKey(user);
    let cancelled = false;
    let scopeKey: string | null = null;
    let unsubscribeRegistry = () => {};
    let unsubscribeAuth = () => {};
    const retire = () => {
      cancelled = true;
      unsubscribeRegistry();
      unsubscribeAuth();
    };
    unsubscribeAuth = useAuthStore.subscribe((state) => {
      if (orderSessionKey(state.user) !== sessionKey) retire();
    });
    const notify = (registry: unknown) => {
      if (cancelled || orderSessionKey(useAuthStore.getState().user) !== sessionKey) return;
      const nextKey = orderScopeKey(resolveAdminOrderReadScope(user, selection, registry));
      if (nextKey === scopeKey) return;
      scopeKey = nextKey;
      onScopeChange();
    };
    if (user?.role === "regional_manager" && user.id) {
      unsubscribeRegistry = onSnapshot(
        doc(db, "admins", user.id),
        { includeMetadataChanges: true },
        (snapshot) => {
          notify(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || !snapshot.exists() ? null : snapshot.data());
        },
        (error) => {
          if (cancelled) return;
          scopeKey = null;
          onError(error instanceof Error ? error : new Error(String(error)));
        },
      );
    } else {
      notify(null);
    }
    return retire;
  },

  /**
   * Fetch historical orders (completed/cancelled) for the given store.
   */
  async getHistory(storeId: string | null, limitCount = 50): Promise<RichOrder[]> {
    const user = useAuthStore.getState().user;
    const selection = storeId && storeId !== "all" ? storeId : null;
    const sessionKey = orderSessionKey(user);
    let retired = false;
    const unsubscribeAuth = useAuthStore.subscribe((state) => {
      if (orderSessionKey(state.user) !== sessionKey) retired = true;
    });
    try {
      const registry = user?.role === "regional_manager" && user.id ? await readRegionalRegistry(user.id) : null;
      const scope = resolveAdminOrderReadScope(user, selection, registry);
      if (retired || !scopeIsAuthorised(scope)) return [];
      const docs = await fetchScopedOrders(scope, selection, user?.role ?? null);
      if (retired || orderSessionKey(useAuthStore.getState().user) !== sessionKey) return [];
      if (user?.role === "regional_manager") {
        const latest = await readRegionalRegistry(user.id);
        if (retired || orderScopeKey(resolveAdminOrderReadScope(user, selection, latest)) !== orderScopeKey(scope)) return [];
      }
      return docs.map(({ id, data }) => toRichOrder(id, data))
        .filter((order) => HISTORY_STATUSES.has(order.orderStatus))
        .slice(0, Math.max(0, Math.min(100, limitCount)));
    } catch (e) {
      // Rethrow (never phantom-empty): the caller renders the error state
      // with retry. A rules denial/offline used to look like "No orders".
      logger.warn("adminOrdersService.getHistory_failed", {
        message: e instanceof Error ? e.message : String(e),
      });
      throw e instanceof Error ? e : new Error(String(e));
    } finally {
      unsubscribeAuth();
    }
  },

  /**
   * Update the status of an order via the server bump route
   * (POST /orders/bumpStatus): branch-checked write in the
   * Delivery-compatible object form, with the audit timeline entry
   * appended server-side. Direct Firestore flips are gone — they skipped
   * scope enforcement and wrote phantom `orderStatus` strings no reader
   * understands.
   */
  async updateOrderStatus(
    orderId: string,
    status: RichOrder["orderStatus"],
    timelineUpdate?: { title: string; actor: string; description: string },
  ): Promise<void> {
    const toPartner: Record<Exclude<RichOrder["orderStatus"], "Refunded" | "Needs Review">, string> = {
      New: "pending",
      Accepted: "accepted",
      Preparing: "preparing",
      Ready: "ready",
      "Out for Delivery": "out_for_delivery",
      Completed: "delivered",
      Cancelled: "cancelled",
    };
    try {
      // Refunded is a terminal money state owned by the refund flow — a
      // status bump must never rewrite it into 'delivered'.
      if (status === "Refunded") {
        throw new Error("Refunded orders cannot be status-bumped — use the refund flow.");
      }
      // Quarantined docs have an unmappable status; bumping one would write a
      // fresh status over the evidence the review flow needs.
      if (status === "Needs Review") {
        throw new Error("Quarantined orders cannot be status-bumped — review the raw document first.");
      }
      const { partnerFunctionsApi } = await import("@/services/partnerFunctionsApi");
      await partnerFunctionsApi.bumpOrderStatus({
        orderId,
        status: toPartner[status],
        ...(timelineUpdate
          ? {
              timelineEvent: {
                title: timelineUpdate.title,
                actor: timelineUpdate.actor,
                description: timelineUpdate.description,
              },
            }
          : {}),
      });
    } catch (e) {
      logger.warn("adminOrdersService.updateOrderStatus_failed", {
        orderIdSuffix: orderId.slice(-6),
        message: e instanceof Error ? e.message : String(e),
      });
      // Rethrow: returning false made the caller show no error (and even mark
      // the order completed locally) while the server had refused the bump.
      // The mapped message tells staff to use the delivery OTP / courier flow.
      throw new Error(orderStatusWriteErrorMessage(e));
    }
  },
};
