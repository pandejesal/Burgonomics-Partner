import { describe, expect, it } from 'vitest';
import { ORDER_REF_SUFFIX, orderRef, orderRefLabel } from './orderRef';

/**
 * Live UI finding 10: every Live Orders row rendered `#ORD_17` because the
 * fallback truncated the id from the LEFT (`id.slice(0, 6)`) and every order id
 * begins `ord_17…`. Rows were indistinguishable and all row aria-labels were
 * identical. Finding 12: the KDS ticket clipped to `#OR…` for the same reason.
 */
describe('orderRef', () => {
  it('prefers the server shortCode and strips a leading #', () => {
    expect(orderRef({ id: 'ord_1793721600000_l29btj', shortCode: 'BG-L29BTJ' })).toBe('BG-L29BTJ');
    expect(orderRef({ id: 'ord_1793721600000_l29btj', shortCode: '#BG-L29BTJ' })).toBe('BG-L29BTJ');
  });

  it('falls back to orderNumber when shortCode is absent', () => {
    expect(orderRef({ id: 'ord_1_abc', orderNumber: 'BG-0042' })).toBe('BG-0042');
  });

  it('derives a UNIQUE reference from the tail of the id when no code exists', () => {
    const a = orderRef({ id: 'ord_1793721600000_l29btj' });
    const b = orderRef({ id: 'ord_1793721600000_OlxLGP' });
    const c = orderRef({ id: 'ord_1793721600000_PHwicU' });

    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
    // The identifying tail, not the shared `ORD_17` prefix.
    expect(a).toBe('L29BTJ');
    expect(b).toBe('OLXLGP');
    expect(c).toBe('PHWICU');
  });

  it('never renders the shared prefix that caused finding 10', () => {
    for (const id of ['ord_1793721600000_l29btj', 'ord_1793721600001_abcdef', 'ord_1700000000000_Zz9']) {
      expect(orderRef({ id }).toUpperCase()).not.toBe('ORD_17');
    }
  });

  it('keeps a short bare id intact instead of padding or truncating it', () => {
    expect(orderRef({ id: 'abc' })).toBe('ABC');
  });

  it('honours the documented suffix length', () => {
    expect(orderRef({ id: `ord_${'x'.repeat(30)}123456` })).toBe('123456');
    expect(orderRef({ id: `ord_${'x'.repeat(30)}123456` })).toHaveLength(ORDER_REF_SUFFIX);
  });

  it('returns a placeholder rather than throwing for an order with no id', () => {
    expect(orderRef({})).toBe('ORDER');
    expect(orderRefLabel({ id: null })).toBe('#ORDER');
  });

  it('formats the label with a single leading #', () => {
    expect(orderRefLabel({ id: 'ord_1793721600000_l29btj', shortCode: 'BG-L29BTJ' })).toBe('#BG-L29BTJ');
  });

  it('is case-insensitive about the ord_ marker', () => {
    expect(orderRef({ id: 'ORD_1793721600000_abc123' })).toBe('ABC123');
    expect(orderRef({ id: 'ord-1793721600000-abc123' })).toBe('ABC123');
  });
});
