import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/config/firebase';
import { doc, getDoc, updateDoc, Timestamp, setDoc, collection, arrayUnion } from 'firebase/firestore';
import type { Ticket, TicketStatus } from '@/types';
import { normalizeTicketDoc } from '@/utils/ticketContract';

export function useTicket(ticketId: string) {
  const queryClient = useQueryClient();

  const { data: ticket, isLoading, error } = useQuery<Ticket>({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      let fetchError: unknown = null;
      try {
        // Check support_tickets collection first
        let ticketRef = doc(db, 'support_tickets', ticketId);
        let ticketSnap = await getDoc(ticketRef);

        if (!ticketSnap.exists()) {
          // Fallback to legacy tickets collection
          ticketRef = doc(db, 'tickets', ticketId);
          ticketSnap = await getDoc(ticketRef);
        }

        if (ticketSnap.exists()) {
          return normalizeTicketDoc(ticketSnap.id, ticketSnap.data() as Record<string, any>);
        }
      } catch (e) {
        fetchError = e;
        console.warn('Firestore fetch notice, loading fallback ticket:', e);
      }

      // Production must fail visible — never render fabricated tickets.
      if (!import.meta.env.DEV) {
        throw fetchError instanceof Error ? fetchError : new Error('Ticket unavailable — check connection and retry.');
      }

      // Rich Mock Ticket Fallbacks for Dev/Demo
      const mockSnapshots: Record<string, any> = {
        tkt_001: {
          id: 'tkt_001',
          ticketNumber: 'TICK-2026-8942',
          title: 'Missing Peri-Peri Fries in Delivery Order #ord_901',
          branchId: 'branch_surat_01',
          branchName: 'Surat Adajan',
          city: 'Surat',
          category: 'wrong_item',
          priority: 'high',
          message: 'Customer received 2x Paneer Makhani Burst Burgers but the African Peri-Peri Fries was not included in the bag. Requesting ₹99 refund or credit.',
          orderId: 'ord_901',
          status: 'open',
          raisedById: 'cust_01',
          raisedByName: 'Aarav Mehta',
          customerPhone: '+91 98251 12345',
          raisedByRole: 'customer',
          assignedTo: { tier: 'branch' },
          timeline: [
            {
              action: 'ticket_created',
              actorName: 'Aarav Mehta',
              actorRole: 'customer',
              message: 'Ticket raised: Missing Peri-Peri Fries in Order #ord_901',
              timestamp: new Date(Date.now() - 75 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ],
          diagnostics: {
            razorpayPaymentId: 'pay_Rzp88412',
            petpoojaOrderId: 'PP-ORD-8812',
            clientAppVersion: 'v2.4.1 (Android)',
          },
          createdAt: Timestamp.fromMillis(Date.now() - 75 * 60 * 1000),
          updatedAt: Timestamp.fromMillis(Date.now() - 75 * 60 * 1000),
        },
        tkt_003: {
          id: 'tkt_003',
          ticketNumber: 'TICK-2026-9904',
          title: 'Razorpay UPI Webhook Timeout & POS Double-Deduction',
          branchId: 'branch_surat_01',
          branchName: 'Surat Adajan',
          city: 'Surat',
          category: 'payment_refund',
          priority: 'urgent',
          message: 'UPI payment of ₹552 succeeded in Razorpay dashboard (pay_Rzp99214) but Cloud Function verifyPayment timed out. POS KOT did not print.',
          orderId: 'ord_903',
          status: 'open',
          raisedById: 'user_branch_01',
          raisedByName: 'Sanjay Patel (Branch Owner)',
          raisedByRole: 'branch_owner',
          assignedTo: { tier: 'developer_team' },
          timeline: [
            {
              action: 'ticket_created',
              actorName: 'Sanjay Patel (Branch Owner)',
              actorRole: 'branch_owner',
              message: 'Escalated to Developer Team: Razorpay Webhook HMAC timeout on UPI order #ord_903',
              timestamp: new Date(Date.now() - 10 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ],
          diagnostics: {
            razorpayPaymentId: 'pay_Rzp99214',
            petpoojaOrderId: 'PP-ORD-8813',
            clientAppVersion: 'v2.4.1 (iOS)',
            errorStack: `Error: GatewayTimeout at verifyPayment (cloud-functions/v2/payments.ts:148:19)\n  at processTicksAndRejections (node:internal/process/task_queues:95:5)`,
            errorSnapshotId: 'err_9904_diag_rzp',
          },
          createdAt: Timestamp.fromMillis(Date.now() - 10 * 60 * 1000),
          updatedAt: Timestamp.fromMillis(Date.now() - 10 * 60 * 1000),
        },
      };

      return mockSnapshots[ticketId] || {
        id: ticketId,
        ticketNumber: `TICK-${ticketId.toUpperCase()}`,
        title: 'Customer Support Incident',
        branchId: 'branch_surat_01',
        branchName: 'Surat Adajan',
        city: 'Surat',
        category: 'customer_escalation',
        priority: 'medium',
        message: 'Customer reported an operational issue regarding order delivery or menu item.',
        status: 'open',
        raisedById: 'cust_sample',
        raisedByName: 'Customer User',
        raisedByRole: 'customer',
        assignedTo: { tier: 'branch' },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
    },
    enabled: !!ticketId,
  });

  const updateTicket = useMutation({
    mutationFn: async ({
      status,
      resolution,
      assignedToTier,
      resolutionAction,
      refundAmount,
    }: {
      status: TicketStatus;
      resolution?: string;
      assignedToTier?: string;
      resolutionAction?: string;
      refundAmount?: number;
    }) => {
      let targetCollection = 'support_tickets';
      let docRef = doc(db, targetCollection, ticketId);
      let docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        targetCollection = 'tickets';
        docRef = doc(db, targetCollection, ticketId);
      }

      const updateData: Record<string, any> = {
        status,
        resolution,
        updatedAt: Timestamp.now(),
      };

      if (assignedToTier) {
        updateData['assignedTo.tier'] = assignedToTier;
      }

      if (resolutionAction) {
        updateData.resolutionAction = resolutionAction;
      }

      if (refundAmount) {
        updateData.refundAmount = refundAmount;
      }

      await updateDoc(docRef, updateData);

      // If escalated to developer team, create error snapshot.
      // If this write also fails the error still propagates naturally.
      if (assignedToTier === 'developer_team') {
        const snapshotId = `err_${Date.now()}_diag`;
        await setDoc(doc(collection(db, 'dev_error_snapshots'), snapshotId), {
          id: snapshotId,
          source: 'tickets',
          severity: 'high',
          message: `Escalated ticket ${ticketId}: ${resolution || 'Operator escalated incident'}`,
          ticketId,
          createdAt: Timestamp.now(),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  const addMessage = useMutation({
    mutationFn: async (messageData: {
      text: string;
      authorName: string;
      authorRole: string;
    }) => {
      const event = {
        action: 'message_added',
        actorName: messageData.authorName,
        actorRole: messageData.authorRole,
        message: messageData.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      const docRef = doc(db, 'support_tickets', ticketId);
      await updateDoc(docRef, {
        timeline: arrayUnion(event),
        updatedAt: Timestamp.now(),
      });

      return event;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
    },
  });

  return { ticket, isLoading, error, updateTicket, addMessage };
}
