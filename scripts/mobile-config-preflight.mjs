#!/usr/bin/env node
/**
 * Mobile build preflight — fail closed before a broken artifact is produced.
 *
 * Two separate startup failures already shipped from this worktree:
 *   1. missing .env -> invalid Firebase web API key at splash
 *   2. missing android/app/google-services.json -> native FirebaseApp not initialized
 *
 * Platform modes:
 *   --platform=shared   (default) public web config only. Used by the shared
 *                       `build:mobile` path, including direct iOS/mac workflows.
 *   --platform=ios      public web config only; never demands Android files.
 *   --platform=android  public web config + matching native package/project +
 *                       Google Services Gradle plugin. Used by Android sync and
 *                       unavoidable Android preBuild.
 *   unknown             non-zero.
 *
 * Output is intentionally value-blind: required env key NAMES and pass/fail
 * reasons, never the values. No server credentials are read or retained.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLATFORMS = Object.freeze(['shared', 'ios', 'android']);
export const DEFAULT_PLATFORM = 'shared';

export const REQUIRED_PUBLIC_FIREBASE_KEYS = Object.freeze([
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]);

export const PARTNER_PACKAGE = 'com.burgonomics.partner';
export const DEFAULT_ENV_PATH = '.env';
export const DEFAULT_NATIVE_PATH = 'android/app/google-services.json';
export const DEFAULT_GRADLE_PATH = 'android/app/build.gradle';

const unquote = (value) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

/** Parse only public Vite keys; never retain server credentials. */
export function parsePublicEnv(text) {
  const publicKeys = new Set([
    ...REQUIRED_PUBLIC_FIREBASE_KEYS,
    'VITE_FCM_ENABLED',
    'VITE_FCM_VAPID_KEY',
  ]);
  const out = {};
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    if (!publicKeys.has(key)) continue;
    out[key] = unquote(line.slice(index + 1));
  }
  return out;
}

/** Extract only the non-secret identity fields used for matching. */
export function parseNativeConfig(text) {
  const parsed = JSON.parse(String(text ?? ''));
  const projectId = parsed?.project_info?.project_id;
  const packages = Array.isArray(parsed?.client)
    ? parsed.client
        .map((client) => client?.client_info?.android_client_info?.package_name)
        .filter((name) => typeof name === 'string' && name.length > 0)
    : [];
  return {
    projectId: typeof projectId === 'string' ? projectId : '',
    packages,
  };
}

/** Supports `--platform=ios` and `--platform ios`; no host-OS inference. */
export function parsePlatformArgs(argv = []) {
  let platform = DEFAULT_PLATFORM;
  const errors = [];
  const args = Array.isArray(argv) ? argv : [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index]);
    if (arg === '--platform') {
      const value = args[index + 1];
      if (!value) {
        errors.push('--platform requires a value');
        break;
      }
      platform = String(value);
      index += 1;
    } else if (arg.startsWith('--platform=')) {
      platform = arg.slice('--platform='.length);
    } else {
      errors.push(`unknown argument: ${arg}`);
    }
  }
  return { platform, errors };
}

export function validateMobileConfig({
  envText,
  nativeText,
  gradleText,
  expectedPackage = PARTNER_PACKAGE,
  platform = DEFAULT_PLATFORM,
} = {}) {
  const normalizedPlatform = String(platform ?? '').trim().toLowerCase();
  const env = parsePublicEnv(envText);
  const base = {
    platform: normalizedPlatform,
    presentPublicKeys: Object.keys(env).sort(),
    nativePackageMatched: false,
    nativeProjectMatched: false,
  };

  if (!PLATFORMS.includes(normalizedPlatform)) {
    return {
      ...base,
      ok: false,
      errors: [`unsupported platform: ${normalizedPlatform || '(empty)'}`],
    };
  }

  const errors = [];
  const missingKeys = REQUIRED_PUBLIC_FIREBASE_KEYS.filter(
    (key) => !env[key] || !String(env[key]).trim(),
  );
  if (missingKeys.length > 0) {
    errors.push(`missing required public env keys: ${missingKeys.join(', ')}`);
  }

  // Shared and iOS builds only need the public web config. They must never
  // require the Android native registration; macs can build iOS without it.
  if (normalizedPlatform !== 'android') {
    return {
      ...base,
      ok: errors.length === 0,
      errors,
    };
  }

  let native = { projectId: '', packages: [] };
  if (!nativeText) {
    errors.push('native config missing: android/app/google-services.json');
  } else {
    try {
      native = parseNativeConfig(nativeText);
    } catch {
      errors.push('native config is not valid JSON');
    }
  }

  if (nativeText) {
    if (!native.packages.includes(expectedPackage)) {
      errors.push(`native config does not register package ${expectedPackage}`);
    }
    if (!native.projectId) {
      errors.push('native config has no project_info.project_id');
    } else if (
      env.VITE_FIREBASE_PROJECT_ID &&
      native.projectId !== env.VITE_FIREBASE_PROJECT_ID
    ) {
      errors.push('native project does not match VITE_FIREBASE_PROJECT_ID');
    }
  }

  if (!gradleText) {
    errors.push('android/app/build.gradle missing');
  } else {
    const hasPlugin =
      /apply\s+plugin:\s*['"]com\.google\.gms\.google-services['"]/.test(gradleText) ||
      /id\s*\(?\s*['"]com\.google\.gms\.google-services['"]\s*\)?/.test(gradleText);
    if (!hasPlugin) {
      errors.push('Google Services Gradle plugin is not applied in android/app/build.gradle');
    }
    if (
      !new RegExp(
        `applicationId\\s+['"]${expectedPackage.replace(/\./g, '\\.')}['"]`,
      ).test(gradleText)
    ) {
      errors.push('android applicationId does not match the native package');
    }
  }

  return {
    ...base,
    ok: errors.length === 0,
    errors,
    nativePackageMatched: native.packages.includes(expectedPackage),
    nativeProjectMatched:
      Boolean(native.projectId) &&
      native.projectId === env.VITE_FIREBASE_PROJECT_ID,
  };
}

export function readPreflightInputs({
  root = process.cwd(),
  envPath = DEFAULT_ENV_PATH,
  nativePath = DEFAULT_NATIVE_PATH,
  gradlePath = DEFAULT_GRADLE_PATH,
} = {}) {
  const envFile = resolve(root, envPath);
  const nativeFile = resolve(root, nativePath);
  const gradleFile = resolve(root, gradlePath);
  return {
    envText: existsSync(envFile) ? readFileSync(envFile, 'utf8') : '',
    nativeText: existsSync(nativeFile) ? readFileSync(nativeFile, 'utf8') : '',
    gradleText: existsSync(gradleFile) ? readFileSync(gradleFile, 'utf8') : '',
  };
}

export function formatPreflightReport(result) {
  const platform = result.platform || DEFAULT_PLATFORM;
  if (result.ok) {
    if (platform === 'android') {
      return '[mobile-preflight] ok (android): public Firebase keys present; native package/project match; Google Services plugin applied.';
    }
    return `[mobile-preflight] ok (${platform}): required public Firebase keys present.`;
  }
  return [
    `[mobile-preflight] FAILED (${platform}) — refusing to build a mobile bundle with incomplete config.`,
    ...result.errors.map((error) => `[mobile-preflight] ${error}`),
    '[mobile-preflight] No values were printed. Fill the named keys from the public Firebase app config.',
  ].join('\n');
}

export function runPreflight(options = {}) {
  const platform = options.platform ?? DEFAULT_PLATFORM;
  const result = validateMobileConfig({
    ...readPreflightInputs(options),
    platform,
    expectedPackage: options.expectedPackage,
  });
  return { result, report: formatPreflightReport(result) };
}

const isEntrypoint = (() => {
  try {
    return Boolean(process.argv[1]) &&
      resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  const parsed = parsePlatformArgs(process.argv.slice(2));
  if (parsed.errors.length > 0) {
    process.stderr.write(
      [
        '[mobile-preflight] FAILED — invalid arguments.',
        ...parsed.errors.map((error) => `[mobile-preflight] ${error}`),
        '[mobile-preflight] Use --platform=shared, --platform=ios, or --platform=android.',
      ].join('\n') + '\n',
    );
    process.exit(1);
  }
  const { result, report } = runPreflight({ platform: parsed.platform });
  const stream = result.ok ? process.stdout : process.stderr;
  stream.write(`${report}\n`);
  process.exit(result.ok ? 0 : 1);
}
