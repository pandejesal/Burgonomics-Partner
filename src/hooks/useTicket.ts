import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/config/firebase';
import { doc, getDoc, updateDoc, Timestamp, setDoc, collection, arrayUnion } from 'firebase/firestore';
import type { Ticket, TicketStatus } from '@/types';
import { normalizeTicketDoc } from '@/utils/ticketContract';
import { resolveTicketActorRole } from '@/utils/ticketActorRole';
import { useAuthStore } from '@/stores/authStore';

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
      }
      // A FAILED read must fail visible in dev AND prod alike (Runbook §8:
      // no fake data may mask broken wiring). In production a genuinely
      // unknown ticketId must ALSO fail visible — the dev demo tickets
      // below are reachable ONLY for an unknown id in dev.
      if (fetchError) {
        throw fetchError instanceof Error
          ? fetchError
          : new Error('Ticket unavailable — check connection and retry.');
      }
      if (!import.meta.env.DEV) {
        throw new Error('Ticket not found.');
      }

      // Rich Mock Ticket Fallbacks for Dev/Demo — Runbook §8 honesty: titles
      // carry a "[DEMO]" marker and NO invented payment/POS diagnostics
      // (no fabricated razorpay ids / petpooja ids / error stacks). A demo
      // narrative must not read as a real payment incident.
      const mockSnapshots: Record<string, any> = {
        tkt_001: {
          id: 'tkt_001',
          ticketNumber: 'DEMO-TICK-0001',
          title: '[DEMO] Missing item in delivery order #ord_901',
          branchId: 'branch_surat_01',
          branchName: 'Surat Adajan',
          city: 'Surat',
          category: 'wrong_item',
          priority: 'high',
          message: 'Demo ticket: customer received 2x Paneer Makhani Burst Burgers but the fries were missing. Narrative fixture only — do not act on it.',
          orderId: 'ord_901',
          status: 'open',
          raisedById: 'cust_01',
          raisedByName: '[DEMO] Aarav Mehta',
          raisedByRole: 'customer',
          assignedTo: { tier: 'branch' },
          timeline: [
            {
              action: 'ticket_created',
              actorName: '[DEMO] Aarav Mehta',
              actorRole: 'customer',
              message: 'Demo ticket raised: narrative fixture, not a real incident.',
              timestamp: new Date(Date.now() - 75 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ],
          createdAt: Timestamp.fromMillis(Date.now() - 75 * 60 * 1000),
          updatedAt: Timestamp.fromMillis(Date.now() - 75 * 60 * 1000),
        },
        tkt_003: {
          id: 'tkt_003',
          ticketNumber: 'DEMO-TICK-0003',
          title: '[DEMO] Payment issue demo ticket for order #ord_903',
          branchId: 'branch_surat_01',
          branchName: 'Surat Adajan',
          city: 'Surat',
          category: 'payment_refund',
          priority: 'urgent',
          message: 'Demo ticket: narrative fixture about a payment flow — no real payment event, no fabricated gateway ids or error stacks.',
          orderId: 'ord_903',
          status: 'open',
          raisedById: 'user_branch_01',
          raisedByName: '[DEMO] Sanjay Patel (Branch Owner)',
          raisedByRole: 'branch_owner',
          assignedTo: { tier: 'developer_team' },
          timeline: [
            {
              action: 'ticket_created',
              actorName: '[DEMO] Sanjay Patel (Branch Owner)',
              actorRole: 'branch_owner',
              message: 'Demo ticket raised: narrative fixture, not a real payment event.',
              timestamp: new Date(Date.now() - 10 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ],
          createdAt: Timestamp.fromMillis(Date.now() - 10 * 60 * 1000),
          updatedAt: Timestamp.fromMillis(Date.now() - 10 * 60 * 1000),
        },
      };

      return mockSnapshots[ticketId] || {
        id: ticketId,
        ticketNumber: `DEMO-TICK-${ticketId.toUpperCase()}`,
        title: '[DEMO] Customer Support Incident',
        branchId: 'branch_surat_01',
        branchName: 'Surat Adajan',
        city: 'Surat',
        category: 'customer_escalation',
        priority: 'medium',
        message: 'Demo ticket: narrative fixture, not a real incident.',
        status: 'open',
        raisedById: 'cust_sample',
        raisedByName: '[DEMO] Customer',
        raisedByRole: 'customer',
        assignedTo: { tier: 'branch' },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
    },
    enabled: !!ticketId,
  });

  const updateTicket = useMutation({
    mutationFn: async (_unused: {
      status: TicketStatus;
      resolution?: string;
      assignedToTier?: string;
      resolutionAction?: string;
      refundAmount?: number;
    }) => {
      // Retired: all status/resolution/escalation writes go through the
      // server ticket routes (resolveTicket / resolveTicketNote /
      // escalateTicket), which enforce staff role, branch scope, and audit
      // trails. The old direct Firestore write skipped all three (and its
      // dev_error_snapshots side-write leaked free-text PII). Kept as a
      // loud stub so any missed caller fails visibly instead of silently.
      throw new Error(
        "Ticket updates must go through the server ticket routes — this direct-write path was retired."
      );
    },
  });

  const addMessage = useMutation({
    mutationFn: async (messageData: {
      text: string;
      authorName: string;
    }) => {
      // Server-side thread write (POST /tickets/message): sender identity
      // and role bind to the verified caller — the old direct arrayUnion
      // trusted a body-supplied authorRole (spoofable) and skipped
      // notifications. Legacy-collection fallback stays for pre-migration
      // docs the server does not know.
      //
      // The fallback MUST NOT trust `messageData.authorRole`: it arrives from
      // the calling screen's props, so any branch staff could append a
      // brand_owner-privileged entry to the audit timeline. The role is
      // re-derived from the session store — the same source the server
      // authenticates against.
      const sessionRole = resolveTicketActorRole(useAuthStore.getState().user?.role);
      try {
        const { partnerFunctionsApi } = await import('@/services/partnerFunctionsApi');
        return await partnerFunctionsApi.sendTicketMessage({
          ticketId,
          text: messageData.text,
          senderName: messageData.authorName,
        });
      } catch (serverErr) {
        const event = {
          action: 'message_added',
          actorName: messageData.authorName,
          actorRole: sessionRole,
          message: messageData.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        // Legacy tickets live in `tickets`, not `support_tickets` — try the
        // primary collection first, then fall back so replies never hard-fail
        // on a collection miss. A failure in BOTH collections still throws, so
        // a failed reply always looks failed (retry), never sent.
        let docRef = doc(db, 'support_tickets', ticketId);
        try {
          await updateDoc(docRef, {
            timeline: arrayUnion(event),
            updatedAt: Timestamp.now(),
          });
        } catch (primaryErr) {
          try {
            docRef = doc(db, 'tickets', ticketId);
            await updateDoc(docRef, {
              timeline: arrayUnion(event),
              updatedAt: Timestamp.now(),
            });
          } catch {
            throw primaryErr;
          }
        }

        return event;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
    },
  });

  return { ticket, isLoading, error, updateTicket, addMessage };
}
