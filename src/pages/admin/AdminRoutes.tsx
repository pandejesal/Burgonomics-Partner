import React, { Suspense, lazy, useEffect, useState } from "react";
import { Routes, Route, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAdminAuthStore } from "@/admin/store/adminAuthStore";
import { AdminLayout } from "@/admin/layouts/AdminLayout";
import { PetpoojaOperationsLayout } from "@/admin/layouts/PetpoojaOperationsLayout";
import { SystemOperationsLayout } from "@/admin/layouts/SystemOperationsLayout";
import { ThemeProvider } from "@/admin/theme/ThemeContext";

// Admin Pages — KDS/store-critical pages stay eager (kitchen + outlet ops
// must render with zero lazy delay). Everything else is route-level
// code-split via lazyPage below.
import { AdminDashboardPlaceholder } from "@/admin/pages/AdminDashboardPlaceholder";
import { AdminLoginPage } from "@/admin/pages/AdminLoginPage";
import { AdminOrdersPage } from "@/admin/pages/AdminOrdersPage";
import { AdminStoresPage } from "@/admin/pages/AdminStoresPage";
import { AdminMenuPage } from "@/admin/pages/AdminMenuPage";

// Heavy recharts pages are code-split so the initial admin bundle stays lean.
// (Previously every chart page loaded upfront → 1.2MB+ admin-analytics chunk.)
const AdminMarketingDashboard = lazy(() =>
  import("@/admin/pages/AdminMarketingDashboard").then((m) => ({
    default: m.AdminMarketingDashboard,
  }))
);
const AdminCustomerAnalyticsPage = lazy(
  () => import("@/admin/pages/AdminCustomerAnalyticsPage")
);
const AdminPaymentHealthPage = lazy(
  () => import("@/admin/pages/AdminPaymentHealthPage")
);
const AdminAnalyticsPage = lazy(() =>
  import("@/admin/pages/AdminAnalyticsPage").then((m) => ({
    default: m.AdminAnalyticsPage,
  }))
);

function AdminLazyFallback() {
  return (
    <div
      className="flex h-64 w-full flex-col items-center justify-center"
      role="status"
      aria-label="Loading analytics view"
    >
      <div className="h-10 w-10 animate-pulse rounded-2xl bg-primary font-bold text-white flex items-center justify-center">
        B
      </div>
      <span className="mt-3 text-xs font-bold uppercase tracking-widest text-accent animate-pulse">
        Loading analytics view...
      </span>
    </div>
  );
}
// Route-level code-split helper: wraps a lazy page so route JSX stays
// unchanged (<Route element={<AdminXPage />} />) while the page loads on
// demand with a consistent fallback.
function lazyPage<Props extends object>(
  loader: () => Promise<{ default: React.ComponentType<Props> }>,
  displayName: string
): React.FC<Props> {
  const LazyComponent = lazy(loader);
  const Wrapped: React.FC<Props> = (props) => (
    <Suspense fallback={<AdminLazyFallback />}>
      <LazyComponent {...props} />
    </Suspense>
  );
  Wrapped.displayName = displayName;
  return Wrapped;
}

// Adapter for pages with named-only exports (no default export). Typed
// loosely: page modules also export helpers/constants, so indexing cannot
// narrow to a component type without a cast.
const named = (
  importer: () => Promise<Record<string, any>>,
  exportName: string
): Promise<{ default: React.ComponentType<any> }> =>
  importer().then((m) => ({ default: m[exportName] as React.ComponentType<any> }));

const AdminOffersPage = lazyPage(
  () => named(() => import("@/admin/pages/AdminOffersPage"), "AdminOffersPage"),
  "AdminOffersPage"
);
const AdminCouponsPage = lazyPage(
  () => named(() => import("@/admin/pages/AdminCouponsPage"), "AdminCouponsPage"),
  "AdminCouponsPage"
);
const AdminCampaignsPage = lazyPage(
  () => named(() => import("@/admin/pages/AdminCampaignsPage"), "AdminCampaignsPage"),
  "AdminCampaignsPage"
);
const AdminCreateCampaignPage = lazyPage(
  () => named(() => import("@/admin/pages/AdminCreateCampaignPage"), "AdminCreateCampaignPage"),
  "AdminCreateCampaignPage"
);
const AdminTemplatesPage = lazyPage(
  () => named(() => import("@/admin/pages/AdminTemplatesPage"), "AdminTemplatesPage"),
  "AdminTemplatesPage"
);
const AdminAutomationPage = lazyPage(
  () => named(() => import("@/admin/pages/AdminAutomationPage"), "AdminAutomationPage"),
  "AdminAutomationPage"
);
const AdminCustomersPage = lazyPage(
  () => import("@/admin/pages/AdminCustomersPage"),
  "AdminCustomersPage"
);
const AdminCustomerProfilePage = lazyPage(
  () => import("@/admin/pages/AdminCustomerProfilePage"),
  "AdminCustomerProfilePage"
);
const AdminLoyaltyConfigPage = lazyPage(
  () => import("@/admin/pages/AdminLoyaltyConfigPage"),
  "AdminLoyaltyConfigPage"
);
const AdminSegmentsPage = lazyPage(
  () => import("@/admin/pages/AdminSegmentsPage"),
  "AdminSegmentsPage"
);
const AdminPaymentsPage = lazyPage(
  () => import("@/admin/pages/AdminPaymentsPage"),
  "AdminPaymentsPage"
);
const AdminPaymentDetailsPage = lazyPage(
  () => import("@/admin/pages/AdminPaymentDetailsPage"),
  "AdminPaymentDetailsPage"
);
const AdminRefundsPage = lazyPage(
  () => import("@/admin/pages/AdminRefundsPage"),
  "AdminRefundsPage"
);
const AdminReconciliationPage = lazyPage(
  () => import("@/admin/pages/AdminReconciliationPage"),
  "AdminReconciliationPage"
);
const AdminNotificationsPage = lazyPage(
  () => named(() => import("@/admin/pages/AdminNotificationsPage"), "AdminNotificationsPage"),
  "AdminNotificationsPage"
);
const AdminSettingsPage = lazyPage(
  () => named(() => import("@/admin/pages/AdminSettingsPage"), "AdminSettingsPage"),
  "AdminSettingsPage"
);
const AdminProfilePage = lazyPage(
  () => named(() => import("@/admin/pages/AdminProfilePage"), "AdminProfilePage"),
  "AdminProfilePage"
);
const AdminDeveloperPage = lazyPage(
  () => named(() => import("@/admin/pages/AdminDeveloperPage"), "AdminDeveloperPage"),
  "AdminDeveloperPage"
);
const AdminSystemPage = lazyPage(
  () => import("@/admin/pages/AdminSystemPage"),
  "AdminSystemPage"
);

// Petpooja pages — direct file imports, never via the barrel (which would
// drag them back into the eager bundle). Dashboard carries its own recharts
// bundle; monitor pages follow the same route-level split.
const PetpoojaDashboardPage = lazyPage(
  () => named(() => import("@/admin/pages/petpooja/PetpoojaDashboardPage"), "PetpoojaDashboardPage"),
  "PetpoojaDashboardPage"
);
const PetpoojaStoresPage = lazyPage(
  () => named(() => import("@/admin/pages/petpooja/PetpoojaStoresPage"), "PetpoojaStoresPage"),
  "PetpoojaStoresPage"
);
const PetpoojaLogsPage = lazyPage(
  () => named(() => import("@/admin/pages/petpooja/PetpoojaLogsPage"), "PetpoojaLogsPage"),
  "PetpoojaLogsPage"
);
const PetpoojaWebhooksPage = lazyPage(
  () => named(() => import("@/admin/pages/petpooja/PetpoojaWebhooksPage"), "PetpoojaWebhooksPage"),
  "PetpoojaWebhooksPage"
);
const PetpoojaQueuesPage = lazyPage(
  () => named(() => import("@/admin/pages/petpooja/PetpoojaQueuesPage"), "PetpoojaQueuesPage"),
  "PetpoojaQueuesPage"
);
const PetpoojaHealthPage = lazyPage(
  () => named(() => import("@/admin/pages/petpooja/PetpoojaHealthPage"), "PetpoojaHealthPage"),
  "PetpoojaHealthPage"
);
// Delivery dispatch queue stays eager (live ops, like KDS).
import { DeliveryQueuePage } from "@/pages/DeliveryQueuePage";


export function AdminPortalLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { admin, bootstrap, isLoading } = useAdminAuthStore();
  const [isReady, setIsReady] = useState(false);

  const isLoginPage = location.pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) {
      setIsReady(true);
      return;
    }

    bootstrap().then((loggedIn) => {
      if (!loggedIn && !admin) {
        navigate("/admin/login", { replace: true });
      }
      setIsReady(true);
    });
  }, [bootstrap, navigate, isLoginPage, admin]);

  if (isLoginPage) {
    return <Outlet />;
  }

  if (!isReady || isLoading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#F8F8F8] dark:bg-bg font-sans antialiased">
        <div className="relative flex flex-col items-center">
          <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-primary text-white font-bold text-2xl shadow-lg">
            B
          </div>
          <span className="mt-4 text-xs font-bold uppercase tracking-widest text-accent dark:text-accent-light animate-pulse">
            Authenticating Administrative Access...
          </span>
        </div>
      </div>
    );
  }

  if (!admin) {
    return null;
  }

  return (
    <ThemeProvider>
      <AdminLayout>
        <Outlet />
      </AdminLayout>
    </ThemeProvider>
  );
}

export function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminPortalLayout />}>
        {/* Public inside admin */}
        <Route path="login" element={<AdminLoginPage />} />

        {/* Dashboard & Core Ops */}
        <Route index element={<AdminDashboardPlaceholder />} />
        <Route path="orders" element={<AdminOrdersPage />} />
        <Route path="orders/live" element={<AdminOrdersPage />} />
        <Route path="orders/:orderId" element={<AdminOrdersPage />} />

        {/* Stores / Outlets */}
        <Route path="stores" element={<AdminStoresPage />} />
        <Route path="stores/create" element={<AdminStoresPage />} />
        <Route path="stores/:storeId" element={<AdminStoresPage />} />

        {/* Catalog / Menu */}
        <Route path="menu" element={<AdminMenuPage />} />

        {/* Marketing / Offers / Campaigns */}
        <Route path="offers" element={<AdminOffersPage />} />
        <Route path="coupons" element={<AdminCouponsPage />} />
        <Route path="campaigns" element={<AdminCampaignsPage />} />
        <Route path="campaigns/create" element={<AdminCreateCampaignPage />} />
        <Route path="templates" element={<AdminTemplatesPage />} />
        <Route
          path="marketing"
          element={
            <Suspense fallback={<AdminLazyFallback />}>
              <AdminMarketingDashboard />
            </Suspense>
          }
        />
        <Route path="automation" element={<AdminAutomationPage />} />

        {/* Customers */}
        <Route path="customers" element={<AdminCustomersPage />} />
        <Route path="customers/:id" element={<AdminCustomerProfilePage />} />
        <Route
          path="customers/analytics"
          element={
            <Suspense fallback={<AdminLazyFallback />}>
              <AdminCustomerAnalyticsPage />
            </Suspense>
          }
        />
        <Route path="customers/loyalty" element={<AdminLoyaltyConfigPage />} />
        <Route path="customers/segments" element={<AdminSegmentsPage />} />
        <Route path="segments" element={<AdminSegmentsPage />} />

        {/* Payments */}
        <Route path="payments" element={<AdminPaymentsPage />} />
        <Route path="payments/:id" element={<AdminPaymentDetailsPage />} />
        <Route
          path="payment-health"
          element={
            <Suspense fallback={<AdminLazyFallback />}>
              <AdminPaymentHealthPage />
            </Suspense>
          }
        />
        <Route path="refunds" element={<AdminRefundsPage />} />
        <Route path="reconciliation" element={<AdminReconciliationPage />} />

        {/* Hubs / Profile / Settings */}
        <Route
          path="analytics-hub"
          element={
            <Suspense fallback={<AdminLazyFallback />}>
              <AdminAnalyticsPage />
            </Suspense>
          }
        />
        <Route path="notifications-hub" element={<AdminNotificationsPage />} />
        <Route path="settings-hub" element={<AdminSettingsPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        <Route path="profile" element={<AdminProfilePage />} />
        <Route path="developer" element={<AdminDeveloperPage />} />

        {/* Petpooja POS Bridge & Delivery Operations */}
        <Route path="petpooja" element={<PetpoojaOperationsLayout />}>
          <Route
            index
            element={
              <Suspense fallback={<AdminLazyFallback />}>
                <PetpoojaDashboardPage />
              </Suspense>
            }
          />
          <Route path="stores" element={<PetpoojaStoresPage />} />
          <Route path="logs" element={<PetpoojaLogsPage />} />
          <Route path="webhooks" element={<PetpoojaWebhooksPage />} />
          <Route path="queues" element={<PetpoojaQueuesPage />} />
          <Route path="health" element={<PetpoojaHealthPage />} />
        </Route>

        {/* Delivery Queue (Mounted under PetpoojaOperationsLayout) */}
        <Route
          path="delivery-queue"
          element={
            <PetpoojaOperationsLayout>
              <DeliveryQueuePage />
            </PetpoojaOperationsLayout>
          }
        />


        {/* System Diagnostics (10 tabs Firestore-emulated) */}
        <Route path="system" element={<SystemOperationsLayout />}>
          <Route index element={<AdminSystemPage activeView="overview" />} />
          <Route path="apis" element={<AdminSystemPage activeView="apis" />} />
          <Route path="audit" element={<AdminSystemPage activeView="audit" />} />
          <Route path="database" element={<AdminSystemPage activeView="database" />} />
          <Route path="feature-flags" element={<AdminSystemPage activeView="feature-flags" />} />
          <Route path="health" element={<AdminSystemPage activeView="health" />} />
          <Route path="jobs" element={<AdminSystemPage activeView="jobs" />} />
          <Route path="logs" element={<AdminSystemPage activeView="logs" />} />
          <Route path="metrics" element={<AdminSystemPage activeView="metrics" />} />
          <Route path="queues" element={<AdminSystemPage activeView="queues" />} />
          <Route path="redis" element={<AdminSystemPage activeView="redis" />} />
          <Route path="security" element={<AdminSystemPage activeView="security" />} />
          <Route path="settings" element={<AdminSystemPage activeView="settings" />} />
        </Route>
      </Route>
    </Routes>
  );
}
