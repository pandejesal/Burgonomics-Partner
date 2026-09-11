/**
 * Partner Cloud Functions API Gateway
 * Authoritative HTTP client connecting Partner POS directly to Firebase Cloud Functions v2.
 */
import { auth } from '@/config/firebase';

const getFunctionsBaseUrl = (): string => {
  if (import.meta.env.VITE_FUNCTIONS_API_URL) {
    return import.meta.env.VITE_FUNCTIONS_API_URL.replace(/\/$/, '');
  }
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'burgonomics-7faa8';
  return `https://asia-south1-${projectId}.cloudfunctions.net/api`;
};

async function apiRequest<T>(endpoint: string, body: Record<string, any> = {}): Promise<T> {
  const baseUrl = getFunctionsBaseUrl();
  const targetUrl = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
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

  const res = await fetch(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
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

  return (await res.json()) as T;
}

export const partnerFunctionsApi = {
  /**
   * Pushes order KOT to Petpooja POS API
   */
  async pushOrderToPetpooja(orderId: string): Promise<{ success: boolean }> {
    return await apiRequest<{ success: boolean }>('/petpooja/pushOrder', { orderId });
  },

  /**
   * Dispatches Porter 3PL courier rider for an order
   */
  async bookPorterRider(
    orderId: string,
    staffName?: string
  ): Promise<{
    porterOrderId: string;
    riderName: string;
    riderPhone: string;
    riderVehicleNumber: string;
    trackingUrl: string;
    status: string;
  }> {
    return await apiRequest('/porter/book', { orderId, staffName });
  },

  /**
   * Re-books cancelled Porter rider
   */
  async rebookPorterRider(
    orderId: string,
    staffName?: string
  ): Promise<{
    porterOrderId: string;
    riderName: string;
    riderPhone: string;
    riderVehicleNumber: string;
    trackingUrl: string;
    status: string;
  }> {
    return await apiRequest('/porter/rebook', { orderId, staffName });
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
   * idempotent per order). Loop 5/120: the refunds page MUST use this — never
   * flip local state and claim money moved.
   */
  async releaseRefund(params: {
    orderId: string;
    razorpayPaymentId: string;
    amountRupees?: number;
    reason?: string;
  }): Promise<{ id?: string; status?: string; reused?: boolean }> {
    return await apiRequest('/payments/refund', params);
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
};
