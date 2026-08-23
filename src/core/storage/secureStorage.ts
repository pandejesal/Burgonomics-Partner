const NAMESPACE = "burg.partner.secure.";
const memoryFallback = new Map<string, string>();

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    const fullKey = NAMESPACE + key;
    if (typeof window === "undefined") return memoryFallback.get(fullKey) ?? null;
    try {
      return window.localStorage.getItem(fullKey);
    } catch {
      return memoryFallback.get(fullKey) ?? null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    const fullKey = NAMESPACE + key;
    memoryFallback.set(fullKey, value);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(fullKey, value);
    } catch {
      /* quota exceeded or restricted */
    }
  },
  async remove(key: string): Promise<void> {
    const fullKey = NAMESPACE + key;
    memoryFallback.delete(fullKey);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(fullKey);
    } catch {
      /* ignore */
    }
  },
};

export const SECURE_KEYS = {
  ACCESS_TOKEN: "auth.accessToken",
  REFRESH_TOKEN: "auth.refreshToken",
  USER: "auth.user",
} as const;
