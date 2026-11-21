import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { ApiRequestError, partnerFunctionsApi } from '@/services/partnerFunctionsApi';
import {
  canReadSettlements,
  sortStatementsForDisplay,
  type SettlementStatement,
} from '@/features/settlements';

/**
 * Settlement data for the Partner app (owner decision 2026-11-20).
 *
 * Reads go through the authenticated API (`/settlements/list`) rather than a
 * Firestore listener: the server owns the scope (a branch owner sees its own
 * branch, a brand role sees every branch), the amounts, and the paid state.
 * There is no client-side write to a statement anywhere — generation and
 * "mark as paid" are both server routes.
 */

export interface UseSettlementsParams {
  monthKey: string;
  branchId?: string;
  allVersions?: boolean;
  /** Lets a test render the real screen without a network fetch. */
  initialStatements?: SettlementStatement[];
}

export interface UseSettlementsResult {
  statements: SettlementStatement[];
  isLoading: boolean;
  error: string | null;
  /** True when the caller's role may not read settlements at all. */
  forbidden: boolean;
  refetch: () => void;
  generate: (branchId: string) => Promise<SettlementStatement | null>;
  markPaid: (input: {
    statementId: string;
    reference: string;
    paidOn: string;
    note?: string;
    additionalPayment?: boolean;
  }) => Promise<void>;
  isGenerating: boolean;
  isMarkingPaid: boolean;
}

/** A refusal's server code and readable message, for a toast. */
export function settlementErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === 'SETTLEMENT_FORBIDDEN') {
      return 'Not allowed: only the owner and brand roles can do that.';
    }
    if (err.code === 'SETTLEMENT_NONE') {
      return 'No statements exist for that month yet.';
    }
    if (err.code === 'SETTLEMENT_MONTH_OPEN') {
      return 'That month has not closed yet — it cannot be settled.';
    }
    if (err.code === 'SETTLEMENT_INVALID_PAID_ON') {
      return 'That paid date is not valid (it must be a real date, not in the future).';
    }
    if (err.code === 'SETTLEMENT_ALREADY_PAID') {
      return 'This statement is already marked paid. Tick "additional payment" only if you are recording a second payment.';
    }
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export function useSettlements(params: UseSettlementsParams): UseSettlementsResult {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const role = user?.role;
  const permitted = canReadSettlements(role) && !!params.monthKey;

  const queryKey = [
    'settlements',
    user?.id,
    role,
    params.monthKey,
    params.branchId ?? null,
    params.allVersions === true,
  ] as const;

  const query = useQuery<{ monthKey: string; statements: SettlementStatement[] }>({
    queryKey,
    enabled: permitted && !params.initialStatements,
    queryFn: async () => {
      const res = await partnerFunctionsApi.listSettlements({
        monthKey: params.monthKey,
        ...(params.branchId ? { branchId: params.branchId } : {}),
        ...(params.allVersions ? { allVersions: true } : {}),
      });
      return {
        monthKey: res?.monthKey ?? params.monthKey,
        statements: Array.isArray(res?.statements) ? res.statements : [],
      };
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (branchId: string) =>
      partnerFunctionsApi.generateSettlementStatement({ branchId, monthKey: params.monthKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settlements'] });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (input: {
      statementId: string;
      reference: string;
      paidOn: string;
      note?: string;
      additionalPayment?: boolean;
    }) => partnerFunctionsApi.markSettlementPaid(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settlements'] });
    },
  });

  const rawStatements = params.initialStatements ?? query.data?.statements ?? [];
  // One row per branch (newest version) and branches that owe money first.
  // `allVersions` deliberately keeps every version visible for an audit view.
  const statements = params.allVersions
    ? rawStatements
    : sortStatementsForDisplay(rawStatements);

  const error = params.initialStatements
    ? null
    : query.error
      ? settlementErrorMessage(query.error)
      : null;
  const forbidden = !!role && !canReadSettlements(role);

  return {
    statements,
    isLoading: params.initialStatements ? false : query.isLoading,
    error,
    forbidden,
    refetch: () => {
      void query.refetch();
    },
    generate: async (branchId: string) => {
      const statement = await generateMutation.mutateAsync(branchId);
      return statement ?? null;
    },
    markPaid: async (input) => {
      await markPaidMutation.mutateAsync(input);
    },
    isGenerating: generateMutation.isPending,
    isMarkingPaid: markPaidMutation.isPending,
  };
}
