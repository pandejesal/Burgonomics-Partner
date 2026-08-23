import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export function useAuth() {
  const { user, loading, error, signIn, signOut, initialize } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleSignIn = async (email: string, password: string) => {
    await signIn(email, password);
    if (useAuthStore.getState().user) {
      navigate('/dashboard');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return {
    user,
    loading,
    error,
    signIn: handleSignIn,
    signOut: handleSignOut,
    isAuthenticated: !!user,
    role: user?.role,
  };
}
