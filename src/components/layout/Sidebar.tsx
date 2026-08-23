import { Link, useLocation } from 'react-router-dom';
import { useNavigation } from '@/hooks/useNavigation';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { clsx } from 'clsx';

export function Sidebar() {
  const { navItems } = useNavigation();
  const { sidebarOpen, setSidebarOpen } = useAppStore();
  const { user } = useAuth();
  const location = useLocation();

  return (
    <aside
      className={clsx(
        'fixed top-0 left-0 z-50 h-full w-64 bg-surface border-r border-border transition-transform duration-300',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-center border-b border-border">
        <Link to="/dashboard" onClick={() => setSidebarOpen(false)}>
          <h1 className="text-xl font-bold text-primary">Burgonomics</h1>
          <p className="text-xs text-text-secondary text-center">Partner Portal</p>
        </Link>
      </div>

      {/* User info */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-semibold">
              {user?.name?.charAt(0) || 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {user?.name}
            </p>
            <p className="text-xs text-text-secondary capitalize">
              {user?.role?.replace('_', ' ')}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:bg-primary/5 hover:text-primary'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
