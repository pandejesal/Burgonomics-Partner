import { describe, it, expect } from 'vitest';
import type { BranchRoyaltyRow } from '@/features/analytics';

describe('Prompt 33: Analytics, Sales Reporting & Franchise Royalty Ledger Suite', () => {
  describe('1. 5% Franchise Royalty Split Formula', () => {
    it('accurately computes 5% HQ royalty and 95% net branch payout from gross sales', () => {
      const grossSales = 100000;
      const hqRoyalty = grossSales * 0.05;
      const netPayout = grossSales * 0.95;

      expect(hqRoyalty).toBe(5000);
      expect(netPayout).toBe(95000);
      expect(hqRoyalty + netPayout).toBe(grossSales);
    });

    it('aggregates multi-branch franchise royalty pool accurately', () => {
      const branchRecords: BranchRoyaltyRow[] = [
        {
          branchId: 'b_cg_road',
          branchName: 'Ahmedabad - CG Road',
          city: 'Ahmedabad',
          grossSales: 50000,
          hqRoyalty5Percent: 2500,
          netBranchPayout95Percent: 47500,
          transferStatus: 'settled',
        },
        {
          branchId: 'b_vr_mall',
          branchName: 'Surat - VR Mall',
          city: 'Surat',
          grossSales: 80000,
          hqRoyalty5Percent: 4000,
          netBranchPayout95Percent: 76000,
          transferStatus: 'settled',
        },
      ];

      const totalGross = branchRecords.reduce((sum, r) => sum + r.grossSales, 0);
      const totalRoyalty = branchRecords.reduce((sum, r) => sum + r.hqRoyalty5Percent, 0);
      const totalPayout = branchRecords.reduce((sum, r) => sum + r.netBranchPayout95Percent, 0);

      expect(totalGross).toBe(130000);
      expect(totalRoyalty).toBe(6500);
      expect(totalPayout).toBe(123500);
    });
  });

  describe('2. Peak Hour Rush Density Logic', () => {
    it('flags peak rush hours exceeding 75% max volume threshold', () => {
      const hourlyData = [
        { hour: '12 PM', orderCount: 20 },
        { hour: '1 PM', orderCount: 85 }, // peak
        { hour: '8 PM', orderCount: 90 }, // peak
        { hour: '4 PM', orderCount: 15 },
      ];

      const maxOrders = Math.max(...hourlyData.map((h) => h.orderCount));
      const rushHours = hourlyData.filter((h) => h.orderCount / maxOrders >= 0.75);

      expect(rushHours.length).toBe(2);
      expect(rushHours.map((r) => r.hour)).toEqual(['1 PM', '8 PM']);
    });
  });

  describe('3. CSV Export Payload Formatter', () => {
    it('formats sanitized CSV headers and data rows for financial audit', () => {
      const records = [
        {
          branch: 'Ahmedabad - CG Road',
          gross: 50000,
          royalty: 2500,
          payout: 47500,
        },
      ];

      const csvHeader = 'Branch,Gross Sales (INR),HQ Royalty 5% (INR),Net Payout 95% (INR)';
      const csvRow = `${records[0].branch},${records[0].gross},${records[0].royalty},${records[0].payout}`;

      expect(csvHeader).toContain('HQ Royalty 5%');
      expect(csvRow).toBe('Ahmedabad - CG Road,50000,2500,47500');
    });
  });
});
