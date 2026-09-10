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

// Canonical admin roles (references/rbac.md, snake_case). login() and
// checkAuthState() both deny unknown roles — a restore path must never be
// more permissive than the login path.
const KNOWN_ADMIN_ROLES = [
  "brand_owner",
  "developer",
  "regional_manager",
  "support",
  "branch_owner",
  "branch_staff",
];

class AdminAuthService {
  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      // Sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Check if they are an admin in Firestore
      const adminDocRef = doc(db, "admins", user.uid);
      const adminDocSnap = await getDoc(adminDocRef);

      if (!adminDocSnap.exists()) {
        await signOut(auth);
        throw new Error("Access Denied: You do not have administrative privileges.");
      }

      const adminData = adminDocSnap.data();

      // Loop 7: fail CLOSED on missing/malformed role — the old default
      // granted Developer (top privilege) to any admins/{uid} doc without a
      // role field. Unknown roles deny login; ops must provision explicitly.
      if (!adminData.role || !KNOWN_ADMIN_ROLES.includes(adminData.role)) {
        await signOut(auth);
        throw new Error(
          "Access Denied: admin role is missing or unrecognized — contact Brand to provision access."
        );
      }

      const adminUser: AdminUser = {
        id: user.uid,
        email: user.email || email,
        fullName: adminData.fullName || "Admin",
        avatar: adminData.avatar || null,
        role: {
          name: adminData.role,
          permissions: Array.isArray(adminData.permissions) ? adminData.permissions : [],
        },
      };

      const accessToken = await user.getIdToken();

      // Session Tracking (best-effort): admins/{uid}/sessions is server-minted
      // only (firestore.rules denies client writes until the batch 4Z/5
      // server mint lands). A denied write must never fail the login itself.
      const { device, browser, os } = getDeviceInfo();
      try {
        const sessionRef = doc(collection(db, "admins", user.uid, "sessions"));
        await setDoc(sessionRef, {
          id: sessionRef.id,
          device,
          browser,
          os,
          ip: "Unknown",
          country: "Unknown",
          active: true,
          lastSeen: new Date().toISOString(),
        });
        await secureStorage.set("admin_session_id", sessionRef.id);
      } catch (sessionErr) {
        console.warn("Admin session tracking unavailable (server mint pending), login continues:", sessionErr);
      }

      return {
        accessToken,
        admin: adminUser,
      };
    } catch (error: any) {
      if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/user-not-found" ||
        error.code === "auth/wrong-password"
      ) {
        throw new Error("Invalid email or password.");
      }
      throw error;
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
              // Loop 7: restore path matches login() strictness — an admins
              // doc with a missing/unrecognized role restores nothing
              // (fail closed), never a session with default permissions.
              if (!adminData.role || !KNOWN_ADMIN_ROLES.includes(adminData.role)) {
                resolve(null);
                return;
              }
              const accessToken = await user.getIdToken();
              resolve({
                admin: {
                  id: user.uid,
                  email: user.email || "",
                  fullName: adminData.fullName || "Admin",
                  avatar: adminData.avatar || null,
                  role: {
                    name: adminData.role,
                    permissions: Array.isArray(adminData.permissions) ? adminData.permissions : [],
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
