import { create } from 'zustand';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, db } from '@/config/firebase';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import type { User, UserRole } from '@/types';

interface AuthState {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  error: string | null;
  /** Visible offline-grace banner text; null when fully online/verified. */
  offlineNotice: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => void;
  clearOfflineNotice: () => void;
}

// Single generic message for ALL sign-in failures — credential mismatch,
// unknown account, and missing operator role read identically, so login is
// not a user-enumeration oracle. Never surface provider err.message.
export const GENERIC_AUTH_ERROR =
  'Invalid email or password, or your account lacks operator access.';

// Offline bootstrap grace: a last-verified profile may stand in while the
// network is unreachable, but only inside this TTL and always with a
// visible banner — never silent trust.
const OFFLINE_GRACE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHED_PROFILE_KEY = 'burg.partner.auth.cachedProfile';

interface CachedProfile {
  profile: Omit<User, 'createdAt'> & { createdAt?: unknown };
  savedAt: number;
}

function readCachedProfile(): User | null {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(CACHED_PROFILE_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedProfile;
    if (!parsed?.profile || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > OFFLINE_GRACE_TTL_MS) return null;
    return { ...parsed.profile, createdAt: Timestamp.now() } as User;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: User): void {
  try {
    if (typeof window === 'undefined') return;
    const { createdAt: _ignored, ...rest } = profile;
    window.localStorage.setItem(
      CACHED_PROFILE_KEY,
      JSON.stringify({ profile: rest, savedAt: Date.now() } satisfies CachedProfile)
    );
  } catch {
    /* quota exceeded or restricted — grace simply unavailable */
  }
}

function clearCachedProfile(): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(CACHED_PROFILE_KEY);
  } catch {
    /* ignore */
  }
}

/** True for network/offline failures as opposed to definitive authz denials. */
export function isTransientAuthError(err: any): boolean {
  const code = String(err?.code || '');
  if (code === 'auth/network-request-failed') return true;
  if (code.includes('unavailable') || code.includes('deadline-exceeded')) return true;
  if (code.includes('network') || code.includes('offline') || code.includes('Failed to fetch')) return true;
  const msg = String(err?.message || '');
  return (
    msg.includes('network') ||
    msg.includes('offline') ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError')
  );
}

const VALID_OPERATOR_ROLES: UserRole[] = [
  'brand_owner',
  'developer',
  'support',
  'regional_manager',
  'branch_owner',
  'branch_staff',
];

// Exported for tests: pins the fail-closed contract (unknown role → null →
// denied login), which no caller may weaken without breaking the suite.
export async function resolveUserProfile(firebaseUser: FirebaseUser): Promise<User | null> {
  try {
    // 1. Check admins collection (Primary administrative registry)
    const adminDocRef = doc(db, 'admins', firebaseUser.uid);
    const adminDocSnap = await getDoc(adminDocRef);

    if (adminDocSnap.exists()) {
      const data = adminDocSnap.data();
      const rawRole = typeof data.role === 'object' ? data.role?.name : data.role;
      // Fail closed: a missing or unrecognized role must NEVER resolve to a
      // privileged role. Returning null denies login (signIn throws, bootstrap
      // signs out) instead of silently escalating typos like 'Branch_Owner'
      // — or 'customer' — to superadmin.
      if (typeof rawRole !== 'string' || !VALID_OPERATOR_ROLES.includes(rawRole as UserRole)) {
        console.warn(`[auth] Denying login: unrecognized operator role "${String(rawRole)}"`);
        return null;
      }
      const role = rawRole as UserRole;

      const branchIds: string[] = Array.isArray(data.branchIds)
        ? data.branchIds
        : data.assignedStoreId
        ? [data.assignedStoreId]
        : data.branchId
        ? [data.branchId]
        : [];

      const cityIds: string[] = Array.isArray(data.cityIds)
        ? data.cityIds
        : data.city
        ? [data.city]
        : ['Surat', 'Ahmedabad'];

      return {
        id: firebaseUser.uid,
        name: data.fullName || data.name || firebaseUser.email?.split('@')[0] || 'Administrator',
        email: firebaseUser.email || data.email || '',
        role,
        branchIds,
        cityIds,
        phone: data.phone || '',
        avatar: data.avatar || undefined,
        createdAt: data.createdAt || Timestamp.now(),
      };
    }

    // 2. Check users collection (Branch staff / operators)
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      // Unwrap {name}-shaped roles and reject non-strings, mirroring the
      // admins-doc path: a malformed role must deny, never escalate.
      const rawRole = typeof data.role === 'object' ? (data.role as any)?.name : data.role;
      const role = rawRole as UserRole;

      // Ensure user is an authorized operator, not a generic customer
      if (typeof rawRole === 'string' && VALID_OPERATOR_ROLES.includes(role) && (rawRole as string) !== 'customer') {
        const branchIds: string[] = Array.isArray(data.branchIds)
          ? data.branchIds.filter((b): b is string => typeof b === 'string')
          : typeof data.branchId === 'string'
          ? [data.branchId]
          : [];

        const cityIds: string[] = Array.isArray(data.cityIds)
          ? data.cityIds
          : data.city
          ? [data.city]
          : ['Surat'];

        return {
          id: firebaseUser.uid,
          name: data.name || data.fullName || firebaseUser.email?.split('@')[0] || 'Operator',
          email: firebaseUser.email || data.email || '',
          role,
          branchIds,
          cityIds,
          phone: data.phone || '',
          avatar: data.avatar || undefined,
          createdAt: data.createdAt || Timestamp.now(),
        };
      }
    }

    // 3. Check custom claims on token
    const tokenResult = await firebaseUser.getIdTokenResult();
    const rawTokenRole =
      typeof tokenResult.claims.role === 'object'
        ? (tokenResult.claims.role as any)?.name
        : tokenResult.claims.role;
    const tokenRole = rawTokenRole as UserRole;
    // A string-shaped branchIds claim ("branch_x") used to pass the cast and
    // break `in` queries downstream (string slice / per-character match).
    const claimBranchIds = tokenResult.claims.branchIds;
    const claimCityIds = tokenResult.claims.cityIds;
    if (typeof rawTokenRole === 'string' && VALID_OPERATOR_ROLES.includes(tokenRole) && (rawTokenRole as string) !== 'customer') {
      return {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Operator',
        email: firebaseUser.email || '',
        role: tokenRole,
        branchIds: Array.isArray(claimBranchIds)
          ? claimBranchIds.filter((b): b is string => typeof b === 'string')
          : typeof claimBranchIds === 'string'
          ? [claimBranchIds]
          : [],
        cityIds: Array.isArray(claimCityIds)
          ? claimCityIds.filter((c): c is string => typeof c === 'string')
          : typeof claimCityIds === 'string'
          ? [claimCityIds]
          : ['Surat'],
        phone: '',
        createdAt: Timestamp.now(),
      };
    }

    return null;
  } catch (err) {
    // Transient (offline) failures are NOT denials: rethrow so callers can
    // apply offline grace instead of signing the user out. Anything else is
    // a definitive fail-closed denial.
    if (isTransientAuthError(err)) throw err;
    console.error('Error resolving operator profile from Firestore:', err);
    return null;
  }
}

// Module-level guard: useAuth() runs in several hooks, and without this
// every mount stacked another onAuthStateChanged listener (duplicate
// profile reads per sign-in event). Single registration per page load.
let authListenerRegistered = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  firebaseUser: null,
  loading: true,
  error: null,
  offlineNotice: null,

  clearOfflineNotice: () => set({ offlineNotice: null }),

  signIn: async (email: string, password: string) => {
    try {
      set({ error: null, loading: true, offlineNotice: null });
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);

      // Verify legitimate operator role from Firestore / Auth token
      let profile: User | null;
      try {
        profile = await resolveUserProfile(result.user);
      } catch (err) {
        // Offline during verification: do NOT mint, do NOT sign out an
        // existing session — surface a generic error and keep state.
        if (isTransientAuthError(err)) {
          const prev = get();
          set({
            error: 'Network unavailable. Check your connection and try again.',
            loading: false,
            user: prev.user,
            firebaseUser: prev.firebaseUser ?? result.user,
          });
          throw err;
        }
        throw err;
      }

      if (!profile) {
        await firebaseSignOut(auth);
        clearCachedProfile();
        throw new Error(GENERIC_AUTH_ERROR);
      }

      writeCachedProfile(profile);
      set({
        user: profile,
        firebaseUser: result.user,
        loading: false,
        error: null,
        offlineNotice: null,
      });
    } catch (err: any) {
      // Single generic message for every sign-in failure: no oracle.
      // A preserved session above already set its state; don't clobber it.
      const preserved = get().user !== null && isTransientAuthError(err);
      if (!preserved) {
        set({ error: GENERIC_AUTH_ERROR, loading: false, user: null, firebaseUser: null });
      } else {
        set({ loading: false });
      }
      throw err;
    }
  },

  signOut: async () => {
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      console.warn('SignOut error:', err);
    }
    clearCachedProfile();
    set({ user: null, firebaseUser: null, error: null, loading: false, offlineNotice: null });
  },

  initialize: () => {
    if (authListenerRegistered) return;
    authListenerRegistered = true;
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Force-refresh once per bootstrap so a revoked/downgraded role or
        // disabled account takes effect immediately instead of lingering
        // until the hourly token rotation.
        try {
          await firebaseUser.getIdToken(true);
        } catch {
          // Offline refresh failure — fall through to cached claims.
        }
        let profile: User | null = null;
        let transient = false;
        try {
          profile = await resolveUserProfile(firebaseUser);
        } catch (err) {
          transient = isTransientAuthError(err);
          if (!transient) {
            console.error('Error resolving operator profile from Firestore:', err);
          }
        }
        if (profile) {
          writeCachedProfile(profile);
          set({
            user: profile,
            firebaseUser,
            loading: false,
            error: null,
            offlineNotice: null,
          });
        } else if (transient) {
          // Offline grace: restore the last VERIFIED profile inside its TTL
          // with a visible banner. Expired/absent cache → loading clears
          // with no session (never silent trust, never sign-out loop).
          const cached = readCachedProfile();
          if (cached) {
            set({
              user: cached,
              firebaseUser,
              loading: false,
              error: null,
              offlineNotice:
                'Offline — showing your last verified session. Some actions may be unavailable until reconnected.',
            });
          } else {
            set({ user: null, firebaseUser: null, loading: false, offlineNotice: null });
          }
        } else {
          // Account signed in but lacking partner/admin role
          await firebaseSignOut(auth);
          clearCachedProfile();
          set({
            user: null,
            firebaseUser: null,
            loading: false,
            error: 'Session expired or account lacking operator permissions.',
            offlineNotice: null,
          });
        }
      } else {
        set({ user: null, firebaseUser: null, loading: false });
      }
    });
  },
}));
