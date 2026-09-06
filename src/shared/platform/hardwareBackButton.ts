import { Capacitor } from '@capacitor/core';

/**
 * Android hardware back button → router-back when history allows, else
 * minimize (never kill the app from a nested route). Native-only no-op on
 * web. Registered once from main.tsx.
 */
export function initHardwareBackButton(): void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  void import('@capacitor/app')
    .then(({ App }) => {
      void App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack && window.history.length > 1) {
          window.history.back();
        } else {
          void App.minimizeApp().catch(() => undefined);
        }
      });
    })
    .catch(() => undefined);
}
