import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useAuthStore } from "@/stores/authStore";
import { partnerFunctionsApi, type CaptureRecoveryIssue } from "@/services/partnerFunctionsApi";
import { PageHeader } from "../components/Headers";
import { AdminButton } from "../components/Buttons";

const field = "block min-h-10 w-full rounded border border-current bg-transparent px-2";

function IssueForm({ issue, onChange }: { issue: CaptureRecoveryIssue; onChange: (message: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const conflict = issue.conflict;
  const pending = issue.pendingRegeneration;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      let message = "Capture resolved and audit recorded.";
      if (pending) {
        const result = await partnerFunctionsApi.retryCaptureRegeneration(issue.orderId);
        message = result.regenerationPending ? "Regeneration is still pending." : "Statement regeneration complete.";
      } else if (issue.status === "conflict" && conflict) {
        const result = await partnerFunctionsApi.reconcileCaptureMonth({
          orderId: issue.orderId, keepMonth: String(data.get("keepMonth")), reason: String(data.get("reason")),
        });
        message = result.regenerationPending ? "Conflict closed. Regeneration is pending." : "Conflict closed and audit recorded.";
      } else {
        const capturedAtMs = Date.parse(`${String(data.get("capturedAt"))}+05:30`);
        if (!Number.isFinite(capturedAtMs)) throw new Error("Enter the verified capture date and time in IST.");
        await partnerFunctionsApi.resolveCapture({ orderId: issue.orderId, razorpayPaymentId: issue.paymentId, capturedAtMs, reason: String(data.get("reason")) });
      }
      await onChange(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capture recovery request failed.");
    } finally { setBusy(false); }
  }

  return (
    <li className="border-b border-current/20 py-5">
      <h2 className="break-words text-base font-semibold">Order {issue.orderId}</h2>
      <p className="break-words text-sm">Razorpay payment: {issue.paymentId}</p>
      {pending && <p className="mt-2 text-sm font-medium">Regeneration pending: {pending.months.join(", ")}</p>}
      {!pending && issue.status === "open" && <p className="text-sm">Provider state: {issue.providerStatus || "Unknown"}</p>}
      <form onSubmit={submit} className="mt-3 grid max-w-xl gap-3">
        {!pending && (issue.status === "conflict" && conflict ? (
          <label className="grid gap-1 text-sm">
            Settlement month to keep
            <select name="keepMonth" className={field} defaultValue="" required>
              <option value="" disabled>Choose a month</option>
              <option value={conflict.manualMonthKey}>{conflict.manualMonthKey} — held manual month</option>
              <option value={conflict.webhookMonthKey}>{conflict.webhookMonthKey} — signed webhook month</option>
            </select>
          </label>
        ) : (
          <label className="grid gap-1 text-sm">
            Verified capture date and time (IST)
            <input name="capturedAt" type="datetime-local" step="1" className={field} required />
          </label>
        ))}
        {!pending && <label className="grid gap-1 text-sm">Reason (required)<textarea name="reason" className={field} rows={2} maxLength={500} required /></label>}
        {error && <p role="alert" className="text-sm">{error}</p>}
        <div><AdminButton type="submit" disabled={busy}>
          {busy ? "Working…" : pending ? "Retry regeneration" : issue.status === "conflict" ? "Reconcile conflict" : "Resolve capture"}
        </AdminButton></div>
      </form>
    </li>
  );
}

function CaptureIssueList() {
  const [issues, setIssues] = useState<CaptureRecoveryIssue[] | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { setIssues((await partnerFunctionsApi.listCaptureIssues()).issues); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load capture recovery issues."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const update = async (message: string) => { setStatus(message); await load(); };
  return (
    <section className="max-w-4xl space-y-4">
      <PageHeader title="Settlement capture recovery" description="Resolve missing capture times or review a settlement-month conflict. This does not record a payout." />
      <AdminButton variant="outline" onClick={() => void load()}>Refresh issues</AdminButton>
      <p role="status" className="text-sm">{status || (!issues && !error ? "Loading capture issues…" : "")}</p>
      {error && <p role="alert" className="text-sm">{error}</p>}
      {issues?.length === 0 && <p>No capture issues need action.</p>}
      {issues && <ul>{issues.map(issue => <IssueForm key={`${issue.id}:${issue.status}`} issue={issue} onChange={update} />)}</ul>}
    </section>
  );
}

export default function SettlementIssuesPage() {
  const role = useAuthStore(state => state.user?.role);
  if (Capacitor.isNativePlatform() || (role !== "brand_owner" && role !== "developer")) return <Navigate to="/admin" replace />;
  return <CaptureIssueList />;
}
