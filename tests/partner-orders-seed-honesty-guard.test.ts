// Static fixture-marker checks only. Failed-read rejection is exercised through
// the real hook/query function in partner-recent-order-queries.stress.test.ts;
// counting catch blocks does not establish that failed reads never return seeds.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = readFileSync(
  path.resolve(import.meta.dirname, '../src/hooks/useOrders.ts'),
  'utf8',
);

describe('useOrders demo-seed honesty guard', () => {
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
