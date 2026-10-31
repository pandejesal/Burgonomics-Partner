/**
 * Wave-2 partner analytics honesty fixes (coder lane, partner app).
 *
 * One focused test per finding from
 * audit-results/polish-2026-10-14/sprint-2026-10-16/audit-partner-app.md:
 *   M1 (peak/prep/staffing fabrication), M3 (franchise capital + space areas),
 *   M7 (margin verdict without cost data), L2 (invented branch name),
 *   L3 (invented favourite branch).
 *
 * Node environment (vitest.config.ts: environment 'node') — components are
 * rendered through react-dom/server, recharts is stubbed (no DOM).
 * Each test FAILS against the pre-fix source and passes after the fix.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  leads: [] as any[],
  customer: null as any,
  toastErrors: [] as string[],
}));

vi.mock('sonner', () => ({
  toast: {
    error: (m: string) => state.toastErrors.push(m),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

// recharts needs a DOM to lay out; the assertions below target copy outside the
// chart, so a pass-through stub keeps the render honest and deterministic.
vi.mock('recharts', async () => {
  const ReactModule = await import('react');
  const Box = ({ children }: { children?: React.ReactNode }) =>
    ReactModule.createElement('div', null, children);
  return {
    ResponsiveContainer: Box,
    BarChart: Box,
    Bar: Box,
    PieChart: Box,
    Pie: Box,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Cell: () => null,
  };
});

vi.mock('@/hooks/useFranchiseLeads', () => ({
  useFranchiseLeads: () => ({
    leads: state.leads,
    isLoading: false,
    updateLeadStatus: { mutate: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/hooks/useCustomer', () => ({
  useCustomer: () => ({ data: state.customer, isLoading: false }),
}));

vi.mock('@/hooks/useAdjustGrillCoins', () => ({
  useAdjustGrillCoins: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/features/customers', () => ({
  CustomerOrderHistoryCard: () => null,
  GrillCoinsLedgerModal: () => null,
}));

import { HourlyRushHeatmap } from '@/components/analytics/HourlyRushHeatmap';
import { FulfillmentDonut } from '@/components/analytics/FulfillmentDonut';
import { FranchiseLeadsPipeline } from '@/components/stores/FranchiseLeadsPipeline';
import { RecentOrders } from '@/components/dashboard/RecentOrders';
import { CustomerDetailPage } from '@/pages/CustomerDetailPage';
import type { ChannelStat, HourlyRushData, LogisticsSummary } from '@/hooks/useAnalytics';

const emptyDay = (): HourlyRushData[] =>
  Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`,
    orders: 0,
    revenue: 0,
    avgPrepMinutes: 0,
    isPeak: false,
  }));

const channels: ChannelStat[] = [
  { channel: 'delivery', label: 'Delivery', orders: 3, revenue: 900, percentage: 100, avgTicket: 300 },
];

const logisticsBase: LogisticsSummary = {
  deliveryFeesCollected: 500,
  porterIncurredCost: 0,
  netMargin: 500,
  totalDeliveryTrips: 3,
  avgDeliveryDistanceKm: 0,
};

beforeEach(() => {
  state.leads = [];
  state.customer = null;
  state.toastErrors.length = 0;
});

describe('M1 — the heatmap never invents a peak, a prep-time SLA or a staffing plan', () => {
  it('renders no peak and no fabricated prep/staffing numbers for an empty period', () => {
    const html = renderToStaticMarkup(<HourlyRushHeatmap data={emptyDay()} />);

    expect(html).not.toContain('8 PM');
    expect(html).not.toContain('42 orders');
    expect(html).not.toContain('13.5 mins');
    expect(html).not.toContain('KDS SLA compliant');
    expect(html).not.toContain('Grill Masters');
    expect(html).toContain('No peak hour');
    expect(html).toContain('Not measured');
  });

  it('still renders the measured peak when orders exist', () => {
    const data = emptyDay().map((slot) =>
      slot.hour === 19 ? { ...slot, orders: 12 } : slot
    );
    const html = renderToStaticMarkup(<HourlyRushHeatmap data={data} />);

    expect(html).toContain('Peak: 7 PM (12 orders)');
  });
});

describe('M3 — the franchise pipeline shows only recorded values', () => {
  const leadWithoutArea = {
    id: 'lead_1',
    applicantName: 'Applicant One',
    phone: '+91 90000 00000',
    email: 'applicant.one@example.com',
    city: 'Vadodara',
    investmentBudget: '25L-50L',
    commercialSpace: 'owned',
    // spaceAreaSqFt deliberately absent — the old UI printed 1000 sq.ft anyway
    status: 'new',
    createdAt: null,
    updatedAt: null,
  };

  it('never asserts an invented capital figure', () => {
    state.leads = [leadWithoutArea];
    const html = renderToStaticMarkup(
      <FranchiseLeadsPipeline onConvertToBranch={vi.fn()} />
    );

    expect(html).not.toContain('2.25 Cr');
    expect(html).toContain('0.25 Cr'); // lower bound of the one stated 25L-50L band
    expect(html).toContain('Lower bound');
  });

  it('never invents a space size for a lead that did not provide one', () => {
    state.leads = [leadWithoutArea];
    const html = renderToStaticMarkup(
      <FranchiseLeadsPipeline onConvertToBranch={vi.fn()} />
    );

    expect(html).not.toContain('1000 sq.ft');
    expect(html).not.toContain('800 sq.ft');
    expect(html).toContain('Area not provided');
  });
});

describe('M7 — the fulfilment panel only states a margin verdict it can know', () => {
  it('withholds the verdict while the courier cost side is unmeasured', () => {
    const html = renderToStaticMarkup(
      <FulfillmentDonut breakdown={channels} logistics={logisticsBase} />
    );

    expect(html).toContain('Cost data unavailable');
    expect(html).not.toContain('Positive Margin');
  });

  it('labels a real negative margin and prints the amount negative', () => {
    const html = renderToStaticMarkup(
      <FulfillmentDonut
        breakdown={channels}
        logistics={{ ...logisticsBase, porterIncurredCost: 620, netMargin: -120 }}
      />
    );

    expect(html).toContain('Negative Margin');
    expect(html).toContain('-₹120');
    expect(html).not.toContain('Positive Margin');
    expect(html).not.toContain('+₹-120');
  });
});

describe('L2 — an order without a branch is not attributed to one', () => {
  it('labels an unassigned outlet instead of inventing Surat Adajan', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <RecentOrders
          orders={[
            { id: 'ord_123456', total: 240, customerName: 'Customer', status: 'pending' },
          ]}
        />
      </MemoryRouter>
    );

    expect(html).not.toContain('Surat Adajan');
    expect(html).toContain('Unassigned outlet');
  });
});

describe('L3 — the customer profile does not invent a favourite branch', () => {
  it('says there is no favourite branch instead of naming one', () => {
    state.customer = {
      id: 'cust_1',
      name: 'Customer One',
      phone: '+91 90000 00001',
      email: 'customer.one@example.com',
      addresses: [],
      loyaltyPoints: 0,
      segment: 'Regular',
      orders: [],
    };

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CustomerDetailPage />
      </MemoryRouter>
    );

    expect(html).not.toContain('Ahmedabad CG Road');
    expect(html).toContain('No favourite branch yet');
  });
});
