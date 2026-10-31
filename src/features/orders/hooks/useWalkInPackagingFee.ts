import { useCallback, useEffect, useState } from 'react';
import { fetchCheckoutFees, type CheckoutFeesOrderType } from '@/services/checkoutFees';

export interface WalkInPackagingFee {
  /** Server value; null while loading or after a failure (never a guess). */
  packagingFee: number | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Loads the server-owned packaging fee for a walk-in order. Request is the
 * branch + order type only (packaging is order-level). Any failure leaves
 * `packagingFee` null so the caller can block Create and offer a Retry.
 */
export function useWalkInPackagingFee({
  branchId,
  orderType,
  enabled,
}: {
  branchId?: string;
  orderType: CheckoutFeesOrderType;
  enabled: boolean;
}): WalkInPackagingFee {
  const [packagingFee, setPackagingFee] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!enabled || !branchId) {
      setPackagingFee(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setPackagingFee(null);

    fetchCheckoutFees({ branchId, orderType })
      .then((fees) => {
        if (cancelled) return;
        setPackagingFee(fees.packagingFee);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPackagingFee(null);
        setError(
          err instanceof Error ? err.message : 'Could not load the packaging fee. Retry.'
        );
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [branchId, orderType, enabled, retryNonce]);

  const retry = useCallback(() => setRetryNonce((n) => n + 1), []);

  return { packagingFee, isLoading, error, retry };
}
