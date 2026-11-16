import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/config/firebase';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import type { Order, OrderStatus } from '@/types';
import {
  fetchAliasedStoreOrders,
  normalizeOrderDoc,
  orderDocTimeMs,
} from '@/utils/orderContract';
import { chunkOrderBranchIds, isGlobalRole, resolveOrderReadScope, resolveScopedBranchIds } from '@/utils/branchScope';

/**
 * Demo seeds are DEV-only (Runbook §8). Production shows real orders or an
 * explicit empty/error state — never invented customers and revenue.
 */
const ALLOW_DEMO_SEEDS = import.meta.env.DEV;

/**
 * Dev-only seed orders shown when a store's order board is genuinely EMPTY
 * (never as an error fallback — a failed read throws and the UI surfaces the
 * error instead). Runbook §8 honesty: fabrications are visibly labeled
 * ([DEMO] name prefix) and carry NO invented backend-state claims — nothing
 * here asserts a completed payment, a Petpooja push, or a printed KOT. These
 * are UI-flow fixtures, not records of money/POS/KOT events.
 */
export function demoSeedOrders(): Order[] {  return [
    {
      id: 'ord_901',
      customerId: 'cust_01',
      customerName: '[DEMO] Aarav Mehta',
      customerPhone: '+91 98251 12345',
      branchId: 'branch_surat_01',
      branchName: 'Surat Adajan',
      city: 'Surat',
      items: [
        {
          itemId: 'itm_paneer_makhani_burst',
          petpoojaItemId: 'PP-BRG-103',
          name: 'Paneer Makhani Burst Burger',
          quantity: 2,
          price: 199,
        },
        {
          itemId: 'itm_peri_peri_fries',
          petpoojaItemId: 'PP-SDE-301',
          name: 'Peri-Peri Crinkle Fries',
          quantity: 1,
          price: 99,
        },
      ],
      subtotal: 497,
      tax: 25,
      deliveryFee: 30,
      total: 552,
      orderType: 'delivery',
      status: 'preparing',
      paymentMethod: 'razorpay',
      paymentStatus: 'pending',
      petpoojaSyncStatus: 'pending',
      kotPrinted: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
    {
      id: 'ord_902',
      customerId: 'cust_02',
      customerName: '[DEMO] Pooja Patel',
      customerPhone: '+91 99099 87654',
      branchId: 'branch_ahmedabad_01',
      branchName: 'Ahmedabad SG Highway',
      city: 'Ahmedabad',
      items: [
        {
          itemId: 'itm_cheese_lava_monster',
          petpoojaItemId: 'PP-BRG-104',
          name: 'Cheese Lava Monster Burger',
          quantity: 1,
          price: 249,
        },
      ],
      subtotal: 249,
      tax: 12,
      deliveryFee: 0,
      total: 261,
      orderType: 'takeaway',
      status: 'ready',
      paymentMethod: 'upi',
      paymentStatus: 'pending',
      petpoojaSyncStatus: 'pending',
      kotPrinted: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
    {
      id: 'ord_903',
      customerId: 'cust_03',
      customerName: '[DEMO] Rohan Sharma',
      customerPhone: '+91 98791 23456',
      branchId: 'branch_surat_01',
      branchName: 'Surat Adajan',
      city: 'Surat',
      items: [
        {
          itemId: 'itm_classic_crunch',
          petpoojaItemId: 'PP-BRG-101',
          name: 'Classic Veggie Crunch Burger',
          quantity: 2,
          price: 129,
        },
      ],
      subtotal: 258,
      tax: 13,
      deliveryFee: 30,
      total: 301,
      orderType: 'delivery',
      status: 'pending',
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      petpoojaSyncStatus: 'pending',
      kotPrinted: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
    {
      id: 'ord_904',
      customerId: 'cust_04',
      customerName: '[DEMO] Neha Kothari',
      customerPhone: '+91 98240 55678',
      branchId: 'branch_ahmedabad_01',
      branchName: 'Ahmedabad SG Highway',
      city: 'Ahmedabad',
      items: [
        {
          itemId: 'itm_smoky_bbq_mushroom',
          petpoojaItemId: 'PP-BRG-105',
          name: 'Smoky BBQ Portobello Burger',
          quantity: 1,
          price: 219,
        },
      ],
      subtotal: 219,
      tax: 11,
      deliveryFee: 30,
      total: 260,
      orderType: 'delivery',
      status: 'delivered',
      paymentMethod: 'razorpay',
      paymentStatus: 'pending',
      petpoojaSyncStatus: 'pending',
      kotPrinted: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
  ];
}

interface UseOrdersParams {
  status?: OrderStatus | 'all';
  dateRange?: 'today' | 'week' | 'month' | 'all';
}

/**
 * Ownership proof for the rows `useOrders` returns.
 *
 * The fields intentionally mirror `kdsAuthScopeKey`'s inputs so a consumer can
 * compare a full authorisation key instead of guessing from the current user.
 * Present only for genuine cached data (see `ordersDataScope` construction).
 */
export interface OrdersDataScope {
  userId: string | null;
  role: string | null;
  resolvedBranchIds: string[];
  selectedBranchId: string | null;
}

interface ScopedFeed {
  key: string;
  orders: Order[];
  branchIds: string[];
  loading: boolean;
  error: Error | null;
  updatedAt: number;
}

/**
 * One shared empty list for the not-yet-scoped fallback. Consumers key effects
 * on these arrays (the KDS seeding effect does), so a fresh `[]` per render is
 * an identity change, not "no change".
 */
const NO_SCOPED_ORDERS: Order[] = [];
const NO_SCOPED_BRANCHES: string[] = [];

function useScopedOrderFeed(user: ReturnType<typeof useAuthStore.getState>['user'], selection: string | null) {
  const scoped = !!user && !['brand_owner', 'developer', 'support'].includes(user.role);
  // The assignment ORDER is not an access dimension: [y,z] and [z,y] grant the
  // same rows. Canonicalise the set so an equivalent reorder keeps the live
  // subscriptions instead of tearing them down and re-reading the same scope.
  // A malformed claim shape is treated as "no assignment" rather than crashing
  // the render before the scope resolver can fail closed.
  const assignedBranchIds = Array.isArray(user?.branchIds) ? user.branchIds : [];
  const assignedKey = [...new Set(assignedBranchIds)].sort();
  const key = JSON.stringify([user?.id, user?.role, assignedKey, selection]);
  const [generation, setGeneration] = useState(0);
  const [feed, setFeed] = useState<ScopedFeed>({ key: '', orders: [], branchIds: [], loading: true, error: null, updatedAt: 0 });

  useEffect(() => {
    if (!scoped || !user) return;
    let active = true;
    let revision = 0;
    let orderUnsubscribers: Array<() => void> = [];
    const clearListeners = () => { orderUnsubscribers.forEach((unsubscribe) => unsubscribe()); orderUnsubscribers = []; };
    const fail = (error: Error) => {
      if (!active) return;
      revision++;
      clearListeners();
      setFeed({ key, orders: [], branchIds: [], loading: false, error, updatedAt: 0 });
    };
    const start = (registry: unknown) => {
      revision++;
      const currentRevision = revision;
      clearListeners();
      const { branchIds } = resolveOrderReadScope(user.role, Array.isArray(user.branchIds) ? user.branchIds : [], selection, registry);
      const chunks = chunkOrderBranchIds(branchIds);
      // Ownership is provable only from a server-confirmed snapshot. A denied
      // or empty scope starts no listener, so it must NOT advertise a
      // descriptor — an empty board is not verified data.
      setFeed({ key, orders: [], branchIds, loading: chunks.length > 0, error: null, updatedAt: 0 });
      const pages = new Map<number, Array<{ id: string; data: Record<string, any> }>>();
      chunks.forEach((chunk, index) => {
        const unsubscribe = onSnapshot(
          query(collection(db, 'orders'), where('branchId', 'in', chunk), orderBy('createdAt', 'desc'), limit(100)),
          (snapshot) => {
            if (!active || revision !== currentRevision) return;
            pages.set(index, snapshot.docs.map((row) => ({ id: row.id, data: row.data() })).filter((row) => chunk.includes(row.data.branchId)));
            const merged = new Map([...pages.values()].flat().map((row) => [row.id, row]));
            const orders = [...merged.values()]
              .sort((a, b) => orderDocTimeMs(b.data) - orderDocTimeMs(a.data))
              .slice(0, 100)
              .map((row) => normalizeOrderDoc(row.id, row.data));
            const complete = pages.size === chunks.length;
            setFeed({ key, orders: complete ? orders : [], branchIds, loading: !complete, error: null, updatedAt: complete ? Date.now() : 0 });
          },
          (error) => { if (revision === currentRevision) fail(error); },
        );
        orderUnsubscribers.push(unsubscribe);
      });
    };
    setFeed({ key, orders: [], branchIds: [], loading: true, error: null, updatedAt: 0 });
    const unsubscribeRegistry = user.role === 'regional_manager'
      ? onSnapshot(doc(db, 'admins', user.id), { includeMetadataChanges: true }, (snapshot) => {
          if (!active) return;
          // Cached registry data cannot prove a current assignment.
          start(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || !snapshot.exists() ? null : snapshot.data());
        }, fail)
      : (start(null), () => {});
    return () => { active = false; revision++; unsubscribeRegistry(); clearListeners(); };
  }, [key, scoped, generation]);

  const current = feed.key === key
    ? feed
    : { key, orders: NO_SCOPED_ORDERS, branchIds: NO_SCOPED_BRANCHES, loading: true, error: null, updatedAt: 0 };
  // Stable like React Query's `refetch`: consumers list it in effect deps.
  const refresh = useCallback(() => setGeneration((value) => value + 1), []);
  return { scoped, ...current, refresh };
}

export function useOrders(params: UseOrdersParams = {}) {
  const { user } = useAuthStore();
  const { selectedCity, selectedBranchId } = useAppStore();
  const queryClient = useQueryClient();
  const scopedFeed = useScopedOrderFeed(user, selectedBranchId);

  /**
   * The branch scope this read is actually clamped to. Note the product filter
   * below still narrows branch_owner/staff rows to `branchIds[0]`; this is the
   * QUERY scope, which is what the cache entry must be keyed by.
   */
  const resolvedBranchIds = useMemo(
    () =>
      [...new Set(resolveScopedBranchIds(user, selectedBranchId).map((id) => String(id).trim()))]
        .filter((id) => id.length > 0)
        .sort(),
    [user, selectedBranchId]
  );

  /**
   * The RAW primary branch the final projection uses. `branch_owner` and
   * `branch_staff` rows are filtered to `user.branchIds[0]` below, so swapping
   * `[y,z]` → `[z,y]` changes which tickets can appear even though the
   * normalised full set is identical. The normalised `resolvedBranchIds` alone
   * cannot express that, so the raw primary is a separate key dimension.
   */
  const rawPrimaryBranchId = user?.branchIds?.[0] ?? null;

  /**
   * The actual `in` operand of the direct read: the RAW resolver output capped
   * to the first ten, with ONLY its order normalised.
   *
   * Order matters. `queryFn` calls
   * `where('branchId', 'in', resolveScopedBranchIds(user, selection).slice(0, 10))`
   * — resolved FIRST, capped SECOND. Sorting before the cap would change which
   * ten branches are queried, i.e. silently alter query semantics.
   *
   * The VALUES are never trimmed, string-coerced or filtered: `queryFn` passes
   * them through verbatim, so whitespace-only differences are genuinely
   * different operands and must not share a cache entry. Only duplicate
   * detection and ordering are normalised, and only AFTER the cap.
   *
   * Known limit: the alias read uses the full raw scope, whose raw ordering is
   * still not modelled here — that contract dimension remains open.
   */
  const directReadBranchIds = useMemo(() => {
    const raw = resolveScopedBranchIds(user, selectedBranchId);
    const capped = raw.slice(0, 10);
    return [...new Set(capped)].sort();
  }, [user, selectedBranchId]);

  const { data: orders = [], isLoading, error, refetch, dataUpdatedAt, isPlaceholderData } = useQuery({
    // Provenance boundary. The key carries the dimensions proven to drive this
    // query: uid, role, city, selection, params, the full normalised branch
    // scope, the RAW primary ("first assigned branch") projection input, and the
    // actual capped `in` operand with its raw values preserved. The normalised
    // full set alone was insufficient: it hides both which branch the final row
    // filter keeps and which ten raw branches the direct read asked for.
    //
    // Not a claim of completeness: the alias read's full-scope raw ordering is
    // still unmodelled (tracked as an open contract gap, not silently ignored).
    queryKey: [
      'orders',
      user?.id,
      user?.role,
      selectedCity,
      selectedBranchId,
      params,
      resolvedBranchIds,
      rawPrimaryBranchId,
      directReadBranchIds,
    ],
    queryFn: async (): Promise<Order[]> => {
      // The UI selection is user-writable (localStorage) — scoped roles are
      // clamped to their assigned branches; a scoped role with no branches
      // sees nothing, never the global collection.
      const scopeBranchIds = resolveScopedBranchIds(user, selectedBranchId);
      if (!scopeBranchIds.length && !isGlobalRole(user?.role)) return [];

      // Order BEFORE limiting: sorting an arbitrary 100 document names cannot
      // recover newer orders excluded by the limit. Scoped reads require the
      // branchId/createdAt composite already declared in the root manifest.
      // An unavailable index is a query error, never an unordered success.
      // Legacy mixed createdAt types still require data normalization: server
      // ordering groups Firestore value types; the merge sort is page-local.
      const toRawDocs = (snap: {
        docs: Array<{ id: string; data: () => unknown }>;
      }): Array<{ id: string; data: Record<string, any> }> =>
        snap.docs.map((d) => ({
          id: d.id,
          data: d.data() as Record<string, any>,
        }));

      // The ROLE THIS READ runs under: the identity the query key pins.
      //
      // Deliberately the RENDER-captured `user`, not `getState()`: every other
      // scope decision in this queryFn (and the key itself) is built from that
      // same closure value. Mixing in a live read would let an identity change
      // mid-flight pair a NEW role with the OLD scope — i.e. widen the
      // privileged alias read past what the cache entry was keyed for.
      const readRole = user?.role ?? null;

      let rawDocs: Array<{ id: string; data: Record<string, any> }> = [];

      if (scopeBranchIds.length > 0) {
        const scopedSnap = await getDocs(
          query(
            collection(db, 'orders'),
            where('branchId', 'in', scopeBranchIds.slice(0, 10)),
            orderBy('createdAt', 'desc'),
            limit(100)
          )
        );
        rawDocs = toRawDocs(scopedSnap);
      } else {
        // Global role: latest-first ordering on a lone orderBy needs only
        // the automatic single-field index on createdAt.
        // Delivery-shaped orders use placedAt and may have no createdAt.
        // Firestore orderBy excludes a missing field, so merge both schema
        // pages; never substitute an unordered page after an ordered failure.
        const pages = await Promise.all(['createdAt', 'placedAt'].map((field) =>
          getDocs(query(collection(db, 'orders'), orderBy(field, 'desc'), limit(100)))
        ));
        // A record with both fields belongs to the primary createdAt feed.
        // Otherwise a delayed placedAt snapshot could rewind its status.
        const rows = pages.flatMap((page, index) => toRawDocs(page).filter((doc) =>
          index === 0 || doc.data.createdAt === undefined
        ));
        rawDocs = [...new Map(rows.map((doc) => [doc.id, doc])).values()];
      }

      // Branch-scoped views: also pull Delivery docs whose store links to
      // one of the scoped branches (registry). No-op when nothing is linked and
      // no-op for a role that cannot prove brand-wide access — the helper
      // refuses without sending.
      if (scopeBranchIds.length > 0) {
        try {
          const aliased = await fetchAliasedStoreOrders(db, scopeBranchIds, { role: readRole });
          const seen = new Set(rawDocs.map((d) => d.id));
          for (const doc of aliased) {
            if (!seen.has(doc.id)) {
              seen.add(doc.id);
              rawDocs.push(doc);
            }
          }
        } catch (err) {
          console.warn('Alias store order fetch failed, using direct results:', err);
        }
      }

      // Normalize ordering within the fetched/aliased pages. This cannot
      // recover documents omitted by any query's limit or missing sort field.
      rawDocs.sort((a, b) => orderDocTimeMs(b.data) - orderDocTimeMs(a.data));

      let list: Order[] = rawDocs.map((d) => normalizeOrderDoc(d.id, d.data));

      // Dev-only seed orders when Firestore is genuinely empty (never as an
      // error fallback — a failed read throws and the UI shows the error).
      if (list.length === 0 && ALLOW_DEMO_SEEDS) {
        list = demoSeedOrders();
      }

      // Branch Staff & Owner Scoping: strictly own branch
      if (['branch_owner', 'branch_staff'].includes(user?.role || '') && user?.branchIds?.length) {
        const myBranchId = user.branchIds[0];
        list = list.filter((o) => o.branchId === myBranchId);
      }

      // City & Branch Filtering for Brand Owner / Dev / Support / Regional
      if (selectedCity && selectedCity !== 'all') {
        list = list.filter((o) => !o.city || o.city.toLowerCase() === selectedCity.toLowerCase());
      }

      if (selectedBranchId && selectedBranchId !== 'all') {
        list = list.filter((o) => o.branchId === selectedBranchId);
      }

      // Status Filter
      if (params.status && params.status !== 'all') {
        list = list.filter((o) => o.status === params.status);
      }

      // Date Range Filter (client-side, never a server inequality): a
      // `where('createdAt', '>=', …)` would demand a composite index AND
      // silently drop customer docs whose createdAt/placedAt is an ISO
      // string (Firestore only range-serves Timestamps). orderDocTimeMs
      // understands Timestamps, ISO strings and epoch numbers alike.
      const rangeStartMs = (() => {
        const now = new Date();
        if (params.dateRange === 'today') {
          return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        }
        if (params.dateRange === 'week') {
          return now.getTime() - 7 * 24 * 60 * 60 * 1000;
        }
        if (params.dateRange === 'month') {
          return now.getTime() - 30 * 24 * 60 * 60 * 1000;
        }
        return null;
      })();

      if (rangeStartMs !== null) {
        list = list.filter(
          (o) => orderDocTimeMs(o as unknown as Record<string, any>) >= rangeStartMs
        );
      }

      return list;
    },
    enabled: !!user && !scopedFeed.scoped,
    // One-shot getDocs: without a poll the "Auto-refreshes" badge was a lie
    // — the list froze at mount until a manual navigation. 30s keeps the
    // orders board current without a listener; the KDS owns its own
    // onSnapshot stream and is unaffected.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const updateOrderStatus = useMutation({
    mutationFn: async ({
      orderId,
      status,
      expectedStatus,
    }: {
      orderId: string;
      status: OrderStatus;
      /**
       * The status the caller's screen currently shows for this order —
       * lost-update precondition for the server transaction. Optional so a
       * caller with no live status (e.g. a replayed offline queue entry
       * written before this contract existed) still bumps, loudly, rather
       * than silently dropping the action.
       */
      expectedStatus?: OrderStatus;
    }) => {
      // Server-side bump (POST /orders/bumpStatus): branch-checked write in
      // the Delivery-compatible object form. The old direct updateDoc skipped
      // scope enforcement on every KDS bump.
      const { partnerFunctionsApi } = await import('@/services/partnerFunctionsApi');
      await partnerFunctionsApi.bumpOrderStatus({
        orderId,
        status,
        ...(expectedStatus ? { expectedStatus } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  /**
   * Provenance descriptor for the rows in `orders`.
   *
   * Returned ONLY when the cache entry behind those rows is genuine data for
   * THIS authorisation scope: a real fetch has completed (`dataUpdatedAt > 0`)
   * and react-query is not serving a placeholder from a previous query. A
   * placeholder is precisely the previous identity's entry, so it can never be
   * ownership proof — and we never stamp the current user onto it.
   */
  const ordersDataScope: OrdersDataScope | null = scopedFeed.scoped
    ? scopedFeed.updatedAt > 0 ? { userId: user?.id ?? null, role: user?.role ?? null, resolvedBranchIds: scopedFeed.branchIds, selectedBranchId: selectedBranchId ?? null } : null
    :
    dataUpdatedAt > 0 && !isPlaceholderData
      ? {
          userId: user?.id ?? null,
          role: user?.role ?? null,
          resolvedBranchIds,
          selectedBranchId: selectedBranchId ?? null,
        }
      : null;

  // Memoised: a new array on every render made consumer effects keyed on
  // `orders` (KDS seeding) set state on every render — an unbounded loop. The
  // rows only change when the feed or a filter changes, exactly as React
  // Query's `data` behaves on the unscoped path.
  const scopedOrders = useMemo(() => scopedFeed.orders.filter((order) => {
    if (selectedCity && selectedCity !== 'all' && order.city && order.city.toLowerCase() !== selectedCity.toLowerCase()) return false;
    if (params.status && params.status !== 'all' && order.status !== params.status) return false;
    if (params.dateRange && params.dateRange !== 'all') {
      const now = new Date();
      const start = params.dateRange === 'today' ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() : now.getTime() - (params.dateRange === 'week' ? 7 : 30) * 86400000;
      if (orderDocTimeMs(order as unknown as Record<string, any>) < start) return false;
    }
    return true;
  }), [scopedFeed.orders, selectedCity, params.status, params.dateRange]);
  return {
    orders: scopedFeed.scoped ? scopedOrders : orders,
    isLoading: scopedFeed.scoped ? scopedFeed.loading : isLoading,
    error: scopedFeed.scoped ? scopedFeed.error : error,
    refetch: scopedFeed.scoped ? scopedFeed.refresh : refetch,
    dataUpdatedAt: scopedFeed.scoped ? scopedFeed.updatedAt : dataUpdatedAt,
    updateOrderStatus,
    ordersDataScope,
  };
}
