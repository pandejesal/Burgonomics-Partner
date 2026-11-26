import { afterEach, describe, expect, it, vi } from 'vitest';
import capacitorConfig from '../../../capacitor.config';
import { STATUS_BAR_CHROME } from './nativeBootstrap';

/**
 * System-bar semantics for the Partner console.
 *
 * EMULATOR audit 2026-11-26: the status bar rendered near-white with
 * light-content icons, so the clock and battery were invisible. The console is
 * dark in every appearance (no light theme in src/index.css), so the bar is a
 * constant #0A0A0A with light icons.
 *
 * Both Capacitor surfaces spell "light content on a dark background" the same
 * way, and both installed packages map `DARK` to dark-icon OFF:
 *
 * - `@capacitor/status-bar` `Style.Dark` === "DARK" ("Light text for dark
 *   backgrounds").
 * - `@capacitor/core` `SystemBarsStyle.Dark` === "DARK" ("Light system bar
 *   content on a dark background"); the Android implementation maps it to
 *   `setAppearanceLightStatusBars(false)`.
 *
 * Scope: plugin boundaries are mocked. Nothing here launches a native shell,
 * measures contrast, or asserts on-device rendering. The native
 * res/values{-night}/colors.xml parity is asserted in
 * tests/partner-android-chrome.test.ts (a plain node test, so this suite stays
 * free of filesystem imports the app tsconfig does not cover).
 */

/** Plugin availability is toggled per test to model an un-synced shell. */
const availability = vi.hoisted(() => ({ splashScreen: true, statusBar: true }));

const nativeState = vi.hoisted(() => ({
  platform: 'android' as 'android' | 'ios' | 'web',
}));

const splashScreen = vi.hoisted(() => ({ hide: vi.fn(async () => undefined) }));

const legacyStatusBar = vi.hoisted(() => ({
  setStyle: vi.fn(async () => undefined),
  setBackgroundColor: vi.fn(async () => undefined),
  setOverlaysWebView: vi.fn(async () => undefined),
}));

const coreSystemBars = vi.hoisted(() => ({ setStyle: vi.fn(async () => undefined) }));

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  critical: vi.fn(),
}));

vi.mock('@/core/logging/logger', () => ({ logger: loggerMock }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => nativeState.platform !== 'web',
    getPlatform: () => nativeState.platform,
  },
  SystemBars: coreSystemBars,
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));

vi.mock('@capacitor/splash-screen', () => ({
  // A getter (not a throwing factory) so `availability` can flip between tests:
  // Vitest caches the factory result per file, but property access is re-read.
  get SplashScreen() {
    if (!availability.splashScreen) throw new Error('SplashScreen plugin not synced');
    return splashScreen;
  },
}));

vi.mock('@capacitor/status-bar', () => ({
  get StatusBar() {
    if (!availability.statusBar) throw new Error('StatusBar plugin not synced');
    return legacyStatusBar;
  },
  Style: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));

/**
 * `@capacitor/cli` types plugin blocks as `{ [key: string]: any }`, so the
 * declarations themselves cannot describe these keys. Narrow to the exact
 * shape this suite reads instead of trusting an `any` at the use site.
 */
interface StatusBarPluginConfig {
  style?: string;
  backgroundColor?: string;
  overlaysWebView?: boolean;
}

interface SystemBarsPluginConfig {
  style?: string;
  hidden?: boolean;
  insetsHandling?: string;
}

interface PartnerPluginConfig {
  StatusBar?: StatusBarPluginConfig;
  SystemBars?: SystemBarsPluginConfig;
}

/** iOS shell settings that must not drift while the debugging flag is added. */
interface IosPlatformConfig {
  contentInset?: string;
  limitsNavigationsToAppBoundDomains?: boolean;
  webContentsDebuggingEnabled?: boolean;
}

const pluginConfig = capacitorConfig.plugins as unknown as PartnerPluginConfig;
const iosConfig = capacitorConfig.ios as unknown as IosPlatformConfig;

async function boot(platform: 'android' | 'ios' | 'web'): Promise<void> {
  vi.resetModules();
  nativeState.platform = platform;
  const { initNativeShell } = await import('./nativeBootstrap');
  await initNativeShell();
}

const resetBarMocks = (): void => {
  splashScreen.hide.mockReset();
  splashScreen.hide.mockResolvedValue(undefined);
  legacyStatusBar.setStyle.mockReset();
  legacyStatusBar.setStyle.mockResolvedValue(undefined);
  legacyStatusBar.setBackgroundColor.mockReset();
  legacyStatusBar.setBackgroundColor.mockResolvedValue(undefined);
  legacyStatusBar.setOverlaysWebView.mockReset();
  legacyStatusBar.setOverlaysWebView.mockResolvedValue(undefined);
  coreSystemBars.setStyle.mockReset();
  coreSystemBars.setStyle.mockResolvedValue(undefined);
  for (const method of Object.values(loggerMock)) method.mockReset();
};

describe('capacitor config — light system-bar content on the console canvas', () => {
  it('declares SystemBars DARK (light content) with the bars visible', () => {
    expect(pluginConfig.SystemBars?.style).toBe('DARK');
    expect(pluginConfig.SystemBars?.hidden).toBe(false);
  });

  it('keeps the current inset handling instead of opting out of safe areas', () => {
    // Unset means the plugin default ("css"): native inset padding plus the
    // injected --safe-area-inset-* variables. `disable` would remove safe
    // areas entirely and is explicitly out of scope here.
    expect(pluginConfig.SystemBars?.insetsHandling ?? 'css').toBe('css');
    expect(pluginConfig.SystemBars?.insetsHandling).not.toBe('disable');
    expect(pluginConfig.SystemBars?.insetsHandling).not.toBe('native');
  });

  it('aligns the legacy StatusBar block with the console canvas', () => {
    expect(pluginConfig.StatusBar?.style).toBe('DARK');
    expect(pluginConfig.StatusBar?.backgroundColor?.toUpperCase()).toBe(
      STATUS_BAR_CHROME.backgroundColor,
    );
    expect(pluginConfig.StatusBar?.overlaysWebView).toBe(false);
  });

  it('keeps the splash off fullscreen/immersive (bars stay in place)', () => {
    // The immersive splash hid the bars; on dismissal the app came back with a
    // dead band at the top. The splash now sits under the normal bars.
    const splash = capacitorConfig.plugins?.SplashScreen as Record<string, unknown> | undefined;
    expect(splash?.splashFullScreen).toBe(false);
    expect(splash?.splashImmersive).toBe(false);
    // Splash until the app is ready: no fixed auto-hide timer.
    expect(splash?.launchAutoHide).toBe(false);
  });
});

describe('capacitor config — iOS shell hardening', () => {
  it('disables remote WebView inspection explicitly', () => {
    // Defence in depth. Capacitor enables the Web Inspector when DEBUG or the
    // SPM CAPACITOR_DEBUG fallback is set; an explicit false removes that
    // implicit path. This says nothing about whether an existing Release build
    // was ever inspectable — only that the config no longer leaves it to a
    // build-time default.
    expect(iosConfig.webContentsDebuggingEnabled).toBe(false);
  });

  it('leaves the reviewed iOS navigation and inset settings untouched', () => {
    expect(iosConfig.contentInset).toBe('always');
    expect(iosConfig.limitsNavigationsToAppBoundDomains).toBe(true);
  });

  it('does not disable Android debugging as a side effect', () => {
    // The Android flag is a separate, already-reviewed setting.
    const androidConfig = capacitorConfig.android as unknown as {
      webContentsDebuggingEnabled?: boolean;
    };
    expect(androidConfig.webContentsDebuggingEnabled).toBe(false);
  });
});

describe('initNativeShell — runtime system-bar styling', () => {
  afterEach(() => {
    availability.splashScreen = true;
    availability.statusBar = true;
    resetBarMocks();
  });

  it('Android: applies DARK to both surfaces, keeps the console background, hides the splash', async () => {
    resetBarMocks();
    availability.splashScreen = true;
    availability.statusBar = true;

    await boot('android');

    expect(coreSystemBars.setStyle).toHaveBeenCalledTimes(1);
    expect(coreSystemBars.setStyle).toHaveBeenCalledWith({ style: 'DARK' });
    expect(coreSystemBars.setStyle).not.toHaveBeenCalledWith({ style: 'LIGHT' });

    expect(legacyStatusBar.setStyle).toHaveBeenCalledWith({ style: 'DARK' });
    expect(legacyStatusBar.setBackgroundColor).toHaveBeenCalledWith({
      color: STATUS_BAR_CHROME.backgroundColor,
    });
    expect(legacyStatusBar.setOverlaysWebView).toHaveBeenCalledWith({ overlay: false });

    expect(splashScreen.hide).toHaveBeenCalledTimes(1);
    expect(splashScreen.hide).toHaveBeenCalledWith({ fadeOutDuration: 200 });
  });

  it('iOS: applies DARK to both surfaces without the Android-only background/overlay calls', async () => {
    resetBarMocks();
    availability.splashScreen = true;
    availability.statusBar = true;

    await boot('ios');

    expect(coreSystemBars.setStyle).toHaveBeenCalledWith({ style: 'DARK' });
    expect(legacyStatusBar.setStyle).toHaveBeenCalledWith({ style: 'DARK' });
    expect(legacyStatusBar.setBackgroundColor).not.toHaveBeenCalled();
    expect(legacyStatusBar.setOverlaysWebView).not.toHaveBeenCalled();
    expect(splashScreen.hide).toHaveBeenCalledWith({ fadeOutDuration: 200 });
  });

  it('web: touches no bar plugin and does not hide a splash that does not exist', async () => {
    resetBarMocks();
    availability.splashScreen = true;
    availability.statusBar = true;

    await boot('web');

    expect(coreSystemBars.setStyle).not.toHaveBeenCalled();
    expect(legacyStatusBar.setStyle).not.toHaveBeenCalled();
    expect(legacyStatusBar.setBackgroundColor).not.toHaveBeenCalled();
    expect(legacyStatusBar.setOverlaysWebView).not.toHaveBeenCalled();
    expect(splashScreen.hide).not.toHaveBeenCalled();
  });

  it('a failing core SystemBars still leaves the legacy style and the splash release intact', async () => {
    resetBarMocks();
    availability.splashScreen = true;
    availability.statusBar = true;
    coreSystemBars.setStyle.mockRejectedValue(new Error('SystemBars not implemented'));

    await expect(boot('android')).resolves.toBeUndefined();

    expect(legacyStatusBar.setStyle).toHaveBeenCalledWith({ style: 'DARK' });
    expect(legacyStatusBar.setBackgroundColor).toHaveBeenCalledWith({
      color: STATUS_BAR_CHROME.backgroundColor,
    });
    expect(splashScreen.hide).toHaveBeenCalledWith({ fadeOutDuration: 200 });

    // The handled failure is reported through the structured logger: a
    // source-owned event ID plus the error object, never a formatted string.
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'native.systemBarsFailed',
      expect.objectContaining({ message: 'SystemBars not implemented' }),
    );
    expect(loggerMock.warn).not.toHaveBeenCalledWith('native.statusBarFailed', expect.anything());
  });

  it('a missing legacy StatusBar module still applies the core style and releases the splash', async () => {
    // Regression: Promise.all + object destructuring of a failed optional
    // import threw a TypeError, and the outer catch skipped splash hide, so a
    // shell without the legacy plugin sat on an indefinite splash.
    resetBarMocks();
    availability.splashScreen = true;
    availability.statusBar = false;

    await expect(boot('android')).resolves.toBeUndefined();

    // Proves the module really was unavailable (the mocked export getter
    // throws), so the assertions below cannot pass on a resolved
    // `@capacitor/status-bar`.
    expect(legacyStatusBar.setStyle).not.toHaveBeenCalled();
    expect(coreSystemBars.setStyle).toHaveBeenCalledWith({ style: 'DARK' });
    expect(splashScreen.hide).toHaveBeenCalledWith({ fadeOutDuration: 200 });
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'native.statusBarFailed',
      expect.objectContaining({ message: 'StatusBar plugin not synced' }),
    );
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
  });

  it('a rejecting legacy setStyle still leaves the core style applied and the splash released', async () => {
    resetBarMocks();
    availability.splashScreen = true;
    availability.statusBar = true;
    legacyStatusBar.setStyle.mockRejectedValue(new Error('StatusBar not implemented'));

    await expect(boot('ios')).resolves.toBeUndefined();

    expect(coreSystemBars.setStyle).toHaveBeenCalledWith({ style: 'DARK' });
    expect(splashScreen.hide).toHaveBeenCalledWith({ fadeOutDuration: 200 });
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'native.statusBarFailed',
      expect.objectContaining({ message: 'StatusBar not implemented' }),
    );
  });

  it('a missing SplashScreen module still applies both bar styles and resolves', async () => {
    resetBarMocks();
    availability.splashScreen = false;
    availability.statusBar = true;

    await expect(boot('android')).resolves.toBeUndefined();

    expect(coreSystemBars.setStyle).toHaveBeenCalledWith({ style: 'DARK' });
    expect(legacyStatusBar.setStyle).toHaveBeenCalledWith({ style: 'DARK' });
    expect(legacyStatusBar.setBackgroundColor).toHaveBeenCalledWith({
      color: STATUS_BAR_CHROME.backgroundColor,
    });
    expect(splashScreen.hide).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'native.splashHideFailed',
      expect.objectContaining({ message: 'SplashScreen plugin not synced' }),
    );
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
  });
});
