import React from 'react';
import { CreditCard, Lock, CheckCircle2, AlertCircle } from 'lucide-react';

interface RazorpayRouteAccountCardProps {
  accountId: string;
  onChange: (accountId: string) => void;
  /** Fixed monthly branch fee in rupees (0 = no fee). */
  monthlyFee?: number;
  onMonthlyFeeChange?: (monthlyFee: number) => void;
  /** Brand roles only; branch roles see the fee read-only. */
  canEditMonthlyFee?: boolean;
  isSuperAdmin?: boolean;
  disabled?: boolean;
}

/**
 * Razorpay Route linked-account ids are `acc_` + the account suffix
 * (alphanumerics; real ids are 14 chars, kept >=6 here so a future length
 * change cannot reject valid ids). A bare "acc_" or arbitrary text must never
 * count as linked: the branch config would persist it and the Route transfer
 * would then fail at the gateway (transfer.failed parked for review).
 * Note: underscores are rejected on purpose — real ids are alphanumeric
 * (`acc_00000000000001`); the repo's `acc_Rzp_Surat_01` fixtures are demo
 * data, and `useAnalytics` already refuses to treat them as real accounts.
 */
const ROUTE_ACCOUNT_ID_PATTERN = /^acc_[A-Za-z0-9]{6,}$/;

export function normalizeRouteAccountId(raw: string): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

export function isValidRouteAccountId(raw: string): boolean {
  return ROUTE_ACCOUNT_ID_PATTERN.test(normalizeRouteAccountId(raw));
}

export function RazorpayRouteAccountCard({
  accountId,
  onChange,
  monthlyFee = 2500,
  onMonthlyFeeChange,
  canEditMonthlyFee = true,
  isSuperAdmin = true,
  disabled = false,
}: RazorpayRouteAccountCardProps) {
  const normalizedAccountId = normalizeRouteAccountId(accountId);
  const isLinked = isValidRouteAccountId(normalizedAccountId);
  const showFormatError = normalizedAccountId.length > 0 && !isLinked;
  const fee = Number.isFinite(monthlyFee) && monthlyFee >= 0 ? monthlyFee : 2500;

  return (
    <div className="p-4 bg-[#0A0A0A] border border-[#1E3A24] rounded-2xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#0E4825] text-[#4ADE80] border border-[#4ADE80]/30">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Razorpay Route Settlement</h4>
            <p className="text-[10px] text-zinc-400">
              Linked account and the fixed monthly branch fee — no per-order split
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
        <label
          htmlFor="razorpay-route-account-id"
          className="block text-[11px] font-semibold text-zinc-300"
        >
          Razorpay Linked Account ID (acc_xxxx)
        </label>
        <div className="relative">
          <input
            id="razorpay-route-account-id"
            type="text"
            placeholder="acc_RzpSurat01"
            value={normalizedAccountId}
            disabled={!isSuperAdmin || disabled}
            aria-invalid={showFormatError}
            aria-describedby={showFormatError ? "route-account-id-error" : undefined}
            onChange={(e) => onChange(normalizeRouteAccountId(e.target.value))}
            className="w-full px-3 py-2 text-xs bg-[#112415] border border-[#1E3A24] rounded-xl text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-[#4ADE80] disabled:opacity-60 disabled:cursor-not-allowed"
          />
          {!isSuperAdmin && (
            <div className="absolute right-3 top-2.5 flex items-center gap-1 text-[10px] text-zinc-500">
              <Lock className="w-3 h-3" />
              <span>Admin Only</span>
            </div>
          )}
        </div>
        {showFormatError && (
          <p id="route-account-id-error" className="text-[10px] text-amber-400" role="alert">
            This does not look like a Razorpay Route account id (acc_ + at least 6 letters or
            digits). Check it in the Razorpay dashboard before saving — payouts to an unlinked
            branch fail.
          </p>
        )}
      </div>

      {/* Fixed monthly fee */}
      <div className="space-y-1">
        <label
          htmlFor="monthly-branch-fee"
          className="block text-[11px] font-semibold text-zinc-300"
        >
          Monthly Branch Fee (₹)
        </label>
        <div className="relative">
          <input
            id="monthly-branch-fee"
            type="number"
            min={0}
            step={50}
            value={fee}
            disabled={!canEditMonthlyFee || disabled}
            onChange={(e) => {
              const next = Number(e.target.value);
              onMonthlyFeeChange?.(Number.isFinite(next) && next >= 0 ? next : 0);
            }}
            className="w-full px-3 py-2 text-xs bg-[#112415] border border-[#1E3A24] rounded-xl text-white font-mono focus:outline-none focus:border-[#4ADE80] disabled:opacity-60 disabled:cursor-not-allowed"
          />
          {!canEditMonthlyFee && (
            <div className="absolute right-3 top-2.5 flex items-center gap-1 text-[10px] text-zinc-500">
              <Lock className="w-3 h-3" />
              <span>Brand-only field</span>
            </div>
          )}
        </div>
        <p className="text-[10px] text-zinc-400 leading-relaxed">
          The first ₹{fee.toLocaleString()} of Razorpay money each month stays with the brand.
          After that, each order goes to the branch in full.
        </p>
      </div>
    </div>
  );
}

export default RazorpayRouteAccountCard;
