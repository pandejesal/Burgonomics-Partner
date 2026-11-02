/**
 * Staff-facing text for a failed order-status write. Server verdicts arrive as
 * codes (e.g. DELIVERY_OTP_REQUIRED); a raw code cannot tell a cashier what to
 * do next, so the known ones are mapped to the action they must take.
 */
export function orderStatusWriteErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const code =
    typeof (error as { code?: unknown } | null)?.code === 'string'
      ? ((error as { code: string }).code as string)
      : '';
  const matches = (needle: string): boolean =>
    new RegExp(needle, 'i').test(raw) || code.toUpperCase() === needle.toUpperCase();

  if (matches('DELIVERY_OTP_REQUIRED')) {
    return (
      "Delivery completion needs the customer's 4-digit OTP or the courier handover flow — " +
      'the order was NOT marked delivered. Use the delivery OTP / courier flow.'
    );
  }

  // P1-G (item 11): bumpStatus refuses READY -> OUT_FOR_DELIVERY on a
  // delivery order with no rider (backend 15e839c). The typed code arrives as
  // err.code (ApiRequestError) — say what is missing and where to fix it.
  if (matches('DISPATCH_RIDER_REQUIRED')) {
    return (
      'No rider is assigned to this delivery yet, so the order was NOT marked ' +
      'dispatched — the customer would be told the food is on the way with nobody ' +
      'coming. Book a courier from the Delivery Queue, or assign an in-house rider, ' +
      'then advance it.'
    );
  }

  return raw || 'Status update failed — the order is unchanged.';
}
