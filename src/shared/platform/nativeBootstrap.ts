import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { logger } from '@/core/logging/logger';

/**
 * Native shell bootstrap (splash + system bars). The config declares these
 * plugins but nothing ever drove them at runtime: splash auto-hid on a fixed
 * timer and the status bar never got its brand colour. Called once from main.tsx.
 *
 * System-bar semantics (both installed Capacitor 8.5.2 surfaces agree):
 * `@capacitor/status-bar` `Style.Dark` and core `SystemBarsStyle.Dark` both mean
 * LIGHT icon/text content on a DARK background. Modern Android (targetSdk 36)
 * renders the bar through core `SystemBars`, whose unconfigured default can
 * override the legacy plugin, so both are driven here explicitly.
 *
 * Each optional module is imported and applied in its own guard: a shell
 * without one of them must not skip the rest, and in particular must never
 * strand the splash screen.
 */
const SPLASH_FADE_OUT_MS = 200;

/**
 * Console chrome (EMULATOR audit 2026-11-26: the status bar rendered near-white
 * with light-content icons, so the clock/battery were invisible).
 *
 * The Partner console is dark in every appearance — there is no light theme in
 * src/index.css and the Header paints `--color-bg` (#0A0A0A) — so the bar is a
 * constant. `style: 'DARK'` means light icons, correct on near-black.
 *
 * `backgroundColor` must equal `statusBarColor` in
 * android/app/src/main/res/values/colors.xml; nativeBootstrap.system-bars.test.ts
 * reads that file, so the native first frame (painted before JS runs) and this
 * runtime value cannot drift.
 */
export const STATUS_BAR_CHROME = Object.freeze({
  backgroundColor: '#0A0A0A',
  style: 'DARK' as const,
});

/** Light system-bar content on the dark console (core surface). */
async function applySystemBarStyle(): Promise<void> {
  // `SystemBars` ships inside @capacitor/core, which this module already
  // imports statically — a second dynamic import would only add an
  // ineffective-chunk warning.
  try {
    await SystemBars.setStyle({ style: SystemBarsStyle.Dark });
  } catch (error) {
    // Core plugin unregistered on this shell — legacy StatusBar still applies.
    logger.warn('native.systemBarsFailed', error);
  }
}

/** Legacy surface for older shells and iOS, plus the Android-only bar chrome. */
async function applyLegacyStatusBarStyle(platform: string): Promise<void> {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    if (platform === 'android') {
      await StatusBar.setBackgroundColor({ color: STATUS_BAR_CHROME.backgroundColor });
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch (error) {
    // StatusBar unavailable — web fallback styling already applies.
    logger.warn('native.statusBarFailed', error);
  }
}

/**
 * Re-asserts the bar after a resume. An operator switching the tablet between
 * light and dark system UI used to come back to a bar recoloured by the OS;
 * this re-applies the console chrome without touching the page.
 */
function watchSystemBars(): () => void {
  try {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void applySystemBarStyle();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  } catch {
    return () => undefined;
  }
}

/** Release the splash once the app has mounted. */
async function hideSplash(): Promise<void> {
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: SPLASH_FADE_OUT_MS });
  } catch (error) {
    // Missing plugin or already hidden (older shell) — nothing to do.
    logger.warn('native.splashHideFailed', error);
  }
}

export async function initNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const platform = Capacitor.getPlatform();
  // Style the bars before releasing the splash so the first frame the user
  // sees already has readable icons.
  await applySystemBarStyle();
  await applyLegacyStatusBarStyle(platform);
  watchSystemBars();
  await hideSplash();
}
