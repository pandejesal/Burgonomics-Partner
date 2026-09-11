/**
 * Analytics shared types (Loop: the four chart/table components were dead —
 * zero references outside the barrel — so they were deleted and only the
 * test-consumed row types live on here).
 */
export interface BranchRoyaltyRow {
  branchId: string;
  branchName: string;
  city: string;
  grossSales: number;
  hqRoyalty5Percent: number;
  netBranchPayout95Percent: number;
  linkedAccountId?: string;
  transferStatus: 'settled' | 'pending' | 'processing';
}

export interface HourlyBucket {
  hour: string;
  orderCount: number;
  revenue: number;
  isPeak: boolean;
}

export interface SalesDataPoint {
  label: string;
  revenue: number;
  delivery: number;
  takeaway: number;
  dinein: number;
  orders: number;
}

export interface TopProductItem {
  id: string;
  name: string;
  category: string;
  unitsSold: number;
  revenue: number;
  velocityRank: number;
  marginPercent: number;
}
