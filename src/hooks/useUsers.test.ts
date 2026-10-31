// Honesty-contract tests for the staff-hook demo seeds (Runbook §8).
// Vitest env is 'node': hooks cannot run without a DOM/react provider, so
// this file pins the EXTRACTED seed contract + isPermissionDenied; source
// wiring guards live in tests/partner-staff-hook-honesty-guard.test.ts.

import { describe, it, expect } from 'vitest';
import { demoSeedRoster, isPermissionDenied } from './useUsers';

describe('demoSeedRoster (dev-only roster, Runbook §8)', () => {
  const roster = demoSeedRoster();

  it('is a non-empty demo roster, every row visibly prefixed [DEMO]', () => {
    expect(roster.length).toBeGreaterThan(0);
    for (const u of roster) expect(u.name.startsWith('[DEMO]')).toBe(true);
  });

  it('carries NO invented presence/session claims (no "Live in KDS", no "Just now")', () => {
    for (const u of roster) expect(u.lastActiveAt).toBeUndefined();
    for (const u of roster) {
      const row = JSON.stringify(u);
      expect(row.includes('"Live in KDS"')).toBe(false);
      expect(row.includes('"Just now"')).toBe(false);
    }
  });

  it('keeps the demo login fixtures (hashed PINs exist for demo purposes only)', () => {
    expect(roster.every((u) => !!u.hashedPin)).toBe(true);
  });
});

describe('isPermissionDenied', () => {
  it('recognizes FirestoreError code permission-denied (an honest empty)', () => {
    expect(isPermissionDenied({ code: 'permission-denied' })).toBe(true);
  });

  it('never treats other errors as permission-denied (they surfacing, not seeding)', () => {
    expect(isPermissionDenied({ code: 'unavailable' })).toBe(false);
    expect(isPermissionDenied(new Error('boom'))).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
    expect(isPermissionDenied(undefined)).toBe(false);
  });
});
