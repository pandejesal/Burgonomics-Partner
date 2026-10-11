import { describe, it, expect, vi } from 'vitest';

// Counter (walk-in) order creation used to ALWAYS fail firestore.rules (the
// `cust_walkin` sentinel customerId can never equal auth.uid), and its id
// `ord_pos_<Date.now().slice(-6)>` wrapped every ~16.7 minutes — the blind
// setDoc that followed silently OVERWROTE the earlier walk-in order.
vi.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: null },
}));

import {
  WALK_IN_CUSTOMER_ID,
  generateWalkInOrderId,
  isOrderProbeDenial,
  createOrderDocIfAbsent,
  type OrderDocProbe,
} from '../src/features/orders/utils/walkInOrder';
import type { Order } from '../src/types';

const order = (id: string): Order =>
  ({
    id,
    customerId: WALK_IN_CUSTOMER_ID,
    userId: 'uid_operator_1',
    customerName: 'Walk-in Customer',
    customerPhone: '',
    branchId: 'branch_surat_01',
    items: [],
    subtotal: 0,
    tax: 0,
    deliveryFee: 0,
    total: 0,
    orderType: 'takeaway',
    status: 'pending',
    paymentMethod: 'cod',
    paymentStatus: 'completed',
    createdAt: {} as Order['createdAt'],
    updatedAt: {} as Order['updatedAt'],
  }) as Order;

describe('Walk-in order create (rules stamp + collision-proof id)', () => {
  it('pins the sentinel customerId constant', () => {
    expect(WALK_IN_CUSTOMER_ID).toBe('cust_walkin');
  });

  it('generates ids from the injected auto-id, never from Date.now()', () => {
    expect(generateWalkInOrderId(() => 'AbC123XyZ_9876543210')).toBe(
      'ord_pos_AbC123XyZ_9876543210'
    );
  });

  it('produces distinct ids for auto-ids minted in the same millisecond', () => {
    // The old scheme produced ONE id per millisecond-slice; two orders in the
    // same window collided and one was silently overwritten. Auto-ids are
    // ~120 bits of entropy, so same-instant draws must still differ.
    const minted = new Set<string>();
    for (let i = 0; i < 200; i++) {
      minted.add(generateWalkInOrderId(() => `auto_${i % 7}_${i}`));
    }
    expect(minted.size).toBe(200);
    expect([...minted].every((id) => id.startsWith('ord_pos_'))).toBe(true);
  });

  it('classifies a rules denial as an expected probe failure', () => {
    expect(isOrderProbeDenial({ code: 'permission-denied' })).toBe(true);
    expect(isOrderProbeDenial(new Error('Missing or insufficient permissions.'))).toBe(true);
    // A real transport/offline error must NOT be treated as "denied" — it has
    // to propagate so the operator sees the failure instead of a phantom order.
    expect(isOrderProbeDenial(new Error('Failed to fetch'))).toBe(false);
    expect(isOrderProbeDenial(null)).toBe(false);
  });

  it('creates when the probe is denied (missing doc, rules-keyed read)', () => {
    const probe: OrderDocProbe = {
      get: vi.fn().mockRejectedValue({ code: 'permission-denied' }),
      set: vi.fn().mockResolvedValue(undefined),
    };
    return createOrderDocIfAbsent({ id: 'ord_pos_x' }, order('ord_pos_x'), probe).then(() => {
      expect(probe.set).toHaveBeenCalledTimes(1);
    });
  });

  it('creates when the probe resolves as absent', () => {
    const probe: OrderDocProbe = {
      get: vi.fn().mockResolvedValue({ exists: () => false }),
      set: vi.fn().mockResolvedValue(undefined),
    };
    return createOrderDocIfAbsent({ id: 'ord_pos_y' }, order('ord_pos_y'), probe).then(() => {
      expect(probe.set).toHaveBeenCalledTimes(1);
    });
  });

  it('NEVER overwrites an existing order doc', async () => {
    const probe: OrderDocProbe = {
      get: vi.fn().mockResolvedValue({ exists: () => true }),
      set: vi.fn(),
    };
    await expect(
      createOrderDocIfAbsent({ id: 'ord_pos_z' }, order('ord_pos_z'), probe)
    ).rejects.toThrow(/already exists/);
    expect(probe.set).not.toHaveBeenCalled();
  });

  it('surfaces non-denial probe errors instead of pretending success', async () => {
    const probe: OrderDocProbe = {
      get: vi.fn().mockRejectedValue(new Error('Failed to fetch')),
      set: vi.fn(),
    };
    await expect(
      createOrderDocIfAbsent({ id: 'ord_pos_w' }, order('ord_pos_w'), probe)
    ).rejects.toThrow('Failed to fetch');
    expect(probe.set).not.toHaveBeenCalled();
  });
});
