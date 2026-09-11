import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Award,
  Settings,
  Shield,
  Clock,
  Smartphone,
  Save,
  PlusCircle,
  HelpCircle,
  AlertTriangle,
  History,
  FileText,
  UserCheck,
  Check,
  Percent,
  Sparkles,
  ArrowLeft,
  ChevronRight,
  Database,
  Grid,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { customerStorage, CustomerProfile } from "./customersData";
import { db } from "@/core/config/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { toast } from "sonner";

// Loop 21/120: loyalty config persisted at app_settings/loyalty_config
// (rules: brand-only writes). Same honest pattern as the Loop 8 settings
// page — values are shared truth, but nothing consumes them live yet.
export interface LoyaltyTierRule {
  tier: string;
  minPoints: number;
  multiplier: number;
  cashbackPercent: number;
}

export interface LoyaltyReward {
  id: string;
  name: string;
  cost: number;
  category: string;
}

export interface LoyaltyConfig {
  walletPassName: string;
  walletPassColor: string;
  walletPassAccent: string;
  barcodeType: string;
  pushEnabled: boolean;
  rules: LoyaltyTierRule[];
  rewards: LoyaltyReward[];
  pointsExpiryMonths: number;
}

export const LOYALTY_CONFIG_DOC = "loyalty_config";

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  walletPassName: "Burgonomics Rewards",
  walletPassColor: "#0E4825",
  walletPassAccent: "#FF6600",
  barcodeType: "QR_CODE",
  pushEnabled: true,
  rules: [
    { tier: "Bronze", minPoints: 0, multiplier: 1.0, cashbackPercent: 5 },
    { tier: "Silver", minPoints: 500, multiplier: 1.2, cashbackPercent: 6 },
    { tier: "Gold", minPoints: 1500, multiplier: 1.5, cashbackPercent: 8 },
    { tier: "Platinum", minPoints: 3000, multiplier: 1.8, cashbackPercent: 10 },
    { tier: "VIP", minPoints: 5000, multiplier: 2.5, cashbackPercent: 15 },
  ],
  rewards: [
    { id: "R-1", name: "Free Classic Veg Burger Combo", cost: 350, category: "Burgers" },
    { id: "R-2", name: "Free Mocktail / Ice Cream Shake", cost: 180, category: "Beverages" },
    { id: "R-3", name: "Free Large Peri Peri Fries", cost: 150, category: "Sides" },
    { id: "R-4", name: "Free Cheeseburger Premium", cost: 240, category: "Burgers" },
  ],
  pointsExpiryMonths: 12,
};

/** Overlay saved values on defaults; garbage falls back to defaults. */
export function mergeLoyaltyConfig(saved: Partial<LoyaltyConfig>): LoyaltyConfig {
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
  return {
    walletPassName: str(saved.walletPassName, DEFAULT_LOYALTY_CONFIG.walletPassName),
    walletPassColor: str(saved.walletPassColor, DEFAULT_LOYALTY_CONFIG.walletPassColor),
    walletPassAccent: str(saved.walletPassAccent, DEFAULT_LOYALTY_CONFIG.walletPassAccent),
    barcodeType: str(saved.barcodeType, DEFAULT_LOYALTY_CONFIG.barcodeType),
    pushEnabled: typeof saved.pushEnabled === "boolean" ? saved.pushEnabled : true,
    rules: Array.isArray(saved.rules) ? (saved.rules as LoyaltyTierRule[]) : DEFAULT_LOYALTY_CONFIG.rules,
    rewards: Array.isArray(saved.rewards) ? (saved.rewards as LoyaltyReward[]) : DEFAULT_LOYALTY_CONFIG.rewards,
    pointsExpiryMonths: num(saved.pointsExpiryMonths, DEFAULT_LOYALTY_CONFIG.pointsExpiryMonths),
  };
}

export const AdminLoyaltyConfigPage: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerProfile[]>(customerStorage.getCustomers());

  useEffect(() => {
    const sub = customerStorage.subscribe(() => {
      setCustomers([...customerStorage.getCustomers()]);
    });
    return () => {
      sub();
    };
  }, []);

  // Apple & Google Wallet Config State
  const [walletPassName, setWalletPassName] = useState(DEFAULT_LOYALTY_CONFIG.walletPassName);
  const [walletPassColor, setWalletPassColor] = useState(DEFAULT_LOYALTY_CONFIG.walletPassColor);
  const [walletPassAccent, setWalletPassAccent] = useState(DEFAULT_LOYALTY_CONFIG.walletPassAccent);
  const [barcodeType, setBarcodeType] = useState(DEFAULT_LOYALTY_CONFIG.barcodeType);
  const [pushEnabled, setPushEnabled] = useState(DEFAULT_LOYALTY_CONFIG.pushEnabled);

  // Global Points Multiplier Rules state
  const [rules, setRules] = useState<LoyaltyTierRule[]>(DEFAULT_LOYALTY_CONFIG.rules);

  // Redemption Rewards catalogues
  const [rewards, setRewards] = useState<LoyaltyReward[]>(DEFAULT_LOYALTY_CONFIG.rewards);

  // Expiration settings
  const [pointsExpiryMonths, setPointsExpiryMonths] = useState(DEFAULT_LOYALTY_CONFIG.pointsExpiryMonths);

  // Loop 21/120: load shared config on mount; saves below persist it back.
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "app_settings", LOYALTY_CONFIG_DOC));
        if (snap.exists()) {
          const merged = mergeLoyaltyConfig((snap.data() || {}) as Partial<LoyaltyConfig>);
          setWalletPassName(merged.walletPassName);
          setWalletPassColor(merged.walletPassColor);
          setWalletPassAccent(merged.walletPassAccent);
          setBarcodeType(merged.barcodeType);
          setPushEnabled(merged.pushEnabled);
          setRules(merged.rules);
          setRewards(merged.rewards);
          setPointsExpiryMonths(merged.pointsExpiryMonths);
        }
      } catch (err) {
        toast.error("Could not load shared loyalty config.", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, []);

  // Consolidated audit logs from every customer points adjustment
  const consolidatedLoyaltyAudit = useMemo(() => {
    const logs: Array<{
      id: string;
      customerName: string;
      customerId: string;
      date: string;
      action: "ADD" | "REMOVE" | "EXPIRE" | "REDEEM" | "REWARD_ISSUED" | "TIER_ADJUST";
      points: number;
      description: string;
      operator: string;
    }> = [];

    customers.forEach((c) => {
      c.loyalty.history.forEach((h) => {
        logs.push({
          id: h.id,
          customerName: c.fullName,
          customerId: c.id,
          date: h.date,
          action: h.action,
          points: h.points,
          description: h.description,
          operator: h.operator,
        });
      });
    });

    // Sort by Date descending (statically parse days for layout sort)
    return logs.sort((a, b) => b.date.localeCompare(a.date));
  }, [customers]);

  // Actions — Loop 21/120 honest persist: both saves write the shared doc
  // and report the real outcome. Nothing here pushes to wallets/edge/POS —
  // the old toasts claimed cryptographic bundling and edge distribution.
  const persistConfig = async (patch: Partial<LoyaltyConfig>): Promise<boolean> => {
    try {
      await setDoc(doc(db, "app_settings", LOYALTY_CONFIG_DOC), patch, { merge: true });
      return true;
    } catch (err) {
      toast.error("Loyalty config was NOT saved.", {
        description: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  };

  const handleSaveWalletPass = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await persistConfig({ walletPassName, walletPassColor, walletPassAccent, barcodeType, pushEnabled });
    if (ok) toast.success("Wallet pass template saved to shared config.");
  };

  const handleSaveMultiplierRules = async () => {
    const ok = await persistConfig({ rules, rewards, pointsExpiryMonths });
    if (ok) toast.success("Cashback rules saved to shared config (POS sync pending).");
  };

  return (
    <div className="space-y-6 font-sans text-xs">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageHeader
          title="Loyalty & Cashback Rules Engine"
          description="Configure tiers cashback, redeemable menus catalogues, points expiration rules, and Apple/Google Wallet Pass templates."
          breadcrumbs={[
            { label: "Customer CRM", to: "/admin/customers" },
            { label: "Loyalty Configuration" },
          ]}
        />

        <div className="flex items-center gap-2 self-start md:self-center">
          <Link to="/admin/customers">
            <AdminButton variant="outline" size="sm">
              <ArrowLeft size={13} className="mr-1.5" />
              <span>Back to Directory</span>
            </AdminButton>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Cashback Rules & catalogue Config (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section 1: Tier rules and cashbacks */}
          <AdminCard
            title="Global Tiers & Cashback Multipliers"
            subtitle="Define points multipliers and checkout cashback percentages mapped to loyalty tiers"
          >
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
                <table className="w-full text-left font-sans text-xs">
                  <thead>
                    <tr className="bg-gray-50/60 dark:bg-gray-900/40 border-b border-gray-50 text-[9px] uppercase font-bold text-gray-400 tracking-wider font-mono">
                      <th className="py-2 px-3">Loyalty Rank</th>
                      <th className="py-2 px-3">Points Threshold</th>
                      <th className="py-2 px-3 text-center">Cashback Multiplier</th>
                      <th className="py-2 px-3 text-right">Cashback Rebate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/40 font-semibold">
                    {rules.map((rule, idx) => (
                      <tr key={rule.tier} className="text-[11px]">
                        <td className="py-2.5 px-3 uppercase text-gray-900 dark:text-white font-mono font-bold">
                          {rule.tier}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-gray-500">
                          {rule.minPoints} pts
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="number"
                            step={0.1}
                            min={1}
                            className="w-16 bg-gray-50 border border-gray-150 rounded text-center p-0.5 text-xs font-mono font-bold dark:bg-gray-900 dark:border-gray-850"
                            value={rule.multiplier}
                            onChange={(e) => {
                              const updated = [...rules];
                              updated[idx].multiplier = parseFloat(e.target.value) || 1;
                              setRules(updated);
                            }}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400 font-mono font-black">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            className="w-12 bg-gray-50 border border-gray-150 rounded text-center p-0.5 text-xs font-mono font-bold dark:bg-gray-900 dark:border-gray-850 inline mr-1 text-emerald-600"
                            value={rule.cashbackPercent}
                            onChange={(e) => {
                              const updated = [...rules];
                              updated[idx].cashbackPercent = parseInt(e.target.value) || 1;
                              setRules(updated);
                            }}
                          />
                          %
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AdminButton
                variant="primary"
                size="sm"
                className="w-full"
                onClick={handleSaveMultiplierRules}
              >
                <Save size={12} className="mr-1.5" />
                <span>Save Multiplier Rules</span>
              </AdminButton>
            </div>
          </AdminCard>

          {/* Section 2: Expiration Rules & Rewards catalogue */}
          <AdminCard
            title="Reward redemption catalogue & Expiration parameters"
            subtitle="Point prices for free items on POS/Android apps & global validation window"
          >
            <div className="space-y-4">
              <div className="p-3 bg-orange-50/5 text-orange-800 border border-orange-100 rounded-xl flex items-center gap-3">
                <Clock size={15} className="shrink-0 text-accent dark:text-accent-light" />
                <div className="space-y-0.5 leading-tight">
                  <span className="text-[9px] font-black uppercase font-mono tracking-wider">
                    Points Validity Rule
                  </span>
                  <p className="font-semibold text-xs text-orange-900 dark:text-orange-100">
                    Points will expire automatically{" "}
                    <input
                      type="number"
                      className="w-10 text-center bg-white border border-orange-200 rounded p-px text-xs font-mono font-bold text-accent"
                      value={pointsExpiryMonths}
                      onChange={(e) => setPointsExpiryMonths(parseInt(e.target.value) || 12)}
                    />{" "}
                    months from the date of checkout.
                  </p>
                </div>
              </div>

              {/* catalogue table */}
              <div className="space-y-3">
                <span className="block text-[10px] font-black font-mono uppercase tracking-wider text-gray-900 dark:text-white">
                  Active Redeemable Catalogue
                </span>
                <div className="space-y-2">
                  {rewards.map((reward, index) => (
                    <div
                      key={reward.id}
                      className="p-2.5 rounded-xl border border-gray-100 dark:border-gray-800/60 bg-gray-50/10 flex items-center justify-between font-sans text-xs"
                    >
                      <div className="space-y-0.5 font-semibold">
                        <span className="text-[9px] font-mono text-gray-400 block uppercase font-bold">
                          {reward.category}
                        </span>
                        <h4 className="text-gray-900 dark:text-white">{reward.name}</h4>
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <input
                          type="number"
                          className="w-16 bg-gray-50 border border-gray-150 rounded text-center p-0.5 text-xs font-mono font-bold text-accent dark:text-accent-light dark:bg-gray-900 dark:border-gray-850"
                          value={reward.cost}
                          onChange={(e) => {
                            const updated = [...rewards];
                            updated[index].cost = parseInt(e.target.value) || 10;
                            setRewards(updated);
                          }}
                        />
                        <span className="text-gray-400 font-bold text-[10px]">PTS</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </AdminCard>

          {/* Section 3: Points audit Desk logs */}
          <AdminCard
            title="Consolidated Points Modification Ledger (Audited)"
            subtitle="Consolidated logs of manual point overrides, adjustments, or reward redemptions"
          >
            {consolidatedLoyaltyAudit.length === 0 ? (
              <span className="block text-center py-6 text-gray-400 font-mono text-[10px]">
                No point adjustment audit events.
              </span>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-50 dark:border-gray-800/60 max-h-[300px]">
                <table className="w-full text-left font-mono text-[10px]">
                  <thead>
                    <tr className="bg-gray-50/60 dark:bg-gray-900/40 border-b border-gray-50 text-[9px] uppercase font-bold text-gray-400 tracking-wider font-mono">
                      <th className="py-2 px-3">Log ID</th>
                      <th className="py-2 px-3">Customer</th>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Action</th>
                      <th className="py-2 px-3 text-right">Points</th>
                      <th className="py-2 px-3">Description</th>
                      <th className="py-2 px-3">Operator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/40 font-semibold text-gray-600">
                    {consolidatedLoyaltyAudit.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50/20">
                        <td className="py-2 px-3 text-gray-400">[{log.id}]</td>
                        <td className="py-2 px-3 font-sans">
                          <span className="font-extrabold text-gray-800 dark:text-gray-200 block">
                            {log.customerName}
                          </span>
                          <span className="text-[9px] text-gray-400 font-mono">
                            {log.customerId}
                          </span>
                        </td>
                        <td className="py-2 px-3">{log.date}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1 rounded text-[8px] uppercase font-bold ${
                              log.action === "ADD"
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-red-50 text-red-500"
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-black ${
                            log.action === "ADD" ? "text-emerald-600" : "text-red-500"
                          }`}
                        >
                          {log.action === "ADD" ? "+" : "-"}
                          {log.points}
                        </td>
                        <td className="py-2 px-3 font-sans truncate max-w-[150px]">
                          {log.description}
                        </td>
                        <td className="py-2 px-3">{log.operator}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminCard>
        </div>

        {/* RIGHT COLUMN: Mobile Wallet passes setup (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <AdminCard
            title="Apple & Google Wallet Integration"
            subtitle="Configure loyalty pass graphics, colors, barcodes distributed to customer phones"
          >
            <form onSubmit={handleSaveWalletPass} className="space-y-4 font-sans text-xs">
              <div className="p-3 bg-emerald-50/20 border border-emerald-100 rounded-xl flex items-center gap-3">
                <Smartphone size={15} className="shrink-0 text-primary" />
                <div className="space-y-0.5 leading-tight text-primary">
                  <span className="text-[9px] font-black uppercase font-mono tracking-wider">
                    Pass Distribution
                  </span>
                  <p className="font-semibold text-emerald-900 dark:text-emerald-100">
                    Distributed securely via QR link or dynamic push triggers upon registration.
                  </p>
                </div>
              </div>

              {/* Form parameters */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
                  Wallet Card Name
                </label>
                <input
                  type="text"
                  required
                  value={walletPassName}
                  onChange={(e) => setWalletPassName(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-150 dark:border-gray-850 p-2 rounded-xl focus:outline-none font-bold"
                />
              </div>

              {/* Color selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[8px] font-bold text-gray-400 uppercase mb-1 font-mono">
                    Background Color
                  </label>
                  <div className="flex items-center gap-2 border border-gray-150 dark:border-gray-850 rounded-xl p-1.5 bg-gray-50 dark:bg-gray-900">
                    <input
                      type="color"
                      value={walletPassColor}
                      onChange={(e) => setWalletPassColor(e.target.value)}
                      className="w-8 h-6 border rounded cursor-pointer shrink-0"
                    />
                    <span className="font-mono text-[10px] font-bold">
                      {walletPassColor.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[8px] font-bold text-gray-400 uppercase mb-1 font-mono">
                    Accent Label Color
                  </label>
                  <div className="flex items-center gap-2 border border-gray-150 dark:border-gray-850 rounded-xl p-1.5 bg-gray-50 dark:bg-gray-900">
                    <input
                      type="color"
                      value={walletPassAccent}
                      onChange={(e) => setWalletPassAccent(e.target.value)}
                      className="w-8 h-6 border rounded cursor-pointer shrink-0"
                    />
                    <span className="font-mono text-[10px] font-bold">
                      {walletPassAccent.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Barcode Type */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
                  Barcode Layout format
                </label>
                <select
                  value={barcodeType}
                  onChange={(e) => setBarcodeType(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-xl py-2 px-3 font-semibold focus:outline-none"
                >
                  <option value="QR_CODE">2D QR Code (Recommended for POS scanners)</option>
                  <option value="PDF417">PDF417 (Standard Apple Wallet layout)</option>
                  <option value="CODE_128">Linear Barcode (Code 128)</option>
                </select>
              </div>

              <div className="space-y-3.5 border-t border-gray-50 dark:border-gray-800/40 pt-4">
                <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                  Mock Pass Visual Preview
                </span>

                {/* Visual Pass Represent */}
                <div
                  className="rounded-2xl p-4.5 text-white shadow-xl relative overflow-hidden flex flex-col justify-between h-44"
                  style={{ backgroundColor: walletPassColor }}
                >
                  {/* Diagonal background accent */}
                  <div className="absolute inset-y-0 right-0 w-32 opacity-10 bg-white -skew-x-12 transform origin-top" />

                  <div className="flex justify-between items-start relative z-10">
                    <div className="space-y-0.5">
                      <span className="text-[8px] font-black uppercase tracking-widest opacity-60 font-mono">
                        LOYALTY PASS
                      </span>
                      <h4 className="text-sm font-extrabold font-mono tracking-tight">
                        {walletPassName}
                      </h4>
                    </div>
                    <img
                      src="/burg_icon_clean.png"
                      alt="Logo"
                      className="w-7 h-7 rounded-lg object-contain bg-white/20 p-0.5 border border-white/25 shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>

                  <div className="flex justify-between items-end relative z-10 pt-2 border-t border-white/10">
                    <div className="space-y-0.5 font-sans">
                      <span className="text-[7.5px] uppercase tracking-wider opacity-60 font-bold block">
                        CARD HOLDER
                      </span>
                      <span className="font-extrabold text-[12px] block">Aarav Mehta</span>
                      <span className="text-[9px] font-mono text-white/80 block uppercase font-bold">
                        VIP Rank
                      </span>
                    </div>

                    <div className="text-right space-y-0.5">
                      <span className="text-[7.5px] uppercase tracking-wider opacity-60 font-bold block">
                        POINTS BALANCE
                      </span>
                      <span
                        className="font-mono font-black text-lg block"
                        style={{ color: walletPassAccent }}
                      >
                        2,450
                      </span>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-1.5 flex flex-col items-center justify-center relative z-10 self-center border border-white/20 mt-1 shadow-sm">
                    {barcodeType === "QR_CODE" ? (
                      <div className="w-12 h-12 bg-gray-50 rounded flex items-center justify-center p-1 border border-gray-150">
                        {/* Fake SVG vector QR */}
                        <div className="grid grid-cols-4 gap-0.5 w-10 h-10">
                          {Array.from({ length: 16 }).map((_, i) => (
                            <div
                              key={i}
                              className={`w-2 h-2 ${i % 3 === 0 || i % 5 === 1 ? "bg-black" : "bg-transparent"}`}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="w-32 h-6 flex flex-col justify-between items-center bg-gray-100/50 p-1 rounded font-mono text-[6px] text-black">
                        <div className="flex gap-px h-3.5">
                          {Array.from({ length: 42 }).map((_, i) => (
                            <div
                              key={i}
                              className={`h-full ${i % 3 === 0 || i % 7 === 1 ? "w-1.5 bg-black" : "w-0.5 bg-transparent"}`}
                            />
                          ))}
                        </div>
                        <span>[CUST-1002]</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <AdminButton type="submit" variant="primary" className="w-full mt-2">
                Compile & Deploy Pass Layout
              </AdminButton>
            </form>
          </AdminCard>
        </div>
      </div>
    </div>
  );
};

export default AdminLoyaltyConfigPage;
