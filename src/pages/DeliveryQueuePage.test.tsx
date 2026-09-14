import { describe, it, expect } from 'vitest';
import { getRiderStatusMeta } from '../features/delivery/components/PorterDispatchCard';
import type { Order } from '@/types';

describe('Prompt 25: Delivery Queue & Porter Courier Dispatch Suite', () => {
  describe('1. Rider Status Pill State Mapping', () => {
    it('maps packed ready orders awaiting courier to amber pulsing badge', () => {
      const mockOrder = {
        id: 'ord_1',
        status: 'ready',
        orderType: 'delivery',
      } as Order;

      const meta = getRiderStatusMeta(mockOrder);
      expect(meta.statusText).toBe('Packed — Awaiting Courier');
      expect(meta.className).toContain('animate-pulse');
      expect(meta.className).toContain('text-amber-400');
    });

    it('maps driver_allocated status to blue Porter rider pill', () => {
      const mockOrder = {
        id: 'ord_2',
        status: 'ready',
        orderType: 'delivery',
        deliveryStatus: 'driver_allocated',
        riderName: 'Vikram Rathore',
      } as any;

      const meta = getRiderStatusMeta(mockOrder);
      expect(meta.statusText).toBe('Porter Rider Allocated');
      expect(meta.isPorter).toBe(true);
      expect(meta.className).toContain('text-blue-300');
    });

    it('maps out_for_delivery status to cyan in-transit pill', () => {
      const mockOrder = {
        id: 'ord_3',
        status: 'out_for_delivery',
        orderType: 'delivery',
      } as Order;

      const meta = getRiderStatusMeta(mockOrder);
      expect(meta.statusText).toBe('Out for Delivery (In-Transit)');
      expect(meta.className).toContain('text-cyan-300');
    });

    it('maps in-house manual assignment to emerald self-delivery badge', () => {
      const mockOrder = {
        id: 'ord_4',
        status: 'out_for_delivery',
        orderType: 'delivery',
        deliveryStatus: 'manually_assigned',
        riderName: 'Ramesh Patel',
      } as any;

      const meta = getRiderStatusMeta(mockOrder);
      expect(meta.statusText).toBe('In-House Staff Assigned');
      expect(meta.isInHouse).toBe(true);
      expect(meta.className).toContain('text-emerald-300');
    });

    it('maps rider_cancelled status to rose rebook-needed pill (delivery_porter.md §4)', () => {
      const mockOrder = {
        id: 'ord_5',
        status: 'out_for_delivery',
        orderType: 'delivery',
        needsRebook: true,
        deliveryStatus: 'rider_cancelled',
        riderCancellationReason: 'Driver unassigned the trip',
      } as any;

      const meta = getRiderStatusMeta(mockOrder);
      expect(meta.statusText).toBe('Rider Cancelled — Rebook Needed');
      expect(meta.className).toContain('animate-pulse');
      expect(meta.className).toContain('text-rose-300');
      expect(meta.isPorter).toBe(false);
      expect(meta.isInHouse).toBe(false);
    });

    it('maps no_riders_available status to rose rebook-needed pill even without the flag', () => {
      const mockOrder = {
        id: 'ord_6',
        status: 'out_for_delivery',
        orderType: 'delivery',
        deliveryStatus: 'no_riders_available',
      } as any;

      const meta = getRiderStatusMeta(mockOrder);
      expect(meta.statusText).toBe('Rider Cancelled — Rebook Needed');
      expect(meta.className).toContain('text-rose-300');
    });
  });

  describe('2. Delivery Queue Unassigned vs In-Transit Filtering', () => {
    const ordersList: Order[] = [
      {
        id: 'ord_101',
        status: 'ready',
        orderType: 'delivery',
      } as Order,
      {
        id: 'ord_102',
        status: 'out_for_delivery',
        orderType: 'delivery',
        riderName: 'Vikram Rathore',
      } as Order,
      {
        id: 'ord_103',
        status: 'ready',
        orderType: 'delivery',
      } as Order,
    ];

    it('filters unassigned orders awaiting courier allocation', () => {
      const unassigned = ordersList.filter((o) => o.status === 'ready' && !o.riderName);
      expect(unassigned.length).toBe(2);
      expect(unassigned[0].id).toBe('ord_101');
      expect(unassigned[1].id).toBe('ord_103');
    });

    it('filters in-transit dispatched orders with assigned riders', () => {
      const inTransit = ordersList.filter((o) => o.status === 'out_for_delivery' || !!o.riderName);
      expect(inTransit.length).toBe(1);
      expect(inTransit[0].riderName).toBe('Vikram Rathore');
    });
  });
});
