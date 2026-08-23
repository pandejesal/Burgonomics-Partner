import { Link } from 'react-router-dom';
import type { Order } from '@/types';
import { Badge } from '@/components/ui/Badge';

interface RecentOrdersProps {
  orders: Order[];
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  preparing: 'bg-purple-100 text-purple-800',
  ready: 'bg-green-100 text-green-800',
  out_for_delivery: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export function RecentOrders({ orders }: RecentOrdersProps) {
  return (
    <div className="bg-surface rounded-2xl border border-border">
      <div className="p-4 lg:p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary">Recent Orders</h3>
          <Link
            to="/orders"
            className="text-sm text-primary hover:underline"
          >
            View All
          </Link>
        </div>
      </div>

      <div className="divide-y divide-border">
        {orders.length === 0 ? (
          <div className="p-6 text-center text-text-secondary">
            No recent orders
          </div>
        ) : (
          orders.map((order) => (
            <Link
              key={order.id}
              to={`/orders/${order.id}`}
              className="flex items-center justify-between p-4 hover:bg-primary/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-medium text-sm">
                    {order.customerName?.charAt(0) || '?'}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-text-primary">
                    {order.customerName}
                  </p>
                  <p className="text-sm text-text-secondary">
                    #{order.id.slice(-6)}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="font-medium text-text-primary">
                  ₹{order.total?.toLocaleString()}
                </p>
                <Badge className={statusColors[order.status]}>
                  {order.status}
                </Badge>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
