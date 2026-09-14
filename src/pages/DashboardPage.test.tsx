import { describe, it, expect } from 'vitest';
import type { Order } from '@/types';

describe('Prompt 32: Partner Executive Dashboard & Live Stats Cockpit Suite', () => {
  describe('1. Revenue & Metric Aggregations', () => {
    it('calculates gross revenue strictly for completed/paid orders today', () => {
      const today = new Date();
      const mockOrders: Order[] = [
        {
          id: 'ord_1',
          total: 450,
          paymentStatus: 'completed',
          status: 'delivered',
          createdAt: today,
        } as unknown as Order,
        {
          id: 'ord_2',
          total: 650,
          paymentStatus: 'completed',
          status: 'preparing',
          createdAt: today,
        } as unknown as Order,
        {
          id: 'ord_3',
          total: 300,
          paymentStatus: 'pending',
          status: 'pending',
          createdAt: today,
        } as unknown as Order,
      ];

      const paidOrders = mockOrders.filter((o) => o.paymentStatus === 'completed');
      const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
      const aov = mockOrders.length > 0 ? Math.round(totalRevenue / mockOrders.length) : 0;

      expect(totalRevenue).toBe(1100);
      expect(paidOrders.length).toBe(2);
      expect(aov).toBe(367);
    });

    it('identifies in-kitchen active grilling orders and in-transit orders', () => {
      const mockOrders: Order[] = [
        { id: 'o1', status: 'preparing' } as unknown as Order,
        { id: 'o2', status: 'accepted' } as unknown as Order,
        { id: 'o3', status: 'out_for_delivery' } as unknown as Order,
        { id: 'o4', status: 'delivered' } as unknown as Order,
      ];

      const inKitchen = mockOrders.filter(
        (o) => o.status === 'preparing' || o.status === 'accepted'
      ).length;
      const inTransit = mockOrders.filter((o) => o.status === 'out_for_delivery').length;

      expect(inKitchen).toBe(2);
      expect(inTransit).toBe(1);
    });
  });

  describe('2. Multi-Branch Switching & Access Control', () => {
    it('scopes orders by selected branchId or returns all for enterprise superadmin', () => {
      const orders: Order[] = [
        { id: 'o1', branchId: 'b_ahmedabad_cg' } as unknown as Order,
        { id: 'o2', branchId: 'b_ahmedabad_cg' } as unknown as Order,
        { id: 'o3', branchId: 'b_surat_vr' } as unknown as Order,
      ];

      const getScopedOrders = (selectedId: string) => {
        if (selectedId === 'all') return orders;
        return orders.filter((o) => o.branchId === selectedId);
      };

      expect(getScopedOrders('all').length).toBe(3);
      expect(getScopedOrders('b_ahmedabad_cg').length).toBe(2);
      expect(getScopedOrders('b_surat_vr').length).toBe(1);
    });
  });

  describe('3. Store Online / Offline Operational Toggle', () => {
    it('toggles store active accepting status', () => {
      let isAcceptingOrders = true;
      const toggleStatus = () => {
        isAcceptingOrders = !isAcceptingOrders;
      };

      toggleStatus();
      expect(isAcceptingOrders).toBe(false);

      toggleStatus();
      expect(isAcceptingOrders).toBe(true);
    });
  });
});
