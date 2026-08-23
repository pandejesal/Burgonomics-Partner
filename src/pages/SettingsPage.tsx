import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { Badge } from '@/components/ui/Badge';
import { User, Bell, Shield, Info, LogOut, Phone, Mail, Building } from 'lucide-react';

const roleLabels: Record<string, string> = {
  brand_owner: 'Brand Owner / Global Admin',
  regional_manager: 'Regional City Manager',
  branch_owner: 'Branch Owner / Store Manager',
};

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const { unreadCount } = useNotifications();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Settings & Account</h1>
        <p className="text-sm text-text-secondary">
          Profile configuration, operational scopes, and application preferences.
        </p>
      </div>

      {/* Profile Section */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs">
        <h2 className="font-bold text-text-primary mb-4 flex items-center gap-2 text-base">
          <User className="w-5 h-5 text-primary" />
          <span>Operator Profile</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3.5 bg-bg/50 rounded-xl border border-border/60">
            <label className="text-xs text-text-secondary flex items-center gap-1.5 mb-1">
              <User className="w-3.5 h-3.5" />
              <span>Full Name</span>
            </label>
            <p className="font-semibold text-text-primary text-sm">
              {user?.name || 'Operator'}
            </p>
          </div>

          <div className="p-3.5 bg-bg/50 rounded-xl border border-border/60">
            <label className="text-xs text-text-secondary flex items-center gap-1.5 mb-1">
              <Mail className="w-3.5 h-3.5" />
              <span>Email Address</span>
            </label>
            <p className="font-semibold text-text-primary text-sm font-mono truncate">
              {user?.email || 'N/A'}
            </p>
          </div>

          <div className="p-3.5 bg-bg/50 rounded-xl border border-border/60">
            <label className="text-xs text-text-secondary flex items-center gap-1.5 mb-1">
              <Phone className="w-3.5 h-3.5" />
              <span>Contact Number</span>
            </label>
            <p className="font-semibold text-text-primary text-sm font-mono">
              {user?.phone || '+91 Unassigned'}
            </p>
          </div>

          <div className="p-3.5 bg-bg/50 rounded-xl border border-border/60">
            <label className="text-xs text-text-secondary flex items-center gap-1.5 mb-1">
              <Shield className="w-3.5 h-3.5" />
              <span>Operational Role</span>
            </label>
            <div className="mt-1">
              <Badge className="bg-primary/10 text-primary border border-primary/20">
                {roleLabels[user?.role || ''] || user?.role}
              </Badge>
            </div>
          </div>
        </div>

        {user?.branchIds && user.branchIds.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border flex items-center gap-2 text-xs text-text-secondary">
            <Building className="w-4 h-4 text-primary" />
            <span>
              Assigned Outlets ({user.branchIds.length}):{' '}
              <strong className="text-text-primary">{user.branchIds.join(', ')}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Notifications Quick Link Section */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs">
        <h2 className="font-bold text-text-primary mb-4 flex items-center gap-2 text-base">
          <Bell className="w-5 h-5 text-primary" />
          <span>Notification Alerts</span>
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-bg/50 rounded-xl border border-border/60">
          <div>
            <p className="font-semibold text-text-primary text-sm">
              Unread System & Order Alerts
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              {unreadCount > 0
                ? `You have ${unreadCount} unread notification(s) requiring attention.`
                : 'All alerts and order notifications are up to date.'}
            </p>
          </div>
          <Link
            to="/notifications"
            className="px-4 py-2 bg-primary text-white rounded-xl font-semibold text-xs hover:bg-primary-dark shadow-xs transition-colors self-start sm:self-center"
          >
            View Alert Center
          </Link>
        </div>
      </div>

      {/* App Information Section */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-xs">
        <h2 className="font-bold text-text-primary mb-4 flex items-center gap-2 text-base">
          <Info className="w-5 h-5 text-primary" />
          <span>Application Diagnostics</span>
        </h2>

        <div className="divide-y divide-border/60 text-xs">
          <div className="flex justify-between py-2.5">
            <span className="text-text-secondary">Platform Name</span>
            <span className="font-semibold text-text-primary">
              Burgonomics Partner Portal
            </span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-text-secondary">Release Version</span>
            <span className="font-semibold text-text-primary font-mono">1.0.0 (Gold)</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-text-secondary">Native Container</span>
            <span className="font-semibold text-text-primary">
              Capacitor 8 (Android API 36)
            </span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-text-secondary">POS Bridge Version</span>
            <span className="font-semibold text-text-primary">
              Petpooja API v2.1.0 (Direct KOT)
            </span>
          </div>
        </div>
      </div>

      {/* Sign Out CTA */}
      <div className="pt-2">
        <button
          onClick={() => signOut()}
          className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 rounded-xl font-bold text-sm hover:bg-red-100 border border-red-200 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out of Operator Session</span>
        </button>
      </div>
    </div>
  );
}

export default SettingsPage;
