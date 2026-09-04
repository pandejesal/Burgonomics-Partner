import React from 'react';
import { Link } from 'react-router-dom';
import type { Order } from '@/types';

interface RecentOrdersProps {
  orders: any[];
}

const statusColors: Record<string, string> = {
  pending: 'bg-amber-950 text-amber-400 border border-amber-800/60',
  accepted: 'bg-blue-950 text-blue-400 border border-blue-800/60',
  preparing: 'bg-purple-950 text-purple-400 border border-purple-800/60',
  ready: 'bg-emerald-950 text-emerald-400 border border-emerald-800/60',
  out_for_delivery: 'bg-cyan-950 text-cyan-400 border border-cyan-800/60',
  delivered: 'bg-emerald-950 text-emerald-400 border border-emerald-800/60',
  cancelled: 'bg-rose-950 text-rose-400 border border-rose-800/60',
};

export function RecentOrders({ orders }: RecentOrdersProps) {
  const getStatusLabel = (status: any): string => {
    if (!status) return 'Placed';
    if (typeof status === 'string') return status;
    if (typeof status === 'object' && status.label) return status.label;
    if (typeof status === 'object' && status.code) return String(status.code);
    return 'Placed';
  };

  const getStatusCode = (status: any): string => {
    if (!status) return 'pending';
    if (typeof status === 'string') return status.toLowerCase();
    if (typeof status === 'object' && status.code) return String(status.code).toLowerCase();
    return 'pending';
  };

  return (
    <div className="bg-[#132A17] rounded-2xl border border-[#234B2A] shadow-md overflow-hidden text-white">
      <div className="p-4 lg:p-5 border-b border-[#234B2A] flex items-center justify-between">
        <h3 className="font-bold text-white text-sm">Recent Active Orders</h3>
        <Link
          to="/orders"
          className="text-xs text-[#D95D0F] hover:text-[#f27529] font-semibold transition-colors"
        >
          View All Live Orders →
        </Link>
      </div>

      <div className="divide-y divide-[#1E3A24]">
        {orders.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-400">No active orders right now</div>
        ) : (
          orders.map((order) => {
            const statusLabel = getStatusLabel(order.status);
            const statusCode = getStatusCode(order.status);
            const pillClass = statusColors[statusCode] || 'bg-zinc-800 text-zinc-300 border border-zinc-700';

            return (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                className="flex items-center justify-between p-4 hover:bg-[#1E3A24]/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0D0F0D] border border-[#234B2A] flex items-center justify-center font-bold text-xs text-[#D95D0F]">
                    {order.customerName?.charAt(0) || 'B'}
                  </div>
                  <div>
                    <p className="font-bold text-white text-xs">{order.customerName || 'Walk-in Customer'}</p>
                    <p className="text-[11px] text-zinc-400 font-mono">
                      #{String(order.id).slice(-6)} • {order.branchName || 'Surat Adajan'}
                    </p>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <p className="font-bold text-white text-xs">
                    ₹{(order.total || 0).toLocaleString()}
                  </p>
                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${pillClass}`}>
                    {statusLabel}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
