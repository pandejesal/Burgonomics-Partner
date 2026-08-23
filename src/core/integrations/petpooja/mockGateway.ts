import { mapOrderToPetpoojaSaveOrder } from "./mapper";
import type {
  PetpoojaGateway,
  GatewayStore,
  StoreOperationalState,
  SyncReport,
  SyncLogRecord,
  QueueOverview,
  GatewayHealth,
  WebhookRecord,
  GatewayMetrics,
  GatewayAlert,
  PetpoojaMenuSyncResult,
  PetpoojaOrderPushResult,
  CircuitBreakerOverride,
} from "./types";

const SAMPLE_STORES: GatewayStore[] = [
  {
    id: "str_001",
    name: "Burgonomics Connaught Place",
    address: "Block B, Inner Circle, Connaught Place",
    city: "New Delhi",
    area: "Connaught Place",
    lat: 28.6328,
    lng: 77.2197,
    phone: "+91 11 4151 8899",
    imageUrl: null,
    hours: { open: "11:00", close: "23:00" },
    isOpen: true,
    isBusy: false,
    isRecentlyOpened: false,
    supports: { delivery: true, takeaway: true, dineIn: true },
    etaMinutes: 30,
    pickupEtaMinutes: 15,
    deliveryFee: 29,
    petpoojaRestId: "rest_001",
  },
  {
    id: "str_002",
    name: "Burgonomics Cyber Hub",
    address: "DLF Cyber City, Sector 24",
    city: "Gurugram",
    area: "Cyber Hub",
    lat: 28.4949,
    lng: 77.0894,
    phone: "+91 124 400 1234",
    imageUrl: null,
    hours: { open: "11:00", close: "00:00" },
    isOpen: true,
    isBusy: false,
    isRecentlyOpened: false,
    supports: { delivery: true, takeaway: true, dineIn: true },
    etaMinutes: 25,
    pickupEtaMinutes: 12,
    deliveryFee: 35,
    petpoojaRestId: "rest_002",
  },
  {
    id: "str_003",
    name: "Burgonomics Indiranagar",
    address: "100 Feet Road, HAL 2nd Stage",
    city: "Bengaluru",
    area: "Indiranagar",
    lat: 12.9716,
    lng: 77.6412,
    phone: "+91 80 4123 5678",
    imageUrl: null,
    hours: { open: "11:00", close: "23:30" },
    isOpen: true,
    isBusy: false,
    isRecentlyOpened: true,
    supports: { delivery: true, takeaway: true, dineIn: true },
    etaMinutes: 35,
    pickupEtaMinutes: 15,
    deliveryFee: 40,
    petpoojaRestId: "rest_003",
  },
];

export class MockPetpoojaGateway implements PetpoojaGateway {
  readonly implementation = "mock" as const;

  private breakerStates = new Map<string, "closed" | "open" | "half-open">([
    ["str_001", "closed"],
    ["str_002", "closed"],
    ["str_003", "closed"],
  ]);

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getStores(): Promise<GatewayStore[]> {
    await this.delay(100);
    return SAMPLE_STORES;
  }

  async getStoreStatus(storeId: string): Promise<StoreOperationalState> {
    await this.delay(100);
    const breaker = this.breakerStates.get(storeId) || "closed";
    return {
      storeId,
      menuVersion: "v2.1.4",
      lastSuccessfulVersion: "v2.1.4",
      lastSyncTime: new Date().toISOString(),
      webhookStatus: breaker === "open" ? "degraded" : "active",
      circuitBreaker: breaker,
      queueState: "idle",
      retryCount: 0,
      apiCredentialsLinked: true,
      webhookSecretLinked: true,
      posTerminalOnline: breaker !== "open",
    };
  }

  async runSync(_storeId: string, _mode: "full" | "incremental" | "stock" | "status"): Promise<SyncReport> {
    await this.delay(300);
    return {
      currentVersion: "v2.1.5",
      lastSuccessfulVersion: "v2.1.4",
      started: new Date(Date.now() - 2500).toISOString(),
      finished: new Date().toISOString(),
      duration: "2.5s",
      created: 2,
      updated: 14,
      deleted: 0,
      categories: 6,
      modifiers: 12,
      errors: 0,
      warnings: 1,
      conflicts: 0,
      simulated: true,
    };
  }

  async getQueues(): Promise<QueueOverview> {
    await this.delay(100);
    return {
      status: "active",
      activeJobsCount: 0,
      waitingJobsCount: 1,
      failedJobsCount: 0,
      delayedJobsCount: 0,
      completedJobsCount: 42,
      jobs: [
        {
          id: "job_sync_menu_01",
          name: "sync:menu:incremental",
          queue: "petpooja_sync",
          state: "waiting",
          attempts: 1,
          maxAttempts: 3,
          createdAt: new Date().toISOString(),
          processedAt: null,
          durationMs: null,
          payload: { storeId: "str_001", scope: "INCREMENTAL" },
          errorMessage: null,
        },
      ],
    };
  }

  async getHealth(): Promise<GatewayHealth> {
    await this.delay(100);
    const breakers: CircuitBreakerOverride[] = SAMPLE_STORES.map((s) => ({
      storeId: s.id,
      storeName: s.name,
      restId: s.petpoojaRestId,
      state: this.breakerStates.get(s.id) || "closed",
      failureCount: this.breakerStates.get(s.id) === "open" ? 3 : 0,
      maxFailures: 3,
    }));

    return {
      status: "healthy",
      connected: true,
      message: "Gateway operating in emulated mode with 100% telemetry health.",
      services: [
        { service: "Database Sync Engine", status: "healthy", latencyMs: 12, details: "Firestore emulation connected" },
        { service: "Queue Worker Node", status: "healthy", latencyMs: 24, details: "Background runner idle" },
        { service: "API Gateway Proxy", status: "healthy", latencyMs: 45, details: "burgonomics.netlify.app bridge" },
        { service: "Webhook Receptor", status: "healthy", latencyMs: 18, details: "Webhook receptor ready" },
      ],
      circuitBreakers: breakers,
      cacheMetrics: {
        sizeBytes: 1048576,
        sizeFormatted: "1.02 MB",
        keyCount: 48,
        hitRate: 0.94,
        status: "Active",
      },
    };
  }

  async getSyncLogs(): Promise<SyncLogRecord[]> {
    await this.delay(100);
    return [
      {
        id: "log_sync_101",
        storeName: "Burgonomics Connaught Place",
        storeId: "str_001",
        scope: "FULL",
        status: "COMPLETED",
        version: "v2.1.4",
        startedAt: new Date(Date.now() - 3600000).toISOString(),
        finishedAt: new Date(Date.now() - 3596000).toISOString(),
        duration: "4.0s",
        created: 4,
        updated: 22,
        deleted: 0,
        conflicts: 0,
        error: null,
        simulated: true,
        source: "Dashboard Manual Trigger",
      },
    ];
  }

  async getWebhookLogs(): Promise<WebhookRecord[]> {
    await this.delay(100);
    return [
      {
        id: "wh_log_001",
        timestamp: new Date(Date.now() - 120000),
        storeName: "Burgonomics Connaught Place",
        storeId: "str_001",
        type: "order_status_update",
        status: "success",
        executionTimeMs: 45,
        payload: { orderId: "ord_101", status: "Accepted", rider: "Rohan K." },
      },
    ];
  }

  subscribeWebhookLogs(
    onLogs: (logs: WebhookRecord[]) => void,
    _onError?: (err: Error) => void,
  ): () => void {
    void this.getWebhookLogs().then(onLogs);
    const interval = setInterval(() => {
      void this.getWebhookLogs().then(onLogs);
    }, 10000);
    return () => clearInterval(interval);
  }

  async replayWebhook(_id: string): Promise<{ acknowledged: boolean }> {
    await this.delay(150);
    return { acknowledged: true };
  }

  async tripBreaker(storeId: string): Promise<void> {
    this.breakerStates.set(storeId, "open");
  }

  async resetBreaker(storeId: string): Promise<void> {
    this.breakerStates.set(storeId, "closed");
  }

  async flushCache(): Promise<{ flushed: boolean; message: string }> {
    await this.delay(150);
    return { flushed: true, message: "Gateway cache flushed successfully." };
  }

  async getMetrics(): Promise<GatewayMetrics> {
    await this.delay(100);
    return {
      connectedStoresCount: 3,
      totalStoresCount: 3,
      syncSuccessRate: 99.4,
      openBreakersCount: 0,
      queueStatusLabel: "HEALTHY",
      timeSeries: [
        { time: "12:00", latency: 24, processingTime: 120, volume: 140, retries: 0, queueGrowth: 0 },
        { time: "13:00", latency: 28, processingTime: 135, volume: 220, retries: 1, queueGrowth: 2 },
        { time: "14:00", latency: 22, processingTime: 110, volume: 180, retries: 0, queueGrowth: 0 },
      ],
      menuSyncDuration: [
        { date: "2026-08-21", duration: 3.2, created: 2, updated: 10, deleted: 0 },
        { date: "2026-08-22", duration: 2.8, created: 0, updated: 8, deleted: 0 },
        { date: "2026-08-23", duration: 2.5, created: 2, updated: 14, deleted: 0 },
      ],
      prometheusText: "# HELP petpooja_sync_duration_seconds Menu sync duration\npetpooja_sync_duration_seconds 2.5",
      simulated: true,
    };
  }

  async getAlerts(): Promise<GatewayAlert[]> {
    return [];
  }

  async pushMenu(_storeId: string): Promise<PetpoojaMenuSyncResult> {
    await this.delay(200);
    return {
      itemsSynced: 32,
      syncedAt: new Date().toISOString(),
      categoriesCount: 6,
      addonGroupsCount: 8,
    };
  }

  async pushOrder(orderId: string, customOrder?: any): Promise<PetpoojaOrderPushResult> {
    await this.delay(200);
    const payload = mapOrderToPetpoojaSaveOrder(customOrder || { id: orderId });
    return {
      acknowledged: true,
      kotNumber: `KOT-${Math.floor(1000 + Math.random() * 9000)}`,
      payload,
    };
  }
}

export const petpoojaGateway = new MockPetpoojaGateway();
