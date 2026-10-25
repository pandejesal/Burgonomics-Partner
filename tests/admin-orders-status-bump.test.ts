import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Control Room status bumps must report failure to their caller. A refused
 * write (server denial or the local terminal-state guards) previously
 * resolved as a boolean `false` that AdminOrdersPage ignored, so the operator
 * saw a success audit log and an optimistically updated drawer for a status
 * change that never happened. The service now rejects, which routes every
 * failed bump into the page's existing catch/toast path.
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
  useAuthStore: { getState: () => ({ user: { role: 'brand_owner' } }) },
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: { getState: () => ({ selectedBranchId: null }) },
}));
vi.mock('@/services/partnerFunctionsApi', () => ({ partnerFunctionsApi: partnerApi }));

import { adminOrdersService } from '../src/admin/services/adminOrdersService';

describe('Control Room status bump failure propagation', () => {
  beforeEach(() => {
    partnerApi.bumpOrderStatus.mockReset();
  });

  it('rejects when the server refuses the write instead of reporting success', async () => {
    partnerApi.bumpOrderStatus.mockRejectedValueOnce(
      Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      }),
    );

    await expect(
      adminOrdersService.updateOrderStatus('order_123', 'Accepted', {
        title: 'Order status: Accepted',
        actor: 'Store Manager',
        description: 'Transitioned status to Accepted',
      }),
    ).rejects.toThrow(/permission/i);

    expect(partnerApi.bumpOrderStatus).toHaveBeenCalledTimes(1);
  });

  it('rejects local terminal-state guards before any network call', async () => {
    await expect(adminOrdersService.updateOrderStatus('order_123', 'Refunded')).rejects.toThrow(
      /refund/i,
    );
    await expect(adminOrdersService.updateOrderStatus('order_123', 'Needs Review')).rejects.toThrow(
      /quarantined/i,
    );

    expect(partnerApi.bumpOrderStatus).not.toHaveBeenCalled();
  });

  it('resolves on a successful write', async () => {
    partnerApi.bumpOrderStatus.mockResolvedValueOnce(undefined);

    await expect(
      adminOrdersService.updateOrderStatus('order_123', 'Preparing', {
        title: 'Order status: Preparing',
        actor: 'Store Manager',
        description: 'Transitioned status to Preparing',
      }),
    ).resolves.toBeUndefined();

    expect(partnerApi.bumpOrderStatus).toHaveBeenCalledTimes(1);
  });
});
