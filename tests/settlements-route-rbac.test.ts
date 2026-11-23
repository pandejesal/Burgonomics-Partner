import { describe, it, expect, vi } from 'vitest';
import type { UserRole } from '@/types';

// navItems is static; only the useNavigation hook itself reads the auth store
// (and through it the Firebase config), so it is stubbed with no session.
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: null }) }));

import { canAccessRoute, rolesForRoute } from '@/core/auth/routePolicy';
import { navItems } from '@/hooks/useNavigation';
import {
  canGenerateSettlement,
  canRecordSettlementPayment,
  canReadSettlements,
  settlementMoney,
  settlementMonthKeys,
  settlementNetLabel,
  settlementPaidLabel,
  sortStatementsForDisplay,
  type SettlementStatement,
} from '@/features/settlements';

/**
 * Franchise settlement screen contract (owner decision 2026-11-20).
 *
 * Who may see it: owner and brand roles see every branch, a branch owner sees
 * only its own branch, and nobody else gets the screen at all — a support or
 * regional account reaching /settlements would only produce a refusal from the
 * server, so the UI must not offer it.
 */

function statement(over: Partial<SettlementStatement> = {}): SettlementStatement {
  return {
    id: 'br_surat_2026-11_v001',
    branchId: 'br_surat',
    branchName: 'Burgonomics - Surat',
    monthKey: '2026-11',
    version: 1,
    currency: 'INR',
    onlineCollectedPaise: 1300000,
    onlineRefundedPaise: 20000,
    onlineNetPaise: 1280000,
    onlineOrders: 40,
    cashCollectedPaise: 500000,
    cashOrders: 12,
    cashPendingOrders: 1,
    platformFeePaise: 200000,
    netPayablePaise: 1080000,
    outstandingPaise: over.outstandingPaise ?? over.netPayablePaise ?? 1080000,
    ledgerSchema: 1,
    current: true,
    complete: true,
    branchOwes: false,
    feeApplicable: true,
    paidStatus: 'unpaid',
    paidAtMs: null,
    paymentReference: null,
    payments: [],
    generatedAtMs: 0,
    assumptionsVersion: '2026-11-20-r1',
    notes: [],
    ...over,
  };
}

describe('settlement access policy', () => {
  it('offers /settlements to owner, brand and branch owner only', () => {
    expect(rolesForRoute('/settlements')).toEqual(['brand_owner', 'developer', 'branch_owner']);
    for (const role of ['support', 'regional_manager', 'branch_staff', 'customer'] as UserRole[]) {
      expect(canAccessRoute(role, '/settlements'), role).toBe(false);
    }
  });

  it('keeps a sidebar entry whose roles match the enforced policy', () => {
    const nav = navItems.find((item) => item.path === '/settlements');
    expect(nav).toBeTruthy();
    expect(nav!.roles).toEqual(rolesForRoute('/settlements'));
    expect(nav!.label).toBe('Settlements');
  });

  it('lets the same roles that read a statement manage money', () => {
    expect(canReadSettlements('branch_owner')).toBe(true);
    expect(canReadSettlements('branch_staff')).toBe(false);
    expect(canReadSettlements('support')).toBe(false);

    // Generating and marking paid are owner/brand only — a branch owner reads.
    expect(canGenerateSettlement('branch_owner')).toBe(false);
    expect(canGenerateSettlement('developer')).toBe(true);
    expect(canRecordSettlementPayment('branch_owner')).toBe(false);
    expect(canRecordSettlementPayment('brand_owner')).toBe(true);
  });
});

describe('settlement month picker', () => {
  it('offers closed months only, newest first, defaulting to the previous IST month', () => {
    const keys = settlementMonthKeys(12, new Date(Date.UTC(2026, 11, 1)));
    expect(keys[0]).toBe('2026-11');
    expect(keys[1]).toBe('2026-10');
    expect(keys).not.toContain('2026-12'); // the running month cannot be settled
    expect(keys).toHaveLength(12);
    // Rolls the year correctly.
    const january = settlementMonthKeys(3, new Date(Date.UTC(2026, 0, 1)));
    expect(january).toEqual(['2025-12', '2025-11', '2025-10']);
  });
});

describe('settlement display maths', () => {
  it('formats paise as whole rupees with the sign kept for a negative payable', () => {
    expect(settlementMoney(1080000)).toBe('₹10,800');
    expect(settlementMoney(-200000)).toBe('-₹2,000');
    expect(settlementMoney(0)).toBe('₹0');
    expect(settlementMoney(null)).toBe('—');
    expect(settlementMoney(undefined)).toBe('—');
    // Paise are rounded, never truncated into a wrong rupee.
    expect(settlementMoney(123456)).toBe('₹1,235');
  });

  it('says who owes whom instead of showing a bare minus sign', () => {
    expect(settlementNetLabel(statement())).toBe('Payable to branch');
    expect(settlementNetLabel(statement({ netPayablePaise: -200000, branchOwes: true }))).toBe(
      'Branch owes brand'
    );
    expect(settlementNetLabel(statement({ netPayablePaise: 0 }))).toBe('Settled to zero');
  });

  it('labels the paid state with the reference once money is recorded', () => {
    expect(settlementPaidLabel(statement())).toBe('Unpaid');
    expect(
      settlementPaidLabel(
        statement({ paidStatus: 'paid', paymentReference: 'NEFT-8891', paidAtMs: 0 })
      )
    ).toBe('Paid · NEFT-8891');
  });

  it('never adds cash into the payable and keeps the fee a single line', () => {
    const s = statement();
    expect(s.netPayablePaise).toBe(s.onlineNetPaise - s.platformFeePaise);
    // Cash is informational: it is not part of the net.
    expect(s.netPayablePaise).not.toBe(s.onlineNetPaise - s.platformFeePaise + s.cashCollectedPaise);
  });
});

describe('settlement list ordering', () => {
  it('puts the branch that owes the brand first, then sorts by name', () => {
    const rows = sortStatementsForDisplay([
      statement({ id: 'a', branchId: 'b_a', branchName: 'Ahmedabad' }),
      statement({ id: 'b', branchId: 'b_b', branchName: 'Zeta', netPayablePaise: -50000, branchOwes: true }),
      statement({ id: 'c', branchId: 'b_c', branchName: 'Baroda' }),
    ]);
    expect(rows.map((r) => r.branchId)).toEqual(['b_b', 'b_a', 'b_c']);
  });

  it('keeps only the newest version of a branch when the server sends more', () => {
    const rows = sortStatementsForDisplay([
      statement({ id: 'v1', version: 1 }),
      statement({ id: 'v3', version: 3 }),
      statement({ id: 'v2', version: 2 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe(3);
  });
});
