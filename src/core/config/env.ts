export type AppEnvironment = "development" | "staging" | "production";

const readEnv = (key: string, fallback = ""): string => {
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return meta?.[key] ?? fallback;
};

const ENV_NAME = (readEnv("VITE_APP_ENV", "development") as AppEnvironment) || "development";

export interface AppConfig {
  env: AppEnvironment;
  appName: string;
  appVersion: string;
  api: {
    baseUrl: string;
    timeoutMs: number;
    retry: { attempts: number; backoffMs: number };
  };
  featureFlags: {
    offlineMode: boolean;
    orderTracking: boolean;
    referrals: boolean;
    adminOps: boolean;
  };
  analytics: {
    enabled: boolean;
    writeKey: string;
  };
  push: {
    enabled: boolean;
    vapidPublicKey: string;
  };
  integrations: {
    razorpayKeyId: string;
    paymentsApiBaseUrl: string;
    petpoojaEnabled: boolean;
    mapsApiKey: string;
    firebaseConfig: string;
  };
}

export const appConfig: AppConfig = {
  env: ENV_NAME,
  appName: readEnv("VITE_APP_NAME", "Burgonomics Partner"),
  appVersion: readEnv("VITE_APP_VERSION", "1.0.0"),
  api: {
    baseUrl: readEnv("VITE_API_BASE", "https://burgonomics.netlify.app"),
    timeoutMs: Number(readEnv("VITE_API_TIMEOUT_MS", "15000")),
    retry: { attempts: 2, backoffMs: 500 },
  },
  featureFlags: {
    offlineMode: readEnv("VITE_FF_OFFLINE_MODE", "false") === "true",
    orderTracking: true,
    referrals: false,
    adminOps: true,
  },
  analytics: {
    enabled: false,
    writeKey: readEnv("VITE_ANALYTICS_WRITE_KEY", ""),
  },
  push: {
    enabled: true,
    vapidPublicKey: readEnv("VITE_FCM_VAPID_KEY", ""),
  },
  integrations: {
    razorpayKeyId: readEnv("VITE_RAZORPAY_KEY_ID", ""),
    paymentsApiBaseUrl: readEnv("VITE_API_BASE", "https://burgonomics.netlify.app"),
    petpoojaEnabled: readEnv("VITE_PETPOOJA_ENABLED", "false") === "true",
    mapsApiKey: readEnv("VITE_MAPS_API_KEY", ""),
    firebaseConfig: "",
  },
};

export const isDev = (): boolean => appConfig.env === "development" || import.meta.env.DEV;
export const isProd = (): boolean => appConfig.env === "production" && !import.meta.env.DEV;
