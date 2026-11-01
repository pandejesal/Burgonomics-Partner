import React, { useState } from 'react';
import type { MonthlyStatementMonth } from '@/hooks/useAnalytics';
import { CalendarRange, Store } from 'lucide-react';

interface MonthlyBranchStatementProps {
  current: MonthlyStatementMonth;
  previous: MonthlyStatementMonth;
}

const money = (value: number | null): string =>
  value == null ? '—' : `₹${value.toLocaleString()}`;

/**
 * Fixed monthly branch fee statement (owner decision 1 Nov 2026). No per-order
 * royalty: Razorpay earnings and cash & counter are shown side by side, with
 * the fixed fee, what has been collected, and the outstanding Due.
 * Fee figures are server-written in `branch_monthly_fees`; a read denial says
 * so instead of rendering a false 0.
 */
export function MonthlyBranchStatement({ current, previous }: MonthlyBranchStatementProps) {
  const [selected, setSelected] = useState<'current' | 'previous'>('current');
  const statement = selected === 'current' ? current : previous;

  const totalRazorpay = statement.summary?.razorpayRevenue ?? statement.rows.reduce((s, r) => s + r.razorpayEarnings, 0);
  const totalCash = statement.summary?.cashRevenue ?? statement.rows.reduce((s, r) => s + r.cashEarnings, 0);
  const totalCourierOnCash = statement.rows.reduce((s, r) => s + r.courierOnCash, 0);
  const totalCollected = statement.available
    ? statement.rows.reduce((s, r) => s + (r.collected ?? 0), 0)
    : null;
  const totalFee = statement.available
    ? statement.rows.reduce((s, r) => s + (r.fee ?? 0), 0)
    : null;
  const totalDue = statement.available
    ? statement.rows.reduce((s, r) => s + (r.due ?? 0), 0)
    : null;

  return (
    <div className="bg-surface rounded-2xl border border-border p-6 shadow-xl space-y-6 select-none">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-surface-hover text-accent-light border border-border">
            <CalendarRange className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base tracking-wide">
              Monthly Branch Statement
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Fixed monthly fee per branch, taken from that branch&apos;s Razorpay earnings. Cash
              &amp; counter is collected at the branch and is not cut automatically.
            </p>
          </div>
        </div>

        <div className="flex gap-1 p-1 bg-bg rounded-xl border border-border text-xs">
          {(['previous', 'current'] as const).map((key) => {
            const month = key === 'current' ? current : previous;
            const active = selected === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  active ? 'bg-accent text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {month.label}
              </button>
            );
          })}
        </div>
      </div>

      {!statement.available && (
        <div role="alert" className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-3 text-xs font-bold text-amber-300">
          Not available for your role
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
              <th className="pb-3 pl-2">Branch Outlet</th>
              <th className="pb-3 text-right text-purple-300">Razorpay Earnings</th>
              <th className="pb-3 text-right text-emerald-300">Cash &amp; Counter</th>
              <th className="pb-3 text-right">Courier on Cash</th>
              <th className="pb-3 text-right">Fee</th>
              <th className="pb-3 text-right">Collected</th>
              <th className="pb-3 pr-2 text-right">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#234B2A]/60">
            {statement.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-zinc-500">
                  No branches in scope for this month.
                </td>
              </tr>
            ) : (
              statement.rows.map((row) => (
                <tr key={row.branchId} className="hover:bg-[#16301B] transition-colors">
                  <td className="py-3.5 pl-2">
                    <div className="font-bold text-white text-xs">{row.branchName}</div>
                    <div className="text-[10px] text-zinc-400">
                      {row.city} • ID: {row.branchId}
                    </div>
                    <div className="text-[9px] font-bold text-text-secondary uppercase">
                      {row.linkedAccountId && row.linkedAccountId !== 'unlinked'
                        ? row.linkedStatus === 'pending'
                          ? 'Link pending'
                          : 'Settlement not measured'
                        : 'Unlinked — no Route split'}
                    </div>
                  </td>
                  <td className="py-3.5 text-right font-mono font-bold text-purple-300">
                    {money(row.razorpayEarnings)}
                  </td>
                  <td className="py-3.5 text-right font-mono font-bold text-emerald-300">
                    {money(row.cashEarnings)}
                  </td>
                  <td className="py-3.5 text-right font-mono text-amber-300">
                    {money(row.courierOnCash)}
                  </td>
                  <td className="py-3.5 text-right font-mono text-zinc-200">
                    {statement.available ? money(row.fee) : 'Not available for your role'}
                  </td>
                  <td className="py-3.5 text-right font-mono text-zinc-200">
                    {statement.available ? money(row.collected) : 'Not available for your role'}
                  </td>
                  <td className="py-3.5 pr-2 text-right font-mono font-bold text-white">
                    {statement.available ? money(row.due) : 'Not available for your role'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-bold text-xs text-white">
              <td className="pt-3.5 pl-2">Network Totals</td>
              <td className="pt-3.5 text-right font-mono text-purple-300">{money(totalRazorpay)}</td>
              <td className="pt-3.5 text-right font-mono text-emerald-300">{money(totalCash)}</td>
              <td className="pt-3.5 text-right font-mono text-amber-300">{money(totalCourierOnCash)}</td>
              <td className="pt-3.5 text-right font-mono text-zinc-200">
                {statement.available ? money(totalFee) : 'Not available for your role'}
              </td>
              <td className="pt-3.5 text-right font-mono text-zinc-200">
                {statement.available ? money(totalCollected) : 'Not available for your role'}
              </td>
              <td className="pt-3.5 pr-2 text-right font-mono text-accent-light">
                {statement.available ? money(totalDue) : 'Not available for your role'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="p-3 bg-bg rounded-xl border border-border text-[11px] text-zinc-400 space-y-1">
        <p className="flex items-center gap-1.5">
          <Store className="w-3.5 h-3.5 text-accent-light shrink-0" />
          <span>
            Cash &amp; counter is collected at the branch. The brand paid every courier, so
            Courier on cash is owed by the branch — it is shown here and not deducted
            automatically.
          </span>
        </p>
        <p className="font-mono text-text-secondary">
          Due = Fee − Collected. Nothing rolls into next month, so no month takes more than the
          fixed fee.
        </p>
      </div>
    </div>
  );
}

export default MonthlyBranchStatement;
