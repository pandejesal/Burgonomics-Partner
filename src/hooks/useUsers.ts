import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { db } from '@/config/firebase';
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import type { UserRole } from '@/types';
import { hashPinSimple } from '@/core/auth/pinHelpers';

/** Firestore rules intentionally deny most staff reads (users/{uid} is
 * owner-or-brand). A denied read is an HONEST empty — any other failure
 * propagates (Runbook §8: no fake data masks broken wiring). */
export function isPermissionDenied(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'permission-denied'
  );
}

/**
 * Dev-only seed roster (Runbook §8). [DEMO]-prefixed names, and NO invented
 * presence/session claims (no "Live in KDS" / "Just now") — a demo roster is
 * a UI fixture, not a record that anyone is online. PIN hashes exist only for
 * the dev demo login and authenticate nothing (sessions roster is empty).
 */
export function demoSeedRoster(): TeamUser[] {
  return [
    {
      id: 'user_aarav_brand',
      name: '[DEMO] Aarav Mehta',
      email: 'aarav.mehta@burgonomics.in',
      phone: '+91 98251 00001',
      role: 'brand_owner' as UserRole,
      active: true,
      pinSet: true,
      hashedPin: hashPinSimple('9999'),
      cityIds: ['Surat', 'Ahmedabad', 'Mumbai', 'Vadodara'],
      createdAt: Timestamp.fromMillis(Date.now() - 60 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'user_ananya_reg',
      name: '[DEMO] Ananya Deshmukh',
      email: 'ananya.deshmukh@burgonomics.in',
      phone: '+91 97654 88123',
      role: 'regional_manager' as UserRole,
      active: true,
      pinSet: true,
      hashedPin: hashPinSimple('7777'),
      cityIds: ['Ahmedabad', 'Surat'],
      branchIds: ['branch_surat_01', 'branch_ahmedabad_01'],
      createdAt: Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'user_sanjay_owner',
      name: '[DEMO] Sanjay Patel',
      email: 'sanjay.patel@burgonomics.in',
      phone: '+91 98765 43210',
      role: 'branch_owner' as UserRole,
      active: true,
      pinSet: true,
      hashedPin: hashPinSimple('5678'),
      branchIds: ['branch_surat_01'],
      cityIds: ['Surat'],
      createdAt: Timestamp.fromMillis(Date.now() - 45 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'user_ramesh_kitchen',
      name: '[DEMO] Ramesh Patel',
      email: 'ramesh.kitchen@burgonomics.in',
      phone: '+91 98765 43219',
      role: 'branch_staff' as UserRole,
      active: true,
      pinSet: true,
      hashedPin: hashPinSimple('1234'),
      branchIds: ['branch_surat_01'],
      cityIds: ['Surat'],
      createdAt: Timestamp.fromMillis(Date.now() - 20 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'user_priya_support',
      name: '[DEMO] Priya Sharma',
      email: 'priya.support@burgonomics.in',
      phone: '+91 98200 99887',
      role: 'support' as UserRole,
      active: true,
      pinSet: true,
      hashedPin: hashPinSimple('4321'),
      cityIds: ['Surat', 'Ahmedabad'],
      createdAt: Timestamp.fromMillis(Date.now() - 15 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'user_alex_dev',
      name: '[DEMO] Alex',
      email: 'alex.dev@burgonomics.in',
      phone: '+91 99999 88888',
      role: 'developer' as UserRole,
      active: true,
      pinSet: true,
      hashedPin: hashPinSimple('0000'),
      createdAt: Timestamp.fromMillis(Date.now() - 90 * 24 * 60 * 60 * 1000),
    },
  ];
}

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  branchIds?: string[];
  cityIds?: string[];
  active?: boolean;
  pin?: string;
  hashedPin?: string;
  pinSet?: boolean;
  lastActiveAt?: any;
  createdAt?: any;
  invitedBy?: string;
  updatedAt?: any;
}

export function useUsers() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading, error } = useQuery<TeamUser[]>({
    queryKey: ['team-users', user?.id],
    queryFn: async () => {
      // Loop 43/120: bounded (same class as prior loops). Note: non-brand
      // roles read near-nothing here by rules design (users/{uid} is
      // owner-or-brand) — empty is honest. DEV-only seed roster loads when
      // the collection is genuinely EMPTY; a PERMISSION-DENIED for those
      // roles is also an honest empty (documented rules design), while any
      // OTHER read failure surfaces as an error instead of a seed roster
      // (Runbook §8: no fake data masks broken wiring).
      let usersQuery = query(collection(db, 'users'), limit(500));

      if (user?.role === 'regional_manager' && user.cityIds?.length) {
        usersQuery = query(
          collection(db, 'users'),
          where('cityIds', 'array-contains-any', user.cityIds),
          limit(500)
        );
      }

      const usersSnap = await getDocs(usersQuery).catch((err) => {
        if (isPermissionDenied(err)) return null; // honest empty by design
        throw err; // real backend failure — surface, never mask with seeds
      });
      if (usersSnap === null || usersSnap.empty) {
        if (!import.meta.env.DEV) return [];
        return demoSeedRoster();
      }

      return usersSnap.docs.map((d) => ({
        id: d.id,
        active: true,
        pinSet: true,
        ...d.data(),
      })) as TeamUser[];
    },
    enabled: !!user,
  });

  const inviteUser = useMutation({
    mutationFn: async (userData: {
      name: string;
      email: string;
      phone: string;
      role: UserRole;
      branchIds: string[];
      cityIds: string[];
      pin?: string;
    }) => {
      // Readiness-6: invites go through POST /staff/invite (brand-only).
      // The old direct users/ write was rules-denied by design and always
      // failed. A PIN is never sent — the strict server schema 400s it;
      // staff set their own at first sign-in.
      if (userData.pin) {
        throw new Error(
          "Staff set their own POS PIN at first sign-in — remove it and retry."
        );
      }
      const { partnerFunctionsApi } = await import(
        "@/services/partnerFunctionsApi"
      );
      const res = await partnerFunctionsApi.inviteStaff({
        name: userData.name,
        email: userData.email,
        phone: userData.phone || undefined,
        role: userData.role,
        branchIds: userData.branchIds,
        cityIds: userData.cityIds,
      });
      return res.uid;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-users'] });
    },
  });

  const updateUser = useMutation({
    mutationFn: async ({
      userId,
      updates,
    }: {
      userId: string;
      updates: Partial<TeamUser>;
    }) => {
      const userRef = doc(db, 'users', userId);
      const cleanedUpdates = { ...updates };
      if (updates.pin) {
        cleanedUpdates.hashedPin = hashPinSimple(updates.pin);
        cleanedUpdates.pinSet = true;
      }

      await updateDoc(userRef, {
        ...cleanedUpdates,
        updatedAt: Timestamp.now(),
      }).catch(async () => {
        await setDoc(userRef, { ...cleanedUpdates, updatedAt: Timestamp.now() }, { merge: true });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-users'] });
    },
  });

  const toggleUserStatus = useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        active,
        updatedAt: Timestamp.now(),
      }).catch(async () => {
        await setDoc(userRef, { active, updatedAt: Timestamp.now() }, { merge: true });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-users'] });
    },
  });

  const revokeUser = useMutation({
    mutationFn: async (userId: string) => {
      // F13: revoking access means clearing the target's RBAC claims, which
      // only the server can do — POST /auth/revokeRole (brand-admin asserted
      // server-side). The old `deleteDoc(users/{userId})` was hard-denied by
      // rules (`allow delete: if false`), so every revoke failed while the
      // dialog promised credentials were disabled. Failures now propagate to
      // UsersPage, which toasts them instead of closing the modal.
      const { partnerFunctionsApi } = await import(
        "@/services/partnerFunctionsApi"
      );
      return await partnerFunctionsApi.revokeUserRole({ targetUid: userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-users'] });
    },
  });

  return { users, isLoading, error, inviteUser, updateUser, toggleUserStatus, revokeUser };
}
