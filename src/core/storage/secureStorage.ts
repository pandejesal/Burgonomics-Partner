/**
 * Client secret storage.
 *
 * SECURITY MODEL (read before storing tokens here):
 * - On native shells (Android/iOS) this is backed by
 *   `@aparajita/capacitor-secure-storage` → Android Keystore / iOS Keychain.
 *   The native projects already register the plugin (`android/capacitor.settings.gradle`)
 *   and Capacitor resolves it at runtime, so values written here land in
 *   platform secure storage, NOT plaintext.
 * - On web (browser preview / PWA) there is no Keychain seam, so this remains
 *   namespaced `window.localStorage` — plaintext and XSS-readable. Never treat
 *   web storage as a security boundary; it is a graceful degradation only.
 * - Legacy values written by the previous localStorage-only builds under this
 *   exact namespace are lifted into secure storage on first native read and
 *   their plaintext twin is removed, so existing sessions migrate cleanly.
 * - Discipline (same as core): NEVER store long-lived secrets here — no Firebase
 *   ID tokens, no refresh tokens, no passwords. Tokens live in Firebase Auth
 *   persistence. Stored values are random session/doc ids validated SERVER-side
 *   on every use (see `adminAuthService.checkAuthState`), with short TTLs
 *   enforced by the owning service — never trusted on presence alone.
 * - `setWithExpiry` / `getWithExpiry` attach a TTL so stale ids fail closed
 *   instead of lingering indefinitely.
 *
 * Callers MUST treat this as async-safe (all methods return Promises) so the
 * native seam can be used without refactors.
 */
import { Capacitor } from "@capacitor/core";

const NAMESPACE = "burg.partner.secure.";
const memoryFallback = new Map<string, string>();

interface ExpiringValue {
  value: string;
  expiresAt: number;
}

function isNativePlatform(): boolean {
  return typeof Capacitor !== "undefined" && Capacitor.isNativePlatform();
}

async function nativePrefGet(fullKey: string): Promise<string | null> {
  if (!isNativePlatform()) return null;
  try {
    const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
    const val = await SecureStorage.get(fullKey);
    return typeof val === "string" ? val : val ? String(val) : null;
  } catch {
    return null;
  }
}

async function nativePrefSet(fullKey: string, value: string): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
    await SecureStorage.set(fullKey, value);
    return true;
  } catch {
    return false;
  }
}

async function nativePrefRemove(fullKey: string): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
    await SecureStorage.remove(fullKey);
    return true;
  } catch {
    return false;
  }
}

function localGet(fullKey: string): string | null {
  if (typeof window === "undefined") return memoryFallback.get(fullKey) ?? null;
  try {
    return window.localStorage.getItem(fullKey);
  } catch {
    return memoryFallback.get(fullKey) ?? null;
  }
}

function localSet(fullKey: string, value: string): void {
  memoryFallback.set(fullKey, value);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(fullKey, value);
  } catch {
    /* quota exceeded or restricted; retained in memoryFallback only */
  }
}

function localRemove(fullKey: string): void {
  memoryFallback.delete(fullKey);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(fullKey);
  } catch {
    /* ignore */
  }
}

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    const fullKey = NAMESPACE + key;
    if (isNativePlatform()) {
      const nativeVal = await nativePrefGet(fullKey);
      if (nativeVal !== null) return nativeVal;
      // Never leave a plaintext twin behind once secure storage is populated.
      const legacy = localGet(fullKey);
      if (legacy !== null) {
        await nativePrefSet(fullKey, legacy);
        localRemove(fullKey);
        return legacy;
      }
      return null;
    }
    return localGet(fullKey);
  },
  async set(key: string, value: string): Promise<void> {
    const fullKey = NAMESPACE + key;
    memoryFallback.set(fullKey, value);
    if (isNativePlatform()) {
      if (await nativePrefSet(fullKey, value)) {
        localRemove(fullKey);
        return;
      }
      // Native write failed — degrade to localStorage rather than drop state.
    }
    localSet(fullKey, value);
  },
  async remove(key: string): Promise<void> {
    const fullKey = NAMESPACE + key;
    memoryFallback.delete(fullKey);
    if (isNativePlatform()) {
      await nativePrefRemove(fullKey);
      localRemove(fullKey);
      return;
    }
    localRemove(fullKey);
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
  DEVICE_TOKEN: "push.deviceToken",
} as const;