/**
 * Per-route document titles for the partner console (A11Y-L5).
 *
 * App.tsx is the single router, so it derives document.title from the
 * pathname here instead of shipping one static `<title>` for every screen —
 * which made tabs, history entries and screen-reader window titles useless.
 */
const SUFFIX = 'Burgonomics Partner';

const ROUTE_TITLES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/login\/?$/, 'Sign In'],
  [/^\/kds\/?$/, 'Kitchen Display'],
  [/^\/dashboard\/?$/, 'Dashboard'],
  [/^\/orders(\/|$)/, 'Orders'],
  [/^\/delivery-queue(\/|$)/, 'Delivery Queue'],
  [/^\/customers(\/|$)/, 'Customers'],
  [/^\/chat(\/|$)/, 'Chat'],
  [/^\/tickets(\/|$)/, 'Tickets'],
  [/^\/menu(\/|$)/, 'Menu & Stock'],
  [/^\/notifications(\/|$)/, 'Notifications'],
  [/^\/settings(\/|$)/, 'Settings'],
  [/^\/branches(\/|$)/, 'Branches'],
  [/^\/analytics(\/|$)/, 'Analytics'],
  [/^\/users(\/|$)/, 'Users'],
  [/^\/admin(\/|$)/, 'Control Room'],
];

/** Full document title for a pathname; unknown paths keep the brand title. */
export function titleForPath(pathname: string): string {
  const match = ROUTE_TITLES.find(([pattern]) => pattern.test(pathname));
  return match ? `${match[1]} · ${SUFFIX}` : SUFFIX;
}
