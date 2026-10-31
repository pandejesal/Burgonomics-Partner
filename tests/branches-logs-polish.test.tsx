import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { role: 'brand_owner' } }),
}));
vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({
    branches: [
      { id: 'active', name: 'Active outlet', status: 'active', active: true },
      { id: 'legacy', name: 'Legacy active outlet', active: true },
      { id: 'inactive', name: 'Inactive outlet', status: 'inactive', active: false },
      { id: 'upcoming', name: 'Upcoming outlet', status: 'coming_soon', active: false },
    ],
    isLoading: false,
    createBranch: {},
  }),
}));
vi.mock('@/features/branches/components/BranchConfigModal', () => ({ BranchConfigModal: () => null }));
vi.mock('@/components/stores/BranchSettingsModal', () => ({ BranchSettingsModal: () => null }));
vi.mock('@/components/stores/FranchiseLeadsPipeline', () => ({ FranchiseLeadsPipeline: () => null }));
vi.mock('@/components/stores/LaunchBroadcastModal', () => ({ LaunchBroadcastModal: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BranchesPage } from '../src/pages/BranchesPage';
import { SystemLogsTab } from '../src/admin/pages/system/SystemLogsTab';

// Reuse the workspace's existing DOM install; no new package dependency.
const require = createRequire(import.meta.url);
const { JSDOM } = require('../../burgonomics-foundation-core/node_modules/jsdom/lib/api.js') as {
  JSDOM: new (html: string) => { window: Window & typeof globalThis; };
};

describe('branch counts and local log console polish', () => {
  let root: Root;
  let container: HTMLDivElement;
  const originalGlobals = new Map<string, PropertyDescriptor | undefined>();

  beforeAll(() => {
    const { window } = new JSDOM('<!doctype html><html><body></body></html>');
    const globals: Record<string, unknown> = {
      window, document: window.document, HTMLElement: window.HTMLElement,
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
    vi.unstubAllEnvs();
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

  it('shows the same active count as the Active filter yields for mixed branch records', async () => {
    await mount(<BranchesPage />);
    expect(container.querySelectorAll('h3')).toHaveLength(4);
    const activeButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.startsWith('Active Live Outlets'),
    )!;
    const displayedCount = Number(activeButton.textContent?.match(/\((\d+)\)/)?.[1]);
    await act(async () => activeButton.click());
    const names = Array.from(container.querySelectorAll('h3'), (heading) => heading.textContent);
    expect(names).toEqual(['Active outlet', 'Legacy active outlet']);
    expect(displayedCount).toBe(names.length);
    const filterButtons = Array.from(container.querySelectorAll('button')).filter(
      (button) => /^(All Branches|Active Live Outlets|Coming Soon|Franchise Leads)/.test(button.textContent ?? ''),
    );
    expect(filterButtons).toHaveLength(4);
    for (const button of filterButtons) expect(button.classList.contains('min-h-[44px]')).toBe(true);
  });

  it.each([true, false])('names log controls and exposes severity pressed state (DEV=%s)', async (dev) => {
    vi.stubEnv('DEV', dev);
    await mount(<SystemLogsTab />);
    expect(container.querySelector('button[aria-label="Download local log buffer"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Clear local log buffer"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Filter log text"]')).not.toBeNull();
    expect(container.querySelector('.animate-pulse')).toBeNull();
    const levels = Array.from(container.querySelectorAll('button[aria-pressed]'));
    expect(levels).toHaveLength(5);
    expect(levels.filter((button) => button.getAttribute('aria-pressed') === 'true').map((button) => button.textContent)).toEqual(['ALL']);
    for (const button of levels) {
      expect(button.classList.contains('min-h-[44px]')).toBe(true);
      expect(button.classList.contains('min-w-[44px]')).toBe(true);
    }
    await act(async () => levels.find((button) => button.textContent === 'ERROR')!.click());
    expect(levels.filter((button) => button.getAttribute('aria-pressed') === 'true').map((button) => button.textContent)).toEqual(['ERROR']);
    if (dev) {
      await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Pause the simulated log stream"]')!.click());
      expect(container.querySelector('.animate-pulse')).toBeNull();
    }
  });
});
