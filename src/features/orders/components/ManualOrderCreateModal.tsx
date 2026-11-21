import React, { useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { useBranches } from '@/hooks/useBranches';
import { useStrictWalkInMenu, type WalkInIneligibilityReason } from '@/hooks/useMenu';
import { resolveWalkInBranchName } from '@/utils/walkInBranch';
import { useWalkInQuote } from '@/features/orders/hooks/useWalkInQuote';
import { ApiRequestError, partnerFunctionsApi, type WalkInReceipt } from '@/services/partnerFunctionsApi';

interface ManualOrderCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated?: (receipt: WalkInReceipt) => void;
}

const reasons: Record<WalkInIneligibilityReason, string> = {
  branch_mismatch: 'Unavailable at this branch', out_of_stock: 'Out of stock',
  invalid_price: 'Price unavailable', price_unavailable: 'Price unavailable',
  invalid_name: 'Item details unavailable', configurable_unsupported: 'Customizable items are unavailable',
};

function newRequestId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ManualOrderCreateModal({ isOpen, onClose, onOrderCreated }: ManualOrderCreateModalProps) {
  const { user } = useAuthStore();
  const { selectedBranchId } = useAppStore();
  const branchId = selectedBranchId || user?.branchIds?.[0];
  const menu = useStrictWalkInMenu(branchId);
  const { branches } = useBranches();
  // The outlet this sale is booked to. Read from the branch registry, never
  // guessed from the id: the old modal derived the name from a two-value
  // ternary, which filed 15 of 17 outlets' counter revenue under the wrong
  // store. The server stamps the same name on the order; this is only the
  // pre-submit confirmation for the cashier.
  const branchName = resolveWalkInBranchName(branches, branchId);
  const [orderType, setOrderType] = useState<'takeaway' | 'dinein'>('takeaway');
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState<Array<{ productId: string; quantity: number }>>([]);
  const [cash, setCash] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [priceChange, setPriceChange] = useState<{ fingerprint: string; paise: number; total: number } | null>(null);
  const identity = useRef<{ fingerprint: string; id: string } | null>(null);

  // F4: the bill shown here is the SERVER's bill. The modal used to compute
  // food + an inline GST + a separately fetched packaging fee, and HL Road's
  // ₹15 packaging went missing from the preview while the booking charged it.
  // One pricing builder on the server now feeds both the preview and the
  // booking, so what the cashier reads is what the customer is charged.
  const quoteState = useWalkInQuote({
    branchId,
    orderType,
    items: cart,
    enabled: isOpen && !!branchId && cart.length > 0,
  });
  const totals = quoteState.quote?.totals ?? null;
  // While the cart is empty there is nothing to price; once it has items the
  // total is unknown until the server answers.
  const quotePending = cart.length > 0 && totals === null;

  if (!isOpen) return null;
  const selected = cart.map(line => ({ ...line, item: menu.eligibleItems.find(item => item.id === line.productId) }));
  const validCart = selected.length > 0 && selected.every(line => line.item && line.quantity <= 99);
  const payload = {
    branchId: branchId ?? '', orderType, items: cart,
    ...(orderType === 'dinein' && tableNumber.trim() ? { tableNumber: tableNumber.trim() } : {}),
    ...(notes.trim() ? { notes: notes.trim() } : {}),
    ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
    ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
  };
  // The fingerprint is the CART, not the price. Request identity across retries
  // is the basket and its details; the confirmed total is a price check, not a
  // second identity (F5). Including it here rotated the request id on every
  // PRICE_CHANGED retry, so a lost response could book the same cart twice.
  const fingerprint = JSON.stringify(payload);
  const confirmedPrice = priceChange?.fingerprint === fingerprint ? priceChange : null;
  const expectedTotalPaise = confirmedPrice?.paise ?? totals?.split.totalAmountPaise ?? null;
  const payable = expectedTotalPaise === null ? null : expectedTotalPaise / 100;

  function add(productId: string) {
    setPriceChange(null);
    setCart(previous => previous.some(line => line.productId === productId)
      ? previous.map(line => line.productId === productId ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line)
      : [...previous, { productId, quantity: 1 }]);
  }
  function remove(productId: string) {
    setPriceChange(null);
    setCart(previous => previous.flatMap(line => line.productId !== productId ? [line] : line.quantity > 1 ? [{ ...line, quantity: line.quantity - 1 }] : []));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || !branchId || !validCart || expectedTotalPaise === null) return;
    // The retry after PRICE_CHANGED is the SAME order: the cashier has not
    // changed the basket, only confirmed the server's corrected total. A fresh
    // request id per confirmation is exactly what made staging's replay
    // unrecoverable (F5), so the id is keyed on the cart + details only.
    const requestFingerprint = JSON.stringify(payload);
    if (identity.current?.fingerprint !== requestFingerprint) identity.current = { fingerprint: requestFingerprint, id: newRequestId() };
    const requestId = identity.current.id;
    setSubmitting(true); setError(null);
    try {
      const receipt = await partnerFunctionsApi.createWalkInOrder({ ...payload, branchId, expectedTotalPaise, requestId });
      identity.current = null; setPriceChange(null); setCart([]);
      onOrderCreated?.(receipt); onClose();
    } catch (err: unknown) {
      if (err instanceof ApiRequestError && (err.code === 'PRICE_CHANGED' || err.code === 'IDEMPOTENCY_CONFLICT')) {
        if (err.code === 'PRICE_CHANGED' && err.totals && Number.isSafeInteger(err.totals.split?.totalAmountPaise)) {
          setPriceChange({ fingerprint, paise: err.totals.split.totalAmountPaise, total: err.totals.grandTotal });
        } else setPriceChange(null);
        // A price refusal is a NEW confirmation of the same order, so the id is
        // kept: rotating it would orphan the order the server may have booked.
      }
      setError(err instanceof Error ? err.message : 'Order could not be created. Please retry.');
    } finally { setSubmitting(false); }
  }

  return <div
    className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 flex items-center justify-center"
    style={{
      // Fixed overlays sit outside #root's bottom inset (index.css:111), so the
      // panel must clear the status bar and gesture area itself. max() keeps the
      // 1rem floor WITHOUT stacking it on top of the device inset (no doubling).
      paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
      paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
    }}
  >
    <div className="bg-neutral-950 text-white border border-neutral-700 rounded-2xl w-full max-w-2xl max-h-full overflow-y-auto p-5">
      <div className="flex justify-between items-center"><h2 className="text-lg font-bold">New walk-in order</h2><button type="button" onClick={onClose} aria-label="Close">Close</button></div>
      <p className="text-sm text-neutral-300">Cash tender · Payment pending</p>
      <p className="text-sm text-neutral-400" data-testid="walk-in-branch">
        Booking to: <strong>{branchName ?? branchId ?? 'no branch selected'}</strong>
      </p>
      <form onSubmit={submit} className="space-y-4 mt-4">
        <fieldset><legend>Fulfillment mode</legend><div className="flex gap-2">
          <button type="button" aria-pressed={orderType === 'takeaway'} onClick={() => setOrderType('takeaway')}>Takeaway</button>
          <button type="button" aria-pressed={orderType === 'dinein'} onClick={() => setOrderType('dinein')}>Dine-In</button>
        </div></fieldset>
        <label className="block">Customer name <input className="block bg-neutral-800 p-2" value={customerName} onChange={e => setCustomerName(e.target.value)} maxLength={200} /></label>
        <label className="block">Phone number (optional) <input className="block bg-neutral-800 p-2" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} maxLength={32} /></label>
        {orderType === 'dinein' && <label className="block">Table number <input className="block bg-neutral-800 p-2" value={tableNumber} onChange={e => setTableNumber(e.target.value)} maxLength={64} /></label>}
        <label className="block">Notes (optional) <textarea className="block bg-neutral-800 p-2" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} /></label>
        <section><h3 className="font-bold">Add items from menu</h3>
          {menu.isLoading && <p>Loading menu…</p>}{menu.error && <p role="alert">Menu could not be loaded: {menu.error.message}</p>}
          {!menu.isLoading && !menu.error && menu.allItems.length === 0 && <p>No menu items available.</p>}
          <div className="flex flex-wrap gap-2">{menu.eligibleItems.map(item => <button className="bg-neutral-800 rounded p-2" type="button" key={item.id} onClick={() => add(item.id)}>{item.name} ₹{item.price}</button>)}
            {menu.ineligibleItems.map(item => <button className="bg-neutral-800 rounded p-2 opacity-60" type="button" key={item.id} disabled>{item.name} — {reasons[item.reason]}</button>)}</div>
        </section>
        <section><h3 className="font-bold">Cart items ({cart.length})</h3>{selected.map(line => <div key={line.productId} className="flex gap-3 items-center"><span>{line.item?.name ?? 'Item unavailable'} × {line.quantity}</span><button type="button" onClick={() => remove(line.productId)} aria-label={`Remove one ${line.item?.name ?? 'item'}`}>−</button><button type="button" onClick={() => add(line.productId)} aria-label={`Add one ${line.item?.name ?? 'item'}`}>+</button></div>)}{!validCart && cart.length > 0 && <p role="alert">A cart item is unavailable; remove it before creating the order.</p>}</section>
        <section><h3>Cash tender</h3><label>Change calculator (not recorded) <input type="number" min="0" className="bg-neutral-800 p-2" value={cash} onChange={e => setCash(e.target.value)} /></label><p>Change: ₹{payable === null ? '—' : Math.max(0, (Number(cash) || 0) - payable).toFixed(2)}</p></section>
        <section>
          {cart.length === 0 ? <p>Add items to see the server's bill.</p> : quoteState.isLoading ? <p role="status">Bill: pricing on the server…</p> : quoteState.error ? <div role="alert"><p>{quoteState.error}</p><button type="button" onClick={quoteState.retry}>Retry bill</button></div> : totals ? (
            <>
              <p>Subtotal ₹{totals.foodSubtotal}</p>
              <p>GST (5%, included) ₹{totals.gst.toFixed(2)}</p>
              <p>Store Packaging ₹{totals.packagingFee}</p>
              <p>Total ₹{totals.grandTotal}</p>
            </>
          ) : <p>Bill unavailable; retry before creating the order.</p>}
        </section>
        {error && <p role="alert">{error}</p>}
        {confirmedPrice && <p role="alert">Server total is ₹{confirmedPrice.total}. Review and submit again to confirm this price.</p>}
        {!branchId && <p role="alert">Select a branch before creating an order.</p>}
        <button type="submit" className="bg-emerald-800 rounded p-3 disabled:opacity-50" disabled={!branchId || !validCart || submitting || quotePending || quoteState.isLoading || expectedTotalPaise === null}>{submitting ? 'Creating order…' : confirmedPrice ? `Confirm ₹${payable} and create order` : `Create order — payment pending (${payable === null ? '—' : `₹${payable}`})`}</button>
      </form>
    </div>
  </div>;
}

export default ManualOrderCreateModal;
