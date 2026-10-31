import { describe, it, expect } from 'vitest';

// F7: useTicket.addMessage took an `authorRole` prop from the calling screen,
// so any branch staff could append a brand_owner-privileged entry to a
// ticket's audit timeline. The fallback path now derives the role from the
// session store and fails closed to the least-privileged staff role.

import { resolveTicketActorRole } from '../src/utils/ticketActorRole';

describe('F7 — ticket timeline actor role is session-derived and fail-closed', () => {
  it('uses the session role when one resolves', () => {
    expect(resolveTicketActorRole('brand_owner')).toBe('brand_owner');
    expect(resolveTicketActorRole('support')).toBe('support');
    expect(resolveTicketActorRole('branch_staff')).toBe('branch_staff');
  });

  it('fails closed to branch_staff for a missing session role', () => {
    expect(resolveTicketActorRole(null)).toBe('branch_staff');
    expect(resolveTicketActorRole(undefined)).toBe('branch_staff');
    expect(resolveTicketActorRole('')).toBe('branch_staff');
  });

  it('never falls back to a privileged claim', () => {
    // The old contract let the calling screen pass its own role; nothing in
    // this resolver may default upward, and no unrecognised value may be
    // stamped through.
    for (const input of [null, undefined, '', '   ', '\t\n']) {
      expect(resolveTicketActorRole(input)).toBe('branch_staff');
    }
  });
});
