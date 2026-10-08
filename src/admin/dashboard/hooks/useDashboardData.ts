import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

export function useSyncMutations() {
  const queryClient = useQueryClient();

  const triggerMutation = useMutation({
    mutationFn: async (_payload: { scope: string; storeId?: string }) => ({ ok: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "catalog", "sync", "history"] });
    },
  });

  const cacheRefreshMutation = useMutation({
    mutationFn: async (_storeId?: string) => ({ ok: true }),
  });

  const petpoojaSyncMutation = useMutation({
    mutationFn: async (_storeId?: string) => ({ ok: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "catalog", "sync", "history"] });
    },
  });

  const replayWebhookMutation = useMutation({
    mutationFn: async (_payload: { gateway: string; id: string }) => ({ ok: true }),
  });

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
