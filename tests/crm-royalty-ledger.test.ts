import { describe, it, expect } from 'vitest';

export interface CustomerGrillCoinsProfile {
  customerId: string;
  totalOrders: number;
  totalSpendInr: number;
  currentGrillCoins: number;
  coinsEarnedLifetime: number;
  coinsRedeemedLifetime: number;
}

export function calculateGrillCoinsEarned(orderAmountInr: number, earnRatePercent = 5): number {
  if (orderAmountInr <= 0) return 0;
  // 5% cashback in Grill Coins (1 coin = ₹1)
  return Math.floor((orderAmountInr * earnRatePercent) / 100);
}

export function calculateMaxGrillCoinsRedemption(
  cartSubtotal: number,
  availableCoins: number,
  maxCartRedemptionPercent = 50
): { redeemableCoins: number; maxAllowedDiscount: number } {
  if (cartSubtotal <= 0 || availableCoins <= 0) {
    return { redeemableCoins: 0, maxAllowedDiscount: 0 };
  }

  const maxAllowedDiscount = Math.floor((cartSubtotal * maxCartRedemptionPercent) / 100);
  const redeemableCoins = Math.min(availableCoins, maxAllowedDiscount);

  return { redeemableCoins, maxAllowedDiscount };
}

export interface BranchDailySummary {
  branchId: string;
  date: string;
  grossSalesPaise: number;
  refundsPaise: number;
  netSalesPaise: number;
  brandRoyaltyPaise: number;
  branchNetPaise: number;
}

export function aggregateDailyRoyaltyLedger(
  branchId: string,
  date: string,
  orders: { totalPaise: number; isRefunded?: boolean }[],
  royaltyRatePercent = 5
): BranchDailySummary {
  let grossSalesPaise = 0;
  let refundsPaise = 0;

  for (const order of orders) {
    if (order.isRefunded) {
      refundsPaise += order.totalPaise;
    } else {
      grossSalesPaise += order.totalPaise;
    }
  }

  const netSalesPaise = Math.max(0, grossSalesPaise - refundsPaise);
  const brandRoyaltyPaise = Math.round((netSalesPaise * royaltyRatePercent) / 100);
  const branchNetPaise = netSalesPaise - brandRoyaltyPaise;

  return {
    branchId,
    date,
    grossSalesPaise,
    refundsPaise,
    netSalesPaise,
    brandRoyaltyPaise,
    branchNetPaise,
  };
}

describe('Partner POS & CRM — Loyalty Coins & Franchise Royalty Suite', () => {
  describe('Grill Coins Loyalty Engine', () => {
    it('awards 5% Grill Coins on eligible food orders', () => {
      expect(calculateGrillCoinsEarned(500)).toBe(25);
      expect(calculateGrillCoinsEarned(1250)).toBe(62);
      expect(calculateGrillCoinsEarned(0)).toBe(0);
    });

    it('caps coin redemption to 50% of the cart value', () => {
      // Cart ₹400, Customer has 300 coins -> can only redeem 200 coins (50% max)
      const res1 = calculateMaxGrillCoinsRedemption(400, 300, 50);
      expect(res1.redeemableCoins).toBe(200);
      expect(res1.maxAllowedDiscount).toBe(200);

      // Cart ₹800, Customer has 150 coins -> can redeem all 150 coins
      const res2 = calculateMaxGrillCoinsRedemption(800, 150, 50);
      expect(res2.redeemableCoins).toBe(150);
      expect(res2.maxAllowedDiscount).toBe(400);

      // Cart ₹0
      const res3 = calculateMaxGrillCoinsRedemption(0, 100, 50);
      expect(res3.redeemableCoins).toBe(0);
    });
  });

  describe('aggregateDailyRoyaltyLedger', () => {
    it('accurately calculates 95/5 HQ Brand Royalty split and branch net payout', () => {
      const orders = [
        { totalPaise: 50000 }, // ₹500
        { totalPaise: 75000 }, // ₹750
        { totalPaise: 125000 }, // ₹1250
        { totalPaise: 25000, isRefunded: true }, // ₹250 refund
      ];

      const ledger = aggregateDailyRoyaltyLedger('branch_ahmedabad_1', '2026-08-31', orders);

      expect(ledger.grossSalesPaise).toBe(250000); // ₹2,500
      expect(ledger.refundsPaise).toBe(25000); // ₹250
      expect(ledger.netSalesPaise).toBe(225000); // ₹2,250 net
      expect(ledger.brandRoyaltyPaise).toBe(11250); // 5% of ₹2,250 = ₹112.50 (11,250 paise)
      expect(ledger.branchNetPaise).toBe(213750); // 95% = ₹2,137.50 (213,750 paise)
      expect(ledger.brandRoyaltyPaise + ledger.branchNetPaise).toBe(ledger.netSalesPaise);
    });
  });
});
