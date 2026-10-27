import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTickets } from '@/hooks/useTickets';
import { useAuthStore } from '@/stores/authStore';
import { RaiseTicketModal } from '@/components/tickets/RaiseTicketModal';
import {
  TicketQueueTable,
  TicketResolutionModal,
  type TicketResolutionPayload,
} from '@/features/tickets';
import {
  ShieldAlert,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Filter,
  Flame,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import type { Ticket } from '@/types';
import { DataWarningBanner } from '@/components/ui/DataWarningBanner';
import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';
import {
  resolveTicketTier,
  getNextEscalationTarget,
  isActiveTicketStatus,
  isTerminalTicketStatus,
} from '@/utils/ticketContract';
import { filterTicketQueue } from '@/utils/ticketQueue';
import { toast } from 'sonner';

export function TicketsPage({ initialTickets }: { initialTickets?: Ticket[] } = {}) {
  const { user } = useAuthStore();
  const [activeTierTab, setActiveTierTab] = useState<
    'all' | 'L1_STORE' | 'L2_REGIONAL' | 'L3_EXECUTIVE' | 'resolved'
  >('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRaiseModal, setShowRaiseModal] = useState(false);
  const [resolvingTicket, setResolvingTicket] = useState<Ticket | null>(null);

  const queryClient = useQueryClient();
  const hookResult = useTickets({
    tier: activeTierTab === 'resolved' ? 'resolved' : 'all',
  });
  const tickets = initialTickets ?? hookResult.tickets;
  const isLoading = initialTickets ? false : hookResult.isLoading;
  const error = initialTickets ? null : hookResult.error;
  const warnings = initialTickets ? [] : hookResult.warnings;
  const createTicket = hookResult.createTicket;

  const handleRaiseTicket = async (ticketData: any) => {
    // Loop 55/120: creation can fail loud (rules bind, offline) — the old
    // path left the modal hanging silently with no toast either way.
    try {
      await createTicket.mutateAsync(ticketData);
      toast.success("Ticket raised and routed to the branch queue.");
    } catch (err) {
      toast.error("Ticket NOT raised — nothing was filed.", {
        description: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  const handleQuickEscalate = async (ticket: Ticket) => {
    const isClosed = ticket.status === 'resolved' || ticket.status === 'closed';
    if (isClosed) {
      toast.error("Cannot escalate a resolved or closed ticket.");
      return;
    }

    const currentLevel = resolveTicketTier(ticket);
    if (currentLevel === 'L3_EXECUTIVE') {
      toast.info("Ticket is already at the highest escalation tier (L3 Executive); cannot escalate further.");
      return;
    }
    if (currentLevel === 'unknown') {
      toast.error("Cannot escalate ticket with unknown assignment tier.");
      return;
    }

    const next = getNextEscalationTarget(currentLevel);
    if (!next) {
      toast.info("Ticket cannot be escalated further.");
      return;
    }

    const { targetTier, nextLevel } = next;

    // Server-side escalation (POST /tickets/escalate): branch-scoped,
    // snapshotted, notified. The old direct Firestore tier flip skipped all
    // three. Report the outcome instead of silent nothing.
    try {
      await partnerFunctionsApi.escalateTicket({
        ticketId: ticket.id,
        targetTier,
        reason: `Manual escalation to ${nextLevel} by ${user?.name || 'Staff'}.`,
      });
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success(`Escalated to ${nextLevel}.`);
    } catch (err) {
      toast.error("Escalation NOT recorded.", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleConfirmResolution = async (payload: TicketResolutionPayload) => {
    // Loop 33/120: money-affecting resolutions MUST execute server-side. The
    // old path wrote status text directly ("Credited X Grill Coins") while
    // crediting nothing, and refunds moved no money. Mirror TicketDetailPage:
    // server resolveTicket first, loud failure leaves the ticket open.
    const ticket = tickets.find((t) => t.id === payload.ticketId);
    try {
      if (payload.action === "CREDIT_GRILL_COINS") {
        if (!ticket?.customerId) {
          throw new Error(
            "Guest ticket has no customer profile — credit Grill Coins via the dashboard, ticket left open."
          );
        }
        if (!payload.grillCoinsAmount || payload.grillCoinsAmount <= 0) {
          throw new Error("Specify a coin amount greater than zero.");
        }
        await partnerFunctionsApi.resolveTicket({
          ticketId: payload.ticketId,
          action: "loyalty_credit",
          amount: Math.round(payload.grillCoinsAmount),
          notes: payload.notes,
        });
        toast.success(
          `${Math.round(payload.grillCoinsAmount)} Grill Coins credited server-side. Ticket resolved.`
        );
      } else if (payload.action === "REFUND_ORDER") {
        await partnerFunctionsApi.resolveTicket({
          ticketId: payload.ticketId,
          action: "full_refund",
          ...(payload.refundAmount && payload.refundAmount > 0
            ? { action: "partial_refund" as const, amount: Math.round(payload.refundAmount) }
            : {}),
          notes: payload.notes,
        });
        toast.success("Refund executed server-side. Ticket resolved.");
      } else {
        await partnerFunctionsApi.resolveTicket({
          ticketId: payload.ticketId,
          action: "explanation",
          notes: `${payload.action}: ${payload.notes}`,
        });
        toast.success("Ticket resolved with recorded explanation.");
      }
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setResolvingTicket(null);
    } catch (err) {
      toast.error("Resolution failed server-side — ticket left open, nothing applied.", {
        description: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  const filteredTickets = useMemo(() => {
    return filterTicketQueue(tickets, { activeTierTab, categoryFilter, searchQuery });
  }, [tickets, activeTierTab, categoryFilter, searchQuery]);

  // Active KPIs use the same active predicate as the queue: `escalated` is an
  // active backend status, terminal rows are excluded from every active count.
  const openCount = tickets.filter((t) => isActiveTicketStatus(t.status)).length;
  const l2Count = tickets.filter(
    (t) => isActiveTicketStatus(t.status) && resolveTicketTier(t) === 'L2_REGIONAL'
  ).length;
  const l3Count = tickets.filter(
    (t) => isActiveTicketStatus(t.status) && resolveTicketTier(t) === 'L3_EXECUTIVE'
  ).length;
  const resolvedCount = tickets.filter((t) => isTerminalTicketStatus(t.status)).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 select-none">
      <DataWarningBanner warnings={warnings} />
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-wide flex items-center gap-2.5">
            <span>Support Desk & 3-Tier SLA Console</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400 font-bold">
              Realtime Triage
            </span>
          </h1>
          <p className="text-xs text-neutral-400">
            {user?.role === 'branch_owner'
              ? 'Customer complaints & store-level ticket SLA management'
              : 'Enterprise support desk with automated 3-tier SLA auto-escalator'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowRaiseModal(true)}
          className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 bg-[#FF6600] hover:bg-[#e05a00] text-white rounded-xl font-bold text-xs transition-colors shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Raise Internal Ticket</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#090909] border border-neutral-800 rounded-3xl p-4 space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold uppercase">Active Queue</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-black text-white">{openCount}</p>
          <p className="text-[11px] text-neutral-500">Unresolved customer tickets</p>
        </div>

        <div className="bg-[#090909] border border-neutral-800 rounded-3xl p-4 space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold uppercase">L2 Regional Escalations</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-amber-400">{l2Count}</p>
          <p className="text-[11px] text-neutral-500">&gt;15m store SLA breach</p>
        </div>

        <div className="bg-[#090909] border border-neutral-800 rounded-3xl p-4 space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold uppercase">L3 Executive Alerts</span>
            <Flame className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-black text-rose-400">{l3Count}</p>
          <p className="text-[11px] text-neutral-500">&gt;60m critical breach</p>
        </div>

        <div className="bg-[#090909] border border-neutral-800 rounded-3xl p-4 space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold uppercase">Resolved Total</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400">{resolvedCount}</p>
          <p className="text-[11px] text-neutral-500">Completed support inquiries</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-3xl bg-neutral-900 border border-neutral-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-md">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Ticket #, Customer, Phone, or Problem..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-neutral-950 border border-neutral-700 text-white placeholder-neutral-500 text-xs font-medium focus:outline-none focus:border-[#FF6600]"
          />
        </div>

        {/* Tier Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-neutral-950 border border-neutral-800 overflow-x-auto">
          {[
            { id: 'all', label: 'All Active' },
            { id: 'L1_STORE', label: 'L1 Store' },
            { id: 'L2_REGIONAL', label: 'L2 Regional' },
            { id: 'L3_EXECUTIVE', label: 'L3 Executive' },
            { id: 'resolved', label: 'Resolved' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTierTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                activeTierTab === tab.id
                  ? 'bg-[#0E4825] text-emerald-300 shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket Queue Table */}
      <TicketQueueTable
        tickets={filteredTickets}
        isLoading={isLoading}
        error={error}
        warnings={warnings}
        onRetry={() => hookResult.refetch?.()}
        onOpenResolveModal={setResolvingTicket}
        onQuickEscalate={handleQuickEscalate}
        onClearFilters={() => {
          setActiveTierTab('all');
          setCategoryFilter('all');
          setSearchQuery('');
        }}
      />

      {/* Resolve Ticket Modal */}
      <TicketResolutionModal
        ticket={resolvingTicket}
        isOpen={!!resolvingTicket}
        onClose={() => setResolvingTicket(null)}
        onConfirmResolution={handleConfirmResolution}
      />

      {/* Internal Raise Ticket Modal */}
      {showRaiseModal && (
        <RaiseTicketModal
          isOpen={showRaiseModal}
          onClose={() => setShowRaiseModal(false)}
          onSubmit={handleRaiseTicket}
          defaultBranchId={user?.branchIds?.[0]}
        />
      )}
    </div>
  );
}

export default TicketsPage;
