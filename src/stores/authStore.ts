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
  loginAsRole: (
    role: UserRole,
    branchIds?: string[],
    name?: string,
    email?: string
  ) => void;
  signOut: () => Promise<void>;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: {
    id: 'user_brand_01',
    name: 'Yash (Brand Owner)',
    email: 'yash@burgonomics.com',
    role: 'brand_owner',
    branchIds: ['branch_surat_01', 'branch_ahmedabad_01'],
    cityIds: ['Surat', 'Ahmedabad', 'Vadodara', 'Mumbai'],
    phone: '+91 98765 43210',
    createdAt: Timestamp.now(),
  },
  firebaseUser: null,
  loading: false,
  error: null,

  signIn: async (email: string, password: string) => {
    try {
      set({ error: null, loading: true });
      const result = await signInWithEmailAndPassword(auth, email, password);

      // Load user profile from Firestore
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      if (userDoc.exists()) {
        set({
          user: {
            id: result.user.uid,
            ...userDoc.data(),
          } as User,
          firebaseUser: result.user,
          loading: false,
        });
      } else {
        set({
          user: {
            id: result.user.uid,
            name: email.split('@')[0],
            email,
            role: 'brand_owner',
            branchIds: ['branch_surat_01'],
            cityIds: ['Surat'],
            phone: '+91 98765 00000',
            createdAt: Timestamp.now(),
          },
          firebaseUser: result.user,
          loading: false,
        });
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  loginAsRole: (role: UserRole, branchIds = ['branch_surat_01'], name, email) => {
    const roleNames: Record<UserRole, string> = {
      brand_owner: 'Yash (Brand Owner)',
      developer: 'Alex (Lead Dev Team)',
      support: 'Priya (Support Desk)',
      regional_manager: 'Vikram (Gujarat Manager)',
      branch_owner: 'Sanjay (Surat Outlet Owner)',
      branch_staff: 'Ramesh (Kitchen Chef)',
    };

    set({
      user: {
        id: `user_${role}_01`,
        name: name || roleNames[role] || 'Operator',
        email: email || `${role}@burgonomics.com`,
        role,
        branchIds,
        cityIds: ['Surat', 'Ahmedabad'],
        phone: '+91 98251 00000',
        createdAt: Timestamp.now(),
      },
      loading: false,
      error: null,
    });
  },

  signOut: async () => {
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      console.warn('SignOut firebase notice:', err);
    }
    set({ user: null, firebaseUser: null });
  },

  initialize: () => {
    // Keep initial role session or listen to firebase auth
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          set({
            user: {
              id: firebaseUser.uid,
              ...userDoc.data(),
            } as User,
            firebaseUser,
            loading: false,
          });
        }
      }
    });
  },
}));
