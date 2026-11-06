import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Keep filesystem assertions in the existing Node tests tree, not the browser
// TypeScript project. Vitest stubs CSS imports to '' even with ?raw here.
const STYLES_SRC = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const VAR = '--top-chrome-height';

function htmlDeclaration(property: string): string | null {
  const blocks = Array.from(STYLES_SRC.matchAll(/(?:^|\n)\s*html\s*\{([^}]*)\}/g)).map(m => m[1]);
  const values = blocks.flatMap(block =>
    Array.from(block.matchAll(new RegExp(`${property}\\s*:\\s*([^;]+);`, 'g'))).map(m => m[1].trim()),
  ).filter(value => value !== 'auto');
  return values.length ? values[values.length - 1] : null;
}

function evaluate(expression: string | null, vars: Record<string, number>, remPx = 16) {
  if (expression === null) return null;
  let total = 0;
  for (const raw of expression.replace(/^calc\(/, '').replace(/\)$/, '').split('+')) {
    const term = raw.trim();
    if (!term) continue;
    const px = /^(-?\d+(?:\.\d+)?)px$/.exec(term);
    if (px) { total += Number(px[1]); continue; }
    const rem = /^(-?\d+(?:\.\d+)?)rem$/.exec(term);
    if (rem) { total += Number(rem[1]) * remPx; continue; }
    const variable = /^var\(\s*(--[\w-]+)\s*(?:,\s*(-?\d+(?:\.\d+)?)px\s*)?\)$/.exec(term);
    if (variable) {
      const [, name, fallback] = variable;
      if (name in vars) total += vars[name];
      else if (fallback !== undefined) total += Number(fallback);
      else return null;
      continue;
    }
    return null;
  }
  return total;
}

describe('partner root scroll padding consumes the measured height', () => {
  it('reads actual stylesheet text rather than a Vitest CSS stub', () => {
    expect(STYLES_SRC).toContain('scroll-padding-top');
  });
  it('publishes a top rule that is no longer `auto`', () => {
    expect(htmlDeclaration('scroll-padding-top')).not.toBeNull();
  });
  it('reserves measured header + 8px at phone and 200% text sizes', () => {
    const expression = htmlDeclaration('scroll-padding-top');
    for (const height of [64, 132, 176]) {
      const clearance = evaluate(expression, { [VAR]: height });
      expect(clearance, `unreadable scroll-padding-top: ${expression}`).not.toBeNull();
      expect(clearance!).toBeGreaterThanOrEqual(height + 8);
      expect(clearance! - height).toBe(8);
    }
  });
  it('degrades to the 8px gap when no header is mounted', () => {
    expect(evaluate(htmlDeclaration('scroll-padding-top'), {})).toBe(8);
  });
  it('never reintroduces a hard-coded chrome constant', () => {
    expect(htmlDeclaration('scroll-padding-top')).toContain(VAR);
    expect(htmlDeclaration('scroll-padding-top')).not.toMatch(/\b\d+rem\b/);
  });
});
