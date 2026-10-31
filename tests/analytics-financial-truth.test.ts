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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeOrderDoc } from '../src/utils/orderContract';
import {
  billableOrders,
  istDayKey,
  istDayRange,
  orderNetRevenue,
  startOfIstDay,
  startOfIstMonth,
  startOfIstWeek,
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

/**
 * PAR-01b — the FETCH WINDOW must be anchored to IST too. startOfWeek /
 * startOfMonth use the device timezone, so on a non-IST device the window edge
 * (and the `createdAt >= startTimestamp` query) disagreed with the IST buckets.
 */
describe('PAR-01b — query window anchored to Asia/Kolkata', () => {
  it('starts the month on the IST first, not the device first', () => {
    // 2026-10-31T19:00Z is 2026-11-01 00:30 IST → November start = 18:30Z.
    expect(startOfIstMonth(new Date('2026-10-31T19:00:00Z')).toISOString()).toBe(
      '2026-10-31T18:30:00.000Z'
    );
    // One second earlier it is still 23:59:59 IST on 31 Oct → October start.
    expect(startOfIstMonth(new Date('2026-10-31T18:29:59Z')).toISOString()).toBe(
      '2026-09-30T18:30:00.000Z'
    );
  });

  it('starts the week on Monday 00:00 IST across the boundary', () => {
    // 2026-11-01T20:00Z is Mon 2026-11-02 01:30 IST → Monday 2 Nov 00:00 IST.
    expect(startOfIstWeek(new Date('2026-11-01T20:00:00Z')).toISOString()).toBe(
      '2026-11-01T18:30:00.000Z'
    );
    // One second earlier it is Sun 1 Nov 23:59:59 IST → Monday 26 Oct IST.
    expect(startOfIstWeek(new Date('2026-11-01T18:29:59Z')).toISOString()).toBe(
      '2026-10-25T18:30:00.000Z'
    );
  });

  it('flips the IST day exactly at 18:30Z', () => {
    expect(startOfIstDay(new Date('2026-10-30T18:29:59Z')).toISOString()).toBe(
      '2026-10-29T18:30:00.000Z'
    );
    expect(startOfIstDay(new Date('2026-10-30T18:30:00Z')).toISOString()).toBe(
      '2026-10-30T18:30:00.000Z'
    );
  });

  it('useAnalytics uses the IST anchors for its fetch window', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/hooks/useAnalytics.ts', import.meta.url)),
      'utf8'
    );
    expect(source).toContain('startOfIstWeek(now)');
    expect(source).toContain('startOfIstMonth(now)');
    // The device-timezone anchors are gone from the window calculation.
    expect(source).not.toContain('startOfWeek(now');
    expect(source).not.toContain('startOfMonth(now');
  });

  it('net revenue helper still nets a partial refund', () => {
    expect(orderNetRevenue({ status: 'delivered', total: 500, refundedTotalPaise: 12500 })).toBe(
      375
    );
  });
});
