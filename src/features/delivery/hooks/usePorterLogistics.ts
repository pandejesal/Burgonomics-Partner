import { useState, useMemo, useCallback } from 'react';
import { useOrders } from '@/hooks/useOrders';
import { useBranches } from '@/hooks/useBranches';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { manualBranchDispatch } from '@/services/porterDelivery';
import {
  dispatchProviderLabel as providerLabel,
  partnerFunctionsApi,
  type DispatchBookResult,
  type DispatchFareConfirm,
  type DispatchManualLane,
  type DispatchQuoteResult,
} from '@/services/partnerFunctionsApi';
import { toast } from 'sonner';
import { logger } from '@/core/logging/logger';
import type { Order } from '@/types';

export interface InHouseRiderInfo {
  name: string;
  phone: string;
  vehicleNumber?: string;
}

export function usePorterLogistics() {
  const { selectedBranchId } = useAppStore();
  const { orders = [], isLoading, updateOrderStatus } = useOrders();
  const { branches = [] } = useBranches();
  const staffName = useAuthStore((s) => s.user?.name || s.user?.email) || 'Branch Staff';

  const [quotes, setQuotes] = useState<Record<string, DispatchQuoteResult>>({});
  const [loadingQuotes, setLoadingQuotes] = useState<Record<string, boolean>>({});
  const [dispatchingOrderIds, setDispatchingOrderIds] = useState<Record<string, boolean>>({});
  const [rebookingOrderIds, setRebookingOrderIds] = useState<Record<string, boolean>>({});
  // DR7: the server refused to book because the fare drifted past the
  // threshold — stored here so the card can ask staff to confirm the NEW fare.
  const [fareConfirms, setFareConfirms] = useState<Record<string, DispatchFareConfirm>>({});
  // DR8: Porter has no API key — staff books in the Porter app and pastes
  // the order id back through the manual lane.
  const [manualLanes, setManualLanes] = useState<Record<string, DispatchManualLane>>({});
  const [pastingOrderIds, setPastingOrderIds] = useState<Record<string, boolean>>({});

  // Filter only active delivery orders for branch. Fail-closed like the
  // KDS makeline: unroutable orders (no branchId) never render anywhere.
  const activeDeliveryOrders = useMemo(() => {
    return orders.filter((o) => {
      if (selectedBranchId && o.branchId !== selectedBranchId) {
        return false;
      }
      const fulfillment = (o as any).fulfillment || o.orderType;
      if (fulfillment !== 'delivery') return false;

      const status = (o.status || '').toLowerCase();
      return (
        status === 'ready' ||
        status === 'preparing' ||
        status === 'out_for_delivery' ||
        status === 'pending' ||
        status === 'placed' ||
        status === 'accepted'
      );
    });
  }, [orders, selectedBranchId]);

  // Multi-provider quote (POST /dispatch/quote): pickup comes from the
  // branch record's real coordinates (never fabricated defaults); a missing
  // pin on either end throws client-side and lands in the "quote
  // unavailable" path below. serviceable:false (out of zone) is a cached
  // answer for 60s — it has no expiresAt.
  const fetchOrderQuote = useCallback(async (order: Order) => {
    const cached = quotes[order.id];
    const now = Date.now();
    const fresh =
      cached &&
      ((cached.serviceable !== false && !!cached.expiresAt && cached.expiresAt > now) ||
        (cached.serviceable === false && (cached.quotedAt || 0) + 60_000 > now));
    if (fresh || loadingQuotes[order.id]) return;

    setLoadingQuotes((prev) => ({ ...prev, [order.id]: true }));
    try {
      const branchId = (order as any).branchId || selectedBranchId;
      const branch = branches.find((b) => b.id === branchId);
      const coords = [
        branch?.coordinates?.lat,
        branch?.coordinates?.lng,
        order.deliveryAddress?.lat,
        order.deliveryAddress?.lng,
      ];
      if (!coords.every((c) => typeof c === 'number' && Number.isFinite(c))) {
        throw new Error('Quote needs real pickup and drop coordinates — refusing to estimate from defaults.');
      }
      const q = await partnerFunctionsApi.dispatchQuote({
        pickupLat: coords[0] as number,
        pickupLng: coords[1] as number,
        dropLat: coords[2] as number,
        dropLng: coords[3] as number,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        orderId: order.id,
      });
      setQuotes((prev) => ({ ...prev, [order.id]: q }));
    } catch (err: any) {
      // Redacted id (full ids link logs to customer PII) + message only.
      logger.warn(`[PorterLogistics] Quote unavailable for order …${order.id.slice(-6)}`, {
        message: err?.message,
      });
    } finally {
      setLoadingQuotes((prev) => ({ ...prev, [order.id]: false }));
    }
  }, [quotes, loadingQuotes, branches, selectedBranchId]);

  // Shared /dispatch/book|rebook result routing: exactly one of —
  // 202 in-progress, fare-confirm gate, manual lane, or a real booking.
  // Status flips ONLY after the server confirms a booking (Loop 16/120).
  const applyDispatchResult = useCallback(
    async (orderId: string, res: DispatchBookResult): Promise<void> => {
      const shortCode = `#${orderId.slice(-6).toUpperCase()}`;

      // 202 in-flight body — the first tap's claim is still settling.
      if (res.error && typeof res.retryAfterMs === 'number') {
        toast.info('Dispatch already in progress — no second rider was booked.', {
          description: res.error,
        });
        return;
      }

      if (res.needsFareConfirm && typeof res.newFare === 'number') {
        setFareConfirms((prev) => ({
          ...prev,
          [orderId]: {
            provider: res.provider || 'porter',
            quotedFare: res.quotedFare ?? 0,
            newFare: res.newFare as number,
            delta: res.delta ?? 0,
            threshold: res.threshold ?? 0,
            message: res.message,
          },
        }));
        toast.warning(`Fare changed to ₹${res.newFare} — confirm to book.`, {
          description: res.message,
        });
        return;
      }

      if (res.manual_action_required) {
        setManualLanes((prev) => ({
          ...prev,
          [orderId]: {
            instructions:
              res.instructions ||
              'Book this order in the Porter app, then paste the Porter order id below.',
            pasteEndpoint: res.pasteEndpoint,
          },
        }));
        toast.info('Porter booking needed — book in the Porter app, then paste the details.', {
          description: res.instructions,
        });
        return;
      }

      // Booked (fresh booking or idempotent reuse of the stored summary).
      if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
        await updateOrderStatus.mutateAsync({ orderId, status: 'out_for_delivery' });
      }
      setFareConfirms((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      setManualLanes((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });

      const label = providerLabel(res.provider);
      const bookedWho = res.riderName ? `${label} courier booked: ${res.riderName}` : `${label} dispatch active`;
      const failoverNote = res.failover
        ? ` — failed over from ${providerLabel(res.failover.from)} (cheapest was ${providerLabel(res.failover.cheapestProvider)})`
        : '';
      toast.success(bookedWho, {
        description: `${shortCode} · ${res.providerOrderId || ''}${res.reused ? ' · existing booking reused' : ''}${failoverNote}`,
      });
    },
    [updateOrderStatus],
  );

  // Dispatch the cheapest serviceable provider (POST /dispatch/book).
  // The card's confirm dialog already showed the quoted fare, so it is
  // passed as quotedFare — the server runs the DR7 delta check against it
  // and may come back with needsFareConfirm instead of a booking.
  const dispatchPorter = useCallback(
    async (order: Order) => {
      setDispatchingOrderIds((prev) => ({ ...prev, [order.id]: true }));
      try {
        const q = quotes[order.id];
        const quotedFare =
          q && q.serviceable !== false && typeof q.estimatedFare === 'number'
            ? q.estimatedFare
            : undefined;
        const res = await partnerFunctionsApi.dispatchBook({
          orderId: order.id,
          staffName,
          quotedFare,
        });
        await applyDispatchResult(order.id, res);
      } catch (err) {
        toast.error('Dispatch failed — no courier booked.', {
          description: err instanceof Error ? err.message : 'Could not reach the dispatcher.',
        });
      } finally {
        setDispatchingOrderIds((prev) => ({ ...prev, [order.id]: false }));
      }
    },
    [quotes, staffName, applyDispatchResult],
  );

  // DR7 confirm: re-book at the NEW fare the staff just approved. The
  // pending gate is cleared first so a second drift can set it again.
  const confirmFareDispatch = useCallback(
    async (order: Order) => {
      const pending = fareConfirms[order.id];
      setFareConfirms((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
      setDispatchingOrderIds((prev) => ({ ...prev, [order.id]: true }));
      try {
        const res = await partnerFunctionsApi.dispatchBook({
          orderId: order.id,
          staffName,
          quotedFare: pending?.newFare,
          confirmFare: true,
        });
        await applyDispatchResult(order.id, res);
      } catch (err) {
        toast.error('Booking failed at the confirmed fare.', {
          description: err instanceof Error ? err.message : 'Could not reach the dispatcher.',
        });
      } finally {
        setDispatchingOrderIds((prev) => ({ ...prev, [order.id]: false }));
      }
    },
    [fareConfirms, staffName, applyDispatchResult],
  );

  // Staff declined the fare change — drop the gate; a fresh dispatch
  // re-quotes and re-runs the DR7 check from scratch.
  const dismissFareConfirm = useCallback((orderId: string) => {
    setFareConfirms((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  }, []);

  // DR8 manual lane: persist the Porter-app booking staff made outside the
  // API. Server validates the id + tracking URL and binds both order maps.
  const savePorterManual = useCallback(
    async (orderId: string, porterOrderId: string, trackingUrl?: string) => {
      const pid = porterOrderId.trim();
      if (!pid) {
        toast.error('Porter order id is required.');
        return;
      }
      setPastingOrderIds((prev) => ({ ...prev, [orderId]: true }));
      try {
        const res = await partnerFunctionsApi.savePorterManualBooking({
          orderId,
          porterOrderId: pid,
          trackingUrl: trackingUrl?.trim() || undefined,
          staffName,
        });
        setManualLanes((prev) => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
        if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
          await updateOrderStatus.mutateAsync({ orderId, status: 'out_for_delivery' });
        }
        toast.success(`Porter booking saved: ${res.porterOrderId}`, {
          description: `Order #${orderId.slice(-6).toUpperCase()} now tracked via Porter${
            res.reused ? ' · already saved' : ''
          }`,
        });
      } catch (err) {
        toast.error('Failed to save Porter booking', {
          description: err instanceof Error ? err.message : 'Could not reach the dispatcher.',
        });
      } finally {
        setPastingOrderIds((prev) => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      }
    },
    [staffName, updateOrderStatus],
  );

  // Assign In-House Rider. Persists rider identity server-side via
  // POST /orders/manualDispatch (riderName/Phone, dispatched status) instead
  // of a bare status flip that loses who is carrying the order. Guarded
  // against double-assignment over a live courier booking.
  const assignInHouseRider = useCallback(async (orderId: string, rider: InHouseRiderInfo) => {
    const existing = orders.find((o) => o.id === orderId) as any;
    const deliveryStatus = existing?.deliveryStatus as string | undefined;
    if (
      existing?.riderName ||
      deliveryStatus === 'dispatched' ||
      deliveryStatus === 'driver_allocated' ||
      deliveryStatus === 'in_transit'
    ) {
      toast.error('A courier is already assigned — refresh before re-assigning.');
      return;
    }
    try {
      await manualBranchDispatch({
        orderId,
        riderName: rider.name,
        riderPhone: rider.phone,
        staffName,
      });
      if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
        await updateOrderStatus.mutateAsync({
          orderId,
          status: 'out_for_delivery',
        });
      }
      toast.success(`Assigned in-house rider ${rider.name} to order #${orderId.slice(-6).toUpperCase()}`);
    } catch (err) {
      logger.warn('dispatch.inhouse_failed', {
        orderId,
        message: err instanceof Error ? err.message : String(err),
      });
      toast.error('Failed to assign in-house rider');
    }
  }, [orders, updateOrderStatus, staffName]);

  // Cancel the active dispatch (POST /dispatch/cancel): Porter bookings go
  // through the Porter cancel flow, Borzo/Shadowfax release locally with a
  // dashboard-cancel reminder. Status flips only after the server confirms.
  const cancelPorter = useCallback(
    async (orderId: string) => {
      try {
        const res = await partnerFunctionsApi.dispatchCancel({ orderId, staffName });
        if (updateOrderStatus && typeof updateOrderStatus.mutateAsync === 'function') {
          await updateOrderStatus.mutateAsync({
            orderId,
            status: 'ready',
          });
        }
        setManualLanes((prev) => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
        toast.success(
          `${providerLabel(res.provider)} booking cancelled for order #${orderId.slice(-6).toUpperCase()}`,
          { description: res.message },
        );
      } catch (err) {
        toast.error('Failed to cancel courier booking', {
          description: err instanceof Error ? err.message : 'Could not reach the dispatcher.',
        });
      }
    },
    [updateOrderStatus, staffName],
  );

  // Rebook (delivery_porter.md §4) — POST /dispatch/rebook re-enters the
  // cheapest-wins walk for an order whose previous driver cancelled or was
  // never found. Stale taps surface the server's NOT_REBOOKABLE refusal
  // instead of faking a booking. Same result routing as dispatchPorter
  // (booking / fare confirm / manual lane).
  const rebookPorter = useCallback(
    async (order: Order) => {
      setRebookingOrderIds((prev) => ({ ...prev, [order.id]: true }));
      try {
        const res = await partnerFunctionsApi.dispatchRebook({
          orderId: order.id,
          staffName,
        });
        await applyDispatchResult(order.id, res);
      } catch (err) {
        toast.error('Rebook failed — no new courier dispatched.', {
          description: err instanceof Error ? err.message : 'Could not reach the dispatcher.',
        });
      } finally {
        setRebookingOrderIds((prev) => {
          const next = { ...prev };
          delete next[order.id];
          return next;
        });
      }
    },
    [staffName, applyDispatchResult],
  );

  return {
    deliveryOrders: activeDeliveryOrders,
    isLoading,
    quotes,
    loadingQuotes,
    dispatchingOrderIds,
    rebookingOrderIds,
    fareConfirms,
    manualLanes,
    pastingOrderIds,
    fetchOrderQuote,
    dispatchPorter,
    confirmFareDispatch,
    dismissFareConfirm,
    savePorterManual,
    assignInHouseRider,
    cancelPorter,
    rebookPorter,
  };
}

export default usePorterLogistics;
