import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import type { UserRole } from '@/types';

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  branchIds?: string[];
  cityIds?: string[];
  active?: boolean;
}

export function useUsers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery<TeamUser[]>({
    queryKey: ['team-users', user?.id],
    queryFn: async () => {
      if (!user) return [];

      try {
        let usersQuery = query(collection(db, 'users'));

        if (user.role === 'regional_manager' && user.cityIds?.length) {
          usersQuery = query(
            collection(db, 'users'),
            where('cityIds', 'array-contains-any', user.cityIds)
          );
        }

        const usersSnap = await getDocs(usersQuery);

        return usersSnap.docs.map((d) => ({
          id: d.id,
          active: true,
          ...d.data(),
        })) as TeamUser[];
      } catch (err) {
        console.warn('Error fetching team users:', err);
        return [];
      }
    },
    enabled: !!user && user.role !== 'branch_owner',
  });

  const inviteUser = useMutation({
    mutationFn: async (userData: {
      name: string;
      email: string;
      phone: string;
      role: UserRole;
      branchIds: string[];
      cityIds: string[];
    }) => {
      const userId = `partner_${Date.now()}`;

      await setDoc(doc(db, 'users', userId), {
        ...userData,
        active: true,
        invitedBy: user?.id,
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
      await updateDoc(userRef, {
        ...updates,
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-users'] });
    },
  });

  const deactivateUser = useMutation({
    mutationFn: async (userId: string) => {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        active: false,
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-users'] });
    },
  });

  return { users, isLoading, inviteUser, updateUser, deactivateUser };
}
