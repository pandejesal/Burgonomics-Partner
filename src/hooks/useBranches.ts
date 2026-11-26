import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/config/firebase';
import {
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import type { Branch } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { isBrandRole } from '@/core/auth/routePolicy';
import { BRANCH_SECRET_KEYS, restIDsForStoreId, writeBranchSecrets } from '@/utils/branchSecrets';

/**
 * SEC-11: `petpoojaStoreId`, `petpooja` and `restIDs` live in the brand-only
 * `branch_secrets/{branchId}` collection, NOT on `branches/*` (which every
 * operator role can read). They are split out by `takeBranchSecrets` below.
 *
 * `razorpayAccountId` is RETIRED (Razorpay Route per-order transfers are gone,
 * no reader exists in functions/src): it is never migrated, read or written.
 */
const BRANCH_DENIED_UPDATE_KEYS = [
  'monthlyFee',
  'packaging',
  'packagingFee',
  'royaltyPercentage',
  'brandRoyaltyPercent',
  'servicedRadiusKm',
] as const;

/**
 * The secrets patch a caller sent, or `null`. Brand roles write it to
 * `branch_secrets`; branch roles never write it at all (rules deny them that
 * collection, and a default-filled form field counts as a change).
 */
function takeBranchSecrets(
  branchId: string,
  settings: Record<string, any>,
  role: string | undefined,
): Record<string, any> | null {
  const patch: Record<string, any> = {};
  let touched = false;
  for (const key of BRANCH_SECRET_KEYS) {
    if (!(key in settings)) continue;
    patch[key] = settings[key] ?? null;
    delete settings[key];
    touched = true;
  }
  // A POS store id alone implies its restID list — the backend mirror writes
  // exactly that, and a missing list would make the outlet invisible to the
  // customer app's menu read.
  if ('petpoojaStoreId' in patch && !('restIDs' in patch)) {
    patch.restIDs = restIDsForStoreId(patch.petpoojaStoreId);
  }
  if (!touched) return null;
  if (!isBrandRole(role as any)) return null;
  return { branchId, ...patch };
}

export interface CreateBranchInput {
  name: string;
  city: string;
  address: string;
  phone: string;
  status: 'active' | 'coming_soon' | 'paused';
  expectedLaunchDate?: string;
  bannerImage?: string;
  /** Written to `branch_secrets`, never to `branches` (SEC-11). */
  petpoojaStoreId?: string;
  /** Fixed monthly branch fee in rupees; absent means ₹2,500, 0 means none. */
  monthlyFee?: number;
  deliveryRadiusKm?: number;
  prepTimeMinutes?: number;
  operatingHours?: { open: string; close: string };
  coordinates?: { lat: number; lng: number };
  allowComingSoonSubscribers?: boolean;
}

export function useBranches() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data: branches = [], isLoading } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => {
      try {
        const branchesSnap = await getDocs(collection(db, 'branches'));
        const list = branchesSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Branch[];

        if (list.length > 0) return list;
        // Empty backend in production ⇒ no outlets (never seed fakes).
        if (!import.meta.env.DEV) return [];
      } catch (err) {
        console.warn('Error fetching branches from Firestore:', err);
      }

      // Dev-only seed branches (Runbook §8) — production shows no outlets
      // rather than invented ones when the backend is empty/unreachable.
      if (!import.meta.env.DEV) return [];

      return [
        {
          id: 'branch_surat_01',
          name: 'Burgonomics Surat Adajan Outlet',
          city: 'Surat',
          address: 'Shop 4, Prime Arcade, Anand Mahal Rd, Adajan',
          phone: '+91 98765 43210',
          active: true,
          status: 'active',
          acceptingOrdersStatus: 'open',
          prepTimeMinutes: 20,
          deliveryRadiusKm: 7,
          monthlyFee: 2500,
          announcementBanner: '🔥 Weekend Special: Flat 20% off Gourmet Burgers!',
          coordinates: { lat: 21.1959, lng: 72.7933 },
          operatingHours: { open: '11:00 AM', close: '11:30 PM' },
          createdAt: Timestamp.now(),
        },
        {
          id: 'branch_ahmedabad_01',
          name: 'Burgonomics Ahmedabad SG Highway Flagship',
          city: 'Ahmedabad',
          address: 'Ground Floor, Titanium Square, Thaltej',
          phone: '+91 98765 43211',
          active: true,
          status: 'active',
          acceptingOrdersStatus: 'open',
          prepTimeMinutes: 25,
          deliveryRadiusKm: 8,
          monthlyFee: 2500,
          coordinates: { lat: 23.0525, lng: 72.512 },
          operatingHours: { open: '11:00 AM', close: '11:30 PM' },
          createdAt: Timestamp.now(),
        },
        {
          id: 'branch_vadodara_future',
          name: 'Burgonomics Vadodara Alkapuri',
          city: 'Vadodara',
          address: 'RC Dutt Road, Alkapuri',
          phone: '+91 98765 43212',
          active: false,
          status: 'coming_soon',
          expectedLaunchDate: 'October 2026',
          bannerImage:
            'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
          allowComingSoonSubscribers: true,
          subscribersCount: 142,
          monthlyFee: 2500,
          coordinates: { lat: 22.3106, lng: 73.1695 },
          createdAt: Timestamp.now(),
        },
      ];
    },
  });

  const createBranch = useMutation({
    mutationFn: async (branchInput: CreateBranchInput) => {
      // Fail loud: a branch without caller-supplied coordinates must never
      // be written to a default/fabricated location.
      if (!branchInput.coordinates) {
        throw new Error(
          'createBranch requires caller-supplied coordinates — no default location exists.',
        );
      }
      const branchRef = collection(db, 'branches');
      const created = await addDoc(branchRef, {
        name: branchInput.name,
        city: branchInput.city,
        address: branchInput.address,
        phone: branchInput.phone,
        active: branchInput.status === 'active',
        status: branchInput.status,
        expectedLaunchDate: branchInput.expectedLaunchDate || null,
        bannerImage: branchInput.bannerImage || null,
        // SEC-11: the POS identifiers now live in the brand-only
        // `branch_secrets/{branchId}` — `branches/*` is readable by every
        // operator role, so an outlet's POS credentials must not sit here.
        // `razorpayAccountId` is RETIRED (no reader anywhere): never written.
        // Fixed monthly fee (0 is valid and means no fee). Never write the
        // retired per-order royalty percentage on new branches.
        monthlyFee: branchInput.monthlyFee ?? 2500,
        deliveryRadiusKm: branchInput.deliveryRadiusKm || 7,
        prepTimeMinutes: branchInput.prepTimeMinutes || 20,
        operatingHours: branchInput.operatingHours || { open: '11:00 AM', close: '11:30 PM' },
        allowComingSoonSubscribers: branchInput.allowComingSoonSubscribers ?? true,
        subscribersCount: 0,
        coordinates: branchInput.coordinates,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      // Only when the form actually carried a POS id: an empty secrets document
      // is not "linked", it is noise the ops tooling would have to ignore.
      const petpoojaStoreId = branchInput.petpoojaStoreId?.trim();
      if (petpoojaStoreId) {
        await writeBranchSecrets(created.id, {
          petpoojaStoreId,
          restIDs: restIDsForStoreId(petpoojaStoreId),
        });
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });

  const broadcastLaunchAlert = useMutation({
    mutationFn: async ({
      branchId,
      branchName,
      title,
      body,
    }: {
      branchId: string;
      branchName: string;
      title: string;
      body: string;
    }) => {
      // Record announcement in Firestore
      await addDoc(collection(db, 'branch_announcements'), {
        branchId,
        branchName,
        title,
        body,
        targetTopic: `upcoming_${branchId}`,
        createdAt: Timestamp.now(),
      });
      // Loop 5: the record alone notifies nobody — fan out over FCM and
      // fail LOUD when the server refuses, so staff never celebrate an
      // unsent broadcast. The doc above remains as the audit record.
      const { partnerFunctionsApi } = await import('@/services/partnerFunctionsApi');
      const result = await partnerFunctionsApi.broadcastToTopic({
        topic: `upcoming_${branchId}`,
        title,
        body,
      });
      if (!result?.success) {
        throw new Error('Announcement recorded, but push fan-out was refused by the server — subscribers were NOT notified.');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });

  const activateStore = useMutation({
    mutationFn: async ({
      branchId,
      petpoojaStoreId,
    }: {
      branchId: string;
      petpoojaStoreId?: string;
    }) => {
      const branchRef = doc(db, 'branches', branchId);
      const updateData: Record<string, any> = {
        active: true,
        status: 'active',
        updatedAt: Timestamp.now(),
      };
      await updateDoc(branchRef, updateData);
      // SEC-11: the POS id is a secret, not a directory field. `razorpayAccountId`
      // is RETIRED and is not accepted at all (a caller still passing it is
      // deliberately ignored rather than silently persisted).
      const id = petpoojaStoreId?.trim();
      if (id) {
        await writeBranchSecrets(branchId, {
          petpoojaStoreId: id,
          restIDs: restIDsForStoreId(id),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });

  const updateBranchSettings = useMutation({
    mutationFn: async ({
      branchId,
      settings,
    }: {
      branchId: string;
      settings: Partial<Branch>;
    }) => {
      const branchRef = doc(db, 'branches', branchId);
      const writable: Record<string, any> = { ...settings };
      // SEC-11: the POS identifiers belong to `branch_secrets` (brand-only).
      // Pulled out of the branches payload for EVERY role — writing them there is
      // rejected by the hardened rule and would leak them to every operator.
      // `razorpayAccountId` is retired: never written anywhere, by anyone.
      delete writable.razorpayAccountId;
      const secretsPatch = takeBranchSecrets(branchId, writable, user?.role);
      if (!isBrandRole(user?.role)) {
        // Rules reject ANY present value for these keys — even one identical
        // to the stored value. A default-filled form field therefore has to be
        // OMITTED, not sent, or an unrelated save fails.
        for (const key of BRANCH_DENIED_UPDATE_KEYS) {
          delete writable[key];
        }
      }
      // r2 A5: a surge/busy write must be guarded against the FRESH branch,
      // not the session's cached view. A second operator may have closed the
      // outlet after this screen last loaded; without a re-check its stale
      // "busy" save would set active:true over an enforced staff close.
      const surgeWrite =
        writable.acceptingOrdersStatus === 'busy' ||
        (writable.active === true && 'acceptingOrdersStatus' in writable);
      if (surgeWrite) {
        const firestore = await import('firebase/firestore');
        if (typeof firestore.runTransaction === 'function') {
          const rejected = await firestore.runTransaction(db, async (tx) => {
            const snap = await tx.get(branchRef);
            const fresh = (snap.data?.() ?? {}) as Record<string, unknown>;
            const closed =
              fresh.storeStatusOverride === true ||
              fresh.acceptingOrdersStatus === 'closed' ||
              fresh.active === false;
            if (closed) return true;
            tx.update(branchRef, { ...writable, updatedAt: Timestamp.now() });
            return false;
          });
          if (rejected) {
            throw new Error('This outlet is closed — reopen it before setting the kitchen to busy.');
          }
          // D-1: the transaction path must still persist the secrets patch;
          // returning here without it silently dropped a POS id the operator
          // just saved (or, worse, left the old one looking current).
          if (secretsPatch) await writeBranchSecrets(branchId, secretsPatch);
          return;
        }
      }
      await updateDoc(branchRef, {
        ...writable,
        updatedAt: Timestamp.now(),
      }).catch(async () => {
        await setDoc(branchRef, { ...writable, updatedAt: Timestamp.now() }, { merge: true });
      });
      if (secretsPatch) await writeBranchSecrets(branchId, secretsPatch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });

  const toggleBranchStatus = useMutation({
    mutationFn: async ({ branchId, active }: { branchId: string; active: boolean }) => {
      const branchRef = doc(db, 'branches', branchId);
      await updateDoc(branchRef, {
        active,
        status: active ? 'active' : 'inactive',
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });

  return {
    branches,
    isLoading,
    createBranch,
    broadcastLaunchAlert,
    activateStore,
    updateBranchSettings,
    toggleBranchStatus,
  };
}
