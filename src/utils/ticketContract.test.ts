import { describe, it, expect } from 'vitest';
import {
  normalizeTier,
  normalizeTimeline,
  normalizeTicketDoc,
  normalizeSupportTicketDoc,
  normalizeTicketStatus,
  isTicketStatusQuarantined,
  isActiveTicketStatus,
  isTerminalTicketStatus,
  isActiveTicket,
  resolveTicketTier,
  getNextEscalationTarget,
  canEscalateToTier,
} from './ticketContract';

describe('ticketContract — partner ticket normalization', () => {
  it('passes known tiers through and falls back to branch (display-only helper)', () => {
    expect(normalizeTier('brand_support')).toBe('brand_support');
    expect(normalizeTier({ name: 'developer_team' })).toBe('developer_team');
    expect(normalizeTier('L2_REGIONAL')).toBe('branch');
    expect(normalizeTier(null)).toBe('branch');
  });

  it('coerces non-array timelines to []', () => {
    expect(normalizeTimeline([{ action: 'x' }])).toHaveLength(1);
    expect(normalizeTimeline({ 0: 'x' })).toEqual([]);
    expect(normalizeTimeline(undefined)).toEqual([]);
  });

  it('passes every real writer status through, including escalated', () => {
    for (const s of ['open', 'in_progress', 'escalated', 'resolved', 'closed'] as const) {
      expect(normalizeTicketStatus(s)).toBe(s);
      expect(isTicketStatusQuarantined(s)).toBe(false);
    }
  });

  it('quarantines unknown statuses to open — never a done bucket', () => {
    for (const raw of ['SOME_FUTURE_STATE', 'RESOLVED', '', null, undefined, 42, { code: 'open' }]) {
      expect(normalizeTicketStatus(raw)).toBe('open');
      expect(isTicketStatusQuarantined(raw)).toBe(true);
    }
  });

  it('attaches a quarantine reason on docs with bad status', () => {
    const doc = normalizeTicketDoc('t1', { status: 'WEIRD', assignedTo: { tier: 'branch' } });
    expect(doc.status).toBe('open');
    expect((doc as any).quarantineReason).toMatch(/WEIRD/);
  });

  it('leaves clean docs without a quarantine reason', () => {
    const doc = normalizeTicketDoc('t2', { status: 'resolved', assignedTo: { tier: 'branch' } });
    expect(doc.status).toBe('resolved');
    expect((doc as any).quarantineReason).toBeUndefined();
  });

  it('treats a backend-escalated ticket as active and unquarantined', () => {
    // Shape written by tickets.service.escalateTicket / ticketReminder.scheduler
    const doc = normalizeTicketDoc('tkt_escalated', {
      status: 'escalated',
      assignedTo: { tier: 'brand_support' },
    });

    expect(doc.status).toBe('escalated');
    expect((doc as any).quarantineReason).toBeUndefined();
    expect(isTicketStatusQuarantined('escalated')).toBe(false);
    expect(isActiveTicket(doc)).toBe(true);
    expect(isTerminalTicketStatus(doc.status)).toBe(false);
  });

  it('classifies active vs terminal statuses consistently', () => {
    for (const s of ['open', 'in_progress', 'escalated']) {
      expect(isActiveTicketStatus(s)).toBe(true);
      expect(isTerminalTicketStatus(s)).toBe(false);
    }
    for (const s of ['resolved', 'closed']) {
      expect(isActiveTicketStatus(s)).toBe(false);
      expect(isTerminalTicketStatus(s)).toBe(true);
    }
    expect(isActiveTicketStatus(undefined)).toBe(false);
    expect(isActiveTicketStatus('nonsense')).toBe(false);
  });

  describe('resolveTicketTier — canonical first, legacy fallback, unknown as unknown', () => {
    it('resolves canonical assignedTo.tier correctly', () => {
      expect(resolveTicketTier({ assignedTo: { tier: 'branch' } })).toBe('L1_STORE');
      expect(resolveTicketTier({ assignedTo: { tier: 'brand_support' } })).toBe('L2_REGIONAL');
      expect(resolveTicketTier({ assignedTo: { tier: 'developer_team' } })).toBe('L3_EXECUTIVE');
      expect(resolveTicketTier({ assignedTo: { tier: 'L1_STORE' } })).toBe('L1_STORE');
      expect(resolveTicketTier({ assignedTo: { tier: 'L2_REGIONAL' } })).toBe('L2_REGIONAL');
      expect(resolveTicketTier({ assignedTo: { tier: 'L3_EXECUTIVE' } })).toBe('L3_EXECUTIVE');
    });

    it('falls back to legacy assignedToTier and escalationLevel only when canonical assignedTo is missing', () => {
      expect(resolveTicketTier({ assignedToTier: 'brand_support' })).toBe('L2_REGIONAL');
      expect(resolveTicketTier({ escalationLevel: 'L3_EXECUTIVE' })).toBe('L3_EXECUTIVE');
      expect(resolveTicketTier({ escalationLevel: 'L1_STORE' })).toBe('L1_STORE');

      // Canonical present but non-matching must NOT fall through to legacy
      expect(
        resolveTicketTier({
          assignedTo: { tier: 'custom_tier' },
          assignedToTier: 'brand_support',
        }),
      ).toBe('unknown');
    });

    it('returns unknown for missing or invalid shapes — never guesses L1_STORE', () => {
      expect(resolveTicketTier({})).toBe('unknown');
      expect(resolveTicketTier(null)).toBe('unknown');
      expect(resolveTicketTier(undefined)).toBe('unknown');
      expect(resolveTicketTier({ assignedTo: { tier: 'unrecognized_tier' } })).toBe('unknown');
      expect(resolveTicketTier({ assignedToTier: 'garbage' })).toBe('unknown');
    });
  });

  describe('ingestion + resolver composition (the real fetch path)', () => {
    /**
     * These fixtures go through `normalizeSupportTicketDoc` — the exact mapping
     * `useTickets.fetchSupportTickets` applies to every raw support_tickets
     * document — and then through the resolver. Testing the resolver alone
     * missed the ingestion step that used to rewrite the tier to `branch`.
     */
    const rawDocs: Array<{ name: string; raw: Record<string, any>; expected: string }> = [
      {
        name: 'canonical L1',
        raw: { status: 'open', assignedTo: { tier: 'branch' } },
        expected: 'L1_STORE',
      },
      {
        name: 'canonical L2',
        raw: { status: 'escalated', assignedTo: { tier: 'brand_support' } },
        expected: 'L2_REGIONAL',
      },
      {
        name: 'canonical L3',
        raw: { status: 'escalated', assignedTo: { tier: 'developer_team' } },
        expected: 'L3_EXECUTIVE',
      },
      {
        name: 'canonical alias L2',
        raw: { status: 'open', assignedTo: { tier: 'L2_REGIONAL' } },
        expected: 'L2_REGIONAL',
      },
      {
        name: 'canonical alias L3',
        raw: { status: 'open', assignedTo: { tier: 'L3_EXECUTIVE' } },
        expected: 'L3_EXECUTIVE',
      },
      {
        name: 'legacy assignedToTier L2',
        raw: { status: 'open', assignedToTier: 'brand_support' },
        expected: 'L2_REGIONAL',
      },
      {
        name: 'legacy escalationLevel L3',
        raw: { status: 'open', escalationLevel: 'L3_EXECUTIVE' },
        expected: 'L3_EXECUTIVE',
      },
      {
        name: 'legacy L3 not downgraded by a missing assignedTo',
        raw: {
          status: 'escalated',
          assignedToTier: 'developer_team',
          escalationLevel: 'L3_EXECUTIVE',
        },
        expected: 'L3_EXECUTIVE',
      },
      {
        name: 'genuinely unknown tier',
        raw: { status: 'open' },
        expected: 'unknown',
      },
      {
        name: 'unknown tier token',
        raw: { status: 'open', assignedTo: { tier: 'custom_tier' } },
        expected: 'unknown',
      },
    ];

    for (const { name, raw, expected } of rawDocs) {
      it(`keeps ${name} intact through normalize + resolve`, () => {
        const normalized = normalizeSupportTicketDoc(`tkt_${name.replace(/\s+/g, '_')}`, raw);
        expect(resolveTicketTier(normalized)).toBe(expected);
      });
    }

    it('does not synthesize a branch assignment when assignedTo is absent', () => {
      const normalized = normalizeSupportTicketDoc('tkt_no_assignment', { status: 'open' });
      expect(normalized.assignedTo).toBeNull();
      expect(normalized.assignedToTier).toBeUndefined();
      expect(resolveTicketTier(normalized)).toBe('unknown');
    });

    it('carries the legacy fields through the support-ticket mapping', () => {
      const normalized = normalizeSupportTicketDoc('tkt_legacy', {
        status: 'open',
        assignedToTier: 'brand_support',
        escalationLevel: 'L2_REGIONAL',
        assignedToName: 'Regional desk',
      });

      expect(normalized.assignedToTier).toBe('brand_support');
      expect(normalized.escalationLevel).toBe('L2_REGIONAL');
      expect(normalized.assignedToName).toBe('Regional desk');
      expect(resolveTicketTier(normalized)).toBe('L2_REGIONAL');
    });

    it('keeps a canonical invalid tier authoritative over legacy fields', () => {
      const normalized = normalizeSupportTicketDoc('tkt_conflict', {
        status: 'open',
        assignedTo: { tier: 'custom_tier' },
        assignedToTier: 'brand_support',
      });

      expect(resolveTicketTier(normalized)).toBe('unknown');
    });

    it('preserves the canonical assignedTo object without rewriting its tier', () => {
      const normalized = normalizeTicketDoc('tkt_shape', {
        status: 'open',
        assignedTo: { tier: 'brand_support', name: 'Brand desk', id: 'usr_9' },
      });

      expect(normalized.assignedTo).toEqual({
        tier: 'brand_support',
        name: 'Brand desk',
        id: 'usr_9',
      });
    });
  });

  describe('getNextEscalationTarget — upward-only escalation', () => {
    it('computes L1 -> L2 escalation to brand_support', () => {
      const next = getNextEscalationTarget('L1_STORE');
      expect(next).toEqual({ targetTier: 'brand_support', nextLevel: 'L2_REGIONAL' });
    });

    it('computes L2 -> L3 escalation to developer_team', () => {
      const next = getNextEscalationTarget('L2_REGIONAL');
      expect(next).toEqual({ targetTier: 'developer_team', nextLevel: 'L3_EXECUTIVE' });
    });

    it('refuses escalation for L3_EXECUTIVE (already at top tier) and unknown', () => {
      expect(getNextEscalationTarget('L3_EXECUTIVE')).toBeNull();
      expect(getNextEscalationTarget('unknown')).toBeNull();
    });
  });

  describe('canEscalateToTier — same-or-lower tier is never offered', () => {
    it('allows upward moves only', () => {
      const l1 = normalizeTicketDoc('t_l1', { status: 'open', assignedTo: { tier: 'branch' } });
      expect(canEscalateToTier(l1, 'brand_support')).toBe(true);
      expect(canEscalateToTier(l1, 'developer_team')).toBe(true);

      const l2 = normalizeTicketDoc('t_l2', {
        status: 'escalated',
        assignedTo: { tier: 'brand_support' },
      });
      expect(canEscalateToTier(l2, 'brand_support')).toBe(false);
      expect(canEscalateToTier(l2, 'developer_team')).toBe(true);

      const l3 = normalizeTicketDoc('t_l3', {
        status: 'escalated',
        assignedTo: { tier: 'developer_team' },
      });
      expect(canEscalateToTier(l3, 'brand_support')).toBe(false);
      expect(canEscalateToTier(l3, 'developer_team')).toBe(false);
    });

    it('refuses terminal tickets', () => {
      const resolved = normalizeTicketDoc('t_resolved', {
        status: 'resolved',
        assignedTo: { tier: 'branch' },
      });
      expect(canEscalateToTier(resolved, 'brand_support')).toBe(false);
    });

    it('refuses tickets whose tier cannot be resolved', () => {
      const unknown = normalizeTicketDoc('t_unknown', { status: 'open' });
      expect(canEscalateToTier(unknown, 'brand_support')).toBe(false);
    });

    it('resolves legacy tickets upward instead of treating them as L1', () => {
      const legacyL3 = normalizeTicketDoc('t_legacy_l3', {
        status: 'open',
        escalationLevel: 'L3_EXECUTIVE',
      });
      expect(canEscalateToTier(legacyL3, 'brand_support')).toBe(false);
      expect(canEscalateToTier(legacyL3, 'developer_team')).toBe(false);
    });
  });
});
