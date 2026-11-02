import type { UserRole } from '@/types';
import {
  INDIAN_MOBILE_INVALID_MESSAGE,
  toE164IndianMobile,
} from '@/features/users/phoneNormalization';

/**
 * The exact body POST /staff/invite accepts, built once so the modal and the
 * useUsers mutation cannot drift from the server schema.
 *
 * Server contract (functions/src/modules/auth/staffInvite.ts:10-25):
 *   { name, email, phone?: E.164, role, branchIds, cityIds } — .strict(),
 *   so an unknown key (a PIN was the historical offender) is a 400.
 */
export interface StaffInviteFormValues {
  name: string;
  email: string;
  /** Raw operator input — normalized here, never before. */
  phone?: string;
  role: UserRole;
  branchIds: string[];
  cityIds: string[];
}

export interface StaffInvitePayload {
  name: string;
  email: string;
  role: UserRole;
  branchIds: string[];
  cityIds: string[];
  phone?: string;
}

/**
 * Normalizes the operator's phone to E.164 (Indian mobile → +91…).
 *
 * Throws with the operator-facing message when a non-blank number cannot be
 * normalized: sending it would only move the failure to a server 400 with a
 * schema message the form cannot show. A blank phone stays omitted (`phone` is
 * optional on the server), which is why it is not an error.
 */
export function buildStaffInvitePayload(form: StaffInviteFormValues): StaffInvitePayload {
  const name = form.name.trim();
  const email = form.email.trim();
  const rawPhone = (form.phone ?? '').trim();

  const payload: StaffInvitePayload = {
    name,
    email,
    role: form.role,
    branchIds: form.branchIds,
    cityIds: form.cityIds,
  };

  if (rawPhone) {
    const phone = toE164IndianMobile(rawPhone);
    if (!phone) throw new Error(INDIAN_MOBILE_INVALID_MESSAGE);
    payload.phone = phone;
  }

  return payload;
}
