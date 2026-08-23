import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/config/firebase';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import type { Ticket, TicketStatus } from '@/types';

export function useTicket(ticketId: string) {
  const queryClient = useQueryClient();

  const { data: ticket, isLoading, error } = useQuery<Ticket>({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      const ticketRef = doc(db, 'tickets', ticketId);
      const ticketSnap = await getDoc(ticketRef);

      if (!ticketSnap.exists()) {
        throw new Error('Ticket not found');
      }

      return {
        id: ticketSnap.id,
        ...ticketSnap.data(),
      } as Ticket;
    },
    enabled: !!ticketId,
  });

  const updateTicket = useMutation({
    mutationFn: async ({
      status,
      resolution,
    }: {
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
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  return { ticket, isLoading, error, updateTicket };
}
