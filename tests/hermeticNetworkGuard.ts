/**
 * Hermetic network guard for the partner unit-test lane.
 *
 * Why this exists: the Firebase SDKs, the Firestore node transport (`@grpc/grpc-js`
 * over `http2`) and the local integrations all reach the network through a small
 * set of Node primitives. Unit tests must fail loudly *before* DNS/TCP whenever
 * code under test would touch a live Firebase/Google backend.
 *
 * Covered primitives:
 * - `globalThis.fetch`
 * - `http.request` / `http.get`
 * - `https.request` / `https.get`
 * - `http2.connect` (the gRPC transport used by `firebase/firestore` in Node)
 *
 * `http.get`/`https.get` are wrapped separately on purpose: in Node they are
 * module-local closures over `request`, so patching only `request` does not
 * intercept them.
 *
 * Matching is exact-host or dot-boundary suffix — never substring. A host like
 * `identitytoolkit.googleapis.com.evil.invalid` or `notfirestore.googleapis.com`
 * is therefore not treated as live, and the allow path cannot be widened by
 * embedding a blocked domain in an attacker-controlled name.
 *
 * Lifecycle (chosen deliberately):
 * - Installed exactly once per test file by `vitest.setup.ts`, at setup time,
 *   before the test module graph is imported. Every later `vi.spyOn` /
 *   `vi.stubGlobal` snapshot therefore captures the guarded wrapper, so
 *   `vi.restoreAllMocks` / `vi.unstubAllGlobals` restore *to the guard* rather
 *   than silently removing it.
 * - Installation is idempotent and keyed by a `Symbol.for` state on
 *   `globalThis`. A second setup file (or a re-run in the same process) is a
 *   no-op, so wrappers cannot nest across files.
 * - `restoreHermeticNetworkGuard()` in the setup's `afterAll` puts the captured
 *   originals back, but only for entries whose current value is still our own
 *   wrapper. A wrapper that a test deliberately replaced is left alone.
 * - Test isolation is never disabled and no global behaviour is patched beyond
 *   the six transports above.
 *
 * Failure mode: throw synchronously from the wrapper, before the delegate runs.
 * The delegate is never invoked for a blocked host, so no socket, DNS lookup or
 * TLS handshake can occur even while a test is red.
 */

import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';

const GUARD_MARKER = '[HERMETIC UNIT GUARD]';

/**
 * Live backends a unit test must never reach. Each entry matches the exact host
 * and every subdomain of it. `firebaseio.com` is intentionally a suffix entry
 * (realtime-database shards are `<name>.firebaseio.com`).
 *
 * Scope note: this is the set of Firebase/Google hosts this lane knows about,
 * not a capability sandbox. Redirects from allowed hosts and raw `net`/`tls`
 * transports are out of scope (see REPORT residual risk).
 */
export const BLOCKED_DOMAINS = Object.freeze([
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firestore.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebaseappcheck.googleapis.com',
  'fcm.googleapis.com',
  'fcmregistrations.googleapis.com',
  'oauth2.googleapis.com',
  'firebase.googleapis.com',
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'www.googleapis.com',
  'firebaseio.com',
  'firebaseapp.com',
  // The app's only other live backend: Google Cloud Functions (and Cloud Run),
  // whose hosts are regional `<region>-<project>.cloudfunctions.net` /
  // `*.a.run.app`.
  'cloudfunctions.net',
  'run.app',
]);

const GUARDED_TRANSPORTS = [
  'fetch',
  'http.request',
  'http.get',
  'https.request',
  'https.get',
  'http2.connect',
] as const;

export type GuardedTransport = (typeof GUARDED_TRANSPORTS)[number];

type AnyTransport = (this: unknown, ...args: unknown[]) => unknown;

interface GuardState {
  installed: boolean;
  installCount: number;
  originals: Partial<Record<GuardedTransport, AnyTransport>>;
  delegates: Partial<Record<GuardedTransport, AnyTransport>>;
  wrappers: Partial<Record<GuardedTransport, AnyTransport>>;
}

const STATE_KEY = Symbol.for('burgonomics.hermetic-network-guard.v1');

const globalStore = globalThis as unknown as Record<symbol, GuardState | undefined>;

const getState = (): GuardState => {
  const existing = globalStore[STATE_KEY];
  if (existing) return existing;
  const created: GuardState = {
    installed: false,
    installCount: 0,
    originals: {},
    delegates: {},
    wrappers: {},
  };
  globalStore[STATE_KEY] = created;
  return created;
};

/** Strip scheme, userinfo, brackets and a numeric port; lowercase the result. */
const normalizeHostname = (raw: string): string => {
  let host = raw.trim().toLowerCase();
  if (!host) return '';

  // Deliberate non-goal: a non-numeric port (`host:abc`) or an unbracketed IPv6
  // literal is left unmatched. Node rejects both before creating a transport
  // (`ERR_INVALID_URL` / `ERR_INVALID_ARG_TYPE`), so treating them as a host
  // would only add a false-positive path. Do not "fix" this into a substring
  // match — exact/dot-boundary is the security property.
  if (host.startsWith('//')) host = `https:${host}`;
  if (host.includes('://')) {
    try {
      return new URL(host).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  if (host.startsWith('[')) {
    const closing = host.indexOf(']');
    if (closing !== -1) return host.slice(1, closing);
  }

  const lastColon = host.lastIndexOf(':');
  if (lastColon !== -1 && /^\d+$/.test(host.slice(lastColon + 1))) {
    host = host.slice(0, lastColon);
  }
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  return host.replace(/\.$/, '');
};

/** Exact host or dot-boundary subdomain match. Never a substring match. */
export const isBlockedHostname = (value: string): boolean => {
  const hostname = normalizeHostname(value);
  if (!hostname) return false;
  return BLOCKED_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
};

const isOptionsObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !(value instanceof URL);

const addOptionsHosts = (options: Record<string, unknown>, hosts: string[]): void => {
  for (const key of ['hostname', 'host', 'authority'] as const) {
    const value = options[key];
    if (typeof value === 'string' && value.trim()) {
      addHostCandidate(value, hosts);
    } else if (value instanceof URL) {
      hosts.push(value.hostname);
    }
  }
};

const addHostCandidate = (candidate: unknown, hosts: string[]): void => {
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed) return;
    if (trimmed.includes('://') || trimmed.startsWith('//')) {
      try {
        hosts.push(new URL(trimmed.startsWith('//') ? `https:${trimmed}` : trimmed).hostname);
        return;
      } catch {
        // Fall through to authority-style parsing.
      }
    }
    const hostname = normalizeHostname(trimmed);
    if (hostname) hosts.push(hostname);
    return;
  }
  if (candidate instanceof URL) {
    hosts.push(candidate.hostname);
    return;
  }
  if (!isOptionsObject(candidate)) return;
  // `Request` carries its destination as `url`; options objects as host fields.
  if (typeof candidate.url === 'string') addHostCandidate(candidate.url, hosts);
  addOptionsHosts(candidate, hosts);
};

const extractCallHosts = (
  args: readonly unknown[],
  secondArgIsOptions: boolean,
): string[] => {
  const hosts: string[] = [];
  if (args.length > 0) addHostCandidate(args[0], hosts);
  if (secondArgIsOptions && args.length > 1 && isOptionsObject(args[1])) {
    addOptionsHosts(args[1], hosts);
  }
  return hosts;
};

const assertHostsAllowed = (hosts: readonly string[], transport: GuardedTransport): void => {
  for (const host of hosts) {
    if (!isBlockedHostname(host)) continue;
    // Only the hostname is echoed: URLs can carry API keys in query strings.
    throw new Error(
      `${GUARD_MARKER} Blocked an accidental live Firebase/Google request via ${transport} to ` +
        `"${normalizeHostname(host)}". Unit tests must mock the service or use a local fixture.`,
    );
  }
};

const callDelegate = (transport: GuardedTransport, args: readonly unknown[]): unknown => {
  const delegate = getState().delegates[transport];
  if (!delegate) {
    throw new Error(
      `${GUARD_MARKER} No delegate registered for ${transport}; the guard is not installed.`,
    );
  }
  return delegate.apply(globalThis, args as unknown[]);
};

const guardedFetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  assertHostsAllowed(extractCallHosts([input], false), 'fetch');
  return callDelegate('fetch', [input, init]) as Promise<Response>;
}) as typeof fetch;

const guardedHttpRequest = ((...args: unknown[]) => {
  assertHostsAllowed(extractCallHosts(args, true), 'http.request');
  return callDelegate('http.request', args);
}) as unknown as typeof http.request;

const guardedHttpGet = ((...args: unknown[]) => {
  assertHostsAllowed(extractCallHosts(args, true), 'http.get');
  return callDelegate('http.get', args);
}) as unknown as typeof http.get;

const guardedHttpsRequest = ((...args: unknown[]) => {
  assertHostsAllowed(extractCallHosts(args, true), 'https.request');
  return callDelegate('https.request', args);
}) as unknown as typeof https.request;

const guardedHttpsGet = ((...args: unknown[]) => {
  assertHostsAllowed(extractCallHosts(args, true), 'https.get');
  return callDelegate('https.get', args);
}) as unknown as typeof https.get;

const guardedHttp2Connect = ((...args: unknown[]) => {
  assertHostsAllowed(extractCallHosts(args, true), 'http2.connect');
  return callDelegate('http2.connect', args);
}) as unknown as typeof http2.connect;

type PatchableHttpModule = {
  request: AnyTransport;
  get: AnyTransport;
};
type PatchableHttpsModule = PatchableHttpModule;
type PatchableHttp2Module = { connect: AnyTransport };

const httpModule = http as unknown as PatchableHttpModule;
const httpsModule = https as unknown as PatchableHttpsModule;
const http2Module = http2 as unknown as PatchableHttp2Module;

const readTransport = (transport: GuardedTransport): AnyTransport | undefined => {
  switch (transport) {
    case 'fetch':
      return typeof globalThis.fetch === 'function'
        ? (globalThis.fetch as unknown as AnyTransport)
        : undefined;
    case 'http.request':
      return httpModule.request;
    case 'http.get':
      return httpModule.get;
    case 'https.request':
      return httpsModule.request;
    case 'https.get':
      return httpsModule.get;
    case 'http2.connect':
      return http2Module.connect;
  }
};

const writeTransport = (transport: GuardedTransport, value: AnyTransport): void => {
  switch (transport) {
    case 'fetch':
      globalThis.fetch = value as typeof fetch;
      return;
    case 'http.request':
      httpModule.request = value;
      return;
    case 'http.get':
      httpModule.get = value;
      return;
    case 'https.request':
      httpsModule.request = value;
      return;
    case 'https.get':
      httpsModule.get = value;
      return;
    case 'http2.connect':
      http2Module.connect = value;
      return;
  }
};

const WRAPPERS: Record<GuardedTransport, AnyTransport> = {
  fetch: guardedFetch as unknown as AnyTransport,
  'http.request': guardedHttpRequest as unknown as AnyTransport,
  'http.get': guardedHttpGet as unknown as AnyTransport,
  'https.request': guardedHttpsRequest as unknown as AnyTransport,
  'https.get': guardedHttpsGet as unknown as AnyTransport,
  'http2.connect': guardedHttp2Connect as unknown as AnyTransport,
};

export interface GuardInstallResult {
  /** False when the guard was already installed (idempotent call). */
  changed: boolean;
  installCount: number;
}

/**
 * Install the guard once. Repeat calls are no-ops and never stack wrappers.
 */
export const installHermeticNetworkGuard = (): GuardInstallResult => {
  const state = getState();
  if (state.installed) {
    return { changed: false, installCount: state.installCount };
  }

  const originals: Partial<Record<GuardedTransport, AnyTransport>> = {};
  for (const transport of GUARDED_TRANSPORTS) {
    const current = readTransport(transport);
    if (current) originals[transport] = current;
  }
  state.originals = originals;
  state.delegates = { ...originals };

  for (const transport of GUARDED_TRANSPORTS) {
    if (!originals[transport]) continue;
    writeTransport(transport, WRAPPERS[transport]);
    state.wrappers[transport] = WRAPPERS[transport];
  }

  state.installed = true;
  state.installCount += 1;
  return { changed: true, installCount: state.installCount };
};

/**
 * Restore the captured originals. Returns true when at least one transport was
 * still ours and was put back. Entries a test replaced itself are left as-is
 * (we only ever undo what we installed).
 */
export const restoreHermeticNetworkGuard = (): boolean => {
  const state = getState();
  if (!state.installed) return false;

  let restoredAny = false;
  for (const transport of GUARDED_TRANSPORTS) {
    const original = state.originals[transport];
    const wrapper = state.wrappers[transport];
    if (!original || !wrapper) continue;
    if (readTransport(transport) !== wrapper) continue;
    writeTransport(transport, original);
    restoredAny = true;
  }

  state.installed = false;
  state.originals = {};
  state.delegates = {};
  state.wrappers = {};
  return restoredAny;
};

export const isHermeticNetworkGuardInstalled = (): boolean => getState().installed;

export interface HermeticGuardSnapshot {
  installed: boolean;
  installCount: number;
  wrapperCount: number;
}

export const getHermeticGuardSnapshot = (): HermeticGuardSnapshot => {
  const state = getState();
  return {
    installed: state.installed,
    installCount: state.installCount,
    wrapperCount: Object.keys(state.wrappers).length,
  };
};

/**
 * Test-only: the function the installed wrapper currently delegates to.
 * Used to prove that a stale restore closure cannot resurrect a delegate from
 * a previous guard generation. Returns undefined when not installed.
 */
export const __getDelegateForTest = (
  transport: GuardedTransport,
): AnyTransport | undefined => {
  const state = getState();
  return state.installed ? state.delegates[transport] : undefined;
};

/**
 * Test-only seam: swap the function a guarded wrapper delegates to, so a test
 * can prove "blocked before the transport ran" without any chance of egress.
 * Returns a restore function. Requires an installed guard (fails closed).
 */
export const __setDelegateForTest = (
  transport: GuardedTransport,
  delegate: AnyTransport,
): (() => void) => {
  const state = getState();
  if (!state.installed) {
    throw new Error(
      `${GUARD_MARKER} The delegate test hook requires an installed guard; setup did not run.`,
    );
  }
  const previous = state.delegates[transport];
  state.delegates[transport] = delegate;
  return () => {
    // Never resurrect a delegate into a torn-down or re-installed guard: this
    // closure may run after afterAll cleared the maps, or after a later
    // install() started a new generation. Only undo our own write.
    if (!state.installed) return;
    if (state.delegates[transport] !== delegate) return;
    if (previous) state.delegates[transport] = previous;
    else delete state.delegates[transport];
  };
};
