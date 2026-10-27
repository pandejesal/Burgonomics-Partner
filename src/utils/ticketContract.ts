import type { Ticket, TicketStatus } from '@/types';

const KNOWN_TIERS = ['branch', 'brand_support', 'developer_team'] as const;
export type TicketTier = (typeof KNOWN_TIERS)[number];

/**
 * Statuses the backend writers actually emit.
 * `escalated` is written by both manual (`tickets.service.escalateTicket`) and
 * scheduled (`ticketReminder.scheduler`) escalation — it is a live, active
 * state and must never be quarantined or coerced to `open`.
 */
const KNOWN_STATUSES: readonly TicketStatus[] = [
  'open',
  'in_progress',
  'escalated',
  'resolved',
  'closed',
];

/** Statuses that still need operator attention (the "Active" queue). */
export const ACTIVE_TICKET_STATUSES: readonly TicketStatus[] = ['open', 'in_progress', 'escalated'];

/** Statuses that mean the incident is finished. */
export const TERMINAL_TICKET_STATUSES: readonly TicketStatus[] = ['resolved', 'closed'];

/** True for statuses that belong in the active queue. */
export function isActiveTicketStatus(raw: unknown): boolean {
  return typeof raw === 'string' && (ACTIVE_TICKET_STATUSES as readonly string[]).includes(raw);
}

/** True for resolved/closed statuses. */
export function isTerminalTicketStatus(raw: unknown): boolean {
  return typeof raw === 'string' && (TERMINAL_TICKET_STATUSES as readonly string[]).includes(raw);
}

/** Active = not finished and not quarantined into a done bucket. */
export function isActiveTicket(ticket: { status?: unknown } | null | undefined): boolean {
  return !!ticket && isActiveTicketStatus(ticket.status);
}

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
 *
 * Tier truth: this function SHAPE-normalizes only. It does not map, default,
 * or otherwise rewrite `assignedTo` — `resolveTicketTier` is the single
 * authority for the tier, and it needs the canonical token plus the legacy
 * `assignedToTier` / `escalationLevel` fields exactly as written. Injecting
 * `{ tier: 'branch' }` here silently downgraded legacy L2/L3 and turned
 * genuinely unknown tiers into L1 before the resolver ever ran.
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
      assignedTo && typeof assignedTo === 'object' && !Array.isArray(assignedTo)
        ? { ...assignedTo }
        : (assignedTo ?? null),
    timeline: normalizeTimeline(data.timeline),
  };
  return normalized as unknown as Ticket;
}

export type CanonicalTierLevel = 'L1_STORE' | 'L2_REGIONAL' | 'L3_EXECUTIVE';

/**
 * Maps one raw `support_tickets` document onto the Ticket contract, then
 * shape-normalizes it.
 *
 * Kept next to `normalizeTicketDoc` because this mapping is where tier truth
 * was previously destroyed: it defaulted `assignedTo` to `{ tier: 'branch' }`
 * and dropped `assignedToTier` / `escalationLevel`, so `resolveTicketTier`
 * never saw the canonical token or the legacy fields.
 */
export function normalizeSupportTicketDoc(id: string, data: Record<string, any>): Ticket {
  return normalizeTicketDoc(id, {
    ticketNumber: data.ticketNumber || id,
    title: data.subject || data.title || 'Customer Support Incident',
    branchId: data.branchId,
    branchName: data.branchName || data.branchId,
    category: data.category || 'customer_escalation',
    priority: data.priority || 'medium',
    message: data.description || data.message || '',
    orderId: data.orderId,
    status: data.status || 'open',
    // Customer identity drives queue search (name/phone) and the resolve
    // modal; dropping it left every row searching as "Customer".
    customerId: data.customerId,
    customerName: data.customerName || data.raisedByName,
    customerPhone: data.customerPhone,
    raisedById: data.customerId || data.raisedById || 'customer',
    raisedByName: data.customerName || data.raisedByName || 'Customer',
    raisedByRole: 'customer',
    // Tier truth: pass the canonical assignment and BOTH legacy fields
    // through untouched.
    assignedTo: data.assignedTo,
    assignedToTier: data.assignedToTier,
    escalationLevel: data.escalationLevel,
    assignedToName: data.assignedToName,
    attachments: data.attachments || [],
    resolution: data.resolution?.notes || data.resolution || '',
    createdAt: data.createdAt || { seconds: Math.floor(Date.now() / 1000) },
    updatedAt: data.updatedAt || { seconds: Math.floor(Date.now() / 1000) },
  });
}

/**
 * Resolves the 3-tier escalation level of a ticket.
 * Rules:
 * 1. Canonical first: `ticket.assignedTo?.tier` (or `assignedTo.name`, or `assignedTo` if string).
 * 2. Legacy fallback only when canonical is missing: `ticket.assignedToTier` then `ticket.escalationLevel`.
 * 3. Unknown as unknown: if absent or unrecognized, returns 'unknown' — never guesses L1_STORE!
 */
export function resolveTicketTier(ticket: unknown): CanonicalTierLevel | 'unknown' {
  if (!ticket || typeof ticket !== 'object') return 'unknown';

  const t = ticket as Record<string, any>;

  const mapToken = (val: unknown): CanonicalTierLevel | null => {
    if (typeof val !== 'string') return null;
    const trimmed = val.trim();
    if (trimmed === 'branch' || trimmed === 'L1_STORE') return 'L1_STORE';
    if (trimmed === 'brand_support' || trimmed === 'L2_REGIONAL') return 'L2_REGIONAL';
    if (trimmed === 'developer_team' || trimmed === 'L3_EXECUTIVE') return 'L3_EXECUTIVE';
    return null;
  };

  // 1. Canonical first: assignedTo.tier
  if (t.assignedTo != null) {
    if (typeof t.assignedTo === 'string') {
      const mapped = mapToken(t.assignedTo);
      return mapped ?? 'unknown';
    }
    if (typeof t.assignedTo === 'object') {
      const rawTier = t.assignedTo.tier ?? t.assignedTo.name;
      if (rawTier != null) {
        const mapped = mapToken(rawTier);
        return mapped ?? 'unknown';
      }
    }
  }

  // 2. Legacy only when canonical is absent/null/undefined
  if (t.assignedToTier != null) {
    const mapped = mapToken(t.assignedToTier);
    return mapped ?? 'unknown';
  }

  if (t.escalationLevel != null) {
    const mapped = mapToken(t.escalationLevel);
    return mapped ?? 'unknown';
  }

  // 3. Unknown as unknown (no L1 guess)
  return 'unknown';
}

/**
 * Computes the upward-only next escalation tier for a ticket.
 * Transitions:
 * - L1_STORE -> L2_REGIONAL (targetTier: 'brand_support')
 * - L2_REGIONAL -> L3_EXECUTIVE (targetTier: 'developer_team')
 * - L3_EXECUTIVE or unknown -> null (already top tier or cannot resolve)
 */
export function getNextEscalationTarget(currentLevel: CanonicalTierLevel | 'unknown'): {
  targetTier: 'brand_support' | 'developer_team';
  nextLevel: 'L2_REGIONAL' | 'L3_EXECUTIVE';
} | null {
  if (currentLevel === 'L1_STORE') {
    return { targetTier: 'brand_support', nextLevel: 'L2_REGIONAL' };
  }
  if (currentLevel === 'L2_REGIONAL') {
    return { targetTier: 'developer_team', nextLevel: 'L3_EXECUTIVE' };
  }
  return null;
}

const TIER_RANK: Record<CanonicalTierLevel, number> = {
  L1_STORE: 0,
  L2_REGIONAL: 1,
  L3_EXECUTIVE: 2,
};

/**
 * Whether escalating this ticket to `targetTier` moves it UP.
 *
 * Used to disable (not silently downgrade) escalation controls for a ticket
 * that is already at or above the requested tier, for a terminal ticket, or
 * for one whose tier cannot be resolved. This is UX honesty on top of the
 * server contract — the server remains the authority.
 */
export function canEscalateToTier(
  ticket: unknown,
  targetTier: 'brand_support' | 'developer_team',
): boolean {
  if (!ticket || typeof ticket !== 'object') return false;
  if (isTerminalTicketStatus((ticket as Record<string, unknown>).status)) return false;

  const currentLevel = resolveTicketTier(ticket);
  if (currentLevel === 'unknown') return false;

  const targetLevel: CanonicalTierLevel =
    targetTier === 'brand_support' ? 'L2_REGIONAL' : 'L3_EXECUTIVE';
  return TIER_RANK[targetLevel] > TIER_RANK[currentLevel];
}
