import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { User, UserRole } from '@/types';
import type { User as FirebaseUser } from 'firebase/auth';
import { exchangePinForCustomToken } from './pinHelpers';
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

// Staff PIN sign-in has NO client-side roster: the bundle is public and any
// hardcoded PIN (e.g. a "9999 = owner" demo) is a universal backdoor.
// The only supported path is a server-verified custom-token exchange
// (Cloud Function checking a salted hash). Until that endpoint exists every
// PIN fails closed — use operator email login. Do NOT re-add demo PINs or
// client-minted sessions here.
const PIN_DISABLED_ERROR =
  'PIN sign-in is disabled: server PIN exchange is not configured. Use operator email login.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, firebaseUser, loading, error, signIn, signOut, initialize } = useAuthStore();
  const [isSessionLocked, setIsSessionLocked] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (user) {
      initPushNotifications(user);
    }
  }, [user]);

  const fastSwitchPin = async (
    _pin: string,
    _staffId?: string
  ): Promise<{ success: boolean; error?: string }> => {
    // Fail-closed: no client-side PIN verification may mint a session.
    // Attempt the server exchange (currently unconfigured → rejects) and
    // surface its generic error. Never fabricate a User here.
    try {
      await exchangePinForCustomToken(_pin, _staffId);
      return { success: false, error: PIN_DISABLED_ERROR };
    } catch (err: any) {
      return { success: false, error: err?.message || PIN_DISABLED_ERROR };
    }
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
