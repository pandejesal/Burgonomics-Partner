import { toast } from "sonner";

export interface AddressSnapshot {
  id: string;
  label: "Home" | "Office" | "Other";
  contactName: string;
  contactPhone: string;
  line1: string;
  line2: string;
  city: string;
  pincode: string;
  coords: string;
  lastUsed: boolean;
  isDefault: boolean;
}

export interface LoyaltyHistoryItem {
  id: string;
  date: string;
  action: "ADD" | "REMOVE" | "EXPIRE" | "REDEEM" | "REWARD_ISSUED" | "TIER_ADJUST";
  points: number;
  description: string;
  operator: string;
}

export interface CouponItem {
  code: string;
  discount: string;
  status: "Available" | "Used" | "Expired";
  usedAt?: string;
  source: string;
}

export interface NotificationLog {
  id: string;
  type: "SMS" | "Push" | "WhatsApp" | "Email";
  title: string;
  body: string;
  sentAt: string;
  // Loop 61/120: "Draft" covers locally-recorded campaigns that were never
  // sent (no SMS/Push/WhatsApp/Email channel exists). Only real provider
  // deliveries may use Delivered/Opened/Clicked.
  status: "Delivered" | "Opened" | "Clicked" | "Failed" | "Draft";
}

export interface SupportCase {
  id: string;
  date: string;
  type: "Refund Complaint" | "Delivery Delay" | "Incorrect Order" | "App Feedback";
  description: string;
  status: "Resolved" | "Under Investigation" | "Open";
  resolution?: string;
  internalNotes?: string;
}

export interface CustomerAuditLog {
  id: string;
  date: string;
  action: string;
  operator: string;
  ipAddress: string;
  device: string;
}

export interface CustomerProfile {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  avatar: string;
  city: string;
  preferredStore: string;
  ordersCount: number;
  totalSpent: number;
  loyaltyTier: "Bronze" | "Silver" | "Gold" | "Platinum" | "VIP";
  lastOrderDate: string;
  status: "Active" | "Blocked";
  joinedAt: string;
  gender: "Male" | "Female" | "Other" | "Prefer not to say";
  birthday: string;
  preferredLanguage: string;
  notes: string;
  addresses: AddressSnapshot[];
  loyalty: {
    currentPoints: number;
    lifetimePoints: number;
    pointsExpiring: number;
    expiringDate: string;
    tierProgress: number; // 0 to 100
    history: LoyaltyHistoryItem[];
  };
  coupons: CouponItem[];
  notifications: NotificationLog[];
  supportHistory: SupportCase[];
  auditLogs: CustomerAuditLog[];
}

export interface SavedSegment {
  id: string;
  name: string;
  description: string;
  filters: {
    city?: string;
    minSpend?: number;
    minOrders?: number;
    lastOrderDays?: number;
    loyaltyTier?: string;
  };
  isCustom?: boolean;
}

// Task 1.2: demo seeds removed from the production bundle. The CRM starts
// empty and loads only real records persisted by admin actions.

class CustomerDataStorage {
  private customers: CustomerProfile[] = [];
  private segments: SavedSegment[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    // No seed data ships in the bundle: the CRM starts empty and loads only
    // records persisted by admin actions (or stays empty in non-browser envs).
    // Corrupt localStorage entries must never throw at import time — we drop
    // the bad value and continue with an empty array.
    if (typeof window !== "undefined") {
      const storedCustomers = localStorage.getItem("burg_crm_customers");
      const storedSegments = localStorage.getItem("burg_crm_segments");

      if (storedCustomers) {
        try {
          this.customers = JSON.parse(storedCustomers);
        } catch {
          console.warn('[customersData] Corrupt localStorage "burg_crm_customers" — discarding');
          this.customers = [];
        }
      } else {
        this.customers = [];
      }

      if (storedSegments) {
        try {
          this.segments = JSON.parse(storedSegments);
        } catch {
          console.warn('[customersData] Corrupt localStorage "burg_crm_segments" — discarding');
          this.segments = [];
        }
      } else {
        this.segments = [];
      }
    } else {
      this.customers = [];
      this.segments = [];
    }
  }

  private saveToStorage() {
    if (typeof window !== "undefined") {
      localStorage.setItem("burg_crm_customers", JSON.stringify(this.customers));
      localStorage.setItem("burg_crm_segments", JSON.stringify(this.segments));
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.saveToStorage();
    this.listeners.forEach((listener) => listener());
  }

  // Getters
  getCustomers(): CustomerProfile[] {
    return this.customers;
  }

  getCustomersCount(): number {
    return this.customers.length;
  }

  getCustomerById(id: string): CustomerProfile | undefined {
    return this.customers.find((c) => c.id === id);
  }

  getSegments(): SavedSegment[] {
    return this.segments;
  }

  // Setters & Actions
  updateCustomerNotes(id: string, notes: string, operator: string) {
    const cust = this.customers.find((c) => c.id === id);
    if (!cust) return false;

    cust.notes = notes;
    cust.auditLogs.unshift({
      id: `AUD-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().slice(0, 19).replace("T", " "),
      action: "Profile internal notes updated",
      operator,
      ipAddress: "local",
      device: "Admin Panel / Chrome",
    });

    toast.success("Customer internal file notes updated successfully.");
    this.notify();
    return true;
  }

  toggleBlockStatus(id: string, operator: string) {
    const cust = this.customers.find((c) => c.id === id);
    if (!cust) return false;

    cust.status = cust.status === "Active" ? "Blocked" : "Active";
    cust.auditLogs.unshift({
      id: `AUD-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().slice(0, 19).replace("T", " "),
      action: `Account status toggled to ${cust.status.toUpperCase()}`,
      operator,
      ipAddress: "local",
      device: "Admin Panel / Chrome",
    });

    toast.success(`Customer profile status changed to ${cust.status}.`);
    this.notify();
    return true;
  }

  adjustLoyaltyPoints(
    id: string,
    action: "ADD" | "REMOVE" | "EXPIRE",
    amount: number,
    description: string,
    operator: string,
  ) {
    const cust = this.customers.find((c) => c.id === id);
    if (!cust) return false;

    const change = amount;
    if (action === "ADD") {
      cust.loyalty.currentPoints += change;
      cust.loyalty.lifetimePoints += change;
    } else if (action === "REMOVE" || action === "EXPIRE") {
      cust.loyalty.currentPoints = Math.max(0, cust.loyalty.currentPoints - change);
    }

    // Recalculate progress to next tier (hypothetically)
    const points = cust.loyalty.lifetimePoints;
    if (points >= 5000) {
      cust.loyaltyTier = "VIP";
      cust.loyalty.tierProgress = 100;
    } else if (points >= 3000) {
      cust.loyaltyTier = "Platinum";
      cust.loyalty.tierProgress = Math.round(((points - 3000) / 2000) * 100);
    } else if (points >= 1500) {
      cust.loyaltyTier = "Gold";
      cust.loyalty.tierProgress = Math.round(((points - 1500) / 1500) * 100);
    } else if (points >= 500) {
      cust.loyaltyTier = "Silver";
      cust.loyalty.tierProgress = Math.round(((points - 500) / 1000) * 100);
    } else {
      cust.loyaltyTier = "Bronze";
      cust.loyalty.tierProgress = Math.round((points / 500) * 100);
    }

    cust.loyalty.history.unshift({
      id: `L-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().slice(0, 10),
      action,
      points: change,
      description,
      operator,
    });

    cust.auditLogs.unshift({
      id: `AUD-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().slice(0, 19).replace("T", " "),
      action: `Adjusted Loyalty: ${action} ${change} points. Reason: ${description}`,
      operator,
      ipAddress: "local",
      device: "Admin Panel / Chrome",
    });

    toast.success(`Successfully adjusted customer loyalty points balance.`);
    this.notify();
    return true;
  }

  // REMOVED (audit 2026-11-20 §1.7): `adjustLoyaltyTier`, `issueCoupon` and
  // `sendDirectNotification` used to push into the in-memory array and toast a
  // confirmation — "Issued promotional coupon X", "Successfully updated customer
  // loyalty tier", "Direct message pushed over SMS gateway". None of those
  // writes left the browser, so staff were told work had happened that did not.
  //
  //   * issuing a coupon is now real: AdminCustomerProfilePage calls
  //     POST /coupons/issue, which stores a coupon scoped to that customer;
  //   * tier changes are gone (loyalty is not part of the launch);
  //   * "send message" is gone: there is no SMS/WhatsApp/email provider in the
  //     backend, so the app offers no button instead of a false delivery claim.

  createCustomSegment(segment: SavedSegment) {
    this.segments.push(segment);
    toast.success(`Reusable segment "${segment.name}" saved to customer marketing filter-vault.`);
    this.notify();
    return true;
  }

  deleteSegment(id: string) {
    this.segments = this.segments.filter((s) => s.id !== id);
    toast.info("Reusable customer segment deleted.");
    this.notify();
    return true;
  }

  // Broad dispatch notifications (e.g. Campaign broadcasts)
  broadcastCampaign(
    type: "SMS" | "Push" | "WhatsApp" | "Email",
    title: string,
    body: string,
    recipientIds: string[],
    operator: string,
  ) {
    // Loop 61/120 honesty: there is NO SMS/Push/WhatsApp/Email send path —
    // the old code stamped "Delivered", wrote "Received broadcast campaign"
    // audit rows with a hardcoded fake IP, and toasted gateway dispatch
    // that never happened (Loop 22's push-page pattern, here in the CRM).
    // Records are local drafts; the toast says so loudly.
    let draftCount = 0;
    this.customers.forEach((cust) => {
      if (recipientIds.includes(cust.id)) {
        cust.notifications.unshift({
          id: `N-${Date.now().toString().slice(-4)}`,
          type,
          title,
          body,
          sentAt: new Date().toISOString().slice(0, 19).replace("T", " "),
          status: "Draft",
        });
        cust.auditLogs.unshift({
          id: `AUD-${Date.now().toString().slice(-4)}`,
          date: new Date().toISOString().slice(0, 19).replace("T", " "),
          action: `Drafted broadcast campaign (NOT sent — no ${type} channel): "${title}"`,
          operator,
          ipAddress: "local",
          device: "Admin Panel / Chrome",
        });
        draftCount++;
      }
    });

    toast.success(
      `Campaign saved as a local draft for ${draftCount} customers — NOT sent (no ${type} channel wired).`,
    );
    this.notify();
    return true;
  }
}

export const customerStorage = new CustomerDataStorage();
