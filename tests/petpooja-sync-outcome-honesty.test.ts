import { describe, expect, it } from 'vitest';
import {
  describePetpoojaSyncOutcome,
  petpoojaKotNeedsResolution,
} from '../src/utils/orderContract';

/**
 * Item 4, the silent-success half.
 *
 * POST /petpooja/pushOrder answers `{ success: true }` even when the POS
 * accepted the payload WITHOUT an id (orderPush.ts:1500-1506 returns true for an
 * already-deduped push, and 1872-1900 marks the order accepted_unconfirmed and
 * returns true). So "Successfully synchronized with Petpooja POS" was shown for
 * an order whose ticket may never have printed — and for an ambiguous KOT the
 * button can never fix anything, because the push is deduped by design.
 */
describe('petpooja sync outcome copy', () => {
  it('does not claim success for an order that needs KOT resolution', () => {
    const ambiguous = {
      petpoojaStatus: 'accepted_unconfirmed',
      petpoojaSyncStatus: 'accepted_unconfirmed',
    };
    expect(petpoojaKotNeedsResolution(ambiguous)).toBe(true);

    const outcome = describePetpoojaSyncOutcome(ambiguous, { success: true });
    expect(outcome.tone).toBe('warning');
    expect(outcome.title).not.toMatch(/successfully synchroni[sz]ed/i);
    expect(outcome.description).toMatch(/printer/i);
  });

  it('reports a plain success only when the order is genuinely synced', () => {
    const outcome = describePetpoojaSyncOutcome({ petpoojaStatus: 'synced' }, { success: true });
    expect(outcome.tone).toBe('success');
  });

  it('never reports success when the server did not confirm', () => {
    const outcome = describePetpoojaSyncOutcome({ petpoojaStatus: 'pending' }, { success: false });
    expect(outcome.tone).toBe('error');
    expect(outcome.title).toMatch(/not confirmed/i);
  });

  it('says the push was deduped when the order already carries a POS id', () => {
    const outcome = describePetpoojaSyncOutcome(
      { petpoojaOrderId: 'pp_kot_9', petpoojaStatus: 'synced' },
      { success: true }
    );
    expect(outcome.tone).toBe('info');
    expect(outcome.title).toMatch(/already/i);
  });
});
