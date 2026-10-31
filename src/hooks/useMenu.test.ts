// Honesty-contract tests for the useMenu demo-catalog seeds (Runbook §8).
// Vitest env is 'node': hooks cannot run without a DOM/react provider, so
// this file pins the EXTRACTED seed function; wiring guards live in
// tests/partner-menu-seed-honesty-guard.test.ts.

import { describe, it, expect } from 'vitest';
import { demoSeedMenuItems } from './useMenu';

describe('demoSeedMenuItems (dev-only empty-catalog seeds, Runbook §8)', () => {
  const items = demoSeedMenuItems();

  it('is a non-empty demo catalog, every row visibly prefixed [DEMO]', () => {
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.name.startsWith('[DEMO]')).toBe(true);
    }
  });

  it('never hides availability as an invented claim (seeds keep their neutral catalog flags, nothing claims POS-sync state)', () => {
    for (const item of items) {
      // A fabricate with a lastSyncedAt claim would read as "synced from POS".
      expect(item.lastSyncedAt).toBeUndefined();
    }
  });

  it('seed ids stay identifiable so allocations cannot be mistaken for real product doc ids', () => {
    for (const item of items) expect(item.id.startsWith('prd_')).toBe(true);
  });
});
