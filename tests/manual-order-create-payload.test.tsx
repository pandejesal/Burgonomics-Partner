import React, { act } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Manual walk-in create payload — the real submit path.
 *
 * The operator UI must not plant POS/KOT state the client cannot observe.
 * Petpooja sync state is server-owned; a `petpoojaSyncStatus: 'pending'`
 * literal at birth is a fabricated claim and is rejected by the newer rules
 * lane. This test submits the actual form and inspects the object handed to
 * `setDoc`, so removing the field cannot silently regress.
 */

const h = vi.hoisted(() => ({
  setDoc: vi.fn(async () => undefined),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  onClose: vi.fn(),
  onOrderCreated: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: null },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({ id: 'auto_test' })),
  getDoc: h.getDoc,
  setDoc: h.setDoc,
  Timestamp: {
    now: () => ({ toMillis: () => 1760000000000 }),
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: {
      id: 'usr_operator_1',
      name: 'Test Operator',
      role: 'branch_owner',
      branchIds: ['branch_surat_01'],
    },
  }),
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({ selectedBranchId: 'branch_surat_01' }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { ManualOrderCreateModal } from '../src/features/orders/components/ManualOrderCreateModal';

const require = createRequire(import.meta.url);
const { JSDOM } = require('../../burgonomics-foundation-core/node_modules/jsdom/lib/api.js') as {
  JSDOM: new (html: string) => { window: Window & typeof globalThis };
};

const RULE_FORBIDDEN_KEYS = (): string[] => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const block = rules.match(
    /function orderCreateForbiddenKeys\(\)\s*\{[\s\S]*?return \[([\s\S]*?)\];/,
  );
  expect(block).not.toBeNull();
  return [...block![1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
};

describe('Manual walk-in order — actual create payload', () => {
  let root: Root;
  let container: HTMLDivElement;
  const originalGlobals = new Map<string, PropertyDescriptor | undefined>();

  beforeAll(() => {
    const { window } = new JSDOM('<!doctype html><html><body></body></html>');
    const globals: Record<string, unknown> = {
      window,
      document: window.document,
      HTMLElement: window.HTMLElement,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    for (const [key, value] of Object.entries(globals)) {
      originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    container?.remove();
    h.setDoc.mockClear();
    h.getDoc.mockClear();
    h.onClose.mockClear();
    h.onOrderCreated.mockClear();
  });

  afterAll(() => {
    for (const [key, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });

  it('submits a rules-shaped walk-in doc with no client-owned Petpooja sync state', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <ManualOrderCreateModal
          isOpen
          onClose={h.onClose}
          onOrderCreated={h.onOrderCreated}
        />,
      );
    });

    const form = container.querySelector('form');
    expect(form).not.toBeNull();

    await act(async () => {
      form!.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      await vi.waitFor(() => expect(h.setDoc).toHaveBeenCalledTimes(1));
    });

    const [, payload] = h.setDoc.mock.calls[0] as [unknown, Record<string, unknown>];

    // The exact two accepted fields plus the operator branch stamp.
    expect(payload.customerId).toBe('cust_walkin');
    expect(payload.userId).toBe('usr_operator_1');
    expect(payload.branchId).toBe('branch_surat_01');

    // Canonical birth status: fires rules orderCreateInitialStatus().
    expect(payload.status).toEqual({
      code: 'PLACED',
      label: 'Order placed',
      kind: 'upcoming',
      terminal: false,
    });
    expect(Object.keys(payload.status as object)).toEqual([
      'code',
      'label',
      'kind',
      'terminal',
    ]);

    // Cash walk-in totals and line items remain the operator's payload.
    expect(payload.paymentMethod).toBe('cod');
    expect(payload.paymentStatus).toBe('completed');
    expect(payload.items).toEqual([
      {
        itemId: 'itm_paneer_makhani',
        petpoojaItemId: 'PP-BRG-103',
        name: 'Paneer Makhani Burst Burger',
        quantity: 1,
        price: 199,
        specialInstructions: undefined,
      },
      {
        itemId: 'itm_peri_peri_fries',
        petpoojaItemId: 'PP-SDE-301',
        name: 'Peri-Peri Crinkle Fries',
        quantity: 1,
        price: 99,
        specialInstructions: undefined,
      },
    ]);
    expect(payload.subtotal).toBe(298);
    expect(payload.tax).toBe(15);
    expect(payload.deliveryFee).toBe(0);
    expect(payload.total).toBe(328);
    expect(payload.createdAt).toBeDefined();
    expect(payload.updatedAt).toBeDefined();

    // No top-level POS/KOT state invented by the client; nested menu identity
    // (`items[].petpoojaItemId`) is menu data and intentionally allowed.
    expect(Object.keys(payload).filter((key) => key.startsWith('petpooja'))).toEqual([]);
    expect(payload).not.toHaveProperty('petpoojaSyncStatus');
    expect(payload).not.toHaveProperty('petpoojaStatus');
    expect(payload).not.toHaveProperty('petpoojaOrderId');

    // Static rules contract: never plant any create-forbidden key.
    const forbidden = RULE_FORBIDDEN_KEYS();
    expect(forbidden).toContain('petpoojaOrderId');
    expect(Object.keys(payload).filter((key) => forbidden.includes(key))).toEqual([]);

    // The create must never claim a sync result it did not observe.
    expect(h.onOrderCreated).toHaveBeenCalledTimes(1);
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });
});
