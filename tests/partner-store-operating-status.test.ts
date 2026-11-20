import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Rule C (owner decision, fix wave 2026-11-20): a staff "close" in the Partner
 * app must stop customer ordering AND outrank a later Petpooja "open" until staff
 * reopen the outlet.
 *
 * The Partner toggle used to write ONLY `branches/{id}.acceptingOrdersStatus`
 * (or, on the admin console, only `admin_stores`). Neither is the gate the
 * customer app reads (`stores|admin_stores .isOpen`), so an operator "closed"
 * left customers able to order, and a POS "open" simply overwrote the flag.
 *
 * The gate lives behind Firestore rules the branch roles cannot write
 * (`stores/{id}` = brand-owner only; `admin_stores` branch arm allows 8 metadata
 * keys and not `isOpen`), so the ONLY honest path is the server route
 * `POST /stores/setOperatingStatus`.
 */

vi.mock('@/config/firebase', () => ({
  auth: { currentUser: null },
  getAppCheckToken: async () => null,
}));

import { partnerFunctionsApi } from '../src/services/partnerFunctionsApi';
import {
  applyStaffStoreStatus,
  storeBranchIdFor,
} from '../src/features/stores/services/storeOperatingStatus';

describe('POST /stores/setOperatingStatus — the staff open/close gate', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('VITE_FUNCTIONS_API_URL', 'https://example.invalid/api');
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it('posts branchId + status + reason to the server route (never a client Firestore write)', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = (async (url: any, init: any) => {
      seen.url = String(url);
      seen.init = init;
      return new Response(
        JSON.stringify({
          success: true,
          branchId: 'branch_1',
          status: 'closed',
          storeId: 'store_1',
          storeStatusOverride: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as any;

    const result = await partnerFunctionsApi.setStoreOperatingStatus({
      branchId: 'branch_1',
      status: 'closed',
      reason: 'Gas leak in the kitchen',
    });

    expect(seen.url).toBe('https://example.invalid/api/stores/setOperatingStatus');
    expect(seen.init?.method).toBe('POST');
    expect(JSON.parse(String(seen.init?.body))).toEqual({
      branchId: 'branch_1',
      status: 'closed',
      reason: 'Gas leak in the kitchen',
    });
    expect(result.storeStatusOverride).toBe(true);
  });

  it('surfaces a server refusal instead of assuming the gate moved', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ code: 'STOREFRONT_AMBIGUOUS', error: 'Two storefronts claim this outlet' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      )) as any;

    await expect(
      partnerFunctionsApi.setStoreOperatingStatus({ branchId: 'branch_1', status: 'closed' }),
    ).rejects.toMatchObject({ status: 409, code: 'STOREFRONT_AMBIGUOUS' });
  });
});

describe('applyStaffStoreStatus — one path for every Partner open/close control', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('VITE_FUNCTIONS_API_URL', 'https://example.invalid/api');
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it('returns the server-confirmed state for a close (override now in force)', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: true,
          branchId: 'branch_1',
          status: 'closed',
          storeId: 'store_1',
          storeStatusOverride: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as any;

    const res = await applyStaffStoreStatus({ branchId: 'branch_1', status: 'closed' });
    expect(res.status).toBe('closed');
    expect(res.storeStatusOverride).toBe(true);
    expect(res.storeId).toBe('store_1');
  });

  it('clears the override on a reopen (Petpooja owns open/closed again)', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: true,
          branchId: 'branch_1',
          status: 'open',
          storeId: 'store_1',
          storeStatusOverride: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as any;

    const res = await applyStaffStoreStatus({ branchId: 'branch_1', status: 'open' });
    expect(res.storeStatusOverride).toBe(false);
  });

  it('throws the server message, so no caller can toast success on a refusal', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          code: 'STOREFRONT_NOT_LINKED',
          error: 'This outlet is not linked to a storefront — nothing was saved.',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      )) as any;

    await expect(
      applyStaffStoreStatus({ branchId: 'branch_1', status: 'open' }),
    ).rejects.toThrow(/not linked to a storefront/);
  });
});

describe('storeBranchIdFor — the outlet a directory row belongs to', () => {
  it('prefers the explicit partner branch link', () => {
    expect(storeBranchIdFor({ partnerBranchId: 'branch_1', branchId: 'legacy_2' })).toBe(
      'branch_1',
    );
  });

  it('falls back to the legacy branchId key', () => {
    expect(storeBranchIdFor({ branchId: 'branch_2' })).toBe('branch_2');
  });

  it('returns null when the row carries no branch link at all', () => {
    expect(storeBranchIdFor({ name: 'Adajan' })).toBeNull();
    expect(storeBranchIdFor(null)).toBeNull();
  });
});
