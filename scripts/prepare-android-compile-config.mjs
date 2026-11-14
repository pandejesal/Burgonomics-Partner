// prepare-android-compile-config.mjs — synthetic configuration for the ordinary
// Android *compile* check only.
//
// Why this file exists
// --------------------
// The `android` CI job used to run `prepare-native-config.mjs android`, which
// fails closed without MOBILE_PRODUCTION_ENV. Neither app repository has that
// secret, so the job died before compiling anything. A compile check does not
// need a live backend, a registered Firebase app or any signing material — it
// needs a configuration the toolchain accepts as *shaped* correctly.
//
// What it writes
// --------------
//   .env, .env.staging                       public VITE_* values, staging mode
//   android/app/google-services.json         native registration for Gradle
//
// `.env.production` is never read or written. Values are functions of nothing
// but the context flags: no ambient secret, staging secret or production secret
// is consulted, so a workflow cannot accidentally promote a fixture by pointing
// it at real configuration.
//
// Hard limits
// -----------
// - Runs only when GITHUB_ACTIONS=true, RUNNER_OS=Linux and
//   CI_ANDROID_COMPILE_ONLY=true. Any other host, or a missing flag, throws.
// - Hosts use the reserved `.invalid` TLD (RFC 2606): not registrable, not
//   resolvable, so nothing built from this fixture can reach a real service.
// - The output is a non-distributable debug build. Never upload, install or ship
//   it, and never treat it as evidence of production readiness.
// - Release jobs must keep using prepare-native-config.mjs. This helper is not a
//   substitute for a production preflight and must never be wired into one.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const COMPILE_ONLY_FLAG = 'CI_ANDROID_COMPILE_ONLY';

/** Exact application id declared by android/app/build.gradle. */
export const PARTNER_PACKAGE = 'com.burgonomics.partner';

/** Exact `package.json` name of the partner app; the customer app is `burgonomics`. */
export const PARTNER_PACKAGE_JSON_NAME = 'burgonomics-partner';

const SYNTHETIC_PROJECT = 'partner-ci-compile';

// Firebase Android API keys are 39 characters beginning with `AIza`. The native
// SDK validates the shape at launch, so the fixture reproduces the shape while
// remaining obviously fake to a human reader.
const SYNTHETIC_API_KEY = `AIza${'X'.repeat(35)}`;
const SYNTHETIC_SENDER_ID = '100000000000';
const SYNTHETIC_APP_ID = `1:${SYNTHETIC_SENDER_ID}:android:0000000000000000`;

/**
 * The synthetic public configuration. Pure: derived from constants only.
 * @returns {Record<string, string>} VITE_* values, all strings
 */
export function compileFixtureEnv() {
  return {
    VITE_APP_ENV: 'staging',
    VITE_FIREBASE_API_KEY: SYNTHETIC_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: `${SYNTHETIC_PROJECT}.invalid`,
    VITE_FIREBASE_PROJECT_ID: SYNTHETIC_PROJECT,
    VITE_FIREBASE_STORAGE_BUCKET: `${SYNTHETIC_PROJECT}.invalid`,
    VITE_FIREBASE_MESSAGING_SENDER_ID: SYNTHETIC_SENDER_ID,
    VITE_FIREBASE_APP_ID: SYNTHETIC_APP_ID,
    VITE_API_BASE: `https://api.${SYNTHETIC_PROJECT}.invalid/api`,
    VITE_API_BASE_URL: `https://api.${SYNTHETIC_PROJECT}.invalid/api`,
    VITE_RAZORPAY_KEY_ID: 'rzp_test_compile_only_no_charge',
    VITE_FCM_ENABLED: 'false',
    VITE_PUSH_ENABLED: 'false',
    VITE_PETPOOJA_ENABLED: 'false',
  };
}

/** Synthetic google-services.json: exact package id, matching project id. */
export function compileFixtureNativeConfig(values = compileFixtureEnv()) {
  return {
    project_info: {
      project_number: values.VITE_FIREBASE_MESSAGING_SENDER_ID,
      project_id: values.VITE_FIREBASE_PROJECT_ID,
      storage_bucket: values.VITE_FIREBASE_STORAGE_BUCKET,
    },
    client: [
      {
        client_info: {
          mobilesdk_app_id: values.VITE_FIREBASE_APP_ID,
          android_client_info: { package_name: PARTNER_PACKAGE },
        },
        oauth_client: [],
        api_key: [{ current_key: values.VITE_FIREBASE_API_KEY }],
        services: {
          appinvite_service: { other_platform_oauth_client: [] },
        },
      },
    ],
    configuration_version: '1',
  };
}

function assertCompileContext(env) {
  const refusal =
    `Android compile fixture is restricted to the explicit GitHub Linux compile lane ` +
    `(GITHUB_ACTIONS=true, RUNNER_OS=Linux, ${COMPILE_ONLY_FLAG}=true); refusing here.`;
  if (env.GITHUB_ACTIONS !== 'true' || env.RUNNER_OS !== 'Linux' || env[COMPILE_ONLY_FLAG] !== 'true') {
    throw new Error(refusal);
  }
}

function assertPartnerRoot(root) {
  const manifest = resolve(root, 'package.json');
  if (!existsSync(manifest)) {
    throw new Error(`Refusing: not the partner app root (no package.json at ${manifest}).`);
  }
  let name;
  try {
    name = JSON.parse(readFileSync(manifest, 'utf8')).name;
  } catch {
    throw new Error(`Refusing: ${manifest} is not valid JSON.`);
  }
  if (name !== PARTNER_PACKAGE_JSON_NAME) {
    throw new Error(
      `Refusing: the Android compile fixture only applies to the partner app root ` +
        `(package.json name must be "${PARTNER_PACKAGE_JSON_NAME}", got ${JSON.stringify(name)}).`
    );
  }
}

/**
 * Validate the context and produce the fixture payload. Writes nothing.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {string} [root] app root to write into; defaults to process.cwd()
 * @returns {{dotenv: string, native: string, dotenvPath: string, nativePath: string}}
 */
export function prepareAndroidCompileConfig(env, root = process.cwd()) {
  assertCompileContext(env ?? {});
  assertPartnerRoot(root);

  const values = compileFixtureEnv();
  const dotenv =
    Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join('\n') + '\n';

  return {
    dotenv,
    native: JSON.stringify(compileFixtureNativeConfig(values), null, 2) + '\n',
    dotenvPath: resolve(root, '.env'),
    dotenvStagingPath: resolve(root, '.env.staging'),
    nativePath: resolve(root, 'android', 'app', 'google-services.json'),
  };
}

/** Write the fixture into `root`. Separate from the pure builder so tests stay side-effect free. */
export function writeAndroidCompileConfig(env, root = process.cwd()) {
  const payload = prepareAndroidCompileConfig(env, root);
  const mode = 0o600;
  writeFileSync(payload.dotenvPath, payload.dotenv, { mode });
  writeFileSync(payload.dotenvStagingPath, payload.dotenv, { mode });
  writeFileSync(payload.nativePath, payload.native, { mode });
  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    writeAndroidCompileConfig(process.env);
    console.log(
      'Synthetic Android compile fixture prepared (.env, .env.staging, google-services.json). ' +
        'Non-live, non-distributable; not production readiness and not a signed artifact.'
    );
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
