import React, { useState } from "react";
import { toast } from "sonner";
import { Bell, Send, CheckCircle, Users, Activity, Sparkles, Megaphone } from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard, AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { Timeline, ActivityItem, ConfirmDialog } from "../components/Utilities";
import { partnerFunctionsApi } from "@/services/partnerFunctionsApi";

interface PushLog {
  id: string;
  title: string;
  body: string;
  target: string;
  sentAt: string;
  successCount: number;
  // Loop 22/120 honesty: nothing on this page has ever been dispatched —
  // there is no customer broadcast endpoint. Seeds are fixtures, new rows
  // are local drafts. Never present either as deliveries.
  // Readiness-9: "sent" rows carry SERVER-MEASURED counts from POST
  // /notifications/broadcast (targeted/delivered/failed) — the only rows
  // that may claim a dispatch.
  status: "fixture" | "draft" | "sent";
  targeted?: number;
  failedCount?: number;
}

const INITIAL_PUSH_LOGS: PushLog[] = [
  {
    id: "push_1",
    title: "🍔 Buy 1 Get 1 FREE is Back!",
    body: "Sink your teeth into our legendary Double Veg Supreme. Today only across all outlets!",
    target: "All Registered Customers",
    sentAt: "2026-07-19 12:00",
    successCount: 1420,
    status: "fixture",
  },
  {
    id: "push_2",
    title: "⚡ Weekend Feast Fries Alert!",
    body: "Get a free Peri Peri Fry on checkouts exceeding ₹350. Apply code FREEPERIPERI.",
    target: "Koramangala Bangalore users",
    sentAt: "2026-07-18 17:30",
    successCount: 410,
    status: "fixture",
  },
];

export const AdminNotificationsPage: React.FC = () => {
  const [logs, setLogs] = useState<PushLog[]>(INITIAL_PUSH_LOGS);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("all");
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  // Readiness-9: measured result of the last real broadcast + confirm gate.
  // Broadcasts reach every registered device — never one tap away.
  const [lastResult, setLastResult] = useState<{
    targeted: number;
    successCount: number;
    failureCount: number;
  } | null>(null);
  const [confirmBroadcast, setConfirmBroadcast] = useState(false);

  const handleDispatchPush = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    // Loop 22/120 honest fail-closed: there is NO customer broadcast channel
    // (server dispatch is staff-topics only). Recording a local draft and
    // saying so loudly beats fabricating 1850 deliveries. QUEUED: customer
    // broadcast endpoint (token fan-out).
    setIsSending(true);
    setSendSuccess(false);

    setTimeout(() => {
      const newLog: PushLog = {
        id: `push_${Date.now()}`,
        title,
        body,
        target: target === "all" ? "All Registered Customers" : "High Frequency Buyers",
        sentAt: new Date().toISOString().replace("T", " ").substring(0, 16),
        successCount: 0,
        status: "draft",
      };

      setLogs([newLog, ...logs]);
      setIsSending(false);
      setSendSuccess(true);
      setTitle("");
      setBody("");
    }, 1500);
  };

  // Readiness-9: REAL send through POST /notifications/broadcast. Runs only
  // after the confirm dialog (a broadcast reaches every registered device).
  // Records the server-measured counts — never estimates — and reports
  // failures loudly with no history row written.
  const handleBroadcast = async () => {
    if (!title.trim() || !body.trim() || isSending) return;
    setConfirmBroadcast(false);
    setIsSending(true);
    setSendSuccess(false);
    setLastResult(null);
    try {
      const res = await partnerFunctionsApi.sendBroadcast({
        title: title.trim(),
        body: body.trim(),
      });
      const entry: PushLog = {
        id: res.broadcastId,
        title: title.trim(),
        body: body.trim(),
        target: "All registered devices",
        sentAt: new Date().toISOString().replace("T", " ").substring(0, 16),
        successCount: res.successCount,
        targeted: res.targeted,
        failedCount: res.failureCount,
        status: "sent",
      };
      setLogs([entry, ...logs]);
      setLastResult({
        targeted: res.targeted,
        successCount: res.successCount,
        failureCount: res.failureCount,
      });
      setSendSuccess(true);
      setTitle("");
      setBody("");
    } catch (err) {
      toast.error("Broadcast NOT sent.", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Firebase Push Notification Core"
        description="Craft, design, and dispatch high-relevance push notifications targeting specific user cohorts."
        breadcrumbs={[{ label: "Notifications" }]}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Total Tokens Synced"
          value="—"
          icon={Users}
          subtext="No live token count wired"
        />
        <StatCard title="Avg Delivery Rate" value="—" icon={CheckCircle} subtext="No dispatches yet" />
        <StatCard title="Campaign Drafts" value={logs.length} icon={Megaphone} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Creator panel */}
        <AdminCard
          title="Create FCM Campaign"
          subtitle="Compose a campaign draft — customer broadcast is not wired yet, nothing here is sent"
        >
          <form onSubmit={handleDispatchPush} className="space-y-4 font-sans">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                Target Cohort Segment
              </label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-sm text-gray-800 dark:text-gray-100 focus:outline-none"
              >
                {/* Loop 59/120: no device-target counts — the old labels
                  ("1,850 device targets" / "290 targets") revived the exact
                  fabricated reach Loop 22 removed from the stats. No live
                  token count exists (see stat cards above). */}
                <option value="all">All Registered Customers (no live count)</option>
                <option value="high-buyers">High Frequency Buyers (no live count)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                Campaign Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., 🍔 BOGO Burger Madness is Live!"
                className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-sm text-gray-800 dark:text-gray-100 focus:outline-none"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                Campaign Body Message
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="e.g., Sink your teeth into double-cheese burgers. Use code BOGO at checkout!"
                rows={3}
                className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-sm text-gray-800 dark:text-gray-100 focus:outline-none"
                required
              />
            </div>

            {sendSuccess &&
              (lastResult ? (
                <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle size={15} />
                  <span>
                    Broadcast delivered to {lastResult.successCount} of {lastResult.targeted}{" "}
                    devices
                    {lastResult.failureCount > 0
                      ? ` (${lastResult.failureCount} failed)` : ""}{" "}
                    — server-measured, recorded in history below.
                  </span>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-amber-50 text-amber-800 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle size={15} />
                  <span>Saved as a local draft — NOT dispatched. Use Broadcast below to send.</span>
                </div>
              ))}

            <AdminButton type="submit" variant="secondary" isLoading={isSending} className="w-full">
              <Send size={14} />
              <span>Save Campaign Draft</span>
            </AdminButton>
            {/* Readiness-9: the REAL send — confirm-gated, server-measured. */}
            <AdminButton
              type="button"
              variant="primary"
              isLoading={isSending}
              className="w-full"
              onClick={() => {
                if (!title.trim() || !body.trim()) {
                  toast.error("Write a title and body first.");
                  return;
                }
                setConfirmBroadcast(true);
              }}
            >
              <Megaphone size={14} />
              <span>Broadcast to Devices</span>
            </AdminButton>
            <ConfirmDialog
              isOpen={confirmBroadcast}
              onClose={() => setConfirmBroadcast(false)}
              onConfirm={() => void handleBroadcast()}
              title="Broadcast to all registered devices?"
              description="This sends the campaign above to EVERY registered device right now via POST /notifications/broadcast. Counts reported afterwards are server-measured."
              confirmLabel="Send Broadcast"
              isDestructive
            />
          </form>
        </AdminCard>

        {/* Dispatch Logs timeline */}
        <AdminCard
          title="Draft Log"
          subtitle="Local drafts and fixtures only — nothing here was dispatched"
        >
          <Timeline>
            {logs.map((log) => (
              <ActivityItem
                key={log.id}
                title={log.title}
                description={`${log.body} \nTarget: ${log.target} · ${
                  log.status === "fixture"
                    ? "Fixture entry — never dispatched"
                    : log.status === "sent"
                      ? `Sent to ${log.successCount} of ${log.targeted ?? log.successCount} devices${
                          (log.failedCount ?? 0) > 0 ? ` (${log.failedCount} failed)` : ""
                        } — server-measured`
                      : "Draft — not dispatched"
                }.`}
                time={log.sentAt}
                variant={log.status === "fixture" ? "warning" : log.status === "sent" ? "success" : "info"}
                icon={Bell}
              />
            ))}
          </Timeline>
        </AdminCard>
      </div>
    </div>
  );
};
