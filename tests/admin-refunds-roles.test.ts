import { describe, it, expect } from 'vitest';
import {
  REFUND_RELEASE_ROLES,
  REFUND_REJECT_ROLES,
  canReleaseRefund,
  canRetryRefund,
  canRejectRefund,
  canTriggerBoardRefund,
} from '../src/admin/pages/refundRoles';

/**
 * The server gate is the source of truth (functions/src/index.ts):
 *   /payments/refund  → ["brand_owner","developer","support"]
 *   /refunds/dispose  → ["brand_owner","developer","support","branch_owner","branch_staff"]
 * These assertions pin the client helper to those exact lists so a drift back
 * to display-role strings ("Developer"/"Finance") fails the test.
 */
const SERVER_RELEASE_ROLES = ['brand_owner', 'developer', 'support'];
const SERVER_REJECT_ROLES = [
  'brand_owner',
  'developer',
  'support',
  'branch_owner',
  'branch_staff',
];

describe('Refund role matrix mirrors the server gates', () => {
  it('release/retry roles equal the /payments/refund canonical list', () => {
    expect([...REFUND_RELEASE_ROLES].sort()).toEqual([...SERVER_RELEASE_ROLES].sort());
  });

  it('reject roles equal the /refunds/dispose canonical list', () => {
    expect([...REFUND_REJECT_ROLES].sort()).toEqual([...SERVER_REJECT_ROLES].sort());
  });
});

describe('canReleaseRefund / canRetryRefund (POST /payments/refund)', () => {
  it('grants the exact server-approved roles', () => {
    for (const role of SERVER_RELEASE_ROLES) {
      expect(canReleaseRefund(role)).toBe(true);
      expect(canRetryRefund(role)).toBe(true);
    }
  });

  it('denies every canonical role the server rejects', () => {
    for (const role of ['regional_manager', 'branch_owner', 'branch_staff', 'customer']) {
      expect(canReleaseRefund(role)).toBe(false);
      expect(canRetryRefund(role)).toBe(false);
    }
  });

  it('never grants the old impossible display strings', () => {
    for (const role of ['Developer', 'Finance', 'Store Manager', 'Operations']) {
      expect(canReleaseRefund(role)).toBe(false);
      expect(canRetryRefund(role)).toBe(false);
    }
  });

  it('fails closed on absent/unknown roles', () => {
    for (const role of [null, undefined, '', 'superuser', 'admin']) {
      expect(canReleaseRefund(role)).toBe(false);
      expect(canRetryRefund(role)).toBe(false);
    }
  });
});

describe('canTriggerBoardRefund (Control Room order board)', () => {
  const completedPaid = { orderStatus: 'Completed', paymentStatus: 'Paid' };

  it('offers the refund action only to the server-approved release roles', () => {
    for (const role of SERVER_RELEASE_ROLES) {
      expect(canTriggerBoardRefund(role, completedPaid)).toBe(true);
    }
    for (const role of [
      'regional_manager',
      'branch_owner',
      'branch_staff',
      'customer',
      null,
      undefined,
    ]) {
      expect(canTriggerBoardRefund(role, completedPaid)).toBe(false);
    }
  });

  it('stays off unless the order is Completed and Paid', () => {
    expect(
      canTriggerBoardRefund('brand_owner', { orderStatus: 'Preparing', paymentStatus: 'Paid' })
    ).toBe(false);
    expect(
      canTriggerBoardRefund('brand_owner', { orderStatus: 'Completed', paymentStatus: 'Pending' })
    ).toBe(false);
    expect(canTriggerBoardRefund('brand_owner', null)).toBe(false);
  });
});

describe('canRejectRefund (POST /refunds/dispose)', () => {
  it('grants the exact server-approved roles', () => {
    for (const role of SERVER_REJECT_ROLES) {
      expect(canRejectRefund(role)).toBe(true);
    }
  });

  it('denies roles the server rejects', () => {
    for (const role of ['regional_manager', 'customer']) {
      expect(canRejectRefund(role)).toBe(false);
    }
  });

  it('never grants the old impossible display strings', () => {
    for (const role of ['Developer', 'Finance', 'Store Manager', 'Operations']) {
      expect(canRejectRefund(role)).toBe(false);
    }
  });

  it('fails closed on absent/unknown roles', () => {
    for (const role of [null, undefined, '', 'superuser', 'admin']) {
      expect(canRejectRefund(role)).toBe(false);
    }
  });
});
