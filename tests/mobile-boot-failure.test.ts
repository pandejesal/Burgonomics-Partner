import { afterEach, describe, expect, it, vi } from 'vitest';
import { startBoot } from '@/shared/platform/bootstrapFailure';
import type { BootSequenceCallbacks } from '@/shared/platform/bootstrapFailure';

// Boot-order contract for the native shell (device-startup fix 2026-10-23):
// SOMETHING user-visible must mount BEFORE the native splash is hidden, and
// a failed boot must end on a rendered failure screen — never a frozen splash.
// All DOM/native side effects are injected as callbacks, so this suite runs
// in this package's plain node Vitest environment (no jsdom needed).

afterEach(() => {
  vi.restoreAllMocks();
});

describe('startBoot mount-before-hide contract', () => {
  it('healthy boot: app mounts once, splash hides once, failure screen untouched', async () => {
    const order: string[] = [];
    const callbacks: BootSequenceCallbacks = {
      mountApp: vi.fn(() => { order.push('mount-app'); }),
      mountFailureScreen: vi.fn(() => { order.push('failure-screen'); }),
      hideNativeSplash: vi.fn(() => { order.push('hide-splash'); }),
    };

    const outcome = await startBoot(callbacks);

    expect(outcome).toBe('app-mounted');
    expect(order).toEqual(['mount-app', 'hide-splash']);
    expect(callbacks.mountApp).toHaveBeenCalledTimes(1);
    expect(callbacks.hideNativeSplash).toHaveBeenCalledTimes(1);
    expect(callbacks.mountFailureScreen).not.toHaveBeenCalled();
  });

  it('browser: no native splash passed, nothing to hide, boot still completes', async () => {
    const mountApp = vi.fn();
    const mountFailureScreen = vi.fn();

    const outcome = await startBoot({ mountApp, mountFailureScreen });

    expect(outcome).toBe('app-mounted');
    expect(mountApp).toHaveBeenCalledTimes(1);
    expect(mountFailureScreen).not.toHaveBeenCalled();
  });

  it('synchronous boot throw: failure screen mounts with the error BEFORE splash hide', async () => {
    const bootError = new Error('render exploded synchronously');
    const order: string[] = [];
    const mountFailureScreen = vi.fn(() => { order.push('failure-screen'); });
    const hideNativeSplash = vi.fn(() => { order.push('hide-splash'); });

    const outcome = await startBoot({
      mountApp: vi.fn(() => { order.push('mount-app'); throw bootError; }),
      mountFailureScreen,
      hideNativeSplash,
    });

    expect(outcome).toBe('failure-screen-mounted');
    expect(mountFailureScreen).toHaveBeenCalledTimes(1);
    expect(mountFailureScreen).toHaveBeenCalledWith(bootError);
    expect(order).toEqual(['mount-app', 'failure-screen', 'hide-splash']);
  });

  it('rejected dynamic import: failure screen mounts with the rejection BEFORE splash hide', async () => {
    const importError = new Error('Failed to fetch dynamically imported module: ./App');
    const order: string[] = [];
    const mountFailureScreen = vi.fn(() => { order.push('failure-screen'); });
    const hideNativeSplash = vi.fn(() => { order.push('hide-splash'); });

    const outcome = await startBoot({
      mountApp: vi.fn(() => Promise.reject(importError)),
      mountFailureScreen,
      hideNativeSplash,
    });

    expect(outcome).toBe('failure-screen-mounted');
    expect(mountFailureScreen).toHaveBeenCalledTimes(1);
    expect(mountFailureScreen).toHaveBeenCalledWith(importError);
    expect(order).toEqual(['failure-screen', 'hide-splash']);
  });

  it('splash hide rejection on app path: mounted app stays, nothing re-mounted', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mountFailureScreen = vi.fn();
    let hideCalls = 0;

    const outcome = await startBoot({
      mountApp: vi.fn(),
      mountFailureScreen,
      hideNativeSplash: () => { hideCalls += 1; return Promise.reject(new Error('SplashScreen plugin missing')); },
    });

    expect(outcome).toBe('app-mounted');
    expect(hideCalls).toBe(1);
    expect(mountFailureScreen).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });

  it('splash hide rejection on failure path: failure screen stays mounted exactly once', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mountFailureScreen = vi.fn();
    let hideCalls = 0;

    const outcome = await startBoot({
      mountApp: vi.fn(() => { throw new Error('FirebaseError: auth/invalid-api-key'); }),
      mountFailureScreen,
      hideNativeSplash: () => { hideCalls += 1; return Promise.reject(new Error('splash plugin dead')); },
    });

    expect(outcome).toBe('failure-screen-mounted');
    expect(mountFailureScreen).toHaveBeenCalledTimes(1);
    expect(hideCalls).toBe(1);
    expect(consoleError).toHaveBeenCalled();
  });

  it('even a broken failure renderer cannot crash the boot sequence or skip splash hide', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mountFailureScreen = vi.fn(() => { throw new Error('failure renderer broken'); });
    const hideNativeSplash = vi.fn();

    const outcome = await startBoot({
      mountApp: vi.fn(() => { throw new Error('root cause: module-eval throw'); }),
      mountFailureScreen,
      hideNativeSplash,
    });

    expect(outcome).toBe('failure-screen-mounted');
    expect(hideNativeSplash).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
  });
});
