import React, { Suspense, lazy } from "react";
import { SystemDashboardTab } from "./system/SystemDashboardTab";
// Metrics tab pulls in recharts — code-split so diagnostics visits don't
// tax every admin bundle load.
const SystemMetricsTab = lazy(() =>
  import("./system/SystemMetricsTab").then((m) => ({
    default: m.SystemMetricsTab,
  }))
);
import { SystemQueueTab } from "./system/SystemQueueTab";
import { SystemRedisTab } from "./system/SystemRedisTab";
import { SystemDatabaseTab } from "./system/SystemDatabaseTab";
import { SystemApiTab } from "./system/SystemApiTab";
import { SystemLogsTab } from "./system/SystemLogsTab";
import { SystemFeatureFlagsTab } from "./system/SystemFeatureFlagsTab";
import { SystemSecurityTab } from "./system/SystemSecurityTab";
import { SystemSettingsTab } from "./system/SystemSettingsTab";

interface AdminSystemPageProps {
  activeView:
    | "overview"
    | "health"
    | "metrics"
    | "queues"
    | "redis"
    | "database"
    | "apis"
    | "logs"
    | "audit"
    | "feature-flags"
    | "jobs"
    | "security"
    | "settings";
}

export const AdminSystemPage: React.FC<AdminSystemPageProps> = ({ activeView }) => {
  const renderTabContent = () => {
    switch (activeView) {
      case "overview":
      case "health":
        return <SystemDashboardTab />;
      case "metrics":
        return (
          <Suspense
            fallback={
              <div role="status" aria-label="Loading system metrics">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-400 animate-pulse">
                  Loading system metrics...
                </span>
              </div>
            }
          >
            <SystemMetricsTab />
          </Suspense>
        );
      case "queues":
      case "jobs":
        return <SystemQueueTab />;
      case "redis":
        return <SystemRedisTab />;
      case "database":
        return <SystemDatabaseTab />;
      case "apis":
        return <SystemApiTab />;
      case "logs":
      case "audit":
        return <SystemLogsTab />;
      case "feature-flags":
        return <SystemFeatureFlagsTab />;
      case "security":
        return <SystemSecurityTab />;
      case "settings":
        return <SystemSettingsTab />;
      default:
        return <SystemDashboardTab />;
    }
  };

  // The /admin/system route owns the single SystemOperationsLayout shell
  // (header, sidebar, permission filter, mobile tab bar). Wrapping again here
  // mounted a second shell inside the first and collapsed every tab panel to
  // the ~58px screenshot defect.
  return <>{renderTabContent()}</>;
};
export default AdminSystemPage;
