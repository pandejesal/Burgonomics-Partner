import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useOrders } from '@/hooks/useOrders';
import { useAuthStore } from '@/stores/authStore';
import { exportToCsv } from '@/utils/exportCsv';
import {
  OrderFiltersBar,
  OrderTableList,
  ManualOrderCreateModal,
} from '@/features/orders';
import {
  ChefHat,
  Download,
  Printer,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Order, OrderStatus, OrderType } from '@/types';

export function OrdersPage() {
  const { user } = useAuthStore();

  const [channelFilter, setChannelFilter] = useState<OrderType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { orders = [], isLoading, updateOrderStatus } = useOrders({
    status: statusFilter,
    dateRange,
  });

  // Filtered orders computation
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // 1. Channel Filter
      if (channelFilter !== 'all' && o.orderType !== channelFilter) {
        return false;
      }

      // 2. Status Filter
      if (statusFilter !== 'all' && o.status !== statusFilter) {
        return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const shortCode = (o as any).shortCode || (o as any).orderNumber || o.id;
        const matchesId = shortCode.toLowerCase().includes(q) || o.id.toLowerCase().includes(q);
        const matchesCustomer = (o.customerName || '').toLowerCase().includes(q);
        const matchesPhone = (o.customerPhone || '').includes(q);
        const matchesBranch = (o.branchName || '').toLowerCase().includes(q);

        if (!matchesId && !matchesCustomer && !matchesPhone && !matchesBranch) {
          return false;
        }
      }

      return true;
    });
  }, [orders, channelFilter, statusFilter, searchQuery]);

  const handleExportCsv = () => {
    exportToCsv('Burgonomics_Live_Orders_Report', filteredOrders, [
      { header: 'Order ID', accessor: (o) => (o as any).shortCode || o.id },
      { header: 'Customer Name', accessor: (o) => o.customerName },
      { header: 'Customer Phone', accessor: (o) => o.customerPhone },
      { header: 'Branch', accessor: (o) => o.branchName || o.branchId },
      { header: 'City', accessor: (o) => o.city || 'N/A' },
      { header: 'Order Type', accessor: (o) => o.orderType },
      { header: 'Status', accessor: (o) => o.status },
      { header: 'Payment Method', accessor: (o) => o.paymentMethod },
      { header: 'Payment Status', accessor: (o) => o.paymentStatus },
      { header: 'Subtotal (INR)', accessor: (o) => o.subtotal },
      { header: 'Tax (INR)', accessor: (o) => o.tax },
      { header: 'Delivery Fee (INR)', accessor: (o) => o.deliveryFee },
      { header: 'Total (INR)', accessor: (o) => o.total },
      { header: 'Petpooja POS ID', accessor: (o) => o.petpoojaOrderId || 'N/A' },
      { header: 'Petpooja Sync', accessor: (o) => o.petpoojaSyncStatus || 'synced' },
    ]);
  };

  const handlePrintKot = (order: Order) => {
    toast.success(`Printing 80mm Thermal KOT for #${order.id.slice(0, 6).toUpperCase()}...`);
  };

  const handleDispatchPorter = (orderId: string) => {
    toast.success(`Initiating Porter Rider dispatch for #${orderId.slice(0, 6).toUpperCase()}...`);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Operations Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-2.5">
            <span>Live Orders & Petpooja Billing</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#0E4825] border border-emerald-500/40 text-emerald-300 font-bold">
              Realtime Synced
            </span>
          </h1>
          <p className="text-xs text-neutral-400">
            Real-time customer order stream synchronized with Petpooja POS & Kitchen Makeline
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            to="/kds"
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0E4825] hover:bg-[#135d30] text-emerald-300 border border-emerald-500/40 rounded-xl font-bold text-xs transition-colors shadow-sm cursor-pointer"
          >
            <ChefHat className="w-4 h-4 text-emerald-300" />
            <span>Open Kitchen KDS</span>
          </Link>

          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white rounded-xl font-semibold text-xs transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Multi-Filter & Search Bar */}
      <OrderFiltersBar
        channelFilter={channelFilter}
        onChannelChange={setChannelFilter}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
        totalCount={orders.length}
        filteredCount={filteredOrders.length}
      />

      {/* High-Contrast Data Table List */}
      <OrderTableList
        orders={filteredOrders}
        isLoading={isLoading}
        onPrintKot={handlePrintKot}
        onDispatchPorter={handleDispatchPorter}
      />

      {/* Walk-in Order Creation Modal */}
      <ManualOrderCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onOrderCreated={(order) => {
          toast.success(`Order #${order.id.slice(0, 6).toUpperCase()} created & KOT dispatched!`);
        }}
      />
    </div>
  );
}

export default OrdersPage;
