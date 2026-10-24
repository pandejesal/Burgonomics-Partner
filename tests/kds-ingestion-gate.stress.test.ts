import { describe, expect, it } from 'vitest';
import {
  createKdsIngestionGate,
  pruneKdsSeenOrderIds,
} from '@/features/kds/hooks/useKDSRealtimeStream';

/**
 * STRESS SWEEP 2026-10-24 — KDS burst-mode guards (partner H1/H3).
 *
 * H1: the alias-fetch inside the branch-scoped onSnapshot merge ran
 * unsequenced; a slower earlier fetch overwrote a newer snapshot's makeline
 * (a bumped ticket reappearing in 'pending'). The ingestion gate is the
 * latest-wins seam, exercised here as a pure contract (same style as
 * tests/kds-stream-degradation.test.ts).
 *
 * H3: the chime-dedupe set's FIFO pruning must never evict ids that are
 * STILL PENDING — the old blind delete re-alarmed long-pending tickets
 * once theirs id left the first 100 entries.
 */

describe('createKdsIngestionGate (H1: latest-wins alias merges)', () => {
  it('drops a slower START-EARLIER-attempt resolving after a newer attempt', () => {
    const gate = createKdsIngestionGate();

    // Snapshot #1 starts its alias fetch …
    const tokenSnap1 = gate.next();
    // … snapshot #2 lands and starts its fetch (newest generation).
    const tokenSnap2 = gate.next();

    // Snapshot #2's fetch resolves first and merges.
    expect(gate.isCurrent(tokenSnap2)).toBe(true);
    // Snapshot #1's fetch resolves LAST — must be dropped.
    expect(gate.isCurrent(tokenSnap1)).toBe(false);
  });

  it('keeps the newest merge as the only one allowed to write state', () => {
    const gate = createKdsIngestionGate();
    const t1 = gate.next();
    const t2 = gate.next();
    const t3 = gate.next();
    expect(gate.isCurrent(t3)).toBe(true);
    expect(gate.isCurrent(t2)).toBe(false);
    expect(gate.isCurrent(t1)).toBe(false);
  });
});

describe('pruneKdsSeenOrderIds (H3: pending tickets survive pruning)', () => {
  it('RED: never evicts an id that is still pending in the makeline', () => {
    const seen = new Set<string>();
    // 501 seen ids; the OLDEST (first-inserted) is a long-pending ticket.
    const longPendingId = 'order_long_pending';
    seen.add(longPendingId);
    for (let i = 0; i < 500; i++) seen.add(`order_done_${i}`);
    expect(seen.size).toBe(501);

    // The 501-id cap tripped, but the long-pending order is STILL active.
    pruneKdsSeenOrderIds(seen, [longPendingId], 500, 100);

    expect(seen.has(longPendingId)).toBe(true);
    // And something WAS pruned (bounded set), just not the active ticket.
    expect(seen.size).toBeLessThan(501);
  });

  it('bounded set: prunes only non-pending ids', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) seen.add(`order_${i}`);
    const pending = ['order_0', 'order_1', 'order_2'];
    pruneKdsSeenOrderIds(seen, pending, 500, 100);
    expect(seen.has('order_0')).toBe(true);
    expect(seen.size).toBeLessThanOrEqual(500);
  });

  it('no pruning below the cap (idle kitchen stays cheap)', () => {
    const seen = new Set<string>(['a', 'b', 'c']);
    pruneKdsSeenOrderIds(seen, [], 500, 100);
    expect(seen.size).toBe(3);
  });
});
