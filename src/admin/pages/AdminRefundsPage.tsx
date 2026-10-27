import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  RefreshCw,
  CheckCircle,
  Clock,
  AlertTriangle,
  Play,
  ArrowLeft,
  X,
  User,
  Store,
  DollarSign,
  AlertCircle,
  History,
  ShieldCheck,
  Ban,
  Download,
  Info,
  AlertOctagon,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { StatusBadge } from "../components/Badges";
import { ConfirmDialog } from "../components/Utilities";
import { RefundDetails, PaymentTransaction, RefundStatus } from "./paymentsData";
import { adminPaymentsService } from "../services/adminPaymentsService";
import { partnerFunctionsApi } from "@/services/partnerFunctionsApi";
import { releaseRefundThroughApi } from "../services/refundRelease";
import { filterRefunds, getRefundRowActions, countQuarantinedRefunds } from "./refundsView";
import { checkRefundReleaseReadiness } from "../services/adminRefundContract";
import { useAdmin } from "../hooks/useAdmin";
import { canReleaseRefund, canRejectRefund, canRetryRefund } from "./refundRoles";
import { toast } from "sonner";

export interface AdminRefundsPageProps {
  initialRefunds?: RefundDetails[];
  initialStreamError?: string | null;
}

export const AdminRefundsPage: React.FC<AdminRefundsPageProps> = ({
  initialRefunds,
  initialStreamError = null,
}) => {
  const { role } = useAdmin();

  // Real-time state subscription
  const [refunds, setRefunds] = useState<RefundDetails[]>(initialRefunds || []);
  const [streamError, setStreamError] = useState<string | null>(initialStreamError);
  useEffect(() => {
    if (initialRefunds) return;
    const unsubscribe = adminPaymentsService.listenLiveRefunds(
      (data) => {
        setRefunds(data);
        setStreamError(null);
      },
      (err) => {
        console.error("Live refund listener error:", err);
        const msg = err instanceof Error ? err.message : "Failed to connect to live refund stream.";
        setStreamError(msg);
        toast.error("Failed to connect to live refund stream.");
      },
      100,
    );
    return () => unsubscribe();
  }, [initialRefunds]);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "COMPLETED" | "FAILED" | "REJECTED">("ALL");

  // Modal states
  const [approvingRefund, setApprovingRefund] = useState<RefundDetails | null>(null);
  const [rejectingRefund, setRejectingRefund] = useState<RefundDetails | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  // Loop 5/120: server release in flight — blocks double-submit of the
  // money action (double POST is safe server-side too: idempotent per order).
  const [isReleasing, setIsReleasing] = useState(false);
  const [isSubmittingRejection, setIsSubmittingRejection] = useState(false);

  // RBAC checks — canonical Firestore roles only, matching the server gates
  // (functions/src/index.ts: /payments/refund + /refunds/dispose). The previous
  // comparisons used display strings ("Developer"/"Finance") that never equal a
  // canonical role, so every action was denied. Both predicates fail closed.
  const canRelease = canReleaseRefund(role);
  const canRetry = canRetryRefund(role);
  const canReject = canRejectRefund(role);

  // Filter Refunds
  const filteredRefunds = useMemo(() => {
    return filterRefunds(refunds, { activeTab, searchQuery });
  }, [refunds, searchQuery, activeTab]);

  // Aggregate Metrics based on filtered list
  const metrics = useMemo(() => {
    const list = filteredRefunds;

    const totalCount = list.length;
    const totalVolume = list.reduce((sum, r) => sum + (r.amountPaise ?? 0), 0) / 100;

    const pendingList = list.filter((r) => r.status === "PENDING");
    const pendingCount = pendingList.length;
    const pendingVolume = pendingList.reduce((sum, r) => sum + (r.amountPaise ?? 0), 0) / 100;

    const completedList = list.filter((r) => r.status === "COMPLETED");
    const completedCount = completedList.length;
    const completedVolume = completedList.reduce((sum, r) => sum + (r.amountPaise ?? 0), 0) / 100;

    const failedList = list.filter((r) => r.status === "FAILED");
    const failedCount = failedList.length;
    const failedVolume = failedList.reduce((sum, r) => sum + (r.amountPaise ?? 0), 0) / 100;

    const rejectedList = list.filter((r) => r.status === "REJECTED");
    const rejectedCount = rejectedList.length;
    const rejectedVolume = rejectedList.reduce((sum, r) => sum + (r.amountPaise ?? 0), 0) / 100;

    return {
      totalCount,
      totalVolume,
      pendingCount,
      pendingVolume,
      completedCount,
      completedVolume,
      failedCount,
      failedVolume,
      rejectedCount,
      rejectedVolume,
      // Quarantined rows are counted but never folded into any money column.
      unknownCount: countQuarantinedRefunds(list),
    };
  }, [filteredRefunds]);

  // Handlers
  // Loop 5/120: approve = REAL server release (POST /payments/refund,
  // staff-only, idempotent). The old local-only mutation claimed money moved
  // while Razorpay + Firestore stayed untouched — never again.
  //
  // Both Approve and Retry route through releaseRefundThroughApi, which
  // re-checks readiness (status, gateway id, amount, exact-id key) and exits
  // before any network call when the row is not releasable.
  const releaseRefundServer = async (r: RefundDetails): Promise<boolean> => {
    const outcome = await releaseRefundThroughApi(r);

    if (!outcome.ok) {
      if (outcome.disabledReason) {
        toast.error("Refund release blocked — no money moved.", {
          description: outcome.disabledReason,
        });
      } else {
        toast.error("Refund release failed — no money moved.", {
          description: outcome.error,
        });
      }
      return false;
    }

    toast.success(
      `Refund released via Razorpay${outcome.reused ? " (already processed — idempotent replay)" : ""}.`,
      { description: `Refund ID: ${outcome.id ?? r.id}` },
    );
    return true;
  };

  const handleApproveRelease = async () => {
    if (!approvingRefund || isReleasing) return;

    if (!canRelease) {
      toast.error(
        "Access Denied: Your administrative role is unauthorized to release refund payouts.",
      );
      setApprovingRefund(null);
      return;
    }

    const readiness = checkRefundReleaseReadiness(approvingRefund);
    if (!readiness.canRelease) {
      toast.error("Refund release blocked — no money moved.", {
        description: readiness.disabledReason,
      });
      setApprovingRefund(null);
      return;
    }

    setIsReleasing(true);
    try {
      const ok = await releaseRefundServer(approvingRefund);
      if (ok) setApprovingRefund(null);
    } finally {
      setIsReleasing(false);
    }
  };

  const handleRejectRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingRefund) return;

    if (!canReject) {
      toast.error("Access Denied: Your administrative role is unauthorized to reject refunds.");
      setRejectingRefund(null);
      return;
    }

    if (!rejectionReason.trim()) {
      toast.error("Please supply a reason for rejection.");
      return;
    }

    // Loop 7/120: rejection records server-side via POST /refunds/dispose
    // (closes the Loop 5 carryover). Loud failure, dialog stays open.
    const target = rejectingRefund;
    setIsSubmittingRejection(true);
    try {
      const res = await partnerFunctionsApi.disposeRefund({
        refundId: target.id,
        reason: rejectionReason.trim(),
      });
      setRejectingRefund(null);
      setRejectionReason("");
      toast.success(`Refund request ${res.id} rejected and recorded.`);
    } catch (err) {
      toast.error("Rejection was not recorded — no change was made.", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSubmittingRejection(false);
    }
  };

  // Loop 5/120: retry = re-attempt the REAL server release (idempotent —
  // an already-processed order replays the stored refund instead of double-paying).
  const handleRetryRefund = async (refundId: string) => {
    if (!canRetry) {
      toast.error(
        "Access Denied: Your administrative role is unauthorized to retry refund payouts.",
      );
      return;
    }

    const target = refunds.find((r) => r.id === refundId);
    if (!target) {
      toast.error("Refund row not found — refresh the live stream and retry.");
      return;
    }
    if (isReleasing) return;
    setIsReleasing(true);
    try {
      await releaseRefundServer(target);
    } finally {
      setIsReleasing(false);
    }
  };

  const handleDownloadReport = () => {
    toast.success("Compiling refund reports and audit trail metadata...");
    setTimeout(() => {
      const element = document.createElement("a");
      const file = new Blob(
        [
          "Refund ID,Payment ID,Order Reference,Customer Name,Store Name,Amount,Reason,Status,Processed By,Timestamp\n" +
            refunds
              .map(
                (r) =>
                  `${r.id},${r.paymentId},${r.orderId},"${r.customerName}","${r.storeName}",${r.amountPaise != null ? `₹${(r.amountPaise / 100).toFixed(2)}` : "Unspecified"},"${r.reason}",${r.status},"${r.processedBy}",${r.createdAt}`,
              )
              .join("\n"),
        ],
        { type: "text/plain" },
      );
      element.href = URL.createObjectURL(file);
      element.download = "burgonomics-refunds-ledger.csv";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      toast.success("Refund report downloaded successfully.");
    }, 1000);
  };

  return (
    <div className="space-y-6 font-sans text-xs">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageHeader
          title="Refund Clearance Terminal"
          description={
            canRelease
              ? "Enterprise Refund Control Console. Authorize manager-release payouts, auditing reasons such as duplicate transactions or delivery disputes."
              : "Refund Control Console. Review refund requests — your role has read-only access to payout release and rejection."
          }
          breadcrumbs={[{ label: "Refunds Center" }]}
        />

        <div className="flex gap-2 self-start md:self-center">
          <AdminButton variant="outline" size="sm" onClick={handleDownloadReport}>
            <Download size={13} className="mr-1" />
            <span>Export Refund Ledger</span>
          </AdminButton>
        </div>
      </div>

      {streamError && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-rose-950/30 border border-rose-800/50 text-xs text-rose-300 flex items-center justify-between shadow-sm"
        >
          <div className="flex items-center gap-2">
            <AlertOctagon size={16} className="text-rose-400 shrink-0" />
            <div>
              <p className="font-bold">Live Refund Stream Unavailable</p>
              <p className="text-[11px] text-rose-400/90 mt-0.5">
                {streamError.includes("permission") || streamError.includes("PERMISSION_DENIED")
                  ? "Access restricted: Your account does not have permission to stream live refund data."
                  : streamError}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <AdminCard className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gray-100 rounded-full blur-2xl" />
          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
            TOTAL REFUNDS
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 mt-1 dark:text-white">
            {streamError ? "—" : `₹${metrics.totalVolume.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
          </span>
          <span className="block text-[10px] text-gray-400 font-mono mt-1">
            {streamError ? "Stream Unavailable" : `${metrics.totalCount} overall claims filed`}
          </span>
        </AdminCard>

        <AdminCard className="relative overflow-hidden border-l-4 border-l-accent">
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl" />
          <span className="block text-[9px] font-black text-accent dark:text-accent-light uppercase tracking-widest font-mono">
            AWAITING RELEASE
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 mt-1 dark:text-white">
            {streamError ? "—" : `₹${metrics.pendingVolume.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
          </span>
          <span className="block text-[10px] text-accent dark:text-accent-light font-mono mt-1">
            {streamError ? "Unavailable" : `${metrics.pendingCount} pending authorization`}
          </span>
        </AdminCard>

        <AdminCard className="relative overflow-hidden border-l-4 border-l-[#0E4825]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl" />
          <span className="block text-[9px] font-black text-primary uppercase tracking-widest font-mono">
            COMPLETED SETTLEMENTS
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 mt-1 dark:text-white">
            {streamError ? "—" : `₹${metrics.completedVolume.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
          </span>
          <span className="block text-[10px] text-gray-400 font-mono mt-1">
            {streamError ? "Unavailable" : `${metrics.completedCount} processed back to original sources`}
          </span>
        </AdminCard>

        <AdminCard className="relative overflow-hidden border-l-4 border-l-red-600">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl" />
          <span className="block text-[9px] font-black text-red-600 uppercase tracking-widest font-mono">
            FAILED RE-QUEUES
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 mt-1 dark:text-white">
            {streamError ? "—" : `₹${metrics.failedVolume.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
          </span>
          <span className="block text-[10px] text-gray-400 font-mono mt-1">
            {streamError ? "Unavailable" : `${metrics.failedCount} failed release attempts`}
          </span>
        </AdminCard>
      </div>

      {/* Tab select & Search Filters */}
      <AdminCard className="p-5">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          {/* Tabs */}
          <div className="flex gap-1.5 p-1 bg-gray-50 dark:bg-gray-900/50 rounded-2xl w-full sm:w-auto overflow-x-auto">
            {(["ALL", "PENDING", "COMPLETED", "FAILED", "REJECTED"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all uppercase font-mono ${
                  activeTab === tab
                    ? "bg-primary text-white shadow-sm"
                    : "text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {tab === "ALL" ? "All Payouts" : tab}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search refunds directory by customer, order ID..."
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800/80 rounded-xl py-2 px-4 pl-10 text-xs font-semibold focus:outline-none"
            />
            <Info size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        {metrics.unknownCount > 0 && (
          <p className="mt-3 text-[10px] font-mono text-amber-600 dark:text-amber-400">
            {metrics.unknownCount} refund{metrics.unknownCount === 1 ? "" : "s"} quarantined — status
            missing or unrecognized, no money action available.
          </p>
        )}
      </AdminCard>

      {/* Main Refunds Stream Grid */}
      <AdminCard title="Filing Escalations Folder">
        {filteredRefunds.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <Info size={24} className="mx-auto mb-2 opacity-50" />
            <h5 className="font-bold text-gray-900 dark:text-white text-xs">
              {streamError ? "Live Refund Stream Unavailable" : "No Refund Escalations Found"}
            </h5>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {streamError
                ? "Live refund records could not be retrieved from Firestore. Check permissions or network connection."
                : "There are no active refund requests matching this tab criteria."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredRefunds.map((r) => {
              // One shared decision object drives every money control below —
              // PENDING and FAILED both obey the same readiness gate.
              const actions = getRefundRowActions(r);

              let statusStyle: "active" | "pending" | "failed" | "warning" = "pending";
              if (r.status === "COMPLETED") statusStyle = "active";
              else if (r.status === "FAILED") statusStyle = "failed";
              else if (r.status === "REJECTED" || r.status === "UNKNOWN") statusStyle = "warning";

              const isPending = r.status === "PENDING";
              const isFailed = r.status === "FAILED";

              return (
                <div
                  key={r.id}
                  className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-5 shadow-sm space-y-4 hover:shadow-md transition-all relative overflow-hidden"
                >
                  {/* Top line with refund and order ID */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="block text-[8px] font-black text-gray-400 uppercase tracking-widest font-mono">
                        CLAIM REF ID
                      </span>
                      <span className="font-mono font-black text-gray-900 dark:text-white text-xs block">
                        {r.id}
                      </span>
                    </div>

                    <StatusBadge status={statusStyle} label={r.status} />
                  </div>

                  {/* Customer, store, amount block */}
                  <div className="grid grid-cols-3 gap-3 border-y border-gray-50 dark:border-gray-800/40 py-3 text-xs font-sans">
                    <div>
                      <span className="text-[9px] text-gray-400 uppercase font-bold block">
                        Customer
                      </span>
                      <span className="font-extrabold text-gray-800 dark:text-gray-200 block truncate">
                        {r.customerName || "Unknown Customer"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400 uppercase font-bold block">
                        Store
                      </span>
                      <span className="font-bold text-gray-500 block truncate">
                        {r.storeName ? r.storeName.replace("Burgonomics ", "") : "Unknown Store"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400 uppercase font-bold block">
                        Refund Total
                      </span>
                      <span className="font-black text-gray-900 dark:text-white font-mono block">
                        {r.amountPaise != null ? `₹${(r.amountPaise / 100).toFixed(2)}` : "Amount unspecified"}
                      </span>
                    </div>
                  </div>

                  {/* Reason & processed by details */}
                  <div className="space-y-2 text-[11px] leading-normal text-gray-500 font-sans">
                    <p className="font-medium">
                      <span className="font-black text-gray-900 dark:text-gray-300 font-mono text-[9px] uppercase tracking-wider block">
                        Refund Justification:
                      </span>
                      {r.reason}
                    </p>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[10px] text-gray-400 font-mono gap-1 pt-1">
                      <span>
                        Auth Operator: {r.processedBy ? r.processedBy.replace(" (pandejesal@gmail.com)", "") : "Unknown Processor"}
                      </span>
                      <span>Filed: {typeof r.createdAt === 'string' ? r.createdAt : String(r.createdAt || 'Unknown')}</span>
                    </div>
                    {r.source && (
                      <span className="block text-[10px] text-gray-400 font-mono">
                        Source: {r.source}
                      </span>
                    )}
                  </div>

                  {/* Quarantined status — unrecognized raw status, no money action */}
                  {actions.isQuarantined && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/30 rounded-xl flex gap-2 text-amber-700 dark:text-amber-400">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block text-[10px]">
                          Status unverified — refund quarantined
                        </span>
                        <span className="text-[9px] block mt-0.5 leading-normal">
                          The stored status is missing or unrecognized. No release, retry, or
                          rejection is available until the backend record is reviewed.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Diagnostic details if failed */}
                  {isFailed && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/30 rounded-xl flex gap-2 text-red-700 dark:text-red-400">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block text-[10px]">
                          Gateway status: {r.gatewayStatus || "Failure reason unavailable — inspect the gateway record"}
                        </span>
                        {r.gatewayStatus === "insufficient_merchant_balance" && (
                          <span className="text-[9px] block mt-0.5 leading-normal">
                            The gateway reported insufficient merchant balance. Please refill
                            your merchant balance before retrying release.
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Actions footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-50 dark:border-gray-800/40 gap-2">
                    {r.paymentId ? (
                      <Link
                        to={`/admin/payments/${r.paymentId}`}
                        className="text-[10px] font-black uppercase text-primary dark:text-emerald-400 hover:underline font-mono"
                      >
                        View Original Txn ID
                      </Link>
                    ) : (
                      <span className="text-[10px] font-mono text-gray-400 uppercase">
                        No Gateway Txn ID
                      </span>
                    )}

                    <div className="flex items-center gap-1.5">
                      {actions.canReject && (
                        <button
                          onClick={() => {
                            if (!canReject) {
                              toast.error(
                                "Access Denied: Your administrative role is unauthorized to reject refunds.",
                              );
                              return;
                            }
                            setRejectingRefund(r);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-[10px] font-extrabold uppercase transition-all cursor-pointer min-h-[44px]"
                        >
                          Reject
                        </button>
                      )}

                      {isPending &&
                        (actions.canApprove ? (
                          <button
                            onClick={() => {
                              if (!canRelease) {
                                toast.error(
                                  "Access Denied: Your administrative role is unauthorized to release refunds.",
                                );
                                return;
                              }
                              setApprovingRefund(r);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-[#0B3A1D] text-[10px] font-extrabold uppercase transition-all cursor-pointer shadow-sm min-h-[44px]"
                          >
                            Approve Payout
                          </button>
                        ) : (
                          <button
                            disabled
                            title={actions.releaseDisabledReason}
                            aria-label={actions.releaseDisabledReason}
                            className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 text-[10px] font-extrabold uppercase transition-all cursor-not-allowed opacity-80 min-h-[44px]"
                          >
                            {actions.releaseDisabledLabel ?? "Release Unavailable"}
                          </button>
                        ))}

                      {isFailed &&
                        (actions.canRetry ? (
                          <button
                            onClick={() => handleRetryRefund(r.id)}
                            className="px-3 py-1.5 rounded-lg bg-gray-900 text-white dark:bg-gray-850 hover:bg-gray-800 text-[10px] font-extrabold uppercase transition-all cursor-pointer shadow-sm flex items-center gap-1 min-h-[44px]"
                          >
                            <RefreshCw size={10} />
                            <span>Retry Release</span>
                          </button>
                        ) : (
                          <button
                            disabled
                            title={actions.releaseDisabledReason}
                            aria-label={actions.releaseDisabledReason}
                            className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 text-[10px] font-extrabold uppercase transition-all cursor-not-allowed opacity-80 flex items-center gap-1 min-h-[44px]"
                          >
                            <RefreshCw size={10} />
                            <span>{actions.releaseDisabledLabel ?? "Retry Unavailable"}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminCard>

      {/* Confirmation Dialogs */}
      {approvingRefund && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setApprovingRefund(null)}
          onConfirm={handleApproveRelease}
          title="Authorize Refund Clearance Payout?"
          description={`Are you sure you want to approve the refund payout of ${approvingRefund.amountPaise != null ? `₹${(approvingRefund.amountPaise / 100).toFixed(2)}` : "unspecified amount"} for ${approvingRefund.customerName}? Payout will be processed back via Razorpay API instantly.`}
          confirmLabel={isReleasing ? "Releasing…" : "Approve & Release"}
        />
      )}

      {/* Reject Refund Modal */}
      <AnimatePresence>
        {rejectingRefund && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#1A1A1A] w-full max-w-sm rounded-[20px] p-6 shadow-2xl border border-gray-100 dark:border-gray-800"
            >
              <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800/60 pb-3 mb-4">
                <h3 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tight">
                  Reject Refund Request
                </h3>
                <button
                  onClick={() => setRejectingRefund(null)}
                  className="h-6 w-6 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-900"
                >
                  <X size={12} />
                </button>
              </div>

              <form onSubmit={handleRejectRefund} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                    Rejection Reason
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Specify the reason why this refund request was rejected..."
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-50 dark:border-gray-800/80 rounded-xl p-3 focus:outline-none placeholder-gray-400 leading-normal"
                  />
                </div>

                <div className="flex gap-2 pt-3 border-t border-gray-50 dark:border-gray-800/60">
                  <button
                    type="button"
                    onClick={() => setRejectingRefund(null)}
                    className="flex-1 py-2 text-center font-bold border border-gray-100 dark:border-gray-800 rounded-lg hover:bg-gray-50 text-gray-400"
                  >
                    Cancel
                  </button>
                  <AdminButton
                    type="submit"
                    variant="secondary"
                    isLoading={isSubmittingRejection}
                    className="flex-1 py-2 text-center rounded-lg"
                  >
                    Reject Claim
                  </AdminButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
export default AdminRefundsPage;
