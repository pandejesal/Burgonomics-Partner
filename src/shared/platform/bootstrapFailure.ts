/**
 * Pure boot-sequence orchestrator for the entry point.
 *
 * Order contract (device-startup fix 2026-10-23, Samsung SM-S921B incident):
 *   1. Something user-visible mounts FIRST — the real app, or a
 *      dependency-free failure screen.
 *   2. Only then is the native splash hidden, so the shell never sits on an
 *      indefinite splash over a boot that already failed (static module-eval
 *      throws, rejected dynamic imports, synchronous render throws).
 *   3. If the splash hide itself rejects, whatever is mounted stays mounted —
 *      no unmount, no re-mount, no crash.
 *
 * Pure function: every DOM/native side effect is injected as a callback, so
 * it runs in a plain node Vitest environment with fake render/hide spies.
 * `mountFailureScreen` is supplied by main.tsx and must never (transitively)
 * import the Firebase chain — it renders precisely when those modules throw.
 */

/** What ended up on screen when the boot sequence finished. */
export type BootOutcome = 'app-mounted' | 'failure-screen-mounted';

export interface BootSequenceCallbacks {
  /** Mount the real application. May throw synchronously or reject (dynamic imports). */
  mountApp: () => void | Promise<void>;
  /** Render the dependency-free failure screen. A throw here is logged, never propagated. */
  mountFailureScreen: (error: unknown) => void;
  /**
   * Hide the native splash / init the shell (native only). Undefined on
   * browser — there is nothing to hide and the no-op shell init must not run.
   * A rejection leaves the already-mounted screen in place.
   */
  hideNativeSplash?: () => void | Promise<void>;
}

export async function startBoot(callbacks: BootSequenceCallbacks): Promise<BootOutcome> {
  let outcome: BootOutcome;
  try {
    await callbacks.mountApp();
    outcome = 'app-mounted';
  } catch (error) {
    try {
      callbacks.mountFailureScreen(error);
    } catch (rendererError) {
      // Even the failure renderer is broken (e.g. #root missing AND React
      // unusable). Log for adb logcat visibility; never mask the original
      // boot error and never propagate — splash hide still proceeds.
      console.error(
        '[boot] failure screen could not mount:',
        rendererError,
        '— original boot error:',
        error,
      );
    }
    outcome = 'failure-screen-mounted';
  }

  try {
    await callbacks.hideNativeSplash?.();
  } catch (hideError) {
    // Splash plugin unavailable or rejected (older shell, missing sync).
    // Do NOT unmount or remount: the visible screen (app or failure screen)
    // stays exactly as mounted.
    console.error('[boot] splash hide rejected — screen left as mounted:', hideError);
  }

  return outcome;
}
