import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Settlement route wiring, kept as a source-level test.
 *
 * These assertions are about the ROUTER and the SCREEN SOURCE, not about
 * rendering, so they live under `tests/` (where node built-ins are typed)
 * rather than inside `src/pages` (which `tsc --noEmit` compiles against a DOM-only
 * lib). The render-level contract lives in
 * `src/pages/SettlementsPage.test.tsx`.
 */

const page = readFileSync(
  fileURLToPath(new URL('../src/pages/SettlementsPage.tsx', import.meta.url)),
  'utf8'
);
const app = readFileSync(
  fileURLToPath(new URL('../src/App.tsx', import.meta.url)),
  'utf8'
);

describe('Settlements route wiring', () => {
  it('is reachable in the router behind the role gate', () => {
    expect(app).toContain('path="/settlements"');
    expect(app).toMatch(/<SettlementsPage/);
    // The allowlist must be the three roles the policy admits, so a role that
    // cannot read a statement never sees the screen.
    const start = app.indexOf('path="/settlements"');
    const block = app.slice(start, start + 400);
    expect(block).toMatch(/brand_owner/);
    expect(block).toMatch(/developer/);
    expect(block).toMatch(/branch_owner/);
    expect(block).not.toMatch(/branch_staff/);
  });

  it('mounts the screen inside a role-guarded wrapper', () => {
    const start = app.indexOf('path="/settlements"');
    const block = app.slice(start, start + 400);
    expect(block).toMatch(/ProtectedRoute/);
  });

  it('derives every amount from the server statement - no local re-derivation', () => {
    // Cycle 11: the row's payable is now the server-signed `outstandingPaise`
    // (net payable minus recorded payments), not a locally recomputed net, and
    // the footer reads the server totals. The invariant is unchanged: no amount
    // on the screen is calculated from parts in this file.
    expect(page).toContain('outstandingPaise');
    expect(page).toContain('platformFeePaise');
    expect(page).toContain('payableToBranchesPaise');
    expect(page).toContain('owesBrandPaise');
    // The screen must never recompute the payable from parts.
    expect(page).not.toMatch(/netPayable\s*=\s*.*-\s*.*fee/i);
  });

  it('keeps cash out of the payable arithmetic', () => {
    // cashCollectedPaise may be displayed, but never added to or subtracted
    // from the net: the branch already holds that money.
    expect(page).not.toMatch(/netPayablePaise\s*[+-]=?\s*[^;]*cashCollectedPaise/i);
    expect(page).not.toMatch(/netPayablePaise\s*[+-]=?\s*[^;]*cash/i);
  });
});
