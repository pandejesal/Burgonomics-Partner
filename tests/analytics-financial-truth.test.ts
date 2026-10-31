/**
 * PAR-01 — analytics financial truth.
 *
 * useAnalytics used to sum every fetched order into revenue/royalty (cancelled
 * and refunded orders included) and bucket days with toISOString (UTC), which
 * splits an IST day at 05:30. These assertions pin the money math and the IST
 * day boundary that the hook now delegates to src/utils/analyticsMath.ts.
 *
 * Orders are built through the REAL normalizeOrderDoc so the refund field
 * names under test are the ones the payments backend actually writes:
 * `refundStatus`, `refundAmount` (rupees) and `refundedTotalPaise`.
 */
import { describe, it, expect } from 'vitest';
import { normalizeOrderDoc } from '../src/utils/orderContract';
import {
  billableOrders,
  istDayKey,
  istDayRange,
  summarizeOrderRevenue,
} from '../src/utils/analyticsMath';

const completed = normalizeOrderDoc('ord_completed', {
  branchId: 'branch_surat_01',
  status: 'delivered',
  items: [{ name: 'Burger', quantity: 1, price: 500 }],
  total: 500,
  createdAt: '2026-10-30T10:00:00Z',
});

const cancelled = normalizeOrderDoc('ord_cancelled', {
  branchId: 'branch_surat_01',
  status: 'cancelled',
  items: [{ name: 'Burger', quantity: 1, price: 300 }],
  total: 300,
  createdAt: '2026-10-30T11:00:00Z',
});

const fullyRefunded = normalizeOrderDoc('ord_refunded', {
  branchId: 'branch_surat_01',
  status: 'delivered',
  items: [{ name: 'Burger', quantity: 1, price: 400 }],
  total: 400,
  refundStatus: 'refunded',
  refundAmount: 400,
  refundedTotalPaise: 40000,
  createdAt: '2026-10-30T12:00:00Z',
});

describe('PAR-01 — revenue and royalty exclude void orders', () => {
  it('a cancelled order adds 0 revenue and is not counted as a billable order', () => {
    const summary = summarizeOrderRevenue([completed, cancelled]);
    expect(summary.totalRevenue).toBe(500);
    expect(summary.totalOrders).toBe(1);
    expect(summary.brandRoyaltyEarned).toBe(25);
  });

  it('a fully refunded order adds 0 revenue', () => {
    const summary = summarizeOrderRevenue([completed, fullyRefunded]);
    expect(summary.totalRevenue).toBe(500);
    expect(summary.totalOrders).toBe(1);
    expect(summary.brandRoyaltyEarned).toBe(25);
  });

  it('net revenue, order count and royalty across a mixed period', () => {
    const summary = summarizeOrderRevenue([completed, cancelled, fullyRefunded]);
    expect(summary.totalRevenue).toBe(500);
    expect(summary.totalOrders).toBe(1);
    expect(summary.brandRoyaltyEarned).toBe(25);
    expect(summary.netBranchPayoutTotal).toBe(475);
    expect(billableOrders([completed, cancelled, fullyRefunded])).toHaveLength(1);
  });

  it('a partially refunded order counts net of the refunded paise', () => {
    const partiallyRefunded = normalizeOrderDoc('ord_partial', {
      branchId: 'branch_surat_01',
      status: 'delivered',
      items: [{ name: 'Burger', quantity: 1, price: 500 }],
      total: 500,
      refundStatus: 'partially_refunded',
      refundAmount: 200,
      refundedTotalPaise: 20000,
      createdAt: '2026-10-30T13:00:00Z',
    });
    expect(summarizeOrderRevenue([partiallyRefunded]).totalRevenue).toBe(300);
    // Amount-only fallback (no cumulative paise recorded).
    expect(
      summarizeOrderRevenue([
        { status: 'delivered', total: 500, refundStatus: 'partially_refunded', refundAmount: 125 },
      ]).totalRevenue
    ).toBe(375);
  });
});

describe('PAR-01 — daily buckets follow Asia/Kolkata, not the device timezone', () => {
  it('an order at 2026-10-30T19:00:00Z lands on 31 Oct IST', () => {
    const lateNight = normalizeOrderDoc('ord_late', {
      branchId: 'branch_surat_01',
      status: 'delivered',
      items: [],
      total: 250,
      createdAt: '2026-10-30T19:00:00Z',
    });
    expect(istDayKey(lateNight.createdAt)).toBe('2026-10-31');
  });

  it('a UTC-midnight order still lands on its IST calendar day', () => {
    expect(istDayKey('2026-10-30T00:00:00Z')).toBe('2026-10-30');
    expect(istDayKey('2026-10-30T18:29:59Z')).toBe('2026-10-30');
    expect(istDayKey('2026-10-30T18:30:00Z')).toBe('2026-10-31');
  });

  it('the rolling day range is built from the IST calendar day', () => {
    // 00:30 UTC on 1 Nov is already 06:00 IST on 1 Nov.
    expect(istDayRange(new Date('2026-11-01T00:30:00Z'), 2)).toEqual([
      '2026-10-31',
      '2026-11-01',
    ]);
  });
});
