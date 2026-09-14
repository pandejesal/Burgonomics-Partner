/**
 * UNTRUSTED client cache — NOT secure storage despite the name.
 *
 * This is plaintext `localStorage` (XSS-readable, no encryption at rest).
 * Discipline (same as core):
 * - NEVER store long-lived secrets here: no Firebase ID tokens, no refresh
 *   tokens, no passwords. Tokens live in Firebase Auth persistence.
 * - Stored values are random session/doc ids validated SERVER-side on every
 *   use (see `adminAuthService.checkAuthState`), with short TTLs enforced by
 *   the owning service — never trusted on presence alone.
 * - `setWithExpiry` / `getWithExpiry` attach a TTL so stale ids fail closed
 *   instead of lingering indefinitely.
 */
const NAMESPACE = "burg.partner.secure.";
const memoryFallback = new Map<string, string>();

interface ExpiringValue {
  value: string;
  expiresAt: number;
}

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
  /** Store a value that expires after `ttlMs`. Expired values read as null. */
  async setWithExpiry(key: string, value: string, ttlMs: number): Promise<void> {
    const payload: ExpiringValue = { value, expiresAt: Date.now() + ttlMs };
    await this.set(key, JSON.stringify(payload));
  },
  /** Read an expiring value; returns null when missing, corrupt, or expired. */
  async getWithExpiry(key: string): Promise<string | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as ExpiringValue;
      if (typeof parsed.expiresAt !== "number" || Date.now() > parsed.expiresAt) {
        await this.remove(key);
        return null;
      }
      return parsed.value;
    } catch {
      // Legacy plain value without envelope — fail closed, drop it.
      await this.remove(key);
      return null;
    }
  },
};

export const SECURE_KEYS = {
  ACCESS_TOKEN: "auth.accessToken",
  REFRESH_TOKEN: "auth.refreshToken",
  USER: "auth.user",
} as const;
