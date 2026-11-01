import { describe, it, expect } from 'vitest';
import {
  isValidRefundRequestId,
  validateRefundRequestId,
  buildAdminRefundKey,
  buildCancelRefundKey,
  buildOpsRefundKey,
  buildCancelRefundRequest,
  buildOpsRefundRequest,
} from '../src/utils/refundRequestIdentity';
import { normalizeOrderDoc } from '../src/utils/orderContract';

describe('refundRequestIdentity', () => {
  describe('validateRefundRequestId & isValidRefundRequestId', () => {
    it('accepts safe valid identifiers within 8 to 128 characters', () => {
      const validKeys = [
        'refundreq_12345',
        'cancel_refund_BUR-8201',
        'ops_refund_BUR_9999',
        'a'.repeat(8),
        'A'.repeat(128),
        'valid-key_with_123',
      ];
      for (const key of validKeys) {
        expect(isValidRefundRequestId(key)).toBe(true);
        expect(validateRefundRequestId(key)).toBe(key);
      }
    });

    it('rejects keys shorter than 8 characters', () => {
      const shortKeys = ['', 'a', '1234567'];
      for (const key of shortKeys) {
        expect(isValidRefundRequestId(key)).toBe(false);
        expect(() => validateRefundRequestId(key)).toThrow(/refundRequestId/);
      }
    });

    it('rejects keys longer than 128 characters', () => {
      const longKey = 'a'.repeat(129);
      expect(isValidRefundRequestId(longKey)).toBe(false);
      expect(() => validateRefundRequestId(longKey)).toThrow(/refundRequestId/);
    });

    it('rejects keys with invalid characters outside [A-Za-z0-9_-]', () => {
      const invalidKeys = [
        'refundreq with spaces',
        'refundreq@domain',
        'refundreq.dotted',
        'refundreq#hash',
        'refundreq$money',
        'refundreq/path',
      ];
      for (const key of invalidKeys) {
        expect(isValidRefundRequestId(key)).toBe(false);
        expect(() => validateRefundRequestId(key)).toThrow(/refundRequestId/);
      }
    });

    it('rejects unpopulated undefined/null tokens', () => {
      const unpopulated = [
        'refundreq_undefined',
        'cancel_refund_undefined',
        'ops_refund_undefined',
        'refundreq_null',
      ];
      for (const key of unpopulated) {
        expect(isValidRefundRequestId(key)).toBe(false);
        expect(() => validateRefundRequestId(key)).toThrow(/refundRequestId/);
      }
    });

    it('rejects non-string values', () => {
      const nonStrings = [undefined, null, 12345678, {}, []];
      for (const val of nonStrings) {
        expect(isValidRefundRequestId(val)).toBe(false);
        expect(() => validateRefundRequestId(val)).toThrow(/refundRequestId/);
      }
    });
  });

  describe('buildAdminRefundKey', () => {
    it('constructs refundreq_<docId> from actual durable Firestore refund doc id', () => {
      const docId = 'rfnd_R1a89d0f1234';
      const key = buildAdminRefundKey(docId);
      expect(key).toBe(`refundreq_${docId}`);
      expect(isValidRefundRequestId(key)).toBe(true);
    });

    it('produces distinct keys for distinct doc IDs even if amounts or orders match', () => {
      const key1 = buildAdminRefundKey('doc_partial_1');
      const key2 = buildAdminRefundKey('doc_partial_2');
      expect(key1).not.toBe(key2);
      expect(key1).toBe('refundreq_doc_partial_1');
      expect(key2).toBe('refundreq_doc_partial_2');
    });

    it('fails locally on missing, empty, or unpopulated doc id without producing refundreq_undefined', () => {
      expect(() => buildAdminRefundKey('')).toThrow();
      expect(() => buildAdminRefundKey(undefined as any)).toThrow();
      expect(() => buildAdminRefundKey(null as any)).toThrow();
      expect(() => buildAdminRefundKey('undefined')).toThrow();
      expect(() => buildAdminRefundKey('null')).toThrow();
    });

    it('fails locally without truncation on overlong doc id', () => {
      const overlong = 'x'.repeat(125); // 10 prefix + 125 = 135 > 128
      expect(() => buildAdminRefundKey(overlong)).toThrow();
    });
  });

  describe('buildCancelRefundKey', () => {
    it('constructs stable cancel_refund_<orderId> for whole cancel-and-refund intent', () => {
      const orderId = 'BUR-8201';
      const key1 = buildCancelRefundKey(orderId);
      const key2 = buildCancelRefundKey(orderId);
      expect(key1).toBe('cancel_refund_BUR-8201');
      expect(key1).toBe(key2); // deterministic and stable across reloads
      expect(isValidRefundRequestId(key1)).toBe(true);
    });

    it('fails locally on missing or invalid order id', () => {
      expect(() => buildCancelRefundKey('')).toThrow();
      expect(() => buildCancelRefundKey(undefined as any)).toThrow();
      expect(() => buildCancelRefundKey('undefined')).toThrow();
      expect(() => buildCancelRefundKey('order with spaces')).toThrow();
    });
  });

  describe('buildOpsRefundKey', () => {
    it('constructs ops_refund_<orderId> for partner whole-order refund', () => {
      const orderId = 'BUR-8205';
      const key = buildOpsRefundKey(orderId);
      expect(key).toBe('ops_refund_BUR-8205');
      expect(isValidRefundRequestId(key)).toBe(true);
    });

    it('fails locally on missing or invalid order id', () => {
      expect(() => buildOpsRefundKey('')).toThrow();
      expect(() => buildOpsRefundKey(undefined as any)).toThrow();
      expect(() => buildOpsRefundKey('undefined')).toThrow();
    });
  });

  describe('refund request payloads from real order docs', () => {
    const paidDoc = {
      items: [{ itemId: 'itm_1', name: 'Hero Burger', quantity: 1, price: 250 }],
      status: 'pending',
      total: 250,
      paymentStatus: 'completed',
      payment: { method: 'razorpay', razorpayPaymentId: 'pay_ABC123' },
    };

    it('carries payment.razorpayPaymentId through normalization and releases with the cancel key', () => {
      const order = normalizeOrderDoc('ord_cancel_1', paidDoc);

      expect(order.razorpayPaymentId).toBe('pay_ABC123');

      expect(buildCancelRefundRequest(order, 'CUSTOMER_REQUEST')).toEqual({
        refundRequestId: 'cancel_refund_ord_cancel_1',
        orderId: 'ord_cancel_1',
        razorpayPaymentId: 'pay_ABC123',
        amountRupees: 250,
        reason: 'Cancelled (CUSTOMER_REQUEST)',
      });
    });

    it('refuses to build a cancel refund when the order has no gateway payment id', () => {
      const order = normalizeOrderDoc('ord_cancel_2', {
        ...paidDoc,
        payment: { method: 'cod' },
      });

      expect(order.razorpayPaymentId).toBeUndefined();
      expect(buildCancelRefundRequest(order, 'OUT_OF_STOCK')).toBeNull();
    });

    it('falls through an empty razorpayPaymentId to a valid, trimmed transactionId', () => {
      const order = normalizeOrderDoc('ord_cancel_3', {
        ...paidDoc,
        payment: {
          method: 'razorpay',
          razorpayPaymentId: '',
          transactionId: '  pay_TXN  ',
        },
      });

      expect(order.razorpayPaymentId).toBe('pay_TXN');
      expect(buildCancelRefundRequest(order, 'CUSTOMER_REQUEST')).toEqual({
        refundRequestId: 'cancel_refund_ord_cancel_3',
        orderId: 'ord_cancel_3',
        razorpayPaymentId: 'pay_TXN',
        amountRupees: 250,
        reason: 'Cancelled (CUSTOMER_REQUEST)',
      });
    });

    it('resolves transactionId ahead of paymentId so both screens send the same id', () => {
      const order = normalizeOrderDoc('ord_cancel_4', {
        ...paidDoc,
        payment: {
          method: 'razorpay',
          transactionId: 'pay_TXN',
          paymentId: 'pay_STALE',
        },
      });

      expect(order.razorpayPaymentId).toBe('pay_TXN');
    });

    it('builds the board ops refund from RichOrder payment.transactionId', () => {
      expect(
        buildOpsRefundRequest({
          id: 'ord_board_1',
          totals: { grandTotal: 480 },
          payment: { transactionId: 'pay_BOARD1' },
        }),
      ).toEqual({
        refundRequestId: 'ops_refund_ord_board_1',
        orderId: 'ord_board_1',
        razorpayPaymentId: 'pay_BOARD1',
        amountRupees: 480,
        reason: 'Partner ops refund from order board',
      });
    });

    it('refuses to build a board refund when the payment block has no gateway id', () => {
      expect(
        buildOpsRefundRequest({
          id: 'ord_board_2',
          totals: { grandTotal: 480 },
          payment: {},
        }),
      ).toBeNull();
    });
  });
});
