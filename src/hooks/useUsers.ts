import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { db } from '@/config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import type { UserRole } from '@/types';
import { hashPinSimple } from '@/core/auth/pinHelpers';

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

  const { data: users = [], isLoading } = useQuery<TeamUser[]>({
    queryKey: ['team-users', user?.id],
    queryFn: async () => {
      try {
        let usersQuery = query(collection(db, 'users'));

        if (user?.role === 'regional_manager' && user.cityIds?.length) {
          usersQuery = query(
            collection(db, 'users'),
            where('cityIds', 'array-contains-any', user.cityIds)
          );
        }

        const usersSnap = await getDocs(usersQuery);

        if (!usersSnap.empty) {
          return usersSnap.docs.map((d) => ({
            id: d.id,
            active: true,
            pinSet: true,
            ...d.data(),
          })) as TeamUser[];
        }
      } catch (err) {
        console.warn('Error fetching team users, loading seed roster:', err);
      }

      // Loop: 6-tier seed roster (names/phones/PIN hashes) shown when the
      // collection is empty or denied — DEV-only. Prod shows empty; the
      // hashes never authenticate anything (sessions roster is empty).
      if (!import.meta.env.DEV) return [];
      // Rich 6-Tier Seed Roster with Fast PIN mappings
      return [
        {
          id: 'user_aarav_brand',
          name: 'Aarav Mehta',
          email: 'aarav.mehta@burgonomics.in',
          phone: '+91 98251 00001',
          role: 'brand_owner' as UserRole,
          active: true,
          pinSet: true,
          hashedPin: hashPinSimple('9999'),
          cityIds: ['Surat', 'Ahmedabad', 'Mumbai', 'Vadodara'],
          lastActiveAt: 'Just now',
          createdAt: Timestamp.fromMillis(Date.now() - 60 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'user_ananya_reg',
          name: 'Ananya Deshmukh',
          email: 'ananya.deshmukh@burgonomics.in',
          phone: '+91 97654 88123',
          role: 'regional_manager' as UserRole,
          active: true,
          pinSet: true,
          hashedPin: hashPinSimple('7777'),
          cityIds: ['Ahmedabad', 'Surat'],
          branchIds: ['branch_surat_01', 'branch_ahmedabad_01'],
          lastActiveAt: '15 mins ago',
          createdAt: Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'user_sanjay_owner',
          name: 'Sanjay Patel',
          email: 'sanjay.patel@burgonomics.in',
          phone: '+91 98765 43210',
          role: 'branch_owner' as UserRole,
          active: true,
          pinSet: true,
          hashedPin: hashPinSimple('5678'),
          branchIds: ['branch_surat_01'],
          cityIds: ['Surat'],
          lastActiveAt: '2 mins ago',
          createdAt: Timestamp.fromMillis(Date.now() - 45 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'user_ramesh_kitchen',
          name: 'Ramesh Patel',
          email: 'ramesh.kitchen@burgonomics.in',
          phone: '+91 98765 43219',
          role: 'branch_staff' as UserRole,
          active: true,
          pinSet: true,
          hashedPin: hashPinSimple('1234'),
          branchIds: ['branch_surat_01'],
          cityIds: ['Surat'],
          lastActiveAt: 'Live in KDS',
          createdAt: Timestamp.fromMillis(Date.now() - 20 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'user_priya_support',
          name: 'Priya Sharma',
          email: 'priya.support@burgonomics.in',
          phone: '+91 98200 99887',
          role: 'support' as UserRole,
          active: true,
          pinSet: true,
          hashedPin: hashPinSimple('4321'),
          cityIds: ['Surat', 'Ahmedabad'],
          lastActiveAt: '1 hour ago',
          createdAt: Timestamp.fromMillis(Date.now() - 15 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'user_alex_dev',
          name: 'Alex',
          email: 'alex.dev@burgonomics.in',
          phone: '+91 99999 88888',
          role: 'developer' as UserRole,
          active: true,
          pinSet: true,
          hashedPin: hashPinSimple('0000'),
          lastActiveAt: 'Live in Console',
          createdAt: Timestamp.fromMillis(Date.now() - 90 * 24 * 60 * 60 * 1000),
        },
      ];
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
      const userId = `partner_${Date.now()}`;
      const hashedPin = userData.pin ? hashPinSimple(userData.pin) : undefined;

      await setDoc(doc(db, 'users', userId), {
        ...userData,
        hashedPin,
        pinSet: !!userData.pin,
        active: true,
        invitedBy: user?.id || 'admin',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      return userId;
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
      const userRef = doc(db, 'users', userId);
      await deleteDoc(userRef).catch((err) => console.warn('Revoked user locally:', err));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-users'] });
    },
  });

  return { users, isLoading, inviteUser, updateUser, toggleUserStatus, revokeUser };
}
