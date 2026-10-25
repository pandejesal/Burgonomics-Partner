import React, { useState, useEffect } from "react";
import { Terminal, Key } from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard } from "../components/Cards";
import { ResponsiveTable, TableColumn } from "../components/TableSystem";
import { PermissionChip } from "../components/Badges";
import { db } from "@/core/config/firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";

interface AuditLog {
  id: string;
  adminEmail: string;
  action: string;
  resource: string;
  // The server audit writer records no client IP — absent rows render "—".
  ipAddress?: string;
  createdAt: string;
}

export const AdminDeveloperPage: React.FC = () => {
  // #31: live server rows only — no fixtures. The old page rendered a
  // fabricated sample roster (fake admin emails/IPs/severity) whenever the
  // collection was empty, denied, or offline. Nothing is invented here: the
  // table shows server rows or an explicit not-connected state (P1-11 pattern).
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [source, setSource] = useState<"loading" | "live" | "empty" | "unavailable">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "admin_audit_logs"), orderBy("createdAt", "desc"), limit(100))
        );
        if (cancelled) return;
        const rows: AuditLog[] = [];
        snap.forEach((d) => {
          const v = d.data() as any;
          const ts = v?.createdAt;
          rows.push({
            id: d.id,
            adminEmail: v?.actorEmail || v?.actorUid || "server",
            action: String(v?.action || "UNKNOWN"),
            resource: `${v?.targetType || "—"}:${v?.targetId || "—"}`,
            // No client IP is recorded server-side — leave it unset.
            createdAt:
              ts && typeof ts.toMillis === "function"
                ? new Date(ts.toMillis()).toISOString().slice(0, 16).replace("T", " ")
                : String(ts || ""),
          });
        });
        if (rows.length > 0) {
          setLogs(rows);
          setSource("live");
        } else {
          setLogs([]);
          setSource("empty");
        }
      } catch {
        if (!cancelled) {
          setLogs([]);
          setSource("unavailable");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const columns: TableColumn<AuditLog>[] = [
    {
      header: "Log Sequence ID",
      accessorKey: "id",
      cell: (row) => <span className="font-mono font-bold text-gray-500">{row.id}</span>,
    },
    {
      header: "Administrator Identity",
      accessorKey: "adminEmail",
      cell: (row) => (
        <span className="font-bold text-gray-900 dark:text-white">{row.adminEmail}</span>
      ),
    },
    {
      header: "Action Dispatch",
      accessorKey: "action",
      cell: (row) => <PermissionChip permission={row.action} />,
    },
    {
      header: "Affected Resource",
      accessorKey: "resource",
    },
    {
      header: "IP Address",
      accessorKey: "ipAddress",
      cell: (row) => (
        <code className="text-xs font-mono bg-gray-50 dark:bg-gray-900 px-1.5 py-0.5 rounded-md text-gray-400">
          {row.ipAddress || "—"}
        </code>
      ),
    },
    {
      header: "Event Timestamp",
      accessorKey: "createdAt",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Developer Audit Logging Core"
        description={
          source === "live"
            ? "Live server audit rows (admin_audit_logs) — recorded by refunds, role changes, coin adjustments, and staff invites."
            : source === "loading"
              ? "Loading the server audit log…"
              : source === "empty"
                ? "No audit rows recorded yet — admin_audit_logs is empty. Rows appear here once the server records an event."
                : "Server audit log unavailable — admin_audit_logs could not be read. No rows are shown."
        }
        breadcrumbs={[{ label: "Developer Audit" }]}
      />

      {(source === "empty" || source === "unavailable") && (
        <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-4">
          <p className="text-xs font-semibold text-gray-400">
            {source === "empty"
              ? "No server audit rows are recorded yet — nothing is shown until admin_audit_logs has entries."
              : "The server audit log could not be read (denied, offline, or missing index). No rows are shown and nothing is invented."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard
          title="Audit Trail Rows"
          value={logs.length}
          icon={Terminal}
          subtext={
            source === "live"
              ? "Live rows from admin_audit_logs"
              : source === "loading"
                ? "Loading…"
                : "No rows recorded or readable"
          }
        />
        <StatCard
          title="Log Source"
          value={source === "live" ? "LIVE" : source === "loading" ? "…" : "NONE"}
          icon={Key}
          subtext="admin_audit_logs (brand-owner read)"
        />
      </div>

      <ResponsiveTable
        data={logs}
        columns={columns}
        searchPlaceholder="Filter security audit trail by admin email, action type..."
        searchFields={["adminEmail", "action", "resource"]}
        exportFileName="developer-audit-logs"
      />
    </div>
  );
};
