import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  REQUIRED_PUBLIC_FIREBASE_KEYS,
  formatPreflightReport,
  parsePlatformArgs,
  parsePublicEnv,
  validateMobileConfig,
} from '../scripts/mobile-config-preflight.mjs';

const VALID_ENV = [
  ...REQUIRED_PUBLIC_FIREBASE_KEYS.map((key) =>
    key === 'VITE_FIREBASE_PROJECT_ID'
      ? `${key}=burgonomics-7faa8`
      : `${key}=placeholder-${key.toLowerCase()}`,
  ),
  'VITE_FCM_ENABLED=true',
  'VITE_FCM_VAPID_KEY=placeholder-vapid',
].join('\n');

const VALID_NATIVE = JSON.stringify({
  project_info: { project_id: 'burgonomics-7faa8' },
  client: [
    {
      client_info: {
        android_client_info: { package_name: 'com.burgonomics.partner' },
      },
    },
  ],
});

const VALID_GRADLE = [
  'namespace = "com.burgonomics.partner"',
  'applicationId "com.burgonomics.partner"',
  "apply plugin: 'com.google.gms.google-services'",
].join('\n');

const validate = (overrides: Record<string, string> = {}) =>
  validateMobileConfig({
    envText: VALID_ENV,
    nativeText: VALID_NATIVE,
    gradleText: VALID_GRADLE,
    platform: 'android',
    ...overrides,
  });

describe('mobile build preflight', () => {
  it('passes authentic matching public/native config without printing values', () => {
    const result = validate();

    expect(result.platform).toBe('android');
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.nativePackageMatched).toBe(true);
    expect(result.nativeProjectMatched).toBe(true);
    expect(result.presentPublicKeys).toEqual(
      expect.arrayContaining([...REQUIRED_PUBLIC_FIREBASE_KEYS, 'VITE_FCM_ENABLED']),
    );

    const report = formatPreflightReport(result);
    expect(report).toContain('mobile-preflight] ok (android)');
    expect(report).not.toContain('placeholder-vite_firebase_api_key');
  });

  it('fails closed and names missing public env keys without exposing values', () => {
    const sentinelApiKey = 'AIzaSENTINEL_VALUE_MUST_NOT_APPEAR';
    const envText = [
      `VITE_FIREBASE_API_KEY="${sentinelApiKey}"`,
      'PORTER_SERVER_SECRET=must-not-be-read',
    ].join('\n');

    const result = validate({ envText });
    const report = formatPreflightReport(result);

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('VITE_FIREBASE_PROJECT_ID');
    expect(result.errors.join('\n')).toContain('VITE_FIREBASE_APP_ID');
    expect(report).not.toContain(sentinelApiKey);
    expect(report).not.toContain('must-not-be-read');
    expect(result.presentPublicKeys).not.toContain('PORTER_SERVER_SECRET');
  });

  it('android mode fails when native google-services config is missing', () => {
    const result = validate({ nativeText: '' });

    expect(result.platform).toBe('android');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('native config missing');
    expect(result.nativePackageMatched).toBe(false);
  });

  it('fails when the native config is registered for the wrong package', () => {
    const wrongPackage = JSON.stringify({
      project_info: { project_id: 'burgonomics-7faa8' },
      client: [
        {
          client_info: {
            android_client_info: { package_name: 'com.burgonomics' },
          },
        },
      ],
    });

    const result = validate({ nativeText: wrongPackage });

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('com.burgonomics.partner');
    expect(result.nativePackageMatched).toBe(false);
  });

  it('fails when the native project does not match the web env project', () => {
    const wrongProject = JSON.stringify({
      project_info: { project_id: 'wrong-project' },
      client: [
        {
          client_info: {
            android_client_info: { package_name: 'com.burgonomics.partner' },
          },
        },
      ],
    });

    const result = validate({ nativeText: wrongProject });

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain(
      'native project does not match VITE_FIREBASE_PROJECT_ID',
    );
    expect(result.nativeProjectMatched).toBe(false);
  });

  it('fails when the Google Services Gradle plugin is not applied', () => {
    const result = validate({
      gradleText: 'applicationId "com.burgonomics.partner"',
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('Google Services Gradle plugin is not applied');
  });

  it('parses only allowlisted public env keys and unquotes values', () => {
    const parsed = parsePublicEnv(
      [
        'VITE_FIREBASE_PROJECT_ID="burgonomics-7faa8"',
        "VITE_FIREBASE_APP_ID='1:demo:web:demo'",
        'PORTER_API_KEY=secret',
        'ADMIN_MAINTENANCE_PIN=1234',
      ].join('\n'),
    );

    expect(parsed.VITE_FIREBASE_PROJECT_ID).toBe('burgonomics-7faa8');
    expect(parsed.VITE_FIREBASE_APP_ID).toBe('1:demo:web:demo');
    expect(parsed).not.toHaveProperty('PORTER_API_KEY');
    expect(parsed).not.toHaveProperty('ADMIN_MAINTENANCE_PIN');
  });

  it('defaults to shared web-only mode and does not demand Android native files', () => {
    const result = validateMobileConfig({
      envText: VALID_ENV,
      nativeText: '',
      gradleText: '',
    });

    expect(result.platform).toBe('shared');
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.nativePackageMatched).toBe(false);

    const report = formatPreflightReport(result);
    expect(report).toContain('mobile-preflight] ok (shared)');
    expect(report).not.toContain('native config missing');
  });

  it('iOS mode accepts valid web config with missing Android native files', () => {
    const result = validateMobileConfig({
      envText: VALID_ENV,
      nativeText: '',
      gradleText: '',
      platform: 'ios',
    });

    expect(result.platform).toBe('ios');
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);

    const report = formatPreflightReport(result);
    expect(report).toContain('mobile-preflight] ok (ios)');
    expect(report).not.toContain('native config missing');
  });

  it('rejects an unknown platform even when the web config is valid', () => {
    const result = validateMobileConfig({
      envText: VALID_ENV,
      nativeText: VALID_NATIVE,
      gradleText: VALID_GRADLE,
      platform: 'windows',
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('unsupported platform: windows');
  });

  it('parses explicit platform arguments and reports invalid arguments', () => {
    expect(parsePlatformArgs([])).toEqual({ platform: 'shared', errors: [] });
    expect(parsePlatformArgs(['--platform=ios'])).toEqual({ platform: 'ios', errors: [] });
    expect(parsePlatformArgs(['--platform', 'android'])).toEqual({
      platform: 'android',
      errors: [],
    });
    expect(parsePlatformArgs(['--platform=windows']).platform).toBe('windows');
    expect(parsePlatformArgs(['--platform']).errors).not.toEqual([]);
    expect(parsePlatformArgs(['--host=mac']).errors).not.toEqual([]);
  });

  it('wires build:mobile and each platform consumer to an explicit mode', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(pkg.scripts['build:mobile']).toContain('--platform=shared');
    expect(pkg.scripts['preflight:android']).toContain('--platform=android');
    expect(pkg.scripts['preflight:ios']).toContain('--platform=ios');
    expect(pkg.scripts['cap:sync:android']).toContain('preflight:android');
    expect(pkg.scripts['cap:sync:ios']).toContain('preflight:ios');
    expect(pkg.scripts['cap:sync']).toContain('preflight:android');
    expect(pkg.scripts['cap:sync']).toContain('preflight:ios');
  });

  it('wires the unavoidable Android artifact path to the android guard', () => {
    const gradle = readFileSync(
      new URL('../android/app/build.gradle', import.meta.url),
      'utf8',
    );

    expect(gradle).toContain("tasks.register('verifyMobileFirebaseConfig'");
    expect(gradle).toContain("'--platform=android'");
    expect(gradle).toContain('dependsOn verifyMobileFirebaseConfig');
    expect(gradle).toContain("tasks.named('preBuild')");
  });
});
