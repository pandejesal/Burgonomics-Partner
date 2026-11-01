import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, type ComponentType } from 'react';

import { SystemQueueTab } from '../src/admin/pages/system/SystemQueueTab';
import { SystemFeatureFlagsTab } from '../src/admin/pages/system/SystemFeatureFlagsTab';
import { SystemLogsTab } from '../src/admin/pages/system/SystemLogsTab';

/**
 * #30 / O6 — SystemLogsTab must not present fabricated (DEV-simulated) rows as
 * server events or expose a streaming control in production. The assertions
 * execute the components through ReactDOM server with `import.meta.env.DEV`
 * stubbed via `vi.stubEnv`, so only rendered output is treated as evidence.
 */
const renderTab = (Tab: ComponentType) => renderToStaticMarkup(createElement(Tab));

// `import.meta.env.DEV` is a boolean; the vitest `stubEnv` type only accepts a
// string, so pass the boolean through a cast (verified to land as boolean).
const setDev = (dev: boolean) => vi.stubEnv('DEV', dev as unknown as string);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SystemLogsTab — fabrication is DEV-only (rendered)', () => {
  // The six fixture rows carry timestamps 10:04:12..16.
  const seededRows = (html: string) => (html.match(/\[10:04:1\d\]/g) ?? []).length;

  it('DEV=false: no seeded rows, no simulation notice, no streaming control', () => {
    setDev(false);
    const html = renderTab(SystemLogsTab);
    expect(seededRows(html)).toBe(0);
    expect(html).not.toContain('DEV simulation');
    expect(html).not.toContain('simulated log stream');
    // production is an empty local buffer, stated honestly
    expect(html).toContain('No log lines in the local buffer');
    expect(html).toContain('no server log stream is wired');
  });

  it('DEV=true: seeded rows render, labeled as a simulation', () => {
    setDev(true);
    const html = renderTab(SystemLogsTab);
    expect(seededRows(html)).toBe(6);
    expect(html).toContain(
      'DEV simulation — fabricated log lines and severity labels; not server events',
    );
  });

  it('the streaming control renders only in DEV and names the simulation', () => {
    setDev(true);
    const dev = renderTab(SystemLogsTab);
    expect(dev).toContain('aria-label="Pause the simulated log stream"');

    setDev(false);
    const prod = renderTab(SystemLogsTab);
    expect(prod).not.toContain('simulated log stream');
  });
});

describe('system diagnostic tabs — honesty copy is rendered, not merely commented', () => {
  it('SystemQueueTab renders the no-endpoint standby', () => {
    const html = renderTab(SystemQueueTab);
    expect(html).toContain('No Queue Telemetry');
    expect(html).toMatch(/no server-side queue executor/i);
  });

  it('SystemFeatureFlagsTab renders the no-flag-service standby', () => {
    const html = renderTab(SystemFeatureFlagsTab);
    expect(html).toContain('No Flag Service Wired');
    expect(html).toMatch(/no flag service/i);
  });

  it('SystemLogsTab never claims a live server stream or a false audit result', () => {
    setDev(true);
    const dev = renderTab(SystemLogsTab);
    setDev(false);
    const prod = renderTab(SystemLogsTab);

    for (const html of [dev, prod]) {
      expect(html).not.toMatch(/Real-time stdout stream/);
      expect(html).not.toMatch(/DATADOG/i);
      expect(html).not.toContain('No audit records found');
      expect(html).toContain('no server log stream is wired');
      expect(html).toContain('Audit records are not available');
    }
  });
});
