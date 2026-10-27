import type { Ticket } from '@/types';
import { isTerminalTicketStatus, resolveTicketTier, type CanonicalTierLevel } from './ticketContract';

export type TicketQueueTab = 'all' | CanonicalTierLevel | 'resolved';

export interface TicketQueueFilters {
  activeTierTab: TicketQueueTab;
  categoryFilter: string;
  searchQuery: string;
}

/** True when the query matches ticket number, customer, phone, title or body. */
export function matchesTicketSearch(ticket: Ticket, rawQuery: string): boolean {
  const query = rawQuery.toLowerCase().trim();
  if (!query) return true;

  const matchesTitle = (ticket.title || (ticket as any).subject || '').toLowerCase().includes(query);
  const matchesDesc = (ticket.message || (ticket as any).description || '').toLowerCase().includes(query);
  const matchesCustomer = (ticket.customerName || '').toLowerCase().includes(query);
  const matchesPhone = (ticket.customerPhone || '').includes(query);
  const matchesNumber = (ticket.ticketNumber || ticket.id).toLowerCase().includes(query);

  return matchesTitle || matchesDesc || matchesCustomer || matchesPhone || matchesNumber;
}

/**
 * Projects the live ticket list onto the queue tabs.
 *
 * Tab contract:
 * - `resolved` — terminal tickets only (resolved/closed).
 * - `all` (labelled "All Active") — ACTIVE tickets only; terminal rows are
 *   excluded so the default tab never mixes finished work into the queue.
 * - a tier tab — active tickets whose resolved tier matches exactly.
 * Unknown tiers therefore appear only under "All Active" and are never
 * counted into a tier tab.
 */
export function filterTicketQueue(
  tickets: readonly Ticket[],
  filters: TicketQueueFilters,
): Ticket[] {
  return tickets.filter((ticket) => {
    const isTerminal = isTerminalTicketStatus(ticket.status);

    if (filters.activeTierTab === 'resolved') {
      if (!isTerminal) return false;
    } else {
      if (isTerminal) return false;
      if (filters.activeTierTab !== 'all') {
        if (resolveTicketTier(ticket) !== filters.activeTierTab) return false;
      }
    }

    if (filters.categoryFilter !== 'all' && ticket.category !== filters.categoryFilter) {
      return false;
    }

    return matchesTicketSearch(ticket, filters.searchQuery);
  });
}
