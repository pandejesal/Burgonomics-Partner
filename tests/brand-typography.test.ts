import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { Logo } from '../src/components/ui/Logo';

/**
 * Partner typography contract (owner spec):
 *   - MonstroSolid is the BURGONOMICS wordmark face only (400, never faked bold).
 *   - Montserrat is the heading face for every h1-h6 and heading utility.
 *   - Inter stays the body/control/price face.
 *   - The MOBILE header shows readable Burgonomics text, not just the mascot.
 */

const css = readFileSync('src/index.css', 'utf8');
const header = readFileSync('src/components/layout/Header.tsx', 'utf8');

function block(selector: string): string {
  const pattern = new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`);
  const match = pattern.exec(css);
  if (!match) throw new Error(`Missing ${selector} block`);
  const start = match.index + match[0].length;
  const end = css.indexOf('}', start);
  if (end < 0) throw new Error(`Unterminated ${selector} block`);
  return css.slice(start, end);
}

describe('partner typography roles', () => {
  it('declares brand, display and sans tokens plus a real mono stack', () => {
    const theme = block('@theme');
    expect(theme).toContain('--font-sans: "Inter"');
    expect(theme).toContain('--font-display: "Montserrat"');
    expect(theme).toContain('--font-brand: "MonstroSolid"');
    expect(theme).toMatch(/--font-mono:\s*ui-monospace/);
    expect(css).not.toMatch(/--font-mono:\s*"Inter"/);
  });

  it('self-hosts the exact customer font assets with licences', () => {
    for (const file of [
      'public/fonts/MonstroSolid.woff2',
      'public/fonts/MontserratVariable.woff2',
      'public/fonts/Montserrat-OFL.txt',
      'public/fonts/InterVariable.woff2',
    ]) {
      expect(readFileSync(file).byteLength, file).toBeGreaterThan(1000);
    }
    expect(readFileSync('public/fonts/MonstroSolid.woff2').subarray(0, 4).toString()).toBe('wOF2');
    expect(readFileSync('public/fonts/MontserratVariable.woff2').subarray(0, 4).toString()).toBe(
      'wOF2',
    );
    expect(readFileSync('public/fonts/Montserrat-OFL.txt', 'utf8')).toContain(
      'SIL OPEN FONT LICENSE Version 1.1',
    );
    expect(css).toContain('url("/fonts/MontserratVariable.woff2")');
    expect(css).toContain('url("/fonts/MonstroSolid.woff2")');
    expect(css).not.toContain('fonts.googleapis');
  });

  it('gives every heading element and heading utility Montserrat 700', () => {
    const headings = /h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6 \{([\s\S]*?)\}/.exec(css);
    expect(headings).not.toBeNull();
    expect(headings![1]).toContain('font-family: var(--font-display)');
    expect(headings![1]).toContain('font-weight: 700');

    const utility = block('@utility font-heading');
    expect(utility).toContain('font-family: var(--font-display)');
    expect(utility).toContain('font-weight: 700');

    const brand = block('@utility brand-wordmark');
    expect(brand).toContain('font-family: var(--font-brand)');
    expect(brand).toContain('font-weight: 400');
    expect(brand).toMatch(/font-synthesis:\s*none/);
    // 32px normally; capped by width so enlarged text never splits it mid-word.
    expect(brand).toContain('font-size: min(2rem, 11vw)');
    expect(brand).toMatch(/white-space:\s*nowrap/);
  });

  it('renders a MonstroSolid wordmark, not fake uppercase bold Inter', () => {
    const html = renderToStaticMarkup(React.createElement(Logo, { size: 30, showText: true }));
    expect(html).toContain('Burgonomics</span>');
    expect(html).toContain('brand-wordmark');
    expect(html).not.toContain('font-black');
    expect(html).not.toContain('uppercase');
    expect(html).not.toContain('tracking-[0.08em]');
    expect(html).toContain('flex-wrap');
  });

  it('keeps the mobile partner header showing readable Burgonomics text', () => {
    // The brand row must not be hidden behind a breakpoint any more.
    expect(header).toContain('showText');
    expect(header).not.toMatch(/Logo[^/>]*showText=\{false\}/);
    expect(header).toMatch(/Logo[^/>]*showText\b/);
    expect(header).not.toMatch(/showText[^/]*className="[^"]*\bhidden\b/);
    // Brand row + outlet/actions row may wrap on small widths.
    expect(header).toContain('flex-col');
    expect(header).toContain('sm:flex-row');
    expect(header).toMatch(/sm:flex-wrap|flex-wrap/);
    // Existing controls survive the layout change.
    expect(header).toContain('BranchSwitcher');
    expect(header).toContain('PetpoojaStatusBadge');
    expect(header).toContain('NotificationBell');
    expect(header).toContain('aria-label="Toggle navigation menu"');
    expect(header).toContain('safe-area-inset-top');
    // No fixed height that could clip enlarged text.
    expect(header).not.toMatch(/className="[^"]*\bh-16\b/);
  });
});
