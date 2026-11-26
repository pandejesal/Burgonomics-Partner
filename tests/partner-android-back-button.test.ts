/** @vitest-environment jsdom */
/**
 * Android hardware BACK for the Partner console.
 *
 * The EMULATOR audit (2026-11-26) pressed BACK on the login screen and nothing
 * happened. The old listener keyed off `window.history.length > 1`, which is
 * true on a HashRouter cold start even though the WebView stack holds a single
 * entry — so it neither navigated nor minimized.
 *
 * Decision table is pure; the plugin wiring is the only side effect.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EXIT_ARM_WINDOW_MS,
  decideBackAction,
  dismissOpenOverlay,
  findOpenOverlay,
  historyCanGoBack,
  initHardwareBackButton,
  isEntryPath,
  normalisePath,
  type AppPluginLike,
  type BackAction,
  type BackDecisionInput,
} from '@/shared/platform/hardwareBackButton';

/**
 * Capacitor is mocked so `initHardwareBackButton` can be driven per platform
 * without a native shell. The plugin itself is injected as `options.app`.
 */
const native = vi.hoisted(() => ({ platform: 'android' as 'android' | 'ios' | 'web' }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => native.platform !== 'web',
    getPlatform: () => native.platform,
  },
}));

const base: BackDecisionInput = {
  hasOpenOverlay: false,
  canGoBack: true,
  pathname: '/orders',
  armedAt: null,
  now: 1000,
};

const decide = (overrides: Partial<BackDecisionInput>): BackAction =>
  decideBackAction({ ...base, ...overrides });

describe('decideBackAction — overlay, then history, then exit', () => {
  it('closes an open modal before history or exit', () => {
    expect(decide({ hasOpenOverlay: true, pathname: '/orders', canGoBack: true })).toBe(
      'close-overlay',
    );
    expect(decide({ hasOpenOverlay: true, pathname: '/login', canGoBack: false })).toBe(
      'close-overlay',
    );
  });

  it('navigates back from a console screen', () => {
    expect(decide({ pathname: '/orders/ord_1', canGoBack: true })).toBe('history-back');
    expect(decide({ pathname: '/kds', canGoBack: true })).toBe('history-back');
  });

  it('lands on the dashboard instead of terminating when a sub-route has no history', () => {
    expect(decide({ pathname: '/admin/payments', canGoBack: false })).toBe('go-home');
  });

  it('arms exit on the login screen and exits only on the second press', () => {
    expect(decide({ pathname: '/login', canGoBack: false })).toBe('arm-exit');
    expect(decide({ pathname: '/login', canGoBack: false, armedAt: 1000, now: 1200 })).toBe(
      'exit',
    );
  });

  it('disarms once the window has passed', () => {
    expect(
      decide({
        pathname: '/login',
        canGoBack: false,
        armedAt: 1000,
        now: 1000 + EXIT_ARM_WINDOW_MS + 1,
      }),
    ).toBe('arm-exit');
  });

  it('treats login and dashboard as entry screens but not the 86 drawer route', () => {
    expect(isEntryPath('/login')).toBe(true);
    expect(isEntryPath('/dashboard')).toBe(true);
    expect(isEntryPath('/')).toBe(true);
    expect(isEntryPath('/login/')).toBe(true);
    expect(isEntryPath(normalisePath('/login?next=/orders'))).toBe(true);
    expect(isEntryPath('/kds')).toBe(false);
  });
});

describe('historyCanGoBack — the audit root cause', () => {
  it('reads the react-router POP-stack index, not history.length', () => {
    window.history.replaceState({ idx: 0 }, '', '#/login');
    expect(historyCanGoBack(window)).toBe(false);

    window.history.replaceState({ idx: 2 }, '', '#/orders');
    expect(historyCanGoBack(window)).toBe(true);
  });

  it('is false for foreign or missing state (never "optimistic back")', () => {
    window.history.replaceState(null, '', '#/login');
    expect(historyCanGoBack(window)).toBe(false);
    window.history.replaceState({ usr: {} }, '', '#/login');
    expect(historyCanGoBack(window)).toBe(false);
    window.history.replaceState({ idx: '1' }, '', '#/login');
    expect(historyCanGoBack(window)).toBe(false);
  });
});

describe('findOpenOverlay / dismissOpenOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds the KDS 86 drawer (role=dialog + aria-modal) and closes it', () => {
    document.body.innerHTML = `
      <div role="dialog" aria-modal="true" aria-label="86 quick toggle drawer">
        <button aria-label="Close 86 drawer">x</button>
      </div>`;
    const overlay = findOpenOverlay(document);
    expect(overlay).not.toBeNull();

    const click = vi.spyOn(overlay!.querySelector('button') as HTMLElement, 'click');
    dismissOpenOverlay(window, overlay!);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('falls back to Escape when the modal has no close button', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    const escape = vi.fn();
    window.addEventListener('keydown', escape, { once: true });
    dismissOpenOverlay(window, findOpenOverlay(document)!);
    expect((escape.mock.calls[0][0] as KeyboardEvent).key).toBe('Escape');
  });

  it('lets a modal intercept the hardware-back event', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    const overlay = findOpenOverlay(document)!;
    const escape = vi.fn();
    window.addEventListener('keydown', escape, { once: true });
    overlay.addEventListener('burg:hardware-back', (event) => event.preventDefault(), {
      once: true,
    });
    dismissOpenOverlay(window, overlay);
    expect(escape).not.toHaveBeenCalled();
  });

  it('ignores hidden and aria-hidden layers', () => {
    document.body.innerHTML = `
      <div role="dialog" aria-modal="true" aria-hidden="true"></div>
      <div role="dialog" aria-modal="true" hidden></div>`;
    expect(findOpenOverlay(document)).toBeNull();
  });
});

describe('initHardwareBackButton — the registered listener', () => {
  type Listener = (event: { canGoBack: boolean }) => void;
  let registered: Listener | null;
  let exitApp: ReturnType<typeof vi.fn>;
  let back: ReturnType<typeof vi.fn>;
  let arm: ReturnType<typeof vi.fn>;

  const app: AppPluginLike = {
    addListener: (_event, listener) => {
      registered = listener as Listener;
      return Promise.resolve({ remove: () => undefined });
    },
    exitApp: () => exitApp(),
  };

  beforeEach(() => {
    native.platform = 'android';
    registered = null;
    exitApp = vi.fn();
    back = vi.fn();
    arm = vi.fn();
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '#/login');
  });

  const press = (canGoBack: boolean) => registered?.({ canGoBack });

  it('is a no-op in a browser', () => {
    native.platform = 'web';
    initHardwareBackButton({ app, history: { back }, onArmExit: arm });
    expect(registered).toBeNull();
  });

  it('is a no-op on iOS', () => {
    native.platform = 'ios';
    initHardwareBackButton({ app, history: { back }, onArmExit: arm });
    expect(registered).toBeNull();
  });

  it('navigates back from an inner screen', () => {
    initHardwareBackButton({ app, history: { back }, onArmExit: arm });
    window.history.replaceState({}, '', '#/orders');
    press(true);
    expect(back).toHaveBeenCalledTimes(1);
    expect(exitApp).not.toHaveBeenCalled();
    expect(arm).not.toHaveBeenCalled();
  });

  it('arms exit on login, then exits on the second press', () => {
    initHardwareBackButton({ app, history: { back }, onArmExit: arm });
    press(false);
    expect(arm).toHaveBeenCalledTimes(1);
    expect(exitApp).not.toHaveBeenCalled();

    press(false);
    expect(exitApp).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });

  it('never exits while a modal is open — it dismisses the modal', () => {
    initHardwareBackButton({ app, history: { back }, onArmExit: arm });
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    press(false);
    press(false);
    expect(exitApp).not.toHaveBeenCalled();
    expect(findOpenOverlay(document)).not.toBeNull();
  });

  it('survives a shell where addListener throws', () => {
    const throwing: AppPluginLike = {
      addListener: () => {
        throw new Error('App plugin not synced');
      },
    };
    expect(() =>
      initHardwareBackButton({ app: throwing, history: { back }, onArmExit: arm }),
    ).not.toThrow();
  });
});
