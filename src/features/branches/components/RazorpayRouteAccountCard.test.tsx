import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  RazorpayRouteAccountCard,
  isValidRouteAccountId,
  normalizeRouteAccountId,
} from './RazorpayRouteAccountCard';

/**
 * Lane 08 (Razorpay) — Route account binding honesty.
 *
 * Defect: `isLinked` was `!!accountId && accountId.startsWith('acc_')`, so the
 * garbage value "acc_" (or "acc_<space>" / "acc_x") rendered "Route Linked" —
 * staff believed the branch was payout-linked while the Route transfer would
 * fail at the gateway (transfer.failed parked for review). No inline signal
 * existed for an invalid id.
 *
 * Pinned behavior (pure helpers + rendered states, SSR like the repo's other
 * component tests):
 *  - only a real Razorpay account-id shape (acc_ + >=6 alphanumerics) counts
 *    as linked;
 *  - a non-empty INVALID value renders an explicit inline error, never the
 *    linked badge;
 *  - paste whitespace is normalized away before onChange/persistence intent;
 *  - the permission gate (non-super-admin cannot edit) is unchanged.
 */
const VALID_ID = 'acc_A1B2C3D4E5F6G7';

const render = (props: Partial<Parameters<typeof RazorpayRouteAccountCard>[0]> = {}) =>
  renderToString(<RazorpayRouteAccountCard accountId="" onChange={() => {}} {...props} />);

describe('RazorpayRouteAccountCard — Route binding honesty', () => {
  it('accepts a real account-id shape as linked (positive control)', () => {
    expect(isValidRouteAccountId(VALID_ID)).toBe(true);
    const html = render({ accountId: VALID_ID });
    expect(html).toContain('Route Linked');
    expect(html).not.toContain('not look like a Razorpay Route account');
  });

  it('refuses the bare "acc_" prefix: invalid value never renders as linked', () => {
    // Old code rendered "Route Linked" for this input (startsWith only).
    expect(isValidRouteAccountId('acc_')).toBe(false);
    const html = render({ accountId: 'acc_' });
    expect(html).not.toContain('Route Linked');
    expect(html).toContain('Unlinked');
    expect(html).toMatch(/not look like a Razorpay Route account/);
  });

  it('flags arbitrary text with an inline error and keeps Unlinked', () => {
    expect(isValidRouteAccountId('branch-account-42')).toBe(false);
    // The defect text names "acc_x" specifically: one character after the
    // prefix is still not an account id.
    expect(isValidRouteAccountId('acc_x')).toBe(false);
    const html = render({ accountId: 'branch-account-42' });
    expect(html).not.toContain('Route Linked');
    expect(html).toMatch(/not look like a Razorpay Route account/);
    // The invalid state is wired for assistive tech, not just coloured text.
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="route-account-id-error"');
  });

  it('normalizes surrounding whitespace in the helper (component judges the trimmed value)', () => {
    expect(normalizeRouteAccountId('   ' + VALID_ID + '  ')).toBe(VALID_ID);
    expect(isValidRouteAccountId(normalizeRouteAccountId(' ' + VALID_ID + ' '))).toBe(true);
    // Whitespace-only is empty, not garbage — no error banner, just Unlinked.
    // (SSR cannot fire onChange, so the onChange trimming is covered by the
    // helper contract above, not by a DOM event here.)
    const html = render({ accountId: '   ' });
    expect(html).toContain('Unlinked');
    expect(html).not.toMatch(/not look like a Razorpay Route account/);
  });

  it('keeps the super-admin permission gate on the input', () => {
    const locked = render({ accountId: VALID_ID, isSuperAdmin: false });
    expect(locked).toContain('Admin Only');
    // Attribute-level: the className alone always contains "disabled:*"
    // utilities, which made a bare /disabled/ match vacuous.
    expect(locked).toMatch(/<input[^>]*\bdisabled=""/);
    const disabled = render({ accountId: VALID_ID, disabled: true });
    expect(disabled).toMatch(/<input[^>]*\bdisabled=""/);
    // Positive control for the assertions above: an editable card must NOT
    // carry the disabled attribute.
    const editable = render({ accountId: VALID_ID, isSuperAdmin: true });
    expect(editable).not.toMatch(/<input[^>]*\bdisabled=""/);
  });
});
