import { describe, it, expect, vi, afterEach } from "vitest";
import type { PushLog } from "./marketingData";

// Finding 19.A: push draft logs are persisted on-device through
// marketingStorage. Regression guards for the local-only contract:
// (a) round-trip through localStorage, (b) corrupt payloads are discarded
// instead of throwing, (c) the log is capped so it cannot grow forever.

const PUSH_KEY = "burg_mkt_push_logs";

function makeEntry(seq: number): PushLog {
  return {
    id: `push_test_${seq}`,
    title: `Draft ${seq}`,
    body: "local draft body",
    target: "All Registered Customers",
    sentAt: "2026-10-08 12:00",
    successCount: 0,
    status: "draft",
  };
}

function stubBrowser(backing: Map<string, string>) {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (backing.has(k) ? (backing.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      backing.set(k, v);
    },
    removeItem: (k: string) => {
      backing.delete(k);
    },
  });
  // loadFromStorage() only reads when a window exists (browser contract),
  // and the module reads the bare localStorage global.
  vi.stubGlobal("window", { localStorage: {} });
}

async function freshStorage(backing: Map<string, string>) {
  vi.resetModules();
  stubBrowser(backing);
  const { marketingStorage } = await import("./marketingData");
  return marketingStorage;
}

describe("marketingData push log persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("round-trips a draft through getPushLogs/addPushLog and survives reload", async () => {
    const backing = new Map<string, string>();
    const storage = await freshStorage(backing);
    expect(storage.getPushLogs()).toHaveLength(0);

    const entry = makeEntry(1);
    storage.addPushLog(entry);

    expect(storage.getPushLogs()).toHaveLength(1);
    expect(storage.getPushLogs()[0]).toEqual(entry);
    expect(JSON.parse(backing.get(PUSH_KEY) as string)).toEqual([entry]);

    // A fresh module instance (page refresh) reads the same row back.
    const reloaded = await freshStorage(backing);
    expect(reloaded.getPushLogs()).toHaveLength(1);
    expect(reloaded.getPushLogs()[0].id).toBe(entry.id);
    expect(reloaded.getPushLogs()[0].status).toBe("draft");
  });

  it("discards a corrupt stored payload instead of throwing", async () => {
    const backing = new Map<string, string>([[PUSH_KEY, "{not valid json"]]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = await freshStorage(backing);

    expect(storage.getPushLogs()).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("caps the persisted log at 50 entries, newest first", async () => {
    const backing = new Map<string, string>();
    const storage = await freshStorage(backing);

    for (let i = 1; i <= 55; i++) {
      storage.addPushLog(makeEntry(i));
    }

    const logs = storage.getPushLogs();
    expect(logs).toHaveLength(50);
    expect(logs[0].id).toBe("push_test_55");
    expect(logs[logs.length - 1].id).toBe("push_test_6");
    expect(JSON.parse(backing.get(PUSH_KEY) as string)).toHaveLength(50);
  });
});
