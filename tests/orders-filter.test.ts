import { describe, it, expect } from 'vitest';

export interface PosOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  status: 'pending' | 'preparing' | 'ready' | 'dispatched' | 'delivered' | 'cancelled';
  fulfillmentType: 'delivery' | 'takeaway' | 'dine_in';
  branchId: string;
  totalAmount: number;
  createdAt: number;
}

export function filterPosOrders(
  orders: PosOrder[],
  filters: {
    statusTab?: 'all' | 'active' | 'completed' | 'cancelled';
    fulfillmentType?: 'all' | 'delivery' | 'takeaway' | 'dine_in';
    searchQuery?: string;
    branchId?: string;
  }
): PosOrder[] {
  return orders.filter((order) => {
    // 1. Branch filter
    if (filters.branchId && filters.branchId !== 'all' && order.branchId !== filters.branchId) {
      return false;
    }

    // 2. Status tab filter
    if (filters.statusTab && filters.statusTab !== 'all') {
      if (filters.statusTab === 'active') {
        const activeStatuses = ['pending', 'preparing', 'ready', 'dispatched'];
        if (!activeStatuses.includes(order.status)) return false;
      } else if (filters.statusTab === 'completed') {
        if (order.status !== 'delivered') return false;
      } else if (filters.statusTab === 'cancelled') {
        if (order.status !== 'cancelled') return false;
      }
    }

    // 3. Fulfillment type filter
    if (
      filters.fulfillmentType &&
      filters.fulfillmentType !== 'all' &&
      order.fulfillmentType !== filters.fulfillmentType
    ) {
      return false;
    }

    // 4. Search query
    if (filters.searchQuery && filters.searchQuery.trim() !== '') {
      const q = filters.searchQuery.toLowerCase().trim();
      const matchOrderNum = order.orderNumber.toLowerCase().includes(q);
      const matchName = order.customerName.toLowerCase().includes(q);
      const matchPhone = order.customerPhone.toLowerCase().includes(q);
      if (!matchOrderNum && !matchName && !matchPhone) return false;
    }

    return true;
  });
}

describe('Partner POS Orders Stream & Filter Suite', () => {
  const mockOrders: PosOrder[] = [
    {
      id: 'ord_01',
      orderNumber: '#BUR-101',
      customerName: 'Karan Shah',
      customerPhone: '+919876500001',
      status: 'pending',
      fulfillmentType: 'delivery',
      branchId: 'branch_surat_01',
      totalAmount: 499,
      createdAt: 1000,
    },
    {
      id: 'ord_02',
      orderNumber: '#BUR-102',
      customerName: 'Pooja Verma',
      customerPhone: '+919876500002',
      status: 'preparing',
      fulfillmentType: 'dine_in',
      branchId: 'branch_surat_01',
      totalAmount: 320,
      createdAt: 2000,
    },
    {
      id: 'ord_03',
      orderNumber: '#BUR-103',
      customerName: 'Rahul Mehta',
      customerPhone: '+919876500003',
      status: 'delivered',
      fulfillmentType: 'takeaway',
      branchId: 'branch_surat_01',
      totalAmount: 250,
      createdAt: 3000,
    },
    {
      id: 'ord_04',
      orderNumber: '#BUR-104',
      customerName: 'Ananya Desai',
      customerPhone: '+919876500004',
      status: 'cancelled',
      fulfillmentType: 'delivery',
      branchId: 'branch_ahmedabad_01',
      totalAmount: 650,
      createdAt: 4000,
    },
  ];

  it('filters active orders correctly (pending, preparing, ready, dispatched)', () => {
    const active = filterPosOrders(mockOrders, { statusTab: 'active' });
    expect(active).toHaveLength(2);
    expect(active.map((o) => o.id)).toEqual(['ord_01', 'ord_02']);
  });

  it('filters by fulfillment type (e.g. delivery only)', () => {
    const delivery = filterPosOrders(mockOrders, { fulfillmentType: 'delivery' });
    expect(delivery).toHaveLength(2);
    expect(delivery.map((o) => o.id)).toEqual(['ord_01', 'ord_04']);
  });

  it('filters by search query matching customer name, phone, or order number', () => {
    const searchByName = filterPosOrders(mockOrders, { searchQuery: 'Pooja' });
    expect(searchByName).toHaveLength(1);
    expect(searchByName[0].id).toBe('ord_02');

    const searchByPhone = filterPosOrders(mockOrders, { searchQuery: '00003' });
    expect(searchByPhone).toHaveLength(1);
    expect(searchByPhone[0].id).toBe('ord_03');

    const searchByOrderNum = filterPosOrders(mockOrders, { searchQuery: '#bur-104' });
    expect(searchByOrderNum).toHaveLength(1);
    expect(searchByOrderNum[0].id).toBe('ord_04');
  });

  it('filters by branch ID', () => {
    const suratOrders = filterPosOrders(mockOrders, { branchId: 'branch_surat_01' });
    expect(suratOrders).toHaveLength(3);

    const ahmedabadOrders = filterPosOrders(mockOrders, { branchId: 'branch_ahmedabad_01' });
    expect(ahmedabadOrders).toHaveLength(1);
  });
});
