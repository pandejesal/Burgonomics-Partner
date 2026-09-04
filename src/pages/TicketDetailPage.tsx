import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTicket } from '@/hooks/useTicket';
import { useAuthStore } from '@/stores/authStore';
import {
  ArrowLeft,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Send,
  Paperclip,
  Store,
  User,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import type { TicketStatus } from '@/types';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { ticket, isLoading, updateTicket } = useTicket(id || '');

  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  if (isLoading) {
    return (
      <div className="p-16 text-center text-zinc-400 text-xs">Loading incident details...</div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-16 text-center bg-[#132A17] rounded-2xl border border-[#234B2A] text-white space-y-3">
        <AlertCircle className="w-10 h-10 mx-auto text-[#D95D0F]" />
        <h3 className="font-bold text-sm">Ticket Not Found</h3>
        <button
          onClick={() => navigate('/tickets')}
          className="px-4 py-2 bg-[#D95D0F] text-white text-xs font-semibold rounded-xl"
        >
          Return to Tickets
        </button>
      </div>
    );
  }

  const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';

  const handleResolveTicket = async () => {
    try {
      setIsResolving(true);
      await updateTicket.mutateAsync({
        status: 'resolved',
        resolution:
          resolutionNotes.trim() ||
          `Resolved by ${user?.name || 'Staff'} (${user?.role || 'team'})`,
      });
      setResolutionNotes('');
    } finally {
      setIsResolving(false);
    }
  };

  const handleReopenTicket = async () => {
    await updateTicket.mutateAsync({
      status: 'open',
      resolution: 'Re-opened by operator for further investigation.',
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/tickets')}
          className="flex items-center space-x-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Incident Tickets</span>
        </button>

        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
            isResolved
              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
              : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
          }`}
        >
          {isResolved ? 'Status: Resolved' : 'Status: Open / In Progress'}
        </span>
      </div>

      {/* Main Ticket Card */}
      <div className="bg-[#132A17] border border-[#234B2A] rounded-2xl p-6 space-y-6 text-white shadow-xl">
        {/* Title & Metadata */}
        <div className="border-b border-[#234B2A] pb-6 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-white tracking-wide">
                {ticket.title || ticket.message.slice(0, 70)}
              </h1>
              <p className="text-xs text-zinc-400">
                Ticket ID: <span className="font-mono text-zinc-300">{ticket.id}</span>
              </p>
            </div>

            <div className="p-3 rounded-xl bg-[#1E3A24] text-[#D95D0F] shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300 pt-2">
            <span className="flex items-center gap-1.5 bg-[#0D0F0D] px-3 py-1 rounded-lg border border-[#234B2A]">
              <Store className="w-3.5 h-3.5 text-[#D95D0F]" />
              <span>{ticket.branchName || ticket.branchId}</span>
            </span>

            <span className="flex items-center gap-1.5 bg-[#0D0F0D] px-3 py-1 rounded-lg border border-[#234B2A]">
              <User className="w-3.5 h-3.5 text-zinc-400" />
              <span>Reported by {ticket.raisedByName || ticket.raisedById || 'Branch Owner'}</span>
            </span>

            <span className="flex items-center gap-1.5 bg-[#0D0F0D] px-3 py-1 rounded-lg border border-[#234B2A]">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>
                {ticket.createdAt?.toDate
                  ? ticket.createdAt.toDate().toLocaleString([], {
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

        {/* Message Body */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Issue Description
          </h3>
          <div className="bg-[#0D0F0D] border border-[#234B2A] rounded-xl p-4 text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap">
            {ticket.message}
          </div>

          {/* Attachments */}
          {ticket.attachments && ticket.attachments.length > 0 && (
            <div className="pt-3 space-y-2">
              <h4 className="text-xs font-semibold text-zinc-400">Attached Screenshots</h4>
              <div className="flex flex-wrap gap-3">
                {ticket.attachments.map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl overflow-hidden border border-[#234B2A] hover:border-[#D95D0F] transition-colors"
                  >
                    <img src={url} alt="attachment" className="h-32 w-auto object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Resolution Block */}
        {isResolved && ticket.resolution && (
          <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-4 space-y-2 text-xs">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Resolution Notes</span>
            </div>
            <p className="text-zinc-200 leading-relaxed">{ticket.resolution}</p>
          </div>
        )}

        {/* Action Panel */}
        <div className="bg-[#0D0F0D] border border-[#234B2A] rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-bold text-white">Issue Resolution Actions</h3>

          {!isResolved ? (
            <div className="space-y-3">
              <textarea
                rows={2}
                placeholder="Enter resolution notes (e.g. Restarted Petpooja agent service, KOT printer test print passed)..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-[#132A17] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
              />

              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={handleResolveTicket}
                  disabled={isResolving}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl transition-colors flex items-center space-x-2 shadow-md disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isResolving ? 'Resolving...' : 'Mark Issue as Resolved'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-400">
                This issue has been marked resolved. If problems recur, you may reopen it.
              </p>
              <button
                onClick={handleReopenTicket}
                className="px-4 py-2 bg-[#1E3A24] hover:bg-[#285031] text-zinc-200 text-xs font-semibold rounded-xl border border-[#234B2A]"
              >
                Reopen Incident Ticket
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
