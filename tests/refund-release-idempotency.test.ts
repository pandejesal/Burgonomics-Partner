/**
 * Release idempotency at the single release path.
 *
 * The server dedupes POST /payments/refund by `refundRequestId`. That key is
 * derived from the VERBATIM refund document id, so releasing the same row
 * twice — a double press, a retry after a network timeout, or a re-read of the
 * same document — must produce the identical key. A drifting key would move
 * money twice.
 */
import { describe, expect, it, vi } from 'vitest';
import { releaseRefundThroughApi } from '../src/admin/services/refundRelease';
import { normalizeRefundDoc } from '../src/admin/services/adminRefundContract';
import { buildAdminRefundKey, isValidRefundRequestId } from '../src/utils/refundRequestIdentity';

const RAW = {
  orderId: 'BUR-IDEM-1',
  razorpayPaymentId: 'pay_idem_1',
  amountPaise: 42000,
  reason: 'POS_CANCELLED',
  status: 'PENDING',
};

const row = (id = 'rfnd_idem_1', overrides: Record<string, unknown> = {}) =>
  normalizeRefundDoc(id, { ...RAW, ...overrides } as any);

describe('releasing the same refund row twice reuses one request key', () => {
  it('sends the identical idempotency key and payload on the second release', async () => {
    const api = {
      releaseRefund: vi
        .fn()
        .mockResolvedValueOnce({ id: 'rfnd_idem_1', reused: false })
        .mockResolvedValueOnce({ id: 'rfnd_idem_1', reused: true }),
    };
    const refund = row();

    const first = await releaseRefundThroughApi(refund, api);
    const second = await releaseRefundThroughApi(refund, api);

    expect(api.releaseRefund).toHaveBeenCalledTimes(2);
    const [firstPayload, secondPayload] = api.releaseRefund.mock.calls.map((call) => call[0]);
    expect(firstPayload.refundRequestId).toBe('refundreq_rfnd_idem_1');
    expect(secondPayload.refundRequestId).toBe(firstPayload.refundRequestId);
    expect(secondPayload).toEqual(firstPayload);
    expect(isValidRefundRequestId(firstPayload.refundRequestId)).toBe(true);
    expect(firstPayload.refundRequestId).toBe(buildAdminRefundKey(refund.id));

    expect(first).toMatchObject({ ok: true, reused: false });
    expect(second).toMatchObject({ ok: true, reused: true });
  });

  it('keeps the key stable across a re-read of the same document', async () => {
    const api = { releaseRefund: vi.fn().mockResolvedValue({ id: 'rfnd_idem_1' }) };
    const beforeRefresh = row();
    const afterRefresh = row(); // same doc id, independently normalized

    await releaseRefundThroughApi(beforeRefresh, api);
    await releaseRefundThroughApi(afterRefresh, api);

    const [a, b] = api.releaseRefund.mock.calls.map((call) => call[0]);
    expect(a.refundRequestId).toBe(b.refundRequestId);
    expect(a.refundRequestId).toBe('refundreq_rfnd_idem_1');
  });

  it('keeps concurrent double-press releases on one key', async () => {
    const api = { releaseRefund: vi.fn().mockResolvedValue({ id: 'rfnd_idem_1', reused: true }) };
    const refund = row();

    await Promise.all([
      releaseRefundThroughApi(refund, api),
      releaseRefundThroughApi(refund, api),
    ]);

    expect(api.releaseRefund).toHaveBeenCalledTimes(2);
    const keys = new Set(api.releaseRefund.mock.calls.map((call) => call[0].refundRequestId));
    expect(keys).toEqual(new Set(['refundreq_rfnd_idem_1']));
  });

  it('does not reuse one key for two different refund documents on the same order/payment', async () => {
    const api = { releaseRefund: vi.fn().mockResolvedValue({ id: 'x' }) };

    await releaseRefundThroughApi(row('rfnd_partial_a'), api);
    await releaseRefundThroughApi(row('rfnd_partial_b'), api);

    const [a, b] = api.releaseRefund.mock.calls.map((call) => call[0]);
    expect(a.refundRequestId).toBe('refundreq_rfnd_partial_a');
    expect(b.refundRequestId).toBe('refundreq_rfnd_partial_b');
    expect(a.refundRequestId).not.toBe(b.refundRequestId);
  });
});
