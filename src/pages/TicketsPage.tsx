import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTickets } from '@/hooks/useTickets';
import { useBranches } from '@/hooks/useBranches';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import type { TicketStatus, TicketType } from '@/types';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Search, Ticket as TicketIcon, Plus, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const statusFilters: { value: TicketStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Tickets' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const statusColors: Record<string, string> = {
  open: 'bg-red-100 text-red-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
};

const typeLabels: Record<string, string> = {
  wrong_item: 'Wrong Item',
  late_delivery: 'Late Delivery',
  quality: 'Quality Issue',
  payment: 'Payment Issue',
  maintenance: 'Store Maintenance',
  supply: 'Inventory / Supply Issue',
  equipment: 'Kitchen Equipment Fault',
  other: 'General Inquiry',
};

export function TicketsPage() {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { tickets, isLoading } = useTickets({ status: statusFilter });

  const filteredTickets = tickets?.filter(
    (ticket) =>
      ticket.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      typeLabels[ticket.type]?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Support & Incident Tickets</h1>
          <p className="text-sm text-text-secondary">
            Hierarchical customer and outlet incident resolution pipeline.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary-dark shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Raise Outlet Ticket</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Search tickets by ID, topic, or message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TicketStatus | 'all')}
          className="px-4 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface"
        >
          {statusFilters.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : !filteredTickets?.length ? (
        <div className="text-center py-16 bg-surface rounded-2xl border border-border">
          <TicketIcon className="w-12 h-12 mx-auto text-text-secondary mb-4 opacity-50" />
          <h3 className="font-semibold text-text-primary">No tickets found</h3>
          <p className="text-sm text-text-secondary mt-1">
            All tickets under the selected outlet and filter criteria are resolved.
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border divide-y divide-border/70 overflow-hidden shadow-xs">
          {filteredTickets.map((ticket) => {
            const timeAgo = (() => {
              try {
                if (ticket.createdAt?.toDate) {
                  return formatDistanceToNow(ticket.createdAt.toDate(), { addSuffix: true });
                }
                return 'Recent';
              } catch {
                return 'Recent';
              }
            })();

            return (
              <Link
                key={ticket.id}
                to={`/tickets/${ticket.id}`}
                className="flex items-center justify-between p-4 sm:p-5 hover:bg-primary/5 transition-colors gap-4"
              >
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0 text-red-600">
                    <TicketIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-text-primary text-sm truncate">
                        {typeLabels[ticket.type] || ticket.type}
                      </p>
                      <span className="text-xs text-text-secondary font-mono">
                        #{ticket.id.slice(-6)}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary truncate mt-0.5 max-w-md sm:max-w-xl">
                      {ticket.message}
                    </p>
                    <p className="text-[11px] text-text-secondary/80 mt-1">
                      Raised {timeAgo} {ticket.raisedBy ? `by ${ticket.raisedBy.replace('_', ' ')}` : ''}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <Badge className={statusColors[ticket.status] || 'bg-gray-100 text-gray-800'}>
                    {ticket.status.replace('_', ' ')}
                  </Badge>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <CreateTicketModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

function CreateTicketModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { branches } = useBranches();
  const { selectedBranchId } = useAppStore();
  const { createTicket } = useTickets();

  const [formData, setFormData] = useState({
    branchId: selectedBranchId || user?.branchIds?.[0] || branches[0]?.id || '',
    type: 'maintenance' as TicketType,
    message: '',
    orderId: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.message.trim()) return;

    await createTicket.mutateAsync({
      branchId: formData.branchId || 'default-branch',
      type: formData.type,
      message: formData.message.trim(),
      orderId: formData.orderId ? formData.orderId.trim() : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md p-6 border border-border shadow-xl">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
          <h2 className="text-lg font-bold text-text-primary">Raise Outlet Incident Ticket</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-primary/5 rounded-lg text-text-secondary cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Affected Outlet
            </label>
            <select
              value={formData.branchId}
              onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
              required
            >
              {branches?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.city})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Incident Category
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as TicketType })}
              className="w-full px-3.5 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
            >
              <option value="maintenance">Store Maintenance / Utilities</option>
              <option value="supply">Inventory & Ingredient Supply Shortage</option>
              <option value="equipment">Kitchen Equipment / Grill Fault</option>
              <option value="payment">POS / Payment Gateway Discrepancy</option>
              <option value="quality">Food Quality Report</option>
              <option value="other">General Operational Issue</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Related Order ID (Optional)
            </label>
            <input
              type="text"
              value={formData.orderId}
              onChange={(e) => setFormData({ ...formData, orderId: e.target.value })}
              placeholder="e.g. ord_abc123"
              className="w-full px-3.5 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Issue Description & Urgency
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              rows={3}
              placeholder="Explain the incident, current impact on kitchen throughput, and required resolution..."
              className="w-full px-3.5 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg/50 resize-none"
              required
            />
          </div>

          <div className="flex gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-border rounded-xl font-semibold text-xs hover:bg-primary/5 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTicket.isPending || !formData.message.trim()}
              className="flex-1 py-2.5 bg-primary text-white rounded-xl font-semibold text-xs hover:bg-primary-dark disabled:opacity-50 shadow-xs cursor-pointer"
            >
              {createTicket.isPending ? 'Submitting...' : 'Dispatch Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TicketsPage;
