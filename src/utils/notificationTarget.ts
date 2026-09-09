import type { NotificationType } from '@/types';

/**
 * Resolves a Firestore notification doc to an in-app route (batch-6 badge
 * semantics: inbox reads clear-on-read, then land on the linked record).
 *
 * Ticket detail fetches by id only — payloads no longer carry `subject`, so
 * this helper never parses subject/title for routing, only the stable
 * `targetId` plus the typed `type` discriminator. Unknown types or unsafe
 * ids resolve to null (stay on the inbox) instead of navigating somewhere
 * wrong.
 */
export function notificationTarget(
  type: NotificationType,
  targetId?: string
): string | null {
  const id = (targetId || '').trim();
  // Firestore doc ids / order ids: word chars + dashes only. Anything else
  // (slashes, dots, schemes) is rejected — never build a path from it.
  const safeId = /^[\w-]{1,64}$/.test(id) ? id : null;

  if (type === 'ticket') {
    return safeId ? `/tickets/${safeId}` : null;
  }
  if (type === 'order') {
    return safeId ? `/orders/${safeId}` : null;
  }
  if (type === 'chat') {
    return '/chat';
  }
  return null;
}
