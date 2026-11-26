import { Capacitor } from '@capacitor/core';

/**
 * Android hardware / gesture BACK for the Partner console.
 *
 * The EMULATOR audit (2026-11-26) found BACK on the login screen did nothing:
 * the previous listener was `canGoBack && history.length > 1 ? back : minimize`,
 * which on a HashRouter cold start reports `canGoBack: true` from Capacitor
 * while the WebView stack holds a single entry, so BACK neither navigated nor
 * left the app.
 *
 * This module keeps the decision pure ({@link decideBackAction}) and only wires
 * it to the plugin in {@link initHardwareBackButton}. Precedence:
 *   1. close an open modal / drawer first (the console has several, e.g. the
 *      86/stock drawer and the cancel/refund dialog);
 *   2. navigate back through the router history;
 *   3. on an entry screen, arm the exit and leave only on the second press.
 */

/** How long the first "press back again to exit" press stays armed. */
export const EXIT_ARM_WINDOW_MS = 2000;

/** Screens where BACK leaves the console instead of navigating. */
export const ENTRY_PATHS: readonly string[] = Object.freeze(['/', '/login', '/dashboard']);

/** Human-readable prompt for the armed state. */
export const ARM_EXIT_MESSAGE = 'Press back again to exit Burgonomics Partner';

export type BackAction = 'close-overlay' | 'history-back' | 'go-home' | 'arm-exit' | 'exit';

/** True for an entry screen, ignoring a trailing slash and query/fragment. */
export function isEntryPath(rawPath: string): boolean {
  const path = normalisePath(rawPath).replace(/\/+$/, '') || '/';
  return ENTRY_PATHS.includes(path);
}

/** Strips query string and fragment; HashRouter paths arrive with a leading `/`. */
export function normalisePath(raw: string): string {
  const path = (raw || '').split(/[?#]/)[0] || raw || '';
  return path.startsWith('/') ? path : `/${path}`;
}

export interface BackDecisionInput {
  /** A modal / drawer / sheet is on screen. */
  hasOpenOverlay: boolean;
  /** Router history has a previous entry. */
  canGoBack: boolean;
  /** Current route (hash or pathname; query/fragment tolerated). */
  pathname: string;
  /** Timestamp of the previous armed press, or null. */
  armedAt: number | null;
  /** Current timestamp — injected for determinism. */
  now: number;
}

/**
 * Pure BACK precedence. `arm-exit` is returned once at an entry screen; the
 * caller shows {@link ARM_EXIT_MESSAGE} and remembers the timestamp, and the
 * next press inside the window returns `exit`.
 */
export function decideBackAction(input: BackDecisionInput): BackAction {
  if (input.hasOpenOverlay) return 'close-overlay';

  const path = normalisePath(input.pathname).replace(/\/+$/, '') || '/';
  if (!isEntryPath(path)) return input.canGoBack ? 'history-back' : 'go-home';

  if (input.armedAt !== null && input.now - input.armedAt <= EXIT_ARM_WINDOW_MS) {
    return 'exit';
  }
  return 'arm-exit';
}

/**
 * The open overlay that should swallow BACK.
 *
 * Every modal in this app declares `role="dialog"` + `aria-modal="true"`
 * (KDSQuick86Drawer, OrderCancelRefundModal, RiderAssignmentModal,
 * PetpoojaTestRunnerModal, KDSAudioUnlockModal, admin dialogs). Hidden and
 * `aria-hidden` variants are ignored so a mounted-but-closed layer never
 * blocks BACK.
 */
export function findOpenOverlay(doc: Document): Element | null {
  const candidates = Array.from(
    doc.querySelectorAll(
      '[aria-modal="true"], [role="dialog"], [role="alertdialog"], [data-state="open"][role="menu"]',
    ),
  );
  for (const candidate of candidates) {
    const hidden =
      candidate.getAttribute('aria-hidden') === 'true' ||
      candidate.hasAttribute('hidden') ||
      (candidate as HTMLElement).style?.display === 'none';
    if (!hidden) return candidate;
  }
  return null;
}

/** Typed access to the window's own event constructors (jsdom provides them). */
type WindowWithEvents = Window & {
  KeyboardEvent: typeof KeyboardEvent;
  PopStateEvent: typeof PopStateEvent;
  CustomEvent: typeof CustomEvent;
};

/**
 * Asks the overlay to close: a component can opt in by cancelling
 * `burg:hardware-back`; otherwise its own close button is clicked, and finally
 * Escape is dispatched (every modal here already handles Escape).
 */
export function dismissOpenOverlay(win: Window, overlay: Element): boolean {
  const backEvent = new (win as WindowWithEvents).CustomEvent('burg:hardware-back', {
    bubbles: true,
    cancelable: true,
    detail: { source: 'hardware-back' },
  });
  overlay.dispatchEvent(backEvent);
  if (backEvent.defaultPrevented) return true;

  const closeButton = overlay.querySelector<HTMLElement>(
    'button[aria-label*="close" i], button[data-testid*="close" i], [data-dialog-close], [data-drawer-close]',
  );
  if (closeButton) {
    closeButton.click();
    return true;
  }

  (overlay.ownerDocument || win.document).dispatchEvent(
    new (win as WindowWithEvents).KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
    }),
  );
  return true;
}

/**
 * Minimal router surface (react-router's HashRouter backs onto this).
 *
 * `goHome` MUST come from react-router's `navigate`, never from a raw
 * `history.pushState({}, ...)`: that wipes the idx/key fields react-router
 * keeps in history.state, so BACK stops working after a go-home.
 */
export interface RouterHistoryLike {
  back: () => void;
  canGoBack?: () => boolean;
  goHome: () => void;
}

/**
 * Whether the app can navigate back, read from the POP-STACK INDEX react-router
 * writes into `window.history.state.idx` (chunk-GR4NQCSD.js: `idx: index`).
 *
 * This is the fix for the audit result: `window.history.length > 1` is TRUE on
 * a HashRouter cold start even though the app is on its first entry, so BACK
 * neither navigated nor left the app. `idx > 0` is the honest answer.
 */
export function historyCanGoBack(win: Window): boolean {
  try {
    const state = win.history.state as { idx?: unknown } | null;
    return typeof state?.idx === 'number' && state.idx > 0;
  } catch {
    return false;
  }
}

/**
 * react-router's `navigate`, registered from inside the Router by App.tsx.
 * Keeping the function here (rather than importing the router into this module)
 * preserves the module's dependency-free, unit-testable surface.
 */
let navigateHome: (() => void) | null = null;

export function registerRouterGoHome(navigate: (() => void) | null): void {
  navigateHome = navigate;
}

/** Router history bridge used by main.tsx (one object per session). */
export function routerHistory(): RouterHistoryLike {
  return {
    back: () => window.history.back(),
    canGoBack: () => historyCanGoBack(window),
    goHome: () => {
      // No pushState fallback: a raw write would erase idx/key. The bridge is
      // registered on mount, before a user can press BACK on the native shell.
      navigateHome?.();
    },
  };
}

/** Minimal `@capacitor/app` surface. */
export interface AppPluginLike {
  addListener: (
    event: 'backButton',
    listener: (event: { canGoBack: boolean }) => void | Promise<void>,
  ) => Promise<unknown> | unknown;
  exitApp?: () => Promise<void> | void;
  minimizeApp?: () => Promise<void> | void;
}

export interface BackHandlerOptions {
  app?: AppPluginLike;
  /** Router bridge; required so go-home can never bypass the router. */
  history: RouterHistoryLike;
  win?: Window;
  now?: () => number;
  /** Feedback for the first exit-arming press (a toast in main.tsx). */
  onArmExit?: () => void;
}

/** Reads the current route from either hash or pathname routing. */
function currentPath(win: Window): string {
  return normalisePath(win.location.hash.replace(/^#/, '') || win.location.pathname);
}

/** Builds the handler so tests can drive the exact logic the listener runs. */
export function createBackHandler(options: BackHandlerOptions): (event: {
  canGoBack: boolean;
}) => BackAction {
  const win = options.win ?? window;
  const now = options.now ?? (() => Date.now());
  let armedAt: number | null = null;

  return (event) => {
    const overlay = findOpenOverlay(win.document);
    const action = decideBackAction({
      hasOpenOverlay: Boolean(overlay),
      canGoBack: options.history?.canGoBack?.() ?? Boolean(event?.canGoBack),
      pathname: currentPath(win),
      armedAt,
      now: now(),
    });

    switch (action) {
      case 'close-overlay':
        if (overlay) dismissOpenOverlay(win, overlay);
        armedAt = null;
        return action;
      case 'history-back':
        armedAt = null;
        options.history.back();
        return action;
      case 'go-home':
        armedAt = null;
        // React-router's navigate() writes idx/key itself; a raw pushState({})
        // left historyCanGoBack false and made the next BACK a no-op.
        options.history.goHome();
        return action;
      case 'arm-exit':
        armedAt = now();
        options.onArmExit?.();
        return action;
      case 'exit':
        armedAt = null;
        void options.app?.exitApp?.();
        return action;
      default:
        return action;
    }
  };
}

/**
 * Registers BACK on the Android shell. Native Android only — iOS owns its own
 * swipe-back and the browser owns its own history. Registered once from
 * main.tsx, independent of which screen mounted.
 *
 * `@capacitor/app` is resolved lazily (and can be injected for tests), so this
 * module is importable from the web bundle without the plugin.
 */
let activeDisposer: (() => void) | null = null;

/** Root teardown (React root unmount / WebView pagehide) hook. */
export function disposeHardwareBackButton(): void {
  activeDisposer?.();
  activeDisposer = null;
  window.removeEventListener('pagehide', disposeHardwareBackButton);
}

export function initHardwareBackButton(options: BackHandlerOptions): () => void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return () => undefined;
  }

  let handle: { remove: () => void } | null = null;
  let disposed = false;

  const start = (app: AppPluginLike) => {
    const handler = createBackHandler({ ...options, app });
    try {
      void Promise.resolve(
        app.addListener('backButton', (event) => {
          handler(event);
        }),
      )
        .then((registered) => {
          const candidate = registered as { remove?: () => void } | null;
          if (!candidate || typeof candidate.remove !== 'function') return;
          if (disposed) candidate.remove();
          else handle = candidate as { remove: () => void };
        })
        .catch(() => undefined);
    } catch {
      // App plugin not synced: leave the OS default BACK handling in place.
    }
  };

  if (options.app) start(options.app);
  else {
    void import('@capacitor/app')
      .then(({ App }) => start(App as AppPluginLike))
      .catch(() => {
        /* App plugin not synced — OS default BACK handling stays */
      });
  }

  const dispose = () => {
    disposed = true;
    handle?.remove();
    handle = null;
    if (activeDisposer === dispose) activeDisposer = null;
  };
  activeDisposer = dispose;
  window.addEventListener('pagehide', disposeHardwareBackButton, { once: true });
  return dispose;
}
