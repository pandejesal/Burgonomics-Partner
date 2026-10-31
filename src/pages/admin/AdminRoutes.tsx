import React, { Suspense, lazy } from "react";
import { Routes, Route, Outlet, Navigate, Link } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { AdminLayout } from "@/admin/layouts/AdminLayout";
import { PetpoojaOperationsLayout } from "@/admin/layouts/PetpoojaOperationsLayout";
import { SystemOperationsLayout } from "@/admin/layouts/SystemOperationsLayout";
import { ThemeProvider } from "@/admin/theme/ThemeContext";

// Admin Pages — KDS/store-critical pages stay eager (kitchen + outlet ops
// must render with zero lazy delay). Everything else is route-level
// code-split via lazyPage below.
import { AdminDashboardPlaceholder } from "@/admin/pages/AdminDashboardPlaceholder";
import { AdminOrdersPage } from "@/admin/pages/AdminOrdersPage";
import { AdminStoresPage } from "@/admin/pages/AdminStoresPage";

// Heavy recharts pages are code-split so the initial admin bundle stays lean.
// (Previously every chart page loaded upfront → 1.2MB+ admin-analytics chunk.)
// NOTE: the marketing dashboard is intentionally absent — /admin/marketing is a
// retired mock route (see RETIRED_MOCK_ROUTES) and is never imported, so its
// recharts bundle stays out of the shipped app entirely.
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
// R22 (PA-01): the localStorage-only CRM pages (AdminCustomersPage /
// AdminCustomerProfilePage) are intentionally NOT routed here anymore —
// /admin/customers now navigates to the authoritative console CRM, and the
// :id deep-link fails closed with an honest unavailable page (see
// AdminCustomerRecordUnavailable below).
const AdminLoyaltyConfigPage = lazyPage(
  () => import("@/admin/pages/AdminLoyaltyConfigPage"),
  "AdminLoyaltyConfigPage"
);
const AdminSegmentsPage = lazyPage(
  () => named(() => import("@/admin/pages/AdminSegmentsPage"), "AdminSegmentsPage"),
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

/**
 * Roles permitted inside the Control Room (/admin/*).
 *
 * Single sign-in: the outer App router already enforces authentication via
 * the unified partner session. This is the second, role-level gate — brand
 * owners, developers and regional managers get the migrated admin surface.
 * Branch owners/staff and support keep their partner-console surface
 * (/dashboard, /orders, /menu, …) and are bounced to /dashboard.
 */
export const ADMIN_PORTAL_ROLES = ["brand_owner", "developer", "regional_manager"] as const;

export function AdminPortalLayout() {
  const { user, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#F8F8F8] dark:bg-bg font-sans antialiased">
        <div className="relative flex flex-col items-center">
          <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-primary text-white font-bold text-2xl shadow-lg">
            B
          </div>
          <span className="mt-4 text-xs font-bold uppercase tracking-widest text-accent dark:text-accent-light animate-pulse">
            Loading Control Room...
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!(ADMIN_PORTAL_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <ThemeProvider>
      <AdminLayout>
        <Outlet />
      </AdminLayout>
    </ThemeProvider>
  );
}

/**
 * R22 (PA-01) honest fail-closed stand-in for /admin/customers/:id.
 *
 * The retired admin CRM profile page rendered browser-local entries whose ids
 * were never Firestore `customers` documents: the CRM shipped no seed, has no
 * creation path, and persisted only to localStorage, so no local id can be
 * mapped to a real backend record. This route therefore never forwards the id
 * to the console /customers/:id profile (that would presume a backend record
 * exists for a local-only reference) and renders no customer data at all —
 * it states the limitation and points at the authoritative CRM list.
 */
export function AdminCustomerRecordUnavailable() {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-16 text-center font-sans">
      <h1 className="text-lg font-black text-gray-900 dark:text-white">
        Customer profile unavailable from the admin portal
      </h1>
      <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        Customer profiles in the former admin demo CRM were stored only in
        this browser and were never real customer records. This link cannot be
        opened as a customer profile, and no backend record is assumed for it.
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Open the authoritative customer CRM to find and view real customer
        records:
      </p>
      <Link
        to="/customers"
        className="inline-block rounded-xl bg-[#0E4825] px-4 py-2 text-xs font-bold text-white"
      >
        Open Customer CRM (/customers)
      </Link>
    </div>
  );
}

export function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminPortalLayout />}>
        {/* Legacy deep-link: the standalone /admin/login no longer exists —
            single sign-in lives at /login. Keep the path as a redirect so
            bookmarks and the old handover screenshots 18-22 resolve. */}
        <Route path="login" element={<Navigate to="/login" replace />} />

        {/* Dashboard & Core Ops */}
        <Route index element={<AdminDashboardPlaceholder />} />
        <Route path="orders" element={<AdminOrdersPage />} />
        <Route path="orders/live" element={<AdminOrdersPage />} />
        <Route path="orders/:orderId" element={<AdminOrdersPage />} />

        {/* Stores / Outlets */}
        <Route path="stores" element={<AdminStoresPage />} />
        <Route path="stores/create" element={<AdminStoresPage />} />
        <Route path="stores/:storeId" element={<AdminStoresPage />} />

        {/* Catalog / Menu — R22 (PA-02): the old /admin/menu mounted a
            hardcoded 5-item demo with component-state-only toggles (no
            Firestore/Petpooja backing). The authoritative catalog is the
            partner console /menu (useBranchMenu → Firestore `products`, with
            best-effort Petpooja POS propagation), which admin-portal roles
            can already reach under the existing route policy. The entry route
            navigates there instead of rendering fake inventory. */}
        <Route path="menu" element={<Navigate to="/menu" replace />} />

        {/* Marketing / Offers / Campaigns */}
        <Route path="offers" element={<AdminOffersPage />} />
        <Route path="coupons" element={<AdminCouponsPage />} />
        {/* Marketing / Campaigns / Automation (Retired mock routes -> redirect to active orders) */}
        <Route path="campaigns" element={<Navigate to="/admin/orders" replace />} />
        <Route path="campaigns/create" element={<Navigate to="/admin/orders" replace />} />
        <Route path="templates" element={<Navigate to="/admin/orders" replace />} />
        <Route path="marketing" element={<Navigate to="/admin/orders" replace />} />
        <Route path="automation" element={<Navigate to="/admin/orders" replace />} />

        {/* Customers — R22 (PA-01): the old /admin/customers CRM read and
            wrote localStorage only ("Local directory" badge; mutations with
            fabricated attribution). The authoritative CRM is the partner
            console /customers (Firestore `customers`, rules-scoped). The
            entry route navigates there. The :id deep-link fails closed with
            an honest unavailable page — local CRM ids were never Firestore
            doc ids, so forwarding them would presume a backend record.
            analytics/segments/loyalty sub-routes below are preserved
            unchanged (static paths rank above the :id fallback). */}
        <Route path="customers" element={<Navigate to="/customers" replace />} />
        <Route path="customers/:id" element={<AdminCustomerRecordUnavailable />} />
        <Route
          path="customers/analytics"
          element={
            <Suspense fallback={<AdminLazyFallback />}>
              <AdminCustomerAnalyticsPage />
            </Suspense>
          }
        />
        <Route path="customers/loyalty" element={<Navigate to="/admin/orders" replace />} />
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
        <Route path="notifications-hub" element={<Navigate to="/admin/orders" replace />} />
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

        {/* Legacy/deep-link targets: the AOV KPI card and old bookmarks point at
            /admin/analytics, which was never a route — redirect to the registered
            hub instead of an empty content pane. */}
        <Route path="analytics" element={<Navigate to="/admin/analytics-hub" replace />} />
        {/* Unregistered /admin/... paths rendered an empty pane (sidebar stayed,
            content blank) — bounce them to the admin home. */}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
