import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTicket } from '@/hooks/useTicket';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { ArrowLeft, MessageSquare, Clock, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { ticket, isLoading, updateTicket } = useTicket(id || '');
  const [resolution, setResolution] = useState('');

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!ticket) {
    return <div className="text-center py-12">Ticket not found</div>;
  }

  const handleResolve = () => {
    if (resolution.trim()) {
      updateTicket.mutate({
        status: 'resolved',
        resolution: resolution.trim(),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-primary/5 rounded-xl"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-primary">
            {typeLabels[ticket.type] || ticket.type}
          </h1>
          <p className="text-text-secondary">#{ticket.id.slice(-6)}</p>
        </div>
        <Badge className={statusColors[ticket.status]}>{ticket.status}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Message */}
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Issue Description
            </h2>
            <p className="text-text-primary whitespace-pre-wrap">
              {ticket.message}
            </p>
          </div>

          {/* Resolution */}
          {ticket.resolution && (
            <div className="bg-surface rounded-2xl border border-border p-6">
              <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Resolution
              </h2>
              <p className="text-text-primary">{ticket.resolution}</p>
            </div>
          )}

          {/* Actions */}
          {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
            <div className="bg-surface rounded-2xl border border-border p-6">
              <h2 className="font-semibold text-text-primary mb-4">
                Resolve Ticket
              </h2>
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Describe how this issue was resolved..."
                className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary min-h-[100px]"
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleResolve}
                  disabled={!resolution.trim() || updateTicket.isPending}
                  className="px-4 py-2 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 disabled:opacity-50"
                >
                  {updateTicket.isPending ? 'Saving...' : 'Mark Resolved'}
                </button>
                <button
                  onClick={() =>
                    updateTicket.mutate({ status: 'in_progress' })
                  }
                  disabled={updateTicket.isPending}
                  className="px-4 py-2 bg-yellow-500 text-white rounded-xl font-medium hover:bg-yellow-600 disabled:opacity-50"
                >
                  Mark In Progress
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Ticket Info */}
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-4">
              Ticket Info
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-text-secondary">Type</span>
                <span className="text-text-primary">
                  {typeLabels[ticket.type]}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Raised By</span>
                <span className="text-text-primary capitalize">
                  {ticket.raisedBy?.replace('_', ' ')}
                </span>
              </div>
              {ticket.orderId && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Order</span>
                  <Link
                    to={`/orders/${ticket.orderId}`}
                    className="text-primary hover:underline"
                  >
                    #{ticket.orderId.slice(-6)}
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Timeline
            </h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    Ticket Created
                  </p>
                  <p className="text-xs text-text-secondary">
                    {ticket.createdAt &&
                      formatDistanceToNow(ticket.createdAt.toDate(), {
                        addSuffix: true,
                      })}
                  </p>
                </div>
              </div>
              {ticket.status !== 'open' && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-yellow-500 mt-2" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      In Progress
                    </p>
                    <p className="text-xs text-text-secondary">
                      {ticket.updatedAt &&
                        formatDistanceToNow(ticket.updatedAt.toDate(), {
                          addSuffix: true,
                        })}
                    </p>
                  </div>
                </div>
              )}
              {ticket.status === 'resolved' && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-2" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      Resolved
                    </p>
                    <p className="text-xs text-text-secondary">
                      {ticket.updatedAt &&
                        formatDistanceToNow(ticket.updatedAt.toDate(), {
                          addSuffix: true,
                        })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
