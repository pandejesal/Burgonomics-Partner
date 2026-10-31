import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// F9: push-notification taps used to assign `window.location.href = link`.
// On native builds the app mounts HashRouter over a file:// document, so that
// navigated the WebView to a literal `file:///orders/x` document that does
// not exist — the route never rendered and the operator saw a blank screen.
// The fix routes both listeners through inAppRouteHref()/navigateInApp() and
// clamps any branchId in the payload to the session's RBAC scope.

const native = vi.fn(() => false);
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native() },
}));

import {
  inAppRouteHref,
  navigateInApp,
  clampPushBranchSelection,
} from '../src/shared/platform/deepLinkRouter';

type Win = { location: { href?: string; hash?: string } };

describe('F9 — in-app deep-link routing', () => {
  let win: Win;

  beforeEach(() => {
    native.mockReturnValue(false);
    win = { location: {} };
    (globalThis as unknown as Record<string, unknown>).window = win;
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).window;
  });

  it('builds a BrowserRouter path on web and a HashRouter path on native', () => {
    expect(inAppRouteHref('/orders/ord_1', false)).toBe('/orders/ord_1');
    expect(inAppRouteHref('/orders/ord_1', true)).toBe('#/orders/ord_1');
  });

  it('normalises a missing leading slash', () => {
    expect(inAppRouteHref('orders/ord_1', false)).toBe('/orders/ord_1');
    expect(inAppRouteHref('orders/ord_1', true)).toBe('#/orders/ord_1');
  });

  it('navigates in place on web instead of loading a file:// document', () => {
    native.mockReturnValue(false);
    navigateInApp('/tickets/t_1');
    expect(win.location.href).toBe('/tickets/t_1');
    expect(win.location.hash).toBeUndefined();
  });

  it('navigates through the hash on native, never through href', () => {
    native.mockReturnValue(true);
    navigateInApp('/tickets/t_1');
    expect(win.location.hash).toBe('#/tickets/t_1');
    expect(win.location.href).toBeUndefined();
  });

  it('is a no-op when there is no window (SSR / non-DOM context)', () => {
    delete (globalThis as unknown as Record<string, unknown>).window;
    expect(() => navigateInApp('/orders/ord_1')).not.toThrow();
  });
});

describe('F9 — push payload branchId is clamped to RBAC scope', () => {
  const scoped = ['branch_surat_01', 'branch_ahmedabad_01'];

  it('honours a branch the session is already allowed to see', () => {
    expect(clampPushBranchSelection('branch_surat_01', scoped)).toBe('branch_surat_01');
  });

  it('rejects a payload branchId outside the session scope', () => {
    // A push payload is attacker-influencable input; it must never widen
    // which outlet the app switches to.
    expect(clampPushBranchSelection('branch_surat_02', scoped)).toBeNull();
  });

  it('returns null for an absent payload branch (caller keeps the outlet)', () => {
    expect(clampPushBranchSelection(undefined, scoped)).toBeNull();
    expect(clampPushBranchSelection(null, scoped)).toBeNull();
    expect(clampPushBranchSelection('', scoped)).toBeNull();
  });

  it('never selects anything when the session has no scoped branches', () => {
    expect(clampPushBranchSelection('branch_surat_01', [])).toBeNull();
  });
});
