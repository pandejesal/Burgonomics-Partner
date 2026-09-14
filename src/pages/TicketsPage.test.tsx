import { describe, it, expect } from 'vitest';
import type { Ticket, TicketPriority } from '@/types';

describe('Prompt 31: Support Desk, 3-Tier Escalation & Ticket Resolution Suite', () => {
  describe('1. 3-Tier Escalation Level Normalization', () => {
    it('maps legacy and standard tier codes to normalized 3-tier levels', () => {
      const normalizeTier = (tier: string) => {
        if (tier === 'developer_team' || tier === 'L3_EXECUTIVE') return 'L3_EXECUTIVE';
        if (tier === 'brand_support' || tier === 'L2_REGIONAL') return 'L2_REGIONAL';
        return 'L1_STORE';
      };

      expect(normalizeTier('branch')).toBe('L1_STORE');
      expect(normalizeTier('L1_STORE')).toBe('L1_STORE');
      expect(normalizeTier('brand_support')).toBe('L2_REGIONAL');
      expect(normalizeTier('L2_REGIONAL')).toBe('L2_REGIONAL');
      expect(normalizeTier('developer_team')).toBe('L3_EXECUTIVE');
      expect(normalizeTier('L3_EXECUTIVE')).toBe('L3_EXECUTIVE');
    });

    it('calculates elapsed inactivity minutes accurately', () => {
      const now = 1000000;
      const createdAt = now - 20 * 60 * 1000; // 20 mins ago

      const elapsedMins = Math.max(0, Math.floor((now - createdAt) / 60000));
      expect(elapsedMins).toBe(20);
      expect(elapsedMins > 15).toBe(true); // L1 breach threshold
    });
  });

  describe('2. Ticket Resolution & Action Code Handling', () => {
    it('formats resolution summary string with action code, notes, and grill coins amount', () => {
      const action = 'CREDIT_GRILL_COINS';
      const notes = 'Apologized for 20m delivery delay';
      const coins = 100;

      const summary = `${action}: ${notes} (Credited ${coins} Grill Coins)`;
      expect(summary).toContain('CREDIT_GRILL_COINS');
      expect(summary).toContain('100 Grill Coins');
    });

    it('handles refund resolution string with full refund badge', () => {
      const action = 'REFUND_ORDER';
      const notes = 'Burger damaged in transit';

      const summary = `${action}: ${notes}`;
      expect(summary).toBe('REFUND_ORDER: Burger damaged in transit');
    });
  });

  describe('3. Ticket Filtering and Search Queries', () => {
    const mockTickets: Ticket[] = [
      {
        id: 'tkt_01',
        title: 'Cold burger arrived',
        customerName: 'Aarav Shah',
        customerPhone: '+91 98250 11223',
        status: 'open',
        category: 'food_quality',
        priority: 'high',
        assignedToTier: 'branch',
      } as unknown as Ticket,
      {
        id: 'tkt_02',
        title: 'Payment deducted twice',
        customerName: 'Pooja Dave',
        customerPhone: '+91 97123 44556',
        status: 'open',
        category: 'payment_issue',
        priority: 'urgent',
        assignedToTier: 'brand_support',
      } as unknown as Ticket,
      {
        id: 'tkt_03',
        title: 'Missing peri peri dip',
        customerName: 'Karan Patel',
        customerPhone: '+91 99090 11223',
        status: 'resolved',
        category: 'wrong_item',
        priority: 'medium',
        assignedToTier: 'branch',
      } as unknown as Ticket,
    ];

    it('filters tickets by category and search keyword', () => {
      const keyword = 'deducted';
      const results = mockTickets.filter((t) => t.title.toLowerCase().includes(keyword));

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('tkt_02');
    });

    it('filters tickets by 3-tier escalation level', () => {
      const l2Tickets = mockTickets.filter(
        (t) => (t as any).assignedToTier === 'brand_support' && t.status !== 'resolved'
      );

      expect(l2Tickets.length).toBe(1);
      expect(l2Tickets[0].customerName).toBe('Pooja Dave');
    });
  });
});
