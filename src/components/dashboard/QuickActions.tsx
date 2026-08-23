import { Link } from 'react-router-dom';
import { ClipboardList, Users, Ticket, UtensilsCrossed } from 'lucide-react';

const actions = [
  {
    label: 'View Orders',
    icon: ClipboardList,
    path: '/orders',
    color: 'bg-primary/10 text-primary',
  },
  {
    label: 'Customers',
    icon: Users,
    path: '/customers',
    color: 'bg-secondary/10 text-secondary-dark',
  },
  {
    label: 'Tickets',
    icon: Ticket,
    path: '/tickets',
    color: 'bg-accent/10 text-accent',
  },
  {
    label: 'Menu',
    icon: UtensilsCrossed,
    path: '/menu',
    color: 'bg-purple-100 text-purple-600',
  },
];

export function QuickActions() {
  return (
    <div className="bg-surface rounded-2xl border border-border p-4 lg:p-6">
      <h3 className="font-semibold text-text-primary mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {actions.map((action) => (
          <Link
            key={action.path}
            to={action.path}
            className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-primary/5 transition-colors"
          >
            <div className={`p-3 rounded-xl ${action.color}`}>
              <action.icon className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium text-text-primary">
              {action.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
