import { AlertTriangle } from 'lucide-react';

interface DeliveryFeeUnverifiedWarningProps {
  order: { deliveryFeeUnverified?: boolean };
  className?: string;
}

/**
 * The backend sets `deliveryFeeUnverified: true` on a cash delivery order whose
 * courier quote could not be verified. Staff must confirm the amount before
 * collecting cash, so the KDS card and the order detail both show this banner.
 * Display-only: it never changes order logic. Text + icon + alert role, never
 * colour alone.
 */
export function DeliveryFeeUnverifiedWarning({
  order,
  className = '',
}: DeliveryFeeUnverifiedWarningProps) {
  if (order.deliveryFeeUnverified !== true) return null;

  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-xl border border-amber-500/50 bg-amber-500/15 p-2.5 text-xs font-bold text-amber-200 ${className}`}
    >
      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" aria-hidden="true" />
      <span>Delivery fee not verified. Confirm the amount before collecting cash.</span>
    </div>
  );
}

export default DeliveryFeeUnverifiedWarning;
