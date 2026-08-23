import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
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
  const queryClient = useQueryClient();

  const { data: tickets, isLoading, error } = useQuery<Ticket[]>({
    queryKey: ['tickets', user?.id, params],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      let branchIds: string[] = [];

      if (user.role === 'brand_owner') {
        const branchesSnap = await getDocs(collection(db, 'branches'));
        branchIds = branchesSnap.docs.map((d) => d.id);
      } else if (user.role === 'regional_manager') {
        const branchesSnap = await getDocs(
          query(collection(db, 'branches'), where('city', 'in', user.cityIds))
        );
        branchIds = branchesSnap.docs.map((d) => d.id);
      } else {
        branchIds = user.branchIds;
      }

      const constraints: any[] = [
        where('branchId', 'in', branchIds),
        orderBy('createdAt', 'desc'),
      ];

      if (params.status && params.status !== 'all') {
        constraints.unshift(where('status', '==', params.status));
      }

      const ticketsSnap = await getDocs(
        query(collection(db, 'tickets'), ...constraints)
      );

      return ticketsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Ticket[];
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
