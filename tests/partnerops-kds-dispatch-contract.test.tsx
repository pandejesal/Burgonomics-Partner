/**
 * P1-B (KDS dispatch copy vs effect) + P1-A client side (bumpStatus
 * expectedStatus contract).
 *
 * LIVE: a ready delivery KOT bump emits onBumpOrder(order.id,
 * 'out_for_delivery') and NOTHING in the card flow calls a dispatch API;
 * the copy describes the status change (does NOT promise a booking).
 *
 * P1-A expectedStatus contract: the CLIENT half is executed below at the HTTP
 * boundary (real read path, real vocabulary helpers, real API client, bounded
 * mock fetch). The SERVER half — the backend normalizing the lowercase partner
 * `expectedStatus` through allowedExpectedCodes before the transactional stale
 * compare — is a backend-repo fact and is verified there
 * (functions/tests/orderBump.test.ts). It is deliberately NOT re-implemented
 * or faked in this repo, which cannot import sibling backend source.
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '@/types';

import { KDSOrderCard } from '@/features/kds/components/KDSOrderCard';
import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';
import {
  normalizeOrderDoc,
  toDeliveryStatusMeta,
  toPartnerStatus,
} from '@/utils/orderContract';

// The API client reads Firebase Auth / App Check at call time. What is under
// test is the WIRE BODY, so Auth is stubbed empty and the transport is
// replaced per test — the synthetic env points VITE_FUNCTIONS_API_URL at
// https://functions.invalid/api, so no live host is reachable either way.
vi.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  getAppCheckToken: async () => null,
}));

function flattenText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((child) => flattenText(child)).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return flattenText(node.props.children);
  return '';
}

function findButton(node: ReactNode, text: string): any {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findButton(child, text);
      if (hit) return hit;
    }
    return undefined;
  }
  if (!isValidElement<{ children?: ReactNode; onClick?: () => unknown }>(node)) return undefined;
  if (node.type === 'button' && flattenText(node.props.children).includes(text)) return node;
  return findButton(node.props.children, text);
}

function kdsOrder(over: { id: string; status: string; orderType?: string }): Order {
  return {
    id: over.id,
    customerName: 'Aarav Patel',
    orderType: over.orderType ?? 'delivery',
    status: over.status,
    items: [{ itemId: 'itm_1', name: 'Smoky BBQ Burger', quantity: 1, price: 219 }],
    createdAt: { toDate: () => new Date('2026-10-20T12:00:00Z') },
  } as unknown as Order;
}

function renderCard(props: any): any {
  // Hook-free component: a plain call yields the concrete rendered tree with
  // handler props attached (a JSX element's children are undefined until
  // React renders, which tree traversal cannot expand).
  return (KDSOrderCard as unknown as (props: any) => any)(props);
}

afterEach(() => {
  if ((globalThis as any).__partneropsRealFetch) {
    globalThis.fetch = (globalThis as any).__partneropsRealFetch;
    (globalThis as any).__partneropsRealFetch = undefined;
  }
});

describe('KDSOrderCard — bump routing and copy (committed behavior)', () => {
  it('routes a ready card bump by fulfillment: delivery → out_for_delivery, takeaway → delivered', () => {
    const onBumpDelivery = vi.fn();
    const cardOf = renderCard;

    const deliveryCard = cardOf({
      order: kdsOrder({ id: 'ord_kds_dl', status: 'ready', orderType: 'delivery' }),
      checkedItems: {},
      onToggleItemCheck: vi.fn(),
      onBumpOrder: onBumpDelivery,
    });
    const bumpBtn = findButton(deliveryCard, 'Mark Out for Delivery');
    expect(bumpBtn).toBeTruthy();
    // Status-truthful committed copy of the ready-delivery bump button —
    // describes the status change without promising a courier booking:
    expect(flattenText(bumpBtn.props.children)).toBe('Mark Out for Delivery ✓');
    expect(bumpBtn.props.disabled).toBe(false);
    bumpBtn.props.onClick();
    expect(onBumpDelivery).toHaveBeenCalledTimes(1);
    expect(onBumpDelivery).toHaveBeenCalledWith('ord_kds_dl', 'out_for_delivery');

    const onBumpTakeaway = vi.fn();
    const takeawayCard = cardOf({
      order: kdsOrder({ id: 'ord_kds_tw', status: 'ready', orderType: 'takeaway' }),
      checkedItems: {},
      onToggleItemCheck: vi.fn(),
      onBumpOrder: onBumpTakeaway,
    });
    const takeBtn = findButton(takeawayCard, 'Handover to Customer');
    expect(flattenText(takeBtn.props.children)).toBe('Handover to Customer ✓');
    takeBtn.props.onClick();
    expect(onBumpTakeaway).toHaveBeenCalledTimes(1);
    expect(onBumpTakeaway).toHaveBeenCalledWith('ord_kds_tw', 'delivered');
  });

  it('never calls a dispatch network API from the KDS card flow', () => {
    const onBump = vi.fn();
    const card = renderCard({
      order: kdsOrder({ id: 'ord_kds_dl', status: 'ready', orderType: 'delivery' }),
      checkedItems: {},
      onToggleItemCheck: vi.fn(),
      onBumpOrder: onBump,
    });
    const realFetch = globalThis.fetch;
    (globalThis as any).__partneropsRealFetch = realFetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;

    const bumpBtn = findButton(card, 'Mark Out for Delivery');
    bumpBtn.props.onClick();

    expect(onBump).toHaveBeenCalledTimes(1);
    expect(onBump).toHaveBeenCalledWith('ord_kds_dl', 'out_for_delivery');
    // No Porter/courier dispatch call is fired anywhere in the card flow —
    // dispatch is owned by the DeliveryQueue/porter hook, not this card.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('locks the preparing → ready bump until every item line is checked', () => {
    const unchecked = renderCard({
      order: kdsOrder({ id: 'ord_kds_pr', status: 'preparing', orderType: 'takeaway' }),
      checkedItems: {},
      onToggleItemCheck: vi.fn(),
      onBumpOrder: vi.fn(),
    });
    const gatedBtn = findButton(unchecked, 'Check All Items');
    expect(gatedBtn).toBeTruthy();
    expect(gatedBtn.props.disabled).toBe(true);
    expect(gatedBtn.props.title).toBe('Check every item line before marking ready');

    const onBumpCleared = vi.fn();
    const cleared = renderCard({
      order: kdsOrder({ id: 'ord_kds_pr', status: 'preparing', orderType: 'takeaway' }),
      checkedItems: { 'ord_kds_pr::0': true },
      onToggleItemCheck: vi.fn(),
      onBumpOrder: onBumpCleared,
    });
    const readyBtn = findButton(cleared, 'Mark Food Ready');
    expect(readyBtn).toBeTruthy();
    expect(readyBtn.props.disabled).toBe(false);
    readyBtn.props.onClick();
    expect(onBumpCleared).toHaveBeenCalledTimes(1);
    expect(onBumpCleared).toHaveBeenCalledWith('ord_kds_pr', 'ready');
  });
});

describe('KDSOrderCard — copy/effect honesty (copy describes the status change)', () => {
  // FIXED: the ready-delivery bump copy now describes the status update
  // ('Mark Out for Delivery ✓', KDSOrderCard.tsx:272) and does NOT promise a
  // courier booking — no dispatch API exists anywhere in the card flow and
  // the copy no longer implies one.
  it('never implies a booking: ready-delivery copy says Mark Out for Delivery, no fetch', () => {
    const onBump = vi.fn();
    const card = renderCard({
      order: kdsOrder({ id: 'ord_kds_dl', status: 'ready', orderType: 'delivery' }),
      checkedItems: {},
      onToggleItemCheck: vi.fn(),
      onBumpOrder: onBump,
    });
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;
    try {
      const bumpBtn = findButton(card, 'Mark Out for Delivery');
      // Status-truthful copy — confirmed verbatim:
      expect(flattenText(bumpBtn.props.children)).toBe('Mark Out for Delivery ✓');
      // Copy must not promise a dispatch or rider:
      expect(flattenText(bumpBtn.props.children)).not.toMatch(/[Dd]ispatch|[Rr]ider/);
      bumpBtn.props.onClick();
      // No booking machinery exists in the card flow — and none is promised:
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(onBump).toHaveBeenCalledWith('ord_kds_dl', 'out_for_delivery');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

/**
 * P1-A client-wire semantic contract — the `expectedStatus` vocabulary.
 *
 * WHAT IS EXECUTED AND PROVEN HERE (Partner repo):
 *  1. The client's real read path (normalizeOrderDoc) turns every Delivery
 *     status code the server may store into the LOWERCASE Partner token the
 *     screens hand to the API — PLACED→pending, CONFIRMED→accepted,
 *     PREPARING→preparing, READY_FOR_PICKUP→ready, READY_TO_SERVE→ready,
 *     OUT_FOR_DELIVERY→out_for_delivery, DELIVERED/PICKED_UP/COMPLETED→
 *     delivered, CANCELLED→cancelled.
 *  2. That token names the SAME visible state the client's own write path
 *     produces (toDeliveryStatusMeta → toPartnerStatus), so a precondition
 *     computed from a read compares like-with-like against the stored doc.
 *  3. The real HTTP client (partnerFunctionsApi.bumpOrderStatus) puts that
 *     token — never the raw uppercase Delivery code — on the
 *     POST /orders/bumpStatus wire, and an unknown stored state fails closed
 *     to 'quarantine' instead of a precondition that would silently pass.
 *
 * WHAT IS *NOT* PROVEN HERE, AND WHERE IT IS PROVEN INSTEAD:
 *  That the BACKEND accepts the lowercase token against the stored uppercase
 *  code. The backend normalizes `expectedStatus` through allowedExpectedCodes
 *  (functions/src/modules/orders/orderStatus.ts:53-89, and the transactional
 *  compare at :283-293) BEFORE the stale check, and pins that behaviour in
 *  functions/tests/orderBump.test.ts — the G1 normalization pins: Partner
 *  vocabulary accepted against a Delivery-code state, the dinein
 *  READY_TO_SERVE fork, takeaway PICKED_UP, case-insensitive spellings, and
 *  stale rejection.
 *
 *  The Partner CI runs in a separate GitHub repository and CANNOT import
 *  sibling backend source, so that half is referenced as separate server
 *  verification. It is deliberately NOT re-implemented here as a hand-coded
 *  replica of the server normalizer passed off as server proof.
 *
 *  The previously skipped case asserted `toDeliveryStatusMeta('pending').code
 *  === toPartnerStatus(meta)` — i.e. that the Delivery UPPERCASE code and the
 *  Partner lowercase token are the same STRING. They are deliberately two
 *  different vocabularies, so that expectation could never hold: it was an
 *  invalid assertion, not a missing behavior (RED capture:
 *  followups/kds-contract/01-red-raw-equality-failure.txt).
 */
describe('P1-A client-wire contract — expectedStatus vocabulary (executed)', () => {
  /** One order doc in the shape the customer app / server writes. */
  function deliveryDoc(statusCode: string, over: Record<string, any> = {}) {
    return {
      store: { id: 'store_burgo_surat_01', name: 'Burgo Surat' },
      status: { code: statusCode, label: 'Order placed', kind: 'upcoming', terminal: false },
      totals: { grandTotal: 219 },
      items: [{ itemId: 'itm_1', name: 'Smoky BBQ Burger', quantity: 1, price: 219 }],
      fulfillment: 'delivery',
      placedAt: new Date('2026-10-20T12:00:00Z'),
      ...over,
    };
  }

  /** Stored Delivery code → the Partner token the client sends on the wire. */
  const DELIVERY_CODE_CASES: ReadonlyArray<{ code: string; token: string }> = [
    { code: 'PLACED', token: 'pending' },
    { code: 'CONFIRMED', token: 'accepted' },
    { code: 'PREPARING', token: 'preparing' },
    { code: 'READY_FOR_PICKUP', token: 'ready' },
    { code: 'READY_TO_SERVE', token: 'ready' },
    { code: 'OUT_FOR_DELIVERY', token: 'out_for_delivery' },
    { code: 'DELIVERED', token: 'delivered' },
    { code: 'PICKED_UP', token: 'delivered' },
    { code: 'COMPLETED', token: 'delivered' },
    { code: 'CANCELLED', token: 'cancelled' },
  ];

  it.each(DELIVERY_CODE_CASES)(
    'resolves the stored Delivery code $code into the lowercase partner token $token',
    ({ code, token }) => {
      const order = normalizeOrderDoc('ord_contract_1', deliveryDoc(code));

      // The client's real read path lands on the Partner vocabulary.
      expect(order.status).toBe(token);
      // The token is lowercase Partner vocabulary, NEVER the raw uppercase
      // Delivery code: the two vocabularies are deliberately different, so
      // raw equality between them was never a contract to assert.
      expect(order.status).not.toBe(code);
      expect(order.status).toBe(order.status.toLowerCase());
      // The client's own write path for that state resolves back to the SAME
      // visible state — read and write vocabularies agree, so a precondition
      // computed from a read names the state the doc is actually in.
      const written = toDeliveryStatusMeta(order.status);
      expect(written.code).toMatch(/^[A-Z][A-Z_]*$/);
      expect(toPartnerStatus(written)).toBe(token);
    },
  );

  it('fails closed to quarantine for an unknown stored status instead of a precondition that would silently pass', () => {
    const order = normalizeOrderDoc('ord_contract_bad', deliveryDoc('SOME_FUTURE_STATE'));

    // Never 'pending': a corrupt/unknown state must not read as a fresh order,
    // and the precondition must never name a state the doc is not in.
    expect(order.status).toBe('quarantine');
    expect(order.status).not.toBe('pending');
    expect(order.quarantineReason).toContain('SOME_FUTURE_STATE');
  });
});

describe('P1-A client-wire contract — the POST /orders/bumpStatus wire body', () => {
  const guardedFetch = globalThis.fetch;
  let requestedUrl = '';
  let requestedBody: Record<string, any> | undefined;

  beforeEach(() => {
    requestedUrl = '';
    requestedBody = undefined;
    globalThis.fetch = (async (url: any, init: any) => {
      requestedUrl = String(url);
      requestedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({ orderId: 'ord_contract_1', status: { code: 'OUT_FOR_DELIVERY' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = guardedFetch;
  });

  it('sends the partner token resolved from the stored Delivery code, never the uppercase code', async () => {
    const order = normalizeOrderDoc('ord_contract_1', {
      store: { id: 'store_burgo_surat_01', name: 'Burgo Surat' },
      status: { code: 'READY_FOR_PICKUP', label: 'Ready for pickup', kind: 'in_progress', terminal: false },
      totals: { grandTotal: 219 },
      items: [{ itemId: 'itm_1', name: 'Smoky BBQ Burger', quantity: 1, price: 219 }],
      fulfillment: 'delivery',
      placedAt: new Date('2026-10-20T12:00:00Z'),
    });

    await partnerFunctionsApi.bumpOrderStatus({
      orderId: order.id,
      status: 'out_for_delivery',
      // Exactly what the screens transmit (OrderDetailPage.tsx:244-246,
      // useOrder.ts:72-78, useKDSRealtimeStream.ts:864-870):
      expectedStatus: order.status,
    });

    // Hermetic destination — the synthetic env, never a live host.
    expect(requestedUrl).toBe('https://functions.invalid/api/orders/bumpStatus');
    expect(requestedBody).toMatchObject({
      orderId: 'ord_contract_1',
      status: 'out_for_delivery',
      expectedStatus: 'ready',
    });
    // The precondition is the Partner vocabulary, not the stored uppercase
    // Delivery code (the raw-equality claim was the invalid assertion).
    expect(requestedBody?.expectedStatus).not.toBe('READY_FOR_PICKUP');
  });
});
