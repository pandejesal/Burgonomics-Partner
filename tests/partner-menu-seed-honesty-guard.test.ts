// Source-level wiring guard for the useMenu demo-catalog honesty cycle
// (Runbook §8: no invented availability/sync claims; failed reads never
// return the fake 63-item catalog). Repo convention: source-grep tests live
// in tests/ (colocated src tests are compiled under tsc, which lacks node
// builtin types).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const hook = readFileSync(
  path.resolve(import.meta.dirname, '../src/hooks/useMenu.ts'),
  'utf8',
);

describe('useMenu demo-catalog honesty guard', () => {
  it('a failed products read NEVER returns the seed catalog (no dev error-masking)', () => {
    expect(hook).not.toContain('Error loading menu items:');
    // The old catch: if (ALLOW_SEED_CATALOG) { ... return SEED_ITEMS; }
    expect(hook).not.toContain('if (ALLOW_SEED_CATALOG) {');
  });

  it('no-branch reads are an honest empty in dev too (never 63 invented items without a branch)', () => {
    // The !branchId block must end in a throw with no demo/seed consumer.
    const noBranch = hook.indexOf('if (!branchId) {');
    expect(noBranch).toBeGreaterThan(-1);
    const branchBlock = hook.slice(noBranch, hook.indexOf('try {', noBranch));
    expect(branchBlock).toContain("throw new Error('No branch selected')");
    expect(branchBlock).not.toContain('SEED_ITEMS');
    expect(branchBlock).not.toContain('demoSeedMenuItems');
  });

  it('the hook-level items fallback (products.length ? products : SEED_ITEMS) is gone', () => {
    expect(hook).not.toContain('products.length > 0 ? products : SEED_ITEMS');
  });

  it('the genuinely-empty dev path is the ONLY seed consumer, via the [DEMO]-marked demoSeedMenuItems()', () => {
    expect(hook).toContain('export function demoSeedMenuItems');
    // Allowed appearances: the demo fn assignment + the empty-path call.
    const seedUses = (hook.match(/SEED_ITEMS/g) || []).length;
    expect(seedUses).toBeLessThan(4); // definition + allowLine only
    expect((hook.match(/demoSeedMenuItems/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
