import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F6 / A7 #8 — Control Room status bumps carry an `expectedStatus`, so two
 * terminals cannot reverse each other's actions.
 *
 * The audited defect: the server's bump transaction freezes TERMINAL states but
 * accepts any non-terminal move, and the Control Room sent no precondition. The
 * KDS and the order-detail page both send `expectedStatus` for exactly this
 * reason. Real-world: staff A marks an order "Ready" while staff B's board still
 * shows "Preparing"; B taps "Send to Kitchen" — accepted, the ticket regresses,
 * the KDS moves it back and the customer's ETA jumps.
 */

const partnerApi = vi.hoisted(() => ({ bumpOrderStatus: vi.fn() }));

vi.mock('@/core/config/firebase', () => ({ db: {} }));
vi.mock('@/config/firebase', () => ({ app: {}, auth: {}, db: {}, messaging: null }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ user: { role: 'brand_owner' } }), subscribe: () => () => {} },
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: { getState: () => ({ selectedBranchId: null }) },
}));
vi.mock('@/services/partnerFunctionsApi', () => ({ partnerFunctionsApi: partnerApi }));

import { adminOrdersService } from '../src/admin/services/adminOrdersService';

describe('A7 #8 — the bump carries the status the operator acted from', () => {
  beforeEach(() => {
    partnerApi.bumpOrderStatus.mockReset();
    partnerApi.bumpOrderStatus.mockResolvedValue({ orderId: 'order_123', status: {} });
  });

  it('sends expectedStatus translated through the SAME table as the target', async () => {
    await adminOrdersService.updateOrderStatus('order_123', 'Ready', undefined, 'Preparing');

    expect(partnerApi.bumpOrderStatus).toHaveBeenCalledTimes(1);
    expect(partnerApi.bumpOrderStatus.mock.calls[0][0]).toMatchObject({
      orderId: 'order_123',
      status: 'ready',
      expectedStatus: 'preparing',
    });
  });

  it('maps the board label "Out for Delivery" to the Delivery code', async () => {
    await adminOrdersService.updateOrderStatus('order_9', 'Completed', undefined, 'Out for Delivery');

    expect(partnerApi.bumpOrderStatus.mock.calls[0][0]).toMatchObject({
      status: 'delivered',
      expectedStatus: 'out_for_delivery',
    });
  });

  it('omits expectedStatus when the caller has none (back-compatible)', async () => {
    await adminOrdersService.updateOrderStatus('order_123', 'Accepted', {
      title: 't',
      actor: 'a',
      description: 'd',
    });

    expect(partnerApi.bumpOrderStatus.mock.calls[0][0]).not.toHaveProperty('expectedStatus');
  });

  it('never invents a precondition for an unmappable status', async () => {
    await adminOrdersService.updateOrderStatus('order_123', 'Ready', undefined, 'Needs Review');

    expect(partnerApi.bumpOrderStatus.mock.calls[0][0]).not.toHaveProperty('expectedStatus');
    expect(partnerApi.bumpOrderStatus.mock.calls[0][0]).toMatchObject({ status: 'ready' });
  });

  it('keeps the stale-conflict message the page turns into a refresh', async () => {
    partnerApi.bumpOrderStatus.mockRejectedValueOnce(
      Object.assign(new Error('STALE_ORDER_STATUS'), { status: 409 }),
    );

    await expect(
      adminOrdersService.updateOrderStatus('order_123', 'Ready', undefined, 'Preparing'),
    ).rejects.toThrow();
  });
});

describe('A7 #8 — the open drawer re-syncs from the live board', () => {
  it('the page keeps a re-sync effect keyed on orders and the open row', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', 'src/admin/pages/AdminOrdersPage.tsx'),
      'utf8',
    );

    // The effect must re-accept the LIVE row, not leave the snapshot in place.
    expect(source).toContain('const current = orders.find((o) => o.id === selectedOrder.id)');
    expect(source).toMatch(/setSelectedOrder\(current\)/);
    // And the drawer's actions must send the precondition.
    expect(source).toMatch(/expectedStatus/);
  });
});
