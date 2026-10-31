import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { act } from 'react';
import { createRequire } from 'node:module';

/**
 * A11Y-05: modal dialogs must trap Tab inside the dialog and leave on Escape.
 * This exercises the shared `useDialogFocusTrap` hook that the order
 * cancel/refund modal and the admin reject-refund modal both use.
 *
 * jsdom is the declared devDependency; if it cannot be resolved the file is
 * skipped rather than failing the suite (same policy as the sidebar tests).
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

import { useDialogFocusTrap } from '../src/components/ui/useDialogFocusTrap';

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

describe.skipIf(!JSDOM)('useDialogFocusTrap (A11Y-05)', () => {
  let dom: { window: Record<string, unknown> & { document: Document } };
  let createRoot: (el: Element) => { render: (node: unknown) => void; unmount: () => void };
  let container: HTMLElement;
  let root: { render: (node: unknown) => void; unmount: () => void } | null = null;
  const escapes: number[] = [];

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
    escapes.length = 0;
  });

  function Dialog({ active }: { active: boolean }) {
    const ref = useDialogFocusTrap<HTMLDivElement>({
      active,
      onEscape: () => escapes.push(1),
    });
    return (
      <div ref={ref} tabIndex={-1} data-testid="dialog">
        <button id="first-btn" type="button">
          First
        </button>
        <button id="last-btn" type="button">
          Last
        </button>
      </div>
    );
  }

  async function mount(active: boolean) {
    const doc = dom.window.document;
    container = doc.createElement('div');
    doc.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<Dialog active={active} />);
    });
  }

  function press(key: string, shiftKey = false) {
    const ev = new (dom.window.KeyboardEvent as new (type: string, init: object) => Event)(
      'keydown',
      { key, shiftKey, bubbles: true, cancelable: true }
    );
    dom.window.document.dispatchEvent(ev);
  }

  it('moves focus to the first control when it opens', async () => {
    await mount(true);
    expect(dom.window.document.activeElement?.id).toBe('first-btn');
  });

  it('wraps Tab from the last control back to the first', async () => {
    await mount(true);
    (dom.window.document.getElementById('last-btn') as HTMLElement).focus();
    press('Tab');
    expect(dom.window.document.activeElement?.id).toBe('first-btn');
  });

  it('wraps Shift+Tab from the first control to the last', async () => {
    await mount(true);
    press('Tab', true);
    expect(dom.window.document.activeElement?.id).toBe('last-btn');
  });

  it('calls onEscape when Escape is pressed while open', async () => {
    await mount(true);
    press('Escape');
    expect(escapes.length).toBe(1);
  });

  it('does not intercept keys or steal focus when inactive', async () => {
    await mount(false);
    expect(dom.window.document.activeElement?.id).not.toBe('first-btn');
    press('Escape');
    expect(escapes.length).toBe(0);
  });
});
