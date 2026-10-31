import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/config/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import type { Order, OrderStatus } from '@/types';
import {
  fetchAliasedStoreOrders,
  normalizeOrderDoc,
  orderDocTimeMs,
} from '@/utils/orderContract';
import { isGlobalRole, resolveScopedBranchIds } from '@/utils/branchScope';

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

export function useOrders(params: UseOrdersParams = {}) {
  const { user } = useAuthStore();
  const { selectedCity, selectedBranchId } = useAppStore();
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['orders', user?.id, user?.role, selectedCity, selectedBranchId, params],
    queryFn: async (): Promise<Order[]> => {
      // The UI selection is user-writable (localStorage) — scoped roles are
      // clamped to their assigned branches; a scoped role with no branches
      // sees nothing, never the global collection.
      const scopeBranchIds = resolveScopedBranchIds(user, selectedBranchId);
      if (!scopeBranchIds.length && !isGlobalRole(user?.role)) return [];

      // Bounded reads: the old code downloaded the ENTIRE orders collection
      // on every mount (5k docs ≈ 10MB + 5k billed reads), and the newer
      // compound query (`branchId in …` + `createdAt >= …` + `orderBy
      // createdAt desc`) throws `FirebaseError: The query requires an index`
      // wherever that composite index is not deployed — and it can never
      // match customer docs whose `createdAt` is an ISO string instead of a
      // Firestore Timestamp (cross-type comparisons are not index-served).
      // So the Firestore read stays single-field, and ordering + dateRange
      // narrowing happen in memory below, where Timestamp and string dates
      // compare correctly.
      const toRawDocs = (snap: {
        docs: Array<{ id: string; data: () => unknown }>;
      }): Array<{ id: string; data: Record<string, any> }> =>
        snap.docs.map((d) => ({
          id: d.id,
          data: d.data() as Record<string, any>,
        }));

      let rawDocs: Array<{ id: string; data: Record<string, any> }> = [];

      if (scopeBranchIds.length > 0) {
        // `in` + inequality/orderBy on another field is exactly the
        // composite-index trap. A plain `in` + `limit` is served by the
        // automatic single-field index alone (same approach as
        // fetchAliasedStoreOrders).
        const scopedSnap = await getDocs(
          query(
            collection(db, 'orders'),
            where('branchId', 'in', scopeBranchIds.slice(0, 10)),
            limit(100)
          )
        );
        rawDocs = toRawDocs(scopedSnap);
      } else {
        // Global role: latest-first ordering on a lone orderBy needs only
        // the automatic single-field index on createdAt.
        try {
          const globalSnap = await getDocs(
            query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100))
          );
          rawDocs = toRawDocs(globalSnap);
        } catch (err) {
          // Index/precondition failure (undeployed composite index, or any
          // other rejection of the sorted read): retry once with a plain
          // bounded read — the in-memory sort below produces the same
          // latest-first list without asking Firestore to order anything.
          console.warn(
            'createdAt orderBy read failed, falling back to bounded unordered read:',
            err
          );
          const fallbackSnap = await getDocs(query(collection(db, 'orders'), limit(100)));
          rawDocs = toRawDocs(fallbackSnap);
        }
      }

      // Branch-scoped views: also pull Delivery docs whose store links to
      // one of the scoped branches (registry). No-op when nothing is linked.
      if (scopeBranchIds.length > 0) {
        try {
          const aliased = await fetchAliasedStoreOrders(db, scopeBranchIds);
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

      // Server-side ordering is deliberately gone (composite-index +
      // cross-type createdAt issues) — latest-first is restored here, where
      // Firestore Timestamps and ISO-string dates both sort correctly.
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
    enabled: !!user,
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

  return { orders, isLoading, error, refetch, dataUpdatedAt, updateOrderStatus };
}
