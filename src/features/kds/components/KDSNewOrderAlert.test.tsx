import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  KDSNewOrderAlert,
  formatNewOrderAnnouncement,
} from './KDSNewOrderAlert';

/**
 * A11Y-14 / KDS alert: the acoustic chime can fail (autoplay policy, muted
 * device, no speaker) and must never be the only new-order signal. The KDS
 * therefore needs BOTH a visible banner and a live region that announces the
 * arrival. The live region must be mounted even when there is nothing to say,
 * otherwise screen readers can miss the insertion that carries the text.
 *
 * Order labels use the same first-6-uppercase form as KDSOrderCard so the
 * banner names the ticket the kitchen can actually see.
 */
describe('formatNewOrderAnnouncement', () => {
  it('names the order for a single arrival', () => {
    expect(formatNewOrderAnnouncement(['ab12cd99'])).toBe(
      'New order AB12CD arrived on the makeline.'
    );
  });

  it('counts and lists multiple arrivals', () => {
    expect(formatNewOrderAnnouncement(['ab12cd99', 'ef34gh77'])).toBe(
      '2 new orders arrived on the makeline: AB12CD, EF34GH.'
    );
  });

  it('is empty when there is nothing new', () => {
    expect(formatNewOrderAnnouncement([])).toBe('');
  });
});

describe('KDSNewOrderAlert', () => {
  it('always mounts a polite live region, even with no new orders', () => {
    const html = renderToStaticMarkup(<KDSNewOrderAlert orderIds={[]} onDismiss={() => {}} />);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).not.toContain('role="alert"');
  });

  it('announces the arrival and shows a visible, dismissible banner', () => {
    const html = renderToStaticMarkup(
      <KDSNewOrderAlert orderIds={['ab12cd99']} onDismiss={() => {}} />
    );
    expect(html).toContain('New order AB12CD arrived on the makeline.');
    expect(html).toContain('New order received');
    expect(html).toContain('aria-label="Dismiss new order alert"');
  });
});
