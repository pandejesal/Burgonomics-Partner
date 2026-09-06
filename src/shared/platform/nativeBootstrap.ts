import { Capacitor } from '@capacitor/core';

/**
 * Native shell bootstrap (splash + status bar). The config declares these
 * plugins but nothing ever drove them at runtime: splash auto-hid on a fixed
 * timer and the status bar never got its brand color. Called once from main.tsx.
 */
export async function initNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const [{ SplashScreen }, { StatusBar, Style }] = await Promise.all([
      import('@capacitor/splash-screen').catch(() => null) as Promise<any>,
      import('@capacitor/status-bar').catch(() => null) as Promise<any>,
    ]);
    if (StatusBar) {
      try {
        await StatusBar.setStyle({ style: Style.Light });
        if (Capacitor.getPlatform() === 'android') {
          await StatusBar.setBackgroundColor({ color: '#0E4825' });
          await StatusBar.setOverlaysWebView({ overlay: false });
        }
      } catch {
        // StatusBar unavailable — web fallback styling already applies.
      }
    }
    if (SplashScreen) {
      try {
        await SplashScreen.hide({ fadeOutDuration: 200 });
      } catch {
        // Already hidden (older shell) — nothing to do.
      }
    }
  } catch {
    // Native bridge unavailable — safe no-op on web.
  }
}
