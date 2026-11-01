/**
 * Firestore rules allow a walk-in order create only for branch roles:
 * `isBranchOwner()` = branch_owner | branch_staff, plus ownsBranch(branchId).
 * A brand owner, support or regional manager choosing a branch must not be
 * offered a create action that can only end in permission-denied.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { canCreateWalkInOrders } from '@/core/auth/routePolicy';
import { OrderFiltersBar } from '@/features/orders/components/OrderFiltersBar';

describe('canCreateWalkInOrders', () => {
  it('is true only for the branch roles the rules admit', () => {
    expect(canCreateWalkInOrders('branch_owner')).toBe(true);
    expect(canCreateWalkInOrders('branch_staff')).toBe(true);
    for (const role of ['brand_owner', 'developer', 'support', 'regional_manager', undefined] as const) {
      expect(canCreateWalkInOrders(role)).toBe(false);
    }
  });
});

describe('OrderFiltersBar — walk-in create action', () => {
  const props = {
    channelFilter: 'all' as const,
    onChannelChange: () => {},
    paymentFilter: 'all' as const,
    onPaymentChange: () => {},
    statusFilter: 'all' as const,
    onStatusChange: () => {},
    dateRange: 'all' as const,
    onDateRangeChange: () => {},
    searchQuery: '',
    onSearchChange: () => {},
    onOpenCreateModal: () => {},
    totalCount: 1,
    filteredCount: 1,
  };

  it('hides the walk-in action when the role cannot create one', () => {
    const html = renderToStaticMarkup(
      <OrderFiltersBar {...props} canCreateWalkInOrder={false} />
    );
    expect(html).not.toContain('Walk-in Order');
  });

  it('keeps it for branch roles', () => {
    const html = renderToStaticMarkup(
      <OrderFiltersBar {...props} canCreateWalkInOrder />
    );
    expect(html).toContain('Walk-in Order');
  });
});
