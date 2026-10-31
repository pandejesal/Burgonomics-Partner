import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRequire } from 'node:module';

/**
 * Review finding (BLOCKING): OrderCancelRefundModal passed `onEscape: onClose`
 * and wired the header X straight to `onClose`, with no guard for the
 * in-flight state. Escape or X during a cancel/refund POST unmounted the
 * dialog; a failure then landed on an unmounted component and staff never
 * learned whether money moved.
 *
 * Contract under test:
 *  - while the submit is in flight, Escape does NOT close;
 *  - while the submit is in flight, the header X does NOT close;
 *  - once it settles (success path calls onClose itself), Escape closes again.
 */
type JSDOMCtor = new (html: string, options?: Record<string, unknown>) => {
  window: Record<string, unknown> & { document: Document };
};

function resolveJSDOM(): JSDOMCtor | null {
  const requireFromTest = createRequire(import.meta.url);
  try {
    const mod = requireFromTest('jsdom') as { JSDOM?: JSDOMCtor };
    return mod?.JSDOM ?? null;
  } catch {
    return null;
  }
}

const JSDOM = resolveJSDOM();

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'user_test_operator', role: 'brand_owner' } }),
}));

import { OrderCancelRefundModal } from '../src/features/orders/components/OrderCancelRefundModal';

const EVENT_KEYS = [
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'KeyboardEvent',
  'MouseEvent',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'MutationObserver',
] as const;

const order = {
  id: 'ord_123456',
  paymentStatus: 'completed',
  total: 499,
  status: 'preparing',
} as never;

describe.skipIf(!JSDOM)('OrderCancelRefundModal in-flight close guard', () => {
  let dom: { window: Record<string, unknown> & { document: Document } };
  let createRoot: (el: Element) => { render: (node: unknown) => void; unmount: () => void };
  let container: HTMLElement;
  let root: { render: (node: unknown) => void; unmount: () => void } | null = null;

  beforeAll(async () => {
    const JSDOMClass = JSDOM as unknown as JSDOMCtor;
    dom = new JSDOMClass('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
      pretendToBeVisual: true,
    }) as unknown as { window: Record<string, unknown> & { document: Document } };
    const assign = (key: string, value: unknown) => {
      if (value === undefined) return;
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    };
    assign('window', dom.window);
    assign('document', dom.window.document);
    for (const key of EVENT_KEYS) assign(key, dom.window[key]);
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    ({ createRoot } = await import('react-dom/client'));
  });

  afterAll(() => {
    for (const key of ['window', 'document']) {
      try {
        delete (globalThis as Record<string, unknown>)[key];
      } catch {
        /* ignore */
      }
    }
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    container?.remove();
    root = null;
  });

  async function mount(onClose: () => void, onConfirmCancel: () => Promise<void>) {
    const doc = dom.window.document;
    container = doc.createElement('div');
    doc.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <OrderCancelRefundModal
          order={order}
          isOpen
          onClose={onClose}
          onConfirmCancel={onConfirmCancel}
        />
      );
    });
    return container;
  }

  function press(key: string) {
    const ev = new (dom.window.KeyboardEvent as new (type: string, init: object) => Event)(
      'keydown',
      { key, bubbles: true, cancelable: true }
    );
    dom.window.document.dispatchEvent(ev);
  }

  it('ignores Escape and the header X while a cancel is in flight, then closes again', async () => {
    let resolveSubmit!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });
    const onClose = vi.fn();
    const onConfirmCancel = vi.fn(() => pending);

    const el = await mount(onClose, onConfirmCancel);

    const form = el.querySelector('form');
    if (!form) throw new Error('cancel form did not render');
    await act(async () => {
      form.dispatchEvent(new (dom.window.Event as new (t: string, i: object) => Event)('submit', {
        bubbles: true,
        cancelable: true,
      }));
    });

    // In flight: the submit control is disabled/relabelled.
    expect(el.textContent).toContain('Processing...');

    press('Escape');
    expect(onClose).not.toHaveBeenCalled();
    expect(el.querySelector('[role="dialog"]')).not.toBeNull();

    const closeButton = el.querySelector(
      'button[aria-label="Close cancel order dialog"]'
    ) as HTMLButtonElement | null;
    if (!closeButton) throw new Error('header close button missing');
    await act(async () => {
      closeButton.click();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(el.querySelector('[role="dialog"]')).not.toBeNull();

    // Settle the POST: the success path calls onClose itself.
    await act(async () => {
      resolveSubmit();
      await pending;
    });
    expect(onConfirmCancel).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Guard lifted: Escape closes now.
    press('Escape');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
