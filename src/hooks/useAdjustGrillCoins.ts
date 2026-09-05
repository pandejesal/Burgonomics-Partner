import { useMutation, useQueryClient } from '@tanstack/react-query';
import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';
import type { WalletAdjustmentPayload } from '@/features/customers/components/GrillCoinsLedgerModal';

const REASON_LABELS: Record<WalletAdjustmentPayload['reason'], string> = {
  CUSTOMER_DELIGHT: 'Customer delight',
  ORDER_COMPENSATION: 'Order compensation',
  PROMO_BONUS: 'Promotional bonus',
  MANUAL_CORRECTION: 'Manual balance correction',
  STORE_COMPENSATION: 'In-store dispute resolution',
};

/**
 * Server-side Grill-Coins adjustment. Writes the balance AND a ledger row via
 * POST /customers/adjustCoins (branch-scoped, actor-attributed) — then
 * refreshes customer queries. Rejects on failure so the modal toasts an
 * error INSTEAD of a fake success. Never apply coin changes to local state.
 */
export function useAdjustGrillCoins() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: WalletAdjustmentPayload) => {
      return partnerFunctionsApi.adjustCustomerCoins({
        customerId: payload.customerId,
        delta: payload.delta,
        reason: REASON_LABELS[payload.reason] ?? payload.reason,
        notes: payload.notes,
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer', vars.customerId] });
    },
  });
}
