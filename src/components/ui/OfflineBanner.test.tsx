/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OfflineBanner, useOnlineStatus } from './OfflineBanner';

declare global {
  // React's act environment flag; matches the pattern used by the other
  // jsdom suites in this app rather than a double cast.
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

/**
 * A11Y-21: Orders / Menu / Admin render silently stale data when the network
 * drops. The banner must be explicit that what is on screen may no longer be
 * true — not merely "offline".
 */
describe('OfflineBanner', () => {
  it('renders nothing while online', () => {
    expect(renderToStaticMarkup(<OfflineBanner isOnline />)).toBe('');
  });

  it('warns that on-screen data may be stale when offline', () => {
    const html = renderToStaticMarkup(<OfflineBanner isOnline={false} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('offline');
    expect(html).toContain('may be stale');
  });
});

/**
 * `useOnlineStatus` is a browser HINT only: it never claims server or API
 * health, and nothing here implies connectivity was verified end to end.
 *
 * jsdom performs no layout, and there is no network — these tests drive real
 * DOM events and a settable `navigator.onLine` getter, nothing more.
 */
describe('useOnlineStatus event recovery', () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let online = true;
  let latest: boolean | null = null;
  let mounted = false;

  const originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');
  const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');

  function setNavigatorOnline(value: boolean): void {
    online = value;
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => online,
    });
  }

  function setVisibility(value: 'visible' | 'hidden'): void {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => value,
    });
  }

  function Probe() {
    const value = useOnlineStatus();
    React.useEffect(() => {
      latest = value;
    });
    return null;
  }

  async function mount(): Promise<void> {
    mounted = true;
    await act(async () => {
      root?.render(<Probe />);
    });
  }

  async function fire(target: EventTarget, event: Event): Promise<void> {
    await act(async () => {
      target.dispatchEvent(event);
    });
  }

  beforeEach(() => {
    online = true;
    latest = null;
    mounted = false;
    setNavigatorOnline(true);
    setVisibility('visible');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (mounted && root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
    // Restore the real descriptors so no test leaks a fake connectivity state.
    // When the property did not exist originally, DELETE our own override —
    // restoring "nothing" means removing it, not leaving the fake getter in
    // place (or picking up an inherited one).
    if (originalOnLine) {
      Object.defineProperty(window.navigator, 'onLine', originalOnLine);
    } else {
      delete (window.navigator as { onLine?: boolean }).onLine;
    }
    if (originalVisibility) {
      Object.defineProperty(document, 'visibilityState', originalVisibility);
    } else {
      delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState;
    }
  });

  it('re-reads navigator.onLine when the window regains focus', async () => {
    await mount();
    expect(latest).toBe(true);

    // The browser says we are offline; no event has told the hook yet.
    setNavigatorOnline(false);

    await fire(window, new Event('focus'));

    expect(latest).toBe(false);
  });

  it('does not recover while the page is still hidden', async () => {
    setNavigatorOnline(false);
    await mount();
    expect(latest).toBe(false);

    // Back online, but the document is not visible: the hint must not flip yet.
    setNavigatorOnline(true);
    setVisibility('hidden');
    await fire(document, new Event('visibilitychange'));

    expect(latest).toBe(false);
  });

  it('re-reads navigator.onLine when the document becomes visible', async () => {
    setNavigatorOnline(false);
    setVisibility('hidden');
    await mount();
    expect(latest).toBe(false);

    setNavigatorOnline(true);
    setVisibility('visible');
    await fire(document, new Event('visibilitychange'));

    expect(latest).toBe(true);
  });

  it('tracks a visible-then-offline reading rather than assuming recovery', async () => {
    setNavigatorOnline(true);
    await mount();
    expect(latest).toBe(true);

    // Becoming visible is not itself evidence of connectivity.
    setNavigatorOnline(false);
    setVisibility('visible');
    await fire(document, new Event('visibilitychange'));

    expect(latest).toBe(false);
  });

  it('re-reads navigator.onLine as TRUE on focus when it comes back online', async () => {
    // Mount offline, recover, then let the focus hint reveal the new value.
    setNavigatorOnline(false);
    await mount();
    expect(latest).toBe(false);

    setNavigatorOnline(true);
    await fire(window, new Event('focus'));

    expect(latest).toBe(true);
  });

  it('balances every recovery listener under StrictMode and stops updating after unmount', async () => {
    // Record exactly what the hook adds/removes, matching on the SAME handler
    // reference so a near-miss (different function or capture flag) shows up.
    const added: Array<{ type: string; handler: unknown; capture: boolean }> = [];
    const removed: Array<{ type: string; handler: unknown; capture: boolean }> = [];

    const realAdd = window.addEventListener.bind(window);
    const realRemove = window.removeEventListener.bind(window);

    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    addSpy.mockImplementation((type, handler, options) => {
      added.push({ type, handler, capture: options === true });
      realAdd(type, handler, options);
    });
    removeSpy.mockImplementation((type, handler, options) => {
      removed.push({ type, handler, capture: options === true });
      realRemove(type, handler, options);
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      root?.render(
        <React.StrictMode>
          <Probe />
        </React.StrictMode>
      );
    });
    mounted = true;

    // Capture the hook's own handler while still mounted.
    const focusAdd = added.find((entry) => entry.type === 'focus');
    expect(focusAdd).toBeDefined();
    const hookFocusHandler = focusAdd?.handler as EventListener;

    await act(async () => {
      root?.unmount();
    });
    mounted = false;

    // Every listener the hook added must be removed with the SAME reference,
    // and StrictMode's extra cycle must not leave an orphan behind.
    const liveFocus = added.filter(
      (entry) => entry.type === 'focus' && !removed.some((gone) => gone.handler === entry.handler)
    );
    expect(liveFocus).toHaveLength(0);
    for (const entry of added) {
      expect(removed.some((gone) => gone.handler === entry.handler)).toBe(true);
    }

    // Firing the captured handler after unmount must not update state.
    const beforeFire = latest;
    await act(async () => {
      hookFocusHandler(new Event('focus'));
    });
    expect(latest).toBe(beforeFire);
    expect(consoleError).not.toHaveBeenCalled();

    addSpy.mockRestore();
    removeSpy.mockRestore();
    consoleError.mockRestore();
  });
});
