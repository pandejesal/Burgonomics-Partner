/**
 * Owner decision 1 Nov 2026: the per-order 5% royalty is replaced by a fixed
 * ₹2,500 monthly branch fee, with Razorpay and cash kept separate and the
 * courier cost on cash shown as owed. Fee figures are server-written; a denied
 * ledger read must say so, never render a false 0.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  istMonthKey,
  istMonthLabel,
  previousIstMonthKey,
} from '../src/utils/analyticsMath';
import { MonthlyBranchStatement } from '@/components/analytics/MonthlyBranchStatement';
import type { MonthlyStatementMonth, MonthlyStatementRow } from '@/hooks/useAnalytics';

const row = (over: Partial<MonthlyStatementRow> = {}): MonthlyStatementRow => ({
  branchId: 'branch_surat_01',
  branchName: 'Surat Adajan',
  city: 'Surat',
  linkedAccountId: 'unlinked',
  linkedStatus: 'pending',
  razorpayEarnings: 4200,
  cashEarnings: 1800,
  courierOnCash: 135,
  fee: 2500,
  collected: 2500,
  due: 0,
  ...over,
});

const month = (over: Partial<MonthlyStatementMonth> = {}): MonthlyStatementMonth => ({
  monthKey: '2026-11',
  label: 'November 2026',
  rows: [row()],
  available: true,
  ...over,
});

describe('IST month keys', () => {
  it('flips exactly at 18:30Z on the last day', () => {
    expect(istMonthKey('2026-10-31T18:29:59Z')).toBe('2026-10');
    expect(istMonthKey('2026-10-31T18:30:00Z')).toBe('2026-11');
  });

  it('walks to the previous calendar month across a year boundary', () => {
    expect(previousIstMonthKey('2026-11')).toBe('2026-10');
    expect(previousIstMonthKey('2026-01')).toBe('2025-12');
    expect(istMonthLabel('2026-11')).toBe('November 2026');
  });
});

describe('MonthlyBranchStatement', () => {
  it('shows Razorpay, Cash & counter, Courier on cash, Fee, Collected and Due', () => {
    const html = renderToStaticMarkup(
      <MonthlyBranchStatement
        current={month()}
        previous={month({ monthKey: '2026-10', label: 'October 2026' })}
      />
    );

    expect(html).toContain('Monthly Branch Statement');
    expect(html).toContain('Razorpay Earnings');
    expect(html).toContain('Cash &amp; Counter');
    expect(html).toContain('Courier on Cash');
    expect(html).toContain('₹4,200');
    expect(html).toContain('₹1,800');
    expect(html).toContain('₹135');
    expect(html).toContain('₹2,500');
    expect(html).toContain('Unlinked — no Route split');
    // A branch with no ledger doc yet: Fee defaults to 2500, Collected 0.
    expect(html).not.toContain('KYC Verified');
    expect(html).not.toContain('Route Settled');
  });

  it('shows Due as Fee minus Collected (never negative)', () => {
    const html = renderToStaticMarkup(
      <MonthlyBranchStatement
        current={month({ rows: [row({ fee: 2500, collected: 2000, due: 500 })] })}
        previous={month()}
      />
    );
    expect(html).toContain('₹500');
  });

  it('a denied ledger read says "Not available for your role", never 0', () => {
    const html = renderToStaticMarkup(
      <MonthlyBranchStatement
        current={month({
          available: false,
          unavailableReason: 'not_available_for_role',
          rows: [row({ fee: null, collected: null, due: null })],
        })}
        previous={month()}
      />
    );
    expect(html).toContain('Not available for your role');
    expect(html).toContain('role="alert"');
  });
});
