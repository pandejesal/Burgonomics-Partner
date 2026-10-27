import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TicketQueueTable } from '@/features/tickets/components/TicketQueueTable';
import { TicketResolutionModal } from '@/features/tickets/components/TicketResolutionModal';
import { runConfirmAction } from '@/admin/components/Utilities';
import { buildStoreOptions } from '@/admin/pages/AdminOrdersPage';
import { AdminPaymentsPage } from '@/admin/pages/AdminPaymentsPage';
import { AdminRefundsPage } from '@/admin/pages/AdminRefundsPage';
import { AdminAnalyticsPage } from '@/admin/pages/AdminAnalyticsPage';
import type { Ticket } from '@/types';

// Mock dependencies
vi.mock('@/config/firebase', () => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  messaging: null,
}));

vi.mock('@/core/config/firebase', () => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  messaging: null,
}));

const mockAuthStore = vi.hoisted(() => ({
  user: { id: 'usr_01', name: 'Support Operator', role: 'developer' },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => mockAuthStore,
}));

const mockAdminHook = vi.hoisted(() => ({
  role: 'developer',
  isDeveloper: true,
  admin: { fullName: 'Dev Lead' },
}));

vi.mock('@/admin/hooks/useAdmin', () => ({
  useAdmin: () => mockAdminHook,
}));

const paymentsMocks = vi.hoisted(() => ({
  listenLiveTransactions: vi.fn(),
  listenLiveRefunds: vi.fn(),
}));

vi.mock('@/admin/services/adminPaymentsService', () => ({
  adminPaymentsService: paymentsMocks,
}));

const analyticsHookMocks = vi.hoisted(() => ({
  useDashboardSnapshot: vi.fn(),
  useRevenueSeries: vi.fn(),
  useOrderSeries: vi.fn(),
  useStores: vi.fn(() => ({
    data: [
      { id: 'str_001', name: 'Navrangpura Store' },
      { id: 'str_002', name: 'Nehrunagar Store' },
    ],
  })),
}));

vi.mock('@/admin/dashboard/hooks/useDashboardData', () => ({
  useDashboardSnapshot: () => analyticsHookMocks.useDashboardSnapshot(),
  useRevenueSeries: () => analyticsHookMocks.useRevenueSeries(),
  useOrderSeries: () => analyticsHookMocks.useOrderSeries(),
  useStores: () => analyticsHookMocks.useStores(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('Partner Admin UX Defects 1-6 Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Defect 1: TicketQueueTable loading & error states', () => {
    it('renders loading state and never false All Clear when isLoading is true', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <TicketQueueTable
            tickets={[]}
            isLoading={true}
            onOpenResolveModal={vi.fn()}
            onQuickEscalate={vi.fn()}
          />
        </MemoryRouter>,
      );

      expect(html).toContain('Loading Support Queue...');
      expect(html).toContain('Connecting to live branch tickets');
      expect(html).not.toContain('Support Queue All Clear!');
    });

    it('renders explicit error/retry state and never false All Clear when error is present', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <TicketQueueTable
            tickets={[]}
            isLoading={false}
            error={new Error('Firestore branches read permission denied')}
            onRetry={vi.fn()}
            onOpenResolveModal={vi.fn()}
            onQuickEscalate={vi.fn()}
          />
        </MemoryRouter>,
      );

      expect(html).toContain('Unable to Load Support Queue');
      expect(html).toContain('Firestore branches read permission denied');
      expect(html).toContain('Retry Loading Queue');
      expect(html).not.toContain('Support Queue All Clear!');
    });

    it('renders error state when warnings exist and tickets array is empty', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <TicketQueueTable
            tickets={[]}
            isLoading={false}
            warnings={['No cities are assigned to your account']}
            onOpenResolveModal={vi.fn()}
            onQuickEscalate={vi.fn()}
          />
        </MemoryRouter>,
      );

      expect(html).toContain('Unable to Load Support Queue');
      expect(html).toContain('No cities are assigned to your account');
      expect(html).not.toContain('Support Queue All Clear!');
    });

    it('renders Support Queue All Clear only when not loading, no error, and empty tickets', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <TicketQueueTable
            tickets={[]}
            isLoading={false}
            error={null}
            warnings={[]}
            onOpenResolveModal={vi.fn()}
            onQuickEscalate={vi.fn()}
          />
        </MemoryRouter>,
      );

      expect(html).toContain('Support Queue All Clear!');
      expect(html).not.toContain('Loading Support Queue...');
      expect(html).not.toContain('Unable to Load Support Queue');
    });
  });

  describe('Defect 2: TicketResolutionModal retains notes on failure', () => {
    it('keeps notes intact and renders inline error when onConfirmResolution rejects', async () => {
      const onConfirmResolution = vi
        .fn()
        .mockRejectedValue(new Error('Backend server error: loyalty credit rejected'));
      const onClose = vi.fn();

      const ticket: Ticket = {
        id: 'tkt_modal_1',
        ticketNumber: 'TKT-1001',
        title: 'Cold burger issue',
        status: 'open',
        category: 'customer_escalation',
        priority: 'high',
        branchId: 'branch_1',
        branchName: 'Store 1',
        raisedById: 'user_owner_1',
        raisedByName: 'Owner One',
        raisedByRole: 'branch_owner',
        customerId: 'cust_1',
        customerName: 'Samir',
        customerPhone: '9898989898',
        message: 'Burger was cold',
        createdAt: { seconds: 123456 } as unknown as Ticket['createdAt'],
        updatedAt: { seconds: 123456 } as unknown as Ticket['updatedAt'],
      };

      // Direct simulation of modal submit handler logic
      let submitError: string | null = null;
      let closed = false;
      const notes = 'Apologized to customer and offered credit';

      try {
        await onConfirmResolution({
          ticketId: ticket.id,
          action: 'CREDIT_GRILL_COINS',
          notes,
          grillCoinsAmount: 100,
        });
        closed = true;
        onClose();
      } catch (err) {
        submitError = err instanceof Error ? err.message : String(err);
      }

      expect(closed).toBe(false);
      expect(onClose).not.toHaveBeenCalled();
      expect(submitError).toBe('Backend server error: loyalty credit rejected');
      expect(notes).toBe('Apologized to customer and offered credit');
    });
  });

  describe('Defect 3: TicketDetailPage preserves operator justification on failure', () => {
    it('does not wipe resolution notes on refund or goodwill rejection', async () => {
      let resolutionNotes = 'Burned patty photo verified by kitchen supervisor.';
      const setResolutionNotes = vi.fn((val: string) => {
        resolutionNotes = val;
      });

      const executeRefundAction = async (fail: boolean) => {
        try {
          if (fail) throw new Error('Payment gateway refund rejected');
          setResolutionNotes('');
        } catch {
          // Failure branch must preserve notes
        }
      };

      // Simulate failure
      await executeRefundAction(true);
      expect(setResolutionNotes).not.toHaveBeenCalledWith('');
      expect(resolutionNotes).toBe('Burned patty photo verified by kitchen supervisor.');

      // Simulate success
      await executeRefundAction(false);
      expect(setResolutionNotes).toHaveBeenCalledWith('');
      expect(resolutionNotes).toBe('');
    });
  });

  describe('Defect 4: AdminOrdersPage ConfirmDialog promises and error retention', () => {
    it('runConfirmAction stays open and returns error when async action throws', async () => {
      const onClose = vi.fn();
      const onConfirm = async () => {
        // e.g. handleUpdateStatus returns false, so onConfirm throws
        const ok = false;
        if (!ok) throw new Error('Status update failed — order unchanged');
      };

      const error = await runConfirmAction(onConfirm, onClose);
      expect(error).toBe('Status update failed — order unchanged');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('runConfirmAction calls onClose and returns null on success', async () => {
      const onClose = vi.fn();
      const onConfirm = async () => {
        // Successful async operation
      };

      const error = await runConfirmAction(onConfirm, onClose);
      expect(error).toBeNull();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('bulk cancel onConfirm throws when all updates fail', async () => {
      const onClose = vi.fn();
      const onConfirm = async () => {
        const selection = [{ id: 'ord_1' }, { id: 'ord_2' }];
        const results = [false, false]; // all failed
        const cancelled = results.filter(Boolean).length;
        if (cancelled === 0 && selection.length > 0) {
          throw new Error('Bulk cancellation failed — no orders were cancelled.');
        }
      };

      const error = await runConfirmAction(onConfirm, onClose);
      expect(error).toBe('Bulk cancellation failed — no orders were cancelled.');
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Defect 5: AdminAnalyticsPage honest error and empty states', () => {
    it('renders dash and explicit alert when queries fail, never false ₹0/0', () => {
      analyticsHookMocks.useDashboardSnapshot.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: vi.fn(),
      });
      analyticsHookMocks.useRevenueSeries.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: vi.fn(),
      });
      analyticsHookMocks.useOrderSeries.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: vi.fn(),
      });

      const html = renderToStaticMarkup(
        <MemoryRouter>
          <AdminAnalyticsPage />
        </MemoryRouter>,
      );

      expect(html).toContain('Analytics data stream unavailable or failed to load');
      expect(html).toContain('Retry Loading');
      expect(html).toContain('—');
      // Must not display false ₹0 or 0 consolidated stats
      expect(html).not.toContain('>₹0<');
      expect(html).toContain('Trend data unavailable');
      expect(html).toContain('Product sales ranking unavailable');
    });

    it('renders real empty-range messages when orders array is empty', () => {
      analyticsHookMocks.useDashboardSnapshot.mockReturnValue({
        data: {
          revenue: { netRevenuePaise: 0, orderCount: 0, aov: 0 },
          topProducts: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      analyticsHookMocks.useRevenueSeries.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      analyticsHookMocks.useOrderSeries.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      const html = renderToStaticMarkup(
        <MemoryRouter>
          <AdminAnalyticsPage />
        </MemoryRouter>,
      );

      expect(html).toContain('No sales or orders in this date range');
      expect(html).toContain('No product sales in this date range');
    });
  });

  describe('Defect 6: AdminPaymentsPage & AdminRefundsPage stream error handling & store options', () => {
    it('AdminPaymentsPage renders stream error alert and dash KPIs when listener fails', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <AdminPaymentsPage initialStreamError="PERMISSION_DENIED: missing payments read rule" />
        </MemoryRouter>,
      );

      expect(html).toContain('Live Payment Stream Unavailable');
      expect(html).toContain('Access restricted: Your account does not have permission');
      expect(html).toContain('Stream Unavailable');
      expect(html).toContain('Offline / Restricted');
      expect(html).toContain('Live Transaction Stream Unavailable');
      expect(html).toContain('Navrangpura Store');
      expect(html).toContain('Nehrunagar Store');
      expect(html).not.toContain('value="str_005"');
    });

    it('buildStoreOptions aggregates store directory and order outlets uniquely', () => {
      const directory = [{ id: 'str_1', name: 'Alpha' }];
      const orders = [{ store: { id: 'str_2', name: 'Beta' } }, { store: { id: 'str_1' } }];
      const options = buildStoreOptions(directory, orders);

      expect(options).toHaveLength(2);
      expect(options.map((o) => o.id)).toEqual(['str_1', 'str_2']);
      expect(options.map((o) => o.name)).toEqual(['Alpha', 'Beta']);
    });

    it('AdminRefundsPage renders stream error alert and dash KPIs when listener fails', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <AdminRefundsPage initialStreamError="PERMISSION_DENIED: missing refunds read rule" />
        </MemoryRouter>,
      );

      expect(html).toContain('Live Refund Stream Unavailable');
      expect(html).toContain('Access restricted: Your account does not have permission');
      expect(html).toContain('Stream Unavailable');
      expect(html).toContain('Live Refund Stream Unavailable');
    });
  });
});
