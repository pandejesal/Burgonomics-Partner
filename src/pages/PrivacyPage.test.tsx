import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { PrivacyPage, SupportPage } from './PrivacyPage';
import { LegalLinks } from '../components/LegalLinks';
describe('public partner policy and support', () => {
 it('links are real routes available before sign-in', () => {
  const html = renderToStaticMarkup(<MemoryRouter><LegalLinks /></MemoryRouter>);
  expect(html).toContain('href="/privacy"'); expect(html).toContain('href="/support"');
 });
 it('policy describes operator data without made-up retention deadlines', () => {
  const html = renderToStaticMarkup(<MemoryRouter><PrivacyPage /></MemoryRouter>);
  expect(html).toContain('email'); expect(html).toContain('notification'); expect(html).toContain('privacy@burgonomics.com');
 });
 it('support is reachable without credentials', () => {
  const html = renderToStaticMarkup(<MemoryRouter><SupportPage /></MemoryRouter>);
  expect(html).toContain('mailto:support@burgonomics.com');
 });
});
