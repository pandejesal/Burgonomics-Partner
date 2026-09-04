import React, { useState, type FormEvent } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Code,
  LifeBuoy,
  Store,
  ArrowRight,
  Sparkles,
  Lock,
  Mail,
} from 'lucide-react';
import type { UserRole } from '@/types';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, loginAsRole, loading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await signIn(email, password);
    navigate('/dashboard');
  };

  const handleRoleQuickLogin = (role: UserRole, branchIds: string[], name: string) => {
    loginAsRole(role, branchIds, name);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#0D0F0D] flex items-center justify-center p-4 text-white">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#D95D0F] flex items-center justify-center font-black text-white text-2xl shadow-xl">
            B
          </div>
          <h1 className="text-2xl font-black text-white tracking-wide">Burgonomics Partner</h1>
          <p className="text-xs text-zinc-400">
            Enterprise Operations, Delivery Sync & Franchise Management
          </p>
        </div>

        {/* Quick Role Selectors for Instant Testing & Ops */}
        <div className="bg-[#132A17] border border-[#234B2A] rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Select Operator Persona to Enter:</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() =>
                handleRoleQuickLogin(
                  'brand_owner',
                  ['branch_surat_01', 'branch_ahmedabad_01'],
                  'Yash (Brand Owner)'
                )
              }
              className="w-full p-3 rounded-xl bg-[#0D0F0D] hover:bg-[#1E3A24] border border-[#234B2A] hover:border-[#D95D0F] transition-all flex items-center justify-between text-left group"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-[#D95D0F]/20 text-[#D95D0F]">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-[#D95D0F]">
                    Brand Owner (Global Admin)
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    Access all outlets, future stores, CRM, tickets & chat
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white" />
            </button>

            <button
              onClick={() =>
                handleRoleQuickLogin('developer', ['branch_surat_01'], 'Alex (Developer Team)')
              }
              className="w-full p-3 rounded-xl bg-[#0D0F0D] hover:bg-[#1E3A24] border border-[#234B2A] hover:border-cyan-500 transition-all flex items-center justify-between text-left group"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-cyan-950 text-cyan-400">
                  <Code className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-cyan-400">
                    Developer Team
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    Resolve bug tickets, configure future stores & POS APIs
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white" />
            </button>

            <button
              onClick={() =>
                handleRoleQuickLogin('support', ['branch_surat_01'], 'Priya (Support Team)')
              }
              className="w-full p-3 rounded-xl bg-[#0D0F0D] hover:bg-[#1E3A24] border border-[#234B2A] hover:border-emerald-500 transition-all flex items-center justify-between text-left group"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-emerald-950 text-emerald-400">
                  <LifeBuoy className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-emerald-400">
                    Support Team
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    Resolve branch tickets, chat with staff & monitor orders
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white" />
            </button>

            <button
              onClick={() =>
                handleRoleQuickLogin(
                  'branch_owner',
                  ['branch_surat_01'],
                  'Sanjay (Surat Branch Owner)'
                )
              }
              className="w-full p-3 rounded-xl bg-[#0D0F0D] hover:bg-[#1E3A24] border border-[#234B2A] hover:border-amber-500 transition-all flex items-center justify-between text-left group"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-amber-950 text-amber-400">
                  <Store className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-amber-400">
                    Surat Branch Owner
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    Scoped strictly to Surat Adajan outlet & customers
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white" />
            </button>
          </div>
        </div>

        {/* Credentials Form (Alternative) */}
        <form
          onSubmit={handleSubmit}
          className="bg-[#132A17] border border-[#234B2A] rounded-2xl p-5 space-y-3 text-xs"
        >
          <div className="text-zinc-400 font-semibold mb-1">Or Sign In with Email Credentials:</div>

          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
              placeholder="operator@burgonomics.com"
            />
          </div>

          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
              placeholder="••••••••"
            />
          </div>

          {error && <div className="text-rose-400 text-xs">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#D95D0F] hover:bg-[#b84d0b] text-white rounded-xl font-bold transition-colors shadow-md disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In with Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
