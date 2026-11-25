/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: {
      id: 'usr_store_op',
      name: 'Chef Mario',
      role: 'branch_owner',
      email: 'mario.partner@burgonomics.test',
      branchIds: ['branch_flagship_01'],
    },
    signOut: vi.fn(),
  }),
}));

vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({
    branches: [
      {
        id: 'branch_flagship_01',
        name: 'Indiranagar Flagship Outlet',
        active: true,
        acceptingOrdersStatus: 'open',
        prepTimeMinutes: 20,
      },
    ],
    isLoading: false,
    updateBranchSettings: {
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    },
  }),
}));

vi.mock('@/components/admin/DevDiagnosticsModal', () => ({
  DevDiagnosticsModal: () => null,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { SettingsPage } from './SettingsPage';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
});

describe('SettingsPage Native Reflow & Responsive Layout Suite (Prompt 23 / Baseline r4)', () => {
  async function renderSettings() {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      );
    });
  }

  describe('1. Thermal Printer Settings Card Header & Actions Reflow', () => {
    it('allows thermal printer header to stack or wrap without overflow at narrow widths', async () => {
      await renderSettings();

      const thermalHeading = Array.from(container.querySelectorAll('h2')).find((el) =>
        el.textContent?.includes('Thermal KOT Printer Configuration')
      );
      expect(thermalHeading).toBeDefined();

      const thermalHeader = thermalHeading?.closest('div.border-b');
      expect(thermalHeader).not.toBeNull();

      // Must allow responsive wrapping or column stacking on narrow mobile viewports
      expect(thermalHeader?.className).toMatch(/flex-col.*sm:flex-row|flex-wrap/);
      expect(thermalHeader?.className).toMatch(/gap-[234]/);
    });

    it('ensures thermal header title and badge wrap with min-w-0 and break-words', async () => {
      await renderSettings();

      const thermalHeading = Array.from(container.querySelectorAll('h2')).find((el) =>
        el.textContent?.includes('Thermal KOT Printer Configuration')
      );
      expect(thermalHeading).toBeDefined();
      expect(thermalHeading?.className).toContain('min-w-0');
      expect(thermalHeading?.className).toContain('break-words');
      expect(thermalHeading?.className).toContain('flex-wrap');

      const subtitle = thermalHeading?.nextElementSibling as HTMLElement | null;
      expect(subtitle).not.toBeNull();
      expect(subtitle?.className).toContain('min-w-0');
      expect(subtitle?.className).toContain('break-words');
    });

    it('ensures thermal test print action button has shrink-0 and does not blow out column width', async () => {
      await renderSettings();

      const testButton = Array.from(container.querySelectorAll('button')).find((el) =>
        el.textContent?.includes('Test Print KOT')
      );
      expect(testButton).toBeDefined();
      expect(testButton?.className).toContain('shrink-0');
    });
  });

  describe('2. Store Operating Status & Surge Controls Header and Control Rows Reflow', () => {
    it('allows store operating header to stack or wrap on narrow screens', async () => {
      await renderSettings();

      const storeHeading = Array.from(container.querySelectorAll('h2')).find((el) =>
        el.textContent?.includes('Store Operating Status & Surge Controls')
      );
      expect(storeHeading).toBeDefined();

      const storeHeader = storeHeading?.closest('div.border-b');
      expect(storeHeader).not.toBeNull();

      expect(storeHeader?.className).toMatch(/flex-col.*sm:flex-row|flex-wrap/);
      expect(storeHeader?.className).toMatch(/gap-[234]/);
    });

    it('ensures store operating title and status badge wrap with min-w-0 and break-words', async () => {
      await renderSettings();

      const storeHeading = Array.from(container.querySelectorAll('h2')).find((el) =>
        el.textContent?.includes('Store Operating Status & Surge Controls')
      );
      expect(storeHeading).toBeDefined();
      expect(storeHeading?.className).toContain('min-w-0');
      expect(storeHeading?.className).toContain('break-words');
      expect(storeHeading?.className).toContain('flex-wrap');

      const subtitle = storeHeading?.nextElementSibling as HTMLElement | null;
      expect(subtitle).not.toBeNull();
      expect(subtitle?.className).toContain('min-w-0');
      expect(subtitle?.className).toContain('break-words');
    });

    it('removed the timed pause buttons and keeps one open/close switch (A7 #3)', async () => {
      await renderSettings();

      // Owner decision 2026-11-25 #4: the "30m Rush Break" / "1h Rain Pause"
      // buttons are REMOVED — they promised a duration `applyStaffStoreStatus`
      // cannot honour (no expiry is stored, and only a staff reopen clears the
      // override), so an outlet "paused for an hour" stayed shut all night.
      const timed = Array.from(container.querySelectorAll('button')).filter(
        (el) =>
          el.textContent?.includes('30m Rush Break') || el.textContent?.includes('1h Rain Pause')
      );
      expect(timed).toHaveLength(0);

      // The normal switch survives, and still stacks on narrow viewports.
      const openButton = Array.from(container.querySelectorAll('button')).find((el) =>
        el.textContent?.includes('Open for Orders')
      );
      expect(openButton).toBeDefined();
      const switchGrid = openButton?.parentElement;
      expect(switchGrid).not.toBeNull();
      expect(switchGrid?.className).toContain('grid-cols-1');
    });

    it('wraps prep time slider label and action controls without clipping', async () => {
      await renderSettings();

      const prepLabel = container.querySelector('label[for="prepTimeSlider"]');
      expect(prepLabel).not.toBeNull();

      const prepSliderRow = prepLabel?.parentElement;
      expect(prepSliderRow).not.toBeNull();
      expect(prepSliderRow?.className).toContain('flex-wrap');
    });
  });

  describe('3. Operator Profile Card Header Reflow', () => {
    it('allows operator profile header to stack or wrap on narrow screens', async () => {
      await renderSettings();

      const signOutBtn = Array.from(container.querySelectorAll('button')).find((el) =>
        el.textContent?.includes('Sign Out')
      );
      expect(signOutBtn).toBeDefined();

      const profileHeader = signOutBtn?.closest('div.border-b');
      expect(profileHeader).not.toBeNull();

      expect(profileHeader?.className).toMatch(/flex-col.*sm:flex-row|flex-wrap/);
      expect(profileHeader?.className).toMatch(/gap-[234]/);
    });

    it('ensures operator profile avatar has shrink-0 and name container has min-w-0', async () => {
      await renderSettings();

      const operatorName = Array.from(container.querySelectorAll('h3')).find((el) =>
        el.textContent?.includes('Chef Mario')
      );
      expect(operatorName).toBeDefined();

      const textWrapper = operatorName?.parentElement;
      expect(textWrapper?.className).toContain('min-w-0');

      const avatar = textWrapper?.previousElementSibling as HTMLElement | null;
      expect(avatar).not.toBeNull();
      expect(avatar?.className).toContain('shrink-0');
    });

    it('ensures sign out button has shrink-0 to prevent button deformation', async () => {
      await renderSettings();

      const signOutBtn = Array.from(container.querySelectorAll('button')).find((el) =>
        el.textContent?.includes('Sign Out')
      );
      expect(signOutBtn).toBeDefined();
      expect(signOutBtn?.className).toContain('shrink-0');
    });
  });

  describe('4. No New Truncation or Ellipsis Regression Protection', () => {
    it('ensures operator name wraps naturally and does NOT introduce new truncate class', async () => {
      await renderSettings();

      const operatorName = Array.from(container.querySelectorAll('h3')).find((el) =>
        el.textContent?.includes('Chef Mario')
      );
      expect(operatorName).toBeDefined();
      expect(operatorName?.className).not.toContain('truncate');
      expect(operatorName?.className).not.toContain('whitespace-nowrap');
      expect(operatorName?.className).toContain('break-words');
      expect(operatorName?.textContent).toContain('Chef Mario');
    });

    it('keeps the remaining switch copy wrapping without truncation', async () => {
      await renderSettings();

      // A7 #3: the two timed-pause controls are gone, so this protects the
      // control that remains (plus the closed-state copy that explains it).
      const closedCard = Array.from(container.querySelectorAll('button')).find((el) =>
        el.textContent?.includes('Store Closed')
      );
      expect(closedCard).toBeDefined();
      const closedCopy = Array.from(closedCard!.querySelectorAll('p')).find((el) =>
        el.textContent?.includes('until a staff member reopens')
      );
      expect(closedCopy).toBeDefined();
      expect(closedCopy?.className).not.toContain('truncate');
      expect(closedCopy?.className).not.toContain('whitespace-nowrap');
      // The copy must not promise a timer any more.
      expect(closedCopy?.textContent).not.toMatch(/1 ?h(our)?|30 ?m(in)?/i);

      const openCard = Array.from(container.querySelectorAll('button')).find((el) =>
        el.textContent?.includes('Open for Orders')
      );
      expect(openCard).toBeDefined();
      const openSpan = Array.from(openCard!.querySelectorAll('span')).find((el) =>
        el.textContent?.includes('Open for Orders')
      );
      expect(openSpan?.className).not.toContain('truncate');
      expect(openSpan?.className).not.toContain('whitespace-nowrap');
    });

    it('ensures footer product info wraps naturally and does NOT introduce truncate class', async () => {
      await renderSettings();

      const footerText = Array.from(container.querySelectorAll('span')).find((el) =>
        el.textContent?.includes('Burgonomics Partner POS')
      );
      expect(footerText).toBeDefined();
      expect(footerText?.className).not.toContain('truncate');
      expect(footerText?.className).not.toContain('whitespace-nowrap');
      expect(footerText?.textContent?.trim()).toBe('Burgonomics Partner POS • v2.4.0');
    });

    it('retains existing email truncate intact without regression', async () => {
      await renderSettings();

      const emailP = Array.from(container.querySelectorAll('p')).find((el) =>
        el.textContent?.includes('mario.partner@burgonomics.test')
      );
      expect(emailP).toBeDefined();
      expect(emailP?.className).toContain('truncate');
      expect(emailP?.textContent).toBe('mario.partner@burgonomics.test');
    });
  });

  describe('5. Residual Narrow-Column Settings Reflow Protection (Audio Tester & Prep Controls)', () => {
    it('ensures audio notification header wraps icon and title without blowing out 98px column', async () => {
      await renderSettings();

      const audioHeading = Array.from(container.querySelectorAll('h2')).find((el) =>
        el.textContent?.includes('Acoustic Chime & Browser Notification Test')
      );
      expect(audioHeading).toBeDefined();

      const textWrapper = audioHeading?.parentElement;
      const iconTitleRow = textWrapper?.parentElement;
      expect(iconTitleRow).not.toBeNull();
      expect(iconTitleRow?.className).toMatch(/flex-wrap|flex-col/);
      expect(iconTitleRow?.className).toContain('min-w-0');
    });

    it('ensures native range inputs have explicit min-w-0 to override intrinsic element width', async () => {
      await renderSettings();

      const inputs = Array.from(container.querySelectorAll('input[type="range"]'));
      expect(inputs.length).toBeGreaterThanOrEqual(2);

      for (const input of inputs) {
        expect(input.className).toContain('min-w-0');
      }
    });

    it('ensures Test Kitchen Chime action and alarm status text wrap and retain full copy', async () => {
      await renderSettings();

      const chimeBtn = Array.from(container.querySelectorAll('button')).find((el) =>
        el.textContent?.includes('Test Kitchen Chime')
      );
      expect(chimeBtn).toBeDefined();

      const chimeRow = chimeBtn?.parentElement;
      expect(chimeRow).not.toBeNull();
      expect(chimeRow?.className).toMatch(/flex-col.*sm:flex-row|flex-wrap/);
      expect(chimeRow?.className).toContain('min-w-0');
      expect(chimeRow?.className).toContain('max-w-full');

      const repeatP = chimeRow?.querySelector('p');
      expect(repeatP).not.toBeNull();
      expect(repeatP?.className).toContain('min-w-0');
      expect(repeatP?.className).toContain('break-words');
      expect(repeatP?.textContent).toMatch(/Pending-order alarm repeats every \d+s until acknowledged\./);
    });

    it('ensures store prep controls block does not use shrink-0 and save button allows min-w-0 with full copy', async () => {
      await renderSettings();

      const saveBtn = Array.from(container.querySelectorAll('button')).find((el) =>
        el.textContent?.includes('Save prep time')
      );
      expect(saveBtn).toBeDefined();

      const controlsBlock = saveBtn?.parentElement;
      expect(controlsBlock).not.toBeNull();
      expect(controlsBlock?.className).not.toContain('shrink-0');
      expect(controlsBlock?.className).toContain('min-w-0');
      expect(controlsBlock?.className).toContain('max-w-full');

      expect(saveBtn?.className).not.toContain('shrink-0');
      expect(saveBtn?.className).toContain('min-w-0');
      expect(saveBtn?.textContent?.trim()).toBe('Save prep time');
    });
  });
});
