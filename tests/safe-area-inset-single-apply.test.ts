import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * F4 — the bottom safe-area inset is applied exactly once.
 *
 * `html`, `body` and `#root` are NESTED boxes and vertical padding never
 * collapses, so declaring `env(safe-area-inset-bottom)` on all three turned a
 * 34px gesture bar into ~102px of dead space pinned under every route of the
 * partner app. The oracle is the stylesheet itself: the app root owns the
 * inset, its ancestors must not repeat it, and the top inset utilities stay.
 */
const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

// Strip comments first: the prose explaining the inset must not satisfy (or
// trip) a declaration check.
const css = cssSource.replace(/\/\*[\s\S]*?\*\//g, '');

interface CssRule {
  selectors: string[];
  body: string;
}

function parseRules(source: string): CssRule[] {
  const rules: CssRule[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(source)) !== null) {
    rules.push({
      selectors: match[1]
        .split(',')
        .map((selector) => selector.trim())
        .filter(Boolean),
      body: match[2],
    });
  }
  return rules;
}

const BOTTOM_INSET = /padding-bottom\s*:\s*env\(\s*safe-area-inset-bottom/;
const rules = parseRules(css);

describe('bottom safe-area inset is applied once, on the app root', () => {
  it('declares the inset on #root exactly once', () => {
    const rootRulesWithInset = rules.filter(
      (rule) => rule.selectors.includes('#root') && BOTTOM_INSET.test(rule.body)
    );
    expect(rootRulesWithInset).toHaveLength(1);
  });

  it('never repeats the inset on the html or body ancestor boxes', () => {
    const ancestorRules = rules.filter((rule) =>
      rule.selectors.some((selector) => selector === 'html' || selector === 'body')
    );
    // The shared surface reset must still exist — otherwise this passes vacuously.
    expect(ancestorRules.length).toBeGreaterThan(0);
    for (const rule of ancestorRules) {
      expect(rule.body).not.toMatch(BOTTOM_INSET);
    }
  });

  it('keeps the shared surface colours and the top-inset utilities', () => {
    const sharedSurfaceRule = rules.find(
      (rule) => rule.selectors.includes('html') && rule.selectors.includes('body')
    );
    expect(sharedSurfaceRule?.body).toMatch(/background\s*:/);
    expect(sharedSurfaceRule?.body).toMatch(/color\s*:/);
    expect(css).toMatch(/padding-top\s*:\s*env\(\s*safe-area-inset-top/);
    expect(css).toMatch(/\.pt-safe\s*\{[^}]*safe-area-inset-top/);
    expect(css).toMatch(/\.pb-safe\s*\{[^}]*safe-area-inset-bottom/);
  });
});
