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
      // EMULATOR audit 2026-11-26: the full-screen/immersive splash hid the
      // system bars, and the activity came back with a dead band at the top.
      // The splash now sits under the normal bars, whose launch-theme colours
      // (android/app/src/main/res/values/styles.xml) keep the icons visible.
      splashFullScreen: false,
      splashImmersive: false,
    },
    // Modern shells (targetSdk 36) render the bar through core SystemBars.
    // `DARK` here means LIGHT content on a dark background, i.e. exactly what
    // the #0A0A0A console canvas needs. Change this and StatusBar together —
    // native res/values{-night}/colors.xml carries the very first frame.
    SystemBars: {
      style: 'DARK',
      hidden: false,
      // Explicit at the plugin's own default: native inset padding plus the
      // --safe-area-inset-* CSS variables. Never `disable`.
      insetsHandling: 'css',
    },
    // `Style.Dark` here means "light content on a dark background", which is
    // correct only if the bar itself is dark. Must equal STATUS_BAR_CHROME
    // backgroundColor in src/shared/platform/nativeBootstrap.ts and
    // statusBarColor in res/values{-night}/colors.xml (both asserted in tests).
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A0A0A',
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
