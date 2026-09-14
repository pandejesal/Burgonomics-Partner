import React from 'react';
import type { BranchStats } from '@/hooks/useAnalytics';
import { DollarSign, ShieldCheck, Building, Store, ArrowUpRight, CheckCircle2 } from 'lucide-react';

interface RoyaltyLedgerProps {
  branches: BranchStats[];
  totalRevenue: number;
  brandRoyalty: number;
  netBranchPayout: number;
}

export function RoyaltyLedger({
  branches,
  totalRevenue,
  brandRoyalty,
  netBranchPayout,
}: RoyaltyLedgerProps) {
  return (
    <div className="bg-surface rounded-2xl border border-border p-6 shadow-xl space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-surface-hover text-accent-light border border-border">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-base tracking-wide">
                Razorpay Route Royalty Split Ledger
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-accent/20 text-accent-light border border-accent/40 uppercase">
                5% Brand Model
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Automated payment splits at transaction capture — 5% Brand fee retained, 95% Net to Branch Linked Accounts
            </p>
          </div>
        </div>

        {/* Quick Summary Pill */}
        <div className="flex items-center gap-2 bg-bg p-1.5 rounded-xl border border-border text-xs">
          <div className="px-3 py-1 bg-surface-hover text-emerald-400 rounded-lg font-bold">
            Brand (5%): ₹{brandRoyalty.toLocaleString()}
          </div>
          <div className="px-3 py-1 text-zinc-300 font-bold">
            Outlets (95%): ₹{netBranchPayout.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
              <th className="pb-3 pl-2">Branch Outlet</th>
              <th className="pb-3">Razorpay Linked Acc</th>
              <th className="pb-3 text-right">Gross Sales (100%)</th>
              <th className="pb-3 text-right text-purple-400">Brand Royalty (5%)</th>
              <th className="pb-3 text-right text-emerald-400">Net Branch (95%)</th>
              <th className="pb-3 text-right">Orders / AOV</th>
              <th className="pb-3 pr-2 text-center">Split Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#234B2A]/60">
            {branches.map((b) => (
              <tr key={b.branchId} className="hover:bg-[#16301B] transition-colors">
                <td className="py-3.5 pl-2">
                  <div className="font-bold text-white text-xs">{b.branchName}</div>
                  <div className="text-[10px] text-zinc-400">{b.city} • ID: {b.branchId}</div>
                </td>

                <td className="py-3.5">
                  <div className="flex items-center gap-1.5 font-mono text-zinc-300">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{b.linkedAccountId}</span>
                  </div>
                  <span className="inline-block text-[9px] font-bold text-emerald-400 uppercase">
                    ✓ KYC Verified
                  </span>
                </td>

                <td className="py-3.5 text-right font-mono font-bold text-white">
                  ₹{b.revenue.toLocaleString()}
                </td>

                <td className="py-3.5 text-right font-mono font-bold text-purple-400">
                  ₹{b.brandRoyalty.toLocaleString()}
                </td>

                <td className="py-3.5 text-right font-mono font-bold text-emerald-400">
                  ₹{b.netBranchPayout.toLocaleString()}
                </td>

                <td className="py-3.5 text-right font-mono text-zinc-300">
                  <div>{b.orders} orders</div>
                  <div className="text-[10px] text-zinc-400">₹{b.averageOrderValue} avg</div>
                </td>

                <td className="py-3.5 pr-2 text-center">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Route Settled</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-bold text-xs text-white">
              <td className="pt-3.5 pl-2">Network Totals</td>
              <td className="pt-3.5 text-zinc-400 font-normal">{branches.length} Outlets Linked</td>
              <td className="pt-3.5 text-right font-mono text-accent-light">₹{totalRevenue.toLocaleString()}</td>
              <td className="pt-3.5 text-right font-mono text-purple-400">₹{brandRoyalty.toLocaleString()}</td>
              <td className="pt-3.5 text-right font-mono text-emerald-400">₹{netBranchPayout.toLocaleString()}</td>
              <td className="pt-3.5 text-right font-mono text-zinc-300">
                {branches.reduce((s, b) => s + b.orders, 0)} orders
              </td>
              <td className="pt-3.5 pr-2 text-center text-emerald-400 text-[10px]">100% Reconciled</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footnote */}
      <div className="p-3 bg-bg rounded-xl border border-border flex items-center justify-between text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          <Store className="w-3.5 h-3.5 text-accent-light" />
          <span>Razorpay Route escrows and auto-splits payouts daily at T+1 cutoff with 0 manual transfer overhead.</span>
        </span>
        <span className="font-mono text-emerald-400 font-bold">Route v2 API Active</span>
      </div>
    </div>
  );
}

export default RoyaltyLedger;
