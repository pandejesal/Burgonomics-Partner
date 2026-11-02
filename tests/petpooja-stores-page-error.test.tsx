import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Item 5 (api-contract-audit): PetpoojaStoresPage must show a LOAD ERROR when
 * the store directory read fails. The previous code caught every failure into
 * setStores([]), so a broken read was indistinguishable from "no outlets
 * connected" and the table was silently blank.
 *
 * The gateway's getStores() now reads Firestore `stores` (public read,
 * firestore.rules:550-553) and REJECTS on failure, so the page has a real
 * error to render.
 */
const { getStores, getStoreStatus } = vi.hoisted(() => ({
  getStores: vi.fn(),
  getStoreStatus: vi.fn(),
}));

vi.mock('@/core/integrations/petpooja', () => ({
  petpoojaGateway: { getStores, getStoreStatus },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { PetpoojaStoresPage } from '../src/admin/pages/petpooja/PetpoojaStoresPage';

import { JSDOM } from 'jsdom';

describe('petpooja stores page error honesty', () => {
  let root: Root;
  let container: HTMLDivElement;
  const originalGlobals = new Map<string, PropertyDescriptor | undefined>();

  beforeAll(() => {
    const { window } = new JSDOM('<!doctype html><html><body></body></html>');
    const globals: Record<string, unknown> = {
      window,
      document: window.document,
      HTMLElement: window.HTMLElement,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    for (const [key, value] of Object.entries(globals)) {
      originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    container?.remove();
    vi.clearAllMocks();
  });

  afterAll(() => {
    for (const [key, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });

  async function mount(element: React.ReactNode) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(element));
  }

  it('shows the directory failure instead of an empty fleet', async () => {
    getStores.mockRejectedValue(
      Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      })
    );

    await mount(<PetpoojaStoresPage />);

    const text = container.textContent ?? '';
    expect(text).toContain('Store directory could not be loaded');
    expect(text).toContain('Missing or insufficient permissions.');
    // The old dead-end copy must not be what a failed read renders.
    expect(text).not.toContain('No Petpooja stores connected yet');
  });

  it('renders the real stores when the directory loads', async () => {
    getStores.mockResolvedValue([
      {
        id: 'store_surat_01',
        name: 'Burgonomics Surat Adajan',
        address: 'Shop 4, Prime Arcade',
        city: 'Surat',
        area: 'Adajan',
        lat: 21.1959,
        lng: 72.7933,
        isOpen: true,
        petpoojaRestId: 'PP-SURAT-01',
      },
    ]);
    getStoreStatus.mockResolvedValue({
      storeId: 'store_surat_01',
      menuVersion: 'Standby',
      lastSuccessfulVersion: 'Standby',
      lastSyncTime: 'Awaiting sync',
      webhookStatus: 'standby',
      circuitBreaker: 'closed',
      queueState: 'idle',
      retryCount: 0,
      apiCredentialsLinked: false,
      webhookSecretLinked: false,
      posTerminalOnline: false,
    });

    await mount(<PetpoojaStoresPage />);

    const text = container.textContent ?? '';
    expect(text).toContain('Burgonomics Surat Adajan');
    expect(text).toContain('PP-SURAT-01');
    expect(text).not.toContain('Store directory could not be loaded');
  });
});
