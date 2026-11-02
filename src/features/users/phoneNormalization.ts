/**
 * Staff-invite phone normalization (api-contract-audit item 8).
 *
 * POST /staff/invite validates its body with InviteStaffSchema
 * (functions/src/modules/auth/staffInvite.ts:10-25), whose phone field is
 *
 *   z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Phone must be E.164 (+country code, digits only)")
 *
 * The modal accepted a raw "9876543210", so every invite carrying a phone
 * answered 400. These helpers convert an INDIAN mobile to E.164 before the call
 * and return null for anything else, so the form can say what is wrong instead
 * of forwarding a number the server will reject.
 *
 * The validator is deliberately stricter than the server regex: a pass here
 * must always satisfy /^\+[1-9]\d{7,14}$/, never the other way round. Indian
 * mobiles are 10 digits starting 6-9; the retired placeholder
 * "+91 98765 00000" and all-same-digit numbers are refused for the same reason
 * AdminStoresPage.normalizeIndianMobile refuses them — they are fixtures, not
 * reachable numbers.
 */

/** Shown by the invite form when the number cannot be normalized. */
export const INDIAN_MOBILE_INVALID_MESSAGE =
  'Enter a valid 10-digit Indian mobile number (for example 98765 43210). It is sent as +91.';

/** True when the value is a plausible Indian mobile after digit extraction. */
function indianNationalDigits(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  // Leading country code (91) on a 12-digit string.
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  // Trunk prefix 0 on an 11-digit string.
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  // Reject fixture/placeholder shapes rather than registering them.
  if (digits === '9876500000' || /^(\d)\1{9}$/.test(digits)) return null;
  return digits;
}

/**
 * Converts a user-typed Indian mobile into E.164 (`+91XXXXXXXXXX`), or returns
 * null when it is not a valid Indian mobile. Idempotent: an already-normalized
 * `+91…` value comes back unchanged.
 */
export function toE164IndianMobile(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const digits = indianNationalDigits(raw.trim());
  if (!digits) return null;
  return `+91${digits}`;
}

/**
 * Form-field helper: returns the E.164 value or the message to display.
 * Callers that need to keep the field optional should treat a blank value as
 * "no phone" BEFORE calling this.
 */
export function normalizeStaffPhone(raw: string): { ok: true; phone: string } | { ok: false; message: string } {
  const phone = toE164IndianMobile(raw);
  if (!phone) return { ok: false, message: INDIAN_MOBILE_INVALID_MESSAGE };
  return { ok: true, phone };
}
