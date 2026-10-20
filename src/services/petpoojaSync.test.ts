/**
 * petpoojaSync.ts — checkAndAutoSyncMenu honesty contract.
 *
 * The hourly auto-sync gate answers "is this branch's menu stale and did we
 * refresh it?". Real defects fixed here:
 * 1. The staleness reading came from `docs[0]` of an UNORDERED `where` query —
 *    an arbitrary document returned first, not the branch's actual state. The
 *    menu is as fresh as its LEAST-recently-synced item, so the OLDEST valid
 *    `lastSyncedAt` (reduced over all docs; missing/corrupt stamps count as
 *    unknown sync time and are ignored; zero valid stamps ⇒ sync) is the
 *    honest input.
 * 2. A Firestore read (or sync) failure was swallowed into `false` —
 *    indistinguishable from "menu fresh, no sync needed". The single
 *    consumer (useMenu.ts) has its own catch that logs, so the check
 *    surfaces the real error instead of a fake healthy answer.
 * 3. The gate's DECISION is pinned together with its ACTION: every path that
 *    answers "stale/empty/unknown" must have actually committed the sync
 *    batch, and every "fresh" path must not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkAndAutoSyncMenu } from './petpoojaSync';

const firestoreState = vi.hoisted(() => ({
  getDocsImpl: vi.fn(),
  commitImpl: vi.fn(async () => undefined),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args: unknown[]) => args),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    commit: () => firestoreState.commitImpl(),
  })),
  doc: vi.fn(),
  getDocs: () => firestoreState.getDocsImpl(),
  Timestamp: {
    now: vi.fn(() => ({ toMillis: () => Date.now(), toDate: () => new Date() })),
  },
}));

vi.mock('@/core/integrations/petpooja', () => ({
  petpoojaGateway: {
    implementation: 'mock',
  },
}));

function docsFrom(items: Array<{ id: string; lastSyncedAt?: { toMillis: () => number } }>) {
  return items.map((i) => ({ id: i.id, data: () => i }));
}

describe('checkAndAutoSyncMenu — oldest-wins staleness (no arbitrary docs[0])', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreState.commitImpl.mockClear();
  });

  it('syncs when at least one item is stale even if another item was just re-stamped', async () => {
    // Repro for the docs[0] defect: an unordered where-only query returned a
    // freshly-stamped doc first, so a branch whose OLDEST product was synced
    // over an hour ago read as fresh forever. Mock order: fresh first, stale
    // second — exactly the packet order that hid staleness.
    const HOUR = 1000 * 60 * 60;
    firestoreState.getDocsImpl.mockResolvedValueOnce({
      empty: false,
      docs: docsFrom([
        { id: 'a', lastSyncedAt: { toMillis: () => Date.now() - 1000 } },
        { id: 'b', lastSyncedAt: { toMillis: () => Date.now() - 2 * HOUR } },
      ]),
    });
    await expect(checkAndAutoSyncMenu('branch-a')).resolves.toBe(true);
    // The decision must be followed by the action: the sync batch committed.
    expect(firestoreState.commitImpl).toHaveBeenCalledTimes(1);
  });

  it('leaves a fully fresh menu alone and does not spuriously sync or commit', async () => {
    firestoreState.getDocsImpl.mockResolvedValueOnce({
      empty: false,
      docs: docsFrom([
        { id: 'a', lastSyncedAt: { toMillis: () => Date.now() - 1000 } },
        { id: 'b', lastSyncedAt: { toMillis: () => Date.now() - 1000 * 60 * 30 } },
      ]),
    });
    await expect(checkAndAutoSyncMenu('branch-a')).resolves.toBe(false);
    expect(firestoreState.commitImpl).not.toHaveBeenCalled();
  });

  it('syncs when products exist but carry no lastSyncedAt stamps', async () => {
    firestoreState.getDocsImpl.mockResolvedValueOnce({
      empty: false,
      docs: docsFrom([{ id: 'a' }, { id: 'b' }]),
    });
    await expect(checkAndAutoSyncMenu('branch-a')).resolves.toBe(true);
    expect(firestoreState.commitImpl).toHaveBeenCalledTimes(1);
  });

  it('mixed valid and invalid stamps: corrupt stamps are ignored, valid ones decide', async () => {
    // A doc whose stamp lacks toMillis, and one whose stamp reads NaN, must
    // count as UNKNOWN sync time — they cannot make the branch look fresh.
    const fresh = docsFrom([{ id: 'a', lastSyncedAt: { toMillis: () => Date.now() - 1000 } }]);
    firestoreState.getDocsImpl.mockResolvedValueOnce({
      empty: false,
      docs: [...fresh, { id: 'b', data: () => ({ id: 'b', lastSyncedAt: {} }) }],
    });
    await expect(checkAndAutoSyncMenu('branch-a')).resolves.toBe(false);
    expect(firestoreState.commitImpl).not.toHaveBeenCalled();

    firestoreState.getDocsImpl.mockResolvedValueOnce({
      empty: false,
      docs: [
        ...fresh,
        { id: 'b', data: () => ({ id: 'b', lastSyncedAt: { toMillis: () => NaN } }) },
      ],
    });
    await expect(checkAndAutoSyncMenu('branch-a')).resolves.toBe(false);
    expect(firestoreState.commitImpl).not.toHaveBeenCalled();
  });

  it('zero VALID stamps even when stamp fields exist ⇒ sync (unknown ≠ fresh)', async () => {
    firestoreState.getDocsImpl.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'a', data: () => ({ lastSyncedAt: '2026-10-20' }) }],
    });
    await expect(checkAndAutoSyncMenu('branch-a')).resolves.toBe(true);
    expect(firestoreState.commitImpl).toHaveBeenCalledTimes(1);
  });

  it('syncs when the branch has no products at all', async () => {
    firestoreState.getDocsImpl.mockResolvedValueOnce({ empty: true, docs: [] });
    await expect(checkAndAutoSyncMenu('branch-a')).resolves.toBe(true);
    expect(firestoreState.commitImpl).toHaveBeenCalledTimes(1);
  });
});

describe('checkAndAutoSyncMenu — failure is surfaced, not read as fresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreState.commitImpl.mockClear();
  });

  it('a Firestore read failure REJECTS with the SAME error (identity preserved)', async () => {
    // Pre-fix this resolved `false` after console.warn — a failure looked
    // identical to a healthy fresh menu for the hourly-sync gate.
    const cause = new Error('Firestore unavailable');
    firestoreState.getDocsImpl.mockRejectedValueOnce(cause);
    await expect(checkAndAutoSyncMenu('branch-a')).rejects.toBe(cause);
  });

  it('a non-Error rejection becomes a branch-identified Error carrying the cause', async () => {
    const cause = { code: 'permission-denied' };
    firestoreState.getDocsImpl.mockRejectedValueOnce(cause);
    const thrown: unknown = await checkAndAutoSyncMenu('branch-a').catch((e) => e);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/branch-a/);
    expect((thrown as Error).cause).toBe(cause);
  });

  it('a sync failure on the empty-branch path also rejects (no silent false)', async () => {
    firestoreState.getDocsImpl.mockResolvedValueOnce({ empty: true, docs: [] });
    firestoreState.commitImpl.mockRejectedValueOnce(new Error('batch commit failed'));
    await expect(checkAndAutoSyncMenu('branch-a')).rejects.toThrow(/batch commit failed/);
  });
});
