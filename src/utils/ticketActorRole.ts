/**
 * Ticket timeline actor-role resolution for the legacy direct-Firestore
 * fallback in useTicket.addMessage.
 *
 * The server route (POST /tickets/message) binds sender role to the verified
 * caller. The fallback has no such binding, so it must NEVER trust the role
 * the calling screen passes in props — any branch staff could otherwise append
 * a brand_owner-privileged entry to the audit timeline. The session store's
 * role is the client-side mirror of what the server authenticates against.
 *
 * Fail-closed: with no resolvable session role the entry is stamped with the
 * least-privileged staff role, never the caller's claim.
 */
export function resolveTicketActorRole(
  sessionRole: string | null | undefined
): string {
  // Trim so a whitespace-only session value cannot slip past the `||` and
  // stamp an unrecognised actor on the audit timeline.
  return sessionRole?.trim() || 'branch_staff';
}
