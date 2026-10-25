import { Capacitor } from '@capacitor/core';

/**
 * Deep-link navigation for the partner app.
 *
 * Native builds mount `HashRouter` (App.tsx) because `BrowserRouter` cannot
 * resolve deep paths on a `file://` document — so assigning
 * `window.location.href = '/orders/x'` on device navigated the WebView to a
 * literal `file:///orders/x` document that does not exist, and the in-app
 * router never saw the route. Web keeps `BrowserRouter` and must NOT be given
 * a hash path.
 *
 * Returns the assignment target for the current platform:
 *   native  → `#/orders/x` (HashRouter)
 *   web     → `/orders/x`  (BrowserRouter)
 */
export function inAppRouteHref(path: string, native?: boolean): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const isNative = native ?? Capacitor.isNativePlatform();
  return isNative ? `#${normalized}` : normalized;
}

/**
 * Navigates the SPA to an in-app route on either router flavour. No full
 * reload: assigning hash/path lets react-router react in place.
 */
export function navigateInApp(path: string): void {
  if (typeof window === 'undefined') return;
  const target = inAppRouteHref(path);
  if (target.startsWith('#')) {
    window.location.hash = target;
  } else {
    window.location.href = target;
  }
}

/**
 * Picks the outlet a push deep-link should open, clamped to the session's
 * RBAC scope. The UI selection is user-writable (localStorage), so a
 * `branchId` carried in a push payload must never widen access — it is only
 * honoured when `resolveScopedBranchIds` already allows it. Returns null when
 * nothing safe can be selected (caller navigates without changing outlet).
 */
export function clampPushBranchSelection(
  payloadBranchId: string | null | undefined,
  scopedBranchIds: string[]
): string | null {
  if (!payloadBranchId) return null;
  return scopedBranchIds.includes(payloadBranchId) ? payloadBranchId : null;
}
