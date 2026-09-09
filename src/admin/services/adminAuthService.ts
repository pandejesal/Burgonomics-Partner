import { auth, db } from "@/core/config/firebase";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, collection } from "firebase/firestore";
import { getDeviceInfo } from "../../utils/deviceInfo";
import { secureStorage } from "@/core/storage/secureStorage";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  avatar: string | null;
  role: {
    name: string;
    permissions: string[];
  };
  assignedStoreId?: string;
}

export interface LoginResponse {
  accessToken: string;
  admin: AdminUser;
}

// Single generic message for ALL admin login failures — credential
// mismatch, unknown account, and missing admin role read identically, so
// the form is not a user-enumeration oracle. Never surface provider errors.
const GENERIC_ADMIN_ERROR = 'Invalid email or password, or account lacks admin access.';

// Fail-closed allowlist for admin roles. A missing or unrecognized role
// denies login — it must NEVER fall back to a privileged default.
const VALID_ADMIN_ROLES = ['brand_owner', 'developer', 'support', 'regional_manager', 'admin'];

function resolveAdminRole(raw: unknown): string | null {
  const name = typeof raw === 'object' && raw !== null ? (raw as { name?: unknown }).name : raw;
  if (typeof name !== 'string' || !VALID_ADMIN_ROLES.includes(name)) return null;
  return name;
}

// Client-side brute-force backoff: 5 failures → 60s lockout, doubling to
// a 10-minute cap. Server-side attempt lockout still required; this only
// slows credential stuffing from one browser.
const ADMIN_MAX_ATTEMPTS = 5;
const ADMIN_BASE_LOCKOUT_MS = 60_000;
const ADMIN_MAX_LOCKOUT_MS = 10 * 60_000;
let adminFailedAttempts = 0;
let adminLockedUntil: number | null = null;

function checkAdminRateLimit(): void {
  if (adminLockedUntil != null && Date.now() < adminLockedUntil) {
    const secs = Math.ceil((adminLockedUntil - Date.now()) / 1000);
    throw new Error(`${GENERIC_ADMIN_ERROR} Too many attempts — try again in ${secs}s.`);
  }
}

function recordAdminFailure(): void {
  adminFailedAttempts += 1;
  if (adminFailedAttempts >= ADMIN_MAX_ATTEMPTS) {
    const exp = adminFailedAttempts - ADMIN_MAX_ATTEMPTS;
    adminLockedUntil = Date.now() + Math.min(ADMIN_BASE_LOCKOUT_MS * 2 ** exp, ADMIN_MAX_LOCKOUT_MS);
  }
}

function recordAdminSuccess(): void {
  adminFailedAttempts = 0;
  adminLockedUntil = null;
}

// Admin sessions expire after 12h and are deactivated server-side on
// logout/expiry. The local session id is an untrusted cache entry (see
// secureStorage docs) — the Firestore session doc is the source of truth.
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

class AdminAuthService {
  async login(email: string, password: string): Promise<LoginResponse> {
    checkAdminRateLimit();
    try {
      // Sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Check if they are an admin in Firestore
      const adminDocRef = doc(db, "admins", user.uid);
      const adminDocSnap = await getDoc(adminDocRef);

      if (!adminDocSnap.exists()) {
        await signOut(auth);
        recordAdminFailure();
        throw new Error(GENERIC_ADMIN_ERROR);
      }

      const adminData = adminDocSnap.data();

      // Fail-closed role: missing/unknown roles deny, never default.
      const roleName = resolveAdminRole(adminData.role);
      if (!roleName) {
        await signOut(auth);
        console.warn(`[admin-auth] Denying login: unrecognized admin role "${String(adminData.role)}"`);
        recordAdminFailure();
        throw new Error(GENERIC_ADMIN_ERROR);
      }

      const adminUser: AdminUser = {
        id: user.uid,
        email: user.email || email,
        fullName: adminData.fullName || "Admin",
        avatar: adminData.avatar || null,
        role: {
          name: roleName,
          permissions: adminData.permissions || ["admin.system", "admin.stores", "admin.orders"],
        },
      };

      const accessToken = await user.getIdToken();

      // Session Tracking (expires; server doc is the source of truth)
      const { device, browser, os } = getDeviceInfo();
      const sessionRef = doc(collection(db, "admins", user.uid, "sessions"));
      const nowIso = new Date().toISOString();
      await setDoc(sessionRef, {
        id: sessionRef.id,
        device,
        browser,
        os,
        active: true,
        createdAt: nowIso,
        lastSeen: nowIso,
        expiresAt: new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString(),
      });
      await secureStorage.set("admin_session_id", sessionRef.id);

      recordAdminSuccess();
      return {
        accessToken,
        admin: adminUser,
      };
    } catch (error: any) {
      // Single generic message for every failure: no enumeration oracle.
      // (Rate-limit errors already carry the generic prefix + retry hint.)
      if (typeof error?.message === 'string' && error.message.startsWith(GENERIC_ADMIN_ERROR)) {
        throw error;
      }
      recordAdminFailure();
      throw new Error(GENERIC_ADMIN_ERROR);
    }
  }

  async logout(): Promise<void> {
    const user = auth.currentUser;
    const sessionId = await secureStorage.get("admin_session_id");

    if (user && sessionId) {
      try {
        const sessionRef = doc(db, "admins", user.uid, "sessions", sessionId);
        await updateDoc(sessionRef, { active: false });
      } catch (err) {
        console.warn("Failed to deactivate session on logout", err);
      }
    }

    await secureStorage.remove("admin_session_id");
    await signOut(auth);
  }

  async checkAuthState(): Promise<{ admin: AdminUser; accessToken: string } | null> {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
        unsubscribe();
        if (user) {
          try {
            const adminDocRef = doc(db, "admins", user.uid);
            const adminDocSnap = await getDoc(adminDocRef);

            if (adminDocSnap.exists()) {
              const adminData = adminDocSnap.data();
              // Fail-closed role: missing/unknown roles deny, never default.
              const roleName = resolveAdminRole(adminData.role);
              if (!roleName) {
                console.warn(`[admin-auth] Denying bootstrap: unrecognized admin role`);
                resolve(null);
                return;
              }
              // Session expiry: a stale/expired local session id restores
              // nothing — deactivate it server-side and deny.
              const sessionId = await secureStorage.get("admin_session_id");
              if (sessionId) {
                try {
                  const sessionRef = doc(db, "admins", user.uid, "sessions", sessionId);
                  const sessionSnap = await getDoc(sessionRef);
                  const sessionData = sessionSnap.exists() ? sessionSnap.data() : null;
                  const expired =
                    !sessionData ||
                    sessionData.active === false ||
                    (typeof sessionData.expiresAt === 'string' &&
                      Date.parse(sessionData.expiresAt) <= Date.now());
                  if (expired) {
                    try {
                      await updateDoc(sessionRef, { active: false });
                    } catch {
                      /* cleanup best-effort */
                    }
                    await secureStorage.remove("admin_session_id");
                    resolve(null);
                    return;
                  }
                  await updateDoc(sessionRef, { lastSeen: new Date().toISOString() });
                } catch {
                  // Session doc unreadable (offline?) — deny bootstrap rather
                  // than trust the local id.
                  resolve(null);
                  return;
                }
              }
              const accessToken = await user.getIdToken();
              resolve({
                admin: {
                  id: user.uid,
                  email: user.email || "",
                  fullName: adminData.fullName || "Admin",
                  avatar: adminData.avatar || null,
                  role: {
                    name: roleName,
                    permissions: adminData.permissions || [
                      "admin.system",
                      "admin.stores",
                      "admin.orders",
                    ],
                  },
                },
                accessToken,
              });
              return;
            } else {
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
  }
}

export const adminAuthService = new AdminAuthService();
