/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Synthetic test stores and mocks adhering to testing boundaries
// ---------------------------------------------------------------------------

const testUser = {
  id: 'u_test_op',
  role: 'branch_owner',
  name: 'Test Operator',
  branchIds: [] as string[],
};

const appStoreState = {
  selectedBranchId: null as string | null,
  setSelectedBranchId: vi.fn(),
  toggleSidebar: vi.fn(),
  sidebarOpen: false,
};

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: testUser,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: () => appStoreState,
}));

vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => ({
    orders: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock('@/services/partnerFunctionsApi', () => ({
  partnerFunctionsApi: {
    bookPorterRider: vi.fn(),
  },
}));

vi.mock('@/features/orders', () => ({
  OrderFiltersBar: () => <div data-testid="order-filters-bar" />,
  OrderTableList: () => <div data-testid="order-table-list" />,
  ManualOrderCreateModal: () => null,
  KOTPrintPreview: () => null,
  orderRef: vi.fn(),
}));

vi.mock('@/components/layout/BranchSwitcher', () => ({
  BranchSwitcher: () => <div data-testid="branch-switcher" />,
}));

vi.mock('@/components/layout/NotificationBell', () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));

vi.mock('@/components/ui/PetpoojaStatusBadge', () => ({
  PetpoojaStatusBadge: () => null,
}));

vi.mock('@/components/ui/Logo', () => ({
  Logo: () => <span data-testid="logo">Burgonomics</span>,
}));

vi.mock('@/utils/kdsAudio', () => ({
  isKDSAudioMuted: () => false,
  setKDSAudioMuted: vi.fn(),
  unlockKDSAudio: vi.fn(async () => true),
  isKDSAudioUnlocked: () => true,
  acknowledgeKDSAlarm: vi.fn(),
}));

const mockStream = {
  isOnline: true,
  isLoading: false,
  streamError: null as unknown,
  streamStatus: 'live' as const,
  dataVerified: true,
  activeOrders: [] as any[],
  pendingOrders: [] as any[],
  preparingOrders: [] as any[],
  readyOrders: [] as any[],
  bumpOrder: vi.fn(),
  bumpingIds: {},
  recallLastOrder: vi.fn(),
  canRecall: false,
  lastBumpedOrder: null,
  newOrderIds: [] as string[],
  newOrderTotal: 0,
  dismissNewOrderAlert: vi.fn(),
  refresh: vi.fn(),
  lastRefreshAt: Date.now(),
  scopeBranchIds: ['branch_1'],
};

vi.mock('@/features/kds', async () => {
  const actual = await vi.importActual<any>('@/features/kds/hooks/useKDSRealtimeStream');
  return {
    deriveKdsColumnState: actual.deriveKdsColumnState,
    formatKdsDataAge: actual.formatKdsDataAge,
    useKDSRealtimeStream: () => mockStream,
    AcousticChimePlayer: () => null,
    KDSAudioUnlockModal: () => null,
    KDSNewOrderAlert: () => null,
    KDSOrderCard: () => null,
    KDSQuick86Drawer: () => null,
    KOTTimerBadge: () => null,
  };
});

// Import components under test
import { KDSPage } from './KDSPage';
import { OrdersPage } from './OrdersPage';
import { Header } from '../components/layout/Header';

// ---------------------------------------------------------------------------
// Mock ResizeObserver with inspection & manual trigger capabilities
// ---------------------------------------------------------------------------

type ROEntry = {
  contentRect?: { height: number; width?: number };
  borderBoxSize?: Array<{ blockSize: number; inlineSize?: number }>;
};

class MockResizeObserver {
  callback: (entries: ROEntry[], observer: MockResizeObserver) => void;
  static instances: MockResizeObserver[] = [];
  elements: Element[] = [];
  observedOptions: ResizeObserverOptions[] = [];

  constructor(cb: (entries: ROEntry[], observer: MockResizeObserver) => void) {
    this.callback = cb;
    MockResizeObserver.instances.push(this);
  }

  observe = vi.fn((el: Element, options?: ResizeObserverOptions) => {
    this.elements.push(el);
    if (options) this.observedOptions.push(options);
  });

  unobserve = vi.fn((el: Element) => {
    this.elements = this.elements.filter((e) => e !== el);
  });

  disconnect = vi.fn(() => {
    this.elements = [];
  });

  trigger(entries: ROEntry[] = [{}]) {
    this.callback(entries, this);
  }
}

function stubElementHeight(el: HTMLElement, height: number) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    height,
    width: 195,
    top: 0,
    bottom: height,
    left: 0,
    right: 195,
    x: 0,
    y: 0,
    toJSON: () => {},
  } as DOMRect);
  Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true, writable: true });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Narrow Viewport Focus Reflow & Sticky Unpin Suite', () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalInnerHeightDesc = Object.getOwnPropertyDescriptor(window, 'innerHeight');

  beforeEach(() => {
    MockResizeObserver.instances = [];
    (globalThis as any).ResizeObserver = MockResizeObserver;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    (globalThis as any).ResizeObserver = originalResizeObserver;
    if (originalInnerHeightDesc) {
      Object.defineProperty(window, 'innerHeight', originalInnerHeightDesc);
    } else {
      delete (window as any).innerHeight;
    }
    vi.restoreAllMocks();
  });

  describe('KDSPage — dynamic header pinning under narrow/short viewports', () => {
    it('starts non-sticky fail-closed before geometry measurement', async () => {
      Object.defineProperty(window, 'innerHeight', { value: 422, configurable: true, writable: true });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <KDSPage />
          </MemoryRouter>,
        );
      });

      const header = container.querySelector('header');
      expect(header).not.toBeNull();
      // On initial fail-closed before RO measurement, header must not be sticky top-0
      expect(header?.className).not.toContain('sticky top-0');
      expect(header?.className).toContain('relative');
    });

    it('remains non-sticky when actual border height is 224px even if contentRect reports 80px (viewport 422px)', async () => {
      Object.defineProperty(window, 'innerHeight', { value: 422, configurable: true, writable: true });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <KDSPage />
          </MemoryRouter>,
        );
      });

      const header = container.querySelector('header') as HTMLElement;
      expect(header).not.toBeNull();

      const ro = MockResizeObserver.instances[MockResizeObserver.instances.length - 1];
      expect(ro).toBeDefined();

      // Stub actual element box height (including borders and padding) to 224px (224 >= 422 / 2 = 211)
      stubElementHeight(header, 224);

      // Trigger ResizeObserver reporting contentRect height 80px (content box only)
      await act(async () => {
        ro.trigger([{ contentRect: { height: 80 } }]);
      });

      // Must remain non-sticky because ACTUAL outer element height 224px exceeds half viewport
      expect(header?.className).not.toContain('sticky top-0');
      expect(header?.className).toContain('relative');
    });

    it('unpins header to relative flow when toolbar height (250px) >= half viewport (422px)', async () => {
      Object.defineProperty(window, 'innerHeight', { value: 422, configurable: true, writable: true });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <KDSPage />
          </MemoryRouter>,
        );
      });

      const header = container.querySelector('header') as HTMLElement;
      expect(header).not.toBeNull();

      const ro = MockResizeObserver.instances[MockResizeObserver.instances.length - 1];
      expect(ro).toBeDefined();

      // Stub actual outer element height to 250px (250 >= 422 / 2 = 211)
      stubElementHeight(header, 250);

      await act(async () => {
        ro.trigger();
      });

      // Occlusion regression fix: toolbar must unpin into relative flow to prevent occluding focused items
      expect(header?.className).not.toContain('sticky top-0');
      expect(header?.className).toContain('relative');
    });

    it('repins header to sticky top-0 when toolbar height (80px) < half viewport (780px)', async () => {
      Object.defineProperty(window, 'innerHeight', { value: 780, configurable: true, writable: true });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <KDSPage />
          </MemoryRouter>,
        );
      });

      const header = container.querySelector('header') as HTMLElement;
      expect(header).not.toBeNull();

      const ro = MockResizeObserver.instances[MockResizeObserver.instances.length - 1];
      expect(ro).toBeDefined();

      // Stub actual outer element height to 80px (80 < 780 / 2 = 390)
      stubElementHeight(header, 80);

      await act(async () => {
        ro.trigger();
      });

      // Ample viewport: sticky top-0 pinned
      expect(header?.className).toContain('sticky top-0');
      expect(header?.className).not.toContain('relative');
    });

    it('dynamically repins and unpins via window resize event when viewport shrinks from 780px to 120px', async () => {
      Object.defineProperty(window, 'innerHeight', { value: 780, configurable: true, writable: true });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <KDSPage />
          </MemoryRouter>,
        );
      });

      const header = container.querySelector('header') as HTMLElement;
      expect(header).not.toBeNull();

      const ro = MockResizeObserver.instances[MockResizeObserver.instances.length - 1];
      expect(ro).toBeDefined();

      stubElementHeight(header, 80);

      await act(async () => {
        ro.trigger();
      });
      expect(header?.className).toContain('sticky top-0');

      // Shrink viewport to 120px (80 >= 120 / 2 = 60) -> window resize must trigger unpin
      Object.defineProperty(window, 'innerHeight', { value: 120, configurable: true, writable: true });
      await act(async () => {
        window.dispatchEvent(new Event('resize'));
      });
      expect(header?.className).not.toContain('sticky top-0');
      expect(header?.className).toContain('relative');

      // Expand viewport back to 780px (80 < 780 / 2 = 390) -> window resize must repin
      Object.defineProperty(window, 'innerHeight', { value: 780, configurable: true, writable: true });
      await act(async () => {
        window.dispatchEvent(new Event('resize'));
      });
      expect(header?.className).toContain('sticky top-0');
      expect(header?.className).not.toContain('relative');
    });

    it('cleans up ResizeObserver and removes registered window resize listener on unmount', async () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      await act(async () => {
        root.render(
          <MemoryRouter>
            <KDSPage />
          </MemoryRouter>,
        );
      });

      const ro = MockResizeObserver.instances[MockResizeObserver.instances.length - 1];
      expect(ro).toBeDefined();

      await act(async () => {
        root.unmount();
      });

      expect(ro.disconnect).toHaveBeenCalled();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('stays non-sticky when ResizeObserver is unavailable', async () => {
      delete (globalThis as any).ResizeObserver;
      Object.defineProperty(window, 'innerHeight', { value: 780, configurable: true, writable: true });

      await act(async () => {
        root.render(
          <MemoryRouter>
            <KDSPage />
          </MemoryRouter>,
        );
      });

      const header = container.querySelector('header');
      expect(header).not.toBeNull();
      // Fail closed: without ResizeObserver, remains non-sticky relative
      expect(header?.className).not.toContain('sticky top-0');
      expect(header?.className).toContain('relative');
    });
  });

  describe('OrdersPage — narrow viewport reflow without title clipping', () => {
    it('h1 title wraps with min-w-0 and max-w-full to prevent 213px overflow at 180-195px', async () => {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <OrdersPage />
          </MemoryRouter>,
        );
      });

      const h1 = container.querySelector('h1');
      expect(h1).not.toBeNull();

      // Heading must allow wrapping and shrink down on 180px/195px viewports
      expect(h1?.className).toContain('flex-wrap');
      expect(h1?.className).toContain('min-w-0');
      expect(h1?.className).toContain('max-w-full');
    });

    it('title parent container specifies min-w-0 to allow flex reflow', async () => {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <OrdersPage />
          </MemoryRouter>,
        );
      });

      const h1 = container.querySelector('h1');
      expect(h1).not.toBeNull();

      // Parent container must allow shrinking flex items
      expect(h1?.parentElement?.className).toContain('min-w-0');
    });

    it('retains all visible copy in title and auto-refresh badge', async () => {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <OrdersPage />
          </MemoryRouter>,
        );
      });

      const h1 = container.querySelector('h1');
      expect(h1?.textContent).toContain('Live Orders & Petpooja Billing');
      expect(h1?.textContent).toContain('Auto-refreshes every 30s');
    });
  });

  describe('Header — unselected POS chip narrow viewport reflow', () => {
    it('unselected Petpooja POS chip allows shrinking with min-w-0 and break-words', async () => {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <Header />
          </MemoryRouter>,
        );
      });

      const spans = Array.from(container.querySelectorAll('span'));
      const posSpan = spans.find((s) => s.textContent?.includes('Petpooja POS: select an outlet'));
      expect(posSpan).toBeDefined();

      // Must allow shrink: no shrink-0, min-w-0, and break-words so 189px intrinsic chip reflows
      expect(posSpan?.className).not.toContain('shrink-0');
      expect(posSpan?.className).toContain('min-w-0');
      expect(posSpan?.className).toContain('break-words');
    });

    it('retains all visible copy without clipping or ellipsis truncation', async () => {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <Header />
          </MemoryRouter>,
        );
      });

      const spans = Array.from(container.querySelectorAll('span'));
      const posSpan = spans.find((s) => s.textContent?.includes('Petpooja POS: select an outlet'));
      expect(posSpan).toBeDefined();

      expect(posSpan?.textContent?.trim()).toBe('Petpooja POS: select an outlet');
      expect(posSpan?.className).not.toContain('truncate');
      expect(posSpan?.className).not.toContain('overflow-hidden');
    });
  });
});
