import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
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
import { normalizeTicketDoc } from '@/utils/ticketContract';

interface UseTicketsParams {
  status?: TicketStatus | 'all';
  tier?: 'all' | 'branch' | 'brand_support' | 'developer_team' | 'resolved';
}

export function useTickets(params: UseTicketsParams = {}) {
  const { user } = useAuthStore();
  const { selectedBranchId } = useAppStore();
  const queryClient = useQueryClient();
  // Sources that failed this fetch — surfaced in UI, never console-only.
  const warningsRef = useRef<string[]>([]);

  const { data: tickets = [], isLoading, error } = useQuery({
    queryKey: ['tickets', user?.id, user?.role, selectedBranchId, params],
    queryFn: async (): Promise<Ticket[]> => {
      if (!user) throw new Error('Not authenticated');
      warningsRef.current = [];

      let branchIds: string[] = [];

      // Loop 7: clamp explicit selection to the caller's authorized scope —
      // the old code trusted selectedBranchId verbatim (localStorage-forgeable
      // → foreign-branch queries). Global roles select freely; scoped roles
      // only their branches (regional: their cities, verified below).
      const GLOBAL_ROLES = ['brand_owner', 'developer', 'support'];
      if (selectedBranchId && selectedBranchId !== 'all') {
        if (GLOBAL_ROLES.includes(user.role)) {
          branchIds = [selectedBranchId];
        } else if ((user.branchIds || []).includes(selectedBranchId)) {
          branchIds = [selectedBranchId];
        } else if (user.role === 'regional_manager') {
          const citySnap = await getDocs(
            query(collection(db, 'branches'), where('city', 'in', user.cityIds || ['Ahmedabad', 'Surat']))
          );
          const cityIds = citySnap.docs.map((d) => d.id);
          branchIds = cityIds.includes(selectedBranchId) ? [selectedBranchId] : [];
        } else {
          branchIds = [];
        }
      } else {
        if (GLOBAL_ROLES.includes(user.role)) {
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

      // Loop 7: scoped role with no branches sees NOTHING — the old fallback
      // handed two foreign branches (surat/ahmedabad) to unassigned roles.
      if (branchIds.length === 0) {
        return [];
      }

      // Dual-collection fetch, fired concurrently: the old code awaited
      // support_tickets → tickets serially (2× latency). Dedup is Set-based
      // (the old list.some() was O(n²) — ~4M comparisons at 2k+2k tickets).
      const buildConstraints = (): any[] => {
        const constraints: any[] = [
          where("branchId", "in", branchIds.slice(0, 10)),
          orderBy("createdAt", "desc"),
        ];
        if (params.status && params.status !== "all") {
          // Firestore requires inequality filters before sort fields;
          // pushing keeps createdAt last so the composite index is used.
          constraints.push(where("status", "==", params.status));
        }
        return constraints;
      };

      const fetchSupportTickets = async (): Promise<Ticket[]> => {
        try {
          const supportSnap = await getDocs(
            query(collection(db, 'support_tickets'), ...buildConstraints())
          );
          const out: Ticket[] = [];
          supportSnap.forEach((d) => {
            const data = d.data();
            out.push(
              normalizeTicketDoc(d.id, {
                ticketNumber: data.ticketNumber || d.id,
                title: data.subject || data.title || 'Customer Support Incident',
                branchId: data.branchId,
                branchName: data.branchName || data.branchId,
                category: data.category || 'customer_escalation',
                priority: data.priority || 'medium',
                message: data.description || data.message || '',
                orderId: data.orderId,
                status: data.status || 'open',
                raisedById: data.customerId || data.raisedById || 'customer',
                raisedByName: data.customerName || data.raisedByName || 'Customer',
                raisedByRole: 'customer',
                assignedTo: data.assignedTo || { tier: 'branch' },
                attachments: data.attachments || [],
                resolution: data.resolution?.notes || data.resolution || '',
                createdAt: data.createdAt || Timestamp.now(),
                updatedAt: data.updatedAt || Timestamp.now(),
              })
            );
          });
          return out;
        } catch (err) {
          console.warn('[useTickets] support_tickets fetch fallback:', err);
          warningsRef.current.push('Support tickets could not be loaded.');
          return [];
        }
      };

      const fetchLegacyTickets = async (): Promise<Ticket[]> => {
        try {
          const ticketsSnap = await getDocs(
            query(collection(db, 'tickets'), ...buildConstraints())
          );
          const out: Ticket[] = [];
          ticketsSnap.forEach((d) => {
            out.push(normalizeTicketDoc(d.id, d.data() as Record<string, any>));
          });
          return out;
        } catch (err) {
          console.warn('[useTickets] tickets collection fetch fallback:', err);
          warningsRef.current.push('Legacy tickets could not be loaded.');
          return [];
        }
      };

      const [supportList, legacyList] = await Promise.all([
        fetchSupportTickets(),
        fetchLegacyTickets(),
      ]);
      const list: Ticket[] = [...supportList];
      const seenIds = new Set(supportList.map((t) => t.id));
      for (const t of legacyList) {
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id);
          list.push(t);
        }
      }

      if (list.length > 0) {
        let filtered = list;
        if (params.tier && params.tier !== 'all') {
          if (params.tier === 'resolved') {
            filtered = filtered.filter((t) => t.status === 'resolved' || t.status === 'closed');
          } else {
            filtered = filtered.filter((t) => (t as any).assignedTo?.tier === params.tier && t.status !== 'resolved' && t.status !== 'closed');
          }
        }
        return filtered;
      }

      // Dev-only fallback dataset (Runbook §8). Production with an empty
      // ticket backend shows zero tickets — these invented customer complaints
      // and payment disputes must never reach staff screens.
      if (!import.meta.env.DEV) return [];

      // Fallback rich 3-tier dataset with live timestamps
      const nowMillis = Date.now();
      const seventyFiveMinsAgo = Timestamp.fromMillis(nowMillis - 75 * 60 * 1000);
      const thirtyMinsAgo = Timestamp.fromMillis(nowMillis - 30 * 60 * 1000);
      const twoHoursAgo = Timestamp.fromMillis(nowMillis - 120 * 60 * 1000);
      const tenMinsAgo = Timestamp.fromMillis(nowMillis - 10 * 60 * 1000);

      const defaultTickets: Ticket[] = [
        {
          id: 'tkt_001',
          ticketNumber: 'TICK-2026-8942',
          title: 'Missing Peri-Peri Fries in Delivery Order #ord_901',
          branchId: 'branch_surat_01',
          branchName: 'Surat Adajan',
          city: 'Surat',
          category: 'wrong_item' as any,
          priority: 'high',
          message: 'Customer received 2x Paneer Burgers but the Peri-Peri Fries was not included in the bag. Requesting ₹99 refund or credit.',
          orderId: 'ord_901',
          status: 'open',
          raisedById: 'cust_01',
          raisedByName: 'Aarav Mehta',
          raisedByRole: 'customer',
          assignedTo: { tier: 'branch' } as any,
          createdAt: seventyFiveMinsAgo, // 75 mins ago -> triggers >60m Inactivity Warning!
          updatedAt: seventyFiveMinsAgo,
        },
        {
          id: 'tkt_002',
          ticketNumber: 'TICK-2026-7731',
          title: 'Franchise Delivery Radius Border Dispute - Customer Claim',
          branchId: 'branch_ahmedabad_01',
          branchName: 'Ahmedabad SG Highway',
          city: 'Ahmedabad',
          category: 'customer_escalation' as any,
          priority: 'medium',
          message: 'Customer address on Bopal border was rejected by automated Porter geofence. Requesting Brand Support exception approval for ₹150 Goodwill credit.',
          status: 'in_progress',
          raisedById: 'user_branch_01',
          raisedByName: 'Sanjay Patel (Branch Owner)',
          raisedByRole: 'branch_owner',
          assignedTo: { tier: 'brand_support' } as any,
          createdAt: thirtyMinsAgo,
          updatedAt: thirtyMinsAgo,
        },
        {
          id: 'tkt_003',
          ticketNumber: 'TICK-2026-9904',
          title: 'Razorpay UPI Webhook Timeout & POS Double-Deduction',
          branchId: 'branch_surat_01',
          branchName: 'Surat Adajan',
          city: 'Surat',
          category: 'payment_refund' as any,
          priority: 'urgent',
          message: 'UPI payment of ₹552 succeeded in Razorpay dashboard (pay_Rzp99214) but Cloud Function verifyPayment timed out. POS KOT did not print.',
          orderId: 'ord_903',
          status: 'open',
          raisedById: 'user_branch_01',
          raisedByName: 'Sanjay Patel (Branch Owner)',
          raisedByRole: 'branch_owner',
          assignedTo: { tier: 'developer_team' } as any,
          createdAt: tenMinsAgo,
          updatedAt: tenMinsAgo,
        },
        {
          id: 'tkt_004',
          ticketNumber: 'TICK-2026-6112',
          title: 'Burger packaging torn during transit - Replacement Issued',
          branchId: 'branch_ahmedabad_01',
          branchName: 'Ahmedabad SG Highway',
          city: 'Ahmedabad',
          category: 'app_bug' as any,
          priority: 'low',
          message: 'Customer reported burger box seal opened. Store dispatched replacement box via store fleet rider Ramesh.',
          orderId: 'ord_904',
          status: 'resolved',
          resolution: 'Issued immediate replacement order and credited ₹50 goodwill Grill Coins.',
          resolvedByName: 'Alex (Lead Dev)',
          raisedById: 'cust_04',
          raisedByName: 'Neha Kothari',
          raisedByRole: 'customer',
          assignedTo: { tier: 'branch' } as any,
          createdAt: twoHoursAgo,
          updatedAt: twoHoursAgo,
        },
      ];

      let filtered = defaultTickets;
      if (params.tier && params.tier !== 'all') {
        if (params.tier === 'resolved') {
          filtered = filtered.filter((t) => t.status === 'resolved' || t.status === 'closed');
        } else {
          filtered = filtered.filter((t) => (t as any).assignedTo?.tier === params.tier && t.status !== 'resolved' && t.status !== 'closed');
        }
      }

      if (['branch_owner', 'branch_staff'].includes(user?.role || '') && user?.branchIds?.length) {
        filtered = filtered.filter((t) => t.branchId === user.branchIds[0]);
      }

      return filtered;
    },
    enabled: !!user,
  });

  const createTicket = useMutation({
    mutationFn: async (ticketData: {
      branchId: string;
      category?: string;
      type?: TicketType;
      message: string;
      title?: string;
      orderId?: string;
      priority?: 'urgent' | 'high' | 'medium' | 'low';
      targetTier?: 'branch' | 'brand_support' | 'developer_team';
    }) => {
      // Server-side creation (POST /tickets/create): spam guards, branch
      // assignment, and caller-bound identity run server-side. The old
      // direct addDoc skipped all three (no guards, client-chosen ids).
      // Category maps onto the server enum; anything operational falls back
      // to general_inquiry (never a 400 on a staffer filing a ticket).
      const rawCategory = ticketData.category || ticketData.type || 'other';
      const category =
        rawCategory === 'payment_refund' || rawCategory === 'payment_issue'
          ? 'payment_issue'
          : rawCategory === 'wrong_item' || rawCategory === 'late_delivery' || rawCategory === 'food_quality' || rawCategory === 'app_bug'
            ? rawCategory
            : 'general_inquiry';
      const subject = (ticketData.title || ticketData.message).trim().slice(0, 120);
      const { partnerFunctionsApi } = await import('@/services/partnerFunctionsApi');
      return partnerFunctionsApi.createTicket({
        customerName: user?.name || user?.email || 'Store Staff',
        branchId: ticketData.branchId,
        category: category as 'wrong_item' | 'late_delivery' | 'food_quality' | 'payment_issue' | 'app_bug' | 'general_inquiry',
        priority: ticketData.priority,
        subject: subject.length >= 4 ? subject : `${subject} (ticket)`.slice(0, 120),
        description: ticketData.message,
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
      assignedToTier,
    }: {
      ticketId: string;
      status: TicketStatus;
      resolution?: string;
      assignedToTier?: 'branch' | 'brand_support' | 'developer_team';
    }) => {
      let docRef = doc(db, 'support_tickets', ticketId);
      const updateData: Record<string, any> = {
        status,
        resolution,
        updatedAt: Timestamp.now(),
      };

      if (assignedToTier) {
        updateData['assignedTo.tier'] = assignedToTier;
      }

      try {
        await updateDoc(docRef, updateData);
      } catch {
        docRef = doc(db, 'tickets', ticketId);
        await updateDoc(docRef, updateData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  return { tickets, isLoading, error, warnings: warningsRef.current, createTicket, updateTicket };
}
