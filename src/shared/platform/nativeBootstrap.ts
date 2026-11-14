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
const BRAND_BAR_COLOR = '#0E4825';
const SPLASH_FADE_OUT_MS = 200;

/** Light system-bar content on the dark-green header (core surface). */
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
      await StatusBar.setBackgroundColor({ color: BRAND_BAR_COLOR });
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch (error) {
    // StatusBar unavailable — web fallback styling already applies.
    logger.warn('native.statusBarFailed', error);
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
  await hideSplash();
}
