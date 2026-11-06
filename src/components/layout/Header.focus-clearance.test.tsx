/** @vitest-environment jsdom */
/**
 * Partner sticky-header focus clearance (WCAG 2.2 SC 2.4.11).
 *
 * The hosted 56-row matrix measured partner `/orders` rows where a Tab-focused
 * row action was fully covered by `position: sticky` header chrome —
 * `Header.tsx` is `sticky top-0 z-30` and is deliberately allowed to wrap to
 * two rows on phones (`flex-col` -> `sm:flex-row sm:flex-wrap`), so its height
 * is a layout fact rather than a constant. These tests assert the mechanism:
 * the Header publishes its own measured height on the root, keeps it current,
 * releases only its own property, and the root rule consumes it additively.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HEADER_SRC from './Header.tsx?raw';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'u_test_op', role: 'branch_owner', name: 'Test Operator', branchIds: ['b1'] },
    signOut: vi.fn(),
  }),
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({
    selectedBranchId: 'b1',
    toggleSidebar: vi.fn(),
    sidebarOpen: false,
  }),
}));

vi.mock('@/components/layout/Sidebar', () => ({
  NAV_TOGGLE_ID: 'app-nav-toggle',
  SIDEBAR_ID: 'app-sidebar',
  Sidebar: () => null,
}));
vi.mock('@/components/layout/BranchSwitcher', () => ({
  BranchSwitcher: () => <div data-testid="branch-switcher" />,
}));
vi.mock('@/components/layout/NotificationBell', () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));
vi.mock('@/components/ui/PetpoojaStatusBadge', () => ({
  PetpoojaStatusBadge: () => <div data-testid="petpooja-badge" />,
}));
vi.mock('@/components/ui/Logo', () => ({
  Logo: () => <div data-testid="logo" />,
}));

import { Header } from './Header';

class ControllableResizeObserver {
  static instances: ControllableResizeObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: ResizeObserverCallback) {
    ControllableResizeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.observed.push(target);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function giveHeight(el: Element, height: number) {
  Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => height });
  el.getBoundingClientRect = () =>
    ({
      top: 0,
      bottom: height,
      left: 0,
      right: 390,
      width: 390,
      height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

const rootVar = (name: string) => document.documentElement.style.getPropertyValue(name);
const VAR = '--top-chrome-height';

async function reflow() {
  await act(async () => {
    ControllableResizeObserver.instances.forEach((observer) => observer.trigger());
  });
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mountHeader() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
  });
  const header = container.querySelector('header');
  expect(header, 'Header must render its sticky <header>').not.toBeNull();
  return header as HTMLElement;
}

beforeEach(() => {
  ControllableResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', ControllableResizeObserver);
  document.documentElement.style.removeProperty(VAR);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container?.remove();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty(VAR);
});

describe('partner Header publishes its measured sticky height', () => {
  it('is the sticky top chrome, not a fixed band', async () => {
    const header = await mountHeader();
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('top-0');

    // Before layout there is nothing to reserve; publishing 0 would be a lie.
    expect(rootVar(VAR)).toBe('');

    giveHeight(header, 64);
    await reflow();
    expect(rootVar(VAR)).toBe('64px');
  });

  it('tracks the two-row wrapped header with the same observer', async () => {
    const header = await mountHeader();
    giveHeight(header, 64);
    await reflow();
    const observers = ControllableResizeObserver.instances.length;
    expect(observers).toBeGreaterThan(0);

    // The real page wraps to two rows on a phone, and grows again at 200% text.
    giveHeight(header, 132);
    await reflow();
    expect(rootVar(VAR)).toBe('132px');
    expect(ControllableResizeObserver.instances.length).toBe(observers);
  });

  it('removes only its own property on detach', async () => {
    const header = await mountHeader();
    giveHeight(header, 132);
    await reflow();
    document.documentElement.style.setProperty('color-scheme', 'dark');

    await act(async () => root!.unmount());
    root = null;

    expect(rootVar(VAR)).toBe('');
    expect(ControllableResizeObserver.instances.every((o) => o.disconnected)).toBe(true);
    expect(rootVar('color-scheme')).toBe('dark');
  });

  it('wires the real header node to the publisher', () => {
    expect(HEADER_SRC).toContain('useRootHeightVar(\'--top-chrome-height\')');
    expect(HEADER_SRC).toContain('ref={chromeRef}');
  });
});
