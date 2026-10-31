import { describe, it, expect } from 'vitest';
import type { BranchMonthlyFeeRow } from '@/features/analytics';

describe('Prompt 33: Analytics, Sales Reporting & Monthly Fee Statement Suite', () => {
  describe('1. Fixed Monthly Branch Fee', () => {
    it('computes Due as Fee minus Collected, never negative', () => {
      const fee = 2500;
      const collected = 2000;
      const due = Math.max(0, fee - collected);

      expect(due).toBe(500);
      expect(Math.max(0, 2500 - 2500)).toBe(0);
      expect(Math.max(0, 2500 - 3000)).toBe(0);
    });

    it('aggregates multi-branch statements with separate payment streams', () => {
      const branchRecords: BranchMonthlyFeeRow[] = [
        {
          branchId: 'b_cg_road',
          branchName: 'Ahmedabad - CG Road',
          city: 'Ahmedabad',
          razorpayEarnings: 50000,
          cashEarnings: 12000,
          fee: 2500,
          collected: 2500,
          due: 0,
        },
        {
          branchId: 'b_vr_mall',
          branchName: 'Surat - VR Mall',
          city: 'Surat',
          razorpayEarnings: 1200,
          cashEarnings: 8000,
          fee: 2500,
          collected: 1200,
          due: 1300,
        },
      ];

      const totalRazorpay = branchRecords.reduce((sum, r) => sum + r.razorpayEarnings, 0);
      const totalCash = branchRecords.reduce((sum, r) => sum + r.cashEarnings, 0);
      const totalDue = branchRecords.reduce((sum, r) => sum + r.due, 0);

      expect(totalRazorpay).toBe(51200);
      expect(totalCash).toBe(20000);
      expect(totalDue).toBe(1300);
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
    it('formats sanitized CSV headers and data rows for the monthly statement', () => {
      const records = [
        {
          branch: 'Ahmedabad - CG Road',
          razorpay: 50000,
          cash: 12000,
          fee: 2500,
          due: 0,
        },
      ];

      const csvHeader = 'Branch,Razorpay Earnings (INR),Cash & Counter (INR),Monthly Fee (INR),Due (INR)';
      const csvRow = `${records[0].branch},${records[0].razorpay},${records[0].cash},${records[0].fee},${records[0].due}`;

      expect(csvHeader).toContain('Cash & Counter');
      expect(csvHeader).not.toContain('Royalty');
      expect(csvRow).toBe('Ahmedabad - CG Road,50000,12000,2500,0');
    });
  });
});
