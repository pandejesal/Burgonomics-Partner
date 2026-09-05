import React, { useState, type FormEvent } from 'react';
import { useAuthContext } from '@/core/auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  Sparkles,
  KeyRound,
  Delete,
  Clock,
} from 'lucide-react';

export function LoginPage() {
  const [activeTab, setActiveTab] = useState<'email' | 'pin'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pin, setPin] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { signIn, fastSwitchPin, loading, error } = useAuthContext();
  const navigate = useNavigate();

  // 1. Full Operator Email/Password Submit
  const handleEmailSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError(null);

    if (!email.trim() || !password.trim()) {
      setLocalError('Please enter both your operator email and password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await signIn(email.trim(), password);
      setIsSubmitting(false);
      navigate('/dashboard');
    } catch (err: any) {
      setIsSubmitting(false);
      setLocalError(err.message || 'Authentication failed. Please verify credentials.');
    }
  };

  // 2. 4-Digit Staff PIN Keypad & Submit
  const handleKeypadPress = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setLocalError(null);
      if (nextPin.length === 4) {
        void handlePinSubmit(nextPin);
      }
    }
  };

  const handleKeypadDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setLocalError(null);
  };

  const handleKeypadClear = () => {
    setPin('');
    setLocalError(null);
  };

  const handlePinSubmit = async (enteredPin: string) => {
    if (enteredPin.length !== 4) return;
    setIsSubmitting(true);
    setLocalError(null);

    const result = await fastSwitchPin(enteredPin);
    setIsSubmitting(false);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setLocalError(result.error || 'Invalid 4-digit PIN.');
      setPin('');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4 text-white font-sans antialiased selection:bg-[#FF6600] selection:text-white">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#0E4825] border-2 border-[#1E3A24] flex items-center justify-center font-black text-white text-3xl shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-tr from-[#0E4825] to-[#4ADE80]/20" />
            <span className="relative z-10 text-[#4ADE80]">B</span>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-wide">Burgonomics Partner</h1>
            <p className="text-xs text-zinc-400 mt-1">
              Enterprise Operations, Kitchen KDS & Logistics Console
            </p>
          </div>
        </div>

        {/* Dual Mode Switcher Tabs */}
        <div className="flex rounded-2xl bg-[#112415] border border-[#1E3A24] p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setActiveTab('email');
              setLocalError(null);
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'email'
                ? 'bg-[#0E4825] text-white shadow-md border border-[#4ADE80]/30'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Management Login</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('pin');
              setLocalError(null);
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'pin'
                ? 'bg-[#0E4825] text-white shadow-md border border-[#4ADE80]/30'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 text-[#4ADE80]" />
            <span>Quick Staff PIN</span>
          </button>
        </div>

        {/* Secure Form Card */}
        <div className="bg-[#112415] border border-[#1E3A24] rounded-3xl p-6 shadow-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-[#1E3A24] pb-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-[#4ADE80]">
              <ShieldCheck className="w-4 h-4 text-[#4ADE80]" />
              <span>{activeTab === 'email' ? 'Operator Authentication' : 'Fast PIN Switch'}</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider bg-[#0A0A0A] px-2 py-0.5 rounded-md border border-[#1E3A24]">
              RBAC v2.4
            </span>
          </div>

          {/* Mode 1: Email & Password Form */}
          {activeTab === 'email' && (
            <form onSubmit={handleEmailSubmit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="block text-zinc-300 font-semibold text-xs">Operator Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
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
                <label className="block text-zinc-300 font-semibold text-xs">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
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
                    className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {(localError || error) && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{localError || error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || isSubmitting}
                className="w-full py-3 bg-[#0E4825] hover:bg-[#155e32] text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-[#4ADE80]/10 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-[#4ADE80]/30"
              >
                {loading || isSubmitting ? (
                  <span>Verifying Identity & Permissions...</span>
                ) : (
                  <>
                    <span>Sign In to Console</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Mode 2: Quick Staff 4-Digit PIN with Onscreen Touch Keypad */}
          {activeTab === 'pin' && (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <div className="flex justify-center gap-3">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`w-12 h-14 rounded-2xl border flex items-center justify-center text-xl font-mono transition-all ${
                        pin[idx]
                          ? 'border-[#4ADE80] bg-[#0E4825]/40 text-[#4ADE80] shadow-sm shadow-[#4ADE80]/20 font-bold'
                          : 'border-[#1E3A24] bg-[#0A0A0A] text-zinc-600'
                      }`}
                    >
                      {pin[idx] ? '●' : '○'}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-400">
                  Enter your 4-digit staff PIN for instant counter / kitchen handoff.
                </p>
              </div>

              {(localError || error) && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center justify-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{localError || error}</span>
                </div>
              )}

              {/* Onscreen 10-Key Touch Keypad */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handleKeypadPress(digit)}
                    disabled={isSubmitting}
                    className="h-12 bg-[#0A0A0A] hover:bg-[#162E1B] active:bg-[#0E4825] border border-[#1E3A24] rounded-2xl text-lg font-bold text-white transition-all flex items-center justify-center cursor-pointer shadow-sm"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleKeypadClear}
                  disabled={isSubmitting}
                  className="h-12 bg-[#0A0A0A] hover:bg-[#1f1212] border border-[#1E3A24] rounded-2xl text-xs font-bold text-zinc-400 hover:text-rose-400 transition-all flex items-center justify-center cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  disabled={isSubmitting}
                  className="h-12 bg-[#0A0A0A] hover:bg-[#162E1B] active:bg-[#0E4825] border border-[#1E3A24] rounded-2xl text-lg font-bold text-white transition-all flex items-center justify-center cursor-pointer shadow-sm"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleKeypadDelete}
                  disabled={isSubmitting}
                  className="h-12 bg-[#0A0A0A] hover:bg-[#1f1212] border border-[#1E3A24] rounded-2xl text-xs font-bold text-zinc-400 hover:text-amber-400 transition-all flex items-center justify-center cursor-pointer"
                >
                  <Delete className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[11px] text-zinc-500 text-center">
                PIN sign-in is enabled by your administrator. Contact them if you do not have a PIN.
              </p>
            </div>
          )}

        </div>

        {/* RBAC Security Note */}
        <div className="p-4 rounded-2xl bg-[#0A0A0A] border border-[#1E3A24] text-[11px] text-zinc-400 space-y-1.5">
          <div className="flex items-center space-x-1.5 font-bold text-zinc-300">
            <Sparkles className="w-3.5 h-3.5 text-[#4ADE80]" />
            <span>Strict Role & Branch Isolation:</span>
          </div>
          <p className="leading-relaxed">
            Your role (<span className="text-[#4ADE80]">Brand Owner</span>,{' '}
            <span className="text-cyan-400">Developer</span>,{' '}
            <span className="text-emerald-400">Support</span>, or{' '}
            <span className="text-amber-400">Branch Owner</span>) is cryptographically verified from
            Firebase ID token custom claims. Branch staff cannot access other outlets or global
            analytics.
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
