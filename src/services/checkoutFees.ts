/**
 * Server-owned packaging for walk-in orders (owner decision 1 Nov 2026).
 *
 * `POST /checkout/fees` on the Cloud Functions base is the only source of the
 * packaging fee. It is order-level here: we send the branch and order type
 * only — no `items` field. Never hard-code 15, never fall back to a guessed
 * amount: a failure is an error with a Retry.
 *
 * The base comes from `partnerFunctionsApi.getFunctionsBaseUrl()` (the same
 * route every other partner server call uses). A placeholder host such as
 * `api.dev.burgonomics.example` was CUS-13 on the customer app.
 *
 * Auth mirrors the customer app: Firebase ID token as a single
 * `Authorization: Bearer …` header plus `X-Firebase-AppCheck`.
 */
import { auth, getAppCheckToken } from '@/config/firebase';
import { getFunctionsBaseUrl } from '@/services/partnerFunctionsApi';

export const CHECKOUT_FEES_PATH = '/checkout/fees';

export type CheckoutFeesOrderType = 'delivery' | 'takeaway' | 'dinein';

export interface CheckoutFeesRequest {
  branchId?: string;
  storeId?: string;
  orderType: CheckoutFeesOrderType;
}

export interface CheckoutFeesResult {
  packagingFee: number;
  deliveryFee: number;
}

/**
 * Packaging is order-level, so a walk-in delivery has no courier quote: ask
 * for the takeaway packaging value instead (no courier fee on a walk-in).
 */
export function packagingQuoteOrderType(
  orderType: CheckoutFeesOrderType
): CheckoutFeesOrderType {
  return orderType === 'delivery' ? 'takeaway' : orderType;
}

/** Absolute Functions URL for the fee quote. */
export function checkoutFeesUrl(): string {
  return `${getFunctionsBaseUrl()}${CHECKOUT_FEES_PATH}`;
}

/**
 * Exactly one authorization header. `authorization` is lowercase on purpose,
 * matching the customer app's transport, so no duplicate capital-A header can
 * be joined into "Bearer T1, Bearer T2".
 */
export async function buildCheckoutFeesHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const idToken = (await auth.currentUser?.getIdToken()) ?? null;
    if (idToken) headers.authorization = `Bearer ${idToken}`;
  } catch {
    // Auth unavailable — the server answers 401. Never invent a token.
  }
  try {
    const appCheckToken = await getAppCheckToken();
    if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;
  } catch {
    // Attestation unavailable — server runs monitor mode until enforced.
  }
  return headers;
}

function finiteFee(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function serverErrorMessage(status: number, code: string): string {
  if (code === 'STORE_NOT_LINKED') {
    return "This outlet isn't taking online orders yet — the packaging fee could not be loaded.";
  }
  if (code === 'ITEMS_REQUIRED') {
    return 'The server needs item-level packaging details for this outlet. Retry, or contact support.';
  }
  return `Could not load the packaging fee (server ${status}). Retry — no fee has been assumed.`;
}

/**
 * Loads the server packaging fee for a branch/order type. Rejects on any
 * transport failure or an invalid body so the caller shows an error, never 0.
 */
export async function fetchCheckoutFees(
  request: CheckoutFeesRequest
): Promise<CheckoutFeesResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('You are offline — the packaging fee could not be loaded. Reconnect and retry.');
  }

  const res = await fetch(checkoutFeesUrl(), {
    method: 'POST',
    headers: await buildCheckoutFeesHeaders(),
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    let code = '';
    try {
      const body = (await res.json()) as Record<string, unknown>;
      code = String(body.error ?? body.code ?? '');
    } catch {
      // non-JSON error body
    }
    throw new Error(serverErrorMessage(res.status, code));
  }

  const body = (await res.json()) as Record<string, unknown>;
  const packagingFee = finiteFee(body.packagingFee);
  if (packagingFee === null) {
    throw new Error('The server did not return a packaging fee. Retry — no fee has been assumed.');
  }
  const deliveryFee = finiteFee(body.deliveryFee) ?? 0;
  return { packagingFee, deliveryFee };
}
