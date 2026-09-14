import React from 'react';
import { CreditCard, DollarSign, Lock, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

interface RazorpayRouteAccountCardProps {
  accountId: string;
  onChange: (accountId: string) => void;
  brandRoyaltyPercent?: number;
  isSuperAdmin?: boolean;
  disabled?: boolean;
}

export function RazorpayRouteAccountCard({
  accountId,
  onChange,
  brandRoyaltyPercent = 5.0,
  isSuperAdmin = true,
  disabled = false,
}: RazorpayRouteAccountCardProps) {
  const isLinked = !!accountId && accountId.startsWith('acc_');
  const franchiseSharePercent = (100 - brandRoyaltyPercent).toFixed(1);

  return (
    <div className="p-4 bg-[#0A0A0A] border border-[#1E3A24] rounded-2xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#0E4825] text-[#4ADE80] border border-[#4ADE80]/30">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Razorpay Route Franchise Split</h4>
            <p className="text-[10px] text-zinc-400">
              Automated escrow settlement and franchise royalty deductions
            </p>
          </div>
        </div>

        {isLinked ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Route Linked</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
            <AlertCircle className="w-3 h-3 text-amber-400" />
            <span>Unlinked</span>
          </span>
        )}
      </div>

      {/* Account Input */}
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-zinc-300">
          Razorpay Linked Account ID (acc_xxxx)
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="acc_Rzp_Surat_01"
            value={accountId}
            disabled={!isSuperAdmin || disabled}
            onChange={(e) => onChange(e.target.value.trim())}
            className="w-full px-3 py-2 text-xs bg-[#112415] border border-[#1E3A24] rounded-xl text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-[#4ADE80] disabled:opacity-60 disabled:cursor-not-allowed"
          />
          {!isSuperAdmin && (
            <div className="absolute right-3 top-2.5 flex items-center gap-1 text-[10px] text-zinc-500">
              <Lock className="w-3 h-3" />
              <span>Admin Only</span>
            </div>
          )}
        </div>
      </div>

      {/* Royalty Split Breakdown */}
      <div className="grid grid-cols-2 gap-2 p-2.5 bg-[#112415] rounded-xl border border-[#1E3A24] text-[10px]">
        <div>
          <div className="text-zinc-400">Brand Royalty Cut:</div>
          <div className="font-bold font-mono text-[#FF6600] mt-0.5">
            {brandRoyaltyPercent.toFixed(1)}% (Auto Deducted)
          </div>
        </div>

        <div>
          <div className="text-zinc-400">Franchise Net Payout:</div>
          <div className="font-bold font-mono text-[#4ADE80] mt-0.5">
            {franchiseSharePercent}% (Direct Bank Transfer)
          </div>
        </div>
      </div>
    </div>
  );
}

export default RazorpayRouteAccountCard;
