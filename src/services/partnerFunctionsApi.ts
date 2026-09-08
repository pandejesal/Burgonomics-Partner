/**
 * Partner Cloud Functions API Gateway
 * Authoritative HTTP client connecting Partner POS directly to Firebase Cloud Functions v2.
 */
import { auth } from '@/config/firebase';

export interface ApiRequestOptions {
  /** Timeout in ms (default 20 000 for general, 30 000 for porter book/rebook). */
  timeoutMs?: number;
  /** Max retries on transient failures (default 1 — total 2 attempts). */
  retries?: number;
  /** Stable idempotency key; auto-generated per call when omitted. */
  idempotencyKey?: string;
}

/** Options exposed to public callers (book/rebook). Timeout defaults to 30 000. */
export interface ApiOptions {
  timeoutMs?: number;
  idempotencyKey?: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const PORTER_TIMEOUT_MS = 30_000;
const RETRY_BACKOFF_MS = 500;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const getFunctionsBaseUrl = (): string => {
  if (import.meta.env.VITE_FUNCTIONS_API_URL) {
    return import.meta.env.VITE_FUNCTIONS_API_URL.replace(/\/$/, '');
  }
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'burgonomics-7faa8';
  return `https://asia-south1-${projectId}.cloudfunctions.net/api`;
};

async function apiRequest<T>(
  endpoint: string,
  body: Record<string, any> = {},
  options?: ApiRequestOptions,
): Promise<T> {
  const baseUrl = getFunctionsBaseUrl();
  const targetUrl = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  // ── offline gate ──────────────────────────────────────────────
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error("You're offline — request not sent. Reconnect and retry.");
  }

  // ── idempotency key (stable across retries) ──────────────────
  const idempotencyKey = options?.idempotencyKey ?? generateIdempotencyKey();
  // Default: one retry (total 2 attempts) on transient failures.
  const maxAttempts = (options?.retries ?? 1) + 1;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Idempotency-Key': idempotencyKey,
  };

  try {
    const { getAppCheckToken } = await import('@/config/firebase');
    const appCheckToken = await getAppCheckToken();
    if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;
  } catch {
    // Attestation unavailable — server runs monitor mode until enforced.
  }

  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (e) {
      console.warn('Failed to retrieve Firebase Auth ID token for API request:', e);
    }
  }

  // ── fetch with timeout + retry ────────────────────────────────
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        // ── non-retryable server error (4xx etc.) ──
        if (!RETRYABLE_STATUSES.has(res.status)) {
          let errorMsg = `Server error ${res.status}`;
          try {
            const errData = await res.json();
            errorMsg = errData.error || errData.message || errorMsg;
          } catch {
            const text = await res.text();
            if (text) errorMsg = text;
          }
          throw new Error(errorMsg);
        }
        // retryable status — fall through to retry loop
        lastError = new Error(`Server error ${res.status}`);
        continue;
      }

      return (await res.json()) as T;
    } catch (err: unknown) {
      lastError = err;

      // AbortController timeout — retryable, then surface the safe message.
      // DOMException is not an Error subclass in browsers, so match by name.
      const isAbort =
        (err instanceof Error && err.name === 'AbortError') ||
        (typeof DOMException !== 'undefined' &&
          err instanceof DOMException &&
          err.name === 'AbortError');
      if (isAbort) {
        if (attempt < maxAttempts - 1) continue;
        throw new Error(
          'Request timed out — no changes were confirmed. Retry safely; bookings carry idempotency keys.',
        );
      }

      // Network error (fetch TypeError) — retryable
      if (err instanceof TypeError) {
        if (attempt < maxAttempts - 1) continue;
        throw err;
      }

      // Non-retryable error — rethrow immediately
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // Exhausted retries (shouldn't normally reach here, but be safe)
  throw lastError ?? new Error('Request failed after retries');
}

export const partnerFunctionsApi = {
  /**
   * Pushes order KOT to Petpooja POS API
   */
  async pushOrderToPetpooja(orderId: string): Promise<{ success: boolean }> {
    return await apiRequest<{ success: boolean }>('/petpooja/pushOrder', { orderId });
  },

  /**
   * Dispatches Porter 3PL courier rider for an order.
   * Idempotency key is generated automatically per call; callers may
   * supply a stable key to guarantee retry safety.
   */
  async bookPorterRider(
    orderId: string,
    staffName?: string,
    options?: ApiOptions,
  ): Promise<{
    porterOrderId: string;
    riderName: string;
    riderPhone: string;
    riderVehicleNumber: string;
    trackingUrl: string;
    status: string;
  }> {
    return await apiRequest(
      '/porter/book',
      { orderId, staffName },
      { ...options, timeoutMs: options?.timeoutMs ?? PORTER_TIMEOUT_MS, retries: 1 },
    );
  },

  /**
   * Re-books cancelled Porter rider.
   * Same idempotency semantics as bookPorterRider.
   */
  async rebookPorterRider(
    orderId: string,
    staffName?: string,
    options?: ApiOptions,
  ): Promise<{
    porterOrderId: string;
    riderName: string;
    riderPhone: string;
    riderVehicleNumber: string;
    trackingUrl: string;
    status: string;
  }> {
    return await apiRequest(
      '/porter/rebook',
      { orderId, staffName },
      { ...options, timeoutMs: options?.timeoutMs ?? PORTER_TIMEOUT_MS, retries: 1 },
    );
  },

  /**
   * Verifies customer 4-digit handover OTP
   */
  async verifyDeliveryOtp(params: {
    orderId: string;
    otp: string;
    staffName?: string;
  }): Promise<{ success: boolean; orderId: string; deliveredAt: string }> {
    return await apiRequest('/orders/verifyDeliveryOtp', params);
  },

  /**
   * Fallback manual in-store rider dispatch
   */
  async manualBranchDispatch(params: {
    orderId: string;
    riderName: string;
    riderPhone: string;
    staffName?: string;
    notes?: string;
  }): Promise<{
    success: boolean;
    orderId: string;
    riderName: string;
    riderPhone: string;
  }> {
    return await apiRequest('/orders/manualDispatch', params);
  },

  /**
   * Syncs branch menu items from Petpooja POS
   */
  async syncPetpoojaMenu(branchId: string): Promise<{ itemCount: number; categoriesCount: number }> {
    return await apiRequest('/petpooja/syncMenu', { branchId });
  },

  /**
   * Pushes an 86-ing (stock toggle) to the Petpooja POS for one item.
   * Firestore is updated by the caller for instant UX; this propagates
   * the change to the physical POS. Best-effort — caller warns on failure.
   */
  async syncItemStock(branchId: string, itemId: string, inStock: boolean): Promise<{ success: boolean }> {
    return await apiRequest('/petpooja/pushStock', { branchId, itemId, inStock });
  },

  /**
   * Staff Grill-Coins compensation. Server-side only: writes the balance AND
   * a ledger row, branch-scoped. Never fake this client-side.
   */
  async adjustCustomerCoins(params: {
    customerId: string;
    delta: number;
    reason: string;
    notes?: string;
  }): Promise<{ success: boolean; customerId: string; applied: number; balanceAfter: number }> {
    return await apiRequest('/customers/adjustCoins', params);
  },

  /**
   * Subscribes this device token to FCM topics (e.g. branch_<id>_orders for
   * KOT alerts). Topics can only be subscribed server-side.
   */
  async subscribeToTopics(
    token: string,
    topics: string[]
  ): Promise<{ success: boolean; subscribed: string[] }> {
    return await apiRequest('/notifications/subscribe', { token, topics });
  },

  /**
   * Releases stale topics (old branches after a switch, sign-out).
   */
  async unsubscribeFromTopics(
    token: string,
    topics: string[]
  ): Promise<{ success: boolean; unsubscribed: string[] }> {
    return await apiRequest('/notifications/unsubscribe', { token, topics });
  },
};
