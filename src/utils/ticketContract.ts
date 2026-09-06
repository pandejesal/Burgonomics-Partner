import type { Ticket } from '@/types';

const KNOWN_TIERS = ['branch', 'brand_support', 'developer_team'] as const;
export type TicketTier = (typeof KNOWN_TIERS)[number];

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
 * Normalizes one raw ticket doc (either collection) into a safe Ticket.
 * Replaces the `as any` spreads that let malformed docs crash TicketDetailPage
 * (`assignedTier.replace is not a function`, `timeline.map is not a function`).
 */
export function normalizeTicketDoc(id: string, data: Record<string, any>): Ticket {
  const assignedTo = data.assignedTo;
  const normalized = {
    ...data,
    id,
    assignedTo:
      assignedTo && typeof assignedTo === 'object'
        ? { ...assignedTo, tier: normalizeTier((assignedTo as any).tier) }
        : { tier: 'branch' as TicketTier },
    timeline: normalizeTimeline(data.timeline),
  };
  return normalized as unknown as Ticket;
}
