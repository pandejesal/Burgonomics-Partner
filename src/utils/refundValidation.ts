/** Single-refund cap (INR): larger reversals split or escalate, never fat-finger. */
export const MAX_SINGLE_REFUND_RUPEES = 100000;

/**
 * Validates a partial-refund amount string. Returns an inline error message
 * or null when valid. Whole rupees only — decimals, signs, and garbage must
 * never reach Razorpay (the old `Number(input) || 50` coerced all of them
 * into a "successful" ₹50 refund and resolved the ticket).
 */
export function validatePartialRefundAmount(raw: string): string | null {
  const input = raw.trim();
  if (!/^\d+$/.test(input)) {
    return 'Enter a whole-rupee amount (digits only).';
  }
  const amount = Number(input);
  if (amount < 1) {
    return 'Refund amount must be at least ₹1.';
  }
  if (amount > MAX_SINGLE_REFUND_RUPEES) {
    return 'Amount exceeds the ₹1,00,000 single-refund cap — split it or escalate.';
  }
  return null;
}
