import React from 'react';
import type { OrderStatus } from '@/types';

interface OrderStatusBadgeProps {
  status: OrderStatus;
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  accepted: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  preparing: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  ready: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  out_for_delivery: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
  delivered: 'bg-neutral-500/20 text-neutral-300 border-neutral-500/40',
  cancelled: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
  quarantine: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  quarantine: 'Needs review',
};

/**
 * OrderStatusBadge — presentational status pill. Renders the status it is
 * given (already normalized to Partner `OrderStatus` upstream); invents no
 * state. Quarantined docs read as "Needs review", never as fresh work.
 */
export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border font-bold text-[10px] uppercase tracking-wide ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export default OrderStatusBadge;
