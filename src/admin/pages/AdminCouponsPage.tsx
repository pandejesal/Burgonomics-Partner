import React from "react";
import { Gift, Plus, ToggleLeft, ToggleRight, Percent, Sparkles } from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard } from "../components/Cards";
import { ResponsiveTable, TableColumn } from "../components/TableSystem";
import { StatusBadge } from "../components/Badges";
import { AdminButton } from "../components/Buttons";

interface Coupon {
  id: string;
  code: string;
  discountType: "Percentage" | "Flat INR";
  discountValue: number;
  minOrderValue: number;
  status: "Active" | "Inactive";
  expiryDate: string;
}

const INITIAL_COUPONS: Coupon[] = [
  {
    id: "CPN-101",
    code: "DAMNGOOD50",
    discountType: "Percentage",
    discountValue: 50,
    minOrderValue: 299,
    status: "Active",
    expiryDate: "2026-12-31",
  },
  {
    id: "CPN-102",
    code: "BURGERLOVE",
    discountType: "Flat INR",
    discountValue: 100,
    minOrderValue: 499,
    status: "Active",
    expiryDate: "2026-10-31",
  },
  {
    id: "CPN-103",
    code: "FREEPERIPERI",
    discountType: "Percentage",
    discountValue: 100,
    minOrderValue: 350,
    status: "Inactive",
    expiryDate: "2026-06-30",
  },
];

// F11: this directory is bundled sample data. Nothing on this screen writes
// Firestore, and checkout validates codes server-side against the /coupons
// collection (functions pricing.engine) — so a local toggle would claim to
// block customer usage it never reaches. Controls stay disabled with the
// reason stated rather than mutating rows that reset on reload.
const COUPONS_DISABLED_REASON =
  "Sample data — this screen does not read or write the Firestore /coupons collection, so toggling here would not affect checkout.";

export const AdminCouponsPage: React.FC = () => {
  const coupons = INITIAL_COUPONS;

  const activeCount = coupons.filter((c) => c.status === "Active").length;

  const columns: TableColumn<Coupon>[] = [
    {
      header: "Promo Code",
      accessorKey: "code",
      cell: (row) => (
        <code className="text-sm font-black font-mono bg-orange-50 dark:bg-orange-950/20 px-2 py-1 rounded-lg border border-orange-200/50 text-accent dark:text-accent-light">
          {row.code}
        </code>
      ),
    },
    {
      header: "Type",
      accessorKey: "discountType",
    },
    {
      header: "Value",
      accessorKey: "discountValue",
      cell: (row) => (
        <span className="font-mono font-bold">
          {row.discountType === "Percentage"
            ? `${row.discountValue}% OFF`
            : `₹${row.discountValue} OFF`}
        </span>
      ),
    },
    {
      header: "Min cart required",
      accessorKey: "minOrderValue",
      cell: (row) => <span className="font-mono text-gray-500">₹{row.minOrderValue}</span>,
    },
    {
      header: "Valid Untill",
      accessorKey: "expiryDate",
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: (row) => (
        <StatusBadge status={row.status === "Active" ? "active" : "inactive"} label={row.status} />
      ),
    },
    {
      header: "State (read-only)",
      accessorKey: "operations",
      sortable: false,
      cell: (row) => (
        <button
          disabled
          className="p-1.5 cursor-not-allowed opacity-50"
          title={`${COUPONS_DISABLED_REASON} Coupon ${row.code} is ${row.status} in the sample data.`}
          aria-disabled="true"
        >
          {row.status === "Active" ? (
            <ToggleRight size={28} className="text-primary" />
          ) : (
            <ToggleLeft size={28} className="text-gray-300" />
          )}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promo Coupons & Offers"
        description="Sample coupon directory — these three rows are bundled fixtures, not the Firestore /coupons collection that checkout validates against."
        breadcrumbs={[{ label: "Coupons" }]}
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-black uppercase bg-gray-800 text-amber-300 border border-amber-400/40">
              Sample data
            </span>
            <AdminButton
              variant="secondary"
              size="sm"
              disabled
              title="Creation is not wired: this screen never writes the Firestore /coupons collection, and no client create route exists for it."
            >
              <Plus size={14} />
              <span>Create Promo Coupon</span>
            </AdminButton>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard title="Total Promo Codes" value={coupons.length} icon={Gift} />
        <StatCard
          title="Active Coupons"
          value={`${activeCount} / ${coupons.length}`}
          icon={Percent}
        />
      </div>

      <ResponsiveTable
        data={coupons}
        columns={columns}
        searchPlaceholder="Search promo directory by discount code..."
        searchFields={["code", "discountType"]}
        exportFileName="promos-manifest"
      />

      {/* F11: the confirm-dialog toggle flow was removed with the disabled
          control — it mutated only this component's local array, then told
          the operator customer checkout would start blocking the code. */}
      <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs font-sans leading-relaxed text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
        <Percent size={15} className="mt-0.5 shrink-0" />
        <div>
          <span className="font-extrabold block">
            Why creating and toggling are switched off
          </span>
          <span className="text-[11px] block mt-0.5">
            Codes are validated by the server pricing engine against the Firestore{" "}
            <span className="font-mono font-bold">/coupons</span> collection. This directory is
            a bundled sample that never reaches that collection, so enabling the controls would
            only change rows that reset on reload while implying customers were blocked.
            Managing live coupons needs a server-backed route for this screen.
          </span>
        </div>
      </div>
    </div>
  );
};
