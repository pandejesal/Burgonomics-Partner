import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/config/firebase';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import type { Customer } from '@/types';

export function useCustomers() {
  const { user } = useAuth();

  return useQuery<Customer[]>({
    queryKey: ['customers', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const customersSnap = await getDocs(
        query(collection(db, 'customers'), orderBy('createdAt', 'desc'))
      );

      return customersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Customer[];
    },
    enabled: !!user,
  });
}
