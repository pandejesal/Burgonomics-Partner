import { describe, it, expect } from "vitest";
import { customerStorage } from "./customersData";

// Loop 61/120: broadcastCampaign has no send path — it must record local
// drafts, never provider deliveries. Regression guard: no "Delivered"
// stamps, no gateway-dispatch claims, no fabricated audit IPs.
describe("Loop 61: CRM broadcast honesty", () => {
  it("records a draft, not a delivery, with honest audit", () => {
    const target = customerStorage.getCustomers()[0];
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
    const note = fresh?.notifications.find((n) => n.title === title);
    expect(note).toBeDefined();
    expect(note?.status).toBe("Draft");
    expect(note?.status).not.toBe("Delivered");
    const audit = fresh?.auditLogs.find((a) => a.action.includes(title));
    expect(audit).toBeDefined();
    expect(audit?.action).toContain("NOT sent");
    expect(audit?.ipAddress).not.toBe("157.34.82.112");
  });
});
