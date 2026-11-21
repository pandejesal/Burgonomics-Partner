import React from 'react';
import { Link } from 'react-router-dom';
import { Users, Phone, ChevronRight } from 'lucide-react';
import type { Customer } from '@/types';

/**
 * Customer directory table.
 *
 * Loyalty is NOT part of the launch (owner decision 2026-11-20: "Loyalty no:
 * hide coins, tiers and points everywhere"). The "Loyalty Tier" column, the
 * "Grill Coins" balance and the "Adjust Coins" action are gone with the
 * programme; the server stopped minting them in the same change, so leaving
 * them on screen would dangle a control over a ledger that can no longer grow.
 * Those values remain on the customer document — this is a display retirement,
 * not a data deletion.
 */
interface CustomerTableProps {
  customers: Customer[];
}

export function CustomerTable({ customers }: CustomerTableProps) {
  if (customers.length === 0) {
    return (
      <div className="text-center py-16 bg-neutral-900/40 rounded-3xl border border-dashed border-neutral-800 p-8">
        <Users className="w-10 h-10 mx-auto text-neutral-600 mb-2" />
        <h3 className="font-bold text-white text-base">No Customer Records Found</h3>
        <p className="text-xs text-neutral-500 mt-1">
          No customer profiles match your search or segment filter — or your
          role cannot view this directory (customer records are brand-visible;
          branch roles see an empty list).
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-neutral-800 bg-[#090909] overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-neutral-300">
          <thead className="bg-neutral-900/80 border-b border-neutral-800 text-neutral-400 font-bold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-3.5 px-4">Customer Details</th>
              <th className="py-3.5 px-4 text-right">Lifetime Spend</th>
              <th className="py-3.5 px-4 text-right">Total Orders</th>
              <th className="py-3.5 px-4 text-right">Avg Order Value</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-850">
            {customers.map((c) => {
              const ltv = c.totalSpend || 0;
              const ordersCount = c.totalOrders || 0;
              const aov = c.averageOrderValue || (ordersCount > 0 ? Math.round(ltv / ordersCount) : 0);

              return (
                <tr key={c.id} className="hover:bg-neutral-900/50 transition-colors">
                  {/* Customer Info */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#0E4825] border border-emerald-500/40 text-emerald-300 font-black flex items-center justify-center text-xs shrink-0">
                        {c.name ? c.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div>
                        <Link
                          to={`/customers/${c.id}`}
                          className="font-black text-white text-xs hover:text-[#FF6600] transition-colors block truncate max-w-[160px]"
                        >
                          {c.name}
                        </Link>
                        <a
                          href={`tel:${c.phone}`}
                          className="text-[11px] text-neutral-400 hover:text-emerald-400 flex items-center gap-1 font-mono"
                        >
                          <Phone className="w-2.5 h-2.5" />
                          <span>{c.phone}</span>
                        </a>
                      </div>
                    </div>
                  </td>

                  {/* Lifetime Value */}
                  <td className="py-3 px-4 text-right font-mono font-black text-white text-xs">
                    ₹{ltv.toLocaleString('en-IN')}
                  </td>

                  {/* Total Orders */}
                  <td className="py-3 px-4 text-right font-mono font-bold text-neutral-300 text-xs">
                    {ordersCount}
                  </td>

                  {/* Average Order Value */}
                  <td className="py-3 px-4 text-right font-mono font-bold text-neutral-400 text-xs">
                    ₹{aov.toLocaleString('en-IN')}
                  </td>

                  {/* Action Buttons */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        to={`/customers/${c.id}`}
                        className="p-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white transition-colors"
                        title="View Full 360 Profile"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CustomerTable;
