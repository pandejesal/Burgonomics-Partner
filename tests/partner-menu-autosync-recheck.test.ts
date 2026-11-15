// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * M1 (independent review) — the background auto-sync helper must re-check
 * authorisation AFTER its own awaited read, not only before it.
 *
 * `checkAndAutoSyncMenu` awaits `getDocs` and only then decides to call
 * `syncPetpoojaMenuForBranch`. The hook checked permission before invoking the
 * helper, so a demotion or logout during the helper's own read still sent a
 * privileged sync. `useMenu`'s existing tests cannot see this: they replace the
 * whole helper with a stub, so the window inside it does not exist there.
 *
 * These tests run the REAL `checkAndAutoSyncMenu` and the REAL
 * `syncPetpoojaMenuForBranch`. Only `firebase/firestore`, the Firebase handle,
 * the Petpooja gateway and `partnerFunctionsApi` are faked, so the only thing
 * being measured is whether a live authorisation callback is consulted before
 * the request leaves the client.
 *
 * The oracle is the send itself (`h.sends`): a refused caller must produce ZERO
 * backend sync calls, and the refusal must surface as the existing
 * MENU_SYNC_DENIED_COPY Error rather than resolving as success.
 *
 * Deferral is real in both directions:
 * - Firestore: `getDocs` returns a promise this file resolves by hand, so the
 *   permission flip happens while the read is genuinely outstanding.
 * - Gateway import: `syncPetpoojaMenuForBranch` starts with
 *   `await import("@/core/integrations/petpooja")`. That module factory awaits
 *   a hand-released gate, so the flip happens while the import itself is
 *   outstanding — the placement that a pre-await check would miss.
 */

const h = vi.hoisted(() => {
  const defer = <T,>(): { promise: Promise<T>; resolve: (value: T) => void } => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((settle) => {
      resolve = settle;
    });
    return { promise, resolve };
  };
  return {
    defer,
    /** The outstanding products read, resolved by the test. */
    productsRead: null as null | { promise: Promise<unknown>; resolve: (value: unknown) => void },
    /** Gate the gateway module import is blocked on, or null for immediate. */
    gatewayGate: null as null | Promise<void>,
    gatewayRelease: null as null | (() => void),
    /** Which gateway branch the faked module reports. */
    implementation: 'live' as 'live' | 'mock',
    /** Backend sync requests that actually left the client. */
    sends: [] as string[],
    /** Batch commits executed by the DEV/mock write path. */
    batchCommits: 0,
  };
});

vi.mock('@/config/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => args,
  query: (...args: unknown[]) => args,
  where: vi.fn(),
  doc: vi.fn(),
  writeBatch: () => ({
    set: vi.fn(),
    commit: async () => {
      h.batchCommits += 1;
    },
  }),
  getDocs: () => {
    if (!h.productsRead) throw new Error('test did not arm h.productsRead');
    return h.productsRead.promise;
  },
  Timestamp: { now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }) },
}));

/**
 * The module factory itself awaits the gate, so `await import(...)` inside
 * `syncPetpoojaMenuForBranch` really is pending while the test flips the
 * permission answer. `vi.resetModules()` between tests re-runs this factory, so
 * each case gets its own gate.
 */
vi.mock('@/core/integrations/petpooja', async () => {
  if (h.gatewayGate) await h.gatewayGate;
  return { petpoojaGateway: { implementation: h.implementation } };
});

vi.mock('@/services/partnerFunctionsApi', () => ({
  partnerFunctionsApi: {
    syncPetpoojaMenu: async (branchId: string) => {
      h.sends.push(branchId);
      return { itemCount: 1, categoriesCount: 1 };
    },
  },
}));

type Module = typeof import('@/services/petpoojaSync');
let mod: Module;

const snapshot = (rows: Array<{ id: string; data: Record<string, unknown> }>) => ({
  docs: rows.map((row) => ({ id: row.id, data: () => row.data })),
  empty: rows.length === 0,
  size: rows.length,
});

const HOUR = 1000 * 60 * 60;
const STALE = () => ({ id: 'prd_stale', data: { lastSyncedAt: { toMillis: () => Date.now() - 3 * HOUR } } });
const MISSING_STAMP = () => ({ id: 'prd_unstamped', data: { name: 'Unstamped' } });

beforeEach(async () => {
  h.sends = [];
  h.batchCommits = 0;
  h.implementation = 'live';
  h.gatewayGate = null;
  h.gatewayRelease = null;
  h.productsRead = null;
  vi.resetModules();
  mod = await import('@/services/petpoojaSync');
});

/**
 * Each case is a DIFFERENT reason the helper decides to sync, so the guard is
 * proven to sit in front of every send rather than in front of one branch.
 */
const SYNC_DECISIONS = [
  { label: 'empty catalog', rows: () => [] as ReturnType<typeof STALE>[] },
  { label: 'products with no lastSyncedAt stamp', rows: () => [MISSING_STAMP()] },
  { label: 'stale catalog', rows: () => [STALE()] },
];

describe('checkAndAutoSyncMenu — re-checks authorisation after its own read', () => {
  describe.each(SYNC_DECISIONS)('$label', ({ rows }) => {
    it('a permission change during the products read sends NOTHING', async () => {
      const read = h.defer<unknown>();
      h.productsRead = read;
      let permitted = true;
      const maySync = vi.fn(() => permitted);

      const pending = mod.checkAndAutoSyncMenu('branch_a', { maySync });

      // The helper is now suspended on its own awaited read. This is the exact
      // window the review found: the hook's earlier check has already passed.
      permitted = false;
      read.resolve(snapshot(rows()));

      await expect(pending).rejects.toThrow(/manager action/i);
      expect(h.sends).toEqual([]);
      expect(maySync).toHaveBeenCalled();
    });

    it('a logout during the products read sends NOTHING (callback goes false mid-flight)', async () => {
      const read = h.defer<unknown>();
      h.productsRead = read;
      // Models the store emptying out: the operator is gone by the time the
      // read resolves, so there is no identity to grant anything.
      let signedIn = true;
      const pending = mod.checkAndAutoSyncMenu('branch_a', { maySync: () => signedIn });

      signedIn = false;
      read.resolve(snapshot(rows()));

      await expect(pending).rejects.toThrow(/manager action/i);
      expect(h.sends).toEqual([]);
    });

    it('CONTROL: an operator who stays permitted still syncs exactly once', async () => {
      const read = h.defer<unknown>();
      h.productsRead = read;
      const pending = mod.checkAndAutoSyncMenu('branch_a', { maySync: () => true });

      read.resolve(snapshot(rows()));

      await expect(pending).resolves.toBe(true);
      expect(h.sends).toEqual(['branch_a']);
    });
  });

  it('a refused caller never commits the DEV mock batch either', async () => {
    // The mock write path is a second kind of send. It must be guarded by the
    // same re-check, or a demoted operator in a dev build still rewrites the
    // catalog locally.
    h.implementation = 'mock';
    const read = h.defer<unknown>();
    h.productsRead = read;
    let permitted = true;

    const pending = mod.checkAndAutoSyncMenu('branch_a', { maySync: () => permitted });

    permitted = false;
    read.resolve(snapshot([]));

    await expect(pending).rejects.toThrow(/manager action/i);
    expect(h.batchCommits).toBe(0);
  });
});

describe('syncPetpoojaMenuForBranch — re-checks after its own import awaits', () => {
  it('a permission change while the gateway module is loading sends NOTHING', async () => {
    // `syncPetpoojaMenuForBranch` opens with `await import(...)` and a second
    // await for the flag proxy. A check placed before those awaits would still
    // pass here; only a check immediately before the request catches it.
    const gate = h.defer<void>();
    h.gatewayGate = gate.promise;
    h.gatewayRelease = gate.resolve;

    let permitted = true;
    const pending = mod.syncPetpoojaMenuForBranch('branch_a', { maySync: () => permitted });

    // Flipped while the gateway import is outstanding.
    permitted = false;
    gate.resolve();

    await expect(pending).rejects.toThrow(/manager action/i);
    expect(h.sends).toEqual([]);
  });

  it('a permission change while the API module is loading sends NOTHING', async () => {
    // Same window, one await later: the live branch dynamic-imports the
    // partnerFunctionsApi module before the request.
    let permitted = true;
    const pending = mod.syncPetpoojaMenuForBranch('branch_a', { maySync: () => permitted });

    // No gate: the flip happens on the microtask queue, between the awaits the
    // function performs internally.
    permitted = false;

    await expect(pending).rejects.toThrow(/manager action/i);
    expect(h.sends).toEqual([]);
  });

  it('CONTROL: a permitted caller reaches the backend exactly once', async () => {
    await expect(
      mod.syncPetpoojaMenuForBranch('branch_a', { maySync: () => true }),
    ).resolves.toMatchObject({ itemsSynced: 1, categoriesSynced: 1 });
    expect(h.sends).toEqual(['branch_a']);
  });
});
