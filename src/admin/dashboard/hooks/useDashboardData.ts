import { useQuery, useMutation } from "@tanstack/react-query";
import { dashboardService } from "../services/dashboardService";
import type { AuditLogEntry, QueueStats, SystemHealthResponse } from "../types";

export function useLiveCounts(enabled = true) {
  return useQuery({
    queryKey: ["admin", "dashboard", "live"],
    queryFn: () => dashboardService.getLiveCounts(),
    refetchInterval: 10000, // 10 seconds for live ops
    enabled,
    retry: 2,
    refetchOnWindowFocus: true,
  });
}

export function useDashboardSnapshot(
  params: {
    from: string;
    to: string;
    storeId?: string;
  },
  enabled = true,
) {
  return useQuery({
    queryKey: ["admin", "dashboard", "snapshot", params],
    queryFn: () => dashboardService.getDashboardSnapshot(params),
    refetchInterval: 15000,
    enabled: enabled && !!params.from && !!params.to,
    retry: 2,
  });
}

export function useSystemHealth(enabled = true) {
  return useQuery({
    queryKey: ["admin", "dashboard", "health"],
    // Standby stub — return ONLY the status. Never add `info: {}` /
    // `details: {}` empty-object placeholders: `!!{}` is truthy, so
    // empty objects are what made the standby guard in SystemHealth.tsx
    // (`!!(health?.details ?? health?.info)`) always pass and render
    // fabricated telemetry. Presence must be tested by key count, and
    // the stub must not fake any keys either.
    // No refetchInterval: polling a constant implies a live probe. The
    // stub never changes, so refetch on mount/reconnect only (enabled/retry).
    queryFn: async (): Promise<SystemHealthResponse> => ({ status: "standby" }),
    enabled,
    retry: 2,
  });
}

export function useAnalyticsSummary(
  params: {
    from: string;
    to: string;
    storeId?: string;
  },
  enabled = true,
) {
  return useQuery({
    queryKey: ["admin", "analytics", "summary", params],
    queryFn: () => dashboardService.getAnalyticsSummary(params),
    refetchInterval: 15000,
    enabled: enabled && !!params.from && !!params.to,
    retry: 2,
  });
}

export function useRevenueSeries(
  params: {
    from: string;
    to: string;
    granularity: "hour" | "day" | "week" | "month";
    storeId?: string;
  },
  enabled = true,
) {
  return useQuery({
    queryKey: ["admin", "analytics", "revenue-series", params],
    queryFn: () => dashboardService.getRevenueSeries(params),
    refetchInterval: 15000,
    enabled: enabled && !!params.from && !!params.to,
    retry: 2,
  });
}

export function useOrderSeries(
  params: {
    from: string;
    to: string;
    granularity: "hour" | "day" | "week" | "month";
    storeId?: string;
  },
  enabled = true,
) {
  return useQuery({
    queryKey: ["admin", "analytics", "order-series", params],
    queryFn: () => dashboardService.getOrderSeries(params),
    refetchInterval: 15000,
    enabled: enabled && !!params.from && !!params.to,
    retry: 2,
  });
}

export function useQueueStats(enabled = true) {
  return useQuery({
    queryKey: ["admin", "ops", "queues"],
    queryFn: async (): Promise<QueueStats[]> => [],
    // stub never changes; constant polling implies a live probe (P0-5 precedent).
    enabled,
    retry: 1,
  });
}

export function useDuplicatePayments(windowMinutes = 60, enabled = true) {
  return useQuery({
    queryKey: ["admin", "ops", "payments", "duplicates", windowMinutes],
    queryFn: () => dashboardService.getDuplicatePayments(windowMinutes),
    refetchInterval: 30000,
    enabled,
    retry: 2,
  });
}

export function usePaymentReconciliation(params: { from: string; to: string }, enabled = true) {
  return useQuery({
    queryKey: ["admin", "ops", "payments", "reconcile", params],
    queryFn: () => dashboardService.getPaymentReconciliation(params.from, params.to),
    refetchInterval: 30000,
    enabled: enabled && !!params.from && !!params.to,
    retry: 2,
  });
}

export function useRecentRefunds(limit = 10, enabled = true) {
  return useQuery({
    queryKey: ["admin", "ops", "refunds", limit],
    queryFn: () => dashboardService.getRecentRefunds(limit),
    refetchInterval: 15000,
    enabled,
    retry: 2,
  });
}

export function useSyncHistory(enabled = true) {
  return useQuery({
    queryKey: ["admin", "catalog", "sync", "history"],
    queryFn: () => dashboardService.getSyncHistory(),
    refetchInterval: 15000,
    enabled,
    retry: 2,
  });
}

export function useSyncHealth(enabled = true) {
  return useQuery({
    queryKey: ["admin", "catalog", "sync", "health"],
    queryFn: () => dashboardService.getSyncHealth(),
    refetchInterval: 15000,
    enabled,
    retry: 2,
  });
}

// F12: none of these four actions has a client-callable server route, yet each
// mutation resolved `{ ok: true }` — so the widget toasted "Menu sync
// enqueued" / "Catalog cache refreshed" / "Webhook replayed" after doing no
// I/O at all. They now reject with the reason instead of reporting work that
// never happened, and PetpoojaStatus renders the buttons disabled with the
// same wording. Point a mutationFn at a real endpoint when one exists.
export const SYNC_NOT_WIRED_MESSAGE =
  "Not wired to a server route yet — this action has no backend endpoint, so nothing was run.";

export function useSyncMutations() {
  const notWired = async (_payload?: unknown): Promise<never> => {
    throw new Error(SYNC_NOT_WIRED_MESSAGE);
  };

  const triggerMutation = useMutation({ mutationFn: notWired });
  const cacheRefreshMutation = useMutation({ mutationFn: notWired });
  const petpoojaSyncMutation = useMutation({ mutationFn: notWired });
  const replayWebhookMutation = useMutation({ mutationFn: notWired });

  return {
    triggerSync: triggerMutation.mutateAsync,
    isTriggering: triggerMutation.isPending,
    refreshCache: cacheRefreshMutation.mutateAsync,
    isRefreshingCache: cacheRefreshMutation.isPending,
    triggerPetpoojaSync: petpoojaSyncMutation.mutateAsync,
    isTriggeringPetpooja: petpoojaSyncMutation.isPending,
    replayWebhook: replayWebhookMutation.mutateAsync,
    isReplayingWebhook: replayWebhookMutation.isPending,
  };
}

export function useAuditLogs(
  _params: { page?: number; pageSize?: number; q?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: ["admin", "audit"],
    queryFn: async (): Promise<{ results: AuditLogEntry[]; total: number }> => ({
      results: [],
      total: 0,
    }),
    refetchInterval: 30000,
    enabled,
    retry: 2,
  });
}

export function useStores(params: { city?: string; query?: string } = {}, enabled = true) {
  return useQuery({
    queryKey: ["stores", params],
    queryFn: () => dashboardService.getStores(params),
    enabled,
    retry: 2,
  });
}
