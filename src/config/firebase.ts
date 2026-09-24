import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, type Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Storage discipline (same as core): Firebase Auth owns token persistence —
// NEVER copy ID/refresh tokens into secureStorage/localStorage. The
// secureStorage cache holds only server-validated random session ids with
// short TTLs; presence alone grants nothing.

const fcmEnabled =
  import.meta.env.VITE_FCM_ENABLED === 'true' && !!import.meta.env.VITE_FCM_VAPID_KEY;

export const messaging: Messaging | null = fcmEnabled ? getMessaging(app) : null;

let appCheckInstance: import('firebase/app-check').AppCheck | null = null;
let appCheckInitStarted = false;
let nativeAppCheckReady = false;

/**
 * Initializes Firebase App Check on every platform. Web uses reCAPTCHA v3
 * (needs VITE_RECAPTCHA_SITE_KEY). Native shells (Capacitor) use Play
 * Integrity on Android / App Attest on iOS via @capacitor-firebase/app-check
 * (needs `npx cap sync` after install + Firebase-console app registration —
 * see PRODUCTION_RUNBOOK). No-ops without a site key (web), when already
 * initialized, or when the native plugin is missing (graceful null tokens —
 * server runs monitor mode until enforced). Safe to call at boot.
 */
export async function initAppCheck(): Promise<void> {
  if (appCheckInitStarted || typeof window === 'undefined') return;
  appCheckInitStarted = true;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      try {
        const { FirebaseAppCheck } = await import('@capacitor-firebase/app-check');
        await FirebaseAppCheck.initialize();
        await FirebaseAppCheck.setTokenAutoRefreshEnabled({ enabled: true });
        nativeAppCheckReady = true;
      } catch {
        // Native plugin not synced/registered — tokens stay null until the
        // next `npx cap sync` + console enrollment. Never throws at boot.
      }
      return;
    }
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
    if (!siteKey) return;
    const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
    if (window.location.hostname === 'localhost') {
      (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    // Attestation unavailable — server runs monitor mode until enforced.
  }
}

/** Current App Check token for the X-Firebase-AppCheck header, or null when uninitialized. */
export async function getAppCheckToken(): Promise<string | null> {
  if (nativeAppCheckReady) {
    try {
      const { FirebaseAppCheck } = await import('@capacitor-firebase/app-check');
      const { token } = await FirebaseAppCheck.getToken({ forceRefresh: false });
      return token || null;
    } catch {
      return null;
    }
  }
  if (!appCheckInstance) return null;
  try {
    const { getToken } = await import('firebase/app-check');
    const res = await getToken(appCheckInstance, false);
    return res.token;
  } catch {
    return null;
  }
}



