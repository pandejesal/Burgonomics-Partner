import { describe, it, expect } from 'vitest';
import { getPorterDeliveryQuote } from '../src/services/porterDelivery';

describe('Partner 3PL Porter Logistics & Fare Calculation Suite', () => {
  it('calculates Haversine distance and applies standard rate card correctly for short distance (<= 2km)', async () => {
    // Exact short distance coordinates (~1.5km apart in Surat)
    const quote = await getPorterDeliveryQuote({
      pickupLat: 21.1702,
      pickupLng: 72.8311,
      dropLat: 21.1800,
      dropLng: 72.8350,
      customerName: 'Aarav Patel',
      customerPhone: '+919876543210',
    });

    expect(quote.estimatedDistanceKm).toBeLessThanOrEqual(2.0);
    // Base fare of ₹40 applies for <= 2km
    expect(quote.estimatedFare).toBe(40);
    expect(quote.vehicleType).toContain('2-Wheeler');
    // Implementation mints QTE-PRTR- + first 12 hex chars of a UUIDv4,
    // uppercased (porterDelivery.ts). No consumer parses the old 5-digit
    // sequence, so this pins the real, collision-resistant format.
    expect(quote.quoteId).toMatch(/^QTE-PRTR-[0-9A-F]{12}$/);
    expect(quote.validForSeconds).toBe(600);
    expect(quote.expiresAt).toBeGreaterThan(Date.now());
  });

  it('correctly calculates tiered pricing for long distance delivery (> 2km)', async () => {
    // Coordinates ~6.5km apart
    const quote = await getPorterDeliveryQuote({
      pickupLat: 21.1702,
      pickupLng: 72.8311,
      dropLat: 21.2200,
      dropLng: 72.8700,
    });

    expect(quote.estimatedDistanceKm).toBeGreaterThan(2.0);
    // Fare = 40 + (distance - 2) * 10 rounded
    const expectedFare = Math.round(40 + (quote.estimatedDistanceKm - 2) * 10);
    expect(quote.estimatedFare).toBe(expectedFare);
  });

  it('enforces a minimum distance floor of 1.0 km for co-located or micro distances', async () => {
    // Identical pickup and drop coordinates
    const quote = await getPorterDeliveryQuote({
      pickupLat: 21.1702,
      pickupLng: 72.8311,
      dropLat: 21.1702,
      dropLng: 72.8311,
    });

    expect(quote.estimatedDistanceKm).toBe(1.0);
    expect(quote.estimatedFare).toBe(40);
  });

  it('guarantees quote TTL validity lock of 10 minutes (600s)', async () => {
    const beforeTime = Date.now();
    // Real pickup + drop coordinates are required (fail-closed GPS guard).
    const quote = await getPorterDeliveryQuote({
      pickupLat: 21.1702,
      pickupLng: 72.8311,
      dropLat: 21.1800,
      dropLng: 72.8350,
    });
    const afterTime = Date.now();

    expect(quote.validForSeconds).toBe(600);
    expect(quote.expiresAt).toBeGreaterThanOrEqual(beforeTime + 599 * 1000);
    expect(quote.expiresAt).toBeLessThanOrEqual(afterTime + 601 * 1000);
  });

  it('refuses to quote without complete real coordinates (fail-closed, no default estimate)', async () => {
    await expect(getPorterDeliveryQuote({})).rejects.toThrow(
      /refusing to estimate from defaults/
    );
    // Partial coordinates fail just as loudly — no half-quoted estimate.
    await expect(
      getPorterDeliveryQuote({ pickupLat: 21.1702, pickupLng: 72.8311 })
    ).rejects.toThrow(/refusing to estimate from defaults/);
    // Non-numeric / non-finite values are not silently coerced either.
    await expect(
      getPorterDeliveryQuote({
        pickupLat: Number.NaN,
        pickupLng: 72.8311,
        dropLat: 21.18,
        dropLng: 72.835,
      })
    ).rejects.toThrow(/refusing to estimate from defaults/);
  });
});
