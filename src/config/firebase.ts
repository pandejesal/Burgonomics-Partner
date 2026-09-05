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

const fcmEnabled =
  import.meta.env.VITE_FCM_ENABLED === 'true' && !!import.meta.env.VITE_FCM_VAPID_KEY;

export const messaging: Messaging | null = fcmEnabled ? getMessaging(app) : null;

let appCheckInstance: import('firebase/app-check').AppCheck | null = null;
let appCheckInitStarted = false;

/**
 * Initializes Firebase App Check (reCAPTCHA v3, web only). No-ops on native
 * shells (Play Integrity needs a native plugin — documented gap), without a
 * site key, or when already initialized. Safe to call at boot.
 */
export async function initAppCheck(): Promise<void> {
  if (appCheckInitStarted || typeof window === 'undefined') return;
  appCheckInitStarted = true;
  try {
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
    if (!siteKey) return;
    if (typeof (window as any).Capacitor !== 'undefined') return;
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
  if (!appCheckInstance) return null;
  try {
    const { getToken } = await import('firebase/app-check');
    const res = await getToken(appCheckInstance, false);
    return res.token;
  } catch {
    return null;
  }
}



