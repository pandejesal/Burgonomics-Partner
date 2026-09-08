import React, { useState } from 'react';
import {
  X,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Printer,
  CreditCard,
  Banknote,
  QrCode,
  ShoppingBag,
  UtensilsCrossed,
  Bike,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/config/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import type { Order, OrderStatus, OrderType, OrderItem } from '@/types';
import { toDeliveryStatusMeta } from '@/utils/orderContract';

interface ManualOrderCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated?: (order: Order) => void;
}

const MENU_ITEMS = [
  { id: 'itm_paneer_makhani', name: 'Paneer Makhani Burst Burger', price: 199, petpoojaId: 'PP-BRG-103' },
  { id: 'itm_cheese_lava', name: 'Cheese Lava Monster Burger', price: 249, petpoojaId: 'PP-BRG-104' },
  { id: 'itm_classic_crunch', name: 'Classic Veggie Crunch Burger', price: 129, petpoojaId: 'PP-BRG-101' },
  { id: 'itm_truffle_smash', name: 'Double Truffle Smash Burger', price: 349, petpoojaId: 'PP-BRG-107' },
  { id: 'itm_peri_peri_fries', name: 'Peri-Peri Crinkle Fries', price: 99, petpoojaId: 'PP-SDE-301' },
  { id: 'itm_cheesy_dip', name: 'Signature Garlic Herb Dip', price: 49, petpoojaId: 'PP-DIP-401' },
  { id: 'itm_iced_tea', name: 'Peach Passion Iced Tea', price: 89, petpoojaId: 'PP-BEV-501' },
];

export function ManualOrderCreateModal({
  isOpen,
  onClose,
  onOrderCreated,
}: ManualOrderCreateModalProps) {
  const { user } = useAuthStore();
  const { selectedBranchId } = useAppStore();

  const [orderType, setOrderType] = useState<OrderType>('takeaway');
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('+91 ');
  const [specialInstructions, setSpecialInstructions] = useState('');

  const [selectedItems, setSelectedItems] = useState<
    Array<{ item: (typeof MENU_ITEMS)[0]; quantity: number; notes?: string }>
  >([
    { item: MENU_ITEMS[0], quantity: 1 },
    { item: MENU_ITEMS[4], quantity: 1 },
  ]);

  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'upi' | 'razorpay'>('cod');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cashTendered, setCashTendered] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  /** Normalized +91XXXXXXXXXX or null. Riders/KOT need a real number — never a fake default. */
  const normalizedPhone = (raw: string): string | null => {
    const digits = raw.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : null;
  };

  if (!isOpen) return null;

  const subtotal = selectedItems.reduce((acc, curr) => acc + curr.item.price * curr.quantity, 0);
  const tax = Math.round(subtotal * 0.05); // 5% GST
  const packagingFee = orderType === 'takeaway' ? 15 : 0;
  const total = subtotal + tax + packagingFee;

  /** Max units per line — beyond this the bill needs a supervisor split. */
  const MAX_QTY_PER_LINE = 20;

  const tenderedRaw = cashTendered.trim() === '' ? NaN : Number(cashTendered);
  const tenderedNumber = Number.isFinite(tenderedRaw) && tenderedRaw >= 0 ? tenderedRaw : 0;
  const changeDue = Math.max(0, tenderedNumber - total);

  const handleAddItem = (item: (typeof MENU_ITEMS)[0]) => {
    setSelectedItems((prev) => {
      const existing = prev.find((i) => i.item.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.item.id === item.id ? { ...i, quantity: Math.min(MAX_QTY_PER_LINE, i.quantity + 1) } : i
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
  };

  const handleUpdateQty = (itemId: string, delta: number) => {
    setSelectedItems((prev) =>
      prev
        .map((i) => {
          if (i.item.id === itemId) {
            const nextQty = i.quantity + delta;
            if (nextQty <= 0) return null;
            return { ...i, quantity: Math.min(MAX_QTY_PER_LINE, nextQty) };
          }
          return i;
        })
        .filter(Boolean) as Array<{ item: (typeof MENU_ITEMS)[0]; quantity: number; notes?: string }>
    );
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (selectedItems.length === 0) {
      setSubmitError('Add at least one item before placing the order.');
      return;
    }

    const name = customerName.trim();
    if (!name) {
      setSubmitError('Enter a customer name — blank names are not accepted at the counter.');
      return;
    }

    if (!(total > 0)) {
      setSubmitError('Order total must be above ₹0 — add items before placing the order.');
      return;
    }

    // Counter orders used to persist the literal '+91 ' placeholder as the
    // customer phone (dial-fail downstream, unsearchable in CRM). Normalize
    // for ALL order types; store '' when absent, block only delivery.
    const phone = normalizedPhone(customerPhone) || '';
    if (orderType === 'delivery' && !phone) {
      setPhoneError('Enter a valid 10-digit mobile number — the rider needs it.');
      return;
    }
    setPhoneError(null);

    // Tender integrity: a provided cash figure must be a real non-negative
    // number covering the bill — never coerce garbage/negatives via || 0,
    // and never place a short-tender cash order.
    if (paymentMethod === 'cod' && cashTendered.trim() !== '') {
      const tendered = Number(cashTendered);
      if (!Number.isFinite(tendered) || tendered < 0) {
        setSubmitError('Cash received must be a valid non-negative amount.');
        return;
      }
      if (tendered < total) {
        setSubmitError(`Cash received (₹${tendered}) is short of the bill (₹${total}).`);
        return;
      }
    }

    // Outlet integrity: no silent fallback branch — billing without a
    // resolved outlet would attribute revenue to the wrong store.
    const branchId = selectedBranchId || user?.branchIds?.[0];
    if (!branchId) {
      setSubmitError('No outlet selected — pick a branch before billing.');
      return;
    }

    // Dine-in integrity: a table number is required, never defaulted.
    if (orderType === 'dinein' && !tableNumber.trim()) {
      setSubmitError('Enter the table number for dine-in orders.');
      return;
    }

    setIsSubmitting(true);

    const orderId = `ord_pos_${Date.now().toString().slice(-6)}`;

    const orderItems: OrderItem[] = selectedItems.map((i) => ({
      itemId: i.item.id,
      petpoojaItemId: i.item.petpoojaId,
      name: i.item.name,
      quantity: i.quantity,
      price: i.item.price,
      specialInstructions: i.notes,
    }));

    const newOrder: Order = {
      id: orderId,
      customerId: 'cust_walkin',
      customerName: name,
      customerPhone: phone,
      branchId,
      branchName: branchId.includes('surat') ? 'Surat Adajan' : 'Ahmedabad SG Highway',
      city: branchId.includes('surat') ? 'Surat' : 'Ahmedabad',
      items: orderItems,
      subtotal,
      tax,
      deliveryFee: 0,
      total,
      orderType,
      tableNumber: orderType === 'dinein' ? tableNumber.trim() : undefined,
      // Delivery-compatible object form (see orderContract): ALL readers go
      // through normalizeOrderDoc/toPartnerStatus, which map this to
      // 'pending' (pinned by tests/order-contract.test.ts). Never read
      // .status raw off a Firestore doc — always normalize first.
      status: toDeliveryStatusMeta('pending') as unknown as OrderStatus,
      paymentMethod,
      // Honest-until-receipt: a counter order is pending/unsynced/unprinted
      // until the payment, Petpooja sync, and KOT print receipts confirm it.
      // Hardcoding completed/synced/true here inflated revenue and AOV.
      paymentStatus: 'pending',
      petpoojaOrderId: `PP-${orderId}`,
      petpoojaSyncStatus: 'pending',
      kotPrinted: false,
      specialInstructions,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Success-only close: the old code closed + toasted success even when the
    // write failed (offline/denied) — staff lost the whole form believing the
    // order existed. On failure the modal stays open with every field intact.
    setSubmitError(null);
    try {
      const orderRef = doc(db, 'orders', orderId);
      await setDoc(orderRef, newOrder);
    } catch (err: any) {
      setIsSubmitting(false);
      setSubmitError(
        err?.message || 'Order could not be saved (offline or permission denied). Check connection and retry — nothing was lost.'
      );
      return;
    }

    setIsSubmitting(false);
    onOrderCreated?.(newOrder);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#0F0F0F] border border-neutral-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-neutral-900/90 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
              <span>+ New Walk-in Counter Order</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#0E4825] text-emerald-300 font-bold uppercase">
                Instant Billing
              </span>
            </h2>
            <p className="text-xs text-neutral-400">Fast cashier tender & Petpooja KOT generation</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <form onSubmit={handleCreateOrder} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs sm:text-sm">
          {/* Channel Selector */}
          <div>
            <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
              Fulfillment Mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setOrderType('takeaway')}
                className={`py-2 px-3 rounded-xl border font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  orderType === 'takeaway'
                    ? 'bg-emerald-700 text-white border-emerald-500 shadow-xs'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Takeaway</span>
              </button>

              <button
                type="button"
                onClick={() => setOrderType('dinein')}
                className={`py-2 px-3 rounded-xl border font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  orderType === 'dinein'
                    ? 'bg-cyan-700 text-white border-cyan-500 shadow-xs'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <UtensilsCrossed className="w-4 h-4" />
                <span>Dine-In</span>
              </button>

              <button
                type="button"
                onClick={() => setOrderType('delivery')}
                className={`py-2 px-3 rounded-xl border font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  orderType === 'delivery'
                    ? 'bg-orange-600 text-white border-orange-500 shadow-xs'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <Bike className="w-4 h-4" />
                <span>Delivery</span>
              </button>
            </div>
          </div>

          {/* Customer info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-400 mb-1">Customer Name</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-white text-xs font-semibold focus:outline-none focus:border-[#FF6600]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-400 mb-1">
                {orderType === 'dinein' ? 'Table Number' : 'Phone Number'}
              </label>
              {orderType === 'dinein' ? (
                <input
                  type="text"
                  placeholder="e.g. Table 04"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-white text-xs font-semibold focus:outline-none focus:border-[#FF6600]"
                  required
                />
              ) : (
                <>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={customerPhone}
                    onChange={(e) => {
                      setCustomerPhone(e.target.value);
                      if (phoneError) setPhoneError(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-white text-xs font-semibold focus:outline-none focus:border-[#FF6600]"
                    required={orderType === 'delivery'}
                  />
                  {phoneError && (
                    <p role="alert" className="mt-1 text-[11px] font-bold text-rose-400">
                      {phoneError}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Quick Menu Item Picker */}
          <div>
            <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
              Add Items from Menu
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
              {MENU_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleAddItem(item)}
                  className="px-2.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>{item.name}</span>
                  <span className="font-bold text-[#FF6600]">₹{item.price}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Selected items order cart */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3 space-y-2">
            <span className="text-[11px] uppercase font-bold text-neutral-500 block">
              Cart Items ({selectedItems.length})
            </span>
            {selectedItems.map(({ item, quantity }, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 py-1 border-b border-neutral-900">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-white text-xs truncate">{item.name}</p>
                  <p className="text-[11px] text-neutral-400">₹{item.price} each</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateQty(item.id, -1)}
                    className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-white"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="font-mono font-bold text-white text-xs px-1">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => handleUpdateQty(item.id, 1)}
                    className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-white"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Payment Method & Tender Mode */}
          <div>
            <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
              Payment Tender
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('cod')}
                className={`py-2 px-3 rounded-xl border font-bold flex items-center justify-center gap-1.5 ${
                  paymentMethod === 'cod'
                    ? 'bg-emerald-700 text-white border-emerald-500'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
              >
                <Banknote className="w-4 h-4" />
                <span>Cash</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('upi')}
                className={`py-2 px-3 rounded-xl border font-bold flex items-center justify-center gap-1.5 ${
                  paymentMethod === 'upi'
                    ? 'bg-purple-700 text-white border-purple-500'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>UPI QR</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('razorpay')}
                className={`py-2 px-3 rounded-xl border font-bold flex items-center justify-center gap-1.5 ${
                  paymentMethod === 'razorpay'
                    ? 'bg-blue-700 text-white border-blue-500'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Card Machine</span>
              </button>
            </div>
          </div>

          {/* Cash Change Calculator */}
          {paymentMethod === 'cod' && (
            <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between gap-3">
              <div>
                <label className="block text-[11px] font-bold text-neutral-400">Cash Received (₹)</label>
                <input
                  type="number"
                  placeholder={String(total)}
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  className="w-28 px-2 py-1 rounded bg-neutral-900 border border-neutral-700 text-white font-mono text-xs font-bold"
                />
              </div>
              <div className="text-right">
                <span className="text-[11px] font-bold text-neutral-400 block">Change to Return</span>
                <span className="font-mono text-base font-black text-emerald-400">₹{changeDue}</span>
              </div>
            </div>
          )}

          {/* Pricing Math Summary */}
          <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1 text-xs text-neutral-400">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono text-white">₹{subtotal}</span>
            </div>
            <div className="flex justify-between">
              <span>GST (5%)</span>
              <span className="font-mono text-white">₹{tax}</span>
            </div>
            {packagingFee > 0 && (
              <div className="flex justify-between">
                <span>Store Packaging</span>
                <span className="font-mono text-white">₹{packagingFee}</span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 border-t border-neutral-800 text-sm font-black text-white">
              <span>Total Bill</span>
              <span className="font-mono text-[#FF6600]">₹{total}</span>
            </div>
          </div>

          {/* Submit button */}
          {submitError && (
            <div role="alert" className="rounded-xl border border-rose-500/50 bg-rose-950/60 p-3 text-xs font-bold text-rose-200">
              {submitError}
            </div>
          )}
          <button
            type="submit"
            disabled={selectedItems.length === 0 || isSubmitting}
            className="w-full h-12 rounded-xl bg-[#0E4825] hover:bg-[#135d30] text-emerald-300 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>{isSubmitting ? 'Creating Order...' : `Place & Print KOT (₹${total})`}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

export default ManualOrderCreateModal;
