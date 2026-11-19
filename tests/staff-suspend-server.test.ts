import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * F06 — "Suspend" used to be a bare client write:
 *
 *   useUsers.toggleUserStatus -> updateDoc(users/{uid}, {active})
 *
 * which the rules ADMITTED for a brand owner (`fcmTokensRemovalOnly()` is true
 * whenever fcmTokens is absent from the diff) while NOTHING in authorization
 * consulted the field. So the write landed and the operator kept working.
 *
 * Suspension is now a server-owned, audited act: POST /auth/suspendStaff. These
 * cases pin the client half — the roster toggles through the API and never
 * falls back to a Firestore write, so a refused suspension can never look
 * suspended.
 */

vi.mock('@/config/firebase', () => ({
  auth: { currentUser: null },
  getAppCheckToken: async () => null,
}));

import { partnerFunctionsApi } from '../src/services/partnerFunctionsApi';

describe('F06 — suspension goes through POST /auth/suspendStaff', () => {
  const realFetch = globalThis.fetch;
  let seen: { url?: string; init?: RequestInit };

  beforeEach(() => {
    seen = {};
    vi.stubEnv('VITE_FUNCTIONS_API_URL', 'https://example.invalid/api');
    globalThis.fetch = (async (url: any, init: any) => {
      seen.url = String(url);
      seen.init = init;
      return new Response(
        JSON.stringify({ success: true, targetUid: 'u1', active: false, changed: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it('POSTs the target uid and requested state to /auth/suspendStaff', async () => {
    const res = await partnerFunctionsApi.suspendStaff({
      targetUid: 'u1',
      active: false,
      reason: 'left',
    });

    expect(seen.url).toBe('https://example.invalid/api/auth/suspendStaff');
    expect(seen.init?.method).toBe('POST');
    expect(JSON.parse(String(seen.init?.body))).toEqual({
      targetUid: 'u1',
      active: false,
      reason: 'left',
    });
    expect(res).toMatchObject({ success: true, targetUid: 'u1', active: false });
  });

  it('sends a reactivation with active: true', async () => {
    await partnerFunctionsApi.suspendStaff({ targetUid: 'u2', active: true });
    expect(JSON.parse(String(seen.init?.body))).toMatchObject({ targetUid: 'u2', active: true });
  });

  it('surfaces the server refusal and never reports a silent success', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: 'Forbidden: this account is suspended. Contact a brand owner to restore access.',
          code: 'ACCOUNT_SUSPENDED',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )) as any;

    await expect(
      partnerFunctionsApi.suspendStaff({ targetUid: 'u1', active: false })
    ).rejects.toThrow(/suspended|Forbidden/);
  });

  it('useUsers no longer writes users/{uid}.active directly (static pin)', () => {
    const src = readFileSync(new URL('../src/hooks/useUsers.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/updateDoc\s*\(\s*userRef\s*,\s*\{\s*active/);
    expect(src).not.toMatch(/setDoc\s*\(\s*userRef\s*,\s*\S*active/);
    expect(src).toContain('suspendStaff');
    // The roster mutation must not be optimistic: only onSuccess may invalidate.
    expect(src).toMatch(/toggleUserStatus[\s\S]*suspendStaff[\s\S]*onSuccess/);
  });
});
