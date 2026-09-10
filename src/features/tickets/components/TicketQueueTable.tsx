import React from 'react';
import { Link } from 'react-router-dom';
import {
  Phone,
  Store,
  ChevronRight,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
} from 'lucide-react';
import { EscalationTierBadge } from './EscalationTierBadge';
import type { Ticket, TicketPriority } from '@/types';

interface TicketQueueTableProps {
  tickets: Ticket[];
  onOpenResolveModal: (ticket: Ticket) => void;
  onQuickEscalate: (ticket: Ticket) => void;
  onClearFilters?: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  wrong_item: '🔄',
  late_delivery: '⏱️',
  food_quality: '🍔',
  payment_issue: '💳',
  app_bug: '🐛',
  general_inquiry: '💬',
  LATE_DELIVERY: '⏱️',
  MISSING_ITEM: '📦',
  FOOD_QUALITY: '🍔',
  WRONG_ORDER: '🔄',
  PAYMENT_ISSUE: '💳',
  OTHER: '💬',
};

export function TicketQueueTable({
  tickets,
  onOpenResolveModal,
  onQuickEscalate,
  onClearFilters,
}: TicketQueueTableProps) {
  if (tickets.length === 0) {
    return (
      <div className="text-center py-16 bg-neutral-900/40 rounded-3xl border border-dashed border-neutral-800 p-8">
        <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
        <h3 className="font-bold text-white text-base">Support Queue All Clear!</h3>
        <p className="text-xs text-neutral-500 mt-1">
          No customer tickets in this queue. Great job on customer happiness!
        </p>
        {onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-3 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold transition-colors cursor-pointer min-h-[44px]"
          >
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-neutral-800 bg-[#090909] overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-neutral-300">
          <thead className="bg-neutral-900/80 border-b border-neutral-800 text-neutral-400 font-bold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-3.5 px-4">Ticket & Category</th>
              <th className="py-3.5 px-4">Customer</th>
              <th className="py-3.5 px-4">Order Link</th>
              <th className="py-3.5 px-4">3-Tier Escalation SLA</th>
              <th className="py-3.5 px-4">Priority</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-850">
            {tickets.map((t) => {
              const shortCode =
                (t as any).ticketNumber || t.id.slice(-6).toUpperCase();
              const catIcon = CATEGORY_ICONS[t.category] || '🎫';
              const orderId = t.orderId || (t as any).orderShortCode;
              const isResolved = t.status === 'resolved' || t.status === 'closed';

              const level =
                (t as any).escalationLevel ||
                (t as any).assignedToTier ||
                (t as any).assignedTo?.tier ||
                'L1_STORE';

              return (
                <tr key={t.id} className="hover:bg-neutral-900/50 transition-colors">
                  {/* Ticket & Category */}
                  <td className="py-3 px-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-white text-xs">
                          #{shortCode}
                        </span>
                        <span className="text-sm">{catIcon}</span>
                      </div>
                      <Link
                        to={`/tickets/${t.id}`}
                        className="font-bold text-neutral-200 hover:text-[#FF6600] transition-colors block truncate max-w-[200px]"
                      >
                        {t.title || (t as any).subject || t.message || 'Support Ticket'}
                      </Link>
                    </div>
                  </td>

                  {/* Customer Info */}
                  <td className="py-3 px-4">
                    <div>
                      <span className="font-bold text-white block truncate max-w-[140px]">
                        {t.customerName || 'Customer'}
                      </span>
                      {t.customerPhone && (
                        <a
                          href={`tel:${t.customerPhone}`}
                          className="text-[11px] text-neutral-400 hover:text-emerald-400 flex items-center gap-1 font-mono"
                        >
                          <Phone className="w-2.5 h-2.5" />
                          <span>{t.customerPhone}</span>
                        </a>
                      )}
                    </div>
                  </td>

                  {/* Order Link */}
                  <td className="py-3 px-4">
                    {orderId ? (
                      <Link
                        to={`/orders/${orderId}`}
                        className="inline-flex items-center gap-1 font-mono font-bold text-xs text-[#FF6600] hover:underline"
                      >
                        <span>#{orderId.slice(-6).toUpperCase()}</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    ) : (
                      <span className="text-neutral-500 font-mono text-[11px]">N/A</span>
                    )}
                  </td>

                  {/* Escalation Tier Badge */}
                  <td className="py-3 px-4">
                    <EscalationTierBadge
                      level={level}
                      createdAt={t.createdAt}
                      showTimer={!isResolved}
                    />
                  </td>

                  {/* Priority */}
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        t.priority === 'urgent'
                          ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                          : t.priority === 'high'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                          : 'bg-neutral-800 text-neutral-300 border-neutral-700'
                      }`}
                    >
                      {t.priority || 'normal'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {!isResolved && (
                        <>
                          <button
                            type="button"
                            onClick={() => onOpenResolveModal(t)}
                            className="px-2.5 py-1 rounded-xl bg-[#0E4825] hover:bg-[#135d30] border border-emerald-500/40 text-emerald-300 text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            Resolve
                          </button>

                          <button
                            type="button"
                            onClick={() => onQuickEscalate(t)}
                            className="px-2 py-1 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-500/40 text-amber-300 text-[11px] font-bold transition-colors cursor-pointer"
                            title="Escalate Tier Level"
                          >
                            Escalate
                          </button>
                        </>
                      )}

                      <Link
                        to={`/tickets/${t.id}`}
                        className="p-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white transition-colors"
                        title="View Full Ticket Details"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TicketQueueTable;
