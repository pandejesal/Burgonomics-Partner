import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OfflineBanner } from './OfflineBanner';

/**
 * A11Y-21: Orders / Menu / Admin render silently stale data when the network
 * drops. The banner must be explicit that what is on screen may no longer be
 * true — not merely "offline".
 */
describe('OfflineBanner', () => {
  it('renders nothing while online', () => {
    expect(renderToStaticMarkup(<OfflineBanner isOnline />)).toBe('');
  });

  it('warns that on-screen data may be stale when offline', () => {
    const html = renderToStaticMarkup(<OfflineBanner isOnline={false} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('offline');
    expect(html).toContain('may be stale');
  });
});
