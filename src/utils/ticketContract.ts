import type { Ticket, TicketStatus } from '@/types';

const KNOWN_TIERS = ['branch', 'brand_support', 'developer_team'] as const;
export type TicketTier = (typeof KNOWN_TIERS)[number];

const KNOWN_STATUSES: readonly TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

/** Normalized tier string — unknown shapes fall back to 'branch', never throw. */
export function normalizeTier(raw: unknown): TicketTier {
  const tier =
    typeof raw === 'string' ? raw : (raw as { name?: unknown } | null)?.name;
  return typeof tier === 'string' && (KNOWN_TIERS as readonly string[]).includes(tier)
    ? (tier as TicketTier)
    : 'branch';
}

/** Timeline is always an array — Firestore docs with object-shaped timelines blank pages today. */
export function normalizeTimeline(raw: unknown): any[] {
  return Array.isArray(raw) ? raw : [];
}

/**
 * Fail-closed status normalization, consistent with the batch-4 order
 * quarantine bucket (orderContract.toPartnerStatus): an unrecognized status
 * lands in the actionable queue ('open'), never in a done bucket
 * ('resolved'/'closed') — a corrupt ticket must look unhandled, never done.
 */
export function normalizeTicketStatus(raw: unknown): TicketStatus {
  return typeof raw === 'string' && (KNOWN_STATUSES as readonly string[]).includes(raw)
    ? (raw as TicketStatus)
    : 'open';
}

/** True when the raw status was not a known TicketStatus (quarantined to 'open'). */
export function isTicketStatusQuarantined(raw: unknown): boolean {
  return !(typeof raw === 'string' && (KNOWN_STATUSES as readonly string[]).includes(raw));
}

/** Machine-readable reason for a quarantined ticket status, for review copy. */
export function ticketStatusQuarantineReason(raw: unknown): string {
  if (raw == null) return 'missing status field';
  if (typeof raw === 'string') return `unrecognized ticket status '${raw}'`;
  return 'malformed ticket status value';
}

/**
 * Normalizes one raw ticket doc (either collection) into a safe Ticket.
 * Replaces the `as any` spreads that let malformed docs crash TicketDetailPage
 * (`assignedTier.replace is not a function`, `timeline.map is not a function`).
 */
export function normalizeTicketDoc(id: string, data: Record<string, any>): Ticket {
  const assignedTo = data.assignedTo;
  const quarantined = isTicketStatusQuarantined(data.status);
  const normalized = {
    ...data,
    id,
    status: normalizeTicketStatus(data.status),
    ...(quarantined ? { quarantineReason: ticketStatusQuarantineReason(data.status) } : {}),
    assignedTo:
      assignedTo && typeof assignedTo === 'object'
        ? { ...assignedTo, tier: normalizeTier((assignedTo as any).tier) }
        : { tier: 'branch' as TicketTier },
    timeline: normalizeTimeline(data.timeline),
  };
  return normalized as unknown as Ticket;
}
