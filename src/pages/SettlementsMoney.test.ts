import { describe, it, expect } from 'vitest';

/**
 * Cycle 11 settlement money rules (owner decisions 2026-11-20 and 2026-11-25):
 *
 *  - the fee is a flat ₹2,000 GST-inclusive, whatever a branch document says;
 *  - a part payment leaves the balance visible instead of reading "Paid";
 *  - the brand footer reports gross collections, refunds, what is payable and
 *    what branches owe as separate figures, never one netted number.
 */
import {
  settlementTotals,
  settlementPaidLabel,
  type SettlementStatement,
} from '@/features/settlements';

function statement(over: Partial<SettlementStatement> = {}): SettlementStatement {
  return {
    id: 'br_a_2026-11_v001',
    branchId: 'br_a',
    branchName: 'A',
    monthKey: '2026-11',
    version: 1,
    currency: 'INR',
    onlineCollectedPaise: 1300000,
    onlineRefundedPaise: 20000,
    onlineNetPaise: 1280000,
    onlineOrders: 40,
    cashCollectedPaise: 500000,
    cashOrders: 12,
    cashPendingOrders: 0,
    platformFeePaise: 200000,
    netPayablePaise: 1080000,
    outstandingPaise: 1080000,
    ledgerSchema: 1,
    complete: true,
    current: true,
    branchOwes: false,
    feeApplicable: true,
    paidStatus: 'unpaid',
    paidAtMs: null,
    paymentReference: null,
    payments: [],
    generatedAtMs: 0,
    ...over,
  };
}

describe('settlementTotals', () => {
  it('keeps gross, refunds, payable and collect-back as separate figures', () => {
    const totals = settlementTotals([
      statement(),
      statement({
        id: 'br_b_2026-11_v001',
        branchId: 'br_b',
        onlineCollectedPaise: 0,
        onlineRefundedPaise: 0,
        onlineNetPaise: 0,
        outstandingPaise: -600000,
        netPayablePaise: -600000,
      }),
    ]);
    expect(totals.onlineCollectedPaise).toBe(1300000);
    expect(totals.onlineRefundedPaise).toBe(20000);
    expect(totals.onlineNetPaise).toBe(1280000);
    expect(totals.payableToBranchesPaise).toBe(1080000);
    expect(totals.owesBrandPaise).toBe(600000);
    // The old netted footer is gone: payable minus collect-back is neither.
    expect(totals.netPayablePaise).toBe(480000);
  });

  it('counts a part-settled branch as unpaid', () => {
    const totals = settlementTotals([
      statement({
        paidStatus: 'unpaid',
        payments: [{ paidAtMs: 1, reference: 'UTR1', recordedBy: 'x', recordedByEmail: null, note: null, settledNetPaise: 400000 }],
        outstandingPaise: 680000,
      }),
    ]);
    expect(totals.unpaidCount).toBe(1);
    expect(totals.paidCount).toBe(0);
  });

  it('sums walk-in UPI apart from cash', () => {
    const totals = settlementTotals([statement({ branchUpiCollectedPaise: 350000 })]);
    expect(totals.branchUpiCollectedPaise).toBe(350000);
    expect(totals.cashCollectedPaise).toBe(500000);
  });
});

describe('settlementPaidLabel', () => {
  it('never calls a statement with money still owed "Paid"', () => {
    const label = settlementPaidLabel(
      statement({
        paidStatus: 'paid',
        payments: [{ paidAtMs: 1, reference: 'UTR-PART', recordedBy: 'x', recordedByEmail: null, note: null, settledNetPaise: 400000 }],
        outstandingPaise: -50000,
        paymentReference: 'UTR-PART',
      }),
    );
    expect(label).toContain('Part-settled');
    expect(label).toContain('₹500');
    expect(label).toContain('owed to brand');
    expect(label).not.toContain('Paid ·');
  });

  it('shows the reference only when nothing remains outstanding', () => {
    expect(
      settlementPaidLabel(statement({ paidStatus: 'paid', outstandingPaise: 0, paymentReference: 'UTR-1' })),
    ).toBe('Paid · UTR-1');
  });
});
