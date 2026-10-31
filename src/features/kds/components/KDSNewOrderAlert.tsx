import React from 'react';
import { BellRing, X } from 'lucide-react';
import { formatKdsOrderLabel, formatNewOrderAnnouncement } from '../newOrderAlert';

interface KDSNewOrderAlertProps {
  /** Capped ids that arrived since the previous makeline snapshot. */
  orderIds: string[];
  /** Full burst size; defaults to the retained id count. */
  totalCount?: number;
  onDismiss: () => void;
}

export { formatKdsOrderLabel, formatNewOrderAnnouncement };

/**
 * Non-audio new-order signal for the KDS (A11Y-14).
 *
 * The acoustic chime is best-effort — autoplay policy, a muted device or a
 * failed unlock leaves the kitchen with no signal at all — so arrival is
 * always ALSO shown as a visible banner and announced through a persistent
 * polite live region. The region is rendered (empty) even when there is
 * nothing new: screen readers only reliably announce changes to a live
 * region that was already in the accessibility tree.
 *
 * Only a capped tail of a large burst is rendered; the rest is reported as
 * "(N more)" so the announcement and the banner stay bounded.
 */
export function KDSNewOrderAlert({
  orderIds,
  totalCount,
  onDismiss,
}: KDSNewOrderAlertProps) {
  const total = totalCount ?? orderIds.length;
  const announcement = formatNewOrderAnnouncement(orderIds, total);
  const labels = orderIds.map(formatKdsOrderLabel);
  const overflow = Math.max(0, total - labels.length);

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
            New order{total > 1 ? 's' : ''} received{total > 1 ? ` (${total})` : ''} —{' '}
            {labels.join(', ')}
            {overflow > 0 ? ` (+${overflow} more)` : ''}
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
