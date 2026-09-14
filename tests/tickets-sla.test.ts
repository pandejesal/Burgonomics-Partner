import { describe, it, expect } from 'vitest';
import { checkTicketInactivityEscalation } from '../src/test/kdsRoyalty.benchmark.test';

export interface PartnerSupportTicket {
  id: string;
  orderId?: string;
  customerId: string;
  category: 'damaged_food' | 'missing_item' | 'late_delivery' | 'payment_issue' | 'other';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'escalated' | 'resolved' | 'closed';
  tier: 1 | 2 | 3;
  createdAt: number;
  lastActivityAt: number;
  branchId: string;
}

export function computeTicketSlaBadge(ticket: PartnerSupportTicket, now = Date.now()): {
  slaMinutesRemaining: number;
  isOverdue: boolean;
  color: 'green' | 'amber' | 'red';
} {
  const maxSlaMinutes = ticket.priority === 'critical' ? 15 : ticket.priority === 'high' ? 30 : 60;
  const elapsedMinutes = (now - ticket.createdAt) / (60 * 1000);
  const remaining = Math.round(maxSlaMinutes - elapsedMinutes);

  if (remaining <= 0) {
    return { slaMinutesRemaining: 0, isOverdue: true, color: 'red' };
  }
  if (remaining <= 15) {
    return { slaMinutesRemaining: remaining, isOverdue: false, color: 'amber' };
  }
  return { slaMinutesRemaining: remaining, isOverdue: false, color: 'green' };
}

describe('Partner 3-Tier Support Ticket SLA & Auto-Escalation Suite', () => {
  it('identifies overdue tickets needing escalation from Branch (Tier 1) to Brand Support (Tier 2) after 60 min', () => {
    const now = Date.now();
    const created70m = now - 70 * 60 * 1000;

    const result = checkTicketInactivityEscalation(created70m, 'open', 1, now);
    expect(result.shouldEscalate).toBe(true);
    expect(result.targetTier).toBe(2);
    expect(result.reason).toContain('>60m SLA');
  });

  it('identifies overdue tickets needing escalation from Brand Support (Tier 2) to Developer Team (Tier 3) after 180 min', () => {
    const now = Date.now();
    const created200m = now - 200 * 60 * 1000;

    const result = checkTicketInactivityEscalation(created200m, 'open', 2, now);
    expect(result.shouldEscalate).toBe(true);
    expect(result.targetTier).toBe(3);
    expect(result.reason).toContain('>180m SLA');
  });

  it('does not escalate resolved tickets regardless of age', () => {
    const now = Date.now();
    const created5HoursAgo = now - 300 * 60 * 1000;

    const result = checkTicketInactivityEscalation(created5HoursAgo, 'resolved', 1, now);
    expect(result.shouldEscalate).toBe(false);
    expect(result.targetTier).toBe(1);
  });

  it('correctly computes visual SLA timer badge color based on priority and elapsed time', () => {
    const now = Date.now();
    const freshTicket: PartnerSupportTicket = {
      id: 'tkt_01',
      customerId: 'cust_01',
      category: 'late_delivery',
      priority: 'high', // 30m SLA
      status: 'open',
      tier: 1,
      createdAt: now - 5 * 60 * 1000, // 5 min old -> 25 min remaining
      lastActivityAt: now - 5 * 60 * 1000,
      branchId: 'branch_surat_01',
    };

    const freshBadge = computeTicketSlaBadge(freshTicket, now);
    expect(freshBadge.isOverdue).toBe(false);
    expect(freshBadge.slaMinutesRemaining).toBe(25);
    expect(freshBadge.color).toBe('green');

    const warningTicket: PartnerSupportTicket = {
      ...freshTicket,
      createdAt: now - 20 * 60 * 1000, // 20 min old -> 10 min remaining
    };
    const warningBadge = computeTicketSlaBadge(warningTicket, now);
    expect(warningBadge.isOverdue).toBe(false);
    expect(warningBadge.slaMinutesRemaining).toBe(10);
    expect(warningBadge.color).toBe('amber');

    const overdueTicket: PartnerSupportTicket = {
      ...freshTicket,
      createdAt: now - 35 * 60 * 1000, // 35 min old -> overdue
    };
    const overdueBadge = computeTicketSlaBadge(overdueTicket, now);
    expect(overdueBadge.isOverdue).toBe(true);
    expect(overdueBadge.slaMinutesRemaining).toBe(0);
    expect(overdueBadge.color).toBe('red');
  });
});
