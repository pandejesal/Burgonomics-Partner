import { describe, expect, it } from 'vitest';
import { orderStatusWriteErrorMessage } from '../src/utils/orderErrors';

/**
 * Item 11: the server now refuses READY -> OUT_FOR_DELIVERY on a delivery order
 * with no rider, with 409 DISPATCH_RIDER_REQUIRED (backend 15e839c,
 * functions/src/modules/orders/orderStatus.ts assertRiderForOutForDelivery).
 *
 * The code reaches the page as `err.code` (ApiRequestError) or inside the
 * message (bumpRouteErrors echoes it). Either way the operator must be told
 * what is missing and where to fix it — never just "Server error 409".
 */
describe('order status write messages', () => {
  it('explains DISPATCH_RIDER_REQUIRED from the error code', () => {
    const err = Object.assign(new Error('Server error 409'), { code: 'DISPATCH_RIDER_REQUIRED' });
    const copy = orderStatusWriteErrorMessage(err);
    expect(copy).toMatch(/No rider is assigned/i);
    expect(copy).toContain('Delivery Queue');
    expect(copy).toMatch(/NOT marked dispatched/i);
  });

  it('explains it from the message when the code is not carried', () => {
    const copy = orderStatusWriteErrorMessage(
      new Error(
        'DISPATCH_RIDER_REQUIRED: No rider is assigned to this delivery yet — book a courier'
      )
    );
    expect(copy).toContain('Delivery Queue');
  });

  it('keeps the existing OTP refusal wording', () => {
    expect(orderStatusWriteErrorMessage(new Error('DELIVERY_OTP_REQUIRED'))).toMatch(
      /4-digit OTP/
    );
  });

  it('falls back to the server message', () => {
    expect(orderStatusWriteErrorMessage(new Error('ORDER_STATUS_STALE'))).toBe(
      'ORDER_STATUS_STALE'
    );
  });
});
