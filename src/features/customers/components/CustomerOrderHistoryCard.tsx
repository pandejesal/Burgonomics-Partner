import React from 'react';
import { Link } from 'react-router-dom';
import { Store, Clock, ExternalLink, CheckCircle2, ChevronRight } from 'lucide-react';
import type { Order } from '@/types';

interface CustomerOrderHistoryCardProps {
  order: Order;
}

export function CustomerOrderHistoryCard({ order }: CustomerOrderHistoryCardProps) {
  const shortCode =
    (order as any).shortCode ||
    (order as any).orderNumber ||
    order.id.slice(-6).toUpperCase();

  const isCompleted = order.status === 'delivered';
  const isCancelled = order.status === 'cancelled';

  return (
    <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-3 hover:border-neutral-700 transition-colors text-xs">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono font-black text-sm text-white">#{shortCode}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
              isCancelled
                ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                : isCompleted
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                : 'bg-amber-950/80 text-amber-300 border-amber-500/40'
            }`}
          >
            {order.status}
          </span>
        </div>

        <span className="font-mono font-black text-sm text-white">
          ₹{order.total || order.subtotal || 0}
        </span>
      </div>

      <div className="flex items-center justify-between text-[11px] text-neutral-400">
        <span className="flex items-center gap-1">
          <Store className="w-3 h-3 text-neutral-500" />
          <span>{order.branchId || 'Branch Outlet'}</span>
        </span>
        <span className="uppercase font-semibold">
          {(order as any).fulfillment || order.orderType || 'Delivery'}
        </span>
      </div>

      {order.items && order.items.length > 0 && (
        <div className="space-y-1 text-neutral-300 pt-1 border-t border-neutral-800/60">
          {order.items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-[11px]">
              <span className="truncate max-w-[220px]">
                {item.quantity}x {item.name}
              </span>
              <span className="font-mono text-neutral-400">
                ₹{((item.price || 0) * (item.quantity || 1)).toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-neutral-800 flex items-center justify-end">
        <Link
          to={`/orders/${order.id}`}
          className="text-[#FF6600] font-bold text-xs hover:underline flex items-center gap-1"
        >
          <span>View POS Receipt</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

export default CustomerOrderHistoryCard;
