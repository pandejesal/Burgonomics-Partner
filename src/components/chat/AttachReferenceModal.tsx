import React, { useState } from 'react';
import { X, ShoppingBag, LifeBuoy, Search, CheckCircle2, ChevronRight, AlertCircle } from 'lucide-react';
import { useOrders } from '@/hooks/useOrders';
import { useTickets } from '@/hooks/useTickets';
import type { Order, Ticket } from '@/types';

interface AttachReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectOrder: (order: Order) => void;
  onSelectTicket: (ticket: Ticket) => void;
}

export const AttachReferenceModal: React.FC<AttachReferenceModalProps> = ({
  isOpen,
  onClose,
  onSelectOrder,
  onSelectTicket,
}) => {
  const [tab, setTab] = useState<'orders' | 'tickets'>('orders');
  const [search, setSearch] = useState('');

  const { orders, isLoading: loadingOrders } = useOrders();
  const { tickets, isLoading: loadingTickets } = useTickets();

  if (!isOpen) return null;

  const filteredOrders = orders.filter(
    (o) =>
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      o.customerName.toLowerCase().includes(search.toLowerCase()) ||
      o.items?.some((i) => i.name.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredTickets = tickets.filter(
    (t) =>
      t.id.toLowerCase().includes(search.toLowerCase()) ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl text-white">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Attach Reference Card</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-accent/20 text-accent-light border border-accent/40 uppercase font-mono">
                1-Click Embed
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              Attach an active customer order or support incident to this chat message
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-surface-hover cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector & Search */}
        <div className="p-4 bg-[#0E1E12] border-b border-border space-y-3">
          <div className="grid grid-cols-2 p-1 bg-bg rounded-xl border border-border text-xs font-bold">
            <button
              onClick={() => setTab('orders')}
              className={`py-2 rounded-lg transition-colors flex items-center justify-center space-x-1.5 cursor-pointer ${
                tab === 'orders'
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Live Orders ({orders.length})</span>
            </button>
            <button
              onClick={() => setTab('tickets')}
              className={`py-2 rounded-lg transition-colors flex items-center justify-center space-x-1.5 cursor-pointer ${
                tab === 'tickets'
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <LifeBuoy className="w-3.5 h-3.5" />
              <span>Support Tickets ({tickets.length})</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={tab === 'orders' ? 'Search order ID, customer...' : 'Search ticket ID, title...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-bg border border-border rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Items List */}
        <div className="max-h-80 overflow-y-auto divide-y divide-[#1A3320] p-2">
          {tab === 'orders' ? (
            loadingOrders ? (
              <div className="p-8 text-center text-xs text-zinc-400">Loading orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400">No matching orders found.</div>
            ) : (
              filteredOrders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => {
                    onSelectOrder(order);
                    onClose();
                  }}
                  className="w-full text-left p-3 rounded-xl hover:bg-[#1A351F] transition-colors flex items-center justify-between group cursor-pointer"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-300 text-xs">
                        #{order.id.slice(-6).toUpperCase()}
                      </span>
                      <span className="text-white text-xs font-bold">{order.customerName}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {order.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      {order.items?.length || 1} items • ₹{order.total} •{' '}
                      <span className="capitalize">{order.orderType || 'delivery'}</span>
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                </button>
              ))
            )
          ) : loadingTickets ? (
            <div className="p-8 text-center text-xs text-zinc-400">Loading tickets...</div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400">No matching tickets found.</div>
          ) : (
            filteredTickets.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => {
                  onSelectTicket(ticket);
                  onClose();
                }}
                className="w-full text-left p-3 rounded-xl hover:bg-[#1A351F] transition-colors flex items-center justify-between group cursor-pointer"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-rose-300 text-xs">
                      #{ticket.id.slice(-6).toUpperCase()}
                    </span>
                    <span className="text-white text-xs font-bold">{ticket.title}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        ticket.priority === 'urgent'
                          ? 'bg-rose-950 text-rose-400 border border-rose-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {ticket.priority}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Category: <span className="text-zinc-200 capitalize">{ticket.category}</span> •{' '}
                    Status: <span className="text-emerald-400 capitalize">{ticket.status}</span>
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AttachReferenceModal;
