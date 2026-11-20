import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Admin money actions must not be demo mutators (partner-ops, fix wave
 * 2026-11-20).
 *
 * `paymentsData.ts` is the console's demo ledger (no live source — the
 * reconciliation screen says so in its own subtitle). It still carried five
 * money mutators with NO caller: issueRefund, approveRefundRelease,
 * rejectRefundRelease, retryRefundRelease and retryVerification. Each one
 * "completed" a refund or "verified" a payment by writing local rows and
 * toasting success with a fabricated admin identity, IP and device.
 *
 * They were unreachable only by accident: a future button wired to
 * `paymentStorage.issueRefund(...)` would ship a refund that never touched
 * Razorpay. The real money paths already exist (`releaseRefundThroughApi`,
 * `adminRefundsService`, `adminPaymentsService`), so the demo mutators are
 * removed rather than left as a loaded gun.
 *
 * `resolveDuplicate` is NOT removed: it is still called by the reconciliation
 * screen, which visibly labels its duplicate list a local demo queue.
 */

const payments = readFileSync(
  resolve(__dirname, '../src/admin/pages/paymentsData.ts'),
  'utf8',
);

describe('demo money mutators are gone', () => {
  it('no longer defines a refund/verification/discrepancy mutator', () => {
    for (const name of [
      'issueRefund',
      'approveRefundRelease',
      'rejectRefundRelease',
      'retryRefundRelease',
      'retryVerification',
      'resolveDiscrepancy',
    ]) {
      expect(payments).not.toContain(`${name}(`);
    }
  });

  it('no longer claims a refund "completed successfully" or a manual signature verify', () => {
    // Target the CLAIM (toast/timeline), not seeded transaction history prose.
    expect(payments).not.toMatch(/toast\.success\(`Refund of/i);
    expect(payments).not.toMatch(/Signature Verified Manually/);
    expect(payments).not.toMatch(/re-queued in Razorpay payouts engine/i);
    expect(payments).not.toMatch(/Admi?n signature sync verification completed successfully/i);
  });

  it('keeps the duplicate-alert action the reconciliation screen actually calls', () => {
    expect(payments).toContain('resolveDuplicate(orderId: string');
  });

  it('leaves the real refund path named for callers looking for money', () => {
    // The authoritative release path lives in the service layer; a reader who
    // reaches the demo ledger must find the pointer, not a mutator.
    expect(payments).toMatch(/releaseRefundThroughApi/i);
  });
});
