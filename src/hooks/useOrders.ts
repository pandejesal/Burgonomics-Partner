import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/config/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import type { Order, OrderStatus } from '@/types';
import {
  fetchAliasedStoreOrders,
  normalizeOrderDoc,
  orderDocTimeMs,
  toDeliveryStatusMeta,
} from '@/utils/orderContract';
import { isGlobalRole, resolveScopedBranchIds } from '@/utils/branchScope';

/**
 * Demo seeds are DEV-only (Runbook §8). Production shows real orders or an
 * explicit empty/error state — never invented customers and revenue.
 */
const ALLOW_DEMO_SEEDS = import.meta.env.DEV;

interface UseOrdersParams {
  status?: OrderStatus | 'all';
  dateRange?: 'today' | 'week' | 'month' | 'all';
}

export function useOrders(params: UseOrdersParams = {}) {
  const { user } = useAuthStore();
  const { selectedCity, selectedBranchId } = useAppStore();
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ['orders', user?.id, user?.role, selectedCity, selectedBranchId, params],
    queryFn: async (): Promise<Order[]> => {
      try {
        // The UI selection is user-writable (localStorage) — scoped roles are
        // clamped to their assigned branches; a scoped role with no branches
        // sees nothing, never the global collection.
        const scopeBranchIds = resolveScopedBranchIds(user, selectedBranchId);
        if (!scopeBranchIds.length && !isGlobalRole(user?.role)) return [];

        const ordersQuery = scopeBranchIds.length
          ? query(
              collection(db, 'orders'),
              where('branchId', 'in', scopeBranchIds.slice(0, 10)),
              orderBy('createdAt', 'desc'),
            )
          : query(collection(db, 'orders'), orderBy('createdAt', 'desc'));

        const ordersSnap = await getDocs(ordersQuery);

        // Raw docs first: delivery-app docs (nested store/status/totals) and
        // partner docs share this collection — normalized below.
        const rawDocs = ordersSnap.docs.map((d) => ({
          id: d.id,
          data: d.data() as Record<string, any>,
        }));

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
            rawDocs.sort((a, b) => orderDocTimeMs(b.data) - orderDocTimeMs(a.data));
          } catch (err) {
            console.warn('Alias store order fetch failed, using direct results:', err);
          }
        }

        let list: Order[] = rawDocs.map((d) => normalizeOrderDoc(d.id, d.data));

        // Dev-only seed orders when Firestore is empty (never in production)
        if (list.length === 0 && ALLOW_DEMO_SEEDS) {
          list = [
            {
              id: 'ord_901',
              customerId: 'cust_01',
              customerName: 'Aarav Mehta',
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
              paymentStatus: 'completed',
              petpoojaOrderId: 'PP-ORD-8812',
              petpoojaSyncStatus: 'synced',
              kotPrinted: true,
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            },
            {
              id: 'ord_902',
              customerId: 'cust_02',
              customerName: 'Pooja Patel',
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
              paymentStatus: 'completed',
              petpoojaOrderId: 'PP-ORD-8813',
              petpoojaSyncStatus: 'synced',
              kotPrinted: true,
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            },
            {
              id: 'ord_903',
              customerId: 'cust_03',
              customerName: 'Rohan Sharma',
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
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            },
            {
              id: 'ord_904',
              customerId: 'cust_04',
              customerName: 'Neha Kothari',
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
              paymentStatus: 'completed',
              petpoojaOrderId: 'PP-ORD-8810',
              petpoojaSyncStatus: 'synced',
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            },
          ];
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

        return list;
      } catch (err) {
        // Production must surface the error, not mask it with fake orders.
        if (!ALLOW_DEMO_SEEDS) throw err;
        console.warn('Error fetching orders, returning dev seed orders:', err);
        let list: Order[] = [
          {
            id: 'ord_901',
            customerId: 'cust_01',
            customerName: 'Aarav Mehta',
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
            paymentStatus: 'completed',
            petpoojaOrderId: 'PP-ORD-8812',
            petpoojaSyncStatus: 'synced',
            kotPrinted: true,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          },
          {
            id: 'ord_902',
            customerId: 'cust_02',
            customerName: 'Pooja Patel',
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
            paymentStatus: 'completed',
            petpoojaOrderId: 'PP-ORD-8813',
            petpoojaSyncStatus: 'synced',
            kotPrinted: true,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          },
          {
            id: 'ord_903',
            customerId: 'cust_03',
            customerName: 'Rohan Sharma',
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
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          },
          {
            id: 'ord_904',
            customerId: 'cust_04',
            customerName: 'Neha Kothari',
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
            paymentStatus: 'completed',
            petpoojaOrderId: 'PP-ORD-8810',
            petpoojaSyncStatus: 'synced',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          },
        ];

        if (['branch_owner', 'branch_staff'].includes(user?.role || '') && user?.branchIds?.length) {
          const myBranchId = user.branchIds[0];
          list = list.filter((o) => o.branchId === myBranchId);
        }

        if (selectedCity && selectedCity !== 'all') {
          list = list.filter((o) => !o.city || o.city.toLowerCase() === selectedCity.toLowerCase());
        }

        if (selectedBranchId && selectedBranchId !== 'all') {
          list = list.filter((o) => o.branchId === selectedBranchId);
        }

        if (params.status && params.status !== 'all') {
          list = list.filter((o) => o.status === params.status);
        }

        return list;
      }
    },
    enabled: !!user,
  });

  const updateOrderStatus = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const orderRef = doc(db, 'orders', orderId);
      // Write Delivery-compatible object form so customer-side tracking
      // keeps resolving after a kitchen bump; Partner readers normalize.
      await updateDoc(orderRef, {
        status: toDeliveryStatusMeta(status),
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const simulateOrder = useMutation({
    mutationFn: async (customParams?: { branchId?: string; branchName?: string; orderType?: 'delivery' | 'takeaway' | 'dinein' }) => {
      const targetBranchId = customParams?.branchId || selectedBranchId || user?.branchIds?.[0] || 'branch_surat_01';
      const targetBranchName = customParams?.branchName || (targetBranchId === 'branch_surat_01' ? 'Surat Adajan' : 'Ahmedabad SG Highway');
      const orderType = customParams?.orderType || (['delivery', 'takeaway', 'dinein'] as const)[Math.floor(Math.random() * 3)];
      
      const newOrderId = `ord_kds_${Date.now().toString().slice(-4)}`;
      const sampleNames = ['Kavita Shah', 'Dev Patel', 'Ananya Roy', 'Varun Mehta', 'Ritika Joshi'];
      const randomName = sampleNames[Math.floor(Math.random() * sampleNames.length)];
      
      const sampleItems = [
        { itemId: 'itm_double_truffle', petpoojaItemId: 'PP-BRG-101', name: 'Double Truffle Smash Burger', quantity: 1, price: 349 },
        { itemId: 'itm_paneer_makhani', petpoojaItemId: 'PP-BRG-103', name: 'Paneer Makhani Burst Burger', quantity: 2, price: 199 },
        { itemId: 'itm_peri_peri_fries', petpoojaItemId: 'PP-SDE-301', name: 'Peri-Peri Crinkle Fries', quantity: 1, price: 99 },
        { itemId: 'itm_mango_jalapeno', petpoojaItemId: 'PP-BRG-106', name: 'Mango Jalapeño Blast Burger', quantity: 1, price: 229 },
      ];
      
      const selectedItems = [
        sampleItems[Math.floor(Math.random() * 2)],
        sampleItems[2 + Math.floor(Math.random() * 2)],
      ];

      const subtotal = selectedItems.reduce((acc, i) => acc + i.price * i.quantity, 0);
      const tax = Math.round(subtotal * 0.05);
      const deliveryFee = orderType === 'delivery' ? 35 : 0;
      const total = subtotal + tax + deliveryFee;

      const orderData: Partial<Order> = {
        id: newOrderId,
        customerId: `cust_${Date.now().toString().slice(-3)}`,
        customerName: randomName,
        customerPhone: `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`,
        branchId: targetBranchId,
        branchName: targetBranchName,
        city: targetBranchId.includes('surat') ? 'Surat' : 'Ahmedabad',
        items: selectedItems,
        subtotal,
        tax,
        deliveryFee,
        total,
        orderType,
        // Delivery-compatible object form (see orderContract); readers normalize.
        status: toDeliveryStatusMeta('pending') as unknown as OrderStatus,
        paymentMethod: 'upi',
        paymentStatus: 'completed',
        petpoojaOrderId: `PP-KDS-${newOrderId}`,
        petpoojaSyncStatus: 'synced',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      try {
        const orderRef = doc(db, 'orders', newOrderId);
        await updateDoc(orderRef, orderData as any).catch(async () => {
          // If doc doesn't exist yet in firestore, try setDoc or let mock query handle
          const { setDoc } = await import('firebase/firestore');
          await setDoc(orderRef, orderData);
        });
      } catch (e) {
        console.warn('Simulated order generated in memory / firestore:', e);
      }

      return orderData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  return { orders, isLoading, error, updateOrderStatus, simulateOrder };
}
