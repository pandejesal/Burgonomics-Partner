import React, { useState, useEffect } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { PageHeader } from "../components/Headers";
import {
  LayoutDashboard,
  Store,
  FileText,
  Activity,
  Boxes,
  HeartPulse,
  AlertTriangle,
  X,
  Bike,
} from "lucide-react";
import { appConfig } from "@/core/config/env";
import { petpoojaGateway, type GatewayAlert } from "@/core/integrations/petpooja";
import { createPetpoojaAlertsLoader, petpoojaAlertsVisibility, type PetpoojaAlertsState } from "./petpoojaAlerts";

/**
 * Incident surface for the Petpooja Operations Center — the ONLY place that
 * paints "load failure" vs "incidents". Exported (component export keeps
 * fast-refresh valid) so the colocated node-env tests can assert its markup
 * directly: a failed load must read as a failure, never as "no incidents".
 */
export function PetpoojaIncidentAlerts({
  state,
  enabled,
  onRetry,
  retrying = false,
  onDismiss,
}: {
  state: PetpoojaAlertsState;
  enabled: boolean;
  onRetry: () => void;
  retrying?: boolean;
  onDismiss: (id: string) => void;
}) {
  const { showLoadFailure, showIncidents } = petpoojaAlertsVisibility(state, enabled);
  if (!showLoadFailure && !showIncidents) return null;

  return (
    <>
      {/* Incident-feed load failure — real outcome, operator-visible, with
          retry. Distinct from "zero incidents": a failed load never claims
          the kitchen is clean. Shown only when the integration is ENABLED
          (disabled = standby card is the truthful surface). */}
      {showLoadFailure && (
        <div className="p-4 rounded-[16px] border flex items-start gap-3 shadow-sm bg-amber-50/75 dark:bg-amber-950/15 border-amber-300 dark:border-amber-800/60 text-amber-900 dark:text-amber-200">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="flex-1 min-w-0">
            <span className="font-extrabold text-sm tracking-tight">
              Could not load incident alerts
            </span>
            <p className="text-xs font-medium mt-1 leading-relaxed opacity-90">
              The incident check failed, so incident banners may be missing.
              This is not a "no incidents" reading.
            </p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border border-amber-400 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-60 disabled:cursor-wait transition-colors cursor-pointer"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {/* Incident alerts */}
      {showIncidents && (
        <div className="space-y-3">
          {state.alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 rounded-[16px] border flex items-start gap-3 shadow-sm transition-all duration-300 font-sans ${
                alert.type === "error"
                  ? "bg-red-50/75 dark:bg-red-950/15 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-200"
                  : alert.type === "warning"
                    ? "bg-accent/5 dark:bg-accent/10 border-accent/25 text-accent dark:text-orange-300"
                    : "bg-blue-50/75 dark:bg-blue-950/15 border-blue-200 dark:border-blue-900/50 text-blue-800 dark:text-blue-200"
              }`}
            >
              <AlertTriangle
                size={18}
                className={`shrink-0 mt-0.5 ${
                  alert.type === "error" ? "text-red-500" : "text-accent dark:text-accent-light"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm tracking-tight">{alert.title}</span>
                  <span className="text-[10px] font-bold uppercase opacity-60">
                    • {alert.timestamp}
                  </span>
                </div>
                <p className="text-xs font-medium mt-1 leading-relaxed opacity-90">
                  {alert.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(alert.id)}
                className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer text-current"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export const PetpoojaOperationsLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [alerts, setAlerts] = useState<GatewayAlert[]>([]);
  const [alertsPhase, setAlertsPhase] = useState<"ok" | "failed">("ok");
  const [retryingAlerts, setRetryingAlerts] = useState(false);

  // P0-2 gate: the real flag from env.ts (default false). Evaluated BEFORE the
  // child subtree renders — a child rendered-then-hidden would still run its
  // mount effects, so the conditional wraps the element itself.
  const petpoojaEnabled = appConfig.integrations.petpoojaEnabled;

  const loadAlerts = React.useCallback((): Promise<void> =>
    createPetpoojaAlertsLoader({
      enabled: appConfig.integrations.petpoojaEnabled,
      getAlerts: () => petpoojaGateway.getAlerts(),
      onState: (state) => {
        setAlerts(state.alerts);
        setAlertsPhase(state.phase);
      },
    })(), []);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const retryAlerts = () => {
    setRetryingAlerts(true);
    void loadAlerts().finally(() => setRetryingAlerts(false));
  };

  const alertsState: PetpoojaAlertsState = { phase: alertsPhase, alerts };

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const allTabs = [
    {
      label: "Overview",
      to: "/admin/petpooja",
      exact: true,
      icon: LayoutDashboard,
    },
    {
      label: "Delivery Queue",
      to: "/admin/delivery-queue",
      icon: Bike,
    },
    {
      label: "Connected Stores",
      to: "/admin/petpooja/stores",
      icon: Store,
    },
    {
      label: "Sync Logs",
      to: "/admin/petpooja/logs",
      icon: FileText,
    },
    {
      label: "Webhook Monitor",
      to: "/admin/petpooja/webhooks",
      icon: Activity,
    },
    {
      label: "Queue Dashboard",
      to: "/admin/petpooja/queues",
      icon: Boxes,
      requiresOps: true,
    },
    {
      label: "Health & Cache",
      to: "/admin/petpooja/health",
      icon: HeartPulse,
    },
  ];

  const tabs = allTabs.filter((tab) => !tab.requiresOps || appConfig.featureFlags.adminOps);

  // Honest standby card (P0-2) — modeled on the SystemHealth STANDBY card:
  // says exactly why nothing is shown, no fake live states, no loading claim.
  const integrationStandbyCard = (
    <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-3">
      <div className="flex justify-between items-center">
        <span className="font-bold text-sm text-gray-900 dark:text-white uppercase font-sans">
          Petpooja Bridge Sub-pages
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black border bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-800">
          STANDBY
        </span>
      </div>
      <p className="text-xs font-semibold text-gray-400">
        Integration disabled — set VITE_PETPOOJA_ENABLED=true and redeploy to
        enable the Petpooja gateway. No bridge data is loaded on this page
        until then.
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="PETPOOJA OPERATIONS CENTER"
        description="The mission control hub for Burgonomics Petpooja integration. Monitor live queues, debug webhooks, audit sync timelines, and toggle circuit breakers."
        breadcrumbs={[{ label: "Petpooja Ops" }]}
        badge={
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 border border-amber-500/20">
            <Activity size={11} className="animate-pulse" />
            <span>Integration Standby</span>
          </span>
        }
      />

      {/* Incident surface — load failure vs incidents, exactly one truth. */}
      <PetpoojaIncidentAlerts
        state={alertsState}
        enabled={petpoojaEnabled}
        onRetry={retryAlerts}
        retrying={retryingAlerts}
        onDismiss={dismissAlert}
      />

      {/* Tabs Navigation */}
      <div className="border-b border-gray-100 dark:border-gray-800/80 pb-0 flex items-center justify-between">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth -mb-[1px]">
          {tabs.map((tab) => {
            const isActive = tab.exact
              ? location.pathname === tab.to
              : location.pathname.startsWith(tab.to);

            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`flex items-center gap-2 px-5 py-3.5 border-b-2 text-xs font-bold tracking-wider uppercase transition-all duration-200 select-none ${
                  isActive
                    ? "border-primary text-primary dark:border-accent dark:text-accent-light bg-white/40 dark:bg-[#1A1A1A]/30 rounded-t-xl"
                    : "border-transparent text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <tab.icon size={14} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Route Content Frame — explicit children (e.g. delivery-queue, which
          never touches the gateway) always render; the matched Petpooja route
          child via <Outlet> is gated. Swapping (not hiding) the element is
          what keeps child mount effects from ever running while the
          integration is off. */}
      <div className="w-full">
        {children ?? (petpoojaEnabled ? <Outlet /> : integrationStandbyCard)}
      </div>
    </div>
  );
};
