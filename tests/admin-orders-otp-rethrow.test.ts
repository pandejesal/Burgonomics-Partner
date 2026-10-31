/**
 * The admin "Completed" action maps to partner `delivered`. `updateOrderStatus`
 * used to catch every failure and return false, so the page could not toast
 * anything and even optimistically showed the order as completed. It must
 * reject with the staff-facing OTP instruction.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/core/config/firebase', () => ({ db: {} }));
vi.mock('@/services/partnerFunctionsApi', () => ({
  partnerFunctionsApi: {
    bumpOrderStatus: vi.fn(async () => {
      throw new Error('DELIVERY_OTP_REQUIRED');
    }),
  },
}));

import { adminOrdersService } from '../src/admin/services/adminOrdersService';

describe('adminOrdersService.updateOrderStatus — delivery OTP', () => {
  it('rejects with the use-the-OTP instruction instead of returning false', async () => {
    await expect(
      adminOrdersService.updateOrderStatus('ord_complete_1', 'Completed')
    ).rejects.toThrow(/4-digit OTP/);
  });
});
