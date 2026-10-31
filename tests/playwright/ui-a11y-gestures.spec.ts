import { expect, test, type Page } from "@playwright/test";

/**
 * Real-browser accessibility acceptance — partner app public routes.
 *
 * Scope: keyboard reachability, visible focus, label association and basic
 * document semantics on the routes that do not require a session. The
 * authenticated drawer/KDS surfaces need a real signed-in session and are
 * covered by the partner frontend lane's component tests plus the reported
 * real-browser component evidence; this file does not fabricate a session.
 *
 * Requires a served app via UI_BASE_URL (see the config header). Without it,
 * every test skips — a skip is not a pass.
 */

const base = (process.env.UI_BASE_URL ?? "").replace(/\/$/, "");
const baseOrigin = base ? new URL(base).origin : "";

// An all-skipped run exits 0, so a CI gate would go green having asserted
// nothing. Refuse to run in CI without a target.
if (process.env.CI && !base) {
  throw new Error("UI_BASE_URL is required in CI: these tests would silently skip");
}

test.skip(!base, "UI_BASE_URL is not set — start a served partner build and re-run");

const go = (page: Page, route: string) => page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });

/**
 * Hermetic rendering check: the served app may initialise Firebase/auth. This
 * test only judges semantics, so every request outside the app origin is
 * aborted — no third-party call, no auth attempt, no write can leave the page.
 * Origin comparison, not a string prefix (`base.evil.tld` also matches a
 * prefix), plus a WebSocket guard that `page.route` does not provide.
 */
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    try {
      return new URL(url).origin === baseOrigin ? route.continue() : route.abort();
    } catch {
      return route.abort();
    }
  });
  await page.routeWebSocket(/.*/, (ws) => {
    try {
      if (new URL(ws.url()).origin === baseOrigin) ws.connectToServer();
      else ws.close();
    } catch {
      ws.close();
    }
  });
});

type FocusRing = { outlineStyle: string; outlineWidth: number; boxShadow: string };

/**
 * A focus ring is only "visible" if it is authored: Chromium's user-agent
 * `:focus-visible` outline computes to `auto`/1px, so `outlineWidth !== "0px"`
 * alone passes on an app with no focus styling at all — and rejects a
 * box-shadow ring, which is what the design system uses.
 */
const focusRing = (page: Page): Promise<FocusRing> =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return { outlineStyle: "none", outlineWidth: 0, boxShadow: "none" };
    const s = getComputedStyle(el);
    return {
      outlineStyle: s.outlineStyle,
      outlineWidth: Number.parseFloat(s.outlineWidth) || 0,
      boxShadow: s.boxShadow,
    };
  });

const hasVisibleShadow = (value: string) =>
  value !== "none" &&
  value.split(/,(?![^(]*\))/).some((layer) => !/rgba?\(0,\s*0,\s*0,\s*0\)/.test(layer));

const isAuthoredRing = (ring: FocusRing) =>
  (ring.outlineStyle !== "none" && ring.outlineStyle !== "auto" && ring.outlineWidth >= 2) ||
  hasVisibleShadow(ring.boxShadow);

const activeControl = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return { tag: el?.tagName ?? "BODY", id: el?.id ?? "" };
  });

test("operator login exposes labelled email + password fields and an authored focus ring", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await go(page, "/login");

  const email = page.getByLabel(/e-?mail/i).first();
  const password = page.getByLabel(/password/i).first();
  await expect(email).toBeVisible();
  await expect(password).toBeVisible();

  await email.focus();
  const ring = await focusRing(page);
  expect(isAuthoredRing(ring), `email focus ring: ${JSON.stringify(ring)}`).toBe(true);

  // One Tab reaches the password field; a failure here is a real tab-order
  // regression, not something to paper over with a conditional second Tab.
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  expect(isAuthoredRing(await focusRing(page))).toBe(true);

  expect(errors.filter((e) => !/ERR_FAILED|ERR_ABORTED|Failed to fetch/i.test(e))).toEqual([]);
});

test("/admin/login resolves to the single operator sign-in", async ({ page }) => {
  // There is no second admin login form: the legacy route is a redirect shim.
  // Asserting the redirect is the contract; asserting another login form would
  // silently re-test /login and pass even if the admin route broke.
  await go(page, "/admin/login");
  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(page.getByLabel(/e-?mail/i).first()).toBeVisible();
});

test("document language is declared and keyboard focus advances without trapping", async ({
  page,
}) => {
  await go(page, "/login");
  expect(await page.locator("html").getAttribute("lang")).toBe("en");

  // `document.activeElement` defaults to <body>, whose tagName is "BODY", so a
  // non-empty tagName proves nothing. Compare identities across Tab presses.
  const start = await activeControl(page);
  await page.keyboard.press("Tab");
  const first = await activeControl(page);
  await page.keyboard.press("Tab");
  const second = await activeControl(page);

  expect(first.tag, "first Tab must land on a control, not <body>").not.toBe("BODY");
  expect(first.id).not.toBe(start.id);
  expect(second.id).not.toBe(first.id);
  expect(second.tag).not.toBe("BODY");
});
