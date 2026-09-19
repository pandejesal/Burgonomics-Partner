import { useState, type FormEvent } from 'react';
import { useAuthContext } from '@/core/auth/AuthContext';
import { useAuthStore } from '@/stores/authStore';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  WifiOff,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';

// Single generic message for ALL login failures — credential mismatch,
// unknown account, and missing operator role all read identically, so the
// form is not a user-enumeration oracle. Never surface err.message here.
const GENERIC_LOGIN_ERROR =
  'Invalid email or password, or your account lacks operator access.';

const MAX_ATTEMPTS_BEFORE_LOCKOUT = 5;
const BASE_LOCKOUT_MS = 30_000;
const MAX_LOCKOUT_MS = 5 * 60_000;

function lockoutMsFor(failedAttempts: number): number {
  if (failedAttempts < MAX_ATTEMPTS_BEFORE_LOCKOUT) return 0;
  const exp = failedAttempts - MAX_ATTEMPTS_BEFORE_LOCKOUT;
  return Math.min(BASE_LOCKOUT_MS * 2 ** exp, MAX_LOCKOUT_MS);
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  const { signIn, loading } = useAuthContext();
  const offlineNotice = useAuthStore((s) => s.offlineNotice);
  const navigate = useNavigate();

  const lockedRemainingSec =
    lockedUntil != null ? Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000)) : 0;
  const isLocked = lockedRemainingSec > 0;

  const handleEmailSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError(null);

    if (isLocked) {
      setLocalError(`Too many attempts. Try again in ${lockedRemainingSec} second(s).`);
      return;
    }

    if (!email.trim() || !password.trim()) {
      setLocalError('Please enter both your operator email and password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await signIn(email.trim(), password);
      setFailedAttempts(0);
      setLockedUntil(null);
      setIsSubmitting(false);
      navigate('/dashboard');
    } catch {
      // Deliberately generic: see GENERIC_LOGIN_ERROR.
      const nextFailed = failedAttempts + 1;
      setFailedAttempts(nextFailed);
      const lockout = lockoutMsFor(nextFailed);
      if (lockout > 0) {
        setLockedUntil(Date.now() + lockout);
        setLocalError(
          `${GENERIC_LOGIN_ERROR} Too many attempts — try again in ${Math.ceil(lockout / 1000)} second(s).`
        );
      } else {
        setLocalError(GENERIC_LOGIN_ERROR);
      }
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4 text-white font-sans antialiased selection:bg-[#FF6600] selection:text-white">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <Logo size={64} showText={true} className="mx-auto" />
          <div>
            <h1 className="text-2xl font-black text-white tracking-wide">Burgonomics Partner</h1>
            <p className="text-xs text-zinc-400 mt-1">
              Enterprise Operations, Kitchen KDS & Logistics Console
            </p>
          </div>
        </div>

        {/* Offline grace banner — visible, never silent trust */}
        {offlineNotice && (
          <div
            role="status"
            className="p-3 rounded-2xl bg-amber-950/60 border border-amber-800/60 text-amber-300 text-xs flex items-center justify-center gap-1.5"
          >
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{offlineNotice}</span>
          </div>
        )}

        {/* Secure Form Card */}
        <div className="bg-[#112415] border border-[#1E3A24] rounded-3xl p-6 shadow-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-[#1E3A24] pb-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-[#4ADE80]">
              <ShieldCheck className="w-4 h-4 text-[#4ADE80]" />
              <span>Operator Authentication</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider bg-[#0A0A0A] px-2 py-0.5 rounded-md border border-[#1E3A24]">
              RBAC v2.4
            </span>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label htmlFor="operator-email" className="block text-zinc-300 font-semibold text-xs">Operator Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                <input
                  id="operator-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ADE80] focus:ring-1 focus:ring-[#4ADE80] transition-all"
                  placeholder="operator@burgonomics.com"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="operator-password" className="block text-zinc-300 font-semibold text-xs">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                <input
                  id="operator-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ADE80] focus:ring-1 focus:ring-[#4ADE80] transition-all"
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {localError && (
              <div role="alert" className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{localError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || isSubmitting || isLocked}
              className="w-full py-3 bg-[#0E4825] hover:bg-[#155e32] text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-[#4ADE80]/10 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-[#4ADE80]/30"
            >
              {loading || isSubmitting ? (
                <span>Verifying Identity & Permissions...</span>
              ) : isLocked ? (
                <span>Locked — retry in {lockedRemainingSec}s</span>
              ) : (
                <>
                  <span>Sign In to Console</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
