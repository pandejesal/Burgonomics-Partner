import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/config/firebase';
import {
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import type { Branch } from '@/types';

export function useBranches() {
  const queryClient = useQueryClient();

  const { data: branches = [], isLoading } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => {
      try {
        const branchesSnap = await getDocs(collection(db, 'branches'));
        return branchesSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Branch[];
      } catch (err) {
        console.warn('Error fetching branches from Firestore:', err);
        return [];
      }
    },
  });

  const createBranch = useMutation({
    mutationFn: async (branchData: Omit<Branch, 'id' | 'createdAt'>) => {
      return addDoc(collection(db, 'branches'), {
        ...branchData,
        active: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
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
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });

  return { branches, isLoading, createBranch, toggleBranchStatus };
}
