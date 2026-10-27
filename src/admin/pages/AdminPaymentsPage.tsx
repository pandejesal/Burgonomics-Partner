import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CreditCard,
  Search,
  Filter,
  Download,
  RefreshCw,
  TrendingUp,
  CheckCircle,
  Clock,
  AlertOctagon,
  FileSpreadsheet,
  Eye,
  ShieldCheck,
  ShieldAlert,
  Play,
  Pause,
  AlertTriangle,
  User,
  Store as StoreIcon,
  HelpCircle,
  DollarSign,
  Undo2,
  Percent,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { StatusBadge } from "../components/Badges";
import { paymentStorage, PaymentTransaction, TransactionDetails } from "./paymentsData";
import { adminPaymentsService } from "../services/adminPaymentsService";
import { useAdmin } from "../hooks/useAdmin";
import { useStores } from "../dashboard/hooks/useDashboardData";
import { buildStoreOptions } from "./AdminOrdersPage";
import { toast } from "sonner";

export interface AdminPaymentsPageProps {
  initialTxns?: TransactionDetails[];
  initialStreamError?: string | null;
}

export const AdminPaymentsPage: React.FC<AdminPaymentsPageProps> = ({
  initialTxns,
  initialStreamError = null,
}) => {
  const { role, isDeveloper } = useAdmin();

  // Real-time state subscription
  const [txns, setTxns] = useState<TransactionDetails[]>(initialTxns || []);
  const [streamError, setStreamError] = useState<string | null>(initialStreamError);
  useEffect(() => {
    if (initialTxns) return;
    const unsubscribe = adminPaymentsService.listenLiveTransactions(
      (data) => {
        setTxns(data);
        setStreamError(null);
      },
      (err) => {
        console.error("Live transaction listener error:", err);
        const msg = err instanceof Error ? err.message : "Failed to connect to live payment stream.";
        setStreamError(msg);
        toast.error("Failed to connect to live payment stream.");
      },
      200,
    );
    return () => unsubscribe();
  }, [initialTxns]);

  const { data: storeDirectory = [] } = useStores();
  const storeOptions = useMemo(
    () => buildStoreOptions(storeDirectory, txns),
    [storeDirectory, txns],
  );

  // Search & Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStore, setSelectedStore] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedGateway, setSelectedGateway] = useState("all");
  const [selectedMethod, setSelectedMethod] = useState("all");
  const [selectedDate, setSelectedDate] = useState("all");
  const [amountRange, setAmountRange] = useState("all");

  // Dynamic date bounds for filters/metrics — never hardcoded.
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const yesterdayDate = new Date(now.getTime() - 86400000);
  const yesterdayStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, "0")}-${String(yesterdayDate.getDate()).padStart(2, "0")}`;

  // Live Auto Refresh state (UI only, data is real-time now)
  const [isLiveActive, setIsLiveActive] = useState(true);
  const [pulseLive, setPulseLive] = useState(false);

  // Filter Store Managers to only see their store
  const isStoreManager = role === "branch_owner";
  const managerStoreId = "str_001"; // Burgonomics Navrangpura
  const managerStoreName = "Burgonomics Navrangpura";

  useEffect(() => {
    if (isStoreManager) {
      setSelectedStore(managerStoreId);
    }
  }, [isStoreManager]);

  // Handle Manual Force Sync (Loop 26/120 honesty: the list is live-
  // subscribed, so there is no handshake to run — the old "Mocked for UI
  // feel" timer faked one. This reports actual listener state instead.)
  const handleForceSync = () => {
    toast.success(`Live stream active — ${txns.length} transaction${txns.length === 1 ? "" : "s"} in view.`, {
      description: "Rows update automatically from Firestore; no manual sync needed.",
    });
  };

  // Export functions
  const handleExport = (type: "csv" | "excel") => {
    const header = "Transaction ID,Order Number,Customer,Store,Amount,Status,Gateway,Date";
    const rows = txns.map(
      (t) =>
        `${t.id},${t.orderId},${t.customer.name},${t.store.name},₹${(t.amountPaise / 100).toFixed(2)},${t.status},${t.gateway},${t.createdAt}`,
    );
    // Real files, generated immediately from the live ledger — no fake
    // "thread dispatch" and no text/plain blob misnamed as PDF.
    const content =
      type === "excel"
        ? `<table><thead><tr>${header.split(",").map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.split(",").map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`
        : `${header}\n${rows.join("\n")}`;
    const file = new Blob([content], {
      type: type === "excel" ? "application/vnd.ms-excel" : "text/csv",
    });
    const element = document.createElement("a");
    element.href = URL.createObjectURL(file);
    element.download = `burgonomics-payments-export.${type === "excel" ? "xls" : "csv"}`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success(`Downloaded ${txns.length} transaction${txns.length === 1 ? "" : "s"} as ${type.toUpperCase()}.`);
  };

  // Filtered Payments list
  const filteredTxns = useMemo(() => {
    return txns.filter((t) => {
      // Store Manager restriction
      if (isStoreManager && t.store.id !== managerStoreId) {
        return false;
      }

      // Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          t.id.toLowerCase().includes(query) ||
          t.orderId.toLowerCase().includes(query) ||
          t.gatewayPaymentId.toLowerCase().includes(query) ||
          t.customer.name.toLowerCase().includes(query) ||
          t.customer.phone.toLowerCase().includes(query) ||
          t.customer.email.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Store Filter
      if (selectedStore !== "all" && t.store.id !== selectedStore) return false;

      // Status Filter
      if (selectedStatus !== "all" && t.status !== selectedStatus) return false;

      // Gateway Filter
      if (selectedGateway !== "all") {
        if (selectedGateway === "UPI" && !t.gateway.includes("UPI")) return false;
        if (selectedGateway === "Card" && !t.gateway.includes("Card")) return false;
        if (selectedGateway === "Netbanking" && !t.gateway.includes("Netbanking")) return false;
      }

      // Date Filter
      if (selectedDate !== "all") {
        const datePart = t.createdAt.split(" ")[0];
        if (selectedDate === "today" && datePart !== todayStr) return false;
        if (selectedDate === "yesterday" && datePart !== yesterdayStr) return false;
      }

      // Amount Range
      if (amountRange !== "all") {
        const amountRs = t.amountPaise / 100;
        if (amountRange === "under250" && amountRs >= 250) return false;
        if (amountRange === "250-500" && (amountRs < 250 || amountRs > 500)) return false;
        if (amountRange === "over500" && amountRs <= 500) return false;
      }

      return true;
    });
  }, [
    txns,
    searchQuery,
    selectedStore,
    selectedStatus,
    selectedGateway,
    selectedDate,
    amountRange,
    isStoreManager,
  ]);

  // Aggregate Metrics based on filtered list
  const metrics = useMemo(() => {
    const list = filteredTxns;

    const todayRevenue =
      list
        .filter((t) => t.status === "CAPTURED" && t.createdAt.startsWith(todayStr))
        .reduce((sum, t) => sum + t.amountPaise, 0) / 100;

    const yesterdayRevenue =
      list
        .filter((t) => t.status === "CAPTURED" && t.createdAt.startsWith(yesterdayStr))
        .reduce((sum, t) => sum + t.amountPaise, 0) / 100;

    const successfulCount = list.filter((t) => t.status === "CAPTURED").length;
    const pendingCount = list.filter(
      (t) => t.status === "PENDING" || t.status === "AUTHORIZED",
    ).length;
    const failedCount = list.filter((t) => t.status === "FAILED").length;

    const refundedAmt =
      list
        .filter((t) => t.status === "REFUNDED" || t.status === "PARTIALLY_REFUNDED")
        .reduce((sum, t) => {
          const refundTotal = t.refunds.reduce((s, r) => s + r.amountPaise, 0);
          return sum + refundTotal;
        }, 0) / 100;

    const refundRequestsCount = list.filter((t) =>
      t.refunds.some((r) => r.status === "PENDING"),
    ).length;

    const totalAttempts = list.length;
    const gatewaySuccessRate =
      totalAttempts > 0
        ? (
            (list.filter(
              (t) =>
                t.status === "CAPTURED" ||
                t.status === "REFUNDED" ||
                t.status === "PARTIALLY_REFUNDED",
            ).length /
              totalAttempts) *
            100
          ).toFixed(1)
        : "—";

    // Honest day-over-day delta: null when there is no prior-day data to
    // compare against (no fabricated "+14.2%").
    const revenueDeltaPct =
      yesterdayRevenue > 0
        ? (((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100).toFixed(1)
        : null;

    return {
      todayRevenue,
      successfulCount,
      pendingCount,
      failedCount,
      refundedAmt,
      refundRequestsCount,
      gatewaySuccessRate,
      revenueDeltaPct,
    };
  }, [filteredTxns, todayStr, yesterdayStr]);

  // F10: the drill-down route (/admin/payments/:id) resolves its record from
  // the local demo fixture store, never from the live row rendered above — so
  // it opened a different (fabricated) transaction than the one clicked.
  // Rows therefore report the limitation instead of navigating.
  const handleRowClick = () => {
    toast.info("Row detail is disabled: this screen's detail route renders demo fixtures, not the record above.", {
      description: "Reconciliation and refunds are handled server-side, not from this board.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageHeader
          title="Payment Operations Terminal"
          description={
            isStoreManager
              ? `Reads the Firestore \`payments\` collection for ${managerStoreName}. Detail drill-down and refunds are demo fixtures — no gateway behind them.`
              : "Reads the Firestore `payments` collection (server-written). Capture, verification and refund controls on this board are demo fixtures and move no money."
          }
          breadcrumbs={[{ label: "Payments Center" }]}
          actions={
            <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-black uppercase bg-gray-800 text-amber-300 border border-amber-400/40">
              Demo detail board
            </span>
          }
        />

        {/* Real-time Indicator Panel */}
        <div className="flex flex-wrap items-center gap-3 self-start md:self-center">
          {streamError ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/30 dark:bg-rose-900/20 dark:text-rose-400 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Offline / Restricted</span>
            </div>
          ) : (
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                isLiveActive
                  ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/30 dark:bg-green-900/20 dark:text-green-400"
                  : "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400"
              }`}
            >
              <div className="relative flex h-2 w-2">
                {isLiveActive && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${isLiveActive ? "bg-green-500" : "bg-gray-400"}`}
                ></span>
              </div>
              <span
                className={`font-mono transition-all ${pulseLive ? "text-accent dark:text-accent-light scale-110 font-black" : "text-gray-900 dark:text-white"}`}
              >
                Live
              </span>
              <button
                onClick={() => setIsLiveActive(!isLiveActive)}
                className="ml-2 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                title={isLiveActive ? "Pause auto refresh" : "Resume auto refresh"}
              >
                {isLiveActive ? <Pause size={12} /> : <Play size={12} />}
              </button>
            </div>
          )}

          <AdminButton variant="outline" size="sm" onClick={handleForceSync} className="h-9">
            <RefreshCw size={12} className="mr-1" />
            <span>Force Sync</span>
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
              <p className="font-bold">Live Payment Stream Unavailable</p>
              <p className="text-[11px] text-rose-400/90 mt-0.5">
                {streamError.includes("permission") || streamError.includes("PERMISSION_DENIED")
                  ? "Access restricted: Your account does not have permission to stream live transaction data."
                  : streamError}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Honesty notice: what this board actually reads vs. what is fixture */}
      <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div className="text-xs font-sans leading-relaxed">
          <span className="font-extrabold block">
            Demo detail board — rows do not open a per-transaction record
          </span>
          <span className="text-[11px] block mt-0.5">
            The list above is a live listener on the Firestore{" "}
            <span className="font-mono font-bold">payments</span> collection, which only a
            server payment writer can fill. The drill-down route renders local demo fixtures,
            so it cannot show the row you clicked — it is disabled here. Reconciliation and
            refunds run server-side (Ticket Resolution autoRefund), not from this screen.
          </span>
        </div>
      </div>

      {/* Grid of enterprise cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <AdminCard className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-8 -mt-8" />
          <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">
            TODAY'S REVENUE
          </span>
          <span className="block text-3xl font-black font-mono tracking-tight text-gray-900 dark:text-white mt-1">
            {streamError
              ? "—"
              : `₹${metrics.todayRevenue.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
          </span>
          <div className="flex items-center gap-1 text-[10px] font-black text-primary dark:text-emerald-400 uppercase tracking-wider font-sans mt-3">
            <TrendingUp size={11} />
            <span>
              {streamError
                ? "Stream Unavailable"
                : metrics.revenueDeltaPct === null
                  ? "No prior-day data"
                  : `${Number(metrics.revenueDeltaPct) >= 0 ? "+" : ""}${metrics.revenueDeltaPct}% vs yesterday`}
            </span>
          </div>
        </AdminCard>

        <AdminCard className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl -mr-8 -mt-8" />
          <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">
            GATEWAY STATUS
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black font-mono tracking-tight text-gray-900 dark:text-white">
              {streamError ? "—" : metrics.successfulCount}
            </span>
            <span className="text-xs font-semibold text-gray-400">{streamError ? "" : "Captured"}</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold text-gray-400 mt-3 font-mono">
            {streamError ? (
              <span className="text-rose-400">Unavailable</span>
            ) : (
              <>
                <span className="text-amber-500 flex items-center gap-0.5">
                  <Clock size={10} /> {metrics.pendingCount} Pending
                </span>
                <span className="text-red-500 flex items-center gap-0.5">
                  <AlertOctagon size={10} /> {metrics.failedCount} Failed
                </span>
              </>
            )}
          </div>
        </AdminCard>

        <AdminCard className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl -mr-8 -mt-8" />
          <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">
            REFUNDS OUTFLOW
          </span>
          <span className="block text-3xl font-black font-mono tracking-tight text-gray-900 dark:text-white mt-1">
            {streamError ? "—" : `₹${metrics.refundedAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
          </span>
          <div className="flex items-center gap-2 text-[10px] font-black text-accent dark:text-accent-light uppercase tracking-wider font-mono mt-3">
            <span>{streamError ? "● UNAVAILABLE" : `● ${metrics.refundRequestsCount} ACTIVE REQUESTS`}</span>
          </div>
        </AdminCard>

        <AdminCard className="relative overflow-hidden bg-gradient-to-br from-primary to-[#082915] text-white">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-2xl" />
          <span className="block text-[10px] font-bold text-green-200 uppercase tracking-widest font-mono">
            KPI SUCCESS RATE
          </span>
          <span className="block text-3xl font-black font-mono tracking-tight text-white mt-1">
            {streamError ? "—" : `${metrics.gatewaySuccessRate}%`}
          </span>
          <div className="flex items-center justify-between text-[10px] font-bold text-green-200 uppercase tracking-wider font-sans mt-3">
            <span>{streamError ? "Stream Unavailable" : "Live from Firestore"}</span>
          </div>
        </AdminCard>
      </div>

      {/* Filters Area */}
      <AdminCard className="bg-white dark:bg-[#1A1A1A] p-5">
        <div className="space-y-4 font-sans">
          {/* Main search and export row */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                size={16}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transaction ledger by ID, order reference, customer, mobile..."
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800/80 rounded-2xl py-3 pl-12 pr-4 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#0E4825]/10 dark:focus:ring-emerald-500/10 placeholder-gray-400 dark:text-white"
              />
            </div>

            {/* Export buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleExport("csv")}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800/80 hover:bg-gray-50 dark:hover:bg-gray-900 text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-all shadow-sm"
              >
                <FileSpreadsheet size={13} className="text-primary dark:text-emerald-400" />
                <span>CSV</span>
              </button>
              <button
                onClick={() => handleExport("excel")}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800/80 hover:bg-gray-50 dark:hover:bg-gray-900 text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-all shadow-sm"
              >
                <FileSpreadsheet size={13} className="text-emerald-600" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          {/* Collapsible filters grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-gray-50 dark:border-gray-800/40">
            {/* Store dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                Store Outlet
              </label>
              <select
                disabled={isStoreManager}
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-50 dark:border-gray-800/80 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none dark:text-white disabled:opacity-50"
              >
                <option value="all">All Outlets</option>
                {storeOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                Ledger Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-50 dark:border-gray-800/80 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none dark:text-white"
              >
                <option value="all">All Statuses</option>
                <option value="CAPTURED">CAPTURED (Settled)</option>
                <option value="AUTHORIZED">AUTHORIZED (Held)</option>
                <option value="PENDING">PENDING</option>
                <option value="REFUNDED">REFUNDED</option>
                <option value="PARTIALLY_REFUNDED">PARTIALLY REFUNDED</option>
                <option value="FAILED">FAILED</option>
                <option value="DISPUTED">DISPUTED (Chargeback)</option>
              </select>
            </div>

            {/* Gateway filter */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                Gateway Interface
              </label>
              <select
                value={selectedGateway}
                onChange={(e) => setSelectedGateway(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-50 dark:border-gray-800/80 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none dark:text-white"
              >
                <option value="all">All Gateways</option>
                <option value="UPI">Razorpay UPI</option>
                <option value="Card">Razorpay Card</option>
                <option value="Netbanking">Netbanking</option>
              </select>
            </div>

            {/* Date filter */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                Timestamp Range
              </label>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-50 dark:border-gray-800/80 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none dark:text-white"
              >
                <option value="all">All History</option>
                <option value="today">Today ({todayStr})</option>
                <option value="yesterday">Yesterday ({yesterdayStr})</option>
              </select>
            </div>

            {/* Amount range dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                Amount bracket
              </label>
              <select
                value={amountRange}
                onChange={(e) => setAmountRange(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-50 dark:border-gray-800/80 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none dark:text-white"
              >
                <option value="all">All Amounts</option>
                <option value="under250">Under ₹250.00</option>
                <option value="250-500">₹250.00 - ₹500.00</option>
                <option value="over500">Above ₹500.00</option>
              </select>
            </div>

            {/* Clear Filters Button */}
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchQuery("");
                  if (!isStoreManager) setSelectedStore("all");
                  setSelectedStatus("all");
                  setSelectedGateway("all");
                  setSelectedDate("all");
                  setAmountRange("all");
                  toast.success("Filters reset successfully.");
                }}
                className="w-full h-9 bg-gray-100 dark:bg-gray-900 border border-transparent hover:bg-gray-200 dark:hover:bg-gray-800 text-xs font-extrabold text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-xl transition-all"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      </AdminCard>

      {/* Live Payment Feed */}
      <AdminCard
        title="Ledger Transactions & Webhooks Live Stream"
        subtitle={`Showing ${filteredTxns.length} payment records in real-time sequence`}
      >
        {filteredTxns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center font-sans">
            <div className="h-12 w-12 rounded-2xl bg-gray-50 dark:bg-gray-900 text-gray-300 flex items-center justify-center mb-3">
              <CreditCard size={20} />
            </div>
            <h5 className="text-xs font-bold text-gray-900 dark:text-white">
              {streamError
                ? "Live Transaction Stream Unavailable"
                : "No Transactions Match Filter Criteria"}
            </h5>
            <p className="text-[10px] text-gray-400 mt-1 max-w-sm">
              {streamError
                ? "Live payments data could not be retrieved from Firestore. Check permissions or network connection."
                : "Try broadening your ledger query or adjusting the store selectors."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar rounded-xl border border-gray-100 dark:border-gray-800">
            <table className="w-full text-left border-collapse font-sans text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 text-[10px] font-black uppercase tracking-wider text-gray-400 font-mono">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Order & ID</th>
                  <th className="py-3 px-4">Customer & Phone</th>
                  <th className="py-3 px-4">Store</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Security Check</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/40 font-medium">
                <AnimatePresence initial={false}>
                  {filteredTxns.map((t) => {
                    const amountInRs = t.amountPaise / 100;

                    // Normalize badges status
                    let statusType: "active" | "pending" | "failed" | "warning" = "pending";
                    if (t.status === "CAPTURED") statusType = "active";
                    else if (
                      t.status === "FAILED" ||
                      t.status === "CANCELLED" ||
                      t.status === "EXPIRED"
                    )
                      statusType = "failed";
                    else if (t.status === "REFUNDED" || t.status === "PARTIALLY_REFUNDED")
                      statusType = "warning";
                    else if (t.status === "DISPUTED" || t.status === "CHARGEBACK")
                      statusType = "failed";

                    return (
                      <motion.tr
                        key={t.id}
                        layoutId={t.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="hover:bg-gray-50/20 dark:hover:bg-gray-900/10 transition-colors cursor-not-allowed"
                        onClick={handleRowClick}
                        title="Row detail is a demo fixture view — disabled on live rows"
                      >
                        {/* Timestamp */}
                        <td className="py-4 px-4 font-mono text-[10px] text-gray-400 whitespace-nowrap">
                          {t.createdAt}
                        </td>

                        {/* Order Number & ID */}
                        <td className="py-4 px-4">
                          <span className="block font-black text-gray-900 dark:text-white font-mono">
                            {t.orderId}
                          </span>
                          <span className="block text-[10px] text-gray-400 font-mono mt-0.5">
                            {t.id}
                          </span>
                        </td>

                        {/* Customer & Phone */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <span className="block font-black text-gray-900 dark:text-white">
                            {t.customer.name}
                          </span>
                          <span className="block text-[10px] text-gray-400 font-mono mt-0.5">
                            {t.customer.phone}
                          </span>
                        </td>

                        {/* Store name */}
                        <td className="py-4 px-4 font-bold text-gray-500 whitespace-nowrap">
                          {t.store.name.replace("Burgonomics ", "")}
                        </td>

                        {/* Gateway channel */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 bg-gray-50 dark:bg-gray-950 px-2 py-1 rounded-md font-mono">
                            {t.gateway}
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="py-4 px-4 text-right font-mono font-black text-gray-900 dark:text-white whitespace-nowrap">
                          ₹{amountInRs.toFixed(2)}
                        </td>

                        {/* Status */}
                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          <StatusBadge status={statusType} label={t.status.replace("_", " ")} />
                        </td>

                        {/* Verification Check */}
                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          {t.verificationStatus === "VERIFIED" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 px-2.5 py-1 rounded-full font-mono">
                              <ShieldCheck size={10} />
                              <span>SECURED</span>
                            </span>
                          ) : t.verificationStatus === "FAILED" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-500 bg-red-50 dark:bg-red-950/20 dark:text-red-400 px-2.5 py-1 rounded-full font-mono">
                              <ShieldAlert size={10} />
                              <span>SIG FAIL</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-500 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 px-2.5 py-1 rounded-full font-mono">
                              <Clock size={10} />
                              <span>UNCHECKED</span>
                            </span>
                          )}
                        </td>

                        {/* No drill-down: the detail route is fixture-backed (F10) */}
                        <td className="py-4 px-4 text-center">
                          <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-amber-700 font-mono dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
                            Demo detail off
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
};
export default AdminPaymentsPage;
