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
  Timestamp,
} from 'firebase/firestore';
import type { MenuItem, MenuCategory } from '@/types';
import {
  syncPetpoojaMenuForBranch,
  checkAndAutoSyncMenu,
} from '@/services/petpoojaSync';

export function useMenu() {
  const { user } = useAuth();
  const { selectedBranchId } = useAppStore();
  const queryClient = useQueryClient();

  const branchId = selectedBranchId || user?.branchIds?.[0] || 'store-ahmedabad-prahladnagar';

  // Query categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<MenuCategory[]>({
    queryKey: ['menuCategories', branchId],
    queryFn: async () => {
      if (!branchId) return [];

      try {
        const catsSnap = await getDocs(
          collection(db, 'menu', branchId, 'categories')
        );

        if (catsSnap.empty) {
          // Trigger initial seed if empty
          await syncPetpoojaMenuForBranch(branchId);
          const freshSnap = await getDocs(collection(db, 'menu', branchId, 'categories'));
          return freshSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) as MenuCategory[];
        }

        return catsSnap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) as MenuCategory[];
      } catch (err) {
        console.warn('Error loading menu categories:', err);
        return [];
      }
    },
    enabled: !!branchId,
  });

  // Query items
  const { data: items = [], isLoading: itemsLoading } = useQuery<MenuItem[]>({
    queryKey: ['menuItems', branchId],
    queryFn: async () => {
      if (!branchId) return [];

      try {
        const itemsSnap = await getDocs(
          collection(db, 'menu', branchId, 'items')
        );

        if (itemsSnap.empty) {
          await syncPetpoojaMenuForBranch(branchId);
          const freshItems = await getDocs(collection(db, 'menu', branchId, 'items'));
          return freshItems.docs.map((d) => ({ id: d.id, ...d.data() })) as MenuItem[];
        }

        return itemsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as MenuItem[];
      } catch (err) {
        console.warn('Error loading menu items:', err);
        return [];
      }
    },
    enabled: !!branchId,
  });

  // Background staleness check (hourly auto-sync)
  useEffect(() => {
    if (!branchId) return;
    checkAndAutoSyncMenu(branchId).then((didSync) => {
      if (didSync) {
        queryClient.invalidateQueries({ queryKey: ['menuCategories', branchId] });
        queryClient.invalidateQueries({ queryKey: ['menuItems', branchId] });
      }
    });
  }, [branchId, queryClient]);

  // Toggle item 86-ing / availability
  const toggleAvailability = useMutation({
    mutationFn: async ({
      itemId,
      available,
    }: {
      itemId: string;
      available: boolean;
    }) => {
      if (!branchId) throw new Error('No branch selected');

      const itemRef = doc(db, 'menu', branchId, 'items', itemId);
      await updateDoc(itemRef, {
        available,
        lastSyncedAt: Timestamp.now(),
      });
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
      queryClient.invalidateQueries({ queryKey: ['menuCategories', branchId] });
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
    isLoading: categoriesLoading || itemsLoading,
    lastSyncedAt,
    toggleAvailability,
    syncPetpooja,
  };
}
