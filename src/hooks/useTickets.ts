import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/config/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  Timestamp,
} from 'firebase/firestore';
import type { Ticket, TicketStatus, TicketType } from '@/types';

interface UseTicketsParams {
  status?: TicketStatus | 'all';
}

export function useTickets(params: UseTicketsParams = {}) {
  const { user } = useAuth();
  const { selectedBranchId } = useAppStore();
  const queryClient = useQueryClient();

  const { data: tickets = [], isLoading, error } = useQuery<Ticket[]>({
    queryKey: ['tickets', user?.id, user?.role, selectedBranchId, params],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      let branchIds: string[] = [];

      if (selectedBranchId) {
        branchIds = [selectedBranchId];
      } else {
        if (user.role === 'brand_owner') {
          const branchesSnap = await getDocs(collection(db, 'branches'));
          branchIds = branchesSnap.docs.map((d) => d.id);
        } else if (user.role === 'regional_manager') {
          const branchesSnap = await getDocs(
            query(collection(db, 'branches'), where('city', 'in', user.cityIds || ['Ahmedabad', 'Surat']))
          );
          branchIds = branchesSnap.docs.map((d) => d.id);
        } else {
          branchIds = user.branchIds || [];
        }
      }

      if (branchIds.length === 0) {
        branchIds = ['default-branch'];
      }

      const constraints: any[] = [
        where('branchId', 'in', branchIds.slice(0, 10)),
        orderBy('createdAt', 'desc'),
      ];

      if (params.status && params.status !== 'all') {
        constraints.unshift(where('status', '==', params.status));
      }

      try {
        const ticketsSnap = await getDocs(
          query(collection(db, 'tickets'), ...constraints)
        );

        return ticketsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Ticket[];
      } catch (err) {
        console.warn('Error fetching tickets:', err);
        return [];
      }
    },
    enabled: !!user,
  });

  const createTicket = useMutation({
    mutationFn: async (ticketData: {
      branchId: string;
      type: TicketType;
      message: string;
      orderId?: string;
    }) => {
      return addDoc(collection(db, 'tickets'), {
        ...ticketData,
        raisedBy: 'branch_owner',
        status: 'open',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  const updateTicket = useMutation({
    mutationFn: async ({
      ticketId,
      status,
      resolution,
    }: {
      ticketId: string;
      status: TicketStatus;
      resolution?: string;
    }) => {
      const ticketRef = doc(db, 'tickets', ticketId);
      await updateDoc(ticketRef, {
        status,
        resolution,
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  return { tickets, isLoading, error, createTicket, updateTicket };
}
