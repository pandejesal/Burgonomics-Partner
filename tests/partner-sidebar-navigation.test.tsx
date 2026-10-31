import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * B03 — partner navigation accessibility polish (findings 05-14 / 05-20 scope).
 *
 * Covers `src/components/layout/Sidebar.tsx` + `Header.tsx` only:
 *  - the off-canvas (closed, below `lg`) drawer must leave the tab order and
 *    the accessibility tree: it now carries `inert`, and the breakpoint used
 *    for that decision is the same one Tailwind uses to dock it (`64rem`);
 *  - the header toggle exposes `aria-expanded` / `aria-controls` and gets
 *    focus back when the drawer closes;
 *  - Escape closes the drawer, focus enters it on open, and an explicit
 *    in-drawer close control exists (the header toggle sits behind the open
 *    drawer at z-50);
 *  - the `<nav>` is one named landmark and still renders only the routes the
 *    signed-in role is allowed to see (route/RBAC policy untouched).
 *
 * Evidence layers, deliberately separated:
 *  1. `ReactDOM` server render — always runs, asserts the real markup contract
 *     for mobile / desktop breakpoints (no CSS engine needed).
 *  2. Real DOM client render (createRoot + jsdom) — asserts focus movement,
 *     Escape, click-to-close, and inert toggling across a viewport change.
 *     jsdom is not part of this package (network/install is out of scope for
 *     the audit), so it is resolved from this repo's sibling app install; the
 *     layer reports itself as skipped when no DOM implementation exists.
 *
 * Honest limit: jsdom has no CSS cascade and no sequential-focus navigation
 * ("TODO: Exclude inert elements" in jsdom's focusing.js), so *browser* tab
 * order through an off-screen subtree cannot be simulated here. The invariant
 * is therefore asserted where it is actually decided — the `inert` attribute
 * React writes into the live DOM — and the tab-order consequence is the HTML
 * standard behaviour of that attribute. Focus leaving an inert subtree is a
 * browser behaviour jsdom does not model either, so that case is asserted via
 * the drawer's own focus-return path, not via a simulated blur.
 */

// Synthetic operator only — no real identity, no credentials (audit charter).
const authFixture = vi.hoisted(() => ({
  user: {
    id: 'user_test_operator',
    name: 'Test Operator',
    role: 'brand_owner' as string,
    branchIds: [] as string[],
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: authFixture.user, signOut: vi.fn() }),
}));
vi.mock('@/components/layout/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('@/components/layout/BranchSwitcher', () => ({ BranchSwitcher: () => null }));
vi.mock('@/components/ui/PetpoojaStatusBadge', () => ({ PetpoojaStatusBadge: () => null }));

import { SIDEBAR_ID, SIDEBAR_NAV_ID, NAV_TOGGLE_ID, SIDEBAR_DESKTOP_QUERY } from '../src/components/layout/Sidebar';
import { AppLayout } from '../src/components/layout/AppLayout';
import { useAppStore } from '../src/stores/appStore';

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Minimal window with a real matchMedia implementation driven by a width. */
function patchMatchMedia(
  target: Record<string, unknown>,
  initialWidth: number
): { resizeTo: (width: number) => void; width: () => number } {
  let width = initialWidth;
  const listeners = new Set<() => void>();
  const evaluate = (query: string): boolean => {
    const match = /min-width:\s*([\d.]+)\s*(rem|px)/.exec(query);
    if (!match) return false;
    const px = Number.parseFloat(match[1]) * (match[2] === 'rem' ? 16 : 1);
    return width >= px;
  };
  const factory = (query: string) => ({
    media: query,
    get matches() {
      return evaluate(query);
    },
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => void listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => void listeners.delete(listener),
    addListener: (listener: () => void) => void listeners.add(listener),
    removeListener: (listener: () => void) => void listeners.delete(listener),
    dispatchEvent: () => true,
  });
  Object.defineProperty(target, 'matchMedia', {
    value: factory,
    writable: true,
    configurable: true,
  });
  return {
    width: () => width,
    resizeTo: (next: number) => {
      width = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

function Shell() {
  return (
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<div id="page-root" />} />
          <Route path="/orders" element={<div id="page-root" />} />
          <Route path="*" element={<div id="page-root" />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function renderShell(): string {
  return renderToStaticMarkup(<Shell />);
}

/* -------------------------------------------------------------------------- */
/* 1. markup contracts (always runs — node environment, ReactDOM server)       */
/* -------------------------------------------------------------------------- */

describe('Sidebar/Header markup contract (ReactDOM server render)', () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterAll(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  function renderAt(widthPx: number, sidebarOpen: boolean): string {
    // The drawer's off-canvas decision is viewport-driven, so the responsive
    // fixture has to exist before React renders.
    (globalThis as { window?: unknown }).window = {};
    patchMatchMedia((globalThis as Record<string, unknown>).window as Record<string, unknown>, widthPx);
    useAppStore.setState({ sidebarOpen });
    // zustand v5 feeds `getInitialState()` to server renders (a server render
    // never subscribes), so the initial state has to be aligned as well or
    // `renderToStaticMarkup` would always draw the first state.
    (useAppStore.getInitialState() as { sidebarOpen: boolean }).sidebarOpen = sidebarOpen;
    return renderShell();
  }

  it('closed drawer below lg is off-canvas AND inert, with a named nav landmark', () => {
    const html = renderAt(390, false);

    expect(html).toContain(`id="${SIDEBAR_ID}"`);
    // React 19 serialises the boolean `inert` prop as a real attribute.
    expect(html).toContain('inert=""');
    // Off-canvas transform + docked override both still present (layout kept).
    expect(html).toContain('-translate-x-full');
    expect(html).toContain('lg:translate-x-0');
    // Landmark: exactly one, named, not a bare <nav>.
    expect(html).toContain(`id="${SIDEBAR_NAV_ID}"`);
    expect(html).toContain('aria-label="Primary"');
    expect(html.match(/<nav/g) ?? []).toHaveLength(1);
    // In-drawer accessible close affordance (header toggle is behind drawer).
    expect(html).toContain('aria-label="Close navigation menu"');
    expect(html).toMatch(/aria-label="Close navigation menu"[^>]*lg:hidden|lg:hidden[^>]*aria-label="Close navigation menu"/);
  });

  it('open drawer below lg is on-canvas and never inert', () => {
    const html = renderAt(390, true);

    expect(html).not.toContain('inert=""');
    expect(html).not.toContain('-translate-x-full');
    expect(html).toContain('lg:translate-x-0');
  });

  it('closed drawer at desktop (>= lg) stays focusable: no inert', () => {
    const html = renderAt(1280, false);

    expect(html).not.toContain('inert=""');
    expect(html).toContain('-translate-x-full'); // class stays; CSS override docks it
    expect(html).toContain('lg:translate-x-0');
  });

  it('fails safe when matchMedia cannot be used: no inert without a measurable viewport', () => {
    (globalThis as { window?: unknown }).window = {
      matchMedia: () => {
        throw new Error('unsupported');
      },
    };
    useAppStore.setState({ sidebarOpen: false });

    const html = renderShell();

    expect(html).not.toContain('inert=""');
    expect(html).toContain('lg:translate-x-0');
  });

  it('header toggle wires aria-expanded + aria-controls to the drawer id', () => {
    const closed = renderAt(390, false);
    expect(closed).toContain(`id="${NAV_TOGGLE_ID}"`);
    expect(closed).toContain('aria-controls="app-sidebar"');
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain('aria-label="Toggle navigation menu"');

    const open = renderAt(390, true);
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('aria-controls="app-sidebar"');
  });

  it("desktop breakpoint query matches Tailwind's `lg` token (64rem)", () => {
    // A JS/CSS breakpoint split is the failure mode that would make a visible
    // nav inert, so pin the parity to the installed theme.
    expect(SIDEBAR_DESKTOP_QUERY).toBe('(min-width: 64rem)');
    const themePath = fileURLToPath(
      new URL('../node_modules/tailwindcss/theme.css', import.meta.url)
    );
    if (existsSync(themePath)) {
      expect(readFileSync(themePath, 'utf8')).toMatch(/--breakpoint-lg:\s*64rem\s*;/);
    } else {
      console.warn(`[B03] ${themePath} missing — breakpoint parity not machine-checked`);
    }
  });

  it('nav still renders only routes the signed-in role may reach (RBAC untouched)', () => {
    authFixture.user = { ...authFixture.user, role: 'brand_owner' };
    const globalNav = renderAt(390, false);
    expect(globalNav).toContain('href="/admin"');
    expect(globalNav).toContain('href="/orders"');

    authFixture.user = { ...authFixture.user, role: 'branch_staff' };
    const scopedNav = renderAt(390, false);
    expect(scopedNav).toContain('href="/kds"');
    expect(scopedNav).not.toContain('href="/admin"');
    expect(scopedNav).not.toContain('href="/customers"');

    authFixture.user = { ...authFixture.user, role: 'brand_owner' };
  });
});

/* -------------------------------------------------------------------------- */
/* 2. live focus / keyboard / responsive behaviour (real DOM)                  */
/* -------------------------------------------------------------------------- */

type JSDOMCtor = new (html: string, options?: Record<string, unknown>) => {
  window: (Record<string, unknown> & { document: Document }) | never;
};

function resolveJSDOM(): JSDOMCtor | null {
  const requireFromTest = createRequire(import.meta.url);
  const candidates = [
    'jsdom', // installed in this package if it ever gains a DOM environment
    '../../burgonomics-foundation-core/node_modules/jsdom/lib/api.js', // repo sibling install
  ];
  for (const candidate of candidates) {
    try {
      const mod = requireFromTest(candidate) as { JSDOM?: JSDOMCtor };
      if (mod?.JSDOM) return mod.JSDOM;
    } catch {
      // try next candidate
    }
  }
  return null;
}

const JSDOM = resolveJSDOM();
if (!JSDOM) {
  console.warn(
    '[B03] No jsdom available (neither this package nor the sibling app has it installed) — ' +
      'live focus/keyboard tests are skipped; the markup-contract layer above still runs.'
  );
}

describe.skipIf(!JSDOM)('Sidebar live focus/keyboard/responsive behaviour (real DOM)', () => {
  let dom: { window: Record<string, unknown> & { document: Document } };
  let doc: Document;
  let createRoot: (el: Element) => { render: (node: unknown) => void; unmount: () => void };
  let container: HTMLElement | null = null;
  let root: { render: (node: unknown) => void; unmount: () => void } | null = null;
  let viewport: ReturnType<typeof patchMatchMedia> | null = null;

  beforeAll(async () => {
    const JSDOMClass = JSDOM as unknown as JSDOMCtor;
    dom = new JSDOMClass('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
      pretendToBeVisual: true,
    }) as unknown as { window: Record<string, unknown> & { document: Document } };
    doc = dom.window.document;

    const g = globalThis as Record<string, unknown>;
    const assign = (key: string, value: unknown) => {
      if (value === undefined) return;
      try {
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
      } catch {
        // leave the host global in place
      }
    };
    assign('window', dom.window);
    assign('document', doc);
    for (const key of [
      'HTMLElement',
      'Element',
      'Node',
      'Event',
      'KeyboardEvent',
      'MouseEvent',
      'CustomEvent',
      'getComputedStyle',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'MutationObserver',
    ]) {
      assign(key, dom.window[key]);
    }
    g.IS_REACT_ACT_ENVIRONMENT = true;

    ({ createRoot } = await import('react-dom/client'));
  });

  afterAll(() => {
    for (const key of ['window', 'document']) {
      try {
        delete (globalThis as Record<string, unknown>)[key];
      } catch {
        // ignore
      }
    }
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    container?.remove();
    root = null;
    container = null;
    viewport = null;
  });

  async function mountAt(widthPx: number) {
    viewport = patchMatchMedia(dom.window as unknown as Record<string, unknown>, widthPx);
    useAppStore.setState({ sidebarOpen: false });
    container = doc.createElement('div');
    doc.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Shell />);
    });
    const aside = container.querySelector('aside');
    const toggle = container.querySelector(`#${NAV_TOGGLE_ID}`) as HTMLButtonElement | null;
    if (!aside || !toggle) throw new Error('shell did not render the drawer');
    return { aside, toggle };
  }

  it('closed drawer at 390px renders `inert` into the live DOM (no unsupported-prop assumption)', async () => {
    const { aside, toggle } = await mountAt(390);

    expect(aside.getAttribute('inert')).toBe('');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(aside.id);
    expect(aside.id).toBe(SIDEBAR_ID);
    expect(container!.querySelectorAll('nav')).toHaveLength(1);
    expect(container!.querySelector('nav')!.getAttribute('aria-label')).toBe('Primary');
  });

  it('toggle opens the drawer: inert removed, aria-expanded true, focus lands on the first nav link', async () => {
    const { aside, toggle } = await mountAt(390);

    await act(async () => {
      toggle.click();
    });

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(aside.hasAttribute('inert')).toBe(false);
    const firstLink = aside.querySelector(`#${SIDEBAR_NAV_ID} a`) as HTMLElement;
    expect(firstLink).not.toBeNull();
    expect(doc.activeElement).toBe(firstLink);
  });

  it('Escape closes the open drawer and returns focus to the header toggle', async () => {
    const { aside, toggle } = await mountAt(390);
    await act(async () => {
      toggle.click();
    });
    expect(doc.activeElement).not.toBe(toggle);

    await act(async () => {
      doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(aside.getAttribute('inert')).toBe('');
    expect(doc.activeElement).toBe(toggle);
  });

  it('in-drawer close button closes and restores focus to the toggle', async () => {
    const { aside, toggle } = await mountAt(390);
    await act(async () => {
      toggle.click();
    });

    const closeButton = container!.querySelector(
      '[aria-label="Close navigation menu"]'
    ) as HTMLButtonElement;
    expect(closeButton).not.toBeNull();
    await act(async () => {
      closeButton.click();
    });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(aside.getAttribute('inert')).toBe('');
    expect(doc.activeElement).toBe(toggle);
  });

  it('backdrop click (AppLayout, unedited) closes the drawer and focus is not left behind', async () => {
    const { aside, toggle } = await mountAt(390);
    await act(async () => {
      toggle.click();
    });

    const backdrop = [...container!.querySelectorAll('div')].find((el) =>
      String(el.className).includes('bg-black/50')
    );
    expect(backdrop).toBeTruthy();
    await act(async () => {
      (backdrop as HTMLElement).click();
    });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(aside.getAttribute('inert')).toBe('');
    expect(doc.activeElement).toBe(toggle);
  });

  it('choosing a nav route closes the drawer and hands focus back to the toggle', async () => {
    const { aside, toggle } = await mountAt(390);
    await act(async () => {
      toggle.click();
    });

    const ordersLink = aside.querySelector('a[href="/orders"]') as HTMLElement;
    expect(ordersLink).not.toBeNull();
    await act(async () => {
      ordersLink.click();
    });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(aside.getAttribute('inert')).toBe('');
    expect(doc.activeElement).toBe(toggle);
    expect(container!.querySelector('#page-root')).not.toBeNull(); // navigation happened
  });

  it('responsive: crossing lg adds/removes inert live, without remounting the drawer', async () => {
    const { aside } = await mountAt(390);
    expect(aside.getAttribute('inert')).toBe('');

    // 390 -> 1280: the docked desktop nav must be reachable.
    await act(async () => {
      viewport!.resizeTo(1280);
    });
    expect(aside.hasAttribute('inert')).toBe(false);
    const firstLink = aside.querySelector(`#${SIDEBAR_NAV_ID} a`) as HTMLElement;
    firstLink.focus();
    expect(doc.activeElement).toBe(firstLink);

    // 1280 -> 390: back off-canvas, out of the tab order again, and focus that
    // was inside the docked nav is handed back to the header toggle rather
    // than being dropped on <body>.
    await act(async () => {
      viewport!.resizeTo(390);
    });
    expect(aside.getAttribute('inert')).toBe('');
    expect(doc.activeElement).not.toBe(firstLink);
    expect(doc.activeElement).toBe(container!.querySelector(`#${NAV_TOGGLE_ID}`));
  });

  it('desktop viewport never hides the docked nav behind inert, and does not steal focus', async () => {
    const { aside } = await mountAt(1280);

    expect(aside.hasAttribute('inert')).toBe(false);
    expect(doc.activeElement).not.toBe(aside.querySelector(`#${SIDEBAR_NAV_ID} a`));
    // Closed state still reported to assistive tech as collapsed.
    const toggle = container!.querySelector(`#${NAV_TOGGLE_ID}`) as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
