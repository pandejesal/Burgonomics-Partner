import React, { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The single sign-in migration made `useAdmin().role` a canonical UserRole.
 * These gates must compare canonical values, or a brand_owner/developer is
 * denied a refund action the server (REFUND_RELEASE_ROLES) already grants.
 */
const state = vi.hoisted(() => ({
  role: 'brand_owner',
  firstState: true,
  toastError: vi.fn(),
  txn: {
    id: 'txn_1',
    orderId: 'ord_1',
    amountPaise: 50_000,
    currency: 'INR',
    gateway: 'razorpay',
    gatewayPaymentId: 'pay_1',
    status: 'CAPTURED',
    verificationStatus: 'UNVERIFIED',
    createdAt: '2026-10-20 12:00',
    capturedAt: '2026-10-20 12:01',
    customer: { name: 'Customer', email: 'customer@example.com', phone: '+91 90000 00000' },
    store: { id: 'str_1', name: 'Outlet' },
    timeline: [],
    metadata: {},
    signature: 'sig',
    webhookEvents: [],
    refunds: [],
    auditLogs: [],
  },
}));

vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (state.firstState) {
        state.firstState = false;
        return [state.txn, vi.fn()];
      }
      return [typeof initial === 'function' ? (initial as () => unknown)() : initial, vi.fn()];
    },
    useEffect: () => undefined,
  };
});

vi.mock('react-router-dom', async (original) => {
  const actual = await original<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ id: 'txn_1' }) };
});

vi.mock('@/admin/hooks/useAdmin', () => ({
  useAdmin: () => ({
    role: state.role,
    isDeveloper: state.role === 'brand_owner' || state.role === 'developer',
  }),
}));

vi.mock('@/admin/pages/paymentsData', () => ({
  paymentStorage: {
    getTransactionById: () => state.txn,
    subscribe: () => vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { error: state.toastError, success: vi.fn() },
}));

import { AdminPaymentDetailsPage } from '../src/admin/pages/AdminPaymentDetailsPage';
import { RoleChip } from '../src/admin/components/Badges';

function findButton(node: ReactNode, label: string): ReactElement<any> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child, label);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement<any>(node)) return undefined;
  const props = node.props as { children?: ReactNode };
  const text =
    typeof props.children === 'string'
      ? props.children
      : Array.isArray(props.children)
        ? props.children.filter((child) => typeof child === 'string').join('')
        : '';
  if (node.type === 'button' && text.includes(label)) return node;
  return findButton(props.children, label);
}

function clickOverrideFor(role: string): string {
  state.role = role;
  state.firstState = true;
  state.toastError.mockClear();
  const tree = (AdminPaymentDetailsPage as unknown as (props: object) => ReactNode)({});
  const button = findButton(tree, 'Override Signature Validate');
  expect(button).toBeTruthy();
  button!.props.onClick();
  return String(state.toastError.mock.calls[0]?.[0] ?? '');
}

beforeEach(() => {
  state.firstState = true;
  state.toastError.mockClear();
});

describe('canonical role gates on the Control Room payment ledger', () => {
  it.each(['brand_owner', 'developer'])('authorizes %s to act', (role) => {
    expect(clickOverrideFor(role)).toContain('Verification NOT recorded');
  });

  it('denies regional_manager, which the refund server gate does not authorize', () => {
    expect(clickOverrideFor('regional_manager')).toContain('Access Denied');
  });
});

describe('RoleChip styles canonical roles', () => {
  it('gives brand_owner and developer the developer accent', () => {
    for (const role of ['brand_owner', 'developer']) {
      const html = renderToStaticMarkup(React.createElement(RoleChip, { role }));
      expect(html).toContain('bg-amber-50');
    }
  });

  it('leaves an operational role on the standard style', () => {
    const html = renderToStaticMarkup(
      React.createElement(RoleChip, { role: 'regional_manager' })
    );
    expect(html).not.toContain('bg-amber-50');
  });
});
