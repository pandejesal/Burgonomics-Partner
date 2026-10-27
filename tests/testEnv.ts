/**
 * Single source of truth for the synthetic Firebase configuration used by the
 * partner unit-test lane.
 *
 * Contract:
 * - Every value is a non-secret placeholder. Nothing here is read from the
 *   developer's shell, `.env*`, or a secret store.
 * - `demo-` project ids keep the Firebase SDK on its non-production path, so
 *   SDK construction performs no backend provisioning.
 * - `vitest.config.ts` (`test.env`), `vitest.setup.ts` (process.env and
 *   import.meta.env) and the integrity tests all consume this module. There is
 *   exactly one place to change a value; no duplicate literal blocks.
 */

export const SYNTHETIC_TEST_ENV = Object.freeze({
  VITE_FIREBASE_API_KEY: 'AIzaSyFakeDemoKeyForHermeticUnitTesting',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-burgonomics-partner.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-burgonomics-partner',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-burgonomics-partner.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789012',
  VITE_FIREBASE_APP_ID: '1:123456789012:web:demo123456789012',
  // The two keys that choose an absolute network destination. Both consumers
  // (src/services/partnerFunctionsApi.ts, src/core/integrations/petpooja/
  // httpGateway.ts) read them BEFORE the project-id fallback, so an ambient
  // developer .env would otherwise target the live production API. Reserved
  // .invalid hosts fail without any resolver query.
  VITE_FUNCTIONS_API_URL: 'https://functions.invalid/api',
  VITE_PETPOOJA_PROXY_URL: 'https://petpooja.invalid/api',
  VITE_FCM_ENABLED: 'false',
  VITE_FCM_VAPID_KEY: '',
  VITE_RECAPTCHA_SITE_KEY: '',
} as const);

export type SyntheticEnvKey = keyof typeof SYNTHETIC_TEST_ENV;

export const SYNTHETIC_ENV_KEYS = Object.keys(SYNTHETIC_TEST_ENV) as readonly SyntheticEnvKey[];

/** The keys that select a network destination, pinned away from production. */
export const DESTINATION_ENV_KEYS = [
  'VITE_FUNCTIONS_API_URL',
  'VITE_PETPOOJA_PROXY_URL',
] as const satisfies readonly SyntheticEnvKey[];

/**
 * Minimal writable env bag. `process.env` and Vite's `import.meta.env` both
 * satisfy it. Kept as a parameter (rather than reading a module-global) so this
 * file has no `import.meta`/`process` dependency and can be imported by the
 * Vitest config as well as by the worker setup.
 */
export interface WritableEnv {
  [key: string]: unknown;
}

export interface ApplySyntheticEnvOptions {
  /**
   * Which `import.meta.env` branch the test lane should expose. Default `true`
   * (the unit lane's historical DEV fixtures path). Pass `false` to drive the
   * production branch (DEV=false, PROD=true) in a test.
   */
  dev?: boolean;
}

/**
 * Apply the synthetic environment unconditionally: ambient values with the
 * same names are replaced, not preserved. Test lane only — this is called from
 * `vitest.setup.ts` and from the boundary tests, never from `src/`.
 *
 * `importMetaEnv` is optional because Vitest substitutes `import.meta.env`
 * per module graph; the caller passes the live bag so the values the app reads
 * at module-evaluation time are the synthetic ones.
 */
export const applySyntheticTestEnv = (
  processEnv: WritableEnv,
  importMetaEnv?: WritableEnv | null,
  options?: ApplySyntheticEnvOptions,
): void => {
  for (const key of SYNTHETIC_ENV_KEYS) {
    const value = SYNTHETIC_TEST_ENV[key];
    processEnv[key] = value;
    if (importMetaEnv) importMetaEnv[key] = value;
  }
  if (importMetaEnv) {
    const dev = options?.dev ?? true;
    // Keep the booleans booleans; assigning the strings 'false'/'true' would
    // make `if (import.meta.env.PROD)` truthy.
    importMetaEnv.DEV = dev;
    importMetaEnv.PROD = !dev;
  }
};
