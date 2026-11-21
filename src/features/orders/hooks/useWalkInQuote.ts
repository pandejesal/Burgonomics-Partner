import { useEffect, useState } from 'react';
import { partnerFunctionsApi, type WalkInQuote } from '@/services/partnerFunctionsApi';

export interface WalkInQuoteState {
  /** The server's bill; null while loading or after a refusal (never a guess). */
  quote: WalkInQuote | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * F4: the counter bill comes from the SERVER, not from this app.
 *
 * The modal used to add up food + a locally computed GST + a separately fetched
 * packaging fee, then post that number as `expectedTotalPaise`. HL Road charges
 * ₹15 packaging and staging showed a bill without it. Pricing rules belong to
 * one place (`walkInBill` on the server, which the create route also uses), so
 * the till displays that quote and confirms it verbatim. Any failure leaves
 * `quote` null so the caller can block Create and offer a Retry — a failed
 * quote is never replaced by client arithmetic.
 */
export function useWalkInQuote({
  branchId,
  orderType,
  items,
  enabled,
}: {
  branchId?: string;
  orderType: 'takeaway' | 'dinein';
  items: Array<{ productId: string; quantity: number }>;
  enabled: boolean;
}): WalkInQuoteState {
  const [quote, setQuote] = useState<WalkInQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Retrying must refetch even when the cart is unchanged.
  const [retryNonce, setRetryNonce] = useState(0);

  // A stable dependency: the cart's content, not the array identity.
  const itemKey = items.map((line) => `${line.productId}:${line.quantity}`).join('|');

  useEffect(() => {
    if (!enabled || !branchId || items.length === 0) {
      setQuote(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setQuote(null);

    partnerFunctionsApi
      .quoteWalkInOrder({ branchId, orderType, items })
      .then((result) => {
        if (cancelled) return;
        setQuote(result);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setQuote(null);
        setError(err instanceof Error ? err.message : 'Could not price this order. Retry.');
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `items` is represented by `itemKey`; passing the array itself would
    // refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, orderType, itemKey, enabled, retryNonce]);

  return {
    quote,
    isLoading,
    error,
    retry: () => setRetryNonce((n) => n + 1),
  };
}
