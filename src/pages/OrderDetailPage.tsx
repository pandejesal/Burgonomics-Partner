import { useParams, useNavigate } from 'react-router-dom';
import { useOrder } from '@/hooks/useOrder';
import type { OrderStatus } from '@/types';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { ArrowLeft, Package, MapPin, CreditCard } from 'lucide-react';
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

const statusFlow: Record<string, OrderStatus[]> = {
  pending: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready'],
  ready: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
};

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { order, isLoading, updateStatus } = useOrder(id || '');

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!order) {
    return <div className="text-center py-12">Order not found</div>;
  }

  const nextStatuses = statusFlow[order.status] || [];

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
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-primary">
            Order #{order.id.slice(-6)}
          </h1>
          <p className="text-text-secondary">
            {order.createdAt &&
              formatDistanceToNow(order.createdAt.toDate(), {
                addSuffix: true,
              })}
          </p>
        </div>
        <Badge className={statusColors[order.status]}>{order.status}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Items */}
        <div className="lg:col-span-2 bg-surface rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Package className="w-5 h-5" />
            Order Items
          </h2>
          <div className="space-y-3">
            {order.items?.map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <div>
                  <p className="font-medium text-text-primary">{item.name}</p>
                  <p className="text-sm text-text-secondary">
                    Qty: {item.quantity} x ₹{item.price}
                  </p>
                  {item.specialInstructions && (
                    <p className="text-xs text-text-secondary italic">
                      Note: {item.specialInstructions}
                    </p>
                  )}
                </div>
                <p className="font-medium text-text-primary">
                  ₹{(item.quantity * item.price).toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Subtotal</span>
              <span className="text-text-primary">
                ₹{order.subtotal?.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Tax</span>
              <span className="text-text-primary">
                ₹{order.tax?.toLocaleString()}
              </span>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Delivery Fee</span>
                <span className="text-text-primary">
                  ₹{order.deliveryFee?.toLocaleString()}
                </span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-lg mt-2">
              <span className="text-text-primary">Total</span>
              <span className="text-primary">
                ₹{order.total?.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Order Info */}
        <div className="space-y-6">
          {/* Customer Info */}
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-4">
              Customer
            </h2>
            <div className="space-y-2">
              <p className="text-text-primary">{order.customerName}</p>
              <p className="text-sm text-text-secondary">
                {order.customerPhone}
              </p>
            </div>
          </div>

          {/* Delivery Address */}
          {order.orderType === 'delivery' && order.deliveryAddress && (
            <div className="bg-surface rounded-2xl border border-border p-6">
              <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Delivery Address
              </h2>
              <p className="text-text-secondary">
                {order.deliveryAddress.full}
              </p>
            </div>
          )}

          {/* Payment Info */}
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Payment
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-text-secondary">Method</span>
                <span className="text-text-primary uppercase">
                  {order.paymentMethod}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Status</span>
                <Badge
                  className={
                    order.paymentStatus === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }
                >
                  {order.paymentStatus}
                </Badge>
              </div>
            </div>
          </div>

          {/* Actions */}
          {nextStatuses.length > 0 && (
            <div className="bg-surface rounded-2xl border border-border p-6">
              <h2 className="font-semibold text-text-primary mb-4">
                Actions
              </h2>
              <div className="space-y-2">
                {nextStatuses.map((status) => (
                  <button
                    key={status}
                    onClick={() => updateStatus.mutate(status)}
                    disabled={updateStatus.isPending}
                    className={`w-full py-2 rounded-xl font-medium transition-colors ${
                      status === 'cancelled'
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'bg-primary text-white hover:bg-primary-dark'
                    }`}
                  >
                    {updateStatus.isPending ? 'Updating...' : `Mark as ${status}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
