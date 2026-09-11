import React from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Coins,
  Phone,
  Mail,
  ChevronRight,
  TrendingUp,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import type { Customer } from '@/types';

interface CustomerTableProps {
  customers: Customer[];
  onOpenCoinsModal: (customer: Customer) => void;
}

export function CustomerTable({ customers, onOpenCoinsModal }: CustomerTableProps) {
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
              <th className="py-3.5 px-4">Loyalty Tier</th>
              <th className="py-3.5 px-4 text-right">Lifetime Spend</th>
              <th className="py-3.5 px-4 text-right">Total Orders</th>
              <th className="py-3.5 px-4 text-right">Avg Order Value</th>
              <th className="py-3.5 px-4 text-center">Grill Coins</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-850">
            {customers.map((c) => {
              const segment = c.segment || 'Regular';
              const ltv = c.totalSpend || 0;
              const ordersCount = c.totalOrders || 0;
              const aov = c.averageOrderValue || (ordersCount > 0 ? Math.round(ltv / ordersCount) : 0);
              const coins = c.loyaltyPoints || 0;

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

                  {/* Loyalty Segment */}
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        segment === 'VIP'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                          : segment === 'New'
                          ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40'
                          : 'bg-neutral-800 text-neutral-300 border-neutral-700'
                      }`}
                    >
                      {segment}
                    </span>
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

                  {/* Grill Coins */}
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center gap-1 font-mono font-black text-amber-400 text-xs bg-amber-950/40 px-2.5 py-1 rounded-xl border border-amber-500/30">
                      <Coins className="w-3 h-3" />
                      <span>{coins}</span>
                    </span>
                  </td>

                  {/* Action Buttons */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenCoinsModal(c)}
                        className="px-2.5 py-1 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-amber-300 hover:text-amber-200 text-[11px] font-bold transition-colors cursor-pointer"
                        title="Adjust Grill Coins"
                      >
                        Adjust Coins
                      </button>

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
