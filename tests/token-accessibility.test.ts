/**
 * B01 — semantic token accessibility (partner app, global theme stylesheet).
 *
 * Owns: `src/index.css` theme tokens, the keyboard focus rule and the
 * reduced-motion block. Every hex below is parsed out of the shipped
 * stylesheet, never hand-copied, and checked against WCAG 2.2 thresholds:
 *
 *   - CTA pair   `--color-accent` (fill) + white/`--color-accent-foreground`
 *                label >= 4.5:1
 *   - accent text `--color-accent-light` on the dark canvas >= 4.5:1, and
 *                explicitly barred from the light-styled admin inputs
 *   - focus ring `--color-ring` >= 3:1 on dark surfaces AND on white inputs
 *   - the focus rule exists, is not pointer-gated, and cannot be deleted by a
 *     component-level `focus:outline-none`
 *   - reduced motion is bounded without killing operational status animation
 *
 * Thresholds only. No WCAG conformance claim, no device/AT evidence.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const TEXT_AA = 4.5; // SC 1.4.3
const NONTEXT_AA = 3; // SC 1.4.11

/* ---------------------------- contrast math ---------------------------- */

function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.replace(/./g, (d) => d + d) : raw;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* ------------------------- source-anchored tokens ----------------------- */

function repoFile(rel: string): string {
  const candidates = [resolve(process.cwd(), rel), resolve(process.cwd(), 'burgonomics-partner', rel)];
  const hit = candidates.find((c) => existsSync(c));
  if (!hit) throw new Error(`B01 fixture: cannot locate ${rel} under ${process.cwd()}`);
  return hit;
}

const indexCss = readFileSync(repoFile('src/index.css'), 'utf8');

/** Comments are prose: structural checks must not match text inside them. */
const css = indexCss.replace(/\/\*[\s\S]*?\*\//g, '');

function ruleBody(selector: string, from = 0, exact = false): string {
  const needle = exact || selector.trimEnd().endsWith('{') ? selector : `${selector} {`;
  const at = css.indexOf(needle, from);
  expect(at, `src/index.css: missing "${needle}"`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

function token(block: string, name: string): string {
  const m = block.match(new RegExp(`(?:^|[;\\s])${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  if (!m) throw new Error(`src/index.css: ${name} is not a hex token`);
  return m[1];
}

const themeBlock = ruleBody('@theme');

const t = {
  primary: token(themeBlock, '--color-primary'),
  accent: token(themeBlock, '--color-accent'),
  accentHover: token(themeBlock, '--color-accent-hover'),
  onAccent: token(themeBlock, '--color-accent-foreground'),
  accentLight: token(themeBlock, '--color-accent-light'),
  ring: token(themeBlock, '--color-ring'),
  bg: token(themeBlock, '--color-bg'),
  surface: token(themeBlock, '--color-surface'),
  surfaceHover: token(themeBlock, '--color-surface-hover'),
  bgSecondary: token(themeBlock, '--color-bg-secondary'),
};

// The partner console mixes two surface families on one canvas: the dark
// operational canvas (#0A0A0A/#1A1A1A/#222222) and the light-styled admin
// panels (white inputs/cards). Both are real focus-ring backgrounds.
const darkSurfaces: Array<[string, string]> = [
  ['--color-bg', t.bg],
  ['--color-surface', t.surface],
  ['--color-surface-hover', t.surfaceHover],
  ['--color-bg-secondary', t.bgSecondary],
];
const lightInputSurface = '#FFFFFF';

/* ------------------------------------------------------------------------ */

describe('B01 partner: readable CTA pair (accent fill + on-accent label)', () => {
  it('names the pair explicitly instead of hardcoding white at 36 call sites', () => {
    expect(themeBlock).toMatch(/--color-accent-foreground:\s*#FFFFFF/);
  });

  it('white label on the accent fill and on its hover fill clears 4.5:1', () => {
    expect(contrast(t.onAccent, t.accent)).toBeGreaterThanOrEqual(TEXT_AA);
    expect(contrast(t.onAccent, t.accentHover)).toBeGreaterThanOrEqual(TEXT_AA);
    // Hover darkens the fill rather than brightening it: brightening would
    // drop the white label under 4.5:1.
    expect(luminance(t.accentHover)).toBeLessThan(luminance(t.accent));
  });

  it('keeps the one-orange identity of the 10% slot', () => {
    expect(t.accent).toBe('#C2410C');
    expect(t.primary).toBe('#0E4825');
  });
});

describe('B01 partner: accent text on dark surfaces (--color-accent-light)', () => {
  it('clears 4.5:1 on every dark surface', () => {
    for (const [name, bg] of darkSurfaces) {
      expect(contrast(t.accentLight, bg), `--color-accent-light on ${name}`).toBeGreaterThanOrEqual(
        TEXT_AA
      );
    }
  });

  it('is barred from the light-styled admin inputs (documented limit)', () => {
    expect(contrast(t.accentLight, lightInputSurface)).toBeLessThan(TEXT_AA);
  });

  it('the fill token itself is not text-grade on the dark canvas', () => {
    // This is why the two tokens exist rather than one "orange": no single
    // colour can be both a white-label fill and orange text on #0A0A0A.
    for (const [name, bg] of darkSurfaces) {
      expect(contrast(t.accent, bg), `--color-accent text on ${name}`).toBeLessThan(TEXT_AA);
    }
    const maxLumForWhiteLabel = 1.05 / TEXT_AA - 0.05;
    const minLumForTextOnDarkCanvas = TEXT_AA * (luminance(t.bg) + 0.05) - 0.05;
    expect(minLumForTextOnDarkCanvas).toBeGreaterThan(maxLumForWhiteLabel);
  });
});

describe('B01 partner: keyboard focus indicator', () => {
  it('clears 3:1 on the dark surfaces AND on the light admin inputs', () => {
    for (const [name, bg] of darkSurfaces) {
      expect(contrast(t.ring, bg), `--color-ring on ${name}`).toBeGreaterThanOrEqual(NONTEXT_AA);
    }
    expect(contrast(t.ring, lightInputSurface), '--color-ring on white input').toBeGreaterThanOrEqual(
      NONTEXT_AA
    );
  });

  it('is defined once, ungated, and survives a component outline reset', () => {
    expect(css).not.toMatch(/@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
    const focus = /\*:focus-visible\s*\{([^}]*)\}/.exec(css);
    expect(focus, 'global *:focus-visible rule').not.toBeNull();
    expect(focus?.[1]).toContain('outline: 2px solid var(--color-ring) !important');
    expect(focus?.[1]).toContain('outline-offset: 2px !important');
  });
});

describe('B01 partner: reduced motion is bounded, operational feedback is not', () => {
  const mediaAt = css.indexOf('@media (prefers-reduced-motion: reduce)');

  it('ships a reduced-motion block at all (partner had none)', () => {
    expect(mediaAt).toBeGreaterThanOrEqual(0);
  });

  it('bounds movement to one short cycle and keeps state-colour transitions', () => {
    const universal = ruleBody('*', mediaAt, true);
    expect(universal).toMatch(/animation-duration:\s*120ms\s*!important/);
    expect(universal).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(universal).toMatch(/transition-duration:\s*120ms\s*!important/);
    expect(universal).toMatch(/transition-property:[^;]*opacity/);
    expect(universal).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  it('exempts operational status animation from the bound', () => {
    const exemptAt = css.indexOf('.animate-spin', mediaAt);
    expect(exemptAt, 'status-animation exemption').toBeGreaterThan(mediaAt);
    const exempt = ruleBody('.animate-spin', mediaAt, true);
    expect(exempt).toMatch(/animation-duration:\s*1\.6s\s*!important/);
    expect(exempt).toMatch(/animation-iteration-count:\s*infinite\s*!important/);
    const selectorList = css.slice(exemptAt, css.indexOf('{', exemptAt));
    expect(selectorList).toMatch(/animate-spin/);
    expect(selectorList).toMatch(/animate-ping/);
    expect(selectorList).toMatch(/animate-pulse/);
  });
});

describe('B01 partner: decorative orange and preserved base layout', () => {
  it('the legacy brand orange is not a theme token value', () => {
    expect(themeBlock.toLowerCase()).not.toMatch(/#ff6600/);
    expect(contrast('#FF6600', lightInputSurface)).toBeLessThan(TEXT_AA);
  });

  it('safe-area helpers and the app canvas rule survive', () => {
    expect(ruleBody('.pb-safe')).toContain('env(safe-area-inset-bottom, 0px)');
    expect(ruleBody('.pt-safe')).toContain('env(safe-area-inset-top, 0px)');
    expect(ruleBody('html, body, #root')).toContain('background: var(--color-bg)');
    expect(css).toMatch(/\*\s*\{\s*border-color:\s*var\(--color-border\);\s*\}/);
  });
});
