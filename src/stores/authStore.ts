import { create } from 'zustand';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, db } from '@/config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { User } from '@/types';

interface AuthState {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  firebaseUser: null,
  loading: true,
  error: null,

  signIn: async (email: string, password: string) => {
    try {
      set({ error: null });
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
        });
      } else {
        set({ firebaseUser: result.user, loading: false });
      }
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  signOut: async () => {
    await firebaseSignOut(auth);
    set({ user: null, firebaseUser: null });
  },

  initialize: () => {
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
        } else {
          set({ user: null, firebaseUser, loading: false });
        }
      } else {
        set({ user: null, firebaseUser: null, loading: false });
      }
    });
  },
}));
