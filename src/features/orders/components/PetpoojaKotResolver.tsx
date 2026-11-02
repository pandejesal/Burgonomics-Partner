import React, { useCallback, useRef, useState } from 'react';
import { AlertTriangle, Printer, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { PetpoojaKotResolution, ResolvePetpoojaKotResult } from '@/services/partnerFunctionsApi';
import { ConfirmDialog } from '@/admin/components/Utilities';
import { KOT_RESOLVE_DENIED_COPY, canResolvePetpoojaKot } from '@/services/petpoojaKotRoles';

/**
 * "Did the kitchen receive this order?" — the staff prompt for an ambiguous KOT
 * (P1-K, backend 3985a2b/1d228fc).
 *
 * Shown ONLY for an order in an ambiguous state (callers gate on
 * `petpoojaKotNeedsResolution`). Two truths, one request each:
 *   - "Yes, it printed"      -> resolution 'printed'
 *   - "No, send again"       -> resolution 'retry' (behind a confirmation: if
 *                               the ticket DID print, the kitchen cooks twice)
 *
 * The server decides the truth of a double press (a durable claim plus an
 * in-process single-flight), and the API call is deliberately single-shot, so
 * this component ALSO locks locally: the buttons stay disabled while a request
 * is in flight, which is what stops a double tap from ever reaching the wire.
 */
interface PetpoojaKotResolverProps {
  orderId: string;
  /** Signed-in role; the server refuses everyone outside the branch/brand set. */
  role: string | null | undefined;
  /** The one write. Must not retry internally. */
  onResolve: (params: {
    orderId: string;
    resolution: PetpoojaKotResolution;
  }) => Promise<ResolvePetpoojaKotResult>;
  /** Called after a successful resolution so the parent can refresh. */
  onResolved?: (result: ResolvePetpoojaKotResult) => void;
  /** Light (KDS/dark app) or admin (light canvas) shell. */
  theme?: 'admin' | 'app';
  className?: string;
}

export function PetpoojaKotResolver({
  orderId,
  role,
  onResolve,
  onResolved,
  theme = 'admin',
  className = '',
}: PetpoojaKotResolverProps) {
  const [pending, setPending] = useState<PetpoojaKotResolution | null>(null);
  const [confirmRetry, setConfirmRetry] = useState(false);
  // Synchronous guard: state updates are async, so a double tap inside one
  // frame would otherwise see `pending === null` twice.
  const inFlightRef = useRef(false);

  const allowed = canResolvePetpoojaKot(role);

  const resolve = useCallback(
    async (resolution: PetpoojaKotResolution) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setPending(resolution);
      try {
        const res = await onResolve({ orderId, resolution });
        if (resolution === 'printed') {
          toast.success('Marked printed — the kitchen has this ticket.', {
            description: 'No further Petpooja retries will be sent for this order.',
          });
        } else if (res.pushed === false) {
          // `pushed: false` with no reused flag means the push is owned by the
          // retry worker; `reused` means this press changed nothing.
          toast.info(
            res.reused
              ? 'This was already sent — no second ticket was created.'
              : 'Retry recorded — the dispatcher owns the single fresh push.',
            { description: 'The POS push is deduped, so the kitchen cannot get two tickets.' }
          );
        } else {
          toast.success('Sent again — one fresh KOT was pushed.', {
            description: 'Check the Petpooja printer for the new ticket.',
          });
        }
        onResolved?.(res);
      } catch (err) {
        // Server refusals (already registered / conflicting resolution / not
        // parked) must be readable: they tell staff the real state.
        toast.error('Petpooja did not accept that', {
          description:
            err instanceof Error && err.message
              ? err.message
              : 'Could not reach the dispatcher. Nothing was changed.',
        });
      } finally {
        inFlightRef.current = false;
        setPending(null);
      }
    },
    [onResolve, onResolved, orderId]
  );

  const isAdmin = theme === 'admin';
  const shell = isAdmin
    ? 'rounded-2xl border border-amber-200 bg-amber-50/60 p-4'
    : 'rounded-2xl border border-amber-500/50 bg-amber-950/40 p-4';
  const titleClass = isAdmin ? 'text-amber-900' : 'text-amber-300';
  const bodyClass = isAdmin ? 'text-amber-800/90' : 'text-amber-100/85';

  if (!allowed) {
    return (
      <div className={`${shell} ${className}`.trim()}>
        <div className="flex items-start gap-2.5">
          <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${isAdmin ? 'text-amber-600' : 'text-amber-400'}`} />
          <div className="min-w-0">
            <p className={`text-sm font-black uppercase tracking-wide ${titleClass}`}>
              POS unconfirmed — check the printer
            </p>
            <p className={`mt-1 text-[11px] leading-relaxed ${bodyClass}`}>
              {KOT_RESOLVE_DENIED_COPY}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const busy = pending !== null;

  return (
    <div className={`${shell} space-y-3 ${className}`.trim()}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${isAdmin ? 'text-amber-600' : 'text-amber-400'}`} />
        <div className="min-w-0">
          <p className={`text-sm font-black uppercase tracking-wide ${titleClass}`}>
            Did the kitchen receive this order?
          </p>
          <p className={`mt-1 text-[11px] leading-relaxed ${bodyClass}`}>
            The POS may or may not have printed this ticket, and no API can tell us. Check the
            Petpooja printer for this order, then record what you see.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => void resolve('printed')}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Printer className={`h-3.5 w-3.5 ${pending === 'printed' ? 'animate-pulse' : ''}`} />
          <span>{pending === 'printed' ? 'Recording…' : 'Yes, it printed'}</span>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmRetry(true)}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-400/70 bg-rose-600/90 px-3 py-2 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${pending === 'retry' ? 'animate-spin' : ''}`} />
          <span>{pending === 'retry' ? 'Sending…' : 'No, send again'}</span>
        </button>
      </div>

      {confirmRetry && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmRetry(false)}
          onConfirm={async () => {
            setConfirmRetry(false);
            await resolve('retry');
          }}
          title="Send this KOT again?"
          description={
            'Only continue if you are sure the Petpooja printer did NOT produce this ticket. ' +
            'Sending again makes a second ticket: if the first one exists, the kitchen cooks this ' +
            'order twice. The server sends exactly one fresh push.'
          }
          confirmLabel="It did not print — send again"
          isDestructive={true}
        />
      )}
    </div>
  );
}

export default PetpoojaKotResolver;
