import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/config/firebase';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import type { MenuItem, MenuCategory } from '@/types';
import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';
import {
  syncPetpoojaMenuForBranch,
  checkAndAutoSyncMenu,
  BURGONOMICS_DEFAULT_CATEGORIES,
  BURGONOMICS_63_ITEMS,
} from '@/services/petpoojaSync';

/**
 * Seed catalog is DEV-only (Runbook §8). Production with an empty/errored
 * menu backend shows an empty menu — never 63 invented items.
 */
const ALLOW_SEED_CATALOG = import.meta.env.DEV;
const SEED_CATEGORIES: MenuCategory[] = ALLOW_SEED_CATALOG ? BURGONOMICS_DEFAULT_CATEGORIES : [];
const SEED_ITEMS: MenuItem[] = ALLOW_SEED_CATALOG ? (BURGONOMICS_63_ITEMS as MenuItem[]) : [];

/**
 * Canonical menu source: the `products` collection (written by server
 * Petpooja sync). `petpoojaItemId` is the join key for 86-ing both ways.
 * Legacy `menu/{branch}/…`, `petpooja_products` and `petpooja_categories`
 * collections are deprecated — do not read them here.
 */
function mapProductDoc(id: string, data: Record<string, any>): MenuItem {
  const inStock = data.inStock !== false && data.available !== false && data.isAvailable !== false;
  return {
    id,
    name: data.name || 'Item',
    description: data.description || '',
    price: Number(data.price) || 0,
    categoryId: data.categoryId || 'uncategorized',
    category: data.categoryName,
    image: data.imageUrl || data.image,
    available: inStock,
    isAvailable: inStock,
    inStock,
    veg: data.isVeg ?? data.veg ?? true,
    isVeg: data.isVeg ?? data.veg ?? true,
    isJain: data.isJain ?? false,
    isBestSeller: data.isBestSeller ?? false,
    petpoojaItemId: data.petpoojaItemId,
    eightSixDuration: data.eightSixDuration,
    eightSixReason: data.eightSixReason,
    disabledUntil: data.disabledUntil ?? null,
    isCombo: data.isCombo,
    originalPrice: data.originalPrice,
    comboComponents: data.comboComponents,
    lastSyncedAt: data.lastSyncedAt,
  } as MenuItem;
}

export function useMenu() {
  const { user } = useAuth();
  const { selectedBranchId } = useAppStore();
  const queryClient = useQueryClient();

  // Never default to a delivery store id — products are keyed by branchId and
  // a store id matches nothing, yielding a permanently empty menu.
  const branchId = selectedBranchId || user?.branchIds?.[0] || null;

  // Single canonical fetch: `products` where branchId matches. Categories are
  // derived from the items (no category collection — single source of truth).
  const { data: products = [], isLoading: productsLoading } = useQuery<MenuItem[]>({
    queryKey: ['menuItems', branchId],
    queryFn: async () => {
      if (!branchId) return SEED_ITEMS;

      try {
        const itemsSnap = await getDocs(
          query(collection(db, 'products'), where('branchId', '==', branchId))
        );

        if (itemsSnap.empty) {
          try {
            await syncPetpoojaMenuForBranch(branchId);
            const freshSnap = await getDocs(
              query(collection(db, 'products'), where('branchId', '==', branchId))
            );
            if (!freshSnap.empty) {
              return freshSnap.docs.map((d) => mapProductDoc(d.id, d.data() as Record<string, any>));
            }
          } catch {
            // sync denied — fall through to seeds (dev) / empty (prod)
          }
          return SEED_ITEMS;
        }

        return itemsSnap.docs.map((d) => mapProductDoc(d.id, d.data() as Record<string, any>));
      } catch (err) {
        console.warn('Error loading menu items:', err);
        return SEED_ITEMS;
      }
    },
    enabled: !!branchId,
  });

  // Categories derived from the canonical items (first-seen order, counts).
  const categories: MenuCategory[] = useMemo(() => {
    if (products.length === 0) return SEED_CATEGORIES;
    const seen = new Map<string, MenuCategory & { itemCount: number }>();
    for (const item of products) {
      const id = item.categoryId || 'uncategorized';
      const existing = seen.get(id);
      if (existing) {
        existing.itemCount += 1;
      } else {
        seen.set(id, {
          id,
          name: (item as any).category || id,
          sortOrder: seen.size + 1,
          active: true,
          itemCount: 1,
        } as MenuCategory & { itemCount: number });
      }
    }
    return [...seen.values()] as MenuCategory[];
  }, [products]);

  const items = products.length > 0 ? products : SEED_ITEMS;

  // Background staleness check (hourly auto-sync)
  useEffect(() => {
    if (!branchId) return;
    checkAndAutoSyncMenu(branchId)
      .then((didSync) => {
        if (didSync) {
          queryClient.invalidateQueries({ queryKey: ['menuItems', branchId] });
        }
      })
      .catch((err) => {
        console.warn('[useMenu] Background menu auto-sync failed:', err);
      });
  }, [branchId, queryClient]);

  // Toggle item 86-ing / availability on the canonical `products` doc, then
  // propagate to the physical Petpooja POS (best-effort — Firestore write is
  // the instant UX, POS push is reconciled by the retry worker on failure).
  const toggleAvailability = useMutation({
    mutationFn: async ({
      itemId,
      available,
    }: {
      itemId: string;
      available: boolean;
    }) => {
      if (!branchId) throw new Error('No branch selected');

      const itemRef = doc(db, 'products', itemId);
      await updateDoc(itemRef, {
        inStock: available,
        lastSyncedAt: Timestamp.now(),
      });

      const cached = queryClient.getQueryData<MenuItem[]>(['menuItems', branchId]);
      const petpoojaItemId = cached?.find((i) => i.id === itemId)?.petpoojaItemId || itemId;
      try {
        await partnerFunctionsApi.syncItemStock(branchId, petpoojaItemId, available);
      } catch (err) {
        console.warn('[useMenu] Petpooja stock push failed (Firestore state kept):', err);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems', branchId] });
    },
  });

  // Manual Petpooja sync mutation
  const syncPetpooja = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error('No branch selected');
      return syncPetpoojaMenuForBranch(branchId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems', branchId] });
    },
  });

  // Calculate last synced timestamp
  const lastSyncedAt = useMemo(() => {
    if (!items.length) return null;
    const itemWithSync = items.find((i) => i.lastSyncedAt);
    return itemWithSync?.lastSyncedAt || null;
  }, [items]);

  return {
    branchId,
    categories,
    items,
    isLoading: productsLoading,
    lastSyncedAt,
    toggleAvailability,
    syncPetpooja,
  };
}
