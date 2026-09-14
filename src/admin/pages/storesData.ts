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

export interface RichStore extends Store {
  richHours: WeeklySchedule;
  email: string;
  managerName: string;
  managerPhone: string;

  // Petpooja parameters
  webhookUrl: string;
  webhookStatus: "active" | "failed" | "disabled";
  circuitBreaker: "closed" | "open" | "half-open";
  lastSyncTime: string;
  menuVersion: string;
  webhookFailures: number;
  retryCount: number;

  // Queue parameters
  queueOrdersWaiting: number;
  queueOrdersActive: number;
  queueFailedJobs: number;
  queueDeadLetters: number;
  queueWorkerStatus: "healthy" | "paused" | "down";

  // Analytics
  todayRevenue: number;
  todayOrders: number;
  avgOrderValue: number;
  popularItem: string;
  peakHour: string;
  customerCount: number;
  repeatCustomerPercentage: number;
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

  // Media Gallery
  media: {
    heroBanner: string;
    logo: string;
    gallery: string[];
  };

  // Documents
  documents: StoreDocument[];
}