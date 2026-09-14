import React from 'react';
import {
  Clock,
  ChefHat,
  Package,
  Bike,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import type { OrderStatus } from '@/types';

interface OrderStatusStepperProps {
  currentStatus: OrderStatus | string;
  onUpdateStatus: (nextStatus: OrderStatus) => Promise<void> | void;
  isSubmitting?: boolean;
  className?: string;
}

const STEPS: Array<{ key: OrderStatus; label: string; icon: any }> = [
  { key: 'pending', label: 'Placed', icon: Clock },
  { key: 'preparing', label: 'In Kitchen', icon: ChefHat },
  { key: 'ready', label: 'Ready', icon: Package },
  { key: 'out_for_delivery', label: 'Dispatched', icon: Bike },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
];

export function OrderStatusStepper({
  currentStatus,
  onUpdateStatus,
  isSubmitting = false,
  className = '',
}: OrderStatusStepperProps) {
  const normalizedStatus = (currentStatus as string).toLowerCase();
  const isCancelled = normalizedStatus === 'cancelled' || normalizedStatus === 'failed';

  const currentIndex = STEPS.findIndex((s) => s.key === normalizedStatus);
  const effectiveIndex = currentIndex === -1 ? 0 : currentIndex;

  const getNextStatus = (): OrderStatus | null => {
    if (isCancelled || effectiveIndex >= STEPS.length - 1) return null;
    return STEPS[effectiveIndex + 1].key;
  };

  const getPreviousStatus = (): OrderStatus | null => {
    if (isCancelled || effectiveIndex <= 0) return null;
    return STEPS[effectiveIndex - 1].key;
  };

  const nextStatus = getNextStatus();
  const prevStatus = getPreviousStatus();

  return (
    <div className={`p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-wider text-neutral-400">
          Order Status Progression
        </h3>
        {isCancelled && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-400">
            <XCircle className="w-3.5 h-3.5" />
            <span>Order Cancelled</span>
          </span>
        )}
      </div>

      {/* Visual Stepper */}
      <div className="grid grid-cols-5 gap-2 relative">
        {STEPS.map((step, idx) => {
          const isCompleted = !isCancelled && idx <= effectiveIndex;
          const isCurrent = !isCancelled && idx === effectiveIndex;
          const Icon = step.icon;

          return (
            <div key={step.key} className="flex flex-col items-center text-center relative z-10">
              <button
                type="button"
                disabled={isCancelled || isSubmitting}
                onClick={() => onUpdateStatus(step.key)}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-[#FF6600] border-[#FF6600] text-white shadow-md scale-105'
                    : isCompleted
                    ? 'bg-[#0E4825] border-emerald-500/40 text-emerald-300'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <span
                className={`text-[10px] sm:text-xs font-bold mt-1.5 ${
                  isCurrent
                    ? 'text-[#FF6600]'
                    : isCompleted
                    ? 'text-emerald-400'
                    : 'text-neutral-500'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Quick Action Progression Controls */}
      {!isCancelled && (
        <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
          {prevStatus ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => onUpdateStatus(prevStatus)}
              className="px-3 py-1.5 rounded-xl bg-neutral-950 border border-neutral-700 text-neutral-400 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Rollback</span>
            </button>
          ) : (
            <div />
          )}

          {nextStatus && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => onUpdateStatus(nextStatus)}
              className="px-4 py-2 rounded-xl bg-[#0E4825] hover:bg-[#135d30] text-emerald-300 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
            >
              <span>Advance to {STEPS[effectiveIndex + 1].label}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default OrderStatusStepper;
