import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTickets } from '@/hooks/useTickets';
import type { TicketStatus } from '@/types';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Search, Ticket as TicketIcon } from 'lucide-react';
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
  maintenance: 'Maintenance',
  supply: 'Supply Issue',
  equipment: 'Equipment',
  other: 'Other',
};

export function TicketsPage() {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { tickets, isLoading } = useTickets({ status: statusFilter });

  const filteredTickets = tickets?.filter(
    (ticket) =>
      ticket.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <h1 className="text-2xl font-bold text-text-primary">Tickets</h1>

        <div className="flex-1 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TicketStatus | 'all')}
            className="px-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {statusFilters.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : !filteredTickets?.length ? (
        <div className="text-center py-12">
          <TicketIcon className="w-12 h-12 mx-auto text-text-secondary mb-4" />
          <p className="text-text-secondary">No tickets found</p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border divide-y divide-border">
          {filteredTickets.map((ticket) => (
            <Link
              key={ticket.id}
              to={`/tickets/${ticket.id}`}
              className="flex items-center justify-between p-4 hover:bg-primary/5 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <TicketIcon className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="font-medium text-text-primary">
                    {typeLabels[ticket.type] || ticket.type}
                  </p>
                  <p className="text-sm text-text-secondary">
                    #{ticket.id.slice(-6)}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {ticket.createdAt &&
                      formatDistanceToNow(ticket.createdAt.toDate(), {
                        addSuffix: true,
                      })}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <Badge className={statusColors[ticket.status]}>
                  {ticket.status}
                </Badge>
                {ticket.raisedBy && (
                  <p className="text-xs text-text-secondary mt-1">
                    by {ticket.raisedBy}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
