import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser accessibility acceptance for the partner app's public surface.
 *
 * The suite needs an already-served partner build; there is deliberately no
 * webServer here (starting the app would need Firebase configuration and a
 * session, which this lane must not create). Point it at a local/staging build
 * (PowerShell — the documented platform):
 *
 *   $env:UI_BASE_URL = "http://127.0.0.1:4321"
 *   npx --no-install playwright test -c tests/playwright/ui-a11y-gestures.config.ts
 *
 * Without UI_BASE_URL the tests skip with an explicit reason — they are never
 * reported as passed. Authenticated operational screens (drawer/KDS/orders)
 * are out of scope for this file because reaching them needs a real session.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/ui-a11y-gestures.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    // A service worker would serve requests that `page.route` never sees.
    serviceWorkers: "block",
  },
});
