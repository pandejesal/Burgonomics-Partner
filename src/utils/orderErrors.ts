/**
 * Staff-facing text for a failed order-status write. Server verdicts arrive as
 * codes (e.g. DELIVERY_OTP_REQUIRED); a raw code cannot tell a cashier what to
 * do next, so the known ones are mapped to the action they must take.
 */
export function orderStatusWriteErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');

  if (/DELIVERY_OTP_REQUIRED/i.test(raw)) {
    return (
      "Delivery completion needs the customer's 4-digit OTP or the courier handover flow — " +
      'the order was NOT marked delivered. Use the delivery OTP / courier flow.'
    );
  }

  return raw || 'Status update failed — the order is unchanged.';
}
