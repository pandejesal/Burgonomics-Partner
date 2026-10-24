/**
 * Refund Request Identity & Validation (F10 Partner Caller Propagation)
 * Ensures durable, deterministic request keys across client calls and retries.
 */

const REFUND_REQUEST_ID_REGEX = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Checks if a candidate refundRequestId conforms to the runtime safe contract:
 * - string of length 8 to 128 characters
 * - charset [A-Za-z0-9_-]
 * - no unpopulated undefined/null tokens (e.g. refundreq_undefined)
 */
export function isValidRefundRequestId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  if (!REFUND_REQUEST_ID_REGEX.test(id)) return false;
  if (
    id === 'refundreq_undefined' ||
    id === 'cancel_refund_undefined' ||
    id === 'ops_refund_undefined' ||
    id.endsWith('_undefined') ||
    id.endsWith('_null')
  ) {
    return false;
  }
  return true;
}

/**
 * Asserts that a refundRequestId is valid before network calls.
 * Throws locally with a clear diagnostic if invalid, missing, or overlong.
 */
export function validateRefundRequestId(id: unknown): string {
  if (!isValidRefundRequestId(id)) {
    const formatted =
      id === undefined
        ? 'undefined'
        : id === null
          ? 'null'
          : typeof id === 'string'
            ? `"${id}"`
            : typeof id;
    throw new Error(
      `Invalid refundRequestId ${formatted}: must be 8-128 characters matching [A-Za-z0-9_-] without unpopulated undefined/null tokens`,
    );
  }
  return id;
}

/**
 * Builds a deterministic refund request key from an actual durable Firestore refund doc id.
 * Format: refundreq_<id>
 * Fails locally if doc id is missing, invalid, or overlong without truncation collisions.
 */
export function buildAdminRefundKey(refundDocId: string): string {
  if (
    !refundDocId ||
    typeof refundDocId !== 'string' ||
    refundDocId.trim() === '' ||
    refundDocId === 'undefined' ||
    refundDocId === 'null'
  ) {
    throw new Error(
      `Invalid refund doc id "${refundDocId}": actual durable Firestore refund doc id is required to generate refund request key`,
    );
  }
  const key = `refundreq_${refundDocId}`;
  return validateRefundRequestId(key);
}

/**
 * Builds a deterministic cancel-and-refund request key for whole-order cancellation.
 * Format: cancel_refund_<orderId>
 * Stable across page reload for the same order.
 */
export function buildCancelRefundKey(orderId: string): string {
  if (
    !orderId ||
    typeof orderId !== 'string' ||
    orderId.trim() === '' ||
    orderId === 'undefined' ||
    orderId === 'null'
  ) {
    throw new Error(
      `Invalid order id "${orderId}": valid order id is required for cancel-and-refund request key`,
    );
  }
  const key = `cancel_refund_${orderId}`;
  return validateRefundRequestId(key);
}

/**
 * Builds a deterministic partner ops whole-order refund request key.
 * Format: ops_refund_<orderId>
 */
export function buildOpsRefundKey(orderId: string): string {
  if (
    !orderId ||
    typeof orderId !== 'string' ||
    orderId.trim() === '' ||
    orderId === 'undefined' ||
    orderId === 'null'
  ) {
    throw new Error(
      `Invalid order id "${orderId}": valid order id is required for ops refund request key`,
    );
  }
  const key = `ops_refund_${orderId}`;
  return validateRefundRequestId(key);
}
