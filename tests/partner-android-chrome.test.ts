import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import capacitorConfig from '../capacitor.config';
import { STATUS_BAR_CHROME } from '@/shared/platform/nativeBootstrap';

/**
 * Native status-bar chrome parity (EMULATOR audit 2026-11-26).
 *
 * The window is painted before any JS runs, so the colours in
 * android/app/src/main/res/values{-night}/colors.xml are what the user sees
 * during launch. If they disagreed with the runtime chrome in
 * src/shared/platform/nativeBootstrap.ts, the bar would flash the audit's
 * near-white surface with invisible light icons before correcting itself.
 *
 * This lives in the plain node test project on purpose: it reads the filesystem,
 * which the app's browser tsconfig does not cover.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'android/app/src/main/res');

function readResource(file: string): string {
  return readFileSync(path.join(RES, file), 'utf8');
}

function colorOf(file: string, name: string): string {
  const match = readResource(file).match(
    new RegExp(`<color name="${name}">(#[0-9A-Fa-f]{6})</color>`),
  );
  if (!match) throw new Error(`${name} not declared in ${file}`);
  return match[1].toUpperCase();
}

function boolOf(file: string, name: string): boolean {
  const match = readResource(file).match(new RegExp(`<bool name="${name}">(true|false)</bool>`));
  if (!match) throw new Error(`${name} not declared in ${file}`);
  return match[1] === 'true';
}

describe('Partner native chrome matches the runtime chrome', () => {
  it('values/colors.xml carries the console bar colour', () => {
    expect(colorOf('values/colors.xml', 'statusBarColor')).toBe(
      STATUS_BAR_CHROME.backgroundColor.toUpperCase(),
    );
    expect(colorOf('values/colors.xml', 'canvas')).toBe(
      STATUS_BAR_CHROME.backgroundColor.toUpperCase(),
    );
  });

  it('values-night/colors.xml carries the same colour (the console has no light theme)', () => {
    expect(colorOf('values-night/colors.xml', 'statusBarColor')).toBe(
      STATUS_BAR_CHROME.backgroundColor.toUpperCase(),
    );
  });

  it('keeps light icons on the dark bar in both resource sets', () => {
    // statusBarDarkIcons=false == light icons, the only readable choice on
    // #0A0A0A. `android:windowLightStatusBar` takes the same value.
    expect(boolOf('values/colors.xml', 'statusBarDarkIcons')).toBe(false);
    expect(boolOf('values-night/colors.xml', 'statusBarDarkIcons')).toBe(false);
  });

  it('styles.xml paints an opaque bar, light icons and the console canvas', () => {
    const xml = readResource('values/styles.xml');
    expect(xml).toMatch(/<item name="android:statusBarColor">@color\/statusBarColor<\/item>/);
    expect(xml).toMatch(/<item name="android:windowBackground">@color\/canvas<\/item>/);
    expect(xml).toMatch(
      /<item name="android:windowLightStatusBar">@bool\/statusBarDarkIcons<\/item>/,
    );
    // Never translucent (that is how the near-white default showed through),
    // and never takes safe areas away from the SystemBars plugin.
    expect(xml).not.toMatch(/windowTranslucentStatus">true/);
    expect(xml).not.toMatch(/fitsSystemWindows">true/);
  });

  it('capacitor config keeps the launch theme and the runtime value in step', () => {
    const plugins = capacitorConfig.plugins as unknown as {
      StatusBar?: { backgroundColor?: string };
      SystemBars?: { insetsHandling?: string };
      SplashScreen?: { splashFullScreen?: boolean; splashImmersive?: boolean };
    };
    expect(plugins.StatusBar?.backgroundColor?.toUpperCase()).toBe(
      STATUS_BAR_CHROME.backgroundColor.toUpperCase(),
    );
    // Safe areas stay with the plugin.
    expect(plugins.SystemBars?.insetsHandling ?? 'css').toBe('css');
    // The immersive splash is what left a dead band at the top on dismissal.
    expect(plugins.SplashScreen?.splashFullScreen).toBe(false);
    expect(plugins.SplashScreen?.splashImmersive).toBe(false);
  });
});
