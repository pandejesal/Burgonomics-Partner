import { useMenu } from '@/hooks/useMenu';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/config/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';
import { toast } from 'sonner';
import type { EightSixDuration } from '../components/Instant86ingModal';
import type { MenuItem } from '@/types';

/** POS push outcome — 'skipped' (no POS identity) is NOT a failure. */
type StockPushStatus = 'synced' | 'skipped' | 'failed';

/**
 * All mutations target the canonical `products` collection (one menu source
 * for both apps). Availability changes also propagate to the physical
 * Petpooja POS best-effort — Firestore state is the instant UX either way.
 */
async function pushStock(
  branchId: string,
  items: MenuItem[] | undefined,
  itemId: string,
  inStock: boolean
): Promise<StockPushStatus> {
  const menuItem = items?.find((i) => i.id === itemId);
  // Loop 6: combos carry fabricated local ids (createComboMeal) unknown to
  // Petpooja — pushing one as an item id could 86 an unrelated POS item on
  // id collision, or silently no-op. Combos 86 on the customer app only;
  // component-level POS 86ing is a product call.
  if (menuItem?.isCombo) {
    console.warn(`[useBranchMenu] Combo ${itemId} has no POS identity — POS push skipped (app-only 86)`);
    return 'skipped';
  }
  const petpoojaItemId = menuItem?.petpoojaItemId;
  if (!petpoojaItemId) {
    // Never push a Firestore doc id to the POS as an item id — the KOT side
    // would 86 the wrong item (or nothing) with a success response.
    console.warn(`[useBranchMenu] No petpoojaItemId for ${itemId} — POS push skipped`);
    return 'skipped';
  }
  try {
    await partnerFunctionsApi.toggle86Item({ branchId, itemId: petpoojaItemId, inStock });
    return 'synced';
  } catch (err) {
    console.warn('[useBranchMenu] Petpooja stock push failed (Firestore state kept):', err);
    return 'failed';
  }
}

export function useBranchMenu() {
  const baseMenu = useMenu();
  const queryClient = useQueryClient();
  const { selectedBranchId } = useAppStore();
  const { user } = useAuth();

  // Never default to a delivery store id — products are keyed by branchId and
  // a store id matches nothing, yielding permanently empty menus and writes.
  const branchId = selectedBranchId || user?.branchIds?.[0] || null;

  const toggleAvailability = useMutation({
    mutationFn: async ({
      itemId,
      available,
      isAvailable,
    }: {
      itemId: string;
      available?: boolean;
      isAvailable?: boolean;
      notifyError?: boolean;
    }) => {
      const activeState = available !== undefined ? available : isAvailable ?? true;
      if (!branchId) throw new Error('No branch selected');
      const itemRef = doc(db, 'products', itemId);
      const payload = {
        inStock: activeState,
        disabledUntil: null,
        eightSixDuration: null,
        eightSixReason: null,
        updatedAt: Timestamp.now(),
        lastSyncedAt: Timestamp.now(),
      };
      // F16: no create-on-fail fallback. The old `.catch(() => setDoc(…,
      // { merge: true }))` turned ANY update failure — a rules denial, or a
      // transient error on a doc that already exists — into a partial
      // product document carrying only stock fields. Denials now reject and
      // the optimistic rollback + onError toast below tell staff the truth.
      await updateDoc(itemRef, payload);
      // Server confirmation first, then POS propagation (best-effort): the
      // returned status drives the honest POS-sync toast in onSuccess.
      const posStatus = await pushStock(branchId, baseMenu.items, itemId, activeState);
      return { itemId, available: activeState, posStatus };
    },
    // Optimistic 1-tap: the KDS drawer flips instantly, and the snapshot
    // (or the onError rollback below) is the server confirmation — the UI
    // never claims a state Firestore refused to take.
    onMutate: async ({ itemId, available, isAvailable }) => {
      const activeState = available !== undefined ? available : isAvailable ?? true;
      await queryClient.cancelQueries({ queryKey: ['menuItems', branchId] });
      const previous = queryClient.getQueryData<MenuItem[]>(['menuItems', branchId]);
      if (previous) {
        queryClient.setQueryData<MenuItem[]>(
          ['menuItems', branchId],
          previous.map((i) =>
            i.id === itemId
              ? { ...i, inStock: activeState, isAvailable: activeState, available: activeState }
              : i
          )
        );
      }
      return { previous, itemId };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData<MenuItem[]>(['menuItems', branchId], ctx.previous);
      }
      // Non-blocking: the drawer stays open, the item reverts, staff retries.
      if (vars.notifyError !== false) {
        toast.error('Could not update item stock', {
          description: err instanceof Error ? err.message : 'Firestore write failed — item reverted.',
        });
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['menuItems', branchId] });
      // Non-blocking POS warning: Firestore (the app truth) already took the
      // change — only the physical Petpooja POS is stale. 'skipped' (combos
      // /unlinked items) is by design and stays silent.
      if (result?.posStatus === 'failed') {
        toast.warning('Item updated in app — Petpooja POS sync failed.', {
          description: 'The POS may still show the old stock state. Toggle again to re-push.',
        });
      }
    },
  });

  const markItem86 = useMutation({
    mutationFn: async ({
      itemId,
      duration,
      reason,
    }: {
      itemId: string;
      duration: EightSixDuration;
      reason: string;
      notifyError?: boolean;
    }) => {
      if (!branchId) throw new Error('No branch selected');
      let disabledUntil: Date | null = null;
      const now = new Date();

      if (duration === '2_hours') {
        disabledUntil = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      } else if (duration === 'rest_of_day') {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(6, 0, 0, 0);
        disabledUntil = tomorrow;
      }

      const itemRef = doc(db, 'products', itemId);
      const payload = {
        inStock: false,
        disabledUntil: disabledUntil ? Timestamp.fromDate(disabledUntil) : null,
        eightSixReason: reason,
        eightSixDuration: duration,
        updatedAt: Timestamp.now(),
      };
      // F16: no create-on-fail fallback (see toggleAvailability) — a denied
      // update must not plant a nameless product doc.
      await updateDoc(itemRef, payload);
      // Loop 6: report POS propagation honestly — the page toast must not
      // claim "& POS" when the best-effort push failed or skipped.
      return { posSynced: (await pushStock(branchId, baseMenu.items, itemId, false)) === 'synced' };
    },
    // F16: this mutation had no error path at all — a denied write failed
    // silently while the drawer stayed open. There is no optimistic flip
    // here (state comes from the invalidated snapshot), so nothing to roll
    // back — just say the 86 was not saved.
    onError: (err, vars) => {
      // Same opt-out as the toggle path: a page that renders its own
      // severity-aware role="alert" passes notifyError:false so one rejected
      // write yields ONE error surface, not two. Default callers keep the toast.
      if (vars.notifyError !== false) {
        toast.error('Could not 86 this item — it was NOT marked out of stock.', {
          description: err instanceof Error ? err.message : 'Firestore write failed.',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems', branchId] });
    },
  });

  const toggleCategoryAvailability = useMutation({
    mutationFn: async ({
      categoryId,
      isAvailable,
    }: {
      categoryId: string;
      isAvailable: boolean;
    }) => {
      // No category docs exist (categories derive from items): hiding a
      // category 86s every item in it. Each item still pushes to Petpooja.
      if (!branchId) throw new Error('No branch selected');
      const snap = await getDocs(
        query(
          collection(db, 'products'),
          where('branchId', '==', branchId),
          where('categoryId', '==', categoryId)
        )
      );
      const batch = writeBatch(db);
      snap.docs.forEach((d) => {
        batch.set(
          d.ref,
          {
            inStock: isAvailable,
            // Re-enabling clears stale 86 metadata (see toggleAvailability).
            ...(isAvailable
              ? { disabledUntil: null, eightSixDuration: null, eightSixReason: null }
              : {}),
            updatedAt: Timestamp.now(),
            lastSyncedAt: Timestamp.now(),
          },
          { merge: true }
        );
      });
      await batch.commit();
      for (const d of snap.docs) {
        await pushStock(branchId, baseMenu.items, d.id, isAvailable);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems', branchId] });
    },
  });

  const createComboMeal = useMutation({
    mutationFn: async (comboData: {
      name: string;
      description: string;
      price: number;
      originalPrice: number;
      burgerIds: string[];
      sideIds: string[];
      drinkIds: string[];
    }) => {
      if (!branchId) throw new Error('No branch selected');
      const comboId = `combo_${Date.now().toString(36)}`;
      const itemRef = doc(db, 'products', comboId);

      // Delivery reads by restId and 86-ing joins on petpoojaItemId — both
      // must be stamped or the combo is invisible outside Partner.
      let restId: string | null = null;
      try {
        const branchSnap = await getDoc(doc(db, 'branches', branchId));
        const b = branchSnap.data() as Record<string, any> | undefined;
        if (b?.petpoojaStoreId) restId = b.petpoojaStoreId;
      } catch {
        // restId stays null — combo still visible to Partner scoped views
      }
      if (!restId) {
        console.warn(
          `[useBranchMenu] Branch ${branchId} has no restId — combo ${comboId} will be invisible to the customer app until outlets are linked`
        );
      }

      await setDoc(itemRef, {
        id: comboId,
        // Loop 6: NO fabricated petpoojaItemId — combos don't exist in
        // Petpooja, and a fake id in the shared id space risks 86ing an
        // unrelated POS item. pushStock skips docs without one (app-only 86).
        ...(restId ? { restId } : {}),
        name: comboData.name,
        description: comboData.description,
        price: comboData.price,
        originalPrice: comboData.originalPrice,
        categoryId: 'cat_combos',
        categoryName: 'Combo Meals',
        branchId,
        inStock: true,
        isVeg: true,
        isCombo: true,
        comboComponents: {
          burgers: comboData.burgerIds,
          sides: comboData.sideIds,
          drinks: comboData.drinkIds,
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems', branchId] });
    },
  });

  return {
    ...baseMenu,
    branchId,
    toggleAvailability,
    markItem86,
    toggleCategoryAvailability,
    createComboMeal,
  };
}
