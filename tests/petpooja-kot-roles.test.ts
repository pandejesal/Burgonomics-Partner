import { describe, expect, it } from 'vitest';
import type { UserRole } from '../src/types';
import {
  KOT_RESOLVE_ROLES,
  canResolvePetpoojaKot,
} from '../src/services/petpoojaKotRoles';

/**
 * Item 4: the resolve control must be offered only to roles the server accepts
 * on POST /petpooja/resolveKot (functions/src/index.ts:742-746):
 *   requireRole(["brand_owner", "developer", "branch_owner", "branch_staff"])
 */
describe('KOT resolve role matrix mirrors the server gate', () => {
  it('grants exactly the four server-accepted roles', () => {
    expect([...KOT_RESOLVE_ROLES].sort()).toEqual([
      'branch_owner',
      'branch_staff',
      'brand_owner',
      'developer',
    ]);
  });

  it.each<[UserRole, boolean]>([
    ['brand_owner', true],
    ['developer', true],
    ['branch_owner', true],
    ['branch_staff', true],
    // Read orders, but the server refuses these two on the resolve route.
    ['support', false],
    ['regional_manager', false],
    ['customer', false],
  ])('%s -> %s', (role, expected) => {
    expect(canResolvePetpoojaKot(role)).toBe(expected);
  });

  it('fails closed for an absent or unknown role', () => {
    expect(canResolvePetpoojaKot(undefined)).toBe(false);
    expect(canResolvePetpoojaKot(null)).toBe(false);
    expect(canResolvePetpoojaKot('')).toBe(false);
    expect(canResolvePetpoojaKot('franchise_partner')).toBe(false);
  });
});
