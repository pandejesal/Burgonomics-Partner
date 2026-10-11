import { describe, it, expect, vi, afterEach } from "vitest";
import type { CustomerProfile } from "./customersData";

// Loop 61/120: broadcastCampaign has no send path — it must record local
// drafts, never provider deliveries. Regression guard: no "Delivered"
// stamps, no gateway-dispatch claims, no fabricated audit IPs.

// Task 1.2 removed demo seeds from the bundle: the CRM starts empty and only
// loads records persisted under this key, so the test seeds its own customer
// through that same persistence contract instead of re-adding fixtures.
const CUSTOMERS_KEY = "burg_crm_customers";

function makeSeedCustomer(): CustomerProfile {
  return {
    id: `cust_loop61_${Date.now()}`,
    fullName: "Loop 61 Probe",
    phone: "+919000000001",
    email: "loop61.probe@burgonomics.test",
    avatar: "",
    city: "Surat",
    preferredStore: "",
    ordersCount: 1,
    totalSpent: 240,
    loyaltyTier: "Bronze",
    lastOrderDate: "2026-01-05",
    status: "Active",
    joinedAt: "2026-01-01",
    gender: "Prefer not to say",
    birthday: "",
    preferredLanguage: "English",
    notes: "",
    addresses: [],
    loyalty: {
      currentPoints: 10,
      lifetimePoints: 10,
      pointsExpiring: 0,
      expiringDate: "",
      tierProgress: 0,
      history: [],
    },
    coupons: [],
    notifications: [],
    supportHistory: [],
    auditLogs: [],
  };
}

describe("Loop 61: CRM broadcast honesty", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records a draft, not a delivery, with honest audit", async () => {
    const seed = makeSeedCustomer();
    const backing = new Map<string, string>([
      [CUSTOMERS_KEY, JSON.stringify([seed])],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (backing.has(k) ? (backing.get(k) as string) : null),
      setItem: (k: string, v: string) => {
        backing.set(k, v);
      },
      removeItem: (k: string) => {
        backing.delete(k);
      },
    });
    // loadFromStorage() only reads when a window exists (browser contract).
    vi.stubGlobal("window", {});

    const { customerStorage } = await import("./customersData");

    const target = customerStorage.getCustomers()[0];
    expect(target).toBeDefined();
    expect(target.id).toBe(seed.id);
    // The seeded customer starts with nothing — any notification/audit row
    // found below was written by broadcastCampaign during this test.
    expect(target.notifications).toHaveLength(0);
    expect(target.auditLogs).toHaveLength(0);

    const title = `LOOP61-PROBE-${Date.now()}`;
    const ok = customerStorage.broadcastCampaign(
      "Push",
      title,
      "probe body",
      [target.id],
      "loop61-probe",
    );
    expect(ok).toBe(true);
    const fresh = customerStorage.getCustomerById(target.id);
    expect(fresh).toBeDefined();
    expect(fresh?.notifications).toHaveLength(1);
    const note = fresh?.notifications.find((n) => n.title === title);
    expect(note).toBeDefined();
    expect(note?.status).toBe("Draft");
    expect(note?.status).not.toBe("Delivered");
    const audit = fresh?.auditLogs.find((a) => a.action.includes(title));
    expect(audit).toBeDefined();
    expect(audit?.action).toContain("NOT sent");
    expect(audit?.ipAddress).toBe("local");
    expect(audit?.ipAddress).not.toBe("157.34.82.112");
    // The draft also survives through the module's own persistence write.
    const persisted = JSON.parse(backing.get(CUSTOMERS_KEY) as string) as CustomerProfile[];
    expect(persisted[0].notifications.some((n) => n.title === title && n.status === "Draft")).toBe(
      true,
    );
  });
});
