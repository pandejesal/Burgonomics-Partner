import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F6 / A3 #5 — the offline-grace profile cache must belong to the signed-in UID.
 *
 * The audited defect: `CachedProfile` stored only `{profile, savedAt}`, and the
 * transient-failure path installed the cached profile next to the CURRENT
 * `firebaseUser` with no `cached.profile.id === firebaseUser.uid` check. Sign-out
 * cleared the cache, but an auth transition to a DIFFERENT user without an
 * explicit sign-out did not. A terminal shared by two operators could therefore
 * boot offline into operator A's name, email, phone, role and branchIds under
 * operator B's session — A's PII on B's screen, and A's branch-scoped views.
 */

const h = vi.hoisted(() => {
  const store: Record<string, string> = {};
  const listeners: Array<(user: unknown) => void> = [];
  return {
    store,
    listeners,
    firebaseUser: {
      uid: 'uid_A',
      getIdToken: vi.fn(async () => 'token'),
    } as any,
    results: [] as Array<{ ok: boolean; error?: unknown }>,
  };
});

const KEY = 'burg.partner.auth.cachedProfile';

beforeEach(() => {
  for (const k of Object.keys(h.store)) delete h.store[k];
  h.listeners.length = 0;
  h.results.length = 0;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => h.store[k] ?? null,
      setItem: (k: string, v: string) => {
        h.store[k] = v;
      },
      removeItem: (k: string) => {
        delete h.store[k];
      },
    },
  };
  (globalThis as any).localStorage = (globalThis as any).window.localStorage;
});

afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
  vi.resetModules();
});

const TRANSIENT = () =>
  Object.assign(new Error('network request failed'), { code: 'auth/network-request-failed' });

/**
 * Load the store fresh with a mocked auth/Firestore layer.
 *
 * NOTE: the profile resolver is deliberately NOT stubbed. Spying on the
 * module export cannot intercept the store's own internal call, so a spy
 * silently left the real Firestore path running and made the test lie about
 * what it exercised. Instead the Firestore edge is mocked: `getDoc` either
 * rejects with a transient network error (`online: false`) or resolves the
 * admin document handed in as `docs`. That drives the real
 * `resolveUserProfile` + `isTransientAuthError` path.
 */
async function loadStore(options: {
  currentUid: string;
  online?: boolean;
  docs?: Record<string, any>;
}) {
  vi.doMock('firebase/auth', () => ({
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(async () => undefined),
    onAuthStateChanged: (auth: unknown, cb: (user: any) => void) => {
      h.listeners.push(cb);
      return () => undefined;
    },
    getAuth: () => ({ currentUser: { uid: options.currentUid } }),
  }));
  vi.doMock('@/config/firebase', () => ({ auth: {}, db: {} }));
  vi.doMock('@/core/session/clearAppCaches', () => ({ clearAppCaches: vi.fn() }));
  vi.doMock('firebase/firestore', () => ({
    doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` }),
    getDoc: async (ref: { path: string }) => {
      if (options.online === false) throw TRANSIENT();
      const data = options.docs?.[ref.path];
      if (!data) return { exists: () => false, data: () => undefined };
      return { exists: () => true, data: () => data };
    },
    Timestamp: { now: () => ({ seconds: 1, nanoseconds: 0 }) },
  }));

  return await import('../src/stores/authStore');
}

describe('A3 #5 — a cached profile is only restored for its OWN uid', () => {
  it('restores the cached profile when the uid matches (offline grace still works)', async () => {
    const profile = {
      id: 'uid_A',
      name: 'Operator A',
      email: 'a@example.com',
      phone: '900000001',
      role: 'branch_owner',
      branchIds: ['branch_a'],
      cityIds: [],
    };

    const mod = await loadStore({ currentUid: 'uid_A', online: false });

    // Seed the cache exactly as a successful sign-in would have.
    h.store[KEY] = JSON.stringify({ uid: 'uid_A', profile, savedAt: Date.now() });

    mod.useAuthStore.getState().initialize();
    await h.listeners[0](h.firebaseUser);

    expect(mod.useAuthStore.getState().user?.name).toBe('Operator A');
    expect(mod.useAuthStore.getState().offlineNotice).toMatch(/Offline/i);
  });

  it('REFUSES a cache written for a DIFFERENT uid', async () => {
    const otherProfile = {
      id: 'uid_A',
      name: 'Operator A',
      email: 'a@example.com',
      phone: '900000001',
      role: 'brand_owner',
      branchIds: ['branch_x', 'branch_y'],
      cityIds: [],
    };

    const mod = await loadStore({ currentUid: 'uid_B', online: false });

    // Operator A signed in earlier; operator B now boots offline.
    h.store[KEY] = JSON.stringify({ uid: 'uid_A', profile: otherProfile, savedAt: Date.now() });
    const firebaseB = { uid: 'uid_B', getIdToken: vi.fn(async () => 'token') };

    mod.useAuthStore.getState().initialize();
    await h.listeners[0](firebaseB);

    // B must NOT be rendered with A's identity, privileges or PII.
    expect(mod.useAuthStore.getState().user).toBeNull();
    expect(mod.useAuthStore.getState().offlineNotice).toBeNull();
    expect(mod.useAuthStore.getState().error).toBeNull();
  });

  it('refuses a legacy cache that carries no uid at all (fail closed)', async () => {
    const legacyProfile = {
      id: 'uid_A',
      name: 'Operator A',
      email: 'a@example.com',
      phone: '900000001',
      role: 'brand_owner',
      branchIds: [],
      cityIds: [],
    };

    const mod = await loadStore({ currentUid: 'uid_B', online: false });

    // Old build wrote {profile, savedAt} with no uid.
    h.store[KEY] = JSON.stringify({ profile: legacyProfile, savedAt: Date.now() });

    mod.useAuthStore.getState().initialize();
    await h.listeners[0]({ uid: 'uid_B', getIdToken: vi.fn(async () => 'token') });

    expect(mod.useAuthStore.getState().user).toBeNull();
  });

  it('clears the cache when the auth state becomes null', async () => {
    const mod = await loadStore({
      currentUid: 'uid_A',
      docs: { 'admins/uid_A': { name: 'Operator A', role: 'brand_owner', branchIds: [], cityIds: [] } },
    });

    mod.useAuthStore.getState().initialize();
    await h.listeners[0](h.firebaseUser);
    expect(mod.useAuthStore.getState().user?.name).toBe('Operator A');
    // A successful resolve must have written its OWN uid stamp.
    expect(JSON.parse(h.store[KEY]).uid).toBe('uid_A');

    await h.listeners[0](null);
    expect(h.store[KEY]).toBeUndefined();
    expect(mod.useAuthStore.getState().user).toBeNull();
  });
});
