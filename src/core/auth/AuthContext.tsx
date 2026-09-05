import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { User, UserRole } from '@/types';
import type { User as FirebaseUser } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import { verifyStaffPin, type StaffPinSession } from './pinHelpers';
import { initPushNotifications } from '@/shared/platform/pushNotifications';

export interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  error: string | null;
  isSessionLocked: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  fastSwitchPin: (pin: string, staffId?: string) => Promise<{ success: boolean; error?: string }>;
  lockSession: () => void;
  unlockSession: (pin: string) => Promise<{ success: boolean; error?: string }>;
  role: UserRole | undefined;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Staff PIN sessions must be provisioned by a SERVER-VERIFIED credential
// (Cloud Function checking a salted hash, returning a Firebase custom token).
// Client-side PIN rosters are not authentication: the bundle is public and
// the toy hash is reversible, so any hardcoded PIN (e.g. a "9999 = owner"
// demo) is a universal backdoor. Until server PINs exist the roster stays
// EMPTY and every PIN fails closed. Do NOT re-add demo PINs here.
const DEFAULT_STAFF_SESSIONS: Record<string, StaffPinSession> = {};

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, firebaseUser, loading, error, signIn, signOut, initialize } = useAuthStore();
  const [isSessionLocked, setIsSessionLocked] = useState(false);
  const [staffSessions, setStaffSessions] = useState<Record<string, StaffPinSession>>(DEFAULT_STAFF_SESSIONS);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (user) {
      initPushNotifications(user);
    }
  }, [user]);

  const fastSwitchPin = async (
    pin: string,
    _staffId?: string
  ): Promise<{ success: boolean; error?: string }> => {
    const session = staffSessions[pin];
    const now = Date.now();

    if (!session) {
      return {
        success: false,
        error: 'Invalid 4-digit PIN. Please verify your staff credentials.',
      };
    }

    const result = verifyStaffPin(session, pin, now);
    setStaffSessions((prev) => ({
      ...prev,
      [pin]: result.session,
    }));

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Provision switch
    useAuthStore.setState({
      user: {
        id: session.staffId,
        name: session.name,
        email: `${session.staffId}@burgonomics.in`,
        role: session.role,
        branchIds: [session.branchId],
        cityIds: ['Surat'],
        phone: '+91 98765 00000',
        createdAt: Timestamp.now(),
      },
      loading: false,
      error: null,
    });

    setIsSessionLocked(false);
    return { success: true };
  };

  const lockSession = () => {
    setIsSessionLocked(true);
  };

  const unlockSession = async (pin: string): Promise<{ success: boolean; error?: string }> => {
    return fastSwitchPin(pin);
  };

  const value: AuthContextType = {
    user,
    firebaseUser,
    loading,
    error,
    isSessionLocked,
    signIn,
    signOut,
    fastSwitchPin,
    lockSession,
    unlockSession,
    role: user?.role,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
