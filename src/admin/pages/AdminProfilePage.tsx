import React, { useEffect, useState } from "react";
import { auth } from "@/core/config/firebase";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import {
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  KeyRound,
  History,
  Lock,
  Power,
  RefreshCcw,
  CheckCircle,
  LogOut,
  User,
} from "lucide-react";
import { useAdminAuthStore } from "../store/adminAuthStore";
import { db } from "@/core/config/firebase";
import { toast } from "sonner";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { PageHeader } from "../components/Headers";
import { StatCard, AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { AdminAvatar } from "../components/Utilities";
import { secureStorage } from "@/core/storage/secureStorage";

export const AdminProfilePage: React.FC = () => {
  const { admin } = useAdminAuthStore();
  const [activeTab, setActiveTab] = useState<"security" | "sessions" | "permissions">("security");

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdMessage, setPwdMessage] = useState<{ text: string; type: "success" | "error" } | null>(
    null,
  );

  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin?.id) return;
    const q = query(collection(db, "admins", admin.id, "sessions"), orderBy("lastSeen", "desc"));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      setSessionsError(null);
      const activeSessionId = await secureStorage.get("admin_session_id");
      const loaded = snapshot.docs
        .filter((doc) => doc.data().active === true)
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            device: data.device || "Unknown Device",
            browser: data.browser || "Unknown Browser",
            os: data.os || "Unknown OS",
            ip: data.ip || "Unknown",
            country: data.country || "Unknown",
            active: doc.id === activeSessionId,
            lastSeen:
              doc.id === activeSessionId ? "Just Now" : new Date(data.lastSeen).toLocaleString(),
          };
        });
      // Sort so active session is first
      loaded.sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1));
      setSessions(loaded);
    }, (err) => {
      console.warn('[AdminProfile] sessions listener failed:', err);
      setSessionsError('Could not load sessions. Check connection and permissions.');
    });
    return () => unsubscribe();
  }, [admin?.id]);

  const permissions = admin?.role?.permissions || [];
  const roleName = admin?.role?.name || "Administrator";

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMessage(null);
    if (newPassword !== confirmPassword) {
      setPwdMessage({ text: "Passwords do not match.", type: "error" });
      return;
    }
    if (newPassword.length < 8) {
      setPwdMessage({ text: "New password must be at least 8 characters.", type: "error" });
      return;
    }

    // Loop 53/120: REAL credential change via Firebase (reauth + update).
    // The old handler showed "successfully modified" while changing nothing
    // — staff believed a rotated password while the old one still worked.
    try {
      const fbUser = auth.currentUser;
      const email = admin?.email;
      if (!fbUser || !email) {
        setPwdMessage({ text: "No active session — sign in again.", type: "error" });
        return;
      }
      const cred = EmailAuthProvider.credential(email, currentPassword);
      await reauthenticateWithCredential(fbUser, cred);
      await updatePassword(fbUser, newPassword);
      setPwdMessage({ text: "Password successfully modified!", type: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      const code = err?.code || "";
      setPwdMessage({
        text:
          code.includes("wrong-password") || code.includes("invalid-credential")
            ? "Current password is incorrect."
            : code.includes("weak-password")
              ? "New password is too weak."
              : code.includes("requires-recent-login")
                ? "Session expired — sign in again, then retry."
                : "Password change failed. Please try again.",
        type: "error",
      });
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Admin Profile & Safety"
        description="Verify your authorization permissions, manage multi-factor authentication, modify credentials, and review session histories."
        breadcrumbs={[{ label: "Profile Settings" }]}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Administrative Role" value={roleName} icon={KeyRound} accent={true} />
        <StatCard
          title="Assigned Permissions"
          value={`${permissions.length} Keys`}
          icon={ShieldCheck}
          subtext="Granular security policies active"
        />
        <div className="rounded-[20px] bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 p-6 shadow-sm flex items-center gap-4">
          <AdminAvatar fullName={admin?.fullName} status="online" size="lg" />
          <div>
            <span className="block text-sm font-black text-gray-900 dark:text-white">
              {admin?.fullName}
            </span>
            <span className="block text-xs text-gray-400 mt-0.5">{admin?.email}</span>
            <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-black uppercase tracking-wider text-accent dark:text-accent-light">
              <ShieldCheck size={11} />
              <span>Session Secured</span>
            </span>
          </div>
        </div>
      </div>

      {/* Tabs list */}
      <div className="flex border-b border-gray-100 dark:border-gray-800 gap-6 text-xs font-bold uppercase tracking-wider">
        <button
          onClick={() => setActiveTab("security")}
          className={`pb-3 border-b-2 transition-all cursor-pointer ${activeTab === "security" ? "border-primary text-primary dark:text-emerald-400 dark:border-emerald-400" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          Security & MFA
        </button>
        <button
          onClick={() => setActiveTab("sessions")}
          className={`pb-3 border-b-2 transition-all cursor-pointer ${activeTab === "sessions" ? "border-primary text-primary dark:text-emerald-400 dark:border-emerald-400" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          Active Sessions ({sessions.length})
        </button>
        <button
          onClick={() => setActiveTab("permissions")}
          className={`pb-3 border-b-2 transition-all cursor-pointer ${activeTab === "permissions" ? "border-primary text-primary dark:text-emerald-400 dark:border-emerald-400" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          My Granted Permissions
        </button>
      </div>

      {/* Tab Panels */}
      <div className="space-y-6">
        {activeTab === "security" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Authentication Protocols Card */}
            <AdminCard
              title="Authentication & Security Protocols"
              subtitle="Session state and credential management under Firebase Auth"
            >
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="block text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                        Primary Auth Protocol
                      </span>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-0.5">
                        Firebase Identity Tokens (RSA-256) Active
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-full">
                      <CheckCircle size={12} /> ENFORCED
                    </span>
                  </div>

                  <div className="pt-2 border-t border-gray-200 dark:border-gray-800 text-[11px] text-gray-400 leading-relaxed">
                    Administrative access is authorized via verified Firebase Auth JWT tokens and
                    backed by strict Firestore security rules.
                  </div>
                </div>
              </div>
            </AdminCard>

            {/* Change Password Card */}
            <AdminCard
              title="Modify Account Password"
              subtitle="Routinely rotate password variables to block credential attacks"
            >
              <form onSubmit={handleChangePassword} className="space-y-4">
                {pwdMessage && (
                  <div
                    className={`p-4 rounded-xl text-xs font-semibold border flex items-center gap-2 ${pwdMessage.type === "success" ? "bg-green-50 border-green-100 text-primary" : "bg-red-50 border-red-100 text-red-600"}`}
                  >
                    <CheckCircle size={16} />
                    <span>{pwdMessage.text}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-xs font-semibold focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-xs font-semibold focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-xs font-semibold focus:outline-none"
                    required
                  />
                </div>

                <div className="flex justify-end">
                  <AdminButton type="submit" variant="primary" size="sm">
                    Rotate Password
                  </AdminButton>
                </div>
              </form>
            </AdminCard>
          </div>
        )}

        {activeTab === "sessions" && (
          <AdminCard
            title="Session Monitor"
            subtitle="All active devices authenticated to this administration profile"
          >
            {sessionsError && (
              <p role="alert" className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-600 dark:text-amber-300">
                {sessionsError}
              </p>
            )}
            <div className="divide-y divide-gray-100 dark:divide-gray-800/60 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden bg-white dark:bg-transparent">
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  className="flex justify-between items-center p-4 hover:bg-gray-50/50 dark:hover:bg-gray-900/10 transition-colors"
                >
                  <div className="flex gap-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${sess.active ? "bg-primary/10 text-primary dark:text-emerald-400" : "bg-gray-100 dark:bg-gray-900 text-gray-400"}`}
                    >
                      <Smartphone size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-900 dark:text-white">
                          {sess.os} · {sess.browser}
                        </span>
                        {sess.active && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-[#16A34A] border border-emerald-100">
                            Current Session
                          </span>
                        )}
                      </div>
                      <span className="block text-[11px] text-gray-400 mt-0.5">
                        {sess.ip} · {sess.country} · Seen {sess.lastSeen}
                      </span>
                    </div>
                  </div>
                  {!sess.active && (
                    <button
                      // Loop 53/120 honesty: session docs are server-minted
                      // (rules deny all client writes) — there is no working
                      // terminate path yet, so this says so instead of
                      // silently doing nothing. QUEUED: server session-revoke
                      // endpoint. Meanwhile: signing out everywhere starts
                      // from the login screen's session controls.
                      onClick={() =>
                        toast.error("Session termination is not available yet.", {
                          description:
                            "Session records are server-managed. To lock an account out, revoke its role or contact Brand.",
                        })
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-950/15 transition-colors"
                      title="Terminate Session"
                    >
                      <Power size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </AdminCard>
        )}

        {activeTab === "permissions" && (
          <AdminCard
            title="Effective Access Clearances"
            subtitle="A ledger of RBAC permission nodes validated on this active administrative token"
          >
            <div className="flex flex-wrap gap-2 py-2">
              {permissions.map((p, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-primary/5 hover:text-primary hover:border-primary/20 transition-all cursor-default"
                >
                  {p}
                </span>
              ))}
            </div>
          </AdminCard>
        )}
      </div>
    </div>
  );
};
