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

// Alerts wiring — extracted to petpoojaAlerts.ts and tested here because the
// vitest env is 'node' (no jsdom, no RTL): the layout delegates its mount
// effect and Retry button to createPetpoojaAlertsLoader(), and its banner
// visibility to petpoojaAlertsVisibility(). Exact behavior, not snapshots.
import { PetpoojaOperationsLayout, PetpoojaIncidentAlerts } from './PetpoojaOperationsLayout';
import {
  createPetpoojaAlertsLoader,
  petpoojaAlertsVisibility,
} from './petpoojaAlerts';
import type { GatewayAlert } from '@/core/integrations/petpooja/types';

const okAlert: GatewayAlert = {
  id: 'outbox-depth',
  type: 'warning',
  title: '1 order push queued',
  message: 'Replay to retry.',
  timestamp: '2026-10-20T00:00:00.000Z',
};

describe('createPetpoojaAlertsLoader (alerts wiring: failure is distinct from "no alerts")', () => {
  it('positive: a successful gateway response lands phase "ok" with the alerts', async () => {
    const seen: Array<{ phase: string; alerts: GatewayAlert[] }> = [];
    const load = createPetpoojaAlertsLoader({
      enabled: true,
      getAlerts: () => Promise.resolve([okAlert]),
      onState: (s) => seen.push({ phase: s.phase, alerts: s.alerts }),
    });
    await load();
    expect(seen).toEqual([{ phase: 'ok', alerts: [okAlert] }]);
  });

  it('positive/explicit-empty: gateway returns zero alerts -> phase "ok" with an empty list (a truthful "none", never an error claim)', async () => {
    const seen: Array<{ phase: string; alerts: GatewayAlert[] }> = [];
    const load = createPetpoojaAlertsLoader({
      enabled: true,
      getAlerts: () => Promise.resolve([]),
      onState: (s) => seen.push({ phase: s.phase, alerts: s.alerts }),
    });
    await load();
    expect(seen).toEqual([{ phase: 'ok', alerts: [] }]);
  });

  it('negative (the defect): gateway rejection must become phase "failed" — never silently indistinguishable from "no alerts"', async () => {
    const seen: Array<{ phase: string; alerts: GatewayAlert[] }> = [];
    const load = createPetpoojaAlertsLoader({
      enabled: true,
      getAlerts: () => Promise.reject(new Error('health read failed')),
      onState: (s) => seen.push({ phase: s.phase, alerts: s.alerts }),
    });
    await load();
    expect(seen).toEqual([{ phase: 'failed', alerts: [] }]);
  });

  it('negative (DS review): malformed non-array payload must be "failed", never a truthful-looking "none"', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const seen: Array<{ phase: string; alerts: GatewayAlert[] }> = [];
    const load = createPetpoojaAlertsLoader({
      enabled: true,
      getAlerts: () => Promise.resolve(undefined as unknown as GatewayAlert[]),
      onState: (s) => seen.push({ phase: s.phase, alerts: s.alerts }),
    });
    await load();
    expect(seen).toEqual([{ phase: 'failed', alerts: [] }]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('negative (DS review): disabled integration must not call the gateway at all and must not produce a failure state', async () => {
    let calls = 0;
    const seen: Array<{ phase: string; alerts: GatewayAlert[] }> = [];
    const load = createPetpoojaAlertsLoader({
      enabled: false,
      getAlerts: () => { calls += 1; return Promise.reject(new Error('fail-closed throw')); },
      onState: (s) => seen.push({ phase: s.phase, alerts: s.alerts }),
    });
    await load();
    expect(calls).toBe(0);
    expect(seen).toEqual([]);
  });

  it('positive retry: a failed load followed by a retry that succeeds flips the state back to "ok"', async () => {
    const seen: Array<{ phase: string; alerts: GatewayAlert[] | null }> = [];
    let fail = true;
    const load = createPetpoojaAlertsLoader({
      enabled: true,
      getAlerts: () => (fail ? Promise.reject(new Error('down')) : Promise.resolve([okAlert])),
      onState: (s) => seen.push({ phase: s.phase, alerts: s.alerts }),
    });
    await load();
    expect(seen).toEqual([{ phase: 'failed', alerts: [] }]);
    fail = false;
    await load();
    expect(seen).toEqual([{ phase: 'failed', alerts: [] }, { phase: 'ok', alerts: [okAlert] }]);
  });

  it('negative race (DS review): a SLOWER OLDER attempt must never overwrite a newer attempt\'s published state', async () => {
    let releaseSlow!: (alerts: GatewayAlert[]) => void;
    const slowGate = new Promise<GatewayAlert[]>((resolve) => { releaseSlow = resolve; });
    const seen: Array<{ phase: string; alerts: GatewayAlert[] | null }> = [];
    let attempt = 0;
    const load = createPetpoojaAlertsLoader({
      enabled: true,
      getAlerts: () => { attempt += 1; return attempt === 1 ? slowGate : Promise.reject(new Error('fast failure')); },
      onState: (s) => seen.push({ phase: s.phase, alerts: s.alerts }),
    });
    const slowAttempt = load();          // attempt 1 — resolves late with alerts
    await load();                        // attempt 2 — fails fast, publishes
    expect(seen).toEqual([{ phase: 'failed', alerts: [] }]);
    releaseSlow([okAlert]);              // late resolution of the OLD attempt
    await slowAttempt;
    expect(seen).toEqual([{ phase: 'failed', alerts: [] }]);
  });
});

describe('petpoojaAlertsVisibility (banner decision: honest error vs truthful nothing)', () => {
  it('failure with integration ENABLED: show the retry banner, show no incident feed', () => {
    expect(petpoojaAlertsVisibility({ phase: 'failed', alerts: [] }, true)).toEqual({
      showLoadFailure: true,
      showIncidents: false,
    });
  });

  it('failure with integration DISABLED: standby card is authoritative — no failure banner, no incidents', () => {
    expect(petpoojaAlertsVisibility({ phase: 'failed', alerts: [] }, false)).toEqual({
      showLoadFailure: false,
      showIncidents: false,
    });
  });

  it('success with incidents: incidents shown, no banner', () => {
    expect(petpoojaAlertsVisibility({ phase: 'ok', alerts: [okAlert] }, true)).toEqual({
      showLoadFailure: false,
      showIncidents: true,
    });
  });

  it('success with zero incidents: nothing is shown (never implies either claim)', () => {
    expect(petpoojaAlertsVisibility({ phase: 'ok', alerts: [] }, true)).toEqual({
      showLoadFailure: false,
      showIncidents: false,
    });
  });
});

describe('PetpoojaIncidentAlerts markup (pins the LAYOUT wiring — the old bug fails these)', () => {
  const noop = () => undefined;
  const render = (state: { phase: 'ok' | 'failed'; alerts: GatewayAlert[] }, enabled: boolean, retrying = false) =>
    renderToStaticMarkup(
      <PetpoojaIncidentAlerts state={state} enabled={enabled} onRetry={noop} retrying={retrying} onDismiss={noop} />,
    );

  it('failed load + enabled: paints the load-failure banner with Retry, paints NO incident and NO "no incidents" claim', () => {
    const markup = render({ phase: 'failed', alerts: [] }, true);
    expect(markup).toContain('Could not load incident alerts');
    expect(markup).toContain('Retry');
    expect(markup).not.toContain(okAlert.title);
    expect(markup).not.toContain('Integration disabled');
  });

  it('failed load + enabled + retrying: button is disabled and labelled Retrying', () => {
    const markup = render({ phase: 'failed', alerts: [] }, true, true);
    expect(markup).toContain('Retrying');
    expect(markup).toContain('disabled');
    expect(markup).not.toContain('>Retry<');
  });

  it('ok + incidents: paints the incident card, no failure banner', () => {
    const markup = render({ phase: 'ok', alerts: [okAlert] }, true);
    expect(markup).toContain(okAlert.title);
    expect(markup).not.toContain('Could not load incident alerts');
  });

  it('ok + zero incidents + enabled: paints NOTHING (no banner, no claim)', () => {
    expect(render({ phase: 'ok', alerts: [] }, true)).toBe('');
  });

  it('failed load + DISABLED: paints nothing (standby card lives elsewhere and is authoritative)', () => {
    expect(render({ phase: 'failed', alerts: [] }, false)).toBe('');
  });
});


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
