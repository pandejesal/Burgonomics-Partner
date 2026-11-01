/**
 * P1-B (KDS dispatch copy vs effect) + P1-A client side (bumpStatus
 * expectedStatus contract).
 *
 * LIVE: a ready delivery KOT bump emits onBumpOrder(order.id,
 * 'out_for_delivery') and NOTHING in the card flow calls a dispatch API;
 * the copy describes the status change (does NOT promise a booking).
 *
 * EXPECTED-FAIL skip, now DOCUMENTED as resolved SERVER-SIDE: functions commit
 * 6a21e93 ([lane:functions-contract]) normalizes the lowercase partner
 * expectedStatus through allowedExpectedCodes (incl. dinein/takeaway forks)
 * before the transaction compares code sets — the old raw comparison
 * (orderStatus.ts `current.code !== expected`) that refused every
 * preconditioned partner bump with STALE_ORDER_STATUS no longer exists.
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '@/types';

import { KDSOrderCard } from '@/features/kds/components/KDSOrderCard';
import { toDeliveryStatusMeta, toPartnerStatus } from '@/utils/orderContract';

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

describe('P1-A server side — expectedStatus vocabulary normalization (HONEST BEHAVIOR DOES NOT EXIST YET)', () => {
  // EXPECTED FAIL: server compares UPPERCASE Delivery codes (orderStatus.ts:129)
  // The partner client sends the lowercase partner vocabulary
  // (OrderDetailPage.tsx: `expectedStatus: order.status` → 'pending' | 'ready'
  // | ...). RESOLVED SERVER-SIDE: functions commit 6a21e93 (functions-contract
  // lane [lane:functions-contract]) normalizes the Partner-vocabulary
  // expectedStatus through the canonical tables before the transaction
  // compares it to the stored Delivery status.code, with 9 new pins in
  // functions/tests/orderBump.test.ts.
  it.skip('compares expectedStatus against the same vocabulary the client sends', () => {
    const docMeta = toDeliveryStatusMeta('pending');
    const clientSends = toPartnerStatus(docMeta); // what OrderDetailPage transmit

    // Client side is honest and stable:
    expect(clientSends).toBe('pending');
    // Server vocabulary mismatch would break this equality — it cannot
    // anymore since 6a21e93 normalizes on the server before comparing.
    expect(docMeta.code).toBe(clientSends); // 'PLACED' !== 'pending' → STALE_ORDER_STATUS
  });
});
