import { describe, it, expect } from 'vitest';
import { validatePartialRefundAmount } from '../src/utils/refundValidation';

describe('Partial-refund amount validation (real guard used by TicketDetailPage)', () => {
  it('accepts sane whole-rupee amounts', () => {
    expect(validatePartialRefundAmount('99')).toBeNull();
    expect(validatePartialRefundAmount('1')).toBeNull();
    expect(validatePartialRefundAmount('100000')).toBeNull();
    expect(validatePartialRefundAmount('  250  ')).toBeNull();
  });

  it('rejects garbage that the old Number(input)||50 coerced into a fake ₹50 refund', () => {
    expect(validatePartialRefundAmount('')).not.toBeNull();
    expect(validatePartialRefundAmount('abc')).not.toBeNull();
    expect(validatePartialRefundAmount('9.5')).not.toBeNull();
    expect(validatePartialRefundAmount('-200')).not.toBeNull();
    expect(validatePartialRefundAmount('0')).not.toBeNull();
  });

  it('rejects amounts above the single-refund cap', () => {
    expect(validatePartialRefundAmount('100001')).toContain('1,00,000');
  });
});
