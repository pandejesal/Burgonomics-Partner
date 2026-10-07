import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { OrderDetailPage } from '@/pages/OrderDetailPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { CustomerDetailPage } from '@/pages/CustomerDetailPage';
import { TicketsPage } from '@/pages/TicketsPage';
import { TicketDetailPage } from '@/pages/TicketDetailPage';
import { MenuPage } from '@/pages/MenuPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { BranchesPage } from '@/pages/BranchesPage';
import { UsersPage } from '@/pages/UsersPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { DeliveryQueuePage } from '@/pages/DeliveryQueuePage';
import { KDSPage } from '@/pages/KDSPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/core/auth/ProtectedRoute';
import { AdminRoutes, ADMIN_PORTAL_ROLES } from '@/pages/admin/AdminRoutes';
import { ChatPage } from '@/pages/ChatPage';

import { AuthProvider } from '@/core/auth/AuthContext';
import { Toaster, toast } from 'sonner';
import { AppErrorBoundary } from '@/core/errors/AppErrorBoundary';

const queryCache = new QueryCache({
  onError: (error) => {
    console.error('[QueryCache] Uncaught query error:', error);
    toast.error('Data load failed', { description: error?.message || 'Please reload and try again' });
  },
});

const mutationCache = new MutationCache({
  onError: (error) => {
    console.error('[MutationCache] Uncaught mutation error:', error);
    toast.error('Action failed', { description: error?.message || 'Please try again' });
  },
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      retry: 1,
    },
  },
  queryCache,
  mutationCache,
});

// Router shell only: BrowserRouter breaks on native file:/// URLs (no server
// to resolve deep paths on cold start). HashRouter keeps routing client-side
// on-device; web keeps BrowserRouter. No route/logic changes.
const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;

/**
 * Inner error boundary INSIDE the router (P0-2): a thrown render/effect error
 * in any route renders the boundary fallback within the router shell instead
 * of unmounting <Router> itself (the outer AppErrorBoundary still owns
 * boot/render failures around the router and is unchanged). Keyed to the
 * current pathname so navigating (e.g. browser back) remounts it and resets
 * the error state. AppErrorBoundary is a plain class component — no router
 * hooks — so nesting it under useLocation is safe.
 */
function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <AppErrorBoundary key={location.pathname}>{children}</AppErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppErrorBoundary>
          <Router>
          <RouteErrorBoundary>
          <Routes>
          {/* Public routes — single sign-in lives here. The legacy
              second login at /admin/login is gone (redirects to /login). */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected partner routes — one Firebase session for everything,
              including the migrated Control Room (/admin/*). */}
          <Route element={<ProtectedRoute />}>
            {/* Control Room (migrated admin portal, 44 pages).
                Role gate lives in AdminPortalLayout; this wrapper only
                guarantees authentication. */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute
                  allowedRoles={[...ADMIN_PORTAL_ROLES]}
                >
                  <AdminRoutes />
                </ProtectedRoute>
              }
            />
            {/* Fullscreen Dedicated Kitchen Display System */}
            <Route path="/kds" element={<KDSPage />} />

            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/:id" element={<OrderDetailPage />} />
              <Route path="/delivery-queue" element={<DeliveryQueuePage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/tickets" element={<TicketsPage />} />
              <Route path="/tickets/:id" element={<TicketDetailPage />} />
              <Route path="/menu" element={<MenuPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/settings" element={<SettingsPage />} />

              {/* Brand owner, Developer, Support & Regional Manager */}
              <Route
                path="/branches"
                element={
                  <ProtectedRoute
                    allowedRoles={['brand_owner', 'developer', 'support', 'regional_manager']}
                  >
                    <BranchesPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/analytics"
                element={
                  <ProtectedRoute
                    allowedRoles={[
                      'brand_owner',
                      'developer',
                      'support',
                      'regional_manager',
                      'branch_owner',
                    ]}
                  >
                    <AnalyticsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedRoute
                    allowedRoles={['brand_owner', 'developer', 'support', 'regional_manager']}
                  >
                    <UsersPage />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Route>

          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </RouteErrorBoundary>
      </Router>
      </AppErrorBoundary>
      <Toaster position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
