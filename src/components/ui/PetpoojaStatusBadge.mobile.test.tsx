/** @vitest-environment jsdom */
/**
 * Partner header Petpooja badge — phone-width clarity.
 *
 * The honesty work behind `PetpoojaStatusBadge.test.ts` fixed the *words* (an
 * unverified link may never render `Live`, and no timestamp may be invented).
 * It did not fix what the chip says on a phone: the `Petpooja POS:` identity is
 * `hidden lg:inline`, so a 390px header renders a bare `UNKNOWN` pill with no
 * POS context at all — ambiguous POS labelling, not a role-resolution fault.
 * (The uppercase role badge is itself `hidden sm:inline`, so it is NOT visible
 * beside the chip on a phone; this suite claims nothing about it.)
 *
 * This suite mounts the real component (auth + sync service mocked, nothing
 * touches the network) and pins the phone-width contract:
 *   - the chip still identifies itself as Petpooja POS at phone widths, and the
 *     accessible name says so too,
 *   - the unmounted state stays honestly `Unknown` with no `Live` claim and no
 *     fabricated clock time,
 *   - `branch_staff` gets no sync control and is never told to tap one,
 *   - an authorised role keeps a sync control with a descriptive name and the
 *     44px project target, and a successful sync still transitions to `Live`.
 *
 * JSDOM LIMITATION (explicit): jsdom applies no CSS and no media queries, so a
 * `hidden lg:inline` span is still in the DOM and `getComputedStyle` cannot
 * answer "is this visible at 390px". Where an assertion depends on breakpoint
 * visibility it reads the Tailwind class contract of the rendered element and
 * is marked `[class-contract]`. Everything else asserts rendered text, names,
 * roles and behaviour.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { syncMock, authRole } = vi.hoisted(() => ({
  syncMock: vi.fn(),
  authRole: { current: 'branch_owner' as string },
}));

vi.mock('@/services/petpoojaSync', () => ({
  syncPetpoojaMenuForBranch: syncMock,
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'u_test_operator', role: authRole.current, branchIds: ['branch_surat_01'] },
    signOut: vi.fn(),
  }),
}));

import { PetpoojaStatusBadge } from './PetpoojaStatusBadge';

/** Base (mobile-first) display utilities that make an element visible. */
const BASE_DISPLAY_UTILITIES = [
  'inline',
  'inline-flex',
  'inline-block',
  'block',
  'flex',
  'grid',
  'contents',
];

/**
 * Is this element hidden at phone width, judged from its own class contract?
 * `hidden` hides it from 0px up; only a later unprefixed display utility in the
 * same class list re-shows it (`sm:`/`lg:`/`xl:` variants do not apply yet).
 */
function hiddenAtPhoneWidth(element: Element): boolean {
  const tokens = (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  let hidden = false;
  for (const token of tokens) {
    if (token === 'hidden') hidden = true;
    else if (BASE_DISPLAY_UTILITIES.includes(token)) hidden = false;
  }
  return hidden;
}

/** Text a sighted phone user actually reads: skips hidden and sr-only subtrees. */
function visibleText(node: Element): string {
  let text = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent ?? '';
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const element = child as Element;
    if (hiddenAtPhoneWidth(element)) continue;
    if ((element.getAttribute('class') ?? '').split(/\s+/).includes('sr-only')) continue;
    text += visibleText(element);
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** Accessible name of the chip: explicit name first, otherwise its text. */
function accessibleName(element: Element): string {
  const label = element.getAttribute('aria-label')?.trim();
  if (label) return label;
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mountBadge() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<PetpoojaStatusBadge branchId="branch_surat_01" />);
  });
  const chip = container.firstElementChild;
  expect(chip, 'the badge must render a chip element').not.toBeNull();
  return chip as HTMLElement;
}

function syncButton(chip: HTMLElement): HTMLButtonElement | null {
  return chip.querySelector('button');
}

beforeEach(() => {
  authRole.current = 'branch_owner';
  syncMock.mockReset();
  syncMock.mockResolvedValue({ categoriesSynced: 13, itemsSynced: 63, syncedAt: new Date() });
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container?.remove();
});

describe('Petpooja badge on a phone-width header', () => {
  it('keeps an explicit Petpooja POS identity instead of a bare UNKNOWN pill [class-contract]', async () => {
    const chip = await mountBadge();

    // The whole visible chip must still name the POS. With the identity span at
    // `hidden lg:inline` this reads just "Unknown" on a 390px header.
    expect(visibleText(chip)).toMatch(/petpooja\s*pos/i);
    expect(visibleText(chip)).toMatch(/unknown/i);
  });

  it('names itself Petpooja POS for assistive technology', async () => {
    const chip = await mountBadge();
    expect(accessibleName(chip)).toMatch(/petpooja\s*pos/i);
    // The name must carry the honest state too, not just the brand.
    expect(accessibleName(chip)).toMatch(/unknown/i);
  });

  it('claims no Live link and invents no sync timestamp before any real sync', async () => {
    const chip = await mountBadge();

    expect(visibleText(chip)).not.toMatch(/\blive\b/i);
    expect(accessibleName(chip)).not.toMatch(/\blive\b/i);
    expect(chip.textContent ?? '').not.toMatch(/\bjust now\b/i);
    // A clock time can only come from a measured sync; nothing has run yet.
    expect(chip.textContent ?? '').not.toMatch(/\d{1,2}:\d{2}/);
  });

  it('offers no sync control to branch_staff and never tells them to tap one', async () => {
    authRole.current = 'branch_staff';
    const chip = await mountBadge();

    expect(syncButton(chip)).toBeNull();
    // The old unknown tooltip pointed at a sync icon this role does not get.
    expect(chip.outerHTML).not.toMatch(/tap the sync icon/i);
    // The refusal is still explained somewhere reachable in the chip.
    const explanation = `${chip.getAttribute('title') ?? ''} ${chip.outerHTML}`;
    expect(explanation).toMatch(/manager action/i);
  });

  it('still lets an authorised role sync, with a named 44px control', async () => {
    authRole.current = 'branch_owner';
    const chip = await mountBadge();

    const button = syncButton(chip);
    expect(button, 'branch_owner may sync (server gate mirrors this role)').not.toBeNull();

    const name = button!.getAttribute('aria-label') ?? '';
    expect(name).toMatch(/sync/i);
    expect(name).toMatch(/petpooja\s*pos|pos/i);

    // Project touch target is 44px (WCAG 2.2 AA floor is 24px).
    const classes = (button!.getAttribute('class') ?? '').split(/\s+/);
    expect(classes).toContain('min-h-11');
    expect(classes).toContain('min-w-11');
  });

  it('transitions to Live only after a successful sync, with a measured time', async () => {
    const chip = await mountBadge();
    const button = syncButton(chip);
    expect(button).not.toBeNull();

    await act(async () => {
      button!.click();
    });

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(syncMock).toHaveBeenCalledWith('branch_surat_01');
    expect(visibleText(chip)).toMatch(/\blive\b/i);
    expect(chip.textContent ?? '').toMatch(/\d{1,2}:\d{2}/);
  });

  it('wraps inside the row instead of forcing horizontal overflow [class-contract]', async () => {
    const chip = await mountBadge();
    const classes = (chip.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

    // Real browser RED (Brave, 320px @ 200% root text) measured the chip at
    // 400.3px and the document at 424px: `shrink-0` + `space-x-*` made the chip
    // one unbreakable line. That measurement is the decisive proof; these
    // assertions pin the class contract that produced it, because jsdom has no
    // layout engine and cannot measure.
    expect(classes).not.toContain('shrink-0');
    expect(classes.filter((token) => token.startsWith('space-x-'))).toEqual([]);
    expect(classes).not.toContain('overflow-hidden');
    expect(classes).toContain('flex-wrap');
    expect(classes).toContain('min-w-0');
    expect(classes).toContain('max-w-full');
    // Wrapping must come from gap, not from leftover margin tricks.
    expect(classes.some((token) => token.startsWith('gap'))).toBe(true);

    // No element in the chip may hide or truncate content to fake the fit.
    for (const element of chip.querySelectorAll('*')) {
      const tokens = (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
      expect(tokens, 'no truncation').not.toContain('truncate');
      expect(tokens, 'no clipping').not.toContain('overflow-hidden');
      expect(tokens, 'no nowrap').not.toContain('whitespace-nowrap');
    }
  });

  it('keeps the full identity and the 44px target when the chip wraps', async () => {
    const chip = await mountBadge();

    // Wrapping must not cost the label, the state, or the control's size.
    expect(visibleText(chip)).toMatch(/petpooja\s*pos/i);
    expect(visibleText(chip)).toMatch(/unknown/i);

    const button = syncButton(chip);
    expect(button).not.toBeNull();
    const buttonClasses = (button!.getAttribute('class') ?? '').split(/\s+/);
    expect(buttonClasses).toContain('min-h-11');
    expect(buttonClasses).toContain('min-w-11');
    // The control stays a fixed-size object; it must not shrink to fit.
    expect(buttonClasses).toContain('shrink-0');
    expect(button!.getAttribute('aria-label')).toMatch(/sync/i);
  });
});
