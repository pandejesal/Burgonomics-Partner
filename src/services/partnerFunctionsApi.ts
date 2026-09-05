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
   * Subscribes this device token to FCM topics (e.g. branch_<id>_orders for
   * KOT alerts). Topics can only be subscribed server-side.
   */
  async subscribeToTopics(
    token: string,
    topics: string[]
  ): Promise<{ success: boolean; subscribed: string[] }> {
    return await apiRequest('/notifications/subscribe', { token, topics });
  },
};
