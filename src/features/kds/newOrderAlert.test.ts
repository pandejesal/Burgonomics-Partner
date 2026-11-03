import { describe, it, expect } from 'vitest';
import {
  KDS_NEW_ORDER_ID_CAP,
  capNewOrderIds,
  formatKdsOrderLabel,
  formatNewOrderAnnouncement,
} from '@/features/kds/newOrderAlert';

/**
 * Review finding (minor): the KDS new-order banner retained every id that
 * arrived in a snapshot, so a burst on a long-lived makeline tab produced an
 * unbounded aria-live string. Retain a capped tail and report the overflow as
 * "(N) more" so the announcement stays bounded but honest about the count.
 */
const ids = (count: number) => Array.from({ length: count }, (_, i) => `ord${i}abcde`);

describe('capNewOrderIds', () => {
  it('keeps every id when the burst is within the cap', () => {
    expect(capNewOrderIds(ids(KDS_NEW_ORDER_ID_CAP))).toHaveLength(KDS_NEW_ORDER_ID_CAP);
  });

  it('retains only the most recent capped tail of a large burst', () => {
    const capped = capNewOrderIds(ids(25));
    expect(capped).toHaveLength(KDS_NEW_ORDER_ID_CAP);
    expect(capped[capped.length - 1]).toBe('ord24abcde');
    expect(capped).not.toContain('ord0abcde');
  });
});

describe('formatNewOrderAnnouncement with overflow', () => {
  it('names a single arrival', () => {
    expect(formatNewOrderAnnouncement(['ab12cd99'])).toBe(
      'New order 12CD99 arrived on the makeline.'
    );
  });

  it('reports the capped tail plus the overflow count', () => {
    expect(formatNewOrderAnnouncement(ids(KDS_NEW_ORDER_ID_CAP), 25)).toBe(
      `25 new orders arrived on the makeline: ${ids(KDS_NEW_ORDER_ID_CAP)
        .map((id) => formatKdsOrderLabel(id))
        .join(', ')} (15 more).`
    );
  });

  /**
   * Live UI finding 12: the KDS ticket clipped to `#OR…` because the label was
   * the first 6 characters of an id that always begins `ord_17`.
   */
  it('never labels two real orders identically', () => {
    const real = ['ord_1793721600000_l29btj', 'ord_1793721600000_OlxLGP', 'ord_1793721600000_PHwicU'];
    const labels = real.map(formatKdsOrderLabel);

    expect(new Set(labels).size).toBe(real.length);
    for (const label of labels) expect(label).not.toMatch(/^ORD_1/i);
    expect(labels).toEqual(['L29BTJ', 'OLXLGP', 'PHWICU']);
  });
});
