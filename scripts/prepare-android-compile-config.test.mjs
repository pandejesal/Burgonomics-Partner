// prepare-android-compile-config.test.mjs — partner Android compile fixture.
//
// Charter: no Gradle, no Capacitor, no npm install, no network. Every file this
// test causes to be written goes into a temporary directory the test itself
// created and removed; the fixture never touches this repository's `.env`,
// `android/app/google-services.json` or any other tracked path.
//
// The fixture exists because the ordinary Android CI job used to demand
// MOBILE_PRODUCTION_ENV, a secret neither app repository has, so the job failed
// before it ever compiled. A compile check needs a *shape* the toolchain accepts,
// not a live environment: reserved `.invalid` hosts, a fake key of the right
// length, and the exact application id Gradle already declares.
//
// Run:  node --test scripts/prepare-android-compile-config.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  COMPILE_ONLY_FLAG,
  PARTNER_PACKAGE,
  prepareAndroidCompileConfig,
  compileFixtureEnv,
} from './prepare-android-compile-config.mjs';
import { validateMobileConfig } from './mobile-config-preflight.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');
const SCRIPT = fileURLToPath(new URL('./prepare-android-compile-config.mjs', import.meta.url));

/** The exact GitHub/Linux/compile-only context the helper accepts. */
const CONTEXT = { GITHUB_ACTIONS: 'true', RUNNER_OS: 'Linux', [COMPILE_ONLY_FLAG]: 'true' };

/** A throwaway app root: package.json + android/app, nothing else. */
function ownedAppRoot() {
  const dir = mkdtempSync(path.join(tmpdir(), 'partner-android-compile-fixture-'));
  mkdirSync(path.join(dir, 'android', 'app'), { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'burgonomics-partner' }));
  return dir;
}

function runFixture(dir, env) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

/**
 * Build the fixture against a throwaway root. The pure builder takes a root
 * explicitly so no assertion can ever fall back to this repository's cwd.
 */
function ownedPayload() {
  const dir = ownedAppRoot();
  try {
    return prepareAndroidCompileConfig(CONTEXT, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** dotenv text -> plain object, JSON-quoted values unquoted. */
function dotenvValues(text) {
  const out = {};
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    const index = line.indexOf('=');
    out[line.slice(0, index)] = JSON.parse(line.slice(index + 1));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Refusal: the fixture is only ever a GitHub Linux compile lane.
// ---------------------------------------------------------------------------

test('refuses outside the explicit GitHub/Linux/compile-only context', () => {
  for (const key of Object.keys(CONTEXT)) {
    for (const bad of [undefined, '', 'false', 'TRUE', '1']) {
      const env = { ...CONTEXT, [key]: bad };
      if (bad === undefined) delete env[key];
      assert.throws(
        () => prepareAndroidCompileConfig(env),
        /compile fixture/i,
        `${key}=${JSON.stringify(bad)} must be refused`
      );
    }
  }
});

test('refuses a macOS runner even with both flags set', () => {
  assert.throws(() => prepareAndroidCompileConfig({ ...CONTEXT, RUNNER_OS: 'macOS' }), /compile fixture/i);
});

test('CLI exits non-zero and writes nothing when the context is wrong', () => {
  const dir = ownedAppRoot();
  try {
    const result = runFixture(dir, { ...CONTEXT, RUNNER_OS: 'Windows' });
    assert.notStrictEqual(result.status, 0, 'a refused run must fail');
    assert.match(result.stderr, /compile fixture/i);
    assert.deepStrictEqual(readdirSync(dir).sort(), ['android', 'package.json'], 'nothing may be written');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses to run outside the partner app root', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'partner-android-compile-wrong-root-'));
  try {
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'burgonomics' }));
    assert.throws(() => prepareAndroidCompileConfig(CONTEXT, dir), /partner app root/i);
    const result = runFixture(dir, CONTEXT);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /partner app root/i);
    assert.ok(!existsSync(path.join(dir, '.env')), 'no dotenv in a foreign root');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Exact outputs, written only into a directory this test owns.
// ---------------------------------------------------------------------------

test('CLI writes exactly the two files the Android build reads, into the owned root', () => {
  const dir = ownedAppRoot();
  try {
    const result = runFixture(dir, CONTEXT);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /compile fixture/i);

    const written = [];
    for (const relative of ['.env', '.env.staging', 'android/app/google-services.json', '.env.production', '.env.local']) {
      if (existsSync(path.join(dir, relative))) written.push(relative);
    }
    assert.deepStrictEqual(written.sort(), ['.env', '.env.staging', 'android/app/google-services.json'].sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dotenv carries the six public Firebase keys, staging mode and reserved hosts only', () => {
  const { dotenv } = ownedPayload();
  const values = dotenvValues(dotenv);

  assert.strictEqual(values.VITE_APP_ENV, 'staging', 'a compile fixture must not claim production');
  for (const key of [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_API_BASE',
  ]) {
    assert.ok(values[key] && values[key].trim(), `${key} must be present and non-empty`);
  }

  // Reserved TLD: cannot resolve, cannot be registered, cannot receive traffic.
  for (const key of ['VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_STORAGE_BUCKET']) {
    assert.match(values[key], /\.invalid$/, `${key} must be a reserved .invalid host`);
  }
  assert.match(new URL(values.VITE_API_BASE).hostname, /\.invalid$/, 'API base must be a reserved .invalid host');

  // Firebase Android API keys are 39 chars starting with `AIza`; native SDKs
  // reject a malformed shape at launch, so the fixture keeps the shape.
  assert.match(values.VITE_FIREBASE_API_KEY, /^AIza[0-9A-Za-z_-]{35}$/);

  const serialized = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n');
  assert.doesNotMatch(serialized, /rzp_live_/, 'no live payment key may appear');
  assert.doesNotMatch(serialized, /burgonomics-7faa8/, 'the real staging project must not be reused');
  assert.match(values.VITE_RAZORPAY_KEY_ID, /^rzp_test_/, 'a test-shaped payment key at most');
});

test('google-services.json registers the exact package and the same project id as .env', () => {
  const { dotenv, native } = ownedPayload();
  const config = JSON.parse(native);
  const values = dotenvValues(dotenv);

  assert.strictEqual(config.project_info.project_id, values.VITE_FIREBASE_PROJECT_ID);
  const packages = config.client.map((client) => client.client_info.android_client_info.package_name);
  assert.deepStrictEqual(packages, [PARTNER_PACKAGE]);
  assert.strictEqual(PARTNER_PACKAGE, 'com.burgonomics.partner', 'the package id must match build.gradle exactly');
  assert.ok(config.project_info.project_number, 'project_number is required by the google-services plugin');
  assert.match(config.client[0].api_key[0].current_key, /^AIza[0-9A-Za-z_-]{35}$/);
});

test('the fixture output satisfies the real android preflight that gates assembleDebug', () => {
  const { dotenv, native } = ownedPayload();
  // The real gradle file, unmodified, so the check is the one Gradle will run.
  const gradleText = readFileSync(path.join(APP_ROOT, 'android/app/build.gradle'), 'utf8');

  const verdict = validateMobileConfig({ envText: dotenv, nativeText: native, gradleText, platform: 'android' });
  assert.deepStrictEqual(verdict.errors, [], `preflight must pass: ${verdict.errors.join('; ')}`);
  assert.strictEqual(verdict.ok, true);
  assert.strictEqual(verdict.nativePackageMatched, true);
  assert.strictEqual(verdict.nativeProjectMatched, true);
});

test('the shared-mode preflight (what build:mobile runs) also passes on the fixture', () => {
  const { dotenv } = ownedPayload();
  const verdict = validateMobileConfig({ envText: dotenv, nativeText: '', gradleText: '', platform: 'shared' });
  assert.deepStrictEqual(verdict.errors, []);
});

test('fixture values are a function of nothing but the flags — no ambient secret is read', () => {
  const hostile = {
    ...CONTEXT,
    MOBILE_PRODUCTION_ENV: '{"VITE_APP_ENV":"production"}',
    MOBILE_STAGING_ENV: '{"VITE_APP_ENV":"staging"}',
    GOOGLE_SERVICES_JSON_BASE64: 'not-base64',
    RELEASE_KEYSTORE_BASE64: 'not-base64',
  };
  assert.deepStrictEqual(compileFixtureEnv(hostile), compileFixtureEnv(CONTEXT));
});

test('a real .env.production in the root is left untouched', () => {
  const dir = ownedAppRoot();
  try {
    const real = 'VITE_APP_ENV="production"\nVITE_API_BASE="https://api.burgonomics.com"\n';
    writeFileSync(path.join(dir, '.env.production'), real);
    const result = runFixture(dir, CONTEXT);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(readFileSync(path.join(dir, '.env.production'), 'utf8'), real, 'production env must not be rewritten');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
