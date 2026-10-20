// Source-level wiring guard for the useOrders demo-seed honesty fix
// (Runbook §8: no invented backend-state claims; failed reads never return
// fake orders). This repo's convention for source-grep tests lives in tests/
// (colocated src tests run under tsc, which lacks node builtin types).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = readFileSync(
  path.resolve(import.meta.dirname, '../src/hooks/useOrders.ts'),
  'utf8',
);

describe('useOrders demo-seed honesty guard', () => {
  it('failed order reads always throw — the dev-only error masking ("returning dev seed orders") is gone', () => {
    expect(src).not.toContain('returning dev seed orders');
    // The hook body must contain no duplicated seed array inside a catch:
    // the seam `} catch (err) {` (global fetch try/catch) must not exist at
    // all anymore; only intentional inner catch blocks remain.
    const innerCatches = (src.match(/catch \(/g) || []).length;
    expect(innerCatches).toBe(2);
  });

  it('the fabricated seed docs have exactly ONE source (deduped via demoSeedOrders)', () => {
    expect(src).toContain('export function demoSeedOrders');
    expect(src.split("id: 'ord_901'").length - 1).toBe(1);
  });

  it('seeds carry honesty markers and no invented claims at the source level', () => {
    expect(src).toContain("'[DEMO] ");
    expect(src).not.toContain("paymentStatus: 'completed',\n      petpoojaSyncStatus: 'synced'");
    expect(src).not.toContain('kotPrinted: true');
  });
});
