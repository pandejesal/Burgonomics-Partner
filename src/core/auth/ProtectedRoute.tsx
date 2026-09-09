import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { useAuthContext } from './AuthContext';
import type { UserRole } from '@/types';
import { Spinner } from '@/components/ui/Spinner';
import { Lock, ShieldAlert, KeyRound } from 'lucide-react';
import { canAccessRoute } from './routePolicy';

export interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  children?: ReactNode;
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user, loading, isAuthenticated, isSessionLocked, unlockSession, signOut } = useAuthContext();
  const location = useLocation();
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Session Inactivity Lock Screen Overlay
  if (isSessionLocked) {
    const handleUnlockSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setUnlockError(null);
      if (unlockPin.length !== 4) {
        setUnlockError('Please enter your 4-digit staff PIN.');
        return;
      }

      setIsUnlocking(true);
      const res = await unlockSession(unlockPin);
      setIsUnlocking(false);

      if (!res.success) {
        setUnlockError(res.error || 'Incorrect PIN.');
        setUnlockPin('');
      }
    };

    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4 text-white z-50">
        <div className="w-full max-w-sm bg-[#112415] border border-[#1E3A24] rounded-3xl p-6 shadow-2xl space-y-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#0E4825] border border-[#4ADE80]/30 flex items-center justify-center text-[#4ADE80]">
            <Lock className="w-7 h-7" />
          </div>

          <div>
            <h2 className="text-xl font-black text-white">Terminal Locked</h2>
            <p className="text-xs text-zinc-400 mt-1">
              Sign back in to continue your shift.
            </p>
          </div>

          <form onSubmit={handleUnlockSubmit} className="space-y-4">
            <div className="relative">
              <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
              <input
                type="password"
                maxLength={4}
                value={unlockPin}
                onChange={(e) => setUnlockPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 4-digit PIN"
                className="w-full pl-10 pr-3.5 py-3 bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-center tracking-[0.5em] text-lg font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-[#4ADE80]"
                autoFocus
              />
            </div>

            {unlockError && (
              <div role="alert" className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center justify-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{unlockError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={unlockPin.length !== 4 || isUnlocking}
              className="w-full py-3 bg-[#FF6600] hover:bg-[#CC5200] disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg text-xs cursor-pointer"
            >
              {isUnlocking ? 'Unlocking...' : 'Unlock Terminal'}
            </button>

            <button
              type="button"
              onClick={() => void signOut()}
              className="w-full py-2.5 text-zinc-400 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Sign out instead
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Role Gatekeeper — explicit allowlist wins; otherwise the enforced
  // route policy applies (default-deny, so unlisted routes are NOT open).
  const permitted = allowedRoles
    ? allowedRoles.includes(user.role)
    : canAccessRoute(user.role, location.pathname);
  if (!permitted) {
    // If Kitchen staff tries to access non-KDS routes, send directly to /kds
    if (user.role === 'branch_staff') {
      return <Navigate to="/kds" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export default ProtectedRoute;
