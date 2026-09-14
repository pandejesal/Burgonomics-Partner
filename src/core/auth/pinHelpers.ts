import type { UserRole } from '@/types';

/**
 * Staff-PIN helpers — FAIL-CLOSED by design.
 *
 * `hashPinSimple` / `verifyStaffPin` are pure rate-limiting primitives
 * (attempt counting + 15-minute lockout). They are NOT authentication:
 * the bundle is public and the toy hash is reversible, so verifying a PIN
 * client-side can never mint a session.
 *
 * The ONLY supported PIN sign-in path is `exchangePinForCustomToken`, which
 * requires a server endpoint (Cloud Function checking a salted hash and
 * returning a Firebase custom token). Until that endpoint exists the stub
 * below rejects every exchange, and `AuthContext` keeps no PIN roster —
 * every PIN fails closed. Do NOT re-add demo PINs or client-minted sessions.
 */

export interface StaffPinSession {
  staffId: string;
  name: string;
  role: UserRole;
  branchId: string;
  hashedPin: string;
  failedAttempts: number;
  lockedUntilTimestamp: number | null;
}

export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 15 * 60 * 1000;

export interface VerifyPinResult {
  success: boolean;
  isLocked: boolean;
  remainingAttempts: number;
  error?: string;
  session: StaffPinSession;
}

/** Toy non-cryptographic hash for keypad rate-limit bookkeeping only. */
export function hashPinSimple(pin: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < pin.length; i++) {
    h ^= pin.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `pin1_${h.toString(16).padStart(8, '0')}`;
}

export function verifyStaffPin(
  session: StaffPinSession,
  pin: string,
  now: number = Date.now()
): VerifyPinResult {
  // Still inside a lockout window: reject without touching the counter.
  if (session.lockedUntilTimestamp != null && now < session.lockedUntilTimestamp) {
    const mins = Math.max(1, Math.ceil((session.lockedUntilTimestamp - now) / 60000));
    return {
      success: false,
      isLocked: true,
      remainingAttempts: 0,
      error: `PIN entry is locked due to multiple failed attempts. Try again in ${mins} minute(s).`,
      session,
    };
  }

  // Lockout expired: reset the counter before evaluating this attempt.
  const base: StaffPinSession =
    session.lockedUntilTimestamp != null && now >= session.lockedUntilTimestamp
      ? { ...session, failedAttempts: 0, lockedUntilTimestamp: null }
      : session;

  if (hashPinSimple(pin) === base.hashedPin) {
    return {
      success: true,
      isLocked: false,
      remainingAttempts: MAX_PIN_ATTEMPTS,
      session: { ...base, failedAttempts: 0, lockedUntilTimestamp: null },
    };
  }

  const failedAttempts = base.failedAttempts + 1;
  if (failedAttempts >= MAX_PIN_ATTEMPTS) {
    return {
      success: false,
      isLocked: true,
      remainingAttempts: 0,
      error: 'Too many incorrect attempts. Terminal locked for 15 minutes.',
      session: { ...base, failedAttempts, lockedUntilTimestamp: now + PIN_LOCKOUT_MS },
    };
  }

  const remaining = MAX_PIN_ATTEMPTS - failedAttempts;
  return {
    success: false,
    isLocked: false,
    remainingAttempts: remaining,
    error: `Incorrect PIN. ${remaining} attempt(s) remaining.`,
    session: { ...base, failedAttempts },
  };
}

/**
 * Server PIN exchange — the only legitimate PIN sign-in path.
 * Rejects until a server endpoint (salted-hash check → Firebase custom
 * token) is wired. Callers must treat rejection as "use operator login".
 */
export async function exchangePinForCustomToken(
  _pin: string,
  _staffId?: string
): Promise<never> {
  throw new Error(
    'PIN sign-in is disabled: server PIN exchange is not configured. Use operator email login.'
  );
}
