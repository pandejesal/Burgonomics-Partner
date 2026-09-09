import React from 'react';
import { Check } from 'lucide-react';
import type { OrderStatus } from '@/types';

interface OrderStatusStepperProps {
  currentStatus: OrderStatus;
  onUpdateStatus: (nextStatus: OrderStatus) => void | Promise<void>;
  isSubmitting?: boolean;
}

/** Kitchen fast-path pipeline. Terminal states render statically. */
const PIPELINE: OrderStatus[] = [
  'pending',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
];

const STEP_LABELS: Record<OrderStatus, string> = {
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
 * OrderStatusStepper — presentational pipeline. Only the immediate next step
 * is advanceable (single-step kitchen flow); the actual write + error surface
 * live in the page's `onUpdateStatus` handler. Terminal `cancelled` /
 * `quarantine` docs render a static notice — never an advance button.
 */
export function OrderStatusStepper({
  currentStatus,
  onUpdateStatus,
  isSubmitting = false,
}: OrderStatusStepperProps) {
  if (currentStatus === 'cancelled' || currentStatus === 'quarantine') {
    return (
      <div
        role="status"
        className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-xs font-bold text-neutral-400"
      >
        {currentStatus === 'cancelled'
          ? 'This order was cancelled — pipeline closed.'
          : 'This order needs review (unrecognized or corrupt data) — held out of the kitchen pipeline.'}
      </div>
    );
  }

  const currentIndex = PIPELINE.indexOf(currentStatus);
  const nextStatus = currentIndex >= 0 && currentIndex < PIPELINE.length - 1
    ? PIPELINE[currentIndex + 1]
    : undefined;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
      <ol className="flex items-center gap-1">
        {PIPELINE.map((step, idx) => {
          const done = idx < currentIndex || currentStatus === 'delivered';
          const current = idx === currentIndex;
          return (
            <li key={step} className="flex flex-1 items-center gap-1 last:flex-none">
              <span
                aria-current={current ? 'step' : undefined}
                title={STEP_LABELS[step]}
                className={`grid place-items-center w-6 h-6 rounded-full border text-[10px] font-black shrink-0 ${
                  done
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : current
                      ? 'bg-[#0E4825] border-emerald-500/40 text-emerald-300'
                      : 'bg-neutral-950 border-neutral-700 text-neutral-500'
                }`}
              >
                {done ? <Check className="w-3 h-3" /> : idx + 1}
              </span>
              <span
                className={`hidden sm:block text-[10px] font-bold uppercase tracking-wide ${
                  current ? 'text-white' : 'text-neutral-500'
                }`}
              >
                {STEP_LABELS[step]}
              </span>
              {idx < PIPELINE.length - 1 && <span className="flex-1 h-px bg-neutral-800 mx-1" />}
            </li>
          );
        })}
      </ol>
      {nextStatus && (
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => onUpdateStatus(nextStatus)}
          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0E4825] hover:bg-[#135d30] disabled:opacity-50 text-emerald-300 font-bold text-xs transition-colors cursor-pointer"
        >
          {isSubmitting ? 'Updating…' : `Advance to ${STEP_LABELS[nextStatus]}`}
        </button>
      )}
    </div>
  );
}

export default OrderStatusStepper;
