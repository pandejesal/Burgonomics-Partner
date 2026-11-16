// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SystemSecurityTab } from '@/admin/pages/system/SystemSecurityTab';

it('does not offer a local maintenance control or claim a live status', async () => {
  vi.stubEnv('VITE_ADMIN_MAINTENANCE_PIN', '');
  const prompt = vi.spyOn(window, 'prompt');
  const fetch = vi.spyOn(globalThis, 'fetch');
  const container = document.createElement('div');
  const root = createRoot(container);
  const reactEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => root.render(<SystemSecurityTab />));
    expect(container.textContent).toMatch(/maintenance status.*(?:unavailable|cannot be read)/i);
    expect(container.textContent).toMatch(/no server-side session revocation/i);
    expect(container.querySelector('input, button')).toBeNull();
    expect(prompt).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previous;
    prompt.mockRestore();
    fetch.mockRestore();
    vi.unstubAllEnvs();
  }
});
