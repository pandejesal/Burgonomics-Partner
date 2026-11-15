import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/config/firebase';
import {
  collection,
  getDocs,
  doc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import type { MenuItem, MenuCategory } from '@/types';
import {
  syncPetpoojaMenuForBranch,
  checkAndAutoSyncMenu,
  BURGONOMICS_63_ITEMS,
  type MenuSyncGuard,
} from '@/services/petpoojaSync';
import { canSyncPetpoojaMenu, MENU_SYNC_DENIED_COPY } from '@/services/petpoojaMenuSyncRoles';
import { isGlobalRole, resolveScopedBranchIds } from '@/utils/branchScope';

/**
 * Seed catalog is DEV-only (Runbook §8) and gate to a GENUINELY empty
 * backend. Production with an empty/errored menu backend shows an honest
 * empty/error menu — never 63 invented items; a failed read never seeds.
 */
const ALLOW_SEED_CATALOG = import.meta.env.DEV;

/**
 * The outlet this session is actually working on right now.
 *
 * Same fallback the hook uses to derive `branchId` (line ~113): the UI
 * selection when there is one, otherwise the first assigned branch. Assigned
 * ownership alone cannot express "the operator is looking at B now", which is
 * why this is computed live rather than read from the render closure.
 */
function effectiveBranchId(user: { branchIds?: string[] } | null | undefined): string | null {
  const selected = useAppStore.getState().selectedBranchId;
  return selected || user?.branchIds?.[0] || null;
}

/**
 * Live authorisation AND ownership check for a menu SYNC (never for a menu
 * read).
 *
 * `products` is world-readable (`firestore.rules:516`), but rewriting the
 * catalog is a manager action gated server-side to brand_owner / developer /
 * regional_manager / branch_owner. The client copy of that rule already lives in
 * `canSyncPetpoojaMenu` (which fails closed); this helper only DECIDES NOT TO
 * ASK — it grants nothing. It deliberately reads the store instead of taking the
 * render's captured values: every sync path sits behind at least one await, and
 * a demoted operator's continuation must not spend the privilege it held when
 * the read started.
 *
 * TWO separate questions, deliberately answered in this order:
 *
 * 1. PERMISSION — may this operator sync at all? `canSyncPetpoojaMenu`, which
 *    fails closed on a missing/unknown role.
 * 2. OWNERSHIP — is this operator still working on the outlet being synced?
 *    A global role is brand-wide, but "allowed to sync any outlet" is not the
 *    same as "still looking at the outlet this operation started on". A
 *    continuation started for A that resolves after a switch to B must not
 *    refresh A: that is stale work, not a privilege it still holds. This
 *    applies to EVERY role, so it is checked BEFORE the global-role answer.
 */
function maySyncMenuNow(branchId: string): boolean {
  const currentUser = useAuthStore.getState().user;
  if (!currentUser || !canSyncPetpoojaMenu(currentUser.role)) return false;
  // Current operation ownership. Selecting B retires an operation started on A.
  if (effectiveBranchId(currentUser) !== branchId) return false;
  // Global roles are brand-wide, so no further scope proof is needed.
  if (isGlobalRole(currentUser.role)) return true;
  const scoped = resolveScopedBranchIds(currentUser, useAppStore.getState().selectedBranchId);
  return scoped.includes(branchId);
}

/**
 * Who started the operation: the session AND the specific hook instance.
 *
 * The session generation answers "is this still the same operator, role and
 * outlet?". It cannot answer "does the component that started this work still
 * exist?", and the R4 review found the gap: `sessionObservers` is reference
 * counted, so one menu screen unmounting while another stayed mounted left the
 * count above zero, the generation never advanced, the departed screen's guard
 * answered `true`, and its background completion invalidated
 * `['menuItems','A']`. Replacing the departed screen with a different consumer
 * in the same turn cancelled the deferred teardown outright.
 *
 * A value cannot express this either: the two consumers share one operator, one
 * role and one outlet. So each `useMenu` instance gets a token of its own, and a
 * token is dead the moment THAT instance unmounts — no other instance can revive
 * it, because no other instance holds the object.
 *
 * React's `<StrictMode>` development replay (setup → cleanup → setup) runs on
 * the SAME instance, so the same object is deactivated and reactivated inside
 * one commit. That is why reactivation is allowed at all: it distinguishes "React
 * is remounting me" from "the screen is gone".
 */
interface MenuSyncOwner {
  active: boolean;
}

/**
 * What a completed manual sync is allowed to tell the caller.
 *
 * `ok` means the operation still owned the outlet when it finished, so the
 * screen showing that outlet may claim freshness. `retired` means the request
 * was already spent — the instance unmounted, the session changed, or the
 * operator moved on — so the completion is nobody's evidence. It is a RESULT,
 * not a rejection: a rejection would let the caller paint a failure on an outlet
 * whose sync may have succeeded.
 *
 * The only field a UI should branch on is `status`; `syncScope` and `result`
 * travel with `ok` because the hook's own `onSuccess` needs them to decide
 * whether to invalidate, and keeping them here avoids a second parallel type.
 */
export type ManualSyncOutcome =
  | { status: 'ok'; branchId: string; syncScope: MenuSyncScope; result: unknown }
  | { status: 'retired'; branchId: string };

/**
 * The identity + outlet a sync operation started under, PLUS the session
 * generation it was captured in and the instance that owns it.
 *
 * The value half (`userId`/`role`/`branchId`) is kept for diagnostics and for
 * the explicit ownership check in `maySyncMenuNow`; `generation` and `owner`
 * decide whether the operation still owns its completion, because a value
 * comparison cannot: `A -> B -> A` restores the identical triple, so "never
 * left" and "left and came back" are indistinguishable by value.
 */
interface MenuSyncScope {
  userId: string | null;
  role: string | null;
  branchId: string | null;
  /** Monotonic session generation at capture time. Never compared by value. */
  generation: number;
  /** The hook instance that started the operation. Fenced by its own lifetime. */
  owner: MenuSyncOwner;
}

/** The part of a scope a transition actually changes. */
interface MenuSyncScopeValue {
  userId: string | null;
  role: string | null;
  branchId: string | null;
}

function readMenuSyncScopeValue(): MenuSyncScopeValue {
  const user = useAuthStore.getState().user;
  return {
    userId: user?.id ?? null,
    role: user?.role ?? null,
    branchId: effectiveBranchId(user),
  };
}

/**
 * Session ledger — the monotonic generation that retires operations.
 *
 * Why this exists at all: `useMenu` starts three privileged operations (the
 * empty-catalog recovery sync, the background staleness check, the manual
 * mutation) and each one outlives the render that started it. Every way an
 * operator can leave an operation behind — demotion, logout, outlet switch —
 * leaves a continuation holding a decision made by an identity that is gone.
 * Comparing captured values cannot close that: the review's `aba-proof-r2.json`
 * showed `A -> B -> A` (an outlet round trip AND a same-account logout/relogin)
 * restoring the captured triple exactly, so the OLD guard answered `true` again
 * and the OLD completion invalidated `['menuItems','A']`.
 *
 * A generation cannot be restored. Every observed transition increments it, and
 * a token is valid only while the generation is unchanged, so:
 *
 * - `A -> B -> A` is +2 and retires the pre-excursion token (2 transitions),
 * - a logout/relogin is +2 for the same reason,
 * - a demotion and restore is +2,
 * - unmount is +1 (see `subscribeMenuSyncSession`),
 * - and a plain switch is +1, which is the M2 fence expressed timelessly.
 *
 * `observedScopeValue` is module state so that the ledger describes THE session
 * rather than one component instance: two menu screens share one operator, so
 * they must share one generation. Nothing here is written to the auth store —
 * this is the hook's own bookkeeping, and the store keeps its current shape.
 */
let sessionGeneration = 0;
let observedScopeValue: MenuSyncScopeValue | null = null;
let sessionObservers = 0;
let releaseStoreSubscriptions: (() => void) | null = null;

/**
 * Reconcile the ledger with the LIVE store, incrementing on a real transition.
 *
 * Two independent ways a transition is caught, deliberately both:
 *
 * 1. The store subscription below fires synchronously from `set()`, so every
 *    intermediate state of an `A -> B -> A` excursion is latched — the thing a
 *    read-at-continuation cannot see.
 * 2. This reconciliation runs at each capture and each check, so a transition
 *    that happened before the subscription was installed (e.g. between the
 *    query starting and the mount effect running) still retires the operation
 *    once, rather than being silently absorbed.
 *
 * A first observation ADOPTS the current value without incrementing: it is a
 * starting point, not a transition.
 */
function observeMenuSyncSession(): number {
  const live = readMenuSyncScopeValue();
  if (observedScopeValue === null) {
    observedScopeValue = live;
    return sessionGeneration;
  }
  if (
    observedScopeValue.userId !== live.userId ||
    observedScopeValue.role !== live.role ||
    observedScopeValue.branchId !== live.branchId
  ) {
    observedScopeValue = live;
    sessionGeneration += 1;
  }
  return sessionGeneration;
}

/**
 * Subscribe to every identity/role/outlet transition for as long as any menu
 * screen is mounted.
 *
 * Reference counting exists only to install the store listeners ONCE for the
 * whole session — two mounted menu screens share one operator, so they must
 * share one generation. It deliberately carries no lifetime semantics: the R4
 * review found that treating "some subscriber still exists" as "the operation
 * owner still exists" left a departed screen's guard reading `true`. That job
 * now belongs to the per-instance owner token, which cannot be confused across
 * instances.
 *
 * `subscribe` is optional-called: several existing suites mock these stores as
 * plain functions. There, the epoch degrades to reconciliation-at-check, which
 * still retires on any value change but cannot see an ABA excursion — a test
 * double's limitation, not a production one.
 */
function subscribeMenuSyncSession(): () => void {
  if (sessionObservers === 0) {
    const latch = () => {
      observeMenuSyncSession();
    };
    const releaseAuth = useAuthStore.subscribe?.(latch);
    const releaseApp = useAppStore.subscribe?.(latch);
    releaseStoreSubscriptions = () => {
      releaseAuth?.();
      releaseApp?.();
    };
  }
  sessionObservers += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    sessionObservers -= 1;
    if (sessionObservers > 0) return;
    releaseStoreSubscriptions?.();
    releaseStoreSubscriptions = null;
  };
}

/**
 * Capture a token for an operation that is about to begin.
 *
 * The value is read first so the token records the outlet the operation really
 * starts on, then the generation is taken from the reconciliation above, so a
 * transition that just happened is counted BEFORE the token exists rather than
 * wrongly invalidating it. `owner` pins the token to this hook instance.
 */
function currentMenuSyncScope(owner: MenuSyncOwner): MenuSyncScope {
  const value = readMenuSyncScopeValue();
  return { ...value, generation: observeMenuSyncSession(), owner };
}

/**
 * Does the operation this token belongs to still own its completion?
 *
 * TWO fences, both required:
 *
 * 1. `owner.active` — the instance that started the work is still mounted. The
 *    effect cleanup clears it synchronously, so it is already false by the time
 *    any completion that was queued behind an unmount runs. No other instance can
 *    set it back: `active` lives on an object only its own hook holds.
 * 2. `generation` equality — the session has not changed operator, role or
 *    outlet since capture, including a "return to where we started" excursion,
 *    which value equality cannot see.
 *
 * A false answer is permanent for that token: the generation only ever grows and
 * the owner object is never handed to a different component, so no later
 * transition can revive a retired operation.
 */
function isSameMenuSyncScope(scope: MenuSyncScope): boolean {
  if (!scope.owner.active) return false;
  return observeMenuSyncSession() === scope.generation;
}

/**
 * The guard handed to the sync service: permission AND unchanged scope, asked
 * again immediately before each side effect. A false answer here is a local
 * refusal (MENU_SYNC_DENIED_COPY inside the service), never a silent success.
 */
function menuSyncGuard(branchId: string, scope: MenuSyncScope): MenuSyncGuard {
  return {
    maySync: () => isSameMenuSyncScope(scope) && maySyncMenuNow(branchId),
  };
}

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

/**
 * Dev-only demo menu for a GENUINELY EMPTY backend (Runbook §8). Copied from
 * the default demo catalog with [DEMO]-prefixed names and NO invented
 * backend-state claims — no fabricated POS-sync timestamps so a row never
 * reads as "synced from Petpooja". Availability toggles on these fallback
 * items reject loudly (updateDoc on a non-existent doc id, F16 no-create).
 */
export function demoSeedMenuItems(): MenuItem[] {
  return (BURGONOMICS_63_ITEMS as MenuItem[]).map((item) => ({
    ...item,
    name: item.name?.startsWith('[DEMO]') ? item.name : `[DEMO] ${item.name}`,
    lastSyncedAt: undefined,
  }));
}

export function useMenu() {
  const { user } = useAuth();
  const { selectedBranchId } = useAppStore();
  const queryClient = useQueryClient();

  // Never default to a delivery store id — products are keyed by branchId and
  // a store id matches nothing, yielding a permanently empty menu.
  const branchId = selectedBranchId || user?.branchIds?.[0] || null;

  /**
   * THIS hook instance's lifetime token. Captured in a ref so it survives
   * re-renders (and StrictMode's synchronous replay of the same instance) and so
   * no other instance can ever hold it.
   */
  const ownerRef = useRef<MenuSyncOwner>({ active: true });

  // Keep the session ledger (see `sessionGeneration`) live for as long as this
  // screen exists, and deactivate THIS instance's owner token when it goes.
  //
  // The owner deactivation is what makes one consumer's unmount retire that
  // consumer's work even while another menu screen is still mounted — the
  // reference-counted session listener cannot express that, and the R4 review
  // found it. Reactivation after a StrictMode replay is safe precisely because
  // the ref belongs to this instance.
  useEffect(() => {
    const owner = ownerRef.current;
    owner.active = true;
    const releaseSession = subscribeMenuSyncSession();
    return () => {
      owner.active = false;
      releaseSession();
    };
  }, []);

  // Single canonical fetch: `products` where branchId matches. Categories are
  // derived from the items (no category collection — single source of truth).
  // Errors surface (not swallowed): MenuPage renders a distinct error/offline
  // panel with Retry instead of the filter-empty dead end. Seeds stay DEV-only.
  const {
    data: products = [],
    isLoading: productsLoading,
    error: productsError,
    refetch: refetchProducts,
  } = useQuery<MenuItem[], Error>({
    queryKey: ['menuItems', branchId],
    queryFn: async () => {
      if (!branchId) {
        // Without a branch there is no menu to read — an honest throw/error
        // in dev too (the demo catalog belongs to a selected outlet only).
        throw new Error('No branch selected');
      }

      try {
        // The operation's identity+outlet, captured before the read. Re-compared
        // by the guard immediately before each sync side effect, so a demotion,
        // logout or outlet switch during the read retires this continuation.
        const syncScope = currentMenuSyncScope(ownerRef.current);
        const itemsSnap = await getDocs(
          query(collection(db, 'products'), where('branchId', '==', branchId))
        );

        if (itemsSnap.empty) {
          // RECOVERY SYNC is privileged: only a role the server would accept may
          // ask for it, and only for the outlet this read started on. Re-checked
          // HERE, after the read above resolved, and again inside the service
          // after ITS awaits — the operator may have been demoted, logged out, or
          // moved to another outlet while either was in flight.
          if (isSameMenuSyncScope(syncScope) && maySyncMenuNow(branchId)) {
            try {
              await syncPetpoojaMenuForBranch(branchId, menuSyncGuard(branchId, syncScope));
              const freshSnap = await getDocs(
                query(collection(db, 'products'), where('branchId', '==', branchId))
              );
              if (!freshSnap.empty) {
                return freshSnap.docs.map((d) => mapProductDoc(d.id, d.data() as Record<string, any>));
              }
            } catch {
              // sync denied — fall through to seeds (dev) / empty (prod)
            }
          }
          if (!ALLOW_SEED_CATALOG) {
            throw new Error('Menu is empty for this outlet — sync from Petpooja.');
          }
          return demoSeedMenuItems();
        }

        return itemsSnap.docs.map((d) => mapProductDoc(d.id, d.data() as Record<string, any>));
      } catch (err: any) {
        // A failed read must never swap in the demo catalog (Runbook §8) —
        // dev and prod alike surface the error and MenuPage show the retry.
        throw err instanceof Error ? err : new Error('Menu failed to load.');
      }
    },
    enabled: !!branchId,
    retry: 1,
  });

  // Categories derived from the canonical items (first-seen order, counts).
  // No seed fallback: an empty/erroring catalog derives zero categories —
  // honest, never invented rails.
  const categories: MenuCategory[] = useMemo(() => {
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

  const items = products;

  // Background staleness check (hourly auto-sync). Privileged: a role the
  // server would refuse must not even start the check, and the check's own
  // completion only invalidates the outlet it ran for.
  useEffect(() => {
    if (!branchId) return;
    if (!maySyncMenuNow(branchId)) return;
    // Captured when the effect starts: the outlet AND identity this completion
    // belongs to, plus THIS instance's owner token. A later switch, takeover or
    // unmount retires it, so a late `true` cannot claim freshness for work the
    // operator has already left behind.
    const syncScope = currentMenuSyncScope(ownerRef.current);
    checkAndAutoSyncMenu(branchId, menuSyncGuard(branchId, syncScope))
      .then((didSync) => {
        if (!didSync) return;
        // Re-checked AFTER the await: the operator may have been demoted, logged
        // out, or switched outlet while the check was in flight.
        if (!isSameMenuSyncScope(syncScope) || !maySyncMenuNow(branchId)) return;
        queryClient.invalidateQueries({ queryKey: ['menuItems', branchId] });
      })
      .catch((err) => {
        console.warn('[useMenu] Background menu auto-sync failed:', err);
      });
  }, [branchId, queryClient]);

  // Manual Petpooja sync mutation. A refused caller is refused LOCALLY and
  // loudly (MENU_SYNC_DENIED_COPY) rather than sending a request the server
  // answers with 403 — the control is already hidden for those roles, so a
  // silent `{ok:true}` here would be the UI claiming a catalog refresh that
  // never happened.
  //
  // The resolved value is a TYPED outcome, not a bare payload, because "the
  // request succeeded" and "this screen may claim the refresh" are different
  // facts. Suppressing the stale invalidation was not enough: `mutateAsync`
  // still RESOLVED, and `MenuPage` awaited that resolution to paint the chip
  // online and announce a refresh — on whatever outlet was selected by then
  // (review r3, `manual-outcome-proof-r3.json`: outcome `ok`, toast, on B).
  // A rejection is not the answer either; it would paint a failure on an outlet
  // whose sync may well have succeeded. So a retired operation reports
  // `{ status: 'retired' }` and the caller can release its pending state without
  // asserting either freshness or failure.
  const syncPetpooja = useMutation<ManualSyncOutcome, Error, void>({
    mutationFn: async () => {
      if (!branchId) throw new Error('No branch selected');
      if (!maySyncMenuNow(branchId)) throw new Error(MENU_SYNC_DENIED_COPY);
      // The mutation's own scope is captured here, and the service re-checks it
      // after ITS awaits. An accepted request cannot be recalled, but a request
      // not yet sent must not be sent by an operator who has since changed.
      const syncScope = currentMenuSyncScope(ownerRef.current);
      let result: Awaited<ReturnType<typeof syncPetpoojaMenuForBranch>>;
      try {
        result = await syncPetpoojaMenuForBranch(
          branchId,
          menuSyncGuard(branchId, syncScope),
        );
      } catch (error) {
        if (!isSameMenuSyncScope(syncScope)) return { status: 'retired', branchId };
        throw error;
      }
      // Past this await the request is already spent. If the owner, session or
      // outlet changed while it was in flight, this completion belongs to
      // nobody: report retirement instead of a success the caller would paint on
      // the wrong outlet.
      if (!isSameMenuSyncScope(syncScope)) {
        return { status: 'retired', branchId };
      }
      // The outlet that STARTED this sync travels with the result, so a
      // completion that lands after an outlet switch cannot be mistaken for the
      // new outlet's freshness.
      return { status: 'ok', branchId, syncScope, result };
    },
    onSuccess: (outcome) => {
      // A pending sync the server already accepted cannot be recalled, but its
      // late completion must not invalidate (or claim freshness for) an outlet
      // the operator has left, or a session they no longer hold.
      if (outcome.status !== 'ok') return;
      const { branchId: syncedBranchId, syncScope } = outcome;
      if (!isSameMenuSyncScope(syncScope)) return;
      if (effectiveBranchId(useAuthStore.getState().user) !== syncedBranchId) return;
      queryClient.invalidateQueries({ queryKey: ['menuItems', syncedBranchId] });
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
    error: productsError,
    refetch: refetchProducts,
    lastSyncedAt,
    syncPetpooja,
  };
}
