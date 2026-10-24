import { describe, expect, it } from 'vitest';
import { canTransitionStatus, toPartnerStatus } from '../src/utils/orderContract';

/**
 * STRESS SWEEP 2026-10-24 (K) — order-status transition matrix contract.
 *
 * The matrix is EXPORTED as a pure helper (additive only): the live call
 * paths deliberately still allow operator recalls (backward moves), so the
 * pessimistic gate ships dormant pending a product decision. What this file
 * pins is the matrix's SHAPE: terminals are dead ends, the forward ladder
 * resolves, and legacy delivery vocabulary still normalizes to partner
 * statuses unchanged.
 */
describe('canTransitionStatus (additive transition matrix)', () => {
  it('rejects backwards or terminal transitions', () => {
    expect(canTransitionStatus('delivered', 'preparing')).toBe(false);
    expect(canTransitionStatus('cancelled', 'ready')).toBe(false);
    expect(canTransitionStatus('ready', 'pending')).toBe(false);
  });

  it('resolves the forward ladder in one hop each', () => {
    expect(canTransitionStatus('pending', 'accepted')).toBe(true);
    expect(canTransitionStatus('accepted', 'preparing')).toBe(true);
    expect(canTransitionStatus('preparing', 'ready')).toBe(true);
    expect(canTransitionStatus('ready', 'out_for_delivery')).toBe(true);
    expect(canTransitionStatus('out_for_delivery', 'delivered')).toBe(true);
  });

  it('keeps cancellation reachable from every active state, and quarantine only exits to cancel', () => {
    expect(canTransitionStatus('pending', 'cancelled')).toBe(true);
    expect(canTransitionStatus('preparing', 'cancelled')).toBe(true);
    expect(canTransitionStatus('out_for_delivery', 'cancelled')).toBe(true);
    expect(canTransitionStatus('quarantine', 'cancelled')).toBe(true);
    expect(canTransitionStatus('quarantine', 'preparing')).toBe(false);
  });

  it('legacy delivery vocabulary still normalizes exactly as before (mapping protected)', () => {
    expect(toPartnerStatus('PICKED_UP')).toBe('delivered');
    expect(toPartnerStatus('READY_TO_SERVE')).toBe('ready');
    expect(toPartnerStatus('RIDER_CANCELLED')).toBe('out_for_delivery');
    expect(toPartnerStatus('placed')).toBe('pending');
    expect(toPartnerStatus('ready_for_pickup')).toBe('ready');
  });
});
