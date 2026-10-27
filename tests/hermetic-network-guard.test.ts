/**
 * Behavioural tests for the hermetic network guard.
 *
 * Every assertion that exercises a transport installs a delegate spy first, so
 * no test can perform DNS or open a socket even while the guard is red: a
 * blocked call must throw before the delegate runs, and an allowed call is
 * observed at the delegate instead of at the network.
 */

import http from 'node:http';
import http2 from 'node:http2';
import type {
  ClientHttp2Session,
  ClientSessionOptions,
  SecureClientSessionOptions,
} from 'node:http2';
import https from 'node:https';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BLOCKED_DOMAINS,
  __getDelegateForTest,
  __setDelegateForTest,
  getHermeticGuardSnapshot,
  installHermeticNetworkGuard,
  isBlockedHostname,
  isHermeticNetworkGuardInstalled,
  restoreHermeticNetworkGuard,
} from './hermeticNetworkGuard';

const makeFakeClientRequest = () => {
  const request = {
    on: () => request,
    once: () => request,
    end: () => request,
    write: () => true,
    destroy: () => request,
  };
  return request;
};

// `http2.connect`'s public overload set rejects an explicit `undefined`
// authority even though gRPC legitimately calls it with options only.
type ConnectWithOptionalAuthority = (
  authority: string | URL | undefined,
  options?: ClientSessionOptions | SecureClientSessionOptions,
) => ClientHttp2Session;

const connectWithOptionalAuthority = http2.connect as unknown as ConnectWithOptionalAuthority;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hermetic network guard', () => {
  it('is installed by setup exactly once, without stacking wrappers', () => {
    const before = getHermeticGuardSnapshot();
    expect(before.installed).toBe(true);
    expect(before.wrapperCount).toBe(6);

    const installedRequest = http.request;
    const second = installHermeticNetworkGuard();

    expect(second.changed).toBe(false);
    expect(second.installCount).toBe(before.installCount);
    expect(http.request).toBe(installedRequest);
    expect(getHermeticGuardSnapshot().wrapperCount).toBe(6);
  });

  it('blocks http2.connect (the Firestore/gRPC transport) before the transport runs', () => {
    const delegate = vi.fn(() => ({ fakeSession: true }));
    const restoreDelegate = __setDelegateForTest('http2.connect', delegate);
    try {
      expect(() => http2.connect('https://firestore.googleapis.com:443')).toThrow(
        /HERMETIC UNIT GUARD/,
      );
      expect(() => http2.connect('firestore.googleapis.com:443')).toThrow(/HERMETIC UNIT GUARD/);
      expect(() =>
        connectWithOptionalAuthority(undefined, {
          host: 'firestore.googleapis.com',
          port: 443,
        }),
      ).toThrow(/HERMETIC UNIT GUARD/);
      expect(delegate).not.toHaveBeenCalled();
    } finally {
      restoreDelegate();
    }
  });

  it('blocks https.get and http.get, which are not intercepted by wrapping request', () => {
    const httpsDelegate = vi.fn(() => makeFakeClientRequest());
    const httpDelegate = vi.fn(() => makeFakeClientRequest());
    const restoreHttps = __setDelegateForTest('https.get', httpsDelegate);
    const restoreHttp = __setDelegateForTest('http.get', httpDelegate);
    try {
      expect(() => https.get('https://identitytoolkit.googleapis.com/v1/accounts')).toThrow(
        /HERMETIC UNIT GUARD/,
      );
      expect(() => http.get('http://firestore.googleapis.com/v1/projects')).toThrow(
        /HERMETIC UNIT GUARD/,
      );
      expect(httpsDelegate).not.toHaveBeenCalled();
      expect(httpDelegate).not.toHaveBeenCalled();
    } finally {
      restoreHttps();
      restoreHttp();
    }
  });

  it('blocks request calls across URL, string and options forms including overrides', () => {
    const httpsDelegate = vi.fn(() => makeFakeClientRequest());
    const httpDelegate = vi.fn(() => makeFakeClientRequest());
    const restoreHttps = __setDelegateForTest('https.request', httpsDelegate);
    const restoreHttp = __setDelegateForTest('http.request', httpDelegate);
    try {
      expect(() => https.request('https://securetoken.googleapis.com/v1/token')).toThrow(
        /HERMETIC UNIT GUARD/,
      );
      expect(() =>
        https.request(new URL('https://firebaseinstallations.googleapis.com/v1/installations')),
      ).toThrow(/HERMETIC UNIT GUARD/);
      expect(() =>
        https.request(new URL('https://mock-gateway.invalid/v1/charge'), {
          hostname: 'fcm.googleapis.com',
        }),
      ).toThrow(/HERMETIC UNIT GUARD/);
      expect(() =>
        https.request('https://mock-gateway.invalid/v1/charge', {
          host: 'firebase.googleapis.com:443',
        }),
      ).toThrow(/HERMETIC UNIT GUARD/);
      expect(() => http.request({ hostname: 'firebaseio.com', path: '/.json' })).toThrow(
        /HERMETIC UNIT GUARD/,
      );
      expect(httpsDelegate).not.toHaveBeenCalled();
      expect(httpDelegate).not.toHaveBeenCalled();
    } finally {
      restoreHttps();
      restoreHttp();
    }
  });

  it('blocks fetch for string, URL and Request inputs', async () => {
    const delegate = vi.fn(async () => new Response('delegated', { status: 200 }));
    const restoreDelegate = __setDelegateForTest('fetch', delegate);
    try {
      await expect(fetch('https://identitytoolkit.googleapis.com/v1/accounts')).rejects.toThrow(
        /HERMETIC UNIT GUARD/,
      );
      await expect(
        fetch(new URL('https://firestore.googleapis.com/v1/projects/live/databases')),
      ).rejects.toThrow(/HERMETIC UNIT GUARD/);
      await expect(
        fetch(new Request('https://securetoken.googleapis.com/v1/token')),
      ).rejects.toThrow(/HERMETIC UNIT GUARD/);
      expect(delegate).not.toHaveBeenCalled();
    } finally {
      restoreDelegate();
    }
  });

  it('matches blocked hosts by exact host or dot boundary, never by substring', () => {
    for (const domain of BLOCKED_DOMAINS) {
      expect(isBlockedHostname(domain)).toBe(true);
      expect(isBlockedHostname(`shard-1.${domain}`)).toBe(true);
    }
    expect(isBlockedHostname('FIREBASEIO.COM')).toBe(true);
    expect(isBlockedHostname('firestore.googleapis.com.')).toBe(true);

    // Lookalikes must keep delegating; widening these would break local fixtures.
    expect(isBlockedHostname('firestore.googleapis.com.evil.invalid')).toBe(false);
    expect(isBlockedHostname('notfirestore.googleapis.com')).toBe(false);
    expect(isBlockedHostname('evilfirebaseio.com')).toBe(false);
    expect(isBlockedHostname('cloudfunctions.net.evil.invalid')).toBe(false);
    expect(isBlockedHostname('notcloudfunctions.net')).toBe(false);
    expect(isBlockedHostname('service-abc.run.app.evil.invalid')).toBe(false);
    expect(isBlockedHostname('127.0.0.1')).toBe(false);
    expect(isBlockedHostname('localhost')).toBe(false);
    expect(isBlockedHostname('mock-gateway.invalid')).toBe(false);
  });

  it('delegates allowed .invalid and loopback hosts exactly once, without blocking', () => {
    // Proves delegation shape only. `.invalid` is reserved and the delegates
    // never call through, so no resolver query is possible here; this is not
    // evidence that an arbitrary allowed host cannot resolve.
    const httpsDelegate = vi.fn(() => makeFakeClientRequest());
    const httpDelegate = vi.fn(() => makeFakeClientRequest());
    const restoreHttps = __setDelegateForTest('https.get', httpsDelegate);
    const restoreHttp = __setDelegateForTest('http.get', httpDelegate);
    try {
      https.get('https://mock-gateway.invalid/v1/charge');
      http.get('http://127.0.0.1:9099/ping');

      expect(httpsDelegate).toHaveBeenCalledTimes(1);
      expect(httpDelegate).toHaveBeenCalledTimes(1);
      expect((httpsDelegate.mock.calls[0] as unknown[])[0]).toBe(
        'https://mock-gateway.invalid/v1/charge',
      );
      expect((httpDelegate.mock.calls[0] as unknown[])[0]).toBe('http://127.0.0.1:9099/ping');
    } finally {
      restoreHttps();
      restoreHttp();
    }
  });

  it("blocks the app's live backend suffixes and Firebase-adjacent hosts", () => {
    const getDelegate = vi.fn(() => makeFakeClientRequest());
    const connectDelegate = vi.fn(() => ({ fakeSession: true }));
    const restoreGet = __setDelegateForTest('https.get', getDelegate);
    const restoreConnect = __setDelegateForTest('http2.connect', connectDelegate);
    try {
      for (const host of [
        'asia-south1-demo-burgonomics-partner.cloudfunctions.net',
        'asia-south1-burgonomics-7faa8.cloudfunctions.net',
        'service-abc123-uc.a.run.app',
        'demo-burgonomics-partner.firebaseapp.com',
      ] as const) {
        expect(isBlockedHostname(host)).toBe(true);
        expect(() => https.get(`https://${host}/api/health`)).toThrow(/HERMETIC UNIT GUARD/);
      }
      for (const host of [
        'oauth2.googleapis.com',
        'fcmregistrations.googleapis.com',
        'firebaseappcheck.googleapis.com',
      ] as const) {
        expect(isBlockedHostname(host)).toBe(true);
        expect(() => connectWithOptionalAuthority(`https://${host}:443`)).toThrow(
          /HERMETIC UNIT GUARD/,
        );
      }
      expect(getDelegate).not.toHaveBeenCalled();
      expect(connectDelegate).not.toHaveBeenCalled();
    } finally {
      restoreGet();
      restoreConnect();
    }
  });

  it('a stale delegate restore cannot resurrect a dead-generation delegate', () => {
    expect(isHermeticNetworkGuardInstalled()).toBe(true);
    const preludeDelegate = vi.fn(async () => new Response('prelude'));
    const deadDelegate = vi.fn(async () => new Response('dead'));
    const liveDelegate = vi.fn(async () => new Response('live'));

    // The abandoned closure's `previous` must be a sentinel, not the pristine
    // original: writing that back would equal the fresh generation's delegate
    // and the assertion below would be vacuous.
    __setDelegateForTest('fetch', preludeDelegate);
    const restoreDead = __setDelegateForTest('fetch', deadDelegate); // previous = prelude
    const restoreLive = __setDelegateForTest('fetch', liveDelegate); // previous = dead

    expect(restoreHermeticNetworkGuard()).toBe(true);
    installHermeticNetworkGuard();
    const freshDelegate = __getDelegateForTest('fetch');
    expect(freshDelegate).toBeDefined();
    // Non-vacuity: every sentinel is distinct from the fresh delegate.
    expect(freshDelegate).not.toBe(preludeDelegate);
    expect(freshDelegate).not.toBe(deadDelegate);
    expect(freshDelegate).not.toBe(liveDelegate);

    // Invoke the actually-abandoned dead-generation closure against the new
    // generation. A write of its `previous` (preludeDelegate) would fail here.
    restoreDead();
    expect(__getDelegateForTest('fetch')).toBe(freshDelegate);

    restoreLive();
    expect(__getDelegateForTest('fetch')).toBe(freshDelegate);

    expect(preludeDelegate).not.toHaveBeenCalled();
    expect(deadDelegate).not.toHaveBeenCalled();
    expect(liveDelegate).not.toHaveBeenCalled();
  });

  it('restore puts the originals back and install restores a single fresh layer', () => {
    const wrappedRequest = http.request;
    expect(restoreHermeticNetworkGuard()).toBe(true);
    expect(isHermeticNetworkGuardInstalled()).toBe(false);
    expect(http.request).not.toBe(wrappedRequest);

    const pristineRequest = http.request;
    const reinstall = installHermeticNetworkGuard();
    expect(reinstall.changed).toBe(true);
    expect(http.request).not.toBe(pristineRequest);
    expect(getHermeticGuardSnapshot().wrapperCount).toBe(6);

    expect(restoreHermeticNetworkGuard()).toBe(true);
    expect(http.request).toBe(pristineRequest);

    // Leave the file guarded for the remaining tests.
    installHermeticNetworkGuard();
    expect(isHermeticNetworkGuardInstalled()).toBe(true);
  });

  it('vi.stubGlobal / vi.restoreAllMocks cannot silently remove the guard', async () => {
    expect(isHermeticNetworkGuardInstalled()).toBe(true);

    // Delegates are set first, so even if a restore stripped a wrapper the test
    // could not reach the network; the guard must throw before these run.
    const fetchDelegate = vi.fn(async () => new Response('delegated'));
    const getDelegate = vi.fn(() => makeFakeClientRequest());
    const restoreFetch = __setDelegateForTest('fetch', fetchDelegate);
    const restoreGet = __setDelegateForTest('https.get', getDelegate);
    try {
      const guardedFetch = globalThis.fetch;
      vi.stubGlobal('fetch', vi.fn(async () => new Response('stubbed')));
      expect(globalThis.fetch).not.toBe(guardedFetch);
      vi.unstubAllGlobals();
      expect(globalThis.fetch).toBe(guardedFetch);
      await expect(fetch('https://identitytoolkit.googleapis.com/v1/accounts')).rejects.toThrow(
        /HERMETIC UNIT GUARD/,
      );

      const guardedHttpsRequest = https.request;
      vi.spyOn(https, 'request');
      vi.restoreAllMocks();
      expect(https.request).toBe(guardedHttpsRequest);
      expect(() => https.get('https://securetoken.googleapis.com/v1/token')).toThrow(
        /HERMETIC UNIT GUARD/,
      );
      expect(fetchDelegate).not.toHaveBeenCalled();
      expect(getDelegate).not.toHaveBeenCalled();
    } finally {
      restoreFetch();
      restoreGet();
    }
  });

  it('reports the host without echoing URL paths or query credentials', async () => {
    const delegate = vi.fn(async () => new Response('delegated'));
    const restoreDelegate = __setDelegateForTest('fetch', delegate);
    try {
      const error = await fetch(
        'https://identitytoolkit.googleapis.com/v1/accounts:signIn?key=SECRET_TOKEN_VALUE',
      ).then(
        () => null,
        (caught: unknown) => caught as Error,
      );
      expect(error).toBeInstanceOf(Error);
      if (!error) throw new Error('expected the guard to reject the live endpoint');
      expect(error.message).toContain('HERMETIC UNIT GUARD');
      expect(error.message).toContain('identitytoolkit.googleapis.com');
      expect(error.message).not.toContain('SECRET_TOKEN_VALUE');
      expect(delegate).not.toHaveBeenCalled();
    } finally {
      restoreDelegate();
    }
  });
});
