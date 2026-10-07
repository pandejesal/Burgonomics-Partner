import type { Store } from "@/features/stores/models/Store";

export interface RichStoreHours {
  open: string;
  close: string;
  secondShiftOpen?: string;
  secondShiftClose?: string;
  closed?: boolean;
}

export interface WeeklySchedule {
  monday: RichStoreHours;
  tuesday: RichStoreHours;
  wednesday: RichStoreHours;
  thursday: RichStoreHours;
  friday: RichStoreHours;
  saturday: RichStoreHours;
  sunday: RichStoreHours;
}

export interface StaffMember {
  id: string;
  name: string;
  role: "Manager" | "Assistant Manager" | "Chef" | "Cashier" | "Delivery";
  phone: string;
  email: string;
  isOnline: boolean;
}

export interface StoreDocument {
  id: string;
  name: string;
  type: "GST" | "FSSAI" | "License" | "Agreement" | "Insurance" | "PDF";
  expiryDate: string;
  status: "active" | "expiring" | "expired";
}

// P0-3 honesty: server-owned Petpooja link state. A store that was never
// linked/synced is "unknown" — never "active", never "failed".
export type WebhookStatus = "active" | "failed" | "disabled" | "unknown";
export type CircuitBreakerState = "closed" | "open" | "half-open";

export interface RichStore extends Store {
  richHours: WeeklySchedule;
  // null until the operator actually provides contact details — the create
  // path must not invent @burgonomics.com addresses or manager names.
  email: string | null;
  managerName: string | null;
  managerPhone: string | null;

  // Petpooja parameters — server-owned. null/"unknown" until a real link
  // exists and a real sync has run.
  webhookUrl: string | null;
  webhookStatus: WebhookStatus;
  circuitBreaker: CircuitBreakerState | null;
  lastSyncTime: string | null;
  menuVersion: string | null;
  webhookFailures: number;
  retryCount: number;

  // Queue parameters — "unknown" until a queue worker has reported for this
  // outlet; a brand-new store must not claim a healthy worker.
  queueOrdersWaiting: number;
  queueOrdersActive: number;
  queueFailedJobs: number;
  queueDeadLetters: number;
  queueWorkerStatus: "healthy" | "paused" | "down" | "unknown";

  // Analytics — computed from real orders. popularItem / peakHour /
  // repeatCustomerPercentage are OPTIONAL: absent means "not measured yet"
  // and render sites must omit the row rather than print a guess (P0-3).
  todayRevenue: number;
  todayOrders: number;
  avgOrderValue: number;
  popularItem?: string;
  peakHour?: string;
  customerCount: number;
  repeatCustomerPercentage?: number;
  weeklyRevenueTrend: number[];
  monthlyRevenueTrend: number[];

  // Settings Toggles
  autoAcceptOrders: boolean;
  kitchenDisplayEnabled: boolean;
  onlinePaymentEnabled: boolean;
  cashOnDeliveryEnabled: boolean;

  // Staff
  staff: StaffMember[];

  // Delivery
  deliveryRadiusKm: number;
  deliveryMinOrder: number;
  deliveryMaxDistance: number;
  deliveryPolygonCoords?: { lat: number; lng: number }[];

  // Media Gallery — null URLs = no image uploaded yet; render the existing
  // placeholder, never stock photography as an outlet's logo/banner.
  media: {
    heroBanner: string | null;
    logo: string | null;
    gallery: string[];
  };

  // Documents
  documents: StoreDocument[];
}