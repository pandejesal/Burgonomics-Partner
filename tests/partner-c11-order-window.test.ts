import { describe, expect, it } from 'vitest';
import {
  OPEN_ORDER_PAGE_SIZE,
  orderWindowTruncationNotice,
  orderWindowBranchChunkSize,
  pageWasCapped,
} from '../src/utils/orderWindow';

/**
 * F6 / A7 #2 — the makeline and the Control Room board must not silently lose
 * the OLDEST still-open ticket.
 *
 * The audited defect: both reads asked for `orderBy(createdAt, desc) + limit(100)`
 * with NO status predicate. On a busy evening the newest 100 documents are
 * mostly finished work, so a ticket placed at 17:10 and still `preparing` by
 * 19:30 left the snapshot entirely — no chime could fire for it (the alarm
 * effect only sees `activeOrders`), so nobody re-noticed it and the customer
 * waited. `scopeTruncationNotice` only covered the 10-branch `in` cap.
 *
 * The fix is a bounded-but-generous page PLUS an honest, on-screen disclosure
 * whenever the page is full. A status-filtered read is the long-term shape but
 * needs new composite indexes the deployed set does not have (a `failed-precondition`
 * would take the whole makeline dark), so the index definitions were published
 * for the ops lane and the window itself is stated.
 */

describe('A7 #2 — the open-ticket window is generous, bounded and explicit', () => {
  it('reads well beyond the audited 100-doc page', () => {
    expect(OPEN_ORDER_PAGE_SIZE).toBeGreaterThanOrEqual(500);
  });

  it('treats a FULL page as capped and a short page as complete', () => {
    expect(pageWasCapped(OPEN_ORDER_PAGE_SIZE)).toBe(true);
    expect(pageWasCapped(OPEN_ORDER_PAGE_SIZE - 1)).toBe(false);
    expect(pageWasCapped(0)).toBe(false);
  });

  it('falls back to the real page size when a caller passes nonsense', () => {
    expect(pageWasCapped(OPEN_ORDER_PAGE_SIZE, Number.NaN)).toBe(true);
    expect(pageWasCapped(10, 0)).toBe(false);
    expect(pageWasCapped(OPEN_ORDER_PAGE_SIZE, -5)).toBe(true);
  });

  it('says nothing when the window is known to be complete', () => {
    expect(orderWindowTruncationNotice(false)).toBeNull();
  });

  it('states the bound and does NOT claim the board is complete', () => {
    const notice = orderWindowTruncationNotice(true)!;

    expect(notice).toContain(String(OPEN_ORDER_PAGE_SIZE));
    expect(notice).toMatch(/may be outside/i);
    expect(notice).toMatch(/refresh/i);
    // An honest notice never asserts completeness.
    expect(notice).not.toMatch(/all (open )?tickets/i);
    expect(notice).not.toMatch(/everything/i);
  });

  it('quotes the page size it was given, so the copy cannot drift from the query', () => {
    expect(orderWindowTruncationNotice(true, 250)).toContain('250');
  });

  it('keeps the 10-branch `in` budget next to any status disjunction', () => {
    // Firestore's fixed cap is 30 disjunctions; the current query uses none
    // beyond the branch `in`, so the branch chunk is unaffected.
    expect(orderWindowBranchChunkSize(10, 0)).toBe(10);
    // A future status filter costs one disjunction and still fits.
    expect(orderWindowBranchChunkSize(10, 1)).toBe(10);
    // A 5-code status list would multiply past the cap — the reason this is a
    // larger page rather than a `status.code in [...]` filter today.
    expect(orderWindowBranchChunkSize(10, 5)).toBe(6);
  });
});

describe('A7 #2 — the portal queries use the shared bound', () => {
  it('the KDS stream and the board both import it instead of hardcoding 100', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    for (const file of [
      'src/features/kds/hooks/useKDSRealtimeStream.ts',
      'src/admin/services/adminOrdersService.ts',
      'src/hooks/useOrders.ts',
    ]) {
      const source = fs
        .readFileSync(path.join(root, file), 'utf8')
        // Strip line comments: the audited 100-doc cap is NAMED in the comments
        // that explain the fix, and only a live CALL SITE is the defect.
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'))
        .join('\n');
      expect(source, `${file} must use the shared page size`).toContain('OPEN_ORDER_PAGE_SIZE');
      // The audited defect: a hardcoded cap of 100 on the ORDER READS.
      const callSites = source.match(/limit\(\s*\d+\s*\)|slice\(\s*0\s*,\s*\d+\s*\)/g) ?? [];
      for (const site of callSites) {
        expect(site, `${file} must not hardcode a page cap: ${site}`).not.toMatch(
          /^limit\(\s*100\s*\)$|^slice\(\s*0\s*,\s*100\s*\)$/,
        );
      }
    }
  });

  it('the KDS hook exposes the truncation notice instead of swallowing it', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const hook = fs.readFileSync(
      path.join(root, 'src/features/kds/hooks/useKDSRealtimeStream.ts'),
      'utf8',
    );
    const page = fs.readFileSync(path.join(root, 'src/pages/KDSPage.tsx'), 'utf8');
    const board = fs.readFileSync(path.join(root, 'src/admin/pages/AdminOrdersPage.tsx'), 'utf8');

    expect(hook).toContain('windowTruncationNotice');
    expect(page).toContain('windowNotice');
    expect(board).toContain('windowNotice');
    // Both surfaces render the disclosure with a real role/note element.
    expect(page).toMatch(/role="note"/);
    expect(board).toMatch(/role="note"/);
  });
});
