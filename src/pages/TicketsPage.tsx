import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTickets } from '@/hooks/useTickets';
import { useAuthStore } from '@/stores/authStore';
import { RaiseTicketModal } from '@/components/tickets/RaiseTicketModal';
import {
  ShieldAlert,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  ArrowRight,
  Filter,
  AlertTriangle,
  FileText,
  User,
  Store,
} from 'lucide-react';
import type { Ticket, TicketCategory, TicketPriority, TicketStatus } from '@/types';

export function TicketsPage() {
  const { user } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRaiseModal, setShowRaiseModal] = useState(false);

  const { tickets, isLoading, createTicket, updateTicket } = useTickets({
    status: statusFilter,
  });

  const handleRaiseTicket = async (ticketData: any) => {
    await createTicket.mutateAsync(ticketData);
  };

  const handleQuickResolve = async (e: React.MouseEvent, ticketId: string) => {
    e.preventDefault();
    e.stopPropagation();
    await updateTicket.mutateAsync({
      ticketId,
      status: 'resolved',
      resolution: `Resolved by ${user?.name || 'Support'} (${user?.role || 'team'})`,
    });
  };

  const filteredTickets = tickets.filter((t) => {
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
    const matchesSearch =
      (t.title && t.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.message && t.message.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.branchName && t.branchName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesCategory && matchesSearch;
  });

  const getPriorityBadge = (priority: TicketPriority) => {
    switch (priority) {
      case 'urgent':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 text-rose-400 border border-rose-800/60">
            🔴 Urgent
          </span>
        );
      case 'high':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-400 border border-amber-800/60">
            🟠 High
          </span>
        );
      case 'medium':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-yellow-950/80 text-yellow-400 border border-yellow-800/60">
            🟡 Medium
          </span>
        );
      case 'low':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
            🟢 Low
          </span>
        );
      default:
        return null;
    }
  };

  const getCategoryLabel = (cat: TicketCategory) => {
    switch (cat) {
      case 'pos_sync':
        return 'POS / Petpooja';
      case 'app_bug':
        return 'App / System Bug';
      case 'hardware_printer':
        return 'Hardware / Printer';
      case 'inventory_stock':
        return 'Inventory Shortage';
      case 'customer_escalation':
        return 'Customer Escalation';
      case 'payment_refund':
        return 'Payment / Refund';
      default:
        return 'General Support';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">
            Issue Resolution & Support Tickets
          </h1>
          <p className="text-xs text-zinc-400">
            Branch incidents dispatched directly to Developer Team, Brand Owners & Support
          </p>
        </div>

        <button
          onClick={() => setShowRaiseModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#D95D0F] hover:bg-[#b84d0b] text-white rounded-xl font-semibold text-xs transition-colors shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Raise Issue Ticket</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-[#132A17] p-4 rounded-xl border border-[#234B2A] flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status filter buttons */}
          {(['all', 'open', 'in_progress', 'resolved'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                statusFilter === st
                  ? 'bg-[#D95D0F] text-white'
                  : 'bg-[#0D0F0D] text-zinc-400 hover:text-white border border-[#234B2A]'
              }`}
            >
              {st === 'all' ? 'All Statuses' : st.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white focus:outline-none focus:border-[#D95D0F]"
          >
            <option value="all">All Categories</option>
            <option value="pos_sync">POS / Petpooja</option>
            <option value="app_bug">App Bugs</option>
            <option value="hardware_printer">Hardware & Printers</option>
            <option value="inventory_stock">Inventory</option>
            <option value="customer_escalation">Customer Escalations</option>
            <option value="payment_refund">Payments & Refunds</option>
          </select>

          {/* Search bar */}
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search tickets, branch, ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
            />
          </div>
        </div>
      </div>

      {/* Tickets List */}
      {isLoading ? (
        <div className="p-16 text-center text-zinc-400 text-xs">Loading incident tickets...</div>
      ) : filteredTickets.length === 0 ? (
        <div className="text-center py-16 bg-[#132A17] rounded-2xl border border-[#234B2A] p-8 space-y-3">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
          <h3 className="font-semibold text-white text-sm">All systems normal</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            No incident tickets match the selected filters. Click "Raise Issue Ticket" above if an
            issue occurs.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredTickets.map((ticket) => {
            const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';

            return (
              <Link
                key={ticket.id}
                to={`/tickets/${ticket.id}`}
                className="bg-[#132A17] hover:bg-[#16301B] border border-[#234B2A] hover:border-[#D95D0F]/50 rounded-xl p-4 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
              >
                <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                  <div
                    className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                      isResolved
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                        : 'bg-[#1E3A24] text-[#D95D0F] border border-[#234B2A]'
                    }`}
                  >
                    <ShieldAlert className="w-5 h-5" />
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-white group-hover:text-[#D95D0F] transition-colors truncate">
                        {ticket.title || ticket.message.slice(0, 60)}
                      </span>
                      {getPriorityBadge(ticket.priority || 'medium')}
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#1E3A24] text-zinc-300 border border-[#234B2A]">
                        {getCategoryLabel(ticket.category)}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-300 line-clamp-2">{ticket.message}</p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 pt-1">
                      <span className="flex items-center gap-1 text-zinc-300">
                        <Store className="w-3.5 h-3.5 text-[#D95D0F]" />
                        <span>{ticket.branchName || ticket.branchId}</span>
                      </span>

                      <span>•</span>

                      <span>
                        Reported by{' '}
                        <strong className="text-zinc-200">
                          {ticket.raisedByName || ticket.raisedById || 'Branch Staff'}
                        </strong>
                      </span>

                      <span>•</span>

                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-zinc-500" />
                        <span>
                          {ticket.createdAt?.toDate
                            ? ticket.createdAt.toDate().toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Recent'}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Action Button */}
                <div className="flex items-center space-x-2 self-end sm:self-center shrink-0">
                  {!isResolved ? (
                    <button
                      onClick={(e) => handleQuickResolve(e, ticket.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center space-x-1.5 shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Issue Resolved</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 text-xs font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Resolved</span>
                    </span>
                  )}

                  <div className="p-1.5 text-zinc-500 group-hover:text-white transition-colors">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Raise Ticket Modal */}
      <RaiseTicketModal
        isOpen={showRaiseModal}
        onClose={() => setShowRaiseModal(false)}
        onSubmit={handleRaiseTicket}
        defaultBranchId={user?.branchIds?.[0] || 'branch_surat_01'}
        defaultBranchName={user?.name ? `${user.name}'s Branch` : 'Surat Outlet'}
        loading={createTicket.isPending}
      />
    </div>
  );
}
