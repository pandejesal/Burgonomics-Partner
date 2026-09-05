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
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => void;
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
      if (!VALID_OPERATOR_ROLES.includes(rawRole as UserRole)) {
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
      const role = data.role as UserRole;

      // Ensure user is an authorized operator, not a generic customer
      if (role && VALID_OPERATOR_ROLES.includes(role) && role !== 'customer') {
        const branchIds: string[] = Array.isArray(data.branchIds)
          ? data.branchIds
          : data.branchId
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
    const tokenRole = tokenResult.claims.role as UserRole;
    if (tokenRole && VALID_OPERATOR_ROLES.includes(tokenRole) && tokenRole !== 'customer') {
      return {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Operator',
        email: firebaseUser.email || '',
        role: tokenRole,
        branchIds: (tokenResult.claims.branchIds as string[]) || [],
        cityIds: (tokenResult.claims.cityIds as string[]) || ['Surat'],
        phone: '',
        createdAt: Timestamp.now(),
      };
    }

    return null;
  } catch (err) {
    console.error('Error resolving operator profile from Firestore:', err);
    return null;
  }
}

// Module-level guard: useAuth() runs in several hooks, and without this
// every mount stacked another onAuthStateChanged listener (duplicate
// profile reads per sign-in event). Single registration per page load.
let authListenerRegistered = false;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  firebaseUser: null,
  loading: true,
  error: null,

  signIn: async (email: string, password: string) => {
    try {
      set({ error: null, loading: true });
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);

      // Verify legitimate operator role from Firestore / Auth token
      const profile = await resolveUserProfile(result.user);

      if (!profile) {
        await firebaseSignOut(auth);
        throw new Error(
          'Access Denied: Your account is not configured with operator privileges. Please contact Brand Administrator.'
        );
      }

      set({
        user: profile,
        firebaseUser: result.user,
        loading: false,
        error: null,
      });
    } catch (err: any) {
      let message = err.message || 'Authentication failed.';
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-email'
      ) {
        message = 'Invalid email or password. Please verify your credentials.';
      }
      set({ error: message, loading: false, user: null, firebaseUser: null });
      throw err;
    }
  },

  signOut: async () => {
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      console.warn('SignOut error:', err);
    }
    set({ user: null, firebaseUser: null, error: null, loading: false });
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
        const profile = await resolveUserProfile(firebaseUser);
        if (profile) {
          set({
            user: profile,
            firebaseUser,
            loading: false,
            error: null,
          });
        } else {
          // Account signed in but lacking partner/admin role
          await firebaseSignOut(auth);
          set({
            user: null,
            firebaseUser: null,
            loading: false,
            error: 'Session expired or account lacking operator permissions.',
          });
        }
      } else {
        set({ user: null, firebaseUser: null, loading: false });
      }
    });
  },
}));
