import { describe, it, expect } from 'vitest';
import {
  normalizeTier,
  normalizeTimeline,
  normalizeTicketDoc,
  normalizeTicketStatus,
  isTicketStatusQuarantined,
} from './ticketContract';

describe('ticketContract — partner ticket normalization', () => {
  it('passes known tiers through and falls back to branch', () => {
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

  it('passes known statuses through', () => {
    for (const s of ['open', 'in_progress', 'resolved', 'closed'] as const) {
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
});
