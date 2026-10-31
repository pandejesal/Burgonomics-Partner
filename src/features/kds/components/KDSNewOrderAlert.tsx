import React from 'react';
import { BellRing, X } from 'lucide-react';

interface KDSNewOrderAlertProps {
  /** Raw order ids that arrived since the previous makeline snapshot. */
  orderIds: string[];
  onDismiss: () => void;
}

/** Same ticket label the KDS card shows (first 6 chars, uppercased). */
export function formatKdsOrderLabel(orderId: string): string {
  return orderId.slice(0, 6).toUpperCase();
}

/**
 * Wording for the live region. Kept pure so the announcement text is testable
 * without a DOM: one arrival is named, several are counted AND listed.
 */
export function formatNewOrderAnnouncement(orderIds: string[]): string {
  if (orderIds.length === 0) return '';
  const labels = orderIds.map(formatKdsOrderLabel);
  if (labels.length === 1) {
    return `New order ${labels[0]} arrived on the makeline.`;
  }
  return `${labels.length} new orders arrived on the makeline: ${labels.join(', ')}.`;
}

/**
 * Non-audio new-order signal for the KDS (A11Y-14).
 *
 * The acoustic chime is best-effort — autoplay policy, a muted device or a
 * failed unlock leaves the kitchen with no signal at all — so arrival is
 * always ALSO shown as a visible banner and announced through a persistent
 * polite live region. The region is rendered (empty) even when there is
 * nothing new: screen readers only reliably announce changes to a live
 * region that was already in the accessibility tree.
 */
export function KDSNewOrderAlert({ orderIds, onDismiss }: KDSNewOrderAlertProps) {
  const announcement = formatNewOrderAnnouncement(orderIds);
  const labels = orderIds.map(formatKdsOrderLabel);

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="kds-new-order-live-region"
        className="sr-only"
      >
        {announcement}
      </div>

      {orderIds.length > 0 && (
        <div className="bg-emerald-600 text-white px-4 py-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-sm font-black uppercase tracking-wider shadow-md z-50">
          <BellRing className="w-5 h-5 stroke-[2.5] shrink-0" aria-hidden="true" />
          <span>
            New order received
            {labels.length > 1 ? ` (${labels.length})` : ''} — {labels.join(', ')}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss new order alert"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-emerald-800/70 border border-white/30 hover:bg-emerald-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}

export default KDSNewOrderAlert;
