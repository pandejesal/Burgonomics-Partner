import React from 'react';
import type { OrderStatus } from '@/types';

interface OrderStatusBadgeProps {
  status: OrderStatus | string;
  className?: string;
}

export function getOrderStatusBadgeMeta(status: OrderStatus | string): {
  label: string;
  className: string;
} {
  const code = (typeof status === 'string' ? status : (status as any)?.code || (status as any)?.label || '').toLowerCase();

  switch (code) {
    case 'pending':
    case 'placed':
      return {
        label: 'New (Placed)',
        className: 'bg-amber-950/80 text-amber-400 border-amber-800/60 animate-pulse',
      };
    case 'accepted':
    case 'confirmed':
      return {
        label: 'Accepted',
        className: 'bg-blue-950/80 text-blue-400 border-blue-800/60',
      };
    case 'preparing':
      return {
        label: 'In Kitchen (KOT)',
        className: 'bg-indigo-950/80 text-indigo-400 border-indigo-800/60',
      };
    case 'ready':
    case 'ready_for_pickup':
      return {
        label: 'Ready for Pickup',
        className: 'bg-yellow-950/80 text-yellow-400 border-yellow-800/60',
      };
    case 'out_for_delivery':
    case 'dispatched':
      return {
        label: 'Out for Delivery',
        className: 'bg-cyan-950/80 text-cyan-400 border-cyan-800/60',
      };
    case 'delivered':
    case 'completed':
      return {
        label: 'Delivered',
        className: 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60',
      };
    case 'cancelled':
    case 'failed':
      return {
        label: 'Cancelled',
        className: 'bg-rose-950/80 text-rose-400 border-rose-800/60',
      };
    default:
      return {
        label: typeof status === 'string' ? status.toUpperCase() : 'ACTIVE',
        className: 'bg-zinc-800 text-zinc-300 border-zinc-700',
      };
  }
}

export function OrderStatusBadge({ status, className = '' }: OrderStatusBadgeProps) {
  const { label, className: badgeClasses } = getOrderStatusBadgeMeta(status);

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider border select-none ${badgeClasses} ${className}`}
    >
      {label}
    </span>
  );
}

export default OrderStatusBadge;
