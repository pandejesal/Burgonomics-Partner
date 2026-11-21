/**
 * Loyalty UI retirement, part 2 (owner decision 2026-11-20: "Loyalty no: hide
 * coins, tiers and points everywhere").
 *
 * The first pass removed coins/tiers from the console CRM screens and stopped
 * the server minting. Four loyalty surfaces were still reachable in the Partner
 * app, and one of them is worse than cosmetic:
 *
 *  - `TicketResolutionModal` offered "Apology Grill Coins Credit" as the
 *    DEFAULT resolution action, and `TicketsPage` / `TicketDetailPage` posted
 *    `action: "loyalty_credit"` to a server that now refuses it with
 *    `LOYALTY_RETIRED` (409). A control whose only possible outcome is an error
 *    is a dead path, not a feature.
 *  - `AdminCustomerAnalyticsPage` rendered a "Customer Loyalty Tier
 *    Distribution" pie chart from `loyaltyTier`.
 *  - `AdminSegmentsPage` exposed a "Loyalty Tier Rank" filter and stored
 *    `loyaltyTier` in saved segments.
 *  - The Customer Insights widget advertised "Loyalty Lift" / "Returning
 *    Loyalty".
 *
 * Two of those are pure display (chart, filter, copy) so they are asserted on
 * their rendered/source shape; the ticket one is also asserted by rendering the
 * modal, because that is copy an operator would act on.
 *
 * RED against the pre-fix components.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({ app: {}, auth: { currentUser: null }, db: {}, messaging: null }));
vi.mock('@/core/config/firebase', () => ({ app: {}, auth: { currentUser: null }, db: {}, messaging: null }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: { id: 'u1', role: 'developer' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TicketResolutionModal } from '../src/features/tickets/components/TicketResolutionModal';
import type { Ticket } from '../src/types';

const ticket = {
  id: 'tkt_1',
  ticketNumber: 'TKT-1001',
  title: 'Cold burger',
  status: 'open',
  category: 'customer_escalation',
  priority: 'high',
  branchId: 'branch_1',
  branchName: 'Store 1',
  raisedById: 'u1',
  raisedByName: 'Owner',
  raisedByRole: 'branch_owner',
  customerId: 'cust_1',
  customerName: 'Samir',
  customerPhone: '9898989898',
  message: 'Burger was cold',
  createdAt: { seconds: 1 } as unknown as Ticket['createdAt'],
  updatedAt: { seconds: 1 } as unknown as Ticket['updatedAt'],
} as Ticket;

const LOYALTY_WORDS = /loyalty|grill coins|grill-coins|\bcoins?\b|\bpoints\b/i;

const read = (rel: string) => readFileSync(rel, 'utf8');

describe('ticket resolution after the loyalty retirement', () => {
  it('offers no coin-credit action at all', () => {
    const html = renderToStaticMarkup(
      React.createElement(TicketResolutionModal, {
        ticket,
        isOpen: true,
        onClose: () => {},
        onConfirmResolution: () => {},
      })
    );
    expect(html).not.toMatch(LOYALTY_WORDS);
    // The real compensation path is still offered.
    expect(html).toContain('Order Refund via Razorpay');
    // `&` is HTML-escaped in static markup, so assert the unescaped tail.
    expect(html).toContain('Customer Explanation');
  });

  it('no page can post a retired loyalty credit', () => {
    for (const rel of [
      'src/pages/TicketsPage.tsx',
      'src/pages/TicketDetailPage.tsx',
    ]) {
      expect(read(rel)).not.toMatch(/loyalty_credit|CREDIT_GRILL_COINS|grillCoinsAmount/);
    }
  });
});

describe('read-only loyalty displays after the retirement', () => {
  it('the customer analytics page renders no loyalty tier chart', () => {
    const src = read('src/admin/pages/AdminCustomerAnalyticsPage.tsx');
    expect(src).not.toMatch(LOYALTY_WORDS);
  });

  it('the segments builder offers no loyalty tier filter or attribute', () => {
    const src = read('src/admin/pages/AdminSegmentsPage.tsx');
    expect(src).not.toMatch(LOYALTY_WORDS);
  });

  it('the customer insights widget advertises no loyalty metric', () => {
    const src = read('src/admin/dashboard/components/widgets/CustomerInsights.tsx');
    expect(src).not.toMatch(/loyalty|grill coins|grill-coins/i);
  });
});
