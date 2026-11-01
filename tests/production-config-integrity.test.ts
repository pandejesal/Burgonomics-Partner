/**
 * Production Firebase config & hermetic test boundary integrity.
 *
 * Portable by design: everything here is derived from files in the working tree
 * or from the running module graph. No git history, no specific commit sha, no
 * network, so the suite behaves identically in a shallow clone, an exported
 * tarball or a Docker build context.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { app } from '@/config/firebase';
import { HttpPetpoojaGateway } from '@/core/integrations/petpooja/httpGateway';
import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';
import {
  DESTINATION_ENV_KEYS,
  SYNTHETIC_ENV_KEYS,
  SYNTHETIC_TEST_ENV,
  applySyntheticTestEnv,
} from './testEnv';

const readRepoFile = (relativePath: string): string =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const FIREBASE_CONFIG_SOURCE = readRepoFile('src/config/firebase.ts');
const VITEST_CONFIG_SOURCE = readRepoFile('vitest.config.ts');
const VITEST_SETUP_SOURCE = readRepoFile('vitest.setup.ts');

const FIREBASE_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

// The production destinations documented in `.env.example` (public, no secret).
// Used only as a synthetic "dangerous ambient value" to prove the override.
const DANGEROUS_DESTINATIONS: Record<(typeof DESTINATION_ENV_KEYS)[number], string> = {
  VITE_FUNCTIONS_API_URL: 'https://asia-south1-burgonomics-7faa8.cloudfunctions.net/api',
  VITE_PETPOOJA_PROXY_URL: 'https://asia-south1-burgonomics-7faa8.cloudfunctions.net/api',
};

/**
 * Put the documented live destinations into both env bags, then apply the
 * harness. Returns a restore function. Every caller must restore in `finally`.
 */
const installDangerousAmbientThenHarness = (): (() => void) => {
  const saved = DESTINATION_ENV_KEYS.map((key) => ({
    key,
    processValue: process.env[key],
    metaValue: import.meta.env[key] as string | undefined,
  }));
  for (const key of DESTINATION_ENV_KEYS) {
    process.env[key] = DANGEROUS_DESTINATIONS[key];
    import.meta.env[key] = DANGEROUS_DESTINATIONS[key];
  }
  applySyntheticTestEnv(process.env, import.meta.env);
  return () => {
    for (const entry of saved) {
      process.env[entry.key] = entry.processValue;
      import.meta.env[entry.key] = entry.metaValue;
    }
  };
};

/** Code references only (comments are not evidence either way). */
const readConsumerEnvKeys = (relativePath: string): string[] => {
  const source = readRepoFile(relativePath);
  return [
    ...new Set(
      [...source.matchAll(/(?:import\.meta\.env|env)\.(VITE_[A-Z0-9_]+)/g)].map(
        (match) => match[1],
      ),
    ),
  ];
};

describe('Production Firebase config & hermetic test boundary integrity', () => {
  it('production config reads only VITE_ keys supplied by the single synthetic source', () => {
    const referenced = [
      ...FIREBASE_CONFIG_SOURCE.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g),
    ].map((match) => match[1]);
    const uniqueReferenced = [...new Set(referenced)];

    expect(uniqueReferenced.length).toBeGreaterThan(0);
    for (const key of uniqueReferenced) {
      expect(SYNTHETIC_ENV_KEYS).toContain(key);
    }
    for (const key of FIREBASE_ENV_KEYS) {
      expect(uniqueReferenced).toContain(key);
    }
  });

  it('production config embeds no credentials, no live project id and no endpoint', () => {
    expect(FIREBASE_CONFIG_SOURCE).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
    expect(FIREBASE_CONFIG_SOURCE).not.toMatch(/https?:\/\//);
    expect(FIREBASE_CONFIG_SOURCE).not.toMatch(/burgonomics-7faa8/);
    expect(FIREBASE_CONFIG_SOURCE).not.toMatch(/demo-burgonomics-partner/);
  });

  it('the production config module initialises from the synthetic env at runtime', () => {
    // This is the behavioural replacement for the old git-diff freeze: if a real
    // ambient value ever reached the app graph, these assertions fail.
    expect(app.options.projectId).toBe(SYNTHETIC_TEST_ENV.VITE_FIREBASE_PROJECT_ID);
    expect(app.options.apiKey).toBe(SYNTHETIC_TEST_ENV.VITE_FIREBASE_API_KEY);
    expect(app.options.authDomain).toBe(SYNTHETIC_TEST_ENV.VITE_FIREBASE_AUTH_DOMAIN);
    expect(app.options.projectId).toMatch(/^demo-/);
  });

  it('setup applied the single source and starts the unit lane in the DEV (non-production) branch', () => {
    // DEV=true is the historical fixture path and explains why some suites see
    // demo rows. It is NOT evidence that the production branch is honest; that
    // is covered by tests/prod-branch-honesty.test.ts with DEV=false/PROD=true.
    expect(process.env.VITE_FIREBASE_PROJECT_ID).toBe(
      SYNTHETIC_TEST_ENV.VITE_FIREBASE_PROJECT_ID,
    );
    expect(process.env.VITE_FIREBASE_API_KEY).toBe(SYNTHETIC_TEST_ENV.VITE_FIREBASE_API_KEY);
    expect(process.env.VITE_FCM_ENABLED).toBe('false');
    for (const key of DESTINATION_ENV_KEYS) {
      expect(process.env[key]).toBe(SYNTHETIC_TEST_ENV[key]);
    }
    expect(import.meta.env.VITE_FIREBASE_PROJECT_ID).toBe(
      SYNTHETIC_TEST_ENV.VITE_FIREBASE_PROJECT_ID,
    );
    expect(import.meta.env.PROD).toBe(false);
    expect(import.meta.env.DEV).toBe(true);
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('synthetic env replaces ambient values unconditionally in both env bags', () => {
    const processBackup = {
      VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID,
      VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY,
    };
    const importMetaBackup = {
      VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
      VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
    };
    const ambientProject = 'ambient-project-must-be-replaced';
    const ambientKey = 'ambient-api-key-must-be-replaced';
    try {
      process.env.VITE_FIREBASE_PROJECT_ID = ambientProject;
      process.env.VITE_FIREBASE_API_KEY = ambientKey;
      import.meta.env.VITE_FIREBASE_PROJECT_ID = ambientProject;
      import.meta.env.VITE_FIREBASE_API_KEY = ambientKey;

      applySyntheticTestEnv(process.env, import.meta.env);

      expect(process.env.VITE_FIREBASE_PROJECT_ID).toBe(
        SYNTHETIC_TEST_ENV.VITE_FIREBASE_PROJECT_ID,
      );
      expect(process.env.VITE_FIREBASE_API_KEY).toBe(
        SYNTHETIC_TEST_ENV.VITE_FIREBASE_API_KEY,
      );
      expect(import.meta.env.VITE_FIREBASE_PROJECT_ID).toBe(
        SYNTHETIC_TEST_ENV.VITE_FIREBASE_PROJECT_ID,
      );
      expect(import.meta.env.VITE_FIREBASE_API_KEY).toBe(
        SYNTHETIC_TEST_ENV.VITE_FIREBASE_API_KEY,
      );
    } finally {
      process.env.VITE_FIREBASE_PROJECT_ID = processBackup.VITE_FIREBASE_PROJECT_ID;
      process.env.VITE_FIREBASE_API_KEY = processBackup.VITE_FIREBASE_API_KEY;
      import.meta.env.VITE_FIREBASE_PROJECT_ID = importMetaBackup.VITE_FIREBASE_PROJECT_ID;
      import.meta.env.VITE_FIREBASE_API_KEY = importMetaBackup.VITE_FIREBASE_API_KEY;
    }
  });

  it('vitest config consumes the synthetic constants instead of duplicating literals', () => {
    expect(VITEST_CONFIG_SOURCE).toContain("from './tests/testEnv.ts'");
    expect(VITEST_CONFIG_SOURCE).toContain('...SYNTHETIC_TEST_ENV');
    expect(VITEST_CONFIG_SOURCE).not.toContain('AIzaSyFakeDemoKeyForHermeticUnitTesting');
    expect(VITEST_CONFIG_SOURCE).not.toContain('demo-burgonomics-partner');
  });

  it('pins both destination-selecting VITE keys to reserved .invalid hosts, overriding ambient values', () => {
    const restoreEnv = installDangerousAmbientThenHarness();
    try {
      for (const key of DESTINATION_ENV_KEYS) {
        const synthetic = SYNTHETIC_TEST_ENV[key];
        expect(synthetic).toMatch(/\.invalid(\/|$)/);
        expect(process.env[key]).toBe(synthetic);
        expect(import.meta.env[key]).toBe(synthetic);
      }
      expect(process.env.VITE_FUNCTIONS_API_URL).toBe('https://functions.invalid/api');
      expect(process.env.VITE_PETPOOJA_PROXY_URL).toBe('https://petpooja.invalid/api');
    } finally {
      restoreEnv();
    }
  });

  it('partnerFunctionsApi.checkApiHealth targets the synthetic base, not the ambient live URL', async () => {
    const guardedFetch = globalThis.fetch;
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'healthy' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const restoreEnv = installDangerousAmbientThenHarness();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      await expect(partnerFunctionsApi.checkApiHealth()).resolves.toMatchObject({ ok: true });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect((fetchSpy.mock.calls[0] as unknown[])[0]).toBe(
        'https://functions.invalid/api/health',
      );
    } finally {
      globalThis.fetch = guardedFetch;
      restoreEnv();
    }
  });

  it('HttpPetpoojaGateway builds its base from the synthetic proxy URL, not the ambient live URL', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'healthy' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const restoreEnv = installDangerousAmbientThenHarness();
    try {
      const gateway = new HttpPetpoojaGateway({
        fetchImpl: fetchSpy as unknown as typeof fetch,
      });
      await gateway.getHealth();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect((fetchSpy.mock.calls[0] as unknown[])[0]).toBe(
        'https://petpooja.invalid/api/health',
      );
    } finally {
      restoreEnv();
    }
  });

  it('every VITE_ key read by the URL-building consumers exists in the synthetic source (completeness aid, not behaviour proof)', () => {
    const consumers = [
      'src/services/partnerFunctionsApi.ts',
      'src/core/integrations/petpooja/httpGateway.ts',
    ] as const;
    for (const relativePath of consumers) {
      const keys = readConsumerEnvKeys(relativePath);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(SYNTHETIC_ENV_KEYS).toContain(key);
      }
    }
    expect(readConsumerEnvKeys(consumers[0])).toContain('VITE_FUNCTIONS_API_URL');
    expect(readConsumerEnvKeys(consumers[1])).toContain('VITE_PETPOOJA_PROXY_URL');
    expect(readConsumerEnvKeys(consumers[1])).toContain('VITE_FUNCTIONS_API_URL');
  });

  it('the test lane wires the guard and never globally mocks the Firebase SDK', () => {
    expect(VITEST_SETUP_SOURCE).toContain("from './tests/hermeticNetworkGuard'");
    expect(VITEST_SETUP_SOURCE).toContain("from './tests/testEnv'");
    // A module-level mock of firebase/firestore (or any SDK) would hide real
    // behaviour from every suite. Only per-test mocks are allowed.
    expect(VITEST_SETUP_SOURCE).not.toMatch(/\bvi\.mock\s*\(/);
    expect(VITEST_SETUP_SOURCE).not.toMatch(/\bvi\.fn\s*\(/);
  });
});
