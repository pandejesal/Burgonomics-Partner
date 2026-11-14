import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.burgonomics.partner',
  appName: 'Burgonomics Partner',
  webDir: 'dist',
  // `bundledWebRuntime` was dropped from the Capacitor config schema in v4 and
  // is ignored by the v8 CLI. It survived only because this file never entered
  // a `tsc` program; the system-bar test imports it, which surfaced the error.
  // Removing dead config only — the Vite bundle is still copied into `dist`.
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    // process.env is not the runtime env in a Vite bundle — the old
    // `!== 'production'` check silently left remote WebView debugging ON in
    // shipped builds. Default OFF; flip locally only for a debug session.
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: true,
    // Defence in depth: without this, Capacitor enables the Web Inspector when
    // DEBUG is set or via the SPM CAPACITOR_DEBUG fallback, so inspection is
    // left to a build-time default. Explicit false removes that implicit path.
    // It is not evidence that any existing Release build was inspectable.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      // Manual hide from nativeBootstrap (after first render): auto-hide on
      // a fixed timer races slow-device bundle load (white flash/cut splash).
      launchAutoHide: false,
      backgroundColor: '#0E4825',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    // Modern shells (targetSdk 36) render the bar through core SystemBars.
    // `DARK` here means LIGHT content on a dark background — the icon colour
    // this deep-green header needs. Leaving it unset let the plugin default
    // ('DEFAULT', device-appearance driven) override the intent.
    SystemBars: {
      style: 'DARK',
      hidden: false,
    },
    // Legacy surface for older shells and iOS. `Style.Dark` is the same
    // "light text for dark backgrounds" value; `LIGHT` asked for dark icons
    // on a #0E4825 bar.
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0E4825',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
