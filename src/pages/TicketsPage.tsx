import React, { useState, useMemo } from 'react';
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
import { toast } from 'sonner';

export function TicketsPage() {
  const { user } = useAuthStore();
  const [activeTierTab, setActiveTierTab] = useState<
    'all' | 'L1_STORE' | 'L2_REGIONAL' | 'L3_EXECUTIVE' | 'resolved'
  >('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRaiseModal, setShowRaiseModal] = useState(false);
  const [resolvingTicket, setResolvingTicket] = useState<Ticket | null>(null);

  const { tickets, isLoading, error: ticketsError, refetch, warnings, createTicket, updateTicket } = useTickets({
    tier: activeTierTab === 'resolved' ? 'resolved' : 'all',
  });

  const handleRaiseTicket = async (ticketData: any) => {
    try {
      await createTicket.mutateAsync(ticketData);
      toast.success('Ticket raised — dispatched to triage queue.');
    } catch {
      toast.error('Could not raise ticket — check connection and retry.');
      throw new Error('Raise ticket failed — ticket not created, retry.');
    }
  };

  const handleQuickEscalate = async (ticket: Ticket) => {
    const currentLevel =
      (ticket as any).escalationLevel ||
      (ticket as any).assignedToTier ||
      'L1_STORE';

    const nextTier =
      currentLevel === 'L1_STORE' || currentLevel === 'branch'
        ? 'brand_support'
        : 'developer_team';

    const nextLevel =
      currentLevel === 'L1_STORE' || currentLevel === 'branch'
        ? 'L2_REGIONAL'
        : 'L3_EXECUTIVE';

    if (
      !window.confirm(
        `Escalate ticket ${ticket.ticketNumber || ticket.id} to ${nextLevel}? The assignee will be notified.`
      )
    ) {
      return;
    }

    try {
      await updateTicket.mutateAsync({
        ticketId: ticket.id,
        status: 'in_progress',
        assignedToTier: nextTier,
        resolution: `Manual escalation to ${nextLevel} by ${user?.name || 'Staff'}.`,
      });
      toast.success(`Escalated to ${nextLevel}.`);
    } catch {
      // Failed escalation looks failed, never done — the ticket is unchanged.
      toast.error('Escalation failed — ticket unchanged, retry.');
      throw new Error('Escalation failed — ticket unchanged, retry.');
    }
  };

  const handleConfirmResolution = async (payload: TicketResolutionPayload) => {
    if (
      !window.confirm(
        `Mark ticket ${payload.ticketId} as resolved? This closes the active queue entry.`
      )
    ) {
      return;
    }

    try {
      await updateTicket.mutateAsync({
        ticketId: payload.ticketId,
        status: 'resolved',
        resolution: `${payload.action}: ${payload.notes}${
          payload.grillCoinsAmount ? ` (Credited ${payload.grillCoinsAmount} Grill Coins)` : ''
        }`,
      });
      toast.success('Incident marked resolved.');
    } catch {
      toast.error('Resolution failed — ticket still active, retry.');
      throw new Error('Resolution failed — ticket still active, retry.');
    }
  };

  const filteredTickets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return tickets.filter((t) => {
      // 1. Tier Tab Filtering
      const level =
        (t as any).escalationLevel ||
        (t as any).assignedToTier ||
        (t as any).assignedTo?.tier ||
        'L1_STORE';

      const isResolved = t.status === 'resolved' || t.status === 'closed';

      if (activeTierTab === 'resolved' && !isResolved) return false;
      if (activeTierTab !== 'resolved' && activeTierTab !== 'all') {
        if (isResolved) return false;
        if (activeTierTab === 'L1_STORE' && level !== 'L1_STORE' && level !== 'branch') return false;
        if (activeTierTab === 'L2_REGIONAL' && level !== 'L2_REGIONAL' && level !== 'brand_support')
          return false;
        if (
          activeTierTab === 'L3_EXECUTIVE' &&
          level !== 'L3_EXECUTIVE' &&
          level !== 'developer_team'
        )
          return false;
      }

      // 2. Category Filter
      if (categoryFilter !== 'all' && t.category !== categoryFilter) {
        return false;
      }

      // 3. Search Query
      if (q) {
        const matchesTitle = (t.title || (t as any).subject || '').toLowerCase().includes(q);
        const matchesDesc = (t.message || (t as any).description || '').toLowerCase().includes(q);
        const matchesCustomer = ((t as any).customerName || '').toLowerCase().includes(q);
        const matchesPhone = ((t as any).customerPhone || '').includes(q);
        const matchesNum = (t.ticketNumber || t.id).toLowerCase().includes(q);

        if (!matchesTitle && !matchesDesc && !matchesCustomer && !matchesPhone && !matchesNum) {
          return false;
        }
      }

      return true;
    });
  }, [tickets, activeTierTab, categoryFilter, searchQuery]);

  const openCount = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length;
  const l2Count = tickets.filter(
    (t) =>
      (t.status === 'open' || t.status === 'in_progress') &&
      ((t as any).escalationLevel === 'L2_REGIONAL' || (t as any).assignedToTier === 'brand_support')
  ).length;
  const l3Count = tickets.filter(
    (t) =>
      (t.status === 'open' || t.status === 'in_progress') &&
      ((t as any).escalationLevel === 'L3_EXECUTIVE' || (t as any).assignedToTier === 'developer_team')
  ).length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 select-none">
      <DataWarningBanner warnings={warnings} />
      {/* Query failure looks failed: explicit error + retry, never an empty table. */}
      {ticketsError && !isLoading && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl border border-rose-700/60 bg-rose-950/40 p-3.5 text-xs text-rose-200"
        >
          <span className="font-bold">Could not load tickets — check connection and retry.</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-rose-900/60 hover:bg-rose-800/60 font-bold transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}
      {/* Honest empty state: empty scope or no matches — not a system error. */}
      {!isLoading && !ticketsError && tickets.length === 0 && (
        <div className="text-center py-10 bg-[#090909] rounded-3xl border border-neutral-800 p-8 space-y-2">
          <h3 className="font-bold text-white text-sm">No tickets in your current scope</h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            Empty assignment or no matching tickets — this is an honest empty view, not a
            system error. Adjust filters or retry below.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-1 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}
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
          className="flex items-center gap-2 px-4 py-2.5 bg-[#FF6600] hover:bg-[#e05a00] text-white rounded-xl font-bold text-xs transition-colors shadow-md cursor-pointer"
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
        onOpenResolveModal={setResolvingTicket}
        onQuickEscalate={handleQuickEscalate}
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
        />
      )}
    </div>
  );
}

export default TicketsPage;
