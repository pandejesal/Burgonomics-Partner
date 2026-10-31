import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// F13: revoking a staff member used to `deleteDoc(doc(db,'users', uid))`,
// which rules hard-deny (`allow delete: if false`) — so every revoke failed
// while the dialog promised POS/KDS credentials were disabled. Access is
// revoked by clearing RBAC claims, and only the server can do that.

vi.mock('@/config/firebase', () => ({
  auth: { currentUser: null },
  getAppCheckToken: async () => null,
}));

import { partnerFunctionsApi } from '../src/services/partnerFunctionsApi';

describe('F13 — staff revocation goes through POST /auth/revokeRole', () => {
  const realFetch = globalThis.fetch;
  let seen: { url?: string; init?: RequestInit };

  beforeEach(() => {
    seen = {};
    vi.stubEnv('VITE_FUNCTIONS_API_URL', 'https://example.invalid/api');
    globalThis.fetch = (async (url: any, init: any) => {
      seen.url = String(url);
      seen.init = init;
      return new Response(
        JSON.stringify({ success: true, targetUid: 'user_1', role: 'customer' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it('POSTs the target uid to /auth/revokeRole', async () => {
    const res = await partnerFunctionsApi.revokeUserRole({ targetUid: 'user_1' });

    expect(seen.url).toBe('https://example.invalid/api/auth/revokeRole');
    expect(seen.init?.method).toBe('POST');
    expect(JSON.parse(String(seen.init?.body))).toEqual({ targetUid: 'user_1' });
    expect(res).toMatchObject({ success: true, role: 'customer' });
  });

  it('surfaces the server refusal instead of reporting a silent success', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: 'Permission denied: Only Superadmins / Brand Owners can assign RBAC roles.',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )) as any;

    await expect(partnerFunctionsApi.revokeUserRole({ targetUid: 'user_1' })).rejects.toThrow(
      /Only Superadmins \/ Brand Owners/
    );
  });
});
