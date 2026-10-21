// Source-level wiring guard for the staff-hook demo-seed honesty cycle
// (Runbook §8). Repo convention: source-grep tests live in tests/ (colocated
// src tests run under tsc, where node builtins lack types).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (rel: string) =>
  readFileSync(path.resolve(import.meta.dirname, rel), 'utf8');

describe('staff-hook honesty guard (useTickets / useTicket / useUsers)', () => {
  const tickets = read('../src/hooks/useTickets.ts');
  const ticket = read('../src/hooks/useTicket.ts');
  const users = read('../src/hooks/useUsers.ts');

  it('useTickets: dev seeds never load over failed collection reads', () => {
    expect(tickets).toContain('if (fetchFailed || !import.meta.env.DEV) return [];');
    expect(tickets).toContain('fetchFailed = true;');
    // The old unconditional dev-fallback seam is gone.
    expect(tickets).not.toContain("if (!import.meta.env.DEV) return [];\n\n      // Fallback rich");
  });

  it('useTickets: dev seed ticket numbers use the DEMO-TICK-* convention (never quoteable as real ids)', () => {
    expect(tickets).not.toContain('TICK-2026-');
    expect((tickets.match(/DEMO-TICK-\d/g) || []).length).toBe(4);
  });

  it('useTicket: failed reads throw in dev and prod (no mock-on-error masking); unknown ids in PROD also fail visible (never the mock)', () => {
    expect(ticket).toContain('if (fetchError) {');
    expect(ticket).not.toContain('loading fallback ticket');
    expect(ticket).not.toContain('razorpayPaymentId');
    expect(ticket).not.toContain('petpoojaOrderId');
    expect(ticket).not.toContain('errorStack');
    // Prod parity with HEAD: an unknown ticket id throws — the [DEMO] mock
    // snapshots are unreachable in production (DS blocking finding). The
    // prod throw must textually precede the mock table so reordering can't
    // re-expose it.
    const prodThrowIdx = ticket.indexOf('throw new Error(\'Ticket not found.\')');
    const mockIdx = ticket.indexOf('const mockSnapshots');
    expect(prodThrowIdx).toBeGreaterThan(-1);
    expect(mockIdx).toBeGreaterThan(-1);
    expect(prodThrowIdx).toBeLessThan(mockIdx);
  });

  it('useUsers: error path throws except permission-denied; seeds carry [DEMO] markers', () => {
    expect(users).toContain('isPermissionDenied(err)');
    expect(users).toContain('throw err; // real backend failure — surface, never mask with seeds');
    expect(users).not.toContain('loading seed roster');
    expect(users).not.toContain("'Live in KDS'");
    expect(users).not.toContain("'Live in Console'");
    expect((users.match(/name: '\[DEMO\]/g) || []).length).toBe(6);
  });
});
