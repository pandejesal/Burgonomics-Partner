/**
 * Porter 3PL Delivery Client Service
 * Calculates distance, estimates delivery fares, and triggers Porter API dispatch.
 */
import { partnerFunctionsApi } from './partnerFunctionsApi';

export interface PorterDeliveryQuote {
  estimatedDistanceKm: number;
  estimatedFare: number;
  estimatedPickupMinutes: number;
  vehicleType: string;
  quoteId: string;
  source: string;
  validForSeconds?: number;
  expiresAt?: number;
}

export interface PorterDispatchResult {
  porterOrderId: string;
  riderName: string;
  riderPhone: string;
  riderVehicleNumber: string;
  trackingUrl: string;
  estimatedDeliveryMinutes: number;
}

/**
 * Calculates delivery quote based on pickup (branch) and drop coordinates with 10-minute validity TTL.
 */
export async function getPorterDeliveryQuote(params: {
  pickupLat?: number;
  pickupLng?: number;
  dropLat?: number;
  dropLng?: number;
  customerName?: string;
  customerPhone?: string;
}): Promise<PorterDeliveryQuote> {
  const pickupLat = params.pickupLat || 23.0131;
  const pickupLng = params.pickupLng || 72.5085;
  const dropLat = params.dropLat || 23.0338;
  const dropLng = params.dropLng || 72.5262;

  // Calculate distance in km (Haversine formula)
  const R = 6371; // Earth radius in km
  const dLat = ((dropLat - pickupLat) * Math.PI) / 180;
  const dLon = ((dropLng - pickupLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((pickupLat * Math.PI) / 180) *
      Math.cos((dropLat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const estimatedDistanceKm = Math.max(1.0, Math.round(R * c * 10) / 10);

  // Standard 2-Wheeler Rate Card: ₹40 base for 2km + ₹10/km thereafter
  const estimatedFare = Math.round(
    estimatedDistanceKm <= 2 ? 40 : 40 + (estimatedDistanceKm - 2) * 10
  );

  const TTL_SECONDS = 600; // 10 minutes fee lock
  const expiresAt = Date.now() + TTL_SECONDS * 1000;

  return {
    estimatedDistanceKm,
    estimatedFare,
    estimatedPickupMinutes: 8,
    vehicleType: '2-Wheeler (Bike Express)',
    quoteId: `QTE-PRTR-${Math.floor(10000 + Math.random() * 90000)}`,
    source: 'porter_standard_rate_card',
    validForSeconds: TTL_SECONDS,
    expiresAt,
  };
}

/**
 * Verifies Customer 4-digit Delivery OTP on handover from the Partner POS.
 */
export async function verifyDeliveryOtp(params: {
  orderId: string;
  otp: string;
  staffName?: string;
}): Promise<{ success: boolean; orderId: string; deliveredAt: string }> {
  const { orderId, otp, staffName } = params;
  if (!orderId || !otp) {
    throw new Error("Order ID and 4-digit OTP are required");
  }

  return await partnerFunctionsApi.verifyDeliveryOtp({ orderId, otp, staffName });
}

/**
 * Fallback Manual Dispatch from Branch POS Terminal device when Porter riders are unavailable.
 */
export async function manualBranchDispatch(params: {
  orderId: string;
  riderName: string;
  riderPhone: string;
  staffName?: string;
  notes?: string;
}): Promise<{ success: boolean; orderId: string; riderName: string; riderPhone: string }> {
  const { orderId, riderName, riderPhone, staffName, notes } = params;
  if (!orderId || !riderName || !riderPhone) {
    throw new Error("Order ID, rider name, and rider phone are required for manual dispatch");
  }

  return await partnerFunctionsApi.manualBranchDispatch({
    orderId,
    riderName,
    riderPhone,
    staffName,
    notes,
  });
}
