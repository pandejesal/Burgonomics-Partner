import React from 'react';
import type { BranchStats } from '@/hooks/useAnalytics';
import { DollarSign, Store } from 'lucide-react';

interface RoyaltyLedgerProps {
  branches: BranchStats[];
  totalRevenue: number;
  razorpayRevenue: number;
  cashRevenue: number;
}

/**
 * Per-branch earnings, with the two real payment streams side by side.
 * Only the server-stamped `paymentChannel === "razorpay"` marker proves a
 * gateway payment; counter/cash staff-selected tender is not one.
 */
export function RoyaltyLedger({
  branches,
  totalRevenue,
  razorpayRevenue,
  cashRevenue,
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
                Branch Earnings by Payment Stream
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-accent/20 text-accent-light border border-accent/40 uppercase">
                Razorpay + Cash
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Gateway and counter money kept separate — no per-order royalty
            </p>
          </div>
        </div>

        {/* Quick Summary Pill */}
        <div className="flex items-center gap-2 bg-bg p-1.5 rounded-xl border border-border text-xs">
          <div className="px-3 py-1 bg-surface-hover text-purple-300 rounded-lg font-bold">
            Razorpay: ₹{razorpayRevenue.toLocaleString()}
          </div>
          <div className="px-3 py-1 text-emerald-300 font-bold">
            Cash &amp; counter: ₹{cashRevenue.toLocaleString()}
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
              <th className="pb-3 text-right text-purple-300">Razorpay Earnings</th>
              <th className="pb-3 text-right text-emerald-300">Cash &amp; Counter</th>
              <th className="pb-3 text-right">Unpaid Online</th>
              <th className="pb-3 pr-2 text-right">Total Earnings</th>
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
                    <span>{b.linkedAccountId}</span>
                  </div>
                  <span className="inline-block text-[9px] font-bold text-text-secondary uppercase">
                    {b.linkedAccountId && b.linkedAccountId !== 'unlinked'
                      ? b.linkedStatus === 'pending'
                        ? 'Link pending'
                        : 'Settlement not measured'
                      : 'Unlinked — no Route split'}
                  </span>
                </td>

                <td className="py-3.5 text-right font-mono font-bold text-purple-300">
                  ₹{b.razorpayRevenue.toLocaleString()}
                  <div className="text-[10px] font-normal text-zinc-400">{b.razorpayOrders} orders</div>
                </td>

                <td className="py-3.5 text-right font-mono font-bold text-emerald-300">
                  ₹{b.cashRevenue.toLocaleString()}
                  <div className="text-[10px] font-normal text-zinc-400">{b.cashOrders} orders</div>
                </td>

                <td className="py-3.5 text-right font-mono text-zinc-300">
                  {b.unpaidOrders}
                  <div className="text-[10px] text-zinc-400">earn ₹0</div>
                </td>

                <td className="py-3.5 pr-2 text-right font-mono font-bold text-white">
                  ₹{b.revenue.toLocaleString()}
                  <div className="text-[10px] font-normal text-zinc-400">{b.orders} orders</div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-bold text-xs text-white">
              <td className="pt-3.5 pl-2">Network Totals</td>
              <td className="pt-3.5 text-zinc-400 font-normal">
                {branches.filter((b) => b.linkedAccountId && b.linkedAccountId !== 'unlinked').length}{' '}
                Outlets Linked
              </td>
              <td className="pt-3.5 text-right font-mono text-purple-300">
                ₹{razorpayRevenue.toLocaleString()}
              </td>
              <td className="pt-3.5 text-right font-mono text-emerald-300">
                ₹{cashRevenue.toLocaleString()}
              </td>
              <td className="pt-3.5 text-right font-mono text-zinc-300">
                {branches.reduce((s, b) => s + b.unpaidOrders, 0)}
              </td>
              <td className="pt-3.5 pr-2 text-right font-mono text-accent-light">
                ₹{totalRevenue.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footnote */}
      <div className="p-3 bg-bg rounded-xl border border-border flex items-center justify-between text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          <Store className="w-3.5 h-3.5 text-accent-light" />
          <span>
            Cash &amp; counter is collected at the branch; a monthly fee cannot be taken from it
            automatically.
          </span>
        </span>
        <span className="font-mono text-text-secondary font-bold">Settlement not measured</span>
      </div>
    </div>
  );
}

export default RoyaltyLedger;
