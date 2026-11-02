import { describe, expect, it } from 'vitest';

/**
 * Item 8 (api-contract-audit): POST /staff/invite validates its body with
 * InviteStaffSchema (functions/src/modules/auth/staffInvite.ts:10-25):
 *
 *   phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Phone must be E.164...")
 *
 * The partner modal accepted raw digits ("9876543210"), so every invite with a
 * phone answered 400. Numbers are normalized to +91 before dispatch, and
 * anything that is not a valid Indian mobile is REJECTED with a clear message
 * rather than sent to fail server-side.
 */
import {
  INDIAN_MOBILE_INVALID_MESSAGE,
  toE164IndianMobile,
} from '../src/features/users/phoneNormalization';

/** The exact server regex — the local check must be stricter, never looser. */
const SERVER_E164 = /^\+[1-9]\d{7,14}$/;

describe('staff invite phone normalization', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['+919876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['91 98765 43210', '+919876543210'],
    ['  98765 43210  ', '+919876543210'],
  ])('normalizes %s to %s', (raw, expected) => {
    expect(toE164IndianMobile(raw)).toBe(expected);
  });

  it('every normalized value satisfies the server schema regex', () => {
    for (const raw of ['9876543210', '+919876543210', '09876543210']) {
      const normalized = toE164IndianMobile(raw);
      expect(normalized).not.toBeNull();
      expect(normalized as string).toMatch(SERVER_E164);
    }
  });

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['12345', 'too short'],
    ['1234567890', 'does not start 6-9'],
    ['0000000000', 'all zeros'],
    ['9876500000', 'the retired placeholder number'],
    ['9999999999', 'all-same-digit'],
    ['+14155550123', 'a non-Indian number'],
    ['98765abc10', 'letters'],
  ])('rejects %s (%s)', (raw) => {
    expect(toE164IndianMobile(raw)).toBeNull();
  });

  it('returns the same number for an already-normalized value (idempotent)', () => {
    const once = toE164IndianMobile('9876543210');
    expect(toE164IndianMobile(once as string)).toBe(once);
  });

  it('explains the rejection in the message the modal shows', () => {
    expect(INDIAN_MOBILE_INVALID_MESSAGE).toMatch(/\+91/);
    expect(INDIAN_MOBILE_INVALID_MESSAGE).toMatch(/10-digit|mobile/i);
  });
});
