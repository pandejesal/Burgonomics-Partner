import React from 'react';
import { Link } from 'react-router-dom';
import {
  Bike,
  ShoppingBag,
  UtensilsCrossed,
  Printer,
  ChevronRight,
  Clock,
  Send,
  AlertCircle,
} from 'lucide-react';
import { OrderStatusBadge } from './OrderStatusBadge';
import type { Order, OrderStatus } from '@/types';

interface OrderTableListProps {
  orders: Order[];
  onPrintKot?: (order: Order) => void;
  onDispatchPorter?: (orderId: string) => void;
  isLoading?: boolean;
  className?: string;
}

export function OrderTableList({
  orders,
  onPrintKot,
  onDispatchPorter,
  isLoading = false,
  className = '',
}: OrderTableListProps) {
  if (isLoading) {
    return (
      <div className="p-8 text-center text-neutral-400 bg-neutral-900/60 rounded-2xl border border-neutral-800 animate-pulse">
        <Clock className="w-8 h-8 mx-auto mb-2 text-neutral-500 animate-spin" />
        <p className="text-sm font-bold">Loading live orders stream...</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="p-12 text-center text-neutral-400 bg-neutral-900/40 rounded-2xl border border-dashed border-neutral-800">
        <AlertCircle className="w-10 h-10 mx-auto mb-2 text-neutral-600" />
        <p className="text-sm font-bold text-white">No orders matching filter criteria.</p>
        <p className="text-xs text-neutral-500 mt-0.5">Try selecting another channel, status chip, or clearing search query.</p>
      </div>
    );
  }

  const formatTime = (ts: any) => {
    if (!ts) return 'Just now';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950/80 shadow-md ${className}`}>
      <table className="w-full text-left text-xs text-neutral-300 border-collapse">
        <thead className="bg-neutral-900/90 text-neutral-400 font-bold uppercase tracking-wider text-[10px] border-b border-neutral-800">
          <tr>
            <th className="py-3 px-4">Order # & Time</th>
            <th className="py-3 px-4">Customer</th>
            <th className="py-3 px-4">Channel</th>
            <th className="py-3 px-4">Items Summary</th>
            <th className="py-3 px-4">Total</th>
            <th className="py-3 px-4">Payment</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-neutral-850">
          {orders.map((order) => {
            const shortCode =
              (order as any).shortCode ||
              (order as any).orderNumber ||
              order.id.slice(0, 6).toUpperCase();

            const isDelivery = order.orderType === 'delivery';
            const isTakeaway = order.orderType === 'takeaway';
            const isDineIn = order.orderType === 'dinein';

            const itemsSummary =
              order.items && order.items.length > 0
                ? `${order.items[0].quantity}x ${order.items[0].name}${
                    order.items.length > 1 ? ` + ${order.items.length - 1} more` : ''
                  }`
                : 'No items';

            return (
              <tr
                key={order.id}
                className="hover:bg-neutral-900/60 transition-colors group cursor-pointer"
              >
                {/* Order Number & Placed Time */}
                <td className="py-3 px-4 font-mono">
                  <span className="font-black text-white text-sm block">#{shortCode}</span>
                  <span className="text-[11px] text-neutral-500">{formatTime(order.createdAt)}</span>
                </td>

                {/* Customer Details */}
                <td className="py-3 px-4">
                  <p className="font-bold text-white truncate max-w-[140px]">{order.customerName}</p>
                  <p className="font-mono text-[11px] text-neutral-500 truncate max-w-[140px]">
                    {order.customerPhone}
                  </p>
                </td>

                {/* Fulfillment Channel */}
                <td className="py-3 px-4">
                  {isDelivery && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 font-bold text-[10px] uppercase">
                      <Bike className="w-3 h-3" />
                      <span>Delivery</span>
                    </span>
                  )}
                  {isTakeaway && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px] uppercase">
                      <ShoppingBag className="w-3 h-3" />
                      <span>Takeaway</span>
                    </span>
                  )}
                  {isDineIn && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold text-[10px] uppercase">
                      <UtensilsCrossed className="w-3 h-3" />
                      <span>T-{order.tableNumber || '01'}</span>
                    </span>
                  )}
                </td>

                {/* Items Summary */}
                <td className="py-3 px-4 max-w-[200px]">
                  <p className="font-medium text-white truncate">{itemsSummary}</p>
                  <span className="text-[10px] text-neutral-500">
                    {order.items?.length || 0} {order.items?.length === 1 ? 'item' : 'items'}
                  </span>
                </td>

                {/* Total Bill */}
                <td className="py-3 px-4 font-mono font-black text-white text-sm">
                  ₹{order.total || order.subtotal || 0}
                </td>

                {/* Payment Mode */}
                <td className="py-3 px-4">
                  <span className="capitalize font-bold text-[11px] text-neutral-300 block">
                    {order.paymentMethod === 'cod'
                      ? 'Cash'
                      : order.paymentMethod === 'upi'
                      ? 'UPI QR'
                      : 'Card'}
                  </span>
                  <span
                    className={`text-[10px] font-semibold ${
                      order.paymentStatus === 'completed'
                        ? 'text-emerald-400'
                        : order.paymentStatus === 'failed'
                        ? 'text-rose-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {order.paymentStatus === 'completed' ? 'Paid ✓' : 'Pending'}
                  </span>
                </td>

                {/* Order Status Badge */}
                <td className="py-3 px-4">
                  <OrderStatusBadge status={order.status} />
                </td>

                {/* 1-Tap Row Actions */}
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {/* Print KOT */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPrintKot?.(order);
                      }}
                      aria-label={`Print KOT for order ${shortCode}`}
                      className="p-1.5 min-h-[44px] min-w-[44px] grid place-items-center rounded-lg bg-neutral-850 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 transition-colors cursor-pointer"
                      title="Print KOT Thermal Slip"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>

                    {/* Dispatch Porter for delivery */}
                    {isDelivery && order.status === 'ready' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDispatchPorter?.(order.id);
                        }}
                        aria-label={`Dispatch Porter courier for order ${shortCode}`}
                        className="px-2 py-1 min-h-[44px] rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                        title="Dispatch Porter Courier"
                      >
                        <Send className="w-3 h-3" />
                        <span>Porter</span>
                      </button>
                    )}

                    {/* View Details */}
                    <Link
                      to={`/orders/${order.id}`}
                      aria-label={`View full details for order ${shortCode}`}
                      className="p-1.5 min-h-[44px] min-w-[44px] grid place-items-center rounded-lg bg-[#0E4825] hover:bg-[#135d30] text-emerald-300 border border-emerald-500/40 transition-colors cursor-pointer"
                      title="View Full Order Details"
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
  );
}

export default OrderTableList;
