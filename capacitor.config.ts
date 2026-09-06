import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.glassdoorsstudio.burgonomics.partner',
  appName: 'Burgonomics Partner',
  webDir: 'dist',
  bundledWebRuntime: false,
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
    StatusBar: {
      style: 'LIGHT',
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
    Geolocation: {
      permissions: ['location'],
    },
  },
};

export default config;
