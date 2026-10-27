import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/config/firebase', () => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  messaging: null,
}));

vi.mock('@/core/config/firebase', () => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  messaging: null,
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'usr_01', name: 'Support Operator', role: 'developer' },
  }),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: toastMocks,
}));

const apiMocks = vi.hoisted(() => ({
  escalateTicket: vi.fn(async () => ({ success: true })),
  resolveTicket: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/services/partnerFunctionsApi', () => ({
  partnerFunctionsApi: apiMocks,
}));

// Keep the REAL queue table rendered (rows, badges, action buttons) and only
// tap the handler it receives, so page tests exercise the real render path.
let capturedOnQuickEscalate: ((ticket: Ticket) => Promise<void>) | null = null;
vi.mock('@/features/tickets', async () => {
  const actual = await vi.importActual<any>('@/features/tickets');
  return {
    ...actual,
    TicketQueueTable: (props: any) => {
      capturedOnQuickEscalate = props.onQuickEscalate;
      const RealTable = actual.TicketQueueTable;
      return <RealTable {...props} />;
    },
  };
});

import { TicketsPage } from './TicketsPage';
import {
  resolveTicketTier,
  getNextEscalationTarget,
  normalizeTicketDoc,
  normalizeSupportTicketDoc,
} from '@/utils/ticketContract';
import { filterTicketQueue } from '@/utils/ticketQueue';
import type { Ticket } from '@/types';

/** Reads a KPI card value by its label, from the real rendered markup. */
function readKpi(html: string, label: string): number {
  const labelIndex = html.indexOf(label);
  if (labelIndex < 0) throw new Error(`KPI label not found: ${label}`);
  const segment = html.slice(labelIndex);
  const match = segment.match(/>(\d+)<\/p>/);
  if (!match) throw new Error(`KPI value not found after: ${label}`);
  return Number(match[1]);
}

describe('TicketsPage — 3-Tier SLA Escalation & KPI Data Contract Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnQuickEscalate = null;
  });

  // Real post-write shapes: manual and scheduled escalation both persist
  // status:'escalated' with assignedTo.tier set to the target tier.
  const mockTickets: Ticket[] = [
    normalizeSupportTicketDoc('tkt_l1', {
      title: 'Missing peri peri dip',
      customerName: 'Aarav Shah',
      customerPhone: '+91 98250 11223',
      status: 'open',
      category: 'wrong_item',
      priority: 'medium',
      assignedTo: { tier: 'branch' },
    }),
    normalizeSupportTicketDoc('tkt_l2', {
      title: 'Payment deducted twice',
      customerName: 'Pooja Dave',
      customerPhone: '+91 97123 44556',
      status: 'escalated',
      category: 'payment_issue',
      priority: 'urgent',
      assignedTo: { tier: 'brand_support' },
    }),
    normalizeSupportTicketDoc('tkt_l3', {
      title: 'POS timeout order unassigned',
      customerName: 'Karan Patel',
      customerPhone: '+91 99090 11223',
      status: 'escalated',
      category: 'food_quality',
      priority: 'urgent',
      assignedTo: { tier: 'developer_team' },
    }),
    normalizeTicketDoc('tkt_closed', {
      title: 'Resolved complaint',
      customerName: 'Neha Verma',
      customerPhone: '+91 99090 55555',
      status: 'resolved',
      category: 'late_delivery',
      priority: 'low',
      assignedTo: { tier: 'branch' },
    }),
  ];

  const renderWithClient = (tickets: Ticket[]) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TicketsPage initialTickets={tickets} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  describe('1. Canonical Tier Resolver Contract (no local tautologies)', () => {
    it('resolves canonical assignedTo.tier and maps accurately to 3-tier levels', () => {
      expect(resolveTicketTier(mockTickets[0])).toBe('L1_STORE');
      expect(resolveTicketTier(mockTickets[1])).toBe('L2_REGIONAL');
      expect(resolveTicketTier(mockTickets[2])).toBe('L3_EXECUTIVE');
    });

    it('calculates next escalation target upward-only', () => {
      expect(getNextEscalationTarget('L1_STORE')).toEqual({
        targetTier: 'brand_support',
        nextLevel: 'L2_REGIONAL',
      });
      expect(getNextEscalationTarget('L2_REGIONAL')).toEqual({
        targetTier: 'developer_team',
        nextLevel: 'L3_EXECUTIVE',
      });
      // Tier 3 cannot be escalated further
      expect(getNextEscalationTarget('L3_EXECUTIVE')).toBeNull();
    });
  });

  describe('2. KPI Card Counts use the active predicate and the canonical resolver', () => {
    it('counts the real escalated L2/L3 rows as active work and resolved separately', () => {
      const html = renderWithClient(mockTickets);

      // Active Queue = 3 active tickets (tkt_l1 open, tkt_l2/tkt_l3 escalated)
      expect(html).toContain('Active Queue');
      expect(readKpi(html, 'Active Queue')).toBe(3);

      expect(html).toContain('L2 Regional Escalations');
      expect(readKpi(html, 'L2 Regional Escalations')).toBe(1);

      expect(html).toContain('L3 Executive Alerts');
      expect(readKpi(html, 'L3 Executive Alerts')).toBe(1);

      expect(html).toContain('Resolved Total');
      expect(readKpi(html, 'Resolved Total')).toBe(1);
    });

    it('does not quarantine an escalated ticket or coerce it to open', () => {
      const escalated = normalizeSupportTicketDoc('tkt_esc', {
        status: 'escalated',
        assignedTo: { tier: 'brand_support' },
      });

      expect(escalated.status).toBe('escalated');
      expect((escalated as any).quarantineReason).toBeUndefined();

      const html = renderWithClient([escalated]);
      expect(readKpi(html, 'Active Queue')).toBe(1);
      expect(readKpi(html, 'L2 Regional Escalations')).toBe(1);
      expect(html).not.toContain('unrecognized ticket status');
    });
  });

  describe('3. Real queue table renders the same records the KPIs count', () => {
    it('renders active rows with their tier badges and hides terminal rows from All Active', () => {
      const html = renderWithClient(mockTickets);

      // Real rows from the real TicketQueueTable
      expect(html).toContain('Payment deducted twice');
      expect(html).toContain('POS timeout order unassigned');
      expect(html).toContain('Missing peri peri dip');
      expect(html).toContain('L2 Regional Escalation');
      expect(html).toContain('L3 Executive Escalation');

      // Default tab is "All Active": a resolved row must not appear in it.
      expect(html).toContain('All Active');
      expect(html).not.toContain('Resolved complaint');
      // Resolved rows expose no resolve/escalate actions in any tab.
      expect(html).not.toContain('Support Queue All Clear!');
    });

    it('renders an explicit unknown-tier badge instead of guessing L1', () => {
      const unknownTier = normalizeTicketDoc('tkt_unknown_tier', {
        title: 'Unassigned incident',
        customerName: 'Ravi Joshi',
        status: 'open',
        category: 'other',
        priority: 'medium',
        // No assignedTo / legacy tier fields at all.
      });

      const html = renderWithClient([unknownTier]);
      expect(html).toContain('Unassigned Tier');
      expect(html).not.toContain('L1 Store Queue');
    });
  });

  describe('4. Queue filters — All Active, tier tabs, resolved tab, search', () => {
    const filters = (overrides: Partial<Parameters<typeof filterTicketQueue>[1]> = {}) => ({
      activeTierTab: 'all' as const,
      categoryFilter: 'all',
      searchQuery: '',
      ...overrides,
    });

    it('All Active excludes resolved and closed tickets', () => {
      const closed = normalizeTicketDoc('tkt_closed_2', {
        title: 'Closed complaint',
        status: 'closed',
        assignedTo: { tier: 'branch' },
      });
      const rows = filterTicketQueue([...mockTickets, closed], filters());

      expect(rows.map((r) => r.id)).toEqual(['tkt_l1', 'tkt_l2', 'tkt_l3']);
      expect(rows.every((r) => r.status !== 'resolved' && r.status !== 'closed')).toBe(true);
    });

    it('the Resolved tab contains only terminal rows', () => {
      const closed = normalizeTicketDoc('tkt_closed_2', {
        title: 'Closed complaint',
        status: 'closed',
        assignedTo: { tier: 'branch' },
      });
      const rows = filterTicketQueue(
        [...mockTickets, closed],
        filters({ activeTierTab: 'resolved' }),
      );

      expect(rows.map((r) => r.id).sort()).toEqual(['tkt_closed', 'tkt_closed_2']);
    });

    it('tier tabs contain only active rows of that exact tier', () => {
      expect(filterTicketQueue(mockTickets, filters({ activeTierTab: 'L2_REGIONAL' })).map((r) => r.id)).toEqual([
        'tkt_l2',
      ]);
      expect(filterTicketQueue(mockTickets, filters({ activeTierTab: 'L3_EXECUTIVE' })).map((r) => r.id)).toEqual([
        'tkt_l3',
      ]);
      expect(filterTicketQueue(mockTickets, filters({ activeTierTab: 'L1_STORE' })).map((r) => r.id)).toEqual([
        'tkt_l1',
      ]);
    });

    it('search narrows the visible rows', () => {
      expect(filterTicketQueue(mockTickets, filters({ searchQuery: 'pooja' })).map((r) => r.id)).toEqual([
        'tkt_l2',
      ]);
      // Phone search matches active rows; the resolved row stays out of All Active.
      expect(filterTicketQueue(mockTickets, filters({ searchQuery: '99090' })).map((r) => r.id)).toEqual([
        'tkt_l3',
      ]);
      expect(
        filterTicketQueue(mockTickets, filters({ activeTierTab: 'resolved', searchQuery: '99090' })).map(
          (r) => r.id,
        ),
      ).toEqual(['tkt_closed']);
      expect(filterTicketQueue(mockTickets, filters({ searchQuery: 'no such ticket' }))).toHaveLength(0);
    });

    it('KPI totals stay tied to the full active list, not the visible projection', () => {
      const html = renderWithClient(mockTickets);
      const activeRows = filterTicketQueue(mockTickets, filters());
      const resolvedRows = filterTicketQueue(mockTickets, filters({ activeTierTab: 'resolved' }));

      expect(readKpi(html, 'Active Queue')).toBe(activeRows.length);
      expect(readKpi(html, 'Active Queue')).toBe(3);
      expect(readKpi(html, 'L2 Regional Escalations')).toBe(
        activeRows.filter((t) => resolveTicketTier(t) === 'L2_REGIONAL').length,
      );
      expect(readKpi(html, 'L3 Executive Alerts')).toBe(
        activeRows.filter((t) => resolveTicketTier(t) === 'L3_EXECUTIVE').length,
      );
      expect(readKpi(html, 'Resolved Total')).toBe(resolvedRows.length);
      expect(readKpi(html, 'Resolved Total')).toBe(1);
    });
  });

  describe('5. Actual Page Escalation Handlers & Monotonicity Enforcement', () => {
    it('refuses to escalate or downgrade an L3 ticket — NO API call, NO false success toast', async () => {
      renderWithClient(mockTickets);
      expect(capturedOnQuickEscalate).toBeTypeOf('function');

      const l3Ticket = mockTickets[2]; // assignedTo.tier: developer_team, status escalated
      await capturedOnQuickEscalate!(l3Ticket);

      // Must NOT post to escalate API
      expect(apiMocks.escalateTicket).not.toHaveBeenCalled();
      // Must NOT toast false success (e.g. "Escalated to L2_REGIONAL")
      expect(toastMocks.success).not.toHaveBeenCalled();
      // Must inform operator that it is already top tier
      expect(toastMocks.info).toHaveBeenCalledWith(
        expect.stringContaining('already at the highest escalation tier'),
      );
    });

    it('refuses to escalate a legacy L3 ticket after real ingestion — no downgrade to brand_support', async () => {
      // Legacy writer shape: no assignedTo, only escalationLevel.
      const legacyL3 = normalizeSupportTicketDoc('tkt_legacy_l3', {
        title: 'Legacy developer escalation',
        status: 'escalated',
        escalationLevel: 'L3_EXECUTIVE',
      });
      expect(resolveTicketTier(legacyL3)).toBe('L3_EXECUTIVE');

      renderWithClient([legacyL3]);
      await capturedOnQuickEscalate!(legacyL3);

      expect(apiMocks.escalateTicket).not.toHaveBeenCalled();
      expect(toastMocks.success).not.toHaveBeenCalled();
      expect(toastMocks.info).toHaveBeenCalledWith(
        expect.stringContaining('already at the highest escalation tier'),
      );
    });

    it('refuses to escalate closed or resolved tickets — NO API call, NO false success toast', async () => {
      renderWithClient(mockTickets);

      const closedTicket = mockTickets[3]; // status: resolved
      await capturedOnQuickEscalate!(closedTicket);

      expect(apiMocks.escalateTicket).not.toHaveBeenCalled();
      expect(toastMocks.success).not.toHaveBeenCalled();
      expect(toastMocks.error).toHaveBeenCalledWith(
        expect.stringContaining('Cannot escalate a resolved or closed ticket'),
      );
    });

    it('refuses to escalate a ticket with an unknown tier — NO API call', async () => {
      const unknownTier = normalizeTicketDoc('tkt_unknown_tier', {
        title: 'Unassigned incident',
        status: 'open',
        category: 'other',
        priority: 'medium',
      });

      renderWithClient([unknownTier]);
      await capturedOnQuickEscalate!(unknownTier);

      expect(apiMocks.escalateTicket).not.toHaveBeenCalled();
      expect(toastMocks.success).not.toHaveBeenCalled();
      expect(toastMocks.error).toHaveBeenCalledWith(
        expect.stringContaining('unknown assignment tier'),
      );
    });

    it('escalates an L1 ticket to L2 (brand_support) with the exact request payload', async () => {
      renderWithClient(mockTickets);

      const l1Ticket = mockTickets[0]; // assignedTo.tier: branch
      await capturedOnQuickEscalate!(l1Ticket);

      expect(apiMocks.escalateTicket).toHaveBeenCalledWith({
        ticketId: 'tkt_l1',
        targetTier: 'brand_support',
        reason: expect.stringContaining('L2_REGIONAL'),
      });
      expect(toastMocks.success).toHaveBeenCalledWith('Escalated to L2_REGIONAL.');
    });

    it('escalates an L2 ticket to L3 (developer_team) with the exact request payload', async () => {
      renderWithClient(mockTickets);

      const l2Ticket = mockTickets[1]; // assignedTo.tier: brand_support
      await capturedOnQuickEscalate!(l2Ticket);

      expect(apiMocks.escalateTicket).toHaveBeenCalledWith({
        ticketId: 'tkt_l2',
        targetTier: 'developer_team',
        reason: expect.stringContaining('L3_EXECUTIVE'),
      });
      expect(toastMocks.success).toHaveBeenCalledWith('Escalated to L3_EXECUTIVE.');
    });
  });
});
