import React, { useEffect, useState } from "react";
import { Routes, Route, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAdminAuthStore } from "@/admin/store/adminAuthStore";
import { AdminLayout } from "@/admin/layouts/AdminLayout";
import { PetpoojaOperationsLayout } from "@/admin/layouts/PetpoojaOperationsLayout";
import { SystemOperationsLayout } from "@/admin/layouts/SystemOperationsLayout";
import { ThemeProvider } from "@/admin/theme/ThemeContext";

// Admin Pages
import { AdminDashboardPlaceholder } from "@/admin/pages/AdminDashboardPlaceholder";
import { AdminLoginPage } from "@/admin/pages/AdminLoginPage";
import { AdminOrdersPage } from "@/admin/pages/AdminOrdersPage";
import { AdminStoresPage } from "@/admin/pages/AdminStoresPage";
import { AdminMenuPage } from "@/admin/pages/AdminMenuPage";
import { AdminOffersPage } from "@/admin/pages/AdminOffersPage";
import { AdminCouponsPage } from "@/admin/pages/AdminCouponsPage";
import { AdminCampaignsPage } from "@/admin/pages/AdminCampaignsPage";
import { AdminCreateCampaignPage } from "@/admin/pages/AdminCreateCampaignPage";
import { AdminTemplatesPage } from "@/admin/pages/AdminTemplatesPage";
import { AdminMarketingDashboard } from "@/admin/pages/AdminMarketingDashboard";
import { AdminAutomationPage } from "@/admin/pages/AdminAutomationPage";
import { AdminCustomersPage } from "@/admin/pages/AdminCustomersPage";
import { AdminCustomerProfilePage } from "@/admin/pages/AdminCustomerProfilePage";
import { AdminCustomerAnalyticsPage } from "@/admin/pages/AdminCustomerAnalyticsPage";
import { AdminLoyaltyConfigPage } from "@/admin/pages/AdminLoyaltyConfigPage";
import { AdminSegmentsPage } from "@/admin/pages/AdminSegmentsPage";
import { AdminPaymentsPage } from "@/admin/pages/AdminPaymentsPage";
import { AdminPaymentDetailsPage } from "@/admin/pages/AdminPaymentDetailsPage";
import { AdminPaymentHealthPage } from "@/admin/pages/AdminPaymentHealthPage";
import { AdminRefundsPage } from "@/admin/pages/AdminRefundsPage";
import { AdminReconciliationPage } from "@/admin/pages/AdminReconciliationPage";
import { AdminAnalyticsPage } from "@/admin/pages/AdminAnalyticsPage";
import { AdminNotificationsPage } from "@/admin/pages/AdminNotificationsPage";
import { AdminSettingsPage } from "@/admin/pages/AdminSettingsPage";
import { AdminProfilePage } from "@/admin/pages/AdminProfilePage";
import { AdminDeveloperPage } from "@/admin/pages/AdminDeveloperPage";
import { AdminSystemPage } from "@/admin/pages/AdminSystemPage";

// Petpooja Pages
import {
  PetpoojaDashboardPage,
  PetpoojaStoresPage,
  PetpoojaLogsPage,
  PetpoojaWebhooksPage,
  PetpoojaQueuesPage,
  PetpoojaHealthPage,
} from "@/admin/pages/petpooja";

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
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#F8F8F8] dark:bg-[#0D0F0D] font-sans antialiased">
        <div className="relative flex flex-col items-center">
          <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-[#0E4825] text-white font-bold text-2xl shadow-lg">
            B
          </div>
          <span className="mt-4 text-xs font-bold uppercase tracking-widest text-[#FF6600] animate-pulse">
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
        <Route path="marketing" element={<AdminMarketingDashboard />} />
        <Route path="automation" element={<AdminAutomationPage />} />

        {/* Customers */}
        <Route path="customers" element={<AdminCustomersPage />} />
        <Route path="customers/:id" element={<AdminCustomerProfilePage />} />
        <Route path="customers/analytics" element={<AdminCustomerAnalyticsPage />} />
        <Route path="customers/loyalty" element={<AdminLoyaltyConfigPage />} />
        <Route path="customers/segments" element={<AdminSegmentsPage />} />
        <Route path="segments" element={<AdminSegmentsPage />} />

        {/* Payments */}
        <Route path="payments" element={<AdminPaymentsPage />} />
        <Route path="payments/:id" element={<AdminPaymentDetailsPage />} />
        <Route path="payment-health" element={<AdminPaymentHealthPage />} />
        <Route path="refunds" element={<AdminRefundsPage />} />
        <Route path="reconciliation" element={<AdminReconciliationPage />} />

        {/* Hubs / Profile / Settings */}
        <Route path="analytics-hub" element={<AdminAnalyticsPage />} />
        <Route path="notifications-hub" element={<AdminNotificationsPage />} />
        <Route path="settings-hub" element={<AdminSettingsPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        <Route path="profile" element={<AdminProfilePage />} />
        <Route path="developer" element={<AdminDeveloperPage />} />

        {/* Petpooja POS Bridge */}
        <Route path="petpooja" element={<PetpoojaOperationsLayout />}>
          <Route index element={<PetpoojaDashboardPage />} />
          <Route path="stores" element={<PetpoojaStoresPage />} />
          <Route path="logs" element={<PetpoojaLogsPage />} />
          <Route path="webhooks" element={<PetpoojaWebhooksPage />} />
          <Route path="queues" element={<PetpoojaQueuesPage />} />
          <Route path="health" element={<PetpoojaHealthPage />} />
        </Route>

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
