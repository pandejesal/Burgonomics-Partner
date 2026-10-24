/**
 * Partner Cloud Functions API Gateway
 * Authoritative HTTP client connecting Partner POS directly to Firebase Cloud Functions v2.
 */
import { auth } from '@/config/firebase';
import { validateRefundRequestId } from '@/utils/refundRequestIdentity';

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

// ── Multi-provider dispatch (delivery_routing.md DR1–DR11) ──────────────────

export type DispatchProviderId = 'borzo' | 'shadowfax' | 'porter';

/** Display label for a dispatch provider id (unknown ids read as "Courier"). */
export function dispatchProviderLabel(provider?: string | null): string {
  return provider === 'borzo'
    ? 'Borzo'
    : provider === 'shadowfax'
      ? 'Shadowfax'
      : provider === 'porter'
        ? 'Porter'
        : 'Courier';
}

/** One provider's quote verdict — never silently dropped (DR2/DR3). */
export interface DispatchProviderOutcome {
  provider: DispatchProviderId;
  outcome: 'ok' | 'not_serviced' | 'transient_failure';
  fare?: number;
  distanceKm?: number;
  pickupEtaMinutes?: number;
  quoteId?: string;
  source?: string;
  expiresAt?: number;
  error?: string;
}

/**
 * POST /dispatch/quote 200 body. When serviceable:false the address is out
 * of the 8km zone (winner/providers/estimatedFare are absent); when
 * serviceable:true the winner is the cheapest provider and the flattened
 * estimated* fields mirror the winner for back-compat with the old Porter
 * quote shape.
 */
export interface DispatchQuoteResult {
  serviceable: boolean;
  reason?: string;
  distanceKm?: number;
  servicedRadiusKm?: number;
  message?: string;
  winner?: DispatchProviderId;
  providers?: DispatchProviderOutcome[];
  estimatedFare?: number;
  estimatedDistanceKm?: number;
  estimatedPickupMinutes?: number;
  quoteId?: string;
  vehicleType?: string;
  source?: string;
  quotedAt?: number;
  expiresAt?: number;
  validForSeconds?: number;
}

/** DR7 fare-confirm gate returned with HTTP 200 from /dispatch/book. */
export interface DispatchFareConfirm {
  provider: DispatchProviderId;
  quotedFare: number;
  newFare: number;
  delta: number;
  threshold: number;
  message?: string;
}

/** DR8 manual lane returned with HTTP 200 from /dispatch/book. */
export interface DispatchManualLane {
  instructions: string;
  pasteEndpoint?: string;
}

/**
 * POST /dispatch/book|rebook body. Exactly one of: a booked result,
 * needsFareConfirm (200), manual_action_required (200), reused summary, or
 * a 202 in-progress body ({error, retryAfterMs} — returned as a resolved
 * value because 202 is an ok fetch status).
 */
export interface DispatchBookResult {
  provider?: DispatchProviderId;
  providerOrderId?: string;
  riderName?: string | null;
  riderPhone?: string | null;
  riderVehicleNumber?: string | null;
  trackingUrl?: string;
  status?: string;
  source?: string;
  reused?: boolean;
  orderId?: string;
  attempts?: Array<{
    provider: DispatchProviderId;
    outcome: string;
    error?: string;
    at: number;
  }>;
  failover?: {
    from: DispatchProviderId;
    to: DispatchProviderId;
    cheapestProvider: DispatchProviderId;
  };
  needsFareConfirm?: boolean;
  quotedFare?: number;
  newFare?: number;
  delta?: number;
  threshold?: number;
  confirmEndpoint?: string;
  manual_action_required?: boolean;
  instructions?: string;
  pasteEndpoint?: string;
  message?: string;
  /** 202 in-progress marker (ok-status body, not an exception). */
  error?: string;
  retryAfterMs?: number;
}

/** POST /dispatch/porter-manual 200 body. */
export interface DispatchManualBookingResult {
  success?: boolean;
  reused?: boolean;
  provider: DispatchProviderId;
  orderId: string;
  porterOrderId: string;
  trackingUrl?: string | null;
  status?: string;
  source?: string;
}

/** POST /dispatch/cancel 200 body. */
export interface DispatchCancelResult {
  success?: boolean;
  orderId?: string;
  provider?: DispatchProviderId | null;
  providerCancel?: string;
  message?: string;
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
        // retryable status — fall through to retry loop, but keep the
        // server's message so the FINAL throw explains the real verdict
        // (e.g. /dispatch/quote 503 NO_SERVICEABLE_PROVIDER).
        let msg = `Server error ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.error || errData.message) msg = errData.error || errData.message;
        } catch {
          // body not JSON — keep the status-only message
        }
        lastError = new Error(msg);
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
   * Relays one Petpooja onboarding test scenario through the test runner API
   * (POST /petpooja/testRunner). Returns the Petpooja-side order id that
   * support needs for reconciliation. Throws on relay failure — callers
   * surface it per-scenario, never as a silent skip.
   */
  async runPetpoojaTestScenario(params: {
    scenarioId: string;
    branchId?: string;
  }): Promise<{ success: boolean; scenarioId: string; petpoojaOrderId: string }> {
    return await apiRequest('/petpooja/testRunner', params);
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
   * Live Porter delivery quote (server-side quote-as-gate, D1–D4).
   * POST /porter/quote runs the branch-radius pre-check then the live
   * Porter quote as the authoritative fare + coverage verdict. A failure
   * NEVER falls back to a static rate card client-side — the caller must
   * surface not_serviced vs transient_failure distinctly.
   */
  async getPorterQuote(params: {
    pickupLat?: number;
    pickupLng?: number;
    dropLat?: number;
    dropLng?: number;
    customerName?: string;
    customerPhone?: string;
  }): Promise<{
    estimatedDistanceKm: number;
    estimatedFare: number;
    estimatedPickupMinutes: number;
    vehicleType: string;
    quoteId: string;
    source: string;
    isEstimate?: boolean;
    validForSeconds: number;
    expiresAt: number;
  }> {
    return await apiRequest('/porter/quote', params, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      retries: 1,
    });
  },

  /**
   * Multi-provider dispatch quote (delivery_routing.md DR1–DR5): radius gate
   * + parallel Borzo/Shadowfax/Porter fan-out; cheapest serviceable wins.
   * A 200 with serviceable:false means the address is out of zone; a 503
   * throws (no eligible provider) — never a static client-side fare.
   */
  async dispatchQuote(params: {
    pickupLat: number;
    pickupLng: number;
    dropLat: number;
    dropLng: number;
    customerName?: string;
    customerPhone?: string;
    orderId?: string;
  }): Promise<DispatchQuoteResult> {
    return await apiRequest('/dispatch/quote', params, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      retries: 1,
    });
  },

  /**
   * Books the cheapest serviceable provider (DR6 walk). Response can be a
   * booking, a needsFareConfirm gate (DR7), a manual_action_required Porter
   * lane (DR8), an idempotent reused summary, or a 202 in-progress body
   * ({error, retryAfterMs} — an ok-status JSON, not a throw).
   */
  async dispatchBook(
    params: {
      orderId: string;
      staffName?: string;
      quotedFare?: number;
      confirmFare?: boolean;
      preferredProvider?: DispatchProviderId;
    },
    options?: ApiOptions,
  ): Promise<DispatchBookResult> {
    return await apiRequest('/dispatch/book', params, {
      ...options,
      timeoutMs: options?.timeoutMs ?? PORTER_TIMEOUT_MS,
      retries: 1,
    });
  },

  /**
   * Re-enters the dispatch walk for a rebookable order (needsRebook /
   * rider_cancelled / dispatch_failed). 409 NOT_REBOOKABLE otherwise.
   */
  async dispatchRebook(
    params: {
      orderId: string;
      staffName?: string;
      quotedFare?: number;
      confirmFare?: boolean;
    },
    options?: ApiOptions,
  ): Promise<DispatchBookResult> {
    return await apiRequest('/dispatch/rebook', params, {
      ...options,
      timeoutMs: options?.timeoutMs ?? PORTER_TIMEOUT_MS,
      retries: 1,
    });
  },

  /**
   * Saves a Porter booking staff made in the Porter app (manual lane, DR8).
   * Idempotent on (orderId, porterOrderId); 400 validates the pasted id/URL.
   */
  async savePorterManualBooking(params: {
    orderId: string;
    porterOrderId: string;
    trackingUrl?: string;
    staffName?: string;
  }): Promise<DispatchManualBookingResult> {
    return await apiRequest('/dispatch/porter-manual', params, {
      timeoutMs: PORTER_TIMEOUT_MS,
      retries: 1,
    });
  },

  /**
   * Cancels the active dispatch for an order — Porter delegates to the
   * Porter cancel flow, Borzo/Shadowfax release locally (staff must also
   * cancel in the provider dashboard). 409 when nothing is active.
   */
  async dispatchCancel(params: {
    orderId: string;
    staffName?: string;
  }): Promise<DispatchCancelResult> {
    return await apiRequest('/dispatch/cancel', params, {
      timeoutMs: PORTER_TIMEOUT_MS,
      retries: 1,
    });
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
     * Cancels a booked Porter rider. Server POST /porter/cancel releases the
     * order locally (rider_cancelled + needsRebook) and requires staff to
     * confirm the cancellation in the Porter enterprise dashboard — no
     * provider cancel API is documented. Returns success boolean + message.
     */
    async cancelPorterRider(orderId: string): Promise<{ success: boolean; message?: string }> {
      return await apiRequest('/porter/cancel', { orderId }, {
        timeoutMs: PORTER_TIMEOUT_MS,
        retries: 1,
      });
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
   * KDS 1-tap 86 toggle contract (KDSQuick86Drawer). Same server route as
   * syncItemStock — object-form alias so the kitchen path can evolve its
   * own payload (e.g. operator id, reason) without touching POS sync callers.
   */
  async toggle86Item(params: {
    branchId: string;
    itemId: string;
    inStock: boolean;
  }): Promise<{ success: boolean }> {
    return await apiRequest('/petpooja/pushStock', params);
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
   * Registers this device token server-side (device_tokens is server-owned;
   * direct client writes are denied by firestore.rules).
   */
  async registerDeviceToken(
    token: string,
    platform?: string
  ): Promise<{ success: boolean }> {
    return await apiRequest('/notifications/registerToken', { token, platform });
  },

  /**
   * Detaches this device token on logout (Loop 46/120 — partner mirror of
   * the Loop 37 core fix). Must be called pre-signout while authed; never
   * blocks logout on failure.
   */
  async unregisterDeviceToken(
    token: string
  ): Promise<{ success: boolean; removedFromUsers?: number }> {
    return await apiRequest('/notifications/unregisterToken', { token });
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

  /**
   * Releases a Razorpay refund server-side (POST /payments/refund, staff-only,
   * idempotent per refundRequestId). Loop 5/120: the refunds page MUST use this — never
   * flip local state and claim money moved.
   */
  async releaseRefund(params: {
    refundRequestId: string;
    orderId: string;
    razorpayPaymentId: string;
    amountRupees?: number;
    reason?: string;
  }): Promise<{ id?: string; status?: string; reused?: boolean }> {
    validateRefundRequestId(params?.refundRequestId);
    if (typeof params?.razorpayPaymentId !== 'string' || !params.razorpayPaymentId.trim()) {
      throw new Error(
        'No gateway payment id recorded — refund not attempted. A brand admin must locate the capture in Payments.'
      );
    }
    return await apiRequest('/payments/refund', params, {
      idempotencyKey: params.refundRequestId,
    });
  },

  /**
   * Invites a staff member server-side (POST /staff/invite, brand-only).
   * The server mints or reuses the Auth account, applies role claims, and
   * writes the staff profile — the old direct users/ write was rules-denied
   * by design. No PIN is ever sent: staff set their own at first sign-in.
   */
  async inviteStaff(params: {
    name: string;
    email: string;
    phone?: string;
    role: string;
    branchIds?: string[];
    cityIds?: string[];
  }): Promise<{ uid: string; email: string; role: string; invited: boolean }> {
    return await apiRequest('/staff/invite', params);
  },

  /**
   * Revokes a staff member's RBAC claims server-side (POST /auth/revokeRole).
   * The server asserts brand-admin, clears role/branchIds/cityIds claims to
   * `customer`, and mirrors the role into users/{uid} — so the old direct
   * `deleteDoc(users/{uid})` (rules `allow delete: if false`) could never
   * succeed. The profile document is intentionally kept; access is what is
   * revoked.
   */
  async revokeUserRole(params: { targetUid: string }): Promise<{
    success: boolean;
    targetUid: string;
    role: string;
  }> {
    return await apiRequest('/auth/revokeRole', params);
  },

  /**
   * Sends a customer broadcast server-side (POST /notifications/broadcast,
   * brand-only). Returns MEASURED counts — targeted devices, delivered,
   * failed — recorded from the actual multicast, never estimates.
   */
  async sendBroadcast(params: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<{
    broadcastId: string;
    targeted: number;
    successCount: number;
    failureCount: number;
    prunedCount: number;
  }> {
    return await apiRequest('/notifications/broadcast', params);
  },

  /**
   * Records a refund-request rejection server-side (POST /refunds/dispose,
   * staff-only). Loop 7/120: closes the Loop 5 carryover — the reject dialog
   * MUST use this, never a local-only mutation.
   */
  async disposeRefund(params: {
    refundId: string;
    reason: string;
  }): Promise<{ id: string; status: string }> {
    return await apiRequest('/refunds/dispose', params);
  },

  /**
   * Records a discrepancy resolution server-side (POST
   * /discrepancies/resolve, staff-only). Loop 25/120: the reconciliation
   * page MUST use this — never clear rows locally and claim ops reviewed.
   */
  async resolveDiscrepancy(params: {
    discrepancyId: string;
    resolution: string;
    note?: string;
  }): Promise<{ id: string; status: string }> {
    return await apiRequest('/discrepancies/resolve', params);
  },

  /**
   * Liveness probe for the Cloud Functions API (Loop 24/120): the partner
   * health page MUST measure this instead of fabricating latency. Public
   * /health route — no auth needed, never reports healthy without it.
   */
  async checkApiHealth(): Promise<{ ok: boolean; latencyMs: number; service?: string }> {
    const baseUrl = getFunctionsBaseUrl();
    const started = Date.now();
    const res = await fetch(`${baseUrl}/health`, { method: 'GET' });
    if (!res.ok) throw new Error(`API health check failed with status ${res.status}`);
    const body = (await res.json()) as { status?: string; service?: string };
    return { ok: body.status === 'healthy', latencyMs: Date.now() - started, service: body.service };
  },

  /**
   * Resolves a support ticket server-side (refunds, loyalty credit, coupon
   * record). Money-affecting actions MUST go through this — never flip ticket
   * status with a direct Firestore write and claim money moved (Loop 3).
   */
  async resolveTicket(params: {
    ticketId: string;
    action: 'full_refund' | 'partial_refund' | 'discount_coupon' | 'loyalty_credit' | 'explanation';
    amount?: number;
    couponCode?: string;
    notes: string;
  }): Promise<{ success: boolean; ticketId: string; resolution?: Record<string, any> }> {
    return await apiRequest('/tickets/resolve', params);
  },

  /**
   * Escalates a ticket server-side (POST /tickets/escalate, staff-only,
   * branch-scoped, snapshot on dev-team escalation). Never a direct
   * Firestore tier flip.
   */
  async escalateTicket(params: {
    ticketId: string;
    targetTier: 'brand_support' | 'developer_team';
    reason: string;
  }): Promise<{ success: boolean; ticketId: string }> {
    return await apiRequest('/tickets/escalate', params);
  },

  /**
   * Records a non-money ticket resolution server-side
   * (POST /tickets/resolveNote). Money actions stay on resolveTicket.
   */
  async resolveTicketNote(params: {
    ticketId: string;
    resolution: string;
  }): Promise<{ success: boolean; ticketId: string }> {
    return await apiRequest('/tickets/resolveNote', params);
  },

  /**
   * Raises a support ticket server-side (POST /tickets/create). Runs spam
   * guards + branch assignment + customer binding server-side — never a
   * direct Firestore addDoc that skips all three.
   */
  async createTicket(params: {
    customerName: string;
    customerPhone?: string;
    orderId?: string;
    branchId: string;
    category: 'wrong_item' | 'late_delivery' | 'food_quality' | 'payment_issue' | 'app_bug' | 'general_inquiry';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    subject: string;
    description: string;
    attachments?: string[];
  }): Promise<{ id: string; ticketNumber: string; status: string }> {
    return await apiRequest('/tickets/create', params);
  },

  /**
   * Posts a ticket thread message server-side (POST /tickets/message).
   * Sender identity/role bind to the verified caller — never trust a
   * body-supplied role.
   */
  async sendTicketMessage(params: {
    ticketId: string;
    text: string;
    senderName?: string;
  }): Promise<{ success: boolean }> {
    return await apiRequest('/tickets/message', params);
  },

  /**
   * Staff broadcast fan-out to an FCM topic (e.g. upcoming_<branchId>).
   * Returns the server's honest delivery outcome — never claim sent
   * without it (Loop 5).
   */
  async broadcastToTopic(params: {
    topic: string;
    title: string;
    body: string;
  }): Promise<{ success: boolean }> {
    return await apiRequest('/notifications/dispatch', params);
  },

  /**
   * KDS order-status bump server-side (POST /orders/bumpStatus).
   * Branch-checked + Delivery-compatible object write — never a direct
   * Firestore flip that skips scope enforcement.
   *
   * `expectedStatus` is the status the operator's screen was showing when they
   * tapped — a lost-update precondition. The server route currently strips it
   * (orderBumpSchema is a non-strict z.object); the transaction-side
   * enforcement is owned by the backend lane. Sent now so the contract is in
   * place and no client change is needed when the server starts honouring it.
   */
  async bumpOrderStatus(params: {
    orderId: string;
    status: string;
    expectedStatus?: string;
    cancellationReason?: string;
    timelineEvent?: { title: string; actor?: string; description?: string };
  }): Promise<{ orderId: string; status: Record<string, any> }> {
    return await apiRequest('/orders/bumpStatus', params);
  },
};
