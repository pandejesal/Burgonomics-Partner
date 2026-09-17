import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock appConfig to return petpoojaEnabled: true so the gateway factory
// loads the live gateway instead of throwing. This must be hoisted so
// it runs before the gateway module is evaluated.
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
      petpoojaEnabled: true,
      mapsApiKey: '',
      firebaseConfig: '',
    },
  },
  isDev: () => true,
  isProd: () => false,
}));

import { HttpPetpoojaGateway } from './httpGateway';
import { createPetpoojaGateway } from './gateway';

const okFetch = (body: any = {}) =>
  (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

const failingFetch = ((_url: any, _init: any) => {
  throw new Error('proxy down');
}) as typeof fetch;

describe('petpooja gateway wiring', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // non-DOM env — outbox storage is guarded
    }
  });

  it('returns the live gateway when petpoojaEnabled=true', () => {
    expect(createPetpoojaGateway().implementation).toBe('live');
  });

  it('live pushOrder acknowledges via the proxy contract', async () => {
    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: 'https://proxy.test/api',
      fetchImpl: okFetch({ success: true, kotNumber: 'KOT-123' }),
      outboxKey: 'test.outbox.ok',
    });
    expect(gw.implementation).toBe('live');
    const res = await gw.pushOrder('ord_1', { id: 'ord_1', items: [] } as any);
    expect(res.acknowledged).toBe(true);
    expect(res.kotNumber).toBe('KOT-123');
    // no secrets leave the browser
    expect(res.payload.app_key).toBe('');
    expect(res.payload.app_secret).toBe('');
  });

  it('failed pushOrder is queued, visible, and replayable', async () => {
    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: 'https://proxy.test/api',
      fetchImpl: failingFetch,
      outboxKey: 'test.outbox.fail',
      breakerThreshold: 100,
    });
    const res = await gw.pushOrder('ord_9', { id: 'ord_9', items: [] } as any);
    expect(res.acknowledged).toBe(false);

    const queues = await gw.getQueues();
    expect(queues.waitingJobsCount).toBe(1);

    // proxy recovers → replay drains the outbox
    (gw as unknown as { fetchImpl: typeof fetch }).fetchImpl = okFetch({ success: true, kotNumber: 'KOT-9' });
    const replay = await gw.replayWebhook('any');
    expect(replay.acknowledged).toBe(true);
    expect((await gw.getQueues()).waitingJobsCount).toBe(0);
  });

  it('circuit breaker opens after the threshold and surfaces in metrics', async () => {
    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: 'https://proxy.test/api',
      fetchImpl: failingFetch,
      outboxKey: 'test.outbox.breaker',
      breakerThreshold: 2,
      logWriteTimeoutMs: 50,
    });
    await gw.pushMenu('branch_x');
    await gw.pushMenu('branch_x');
    const metrics = await gw.getMetrics();
    expect(metrics.openBreakersCount).toBe(1);
    expect(metrics.simulated).toBe(false);
    const health = await gw.getHealth();
    expect(health.connected).toBe(false);
  });
});
