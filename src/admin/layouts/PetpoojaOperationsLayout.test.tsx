import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Flag lives in a hoisted mutable holder so both gate states can be asserted
// without re-importing the module (same mock pattern as httpGateway.test.ts,
// but with a getter so the flag is read at render time, not import time).
const envHolder = vi.hoisted(() => ({ petpoojaEnabled: false }));

vi.mock('@/core/config/env', () => ({
  appConfig: {
    env: 'development',
    appName: 'Burgonomics Partner',
    appVersion: '1.0.0',
    api: { baseUrl: 'https://test', timeoutMs: 15000, retry: { attempts: 2, backoffMs: 500 } },
    featureFlags: { offlineMode: false, orderTracking: true, referrals: false, adminOps: true },
    analytics: { enabled: false, writeKey: '' },
    push: { enabled: true, vapidPublicKey: '' },
    integrations: {
      razorpayKeyId: '',
      paymentsApiBaseUrl: 'https://test',
      get petpoojaEnabled() {
        return envHolder.petpoojaEnabled;
      },
      mapsApiKey: '',
      firebaseConfig: '',
    },
  },
  isDev: () => true,
  isProd: () => false,
}));

// The gateway Proxy throws when the flag is off — mock it so the layout's
// deferred getAlerts call has a deterministic target, and so this test can
// never depend on a real .env.
vi.mock('@/core/integrations/petpooja', () => ({
  petpoojaGateway: {
    getAlerts: () => Promise.resolve([]),
  },
}));

import { PetpoojaOperationsLayout } from './PetpoojaOperationsLayout';

const CHILD_MARKER = 'CHILD_ROUTE_MARKER';

function renderWithRouteChild() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/admin/petpooja/stores']}>
      <Routes>
        <Route path="/admin/petpooja" element={<PetpoojaOperationsLayout />}>
          <Route path="stores" element={<div>{CHILD_MARKER}</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function renderWithExplicitChildren() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/admin/delivery-queue']}>
      <PetpoojaOperationsLayout>
        <div>{CHILD_MARKER}</div>
      </PetpoojaOperationsLayout>
    </MemoryRouter>,
  );
}

describe('P0-2 PetpoojaOperationsLayout gateway gate', () => {
  beforeEach(() => {
    envHolder.petpoojaEnabled = false;
  });

  it('flag OFF: renders layout chrome + standby card, route child never rendered (never mounts)', () => {
    const markup = renderWithRouteChild();

    // Chrome stays (heading/tabs are not the failure surface)…
    expect(markup).toContain('PETPOOJA OPERATIONS CENTER');
    expect(markup).toContain('Sync Logs');
    // …the explicit disabled standby card is shown…
    expect(markup).toContain('Integration disabled');
    expect(markup).toContain('VITE_PETPOOJA_ENABLED=true');
    expect(markup).toContain('STANDBY');
    // …and the matched child route element is absent from the render tree,
    // so it cannot mount and run its gateway access effects.
    expect(markup).not.toContain(CHILD_MARKER);
  });

  it('flag OFF: explicitly passed children (gateway-independent, e.g. delivery-queue) still render', () => {
    const markup = renderWithExplicitChildren();
    expect(markup).toContain(CHILD_MARKER);
    expect(markup).not.toContain('Integration disabled');
  });

  it('flag ON (control): child renders and no standby card is shown', () => {
    envHolder.petpoojaEnabled = true;
    const markup = renderWithRouteChild();
    expect(markup).toContain(CHILD_MARKER);
    expect(markup).not.toContain('Integration disabled');
    expect(markup).not.toContain('VITE_PETPOOJA_ENABLED=true');
  });
});
