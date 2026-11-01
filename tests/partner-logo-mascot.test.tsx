import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Logo } from '../src/components/ui/Logo';

describe('Partner logo — Delivery mascot parity', () => {
  it('renders the verified public mascot PNG and preserves the public API', () => {
    const html = renderToStaticMarkup(
      <Logo size={48} className="shrink-0" showText />,
    );

    expect(html).toContain('src="/burgonomics-logo.png"');
    expect(html).toContain('alt="Burgonomics"');
    expect(html).toContain('width="48"');
    expect(html).toContain('height="48"');
    expect(html).toContain('shrink-0');
    expect(html).toContain('Burgonomics</span>');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('burgGreen');
  });

  it('does not render the optional wordmark when showText is false', () => {
    const html = renderToStaticMarkup(<Logo />);

    expect(html).toContain('src="/burgonomics-logo.png"');
    expect(html).not.toContain('tracking-[0.08em]');
  });
});
