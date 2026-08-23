import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCustomer } from '@/hooks/useCustomer';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { ArrowLeft, Mail, Phone, MapPin, Star } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  preparing: 'bg-purple-100 text-purple-800',
  ready: 'bg-green-100 text-green-800',
  out_for_delivery: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: customer, isLoading } = useCustomer(id || '');

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!customer) {
    return <div className="text-center py-12">Customer not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-primary/5 rounded-xl"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-text-primary">
          {customer.name}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer Info */}
        <div className="bg-surface rounded-2xl border border-border p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              {customer.photoUrl ? (
                <img
                  src={customer.photoUrl}
                  alt={customer.name}
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <span className="text-2xl text-primary font-medium">
                  {customer.name?.charAt(0) || '?'}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-text-primary">
                {customer.name}
              </h2>
              <p className="text-text-secondary">
                Member since{' '}
                {customer.createdAt?.toDate().toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-text-secondary" />
              <span className="text-text-primary">{customer.phone}</span>
            </div>
            {customer.email && (
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-text-secondary" />
                <span className="text-text-primary">{customer.email}</span>
              </div>
            )}
            {customer.addresses?.length > 0 && (
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-text-secondary" />
                <span className="text-text-primary">
                  {customer.addresses[0].full}
                </span>
              </div>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-secondary" />
              <span className="font-semibold text-text-primary">
                {customer.loyaltyPoints || 0} Points
              </span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-surface rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-text-primary mb-4">Stats</h2>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-text-secondary">Total Orders</span>
              <span className="font-semibold text-text-primary">
                {customer.orderCount}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Total Spent</span>
              <span className="font-semibold text-text-primary">
                ₹{customer.totalSpent.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Average Order</span>
              <span className="font-semibold text-text-primary">
                ₹
                {customer.orderCount > 0
                  ? Math.round(customer.totalSpent / customer.orderCount)
                  : 0}
              </span>
            </div>
          </div>
        </div>

        {/* Order History */}
        <div className="bg-surface rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-text-primary mb-4">
            Recent Orders
          </h2>
          <div className="space-y-3">
            {customer.orders.length === 0 ? (
              <p className="text-text-secondary text-center py-4">
                No orders yet
              </p>
            ) : (
              customer.orders.slice(0, 5).map((order) => (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}`}
                  className="block p-3 rounded-xl hover:bg-primary/5 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-text-primary">
                        #{order.id.slice(-6)}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {order.createdAt &&
                          formatDistanceToNow(order.createdAt.toDate(), {
                            addSuffix: true,
                          })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-text-primary">
                        ₹{order.total?.toLocaleString()}
                      </p>
                      <Badge className={statusColors[order.status]}>
                        {order.status}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
