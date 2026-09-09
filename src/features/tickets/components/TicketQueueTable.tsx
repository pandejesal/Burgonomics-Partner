import React from 'react';
import { AlertCircle, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import type { Ticket, TicketPriority, TicketStatus } from '@/types';

interface TicketQueueTableProps {
  tickets: Ticket[];
  onOpenResolveModal: (ticket: Ticket) => void;
  onQuickEscalate: (ticket: Ticket) => Promise<void> | void;
}

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  urgent: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  low: 'bg-neutral-500/20 text-neutral-300 border-neutral-500/40',
};

const STATUS_STYLES: Record<TicketStatus, string> = {
  open: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  in_progress: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  resolved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  closed: 'bg-neutral-500/20 text-neutral-300 border-neutral-500/40',
};

function tierOf(ticket: Ticket): string {
  return (
    (ticket as { escalationLevel?: unknown }).escalationLevel as string ||
    (ticket as { assignedToTier?: unknown }).assignedToTier as string ||
    'L1_STORE'
  );
}

/**
 * TicketQueueTable — presentational queue. Rows render ticket data as-is;
 * Resolve opens the page-owned modal, Escalate delegates to the page handler
 * (which confirms + mutates + toasts). The rethrown page error is already
 * toasted there, so the button swallows it to avoid unhandled rejections.
 */
export function TicketQueueTable({
  tickets,
  onOpenResolveModal,
  onQuickEscalate,
}: TicketQueueTableProps) {
  if (tickets.length === 0) {
    return (
      <div className="p-12 text-center text-neutral-400 bg-neutral-900/40 rounded-2xl border border-dashed border-neutral-800">
        <AlertCircle className="w-10 h-10 mx-auto mb-2 text-neutral-600" />
        <p className="text-sm font-bold text-white">No tickets match current filters.</p>
        <p className="text-xs text-neutral-500 mt-0.5">Try another tier tab, category, or search query.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950/80 shadow-md">
      <table className="w-full text-left text-xs text-neutral-300 border-collapse">
        <thead className="bg-neutral-900/90 text-neutral-400 font-bold uppercase tracking-wider text-[10px] border-b border-neutral-800">
          <tr>
            <th className="py-3 px-4">Ticket #</th>
            <th className="py-3 px-4">Subject</th>
            <th className="py-3 px-4">Branch</th>
            <th className="py-3 px-4">Priority</th>
            <th className="py-3 px-4">Tier</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-850">
          {tickets.map((ticket) => {
            const code = ticket.ticketNumber || ticket.id.slice(0, 8).toUpperCase();
            const subject = ticket.title || 'Untitled ticket';
            const resolved = ticket.status === 'resolved' || ticket.status === 'closed';
            return (
              <tr key={ticket.id} className="hover:bg-neutral-900/60 transition-colors">
                <td className="py-3 px-4 font-mono font-black text-white text-sm">{code}</td>
                <td className="py-3 px-4 max-w-[220px]">
                  <p className="font-bold text-white truncate">{subject}</p>
                  <p className="text-[11px] text-neutral-500 truncate">{ticket.message}</p>
                </td>
                <td className="py-3 px-4 font-bold text-[11px] text-neutral-300">
                  {ticket.branchName || ticket.branchId}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded border font-bold text-[10px] uppercase ${PRIORITY_STYLES[ticket.priority]}`}
                  >
                    {ticket.priority}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono text-[11px] text-neutral-400">{tierOf(ticket)}</td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded border font-bold text-[10px] uppercase ${STATUS_STYLES[ticket.status]}`}
                  >
                    {ticket.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {!resolved && (
                      <button
                        type="button"
                        onClick={() => onOpenResolveModal(ticket)}
                        aria-label={`Resolve ticket ${code}`}
                        className="px-2 py-1 min-h-[44px] rounded-lg bg-[#0E4825] hover:bg-[#135d30] text-emerald-300 border border-emerald-500/40 font-bold text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Resolve</span>
                      </button>
                    )}
                    {!resolved && (
                      <button
                        type="button"
                        onClick={() => {
                          void Promise.resolve(onQuickEscalate(ticket)).catch(() => undefined);
                        }}
                        aria-label={`Escalate ticket ${code}`}
                        className="px-2 py-1 min-h-[44px] rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <ArrowUpRight className="w-3 h-3" />
                        <span>Escalate</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default TicketQueueTable;
