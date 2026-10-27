/**
 * Hermetic Unit Test Setup for the Partner App
 *
 * Runs once per test file, before the test module graph is imported.
 *
 * 1. Applies the synthetic, non-secret Firebase environment from the single
 *    source (`tests/testEnv.ts`) unconditionally to `process.env` and
 *    `import.meta.env`. Ambient shell/`.env` values never win.
 * 2. Installs the hermetic network guard (`tests/hermeticNetworkGuard.ts`) once
 *    per file, so `fetch`, `http(s).request`, `http(s).get` and `http2.connect`
 *    fail loudly before DNS/TCP when code under test would touch a live
 *    Firebase/Google backend. The guard is restored in `afterAll`.
 *
 * Nothing here mocks the Firebase SDK or Firestore. Per-test `vi.mock` calls in
 * individual suites keep working and remain the only source of fake data.
 */

import { afterAll } from 'vitest';
import {
  installHermeticNetworkGuard,
  restoreHermeticNetworkGuard,
} from './tests/hermeticNetworkGuard';
import { applySyntheticTestEnv } from './tests/testEnv';

process.env.VITEST = 'true';
process.env.NODE_ENV = 'test';

applySyntheticTestEnv(process.env, import.meta.env);

installHermeticNetworkGuard();

afterAll(() => {
  restoreHermeticNetworkGuard();
});
