import React, { useCallback, useEffect, useState } from "react";
import { Gift, Plus, ToggleLeft, ToggleRight, Percent, Loader2, BarChart3 } from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard } from "../components/Cards";
import { ResponsiveTable, TableColumn } from "../components/TableSystem";
import { StatusBadge } from "../components/Badges";
import { AdminButton } from "../components/Buttons";
import { toast } from "sonner";
import { partnerFunctionsApi, type PartnerCoupon, type PartnerCouponUsage } from "../../services/partnerFunctionsApi";

/**
 * Coupon manager — REAL as of 2026-11-20.
 *
 * This screen used to be three bundled fixture rows whose own copy said "this
 * screen does not read or write the Firestore /coupons collection" and
 * "Creation is not wired" (audit §1.7). It now reads and writes the ONE
 * server-side coupon authority: list, create, disable/enable and usage all go
 * through /coupons/* routes, which are owner/brand-role only.
 *
 * The app never computes a discount here — every number on this page is what
 * the server stored or counted.
 */

interface CreateForm {
  code: string;
  title: string;
  discountType: "percent" | "flat";
  value: string;
  minOrder: string;
  maxDiscount: string;
  totalCap: string;
  perCustomerLimit: string;
  validTo: string;
}

const EMPTY_FORM: CreateForm = {
  code: "",
  title: "",
  discountType: "flat",
  value: "",
  minOrder: "",
  maxDiscount: "",
  totalCap: "",
  perCustomerLimit: "",
  validTo: "",
};

function optionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

function formatValue(coupon: PartnerCoupon): string {
  return coupon.discountType === "percent"
    ? `${coupon.value}% OFF${coupon.maxDiscount ? ` (max ₹${coupon.maxDiscount})` : ""}`
    : `₹${coupon.value} OFF`;
}

export const AdminCouponsPage: React.FC = () => {
  const [coupons, setCoupons] = useState<PartnerCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [usage, setUsage] = useState<PartnerCouponUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await partnerFunctionsApi.listCoupons();
      setCoupons(Array.isArray(result?.coupons) ? result.coupons : []);
    } catch (err: any) {
      // Honest empty state: an unreadable list is an error, never "no coupons".
      setLoadError(err?.message || "Could not load coupons. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (coupon: PartnerCoupon) => {
    setBusyCode(coupon.code);
    try {
      await partnerFunctionsApi.setCouponActive(coupon.code, !coupon.active);
      toast.success(`${coupon.code} is now ${coupon.active ? "disabled" : "active"}.`);
      await load();
    } catch (err: any) {
      toast.error(err?.message || `Could not update ${coupon.code}.`);
    } finally {
      setBusyCode(null);
    }
  };

  const openUsage = async (coupon: PartnerCoupon) => {
    setUsageLoading(true);
    setUsage({ code: coupon.code, committed: 0, reserved: 0, rows: [] });
    try {
      const result = await partnerFunctionsApi.couponUsage(coupon.code);
      setUsage(result);
    } catch (err: any) {
      toast.error(err?.message || `Could not load usage for ${coupon.code}.`);
      setUsage(null);
    } finally {
      setUsageLoading(false);
    }
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = optionalInt(form.value);
    if (!form.code.trim()) {
      toast.error("A coupon code is required.");
      return;
    }
    if (value === null || value <= 0) {
      toast.error("Enter a discount value greater than zero.");
      return;
    }
    if (form.discountType === "percent" && value > 100) {
      toast.error("A percentage coupon cannot exceed 100%.");
      return;
    }
    setCreating(true);
    try {
      await partnerFunctionsApi.createCoupon({
        code: form.code.trim().toUpperCase(),
        ...(form.title.trim() ? { title: form.title.trim() } : {}),
        discountType: form.discountType,
        value,
        minOrder: optionalInt(form.minOrder) ?? 0,
        maxDiscount: form.discountType === "percent" ? optionalInt(form.maxDiscount) : null,
        totalCap: optionalInt(form.totalCap),
        perCustomerLimit: optionalInt(form.perCustomerLimit),
        validToMs: form.validTo ? new Date(`${form.validTo}T23:59:59`).getTime() : null,
      });
      toast.success(`Coupon ${form.code.trim().toUpperCase()} saved — customers can use it now.`);
      setForm(EMPTY_FORM);
      setShowCreate(false);
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Could not save the coupon.");
    } finally {
      setCreating(false);
    }
  };

  const activeCount = coupons.filter((c) => c.active).length;
  const redeemedCount = coupons.reduce((sum, c) => sum + (c.committed || 0), 0);

  const columns: TableColumn<PartnerCoupon & { id: string }>[] = [
    {
      header: "Promo Code",
      accessorKey: "code",
      cell: (row) => (
        <code className="text-sm font-black font-mono bg-orange-50 dark:bg-orange-950/20 px-2 py-1 rounded-lg border border-orange-200/50 text-accent dark:text-accent-light">
          {row.code}
        </code>
      ),
    },
    { header: "Title", accessorKey: "title" },
    {
      header: "Value",
      accessorKey: "value",
      cell: (row) => <span className="font-mono font-bold">{formatValue(row)}</span>,
    },
    {
      header: "Min order",
      accessorKey: "minOrder",
      cell: (row) => <span className="font-mono text-gray-500">₹{row.minOrder}</span>,
    },
    {
      header: "Used",
      accessorKey: "totalUsed",
      cell: (row) => (
        <span className="font-mono">
          {row.totalUsed}
          {row.totalCap !== null ? ` / ${row.totalCap}` : ""}
        </span>
      ),
    },
    {
      header: "Valid until",
      accessorKey: "validToMs",
      cell: (row) =>
        row.validToMs ? new Date(row.validToMs).toLocaleDateString() : <span className="text-gray-400">No end date</span>,
    },
    {
      header: "Status",
      accessorKey: "active",
      cell: (row) => (
        <StatusBadge status={row.active ? "active" : "inactive"} label={row.active ? "Active" : "Disabled"} />
      ),
    },
    {
      header: "Actions",
      accessorKey: "operations",
      sortable: false,
      cell: (row) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void toggleActive(row)}
            disabled={busyCode === row.code}
            aria-label={row.active ? `Disable ${row.code}` : `Enable ${row.code}`}
            title={row.active ? "Disable this coupon" : "Enable this coupon"}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {busyCode === row.code ? (
              <Loader2 size={22} className="animate-spin text-gray-400" />
            ) : row.active ? (
              <ToggleRight size={28} className="text-primary" />
            ) : (
              <ToggleLeft size={28} className="text-gray-300" />
            )}
          </button>
          <button
            type="button"
            onClick={() => void openUsage(row)}
            aria-label={`View usage for ${row.code}`}
            title="View usage"
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <BarChart3 size={18} className="text-gray-500" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promo Coupons"
        description="Live coupons validated by the server at checkout. Creating or disabling a code here changes what customers can use."
        breadcrumbs={[{ label: "Coupons" }]}
        actions={
          <AdminButton variant="primary" size="sm" onClick={() => setShowCreate((v) => !v)}>
            <Plus size={14} />
            <span>{showCreate ? "Close form" : "Create coupon"}</span>
          </AdminButton>
        }
      />

      {showCreate && (
        <form
          onSubmit={submitCreate}
          className="grid grid-cols-1 gap-3 rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-[#1A1A1A] md:grid-cols-4"
        >
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 font-mono">
            Code
            <input
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="SAVE100"
              className="mt-1 w-full rounded-lg border border-gray-150 bg-gray-50 p-2 font-mono text-xs font-bold uppercase dark:border-gray-800 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 font-mono">
            Title
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Flat ₹100 off"
              className="mt-1 w-full rounded-lg border border-gray-150 bg-gray-50 p-2 text-xs dark:border-gray-800 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 font-mono">
            Type
            <select
              value={form.discountType}
              onChange={(e) =>
                setForm({ ...form, discountType: e.target.value as "percent" | "flat" })
              }
              className="mt-1 w-full rounded-lg border border-gray-150 bg-gray-50 p-2 text-xs font-bold dark:border-gray-800 dark:bg-gray-900 dark:text-white"
            >
              <option value="flat">Flat amount</option>
              <option value="percent">Percent</option>
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 font-mono">
            {form.discountType === "percent" ? "Percent off" : "Rupees off"}
            <input
              required
              type="number"
              min={1}
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-150 bg-gray-50 p-2 text-xs font-bold dark:border-gray-800 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 font-mono">
            Min order (₹)
            <input
              type="number"
              min={0}
              value={form.minOrder}
              onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-150 bg-gray-50 p-2 text-xs dark:border-gray-800 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 font-mono">
            Max discount (₹)
            <input
              type="number"
              min={0}
              disabled={form.discountType !== "percent"}
              value={form.maxDiscount}
              onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-150 bg-gray-50 p-2 text-xs disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 font-mono">
            Total uses (blank = none)
            <input
              type="number"
              min={0}
              value={form.totalCap}
              onChange={(e) => setForm({ ...form, totalCap: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-150 bg-gray-50 p-2 text-xs dark:border-gray-800 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 font-mono">
            Uses per customer
            <input
              type="number"
              min={0}
              value={form.perCustomerLimit}
              onChange={(e) => setForm({ ...form, perCustomerLimit: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-150 bg-gray-50 p-2 text-xs dark:border-gray-800 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 font-mono md:col-span-2">
            Valid until
            <input
              type="date"
              value={form.validTo}
              onChange={(e) => setForm({ ...form, validTo: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-150 bg-gray-50 p-2 text-xs dark:border-gray-800 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <div className="flex items-end md:col-span-2">
            <AdminButton type="submit" variant="primary" size="sm" className="w-full" disabled={creating}>
              {creating ? "Saving…" : "Save coupon"}
            </AdminButton>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard title="Total promo codes" value={coupons.length} icon={Gift} />
        <StatCard title="Active" value={`${activeCount} / ${coupons.length}`} icon={Percent} />
        <StatCard title="Redemptions" value={redeemedCount} icon={BarChart3} />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-gray-100 p-6 text-xs text-gray-500 dark:border-gray-800">
          <Loader2 size={16} className="animate-spin" />
          <span>Loading coupons…</span>
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          <span className="block font-extrabold">Could not load coupons</span>
          <span className="mt-0.5 block">{loadError}</span>
          <AdminButton variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            Retry
          </AdminButton>
        </div>
      ) : coupons.length === 0 ? (
        <div className="rounded-xl border border-gray-100 p-6 text-xs text-gray-500 dark:border-gray-800">
          No coupons yet. Create one and it becomes usable at checkout immediately.
        </div>
      ) : (
        <ResponsiveTable
          data={coupons.map((coupon) => ({ ...coupon, id: coupon.code }))}
          columns={columns}
          searchPlaceholder="Search coupons by code or title..."
          searchFields={["code", "title"]}
          exportFileName="coupons"
        />
      )}

      {usage && (
        <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-[#1A1A1A]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-black uppercase tracking-tight text-gray-900 dark:text-white">
                Usage — {usage.code}
              </h3>
              <p className="text-[10px] text-gray-400">
                {usage.committed} redeemed, {usage.reserved} held by a checkout in progress.
              </p>
            </div>
            <AdminButton variant="outline" size="sm" onClick={() => setUsage(null)}>
              Close
            </AdminButton>
          </div>
          {usageLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : usage.rows.length === 0 ? (
            <span className="text-xs text-gray-500">No redemptions yet.</span>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-gray-100 text-[9px] uppercase tracking-wider text-gray-400 dark:border-gray-800">
                    <th className="py-2 px-2">Order</th>
                    <th className="py-2 px-2">Customer</th>
                    <th className="py-2 px-2">Discount</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-2">When</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.rows.map((row) => (
                    <tr key={row.orderId} className="border-b border-gray-50 dark:border-gray-900">
                      <td className="py-2 px-2 font-mono">{row.orderId}</td>
                      <td className="py-2 px-2 font-mono">{row.customerId || "—"}</td>
                      <td className="py-2 px-2 font-mono">₹{row.discount}</td>
                      <td className="py-2 px-2">{row.status}</td>
                      <td className="py-2 px-2 text-gray-500">
                        {row.reservedAtMs ? new Date(row.reservedAtMs).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminCouponsPage;
