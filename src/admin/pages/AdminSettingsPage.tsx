import React, { useState, useEffect } from "react";
import { Settings, Save, CheckCircle, ShieldAlert, KeyRound } from "lucide-react";
import { PageHeader } from "../components/Headers";
import { AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { db } from "@/core/config/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { toast } from "sonner";

// Loop 8/120: the single source of truth for partner-level operating config.
// Persisted at app_settings/partner_settings (rules: brand-only writes).
// Nothing here touches checkouts yet — the subtitle says so honestly until
// the core pricing/support wiring lands (product call).
export interface PartnerSettings {
  gstRate: number;
  deliveryFee: number;
  minOrder: number;
  supportPhone: string;
  autoClose: boolean;
}

export const DEFAULT_PARTNER_SETTINGS: PartnerSettings = {
  gstRate: 5.0,
  deliveryFee: 40.0,
  minOrder: 150.0,
  supportPhone: "",
  autoClose: true,
};

export const PARTNER_SETTINGS_DOC = "partner_settings";

/**
 * L1: the save handler validated only `supportPhone`, so a negative GST rate,
 * delivery fee or minimum order could be persisted — and then silently
 * reverted on reload by `mergePartnerSettings` (which rejects negatives,
 * making a "successful" save look like it never happened). Reject
 * non-finite/negative amounts before the write.
 */
export function validatePartnerFinancials(input: {
  gstRate: number;
  deliveryFee: number;
  minOrder: number;
}): string | null {
  const amounts: Array<[string, number]> = [
    ["GST tax rate", input.gstRate],
    ["base delivery fee", input.deliveryFee],
    ["minimum order", input.minOrder],
  ];
  for (const [label, value] of amounts) {
    if (!Number.isFinite(value) || value < 0) {
      return `Enter nonnegative amounts — the ${label} must be a finite number of 0 or more.`;
    }
  }
  return null;
}

/** Overlay saved values on defaults; garbage numbers fall back to defaults. */
export function mergePartnerSettings(saved: Partial<PartnerSettings>): PartnerSettings {
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
  return {
    gstRate: num(saved.gstRate, DEFAULT_PARTNER_SETTINGS.gstRate),
    deliveryFee: num(saved.deliveryFee, DEFAULT_PARTNER_SETTINGS.deliveryFee),
    minOrder: num(saved.minOrder, DEFAULT_PARTNER_SETTINGS.minOrder),
    supportPhone:
      typeof saved.supportPhone === "string" ? saved.supportPhone : DEFAULT_PARTNER_SETTINGS.supportPhone,
    autoClose: typeof saved.autoClose === "boolean" ? saved.autoClose : DEFAULT_PARTNER_SETTINGS.autoClose,
  };
}

export const AdminSettingsPage: React.FC = () => {
  const [gstRate, setGstRate] = useState(DEFAULT_PARTNER_SETTINGS.gstRate);
  const [deliveryFee, setDeliveryFee] = useState(DEFAULT_PARTNER_SETTINGS.deliveryFee);
  const [minOrder, setMinOrder] = useState(DEFAULT_PARTNER_SETTINGS.minOrder);
  const [supportPhone, setSupportPhone] = useState(DEFAULT_PARTNER_SETTINGS.supportPhone);
  const [autoClose, setAutoClose] = useState(DEFAULT_PARTNER_SETTINGS.autoClose);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "app_settings", PARTNER_SETTINGS_DOC));
        if (snap.exists()) {
          const merged = mergePartnerSettings((snap.data() || {}) as Partial<PartnerSettings>);
          setGstRate(merged.gstRate);
          setDeliveryFee(merged.deliveryFee);
          setMinOrder(merged.minOrder);
          setSupportPhone(merged.supportPhone);
          setAutoClose(merged.autoClose);
        }
      } catch (err) {
        toast.error("Could not load shared settings.", {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportPhone.trim()) {
      toast.error("Enter a real helpdesk number — blanks and placeholders are rejected.");
      return;
    }
    // L1: never persist negative financial configuration.
    const financialError = validatePartnerFinancials({ gstRate, deliveryFee, minOrder });
    if (financialError) {
      toast.error(financialError);
      return;
    }
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await setDoc(
        doc(db, "app_settings", PARTNER_SETTINGS_DOC),
        { gstRate, deliveryFee, minOrder, supportPhone: supportPhone.trim(), autoClose },
        { merge: true }
      );
      setSaveSuccess(true);
    } catch (err) {
      toast.error("Settings were NOT saved.", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Global Store Configurations"
        description="Override global variables, alter delivery logistics, configure tax rates, and manage mobile support parameters."
        breadcrumbs={[{ label: "Settings" }]}
      />

      <div className="max-w-2xl">
        <AdminCard
          title="Operating Configuration Form"
          subtitle="Saved to shared settings (app_settings/partner_settings). Checkout wiring pending — values do not affect live checkouts yet."
        >
          <form onSubmit={handleSaveSettings} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                  GST Tax Rate (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={gstRate}
                  onChange={(e) => setGstRate(parseFloat(e.target.value))}
                  className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-sm font-semibold focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Base Delivery Fee (₹)
                </label>
                <input
                  type="number"
                  step="1"
                  min={0}
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(parseFloat(e.target.value))}
                  className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-sm font-semibold focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Minimum Order For Delivery (₹)
                </label>
                <input
                  type="number"
                  step="5"
                  min={0}
                  value={minOrder}
                  onChange={(e) => setMinOrder(parseFloat(e.target.value))}
                  className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-sm font-semibold focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Helpdesk Support Number
                </label>
                <input
                  type="text"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  disabled={isLoading}
                  className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-sm font-semibold focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800/60 flex items-center justify-between gap-4">
              <div>
                <span className="block text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                  Emergency Auto-Close Trigger
                </span>
                <span className="text-[11px] text-gray-400 font-semibold block mt-0.5">
                  Toggle instant offline POS mode across all platforms in case of logistics
                  failures.
                </span>
              </div>
              <input
                type="checkbox"
                checked={autoClose}
                onChange={(e) => setAutoClose(e.target.checked)}
                className="h-5 w-5 rounded text-primary focus:ring-[#0E4825]"
              />
            </div>

            {saveSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle size={15} />
                <span>
                  Success: settings saved to shared settings (app_settings/partner_settings).
                </span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <AdminButton type="submit" variant="primary" isLoading={isSaving || isLoading} className="px-6">
                <Save size={14} />
                <span>Commit Settings Override</span>
              </AdminButton>
            </div>
          </form>
        </AdminCard>
      </div>
    </div>
  );
};
