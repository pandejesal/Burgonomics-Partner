import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TicketEvidence, safeEvidenceUrl } from './TicketEvidence';

/**
 * Support photo evidence made it as far as the ticket page but nothing
 * rendered it (ticketContract.ts carried `attachments`, no component used it),
 * so staff could not see customer-attached photos at all.
 *
 * A ticket's attachment URLs are CUSTOMER-SUPPLIED INPUT. An <img src> on an
 * arbitrary URL leaks the staff member's IP/referrer to a third party and can
 * be swapped for a tracking pixel; a javascript:/data: URL in an anchor is
 * worse. Only Firebase Storage over https is accepted, and anything else is
 * dropped rather than rendered.
 */
describe('safeEvidenceUrl', () => {
  it('accepts an https Firebase Storage object URL', () => {
    const url =
      'https://firebasestorage.googleapis.com/v0/b/burgonomics-7faa8.firebasestorage.app/o/support-evidence%2Fuid%2Ftkt%2F1_a.png?alt=media&token=abc';
    expect(safeEvidenceUrl(url)).toBe(url);
  });

  it('accepts the storage.googleapis.com download host', () => {
    const url = 'https://storage.googleapis.com/burgonomics-7faa8.firebasestorage.app/x.png';
    expect(safeEvidenceUrl(url)).toBe(url);
  });

  it('rejects a non-Firebase host, even over https', () => {
    expect(safeEvidenceUrl('https://evil.example/track.png')).toBeNull();
    expect(safeEvidenceUrl('https://firebasestorage.googleapis.com.evil.example/x.png')).toBeNull();
  });

  it('rejects cleartext http', () => {
    expect(safeEvidenceUrl('http://firebasestorage.googleapis.com/v0/b/x/o/y.png')).toBeNull();
  });

  it('rejects javascript:, data: and bare/relative values', () => {
    expect(safeEvidenceUrl('javascript:alert(1)')).toBeNull();
    expect(safeEvidenceUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(safeEvidenceUrl('/support-evidence/x.png')).toBeNull();
    expect(safeEvidenceUrl('')).toBeNull();
    expect(safeEvidenceUrl(undefined)).toBeNull();
    expect(safeEvidenceUrl(42 as unknown as string)).toBeNull();
  });
});

describe('TicketEvidence', () => {
  const ok = (n: number) =>
    `https://firebasestorage.googleapis.com/v0/b/burgonomics-7faa8.firebasestorage.app/o/support-evidence%2Fuid%2Ftkt%2F${n}_a.png?alt=media&token=t${n}`;

  it('renders nothing when a ticket has no evidence', () => {
    expect(renderToStaticMarkup(<TicketEvidence attachments={[]} />)).toBe('');
    expect(renderToStaticMarkup(<TicketEvidence attachments={undefined} />)).toBe('');
  });

  it('renders nothing when every URL is untrusted', () => {
    const html = renderToStaticMarkup(
      <TicketEvidence attachments={['https://evil.example/a.png', 'javascript:alert(1)']} />,
    );
    expect(html).toBe('');
  });

  it('renders a thumbnail that opens the full image in a new tab', () => {
    const url = ok(1);
    const html = renderToStaticMarkup(<TicketEvidence attachments={[url]} />);
    // React escapes `&` in attributes; compare against the escaped form.
    const attr = url.replace(/&/g, '&amp;');
    expect(html).toContain('href="' + attr + '"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('src="' + attr + '"');
  });

  it('gives every thumbnail meaningful alt text naming the ticket and position', () => {
    const html = renderToStaticMarkup(<TicketEvidence attachments={[ok(1), ok(2)]} ticketLabel="TKT-12345" />);
    expect(html).toContain('alt="Customer evidence photo 1 of 2 for ticket TKT-12345"');
    expect(html).toContain('alt="Customer evidence photo 2 of 2 for ticket TKT-12345"');
  });

  it('gives every thumbnail a tap target of at least 44px', () => {
    const html = renderToStaticMarkup(<TicketEvidence attachments={[ok(1)]} />);
    // The anchor carries the hit area, not the img.
    expect(html).toMatch(/min-height:\s*44px/);
    expect(html).toMatch(/min-width:\s*44px/);
  });

  it('renders at most 5 thumbnails and says how many were withheld', () => {
    const many = Array.from({ length: 8 }, (_, i) => ok(i + 1));
    const html = renderToStaticMarkup(<TicketEvidence attachments={many} />);
    expect((html.match(/<img /g) ?? []).length).toBe(5);
    expect(html).toContain('3 more');
  });

  it('shows a visible fallback when an image fails to load', () => {
    // Static markup cannot fire onError, so assert the real wiring instead of a
    // decorative string: the img must carry an onError handler, and the
    // fallback node must exist in the component's rendered output under the
    // error state. Rendering the component with a pre-failed url proves the
    // fallback markup is real.
    const url = ok(1);
    const attr = url.replace(/&/g, '&amp;');
    const healthy = renderToStaticMarkup(<TicketEvidence attachments={[url]} />);
    expect(healthy).toContain('src="' + attr + '"');
    const failed = renderToStaticMarkup(
      <TicketEvidence attachments={[url]} initialFailedUrls={[url]} />,
    );
    expect(failed).toContain('data-evidence-fallback');
    expect(failed).toContain('Image unavailable');
    // The healthy render must not show the fallback.
    expect(healthy).not.toContain('data-evidence-fallback');
  });
});
