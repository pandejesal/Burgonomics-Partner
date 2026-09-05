import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminRoutes } from '@/pages/admin/AdminRoutes';
import { ChatPage } from '@/pages/ChatPage';

import { AuthProvider } from '@/core/auth/AuthContext';
import { Toaster } from 'sonner';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Admin Portal (44 pages) */}
          <Route path="/admin/*" element={<AdminRoutes />} />

          {/* Protected partner routes */}
          <Route element={<ProtectedRoute />}>
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
      </BrowserRouter>
      <Toaster position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
