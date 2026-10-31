import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/core/auth/AuthContext', () => ({
  useAuthContext: () => ({ signIn: vi.fn(), loading: false }),
}));

// Offline banner reads only this slice; keep the fixture online/quiet.
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { offlineNotice: string | null }) => unknown) =>
    selector({ offlineNotice: null }),
}));

import { LoginPage } from './LoginPage';

/**
 * A11Y-L4 / A11Y-L5:
 *  - the password-visibility toggle was a 16x16 icon with no padding, under
 *    the 24x24 CSS px minimum target (WCAG 2.5.8);
 *  - the page had no <main> landmark.
 */
describe('LoginPage accessibility', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );

  it('exposes a single main landmark', () => {
    expect(html).toContain('<main');
    expect(html.match(/<main/g)?.length).toBe(1);
  });

  it('gives the password toggle an accessible name and a >=24px target', () => {
    const button = html.match(/<button[^>]*aria-label="Show password"[^>]*>/)?.[0] ?? '';
    expect(button).toContain('min-h-6');
    expect(button).toContain('min-w-6');
  });

  it('keeps the password field labelled', () => {
    expect(html).toContain('for="operator-password"');
  });
});
