/** @vitest-environment jsdom */
/**
 * ChatPage connectivity contract.
 *
 * The page must never present a dead Firestore listener as a healthy "Live
 * Channel", must stop its loaders when a listener errors, must keep the last
 * good same-thread messages behind an honest error alert, and must not show
 * the fresh-thread welcome screen as if a read had succeeded and returned
 * nothing.
 *
 * Only the hook boundary is faked here; the page renders for real, and the
 * hook's own logic is covered by useChats.test.tsx.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order, Ticket } from '@/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const authState = {
  user: {
    id: 'usr_branch_op',
    name: 'Branch Operator',
    email: 'op@burgonomics.test',
    role: 'branch_owner',
    branchIds: ['branch_surat_01'],
    cityIds: ['Surat'],
  },
};

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: authState.user }),
}));

vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({ branches: [], isLoading: false }),
}));

// The attach modal pulls the order/ticket feeds, so this boundary stub stands in
// for it. It mirrors the real props contract (see AttachReferenceModal.tsx) and
// lets the page's stored chips be exercised: closed → null; open → two
// selection buttons that fire the real callbacks. This is an I/O boundary
// double, NOT acceptance of the real modal or its data feeds.
const attachStub = await vi.hoisted(async () => {
  // A real Firestore Timestamp, imported inside the hoisted factory: module
  // scope is unavailable here, and a hand-rolled object would not satisfy the
  // SDK's Timestamp class type.
  const { Timestamp } = await import('firebase/firestore');
  const at = Timestamp.fromMillis(0);
  const order: Order = {
    id: 'ord_synth_000123',
    customerId: 'cust_synth',
    customerName: 'Synthetic Diner',
    customerPhone: '+91 90000 00000',
    branchId: 'branch_surat_01',
    items: [
      {
        itemId: 'item_synth_1',
        petpoojaItemId: 'pp_synth_1',
        name: 'Synthetic Burger',
        quantity: 1,
        price: 249,
      },
    ],
    subtotal: 249,
    tax: 12,
    deliveryFee: 0,
    total: 261,
    orderType: 'delivery',
    status: 'pending',
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    createdAt: at,
    updatedAt: at,
  };
  const ticket: Ticket = {
    id: 'tkt_synth_000456',
    title: 'Synthetic incident',
    branchId: 'branch_surat_01',
    raisedById: 'usr_branch_op',
    raisedByName: 'Branch Operator',
    raisedByRole: 'branch_owner',
    category: 'app_bug',
    priority: 'high',
    message: 'Synthetic ticket body',
    status: 'open',
    createdAt: at,
    updatedAt: at,
  };
  return {
    order,
    ticket,
    closed: null as null | (() => void),
    // Props captured from the most recent open render, so a test can hold a
    // previous owner's callback and invoke it later (staleness contract).
    selectOrder: null as null | ((order: Order) => void),
    selectTicket: null as null | ((ticket: Ticket) => void),
  };
});

vi.mock('@/components/chat/AttachReferenceModal', () => ({
  AttachReferenceModal: (props: {
    isOpen: boolean;
    onClose: () => void;
    onSelectOrder: (order: Order) => void;
    onSelectTicket: (ticket: Ticket) => void;
  }) => {
    if (!props.isOpen) return null;
    attachStub.closed = props.onClose;
    attachStub.selectOrder = props.onSelectOrder;
    attachStub.selectTicket = props.onSelectTicket;
    return (
      <div data-testid="attach-stub">
        <button
          type="button"
          data-testid="attach-select-order"
          onClick={() => props.onSelectOrder(attachStub.order)}
        >
          Select synthetic order
        </button>
        <button
          type="button"
          data-testid="attach-select-ticket"
          onClick={() => props.onSelectTicket(attachStub.ticket)}
        >
          Select synthetic ticket
        </button>
      </div>
    );
  },
}));

const retryMocks = vi.hoisted(() => ({
  retryThreads: vi.fn(),
  retryMessages: vi.fn(),
  setActiveThreadId: vi.fn(),
  // MATCHING FIXTURE CORRECTION: the hook boundary reports an explicit send
  // outcome. A guard no-op is `refused`; only `sent` means the write persisted.
  // The old `async () => undefined` fixture silently stood for "accepted" and
  // is exactly what hid the draft-loss defect.
  sendMessage: vi.fn(
    async (): Promise<{ status: 'sent'; messageId: string } | { status: 'refused' }> => ({
      status: 'sent',
      messageId: 'msg_page_fixture',
    })
  ),
}));

const chatState: Record<string, unknown> = {};

vi.mock('@/hooks/useChats', () => ({
  useChats: () => chatState,
}));

const timestamp = { toMillis: () => 0, toDate: () => new Date(0) };

const thread = {
  id: 'thread_a',
  type: 'branch_channel' as const,
  title: 'Surat Operations',
  participantIds: [],
  participantNames: {},
  createdAt: timestamp,
};

const message = {
  id: 'msg_1',
  chatId: 'thread_a',
  senderId: 'usr_other',
  senderName: 'Brand Owner',
  senderRole: 'brand_owner' as const,
  text: 'hello there',
  createdAt: timestamp,
};

const { ChatPage } = await import('./ChatPage');

let root: Root;
let container: HTMLDivElement;

function setChatState(overrides: Record<string, unknown>): void {
  for (const key of Object.keys(chatState)) delete chatState[key];
  Object.assign(chatState, {
    threads: [],
    activeThreadId: null,
    setActiveThreadId: retryMocks.setActiveThreadId,
    activeThread: undefined,
    messages: [],
    loadingThreads: false,
    loadingMessages: false,
    messagesSynced: false,
    retrying: false,
    // Additive per-feed flags. Present so the page boundary can be driven both
    // ways once the hook exposes them; the aggregate stays for older fixtures.
    retryingThreads: false,
    retryingMessages: false,
    // Additive future field: the hook's own auth-scope key. The page must
    // consume this rather than recomputing from the auth store.
    authorizationScopeKey: null as string | null,
    threadsError: null,
    messagesError: null,
    retryThreads: retryMocks.retryThreads,
    retryMessages: retryMocks.retryMessages,
    sendMessage: retryMocks.sendMessage,
    createOrOpenBranchChannel: vi.fn(),
    createOrOpenDirectDm: vi.fn(),
    ...overrides,
  });
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    );
  });
}

const text = () => container.textContent ?? '';

const alerts = () => Array.from(container.querySelectorAll('[role="alert"]'));

const retryButton = () =>
  Array.from(container.querySelectorAll('button')).find((button) =>
    /retry/i.test(button.textContent ?? '')
  );

async function clickRetry(): Promise<void> {
  const button = retryButton();
  expect(button).toBeDefined();
  await act(async () => {
    button?.click();
  });
}

// --- module-scope page helpers -------------------------------------------
// `type()` used to live inside one describe; the forced-room tests need it too.

const composerInput = () =>
  container.querySelector<HTMLInputElement>('input[placeholder^="Message "]');

/**
 * Set the composer text through React's own value tracker, as a user would.
 * Calling the native setter first keeps React's dedupe from swallowing it.
 */
async function type(value: string): Promise<void> {
  const input = composerInput();
  expect(input).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/**
 * STRUCTURAL check only, never visual/mobile acceptance: jsdom performs no
 * layout, so this reads the utility-class gate that decides whether the pane is
 * displayable. It proves the CSS class is applied, not that a phone paints it.
 */
const paneUtilityClass = (anchor: Element | null, marker: string): string => {
  let node: Element | null = anchor;
  while (node) {
    const className = node.getAttribute('class') ?? '';
    if (className.includes(marker)) return className;
    node = node.parentElement;
  }
  return '';
};

const isDisplayedStructurally = (className: string): boolean =>
  className.split(/\s+/).includes('flex') && !className.split(/\s+/).includes('hidden');

/** The left rooms pane, anchored on its Branch Rooms tab. */
const listPaneClass = () => {
  const tab = Array.from(container.querySelectorAll('button')).find((button) =>
    /branch rooms/i.test(button.textContent ?? '')
  );
  return paneUtilityClass(tab ?? null, 'md:w-80');
};

/** The right chat pane, anchored on the composer input. */
const chatPaneClass = () => paneUtilityClass(composerInput(), 'flex-1 flex-col');

const attachChipText = () =>
  Array.from(container.querySelectorAll('div'))
    .filter((node) => /Attached Reference:/.test(node.textContent ?? ''))
    .map((node) => node.textContent ?? '')
    .join(' | ');

// The chip dismiss control is icon-only, so its own text never matches the
// chip label. Anchor on the "Attached Reference:" span, walk to the reference
// container, and count only the buttons inside it. Returns [] when no chip row
// exists, which is what the post-clear assertions rely on.
const attachChipContainer = (): Element | null => {
  const label = Array.from(container.querySelectorAll('span')).find(
    (span) => (span.textContent ?? '').trim() === 'Attached Reference:'
  );
  return label?.parentElement ?? null;
};

const attachChipButtons = () => {
  const row = attachChipContainer();
  if (!row) return [] as HTMLButtonElement[];
  return Array.from(row.querySelectorAll<HTMLButtonElement>('button'));
};

/**
 * Escaped-rejection probe.
 *
 * A settlement the page never handles fails the suite on its own, but these
 * cases also want to assert that count directly. `process` has no ambient type
 * in this app's DOM tsconfig, so the host is resolved from `globalThis` and
 * structurally verified at runtime — a narrow test-boundary type, not an
 * `any` hole, and no global tsconfig or @types change.
 */
interface RejectionHost {
  on: (event: 'unhandledRejection', listener: (reason: unknown) => void) => unknown;
  off: (event: 'unhandledRejection', listener: (reason: unknown) => void) => unknown;
}

function rejectionHost(): RejectionHost | null {
  const scope: unknown = globalThis;
  if (typeof scope !== 'object' || scope === null || !('process' in scope)) return null;
  const candidate: unknown = scope.process;
  if (typeof candidate !== 'object' || candidate === null) return null;
  const on: unknown = 'on' in candidate ? candidate.on : undefined;
  const off: unknown = 'off' in candidate ? candidate.off : undefined;
  if (typeof on !== 'function' || typeof off !== 'function') return null;
  return {
    on: (event, listener) => Reflect.apply(on, candidate, [event, listener]),
    off: (event, listener) => Reflect.apply(off, candidate, [event, listener]),
  };
}

function createRejectionProbe() {
  const rejections: unknown[] = [];
  const host = rejectionHost();
  const listener = (reason: unknown): void => {
    rejections.push(reason);
  };
  return {
    rejections,
    /** Start a case with no history and one live listener. */
    install(): void {
      rejections.length = 0;
      host?.on('unhandledRejection', listener);
    },
    /** Always removable, including after a failed assertion. */
    uninstall(): void {
      host?.off('unhandledRejection', listener);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  attachStub.closed = null;
  attachStub.selectOrder = null;
  attachStub.selectTicket = null;
  // jsdom implements no layout, so scrollIntoView is absent. The page's
  // auto-scroll is not what this suite is about — stub the environment gap.
  Element.prototype.scrollIntoView = vi.fn();
  // Restore a connected device for every test; offline tests opt out.
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => true,
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('ChatPage thread-list failure', () => {
  it('ends the thread loader and surfaces the failure instead of an empty list claim', async () => {
    setChatState({
      loadingThreads: false,
      threads: [],
      threadsError: 'permission-denied',
    });
    await render();

    expect(text()).not.toMatch(/Loading rooms/i);
    expect(alerts().length).toBeGreaterThan(0);
    expect(text()).toMatch(/permission-denied/i);
  });

  it('still lists the last good rooms under the error banner instead of hiding them', async () => {
    setChatState({
      loadingThreads: false,
      threads: [thread],
      threadsError: 'network',
    });
    await render();

    expect(text()).toMatch(/Surat Operations/);
    expect(alerts().length).toBeGreaterThan(0);
    expect(text()).toMatch(/may be out of date/i);
  });

  it('offers a Retry button with an accessible name, not just a styled span', async () => {
    setChatState({ loadingThreads: false, threads: [], threadsError: 'permission-denied' });
    await render();

    const button = retryButton();
    expect(button).toBeDefined();
    // A real button element with a usable accessible name. jsdom performs no
    // layout, so the class below is a design-token intent check only — it is
    // NOT proof of a 44px render; the touch target needs device verification.
    expect(button?.tagName).toBe('BUTTON');
    expect(button?.getAttribute('type')).toBe('button');
    expect((button?.textContent ?? '').trim()).toMatch(/retry/i);
    expect(button?.className ?? '').toMatch(/min-h-\[44px\]/);

    await clickRetry();
    expect(retryMocks.retryThreads).toHaveBeenCalledTimes(1);
    expect(retryMocks.retryMessages).not.toHaveBeenCalled();
  });
});

describe('ChatPage composer scope', () => {
  const composer = composerInput;

  const failingMessages = {
    threads: [thread],
    activeThreadId: 'thread_a',
    activeThread: thread,
    messages: [message],
    loadingMessages: false,
    messagesSynced: true,
    messagesError: 'network',
  };

  it('preserves the draft across a same-thread retry', async () => {
    setChatState(failingMessages);
    await render();

    await type('kitchen is short a fryer');
    expect(composer()?.value).toBe('kitchen is short a fryer');

    await clickRetry();
    expect(retryMocks.retryMessages).toHaveBeenCalledTimes(1);
    expect(composer()?.value).toBe('kitchen is short a fryer');
  });

  it('does not carry the previous account draft across a user change', async () => {
    setChatState(failingMessages);
    await render();

    await type('draft belonging to the first operator');
    expect(composer()?.value).toBe('draft belonging to the first operator');

    // The next operator signs in and their own room loads — the composer
    // comes back, and it must come back empty.
    authState.user = { ...authState.user, id: 'usr_second_op' };
    setChatState({
      threads: [thread],
      activeThreadId: 'thread_a',
      activeThread: thread,
      messages: [],
      loadingThreads: false,
      loadingMessages: false,
      messagesSynced: true,
    });
    await render();

    expect(composer()).not.toBeNull();
    expect(composer()?.value).toBe('');
    authState.user = { ...authState.user, id: 'usr_branch_op' };
  });
});

describe('ChatPage message-stream failure', () => {
  it('keeps the same-thread last good messages behind an honest error, and stops calling it live', async () => {
    setChatState({
      threads: [thread],
      activeThreadId: 'thread_a',
      activeThread: thread,
      messages: [message],
      loadingMessages: false,
      messagesSynced: true,
      messagesError: 'network',
    });
    await render();

    expect(text()).toMatch(/hello there/);
    expect(alerts().length).toBeGreaterThan(0);
    expect(text()).toMatch(/network/i);
    expect(text()).not.toMatch(/Live Channel/i);
  });

  it('does not present a fresh-thread welcome when the first message read failed', async () => {
    setChatState({
      threads: [thread],
      activeThreadId: 'thread_a',
      activeThread: thread,
      messages: [],
      loadingMessages: false,
      messagesError: 'unavailable',
    });
    await render();

    expect(text()).not.toMatch(/Welcome to/i);
    expect(alerts().length).toBeGreaterThan(0);
  });

  it('retries the message subscription once without sending anything', async () => {
    setChatState({
      threads: [thread],
      activeThreadId: 'thread_a',
      activeThread: thread,
      messages: [message],
      loadingMessages: false,
      messagesError: 'network',
    });
    await render();

    await clickRetry();

    expect(retryMocks.retryMessages).toHaveBeenCalledTimes(1);
    expect(retryMocks.retryThreads).not.toHaveBeenCalled();
    expect(retryMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('shows feedback and blocks a second click while a retry is in flight', async () => {
    setChatState({
      threads: [thread],
      activeThreadId: 'thread_a',
      activeThread: thread,
      messages: [message],
      loadingMessages: false,
      messagesError: 'network',
      retrying: true,
      retryingMessages: true,
    });
    await render();

    const button = retryButton();
    expect(button).toBeDefined();
    // Retrying is announced, and the control cannot fire a duplicate retry.
    expect((button?.textContent ?? '')).toMatch(/retrying/i);
    expect(button?.getAttribute('aria-disabled')).toBe('true');

    await clickRetry();
    expect(retryMocks.retryMessages).not.toHaveBeenCalled();
  });

  it('does not claim a live channel while the message stream is still connecting', async () => {
    setChatState({
      threads: [thread],
      activeThreadId: 'thread_a',
      activeThread: thread,
      messages: [],
      loadingMessages: true,
    });
    await render();

    expect(text()).not.toMatch(/Live Channel/i);
    expect(text()).toMatch(/Loading messages/i);
  });

  it('still shows the live channel and the welcome state once a thread really is loaded empty', async () => {
    setChatState({
      threads: [thread],
      activeThreadId: 'thread_a',
      activeThread: thread,
      messages: [],
      loadingMessages: false,
      messagesSynced: true,
    });
    await render();

    expect(text()).toMatch(/Live Channel/i);
    expect(text()).toMatch(/Welcome to Surat Operations/);
  });
});

describe('ChatPage offline honesty', () => {
  /** jsdom's navigator.onLine is read-only configurable; override both ways. */
  function setOnline(value: boolean): void {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => value,
    });
  }

  const syncedThread = {
    threads: [thread],
    activeThreadId: 'thread_a',
    activeThread: thread,
    messages: [message],
    loadingMessages: false,
    messagesSynced: true,
  };

  it('never claims a live channel while the device reports offline, even with a synced snapshot', async () => {
    setOnline(false);
    setChatState(syncedThread);
    await render();

    // A quiet onSnapshot keeps messagesSynced true; the offline signal is the
    // only evidence that the stream is not actually delivering.
    expect(text()).toMatch(/hello there/);
    expect(text()).not.toMatch(/Live Channel/i);
    expect(text()).toMatch(/offline/i);
  });

  it('returns to the live claim once connectivity is restored', async () => {
    setOnline(false);
    setChatState(syncedThread);
    await render();
    expect(text()).not.toMatch(/Live Channel/i);

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(text()).toMatch(/Live Channel/i);
  });

  it('does not blame the network for a permission-denied listener error', async () => {
    setOnline(true);
    setChatState({
      ...syncedThread,
      messagesError: 'Missing or insufficient permissions.',
    });
    await render();

    expect(alerts().length).toBeGreaterThan(0);
    expect(text()).toMatch(/permission/i);
    // The old copy asserted the connection was down; that was a false claim.
    expect(text()).not.toMatch(/while the connection is down/i);
    expect(text()).not.toMatch(/Live Channel/i);
  });
});

describe('ChatPage error placement', () => {
  const stream = () => container.querySelector('.flex-1.overflow-y-auto.p-4');

  it('renders the message error alert outside the scrolling message stream', async () => {
    setChatState({
      threads: [thread],
      activeThreadId: 'thread_a',
      activeThread: thread,
      messages: [message],
      loadingMessages: false,
      messagesSynced: true,
      messagesError: 'network',
    });
    await render();

    const scrollContainer = stream();
    expect(scrollContainer).not.toBeNull();
    const alert = alerts()[0];
    expect(alert).toBeDefined();

    // On a phone the alert used to be the first child of the auto-scrolling
    // container and could scroll out of view entirely.
    expect(scrollContainer?.contains(alert) ?? false).toBe(false);
  });

  it('exposes stream status as an announced status region, without aria-busy suppression', async () => {
    setChatState({
      threads: [thread],
      activeThreadId: 'thread_a',
      activeThread: thread,
      messages: [message],
      loadingMessages: false,
      messagesSynced: true,
    });
    await render();

    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect((status?.textContent ?? '').length).toBeGreaterThan(0);
    // aria-busy="true" on a role="status" region can suppress the announcement.
    expect(status?.getAttribute('aria-busy')).toBeNull();
  });

  it('announces the connecting state without claiming liveness', async () => {
    setChatState({
      threads: [thread],
      activeThreadId: 'thread_a',
      activeThread: thread,
      messages: [],
      loadingMessages: true,
    });
    await render();

    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.getAttribute('aria-busy')).toBeNull();
    expect(text()).not.toMatch(/Live Channel/i);
  });
});

describe('ChatPage thread retry feedback', () => {
  const threadRetryButton = () =>
    Array.from(container.querySelectorAll('button')).find((button) =>
      /^(retry|retrying…?)$/i.test((button.textContent ?? '').trim())
    );

  const failingThreads = {
    loadingThreads: false,
    threads: [],
    threadsError: 'permission-denied',
    activeThreadId: null,
    activeThread: undefined,
  };

  it('shows a thread retry in flight as Retrying… and marks it disabled', async () => {
    // Fixture API adaptation (r18): the hook now exposes per-feed pending, so a
    // legacy aggregate-only fixture can no longer prove the rooms feed is busy.
    setChatState({ ...failingThreads, retrying: true, retryingThreads: true });
    await render();

    const button = threadRetryButton();
    expect(button).toBeDefined();
    expect((button?.textContent ?? '').trim()).toMatch(/retrying/i);
    expect(button?.getAttribute('aria-disabled')).toBe('true');
  });

  it('does not fire a second thread retry while one is in flight', async () => {
    setChatState({ ...failingThreads, retrying: true, retryingThreads: true });
    await render();

    const button = threadRetryButton();
    expect(button).toBeDefined();
    await act(async () => {
      button?.click();
    });

    // Concurrent retries of different types must never share one in-flight
    // slot; a second click here is a duplicate threads resubscription.
    expect(retryMocks.retryThreads).not.toHaveBeenCalled();
  });

  it('makes no provider writes when a thread retry is requested', async () => {
    setChatState(failingThreads);
    await render();

    const button = threadRetryButton();
    expect(button).toBeDefined();
    await act(async () => {
      button?.click();
    });

    expect(retryMocks.retryThreads).toHaveBeenCalledTimes(1);
    expect(retryMocks.sendMessage).not.toHaveBeenCalled();
  });
});

describe('ChatPage retry focus ownership', () => {
  const searchInput = () =>
    container.querySelector<HTMLInputElement>('input[placeholder^="Search rooms"]');
  const paperclipButton = () =>
    container.querySelector<HTMLButtonElement>('button[title^="Attach Order"]');

  const failing = {
    threads: [thread],
    activeThreadId: 'thread_a',
    activeThread: thread,
    messages: [message],
    loadingMessages: false,
    messagesSynced: true,
    messagesError: 'network',
  };

  const recovered = {
    threads: [thread],
    activeThreadId: 'thread_a',
    activeThread: thread,
    messages: [message],
    loadingMessages: false,
    messagesSynced: true,
    messagesError: null,
  };

  /** Focus the alert's Retry button and press it, as a keyboard user would. */
  async function focusAndPressRetry(): Promise<HTMLButtonElement> {
    const button = retryButton() as HTMLButtonElement | undefined;
    expect(button).toBeDefined();
    await act(async () => {
      button?.focus();
    });
    expect(document.activeElement).toBe(button);
    await act(async () => {
      button?.click();
    });
    return button as HTMLButtonElement;
  }

  it('returns focus to the composer on success when the user did not move it', async () => {
    setChatState(failing);
    await render();

    await focusAndPressRetry();

    // The retry is in flight; the operator waits. Fixture API adaptation (r18):
    // the messages feed must be marked busy for the focus watch to own it.
    setChatState({ ...failing, retrying: true, retryingMessages: true });
    await render();

    setChatState(recovered);
    await render();

    expect(composerInput()).not.toBeNull();
    expect(document.activeElement).toBe(composerInput());
  });

  it('does not steal focus from the search field if the user moved there while retrying', async () => {
    setChatState(failing);
    await render();

    await focusAndPressRetry();

    setChatState({ ...failing, retrying: true });
    await render();

    const search = searchInput();
    expect(search).not.toBeNull();
    await act(async () => {
      search?.focus();
    });
    expect(document.activeElement).toBe(search);

    setChatState(recovered);
    await render();

    // The operator chose a new target; recovery must not drag them away.
    expect(document.activeElement).toBe(searchInput());
  });

  it('does not steal focus from the attach control if the user moved there while retrying', async () => {
    setChatState(failing);
    await render();

    await focusAndPressRetry();

    setChatState({ ...failing, retrying: true });
    await render();

    const paperclip = paperclipButton();
    expect(paperclip).not.toBeNull();
    await act(async () => {
      paperclip?.focus();
    });

    setChatState(recovered);
    await render();

    expect(document.activeElement).toBe(paperclipButton());
  });

  it('does not jump focus to the composer when the retry fails again', async () => {
    setChatState(failing);
    await render();

    await focusAndPressRetry();

    setChatState({ ...failing, retrying: true });
    await render();

    // Retry failed again: same error, messages stay, synced stays false.
    setChatState({ ...failing, messagesSynced: false, retrying: false });
    await render();

    expect(document.activeElement).not.toBe(composerInput());
    expect(alerts().length).toBeGreaterThan(0);
  });
});

describe('ChatPage phone pane reachability', () => {
  const roomsError = 'permission-denied';

  /** Load room A, then tap its row — as a phone user does to open a room. */
  async function openRoomARow(): Promise<void> {
    setChatState({
      threads: [thread],
      activeThreadId: 'thread_a',
      activeThread: thread,
      messages: [message],
      loadingMessages: false,
      messagesSynced: true,
    });
    await render();

    const row = Array.from(container.querySelectorAll('button')).find((button) =>
      /Surat Operations/.test(button.textContent ?? '')
    );
    expect(row).toBeDefined();
    await act(async () => {
      row?.click();
    });
  }

  it('keeps the rooms list reachable after a forced selection clear under a rooms error', async () => {
    await openRoomARow();

    // The row tap hid the list for the phone's single-pane layout.
    expect(isDisplayedStructurally(listPaneClass())).toBe(false);

    // The scope switch then clears the selection while rooms also fail, so the
    // back button (which lives only inside displayThread) disappears too.
    setChatState({ threads: [], activeThreadId: null, activeThread: undefined, threadsError: roomsError });
    await render();

    expect(listPaneClass()).not.toBe('');
    expect(listPaneClass()).not.toMatch(/hidden/);
    expect(isDisplayedStructurally(listPaneClass())).toBe(true);
  });

  it('does not strand an empty scope behind a hidden list', async () => {
    await openRoomARow();

    // Same forced clear, but rooms loaded successfully and are simply empty.
    setChatState({ threads: [], activeThreadId: null, activeThread: undefined });
    await render();

    expect(isDisplayedStructurally(listPaneClass())).toBe(true);
  });

  it('still shows only the chat pane while a room is open', async () => {
    await openRoomARow();

    // Positive control: with a room open the phone shows the chat pane, so the
    // fix must not simply pin both panes visible at once.
    expect(isDisplayedStructurally(chatPaneClass())).toBe(true);
    expect(isDisplayedStructurally(listPaneClass())).toBe(false);
  });

  const threadB = {
    id: 'thread_b',
    type: 'branch_channel' as const,
    title: 'Ahmedabad Operations',
    participantIds: [],
    participantNames: {},
    createdAt: timestamp,
  };

  it('keeps the phone list when the hook auto-selects a room after a forced clear', async () => {
    await openRoomARow();
    expect(isDisplayedStructurally(chatPaneClass())).toBe(true);

    // Forced clear: the hook drops the selection.
    setChatState({ threads: [thread, threadB], activeThreadId: null, activeThread: undefined });
    await render();
    expect(isDisplayedStructurally(listPaneClass())).toBe(true);

    // The hook then auto-selects room B with NO row tap from the operator.
    setChatState({
      threads: [thread, threadB],
      activeThreadId: 'thread_b',
      activeThread: threadB,
      messages: [],
      loadingMessages: false,
      messagesSynced: true,
    });
    await render();

    // Being pushed into a room the operator never chose must not hide the list:
    // on a phone that would strand them in a chat with no visible way back.
    expect(isDisplayedStructurally(listPaneClass())).toBe(true);
  });

  it('opens the chat pane when the operator taps the auto-selected room row', async () => {
    await openRoomARow();
    setChatState({ threads: [thread, threadB], activeThreadId: null, activeThread: undefined });
    await render();
    setChatState({
      threads: [thread, threadB],
      activeThreadId: 'thread_b',
      activeThread: threadB,
      messages: [],
      loadingMessages: false,
      messagesSynced: true,
    });
    await render();

    // A deliberate tap is the operator's own choice, so it may open the chat.
    const rowB = Array.from(container.querySelectorAll('button')).find((button) =>
      /Ahmedabad Operations/.test(button.textContent ?? '')
    );
    expect(rowB).toBeDefined();
    await act(async () => {
      rowB?.click();
    });

    expect(isDisplayedStructurally(chatPaneClass())).toBe(true);
    expect(isDisplayedStructurally(listPaneClass())).toBe(false);
  });

  it('does not force the phone back to the list on a healthy same-room refresh', async () => {
    await openRoomARow();
    expect(isDisplayedStructurally(chatPaneClass())).toBe(true);

    // Ordinary same-scope, same-room re-delivery (a healthy listener refresh).
    setChatState({
      threads: [thread],
      activeThreadId: 'thread_a',
      activeThread: thread,
      messages: [message],
      loadingMessages: false,
      messagesSynced: true,
    });
    await render();

    // The operator's current pane must be left alone.
    expect(isDisplayedStructurally(chatPaneClass())).toBe(true);
    expect(isDisplayedStructurally(listPaneClass())).toBe(false);
  });
});

describe('ChatPage forced room ownership', () => {
  const threadB = {
    id: 'thread_b',
    type: 'branch_channel' as const,
    title: 'Ahmedabad Operations',
    participantIds: [],
    participantNames: {},
    createdAt: timestamp,
  };

  const roomA = {
    threads: [thread],
    activeThreadId: 'thread_a',
    activeThread: thread,
    messages: [message],
    loadingMessages: false,
    messagesSynced: true,
  };

  async function selectOrderChip(): Promise<void> {
    const attachButton = container.querySelector<HTMLButtonElement>(
      'button[title^="Attach Order"]'
    );
    expect(attachButton).not.toBeNull();
    await act(async () => {
      attachButton?.click();
    });

    const pick = container.querySelector<HTMLButtonElement>('[data-testid="attach-select-order"]');
    expect(pick).not.toBeNull();
    await act(async () => {
      pick?.click();
    });
  }

  async function selectTicketChip(): Promise<void> {
    const attachButton = container.querySelector<HTMLButtonElement>(
      'button[title^="Attach Order"]'
    );
    expect(attachButton).not.toBeNull();
    await act(async () => {
      attachButton?.click();
    });

    const pick = container.querySelector<HTMLButtonElement>('[data-testid="attach-select-ticket"]');
    expect(pick).not.toBeNull();
    await act(async () => {
      pick?.click();
    });
  }

  it('clears the previous room draft and chips when a different room is forced', async () => {
    setChatState(roomA);
    await render();

    await type('kitchen is short a fryer');
    await selectOrderChip();
    expect(composerInput()?.value).toBe('kitchen is short a fryer');
    expect(attachChipText()).toMatch(/Order #/);
    // Positive control for the selector itself: with a chip really attached,
    // a selector that yields nothing would make the post-clear zero vacuous.
    expect(attachChipButtons()).toHaveLength(1);

    // Forced clear, then a different room under the SAME uid.
    setChatState({ ...roomA, activeThreadId: null, activeThread: undefined });
    await render();
    setChatState({ ...roomA, threads: [thread, threadB], activeThreadId: 'thread_b', activeThread: threadB });
    await render();

    expect(composerInput()?.value).toBe('');
    expect(attachChipText()).not.toMatch(/Order #/);
    expect(attachChipButtons()).toHaveLength(0);
  });

  it('never commits a frame where room B shows the previous room draft or chip', async () => {
    // Observe REAL React commits of the page tree via Profiler.onRender, which
    // fires after the commit mutates the DOM — not a settled-effect reading.
    const commits: Array<{ text: string; chip: string }> = [];

    // The profiled wrapper must be the FIRST mount of this test: swapping the
    // parent element type later would remount ChatPage and silently wipe the
    // room-A draft, making the oracle vacuous. Every render below therefore
    // goes through this same wrapper, keeping component identity stable.
    const renderProfiled = async (): Promise<void> => {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <React.Profiler
              id="chatpage-commit-probe"
              onRender={() => {
                commits.push({ text: composerInput()?.value ?? '', chip: attachChipText() });
              }}
            >
              <ChatPage />
            </React.Profiler>
          </MemoryRouter>
        );
      });
    };

    setChatState(roomA);
    await renderProfiled();

    // Establish the room-A draft and chip AFTER the profiled mount, so they
    // really exist in the tree the profiler is observing.
    commits.length = 0;
    await type('draft that belongs to room A');
    await selectOrderChip();

    expect(composerInput()?.value).toBe('draft that belongs to room A');
    expect(attachChipText()).toMatch(/Order #/);
    expect(commits.length).toBeGreaterThan(0);

    setChatState({ ...roomA, activeThreadId: null, activeThread: undefined });
    await renderProfiled();

    // Only inspect commits from the point room B is introduced.
    commits.length = 0;
    setChatState({ ...roomA, threads: [thread, threadB], activeThreadId: 'thread_b', activeThread: threadB });
    await renderProfiled();

    expect(commits.length).toBeGreaterThan(0);
    for (const commit of commits) {
      expect(commit.text).not.toBe('draft that belongs to room A');
      expect(commit.chip).not.toMatch(/Order #/);
    }
  });

  it('clears the previous room ticket chip when a different room is forced', async () => {
    setChatState(roomA);
    await render();

    await type('ticket draft in room A');
    await selectTicketChip();
    expect(composerInput()?.value).toBe('ticket draft in room A');
    expect(attachChipText()).toMatch(/Ticket #/);
    // Positive control for the selector itself (see the order case above).
    expect(attachChipButtons()).toHaveLength(1);

    setChatState({ ...roomA, activeThreadId: null, activeThread: undefined });
    await render();
    setChatState({ ...roomA, threads: [thread, threadB], activeThreadId: 'thread_b', activeThread: threadB });
    await render();

    expect(composerInput()?.value).toBe('');
    expect(attachChipText()).not.toMatch(/Ticket #/);
    expect(attachChipButtons()).toHaveLength(0);
  });

  it('keeps the draft and chips for an ordinary same-room failed retry', async () => {
    setChatState({ ...roomA, messagesError: 'network' });
    await render();

    await type('same room draft survives');
    await selectTicketChip();
    expect(composerInput()?.value).toBe('same room draft survives');
    expect(attachChipText()).toMatch(/Ticket #/);

    await clickRetry();

    // Pending…
    setChatState({ ...roomA, messagesError: 'network', messagesSynced: false, retrying: true });
    await render();
    expect(composerInput()?.value).toBe('same room draft survives');
    expect(attachChipText()).toMatch(/Ticket #/);

    // …then the retry fails again: the same network error is still set.
    setChatState({ ...roomA, messagesError: 'network', messagesSynced: false, retrying: false });
    await render();

    expect(composerInput()?.value).toBe('same room draft survives');
    expect(attachChipText()).toMatch(/Ticket #/);
    expect(alerts().length).toBeGreaterThan(0);
  });

  it('still clears the draft when the operator manually opens a different room', async () => {
    setChatState({ ...roomA, threads: [thread, threadB] });
    await render();

    await type('draft the operator abandons');

    const rowB = Array.from(container.querySelectorAll('button')).find((button) =>
      /Ahmedabad Operations/.test(button.textContent ?? '')
    );
    expect(rowB).toBeDefined();
    await act(async () => {
      rowB?.click();
    });

    setChatState({
      ...roomA,
      threads: [thread, threadB],
      activeThreadId: 'thread_b',
      activeThread: threadB,
    });
    await render();

    expect(composerInput()?.value).toBe('');
  });
});

describe('ChatPage offline stream copy', () => {
  function setOnline(value: boolean): void {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => value,
    });
  }

  it('says offline and stale, never Connecting, when offline with a cached snapshot', async () => {
    setOnline(false);
    setChatState({
      threads: [thread],
      activeThreadId: 'thread_a',
      activeThread: thread,
      messages: [message],
      loadingMessages: false,
      messagesSynced: true,
      messagesError: null,
    });
    await render();

    expect(text()).toMatch(/offline/i);
    expect(text()).not.toMatch(/Connecting to this room/i);
    expect(text()).not.toMatch(/will appear as soon as the connection is established/i);
    expect(text()).toMatch(/hello there/);
  });

  it('keeps stopped/stale copy, not Connecting, when offline and the stream errored', async () => {
    setOnline(false);
    setChatState({
      threads: [thread],
      activeThreadId: 'thread_a',
      activeThread: thread,
      messages: [message],
      loadingMessages: false,
      messagesSynced: false,
      messagesError: 'network',
    });
    await render();

    expect(text()).toMatch(/stopped/i);
    expect(text()).toMatch(/out of date/i);
    expect(text()).not.toMatch(/Connecting to this room/i);
    expect(text()).toMatch(/hello there/);
  });
});

describe('ChatPage composer writer ownership', () => {
  const threadB = {
    id: 'thread_b',
    type: 'branch_channel' as const,
    title: 'Ahmedabad Operations',
    participantIds: [],
    participantNames: {},
    createdAt: timestamp,
  };

  const roomA = {
    threads: [thread],
    activeThreadId: 'thread_a',
    activeThread: thread,
    messages: [message],
    loadingMessages: false,
    messagesSynced: true,
  };

  const roomB = {
    threads: [thread, threadB],
    activeThreadId: 'thread_b',
    activeThread: threadB,
    messages: [],
    loadingMessages: false,
    messagesSynced: true,
  };

  const attachButton = () =>
    container.querySelector<HTMLButtonElement>('button[title^="Attach Order"]');

  async function openAttachModal(): Promise<void> {
    const button = attachButton();
    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });
  }

  /** Force A → a different room B under the same operator. */
  async function forceRoomB(): Promise<void> {
    setChatState({ ...roomA, activeThreadId: null, activeThread: undefined });
    await render();
    setChatState(roomB);
    await render();
  }

  it('a stale order callback captured in room A cannot overwrite fresh room B text or chip', async () => {
    setChatState(roomA);
    await render();

    await openAttachModal();
    // Hold the callback the modal received while room A was current.
    const staleSelectOrder = attachStub.selectOrder;
    expect(staleSelectOrder).not.toBeNull();
    await act(async () => {
      staleSelectOrder?.(attachStub.order);
    });
    await act(async () => {
      attachStub.closed?.();
    });
    expect(attachChipText()).toMatch(/Order #/);

    await forceRoomB();

    // Fresh room B content, established after the switch.
    await type('fresh B text');
    await openAttachModal();
    expect(attachChipText()).toBe('');
    await act(async () => {
      attachStub.selectTicket?.(attachStub.ticket);
    });
    expect(attachChipText()).toMatch(/Ticket #/);
    await act(async () => {
      attachStub.closed?.();
    });

    // Now the stale room-A callback fires, as a late boundary replay would.
    await act(async () => {
      staleSelectOrder?.(attachStub.order);
    });

    expect(composerInput()?.value).toBe('fresh B text');
    expect(attachChipText()).toMatch(/Ticket #/);
    expect(attachChipText()).not.toMatch(/Order #/);
  });

  it('a stale close callback captured in room A cannot close the room B modal or clear its draft', async () => {
    setChatState(roomA);
    await render();

    await openAttachModal();
    const staleClose = attachStub.closed;
    expect(staleClose).not.toBeNull();
    await act(async () => {
      staleClose?.();
    });

    await forceRoomB();

    await type('B draft before modal');
    await openAttachModal();
    expect(container.querySelector('[data-testid="attach-stub"]')).not.toBeNull();

    // Late replay of room A's onClose.
    await act(async () => {
      staleClose?.();
    });

    expect(container.querySelector('[data-testid="attach-stub"]')).not.toBeNull();
    expect(composerInput()?.value).toBe('B draft before modal');
  });

  it('retains the typed text and order chip when a transient null returns to the same room', async () => {
    setChatState(roomA);
    await render();

    await type('draft for room A');
    await openAttachModal();
    await act(async () => {
      attachStub.selectOrder?.(attachStub.order);
    });
    await act(async () => {
      attachStub.closed?.();
    });
    expect(composerInput()?.value).toBe('draft for room A');
    expect(attachChipText()).toMatch(/Order #/);

    // Transient null (no room), then straight back to the same room A.
    setChatState({ ...roomA, activeThreadId: null, activeThread: undefined });
    await render();
    setChatState(roomA);
    await render();

    expect(composerInput()?.value).toBe('draft for room A');
    expect(attachChipText()).toMatch(/Order #/);
  });

  it('submits the current room text and order reference through the existing payload then empties the draft', async () => {
    setChatState(roomA);
    await render();

    await type('please check this order');
    await openAttachModal();
    await act(async () => {
      attachStub.selectOrder?.(attachStub.order);
    });
    await act(async () => {
      attachStub.closed?.();
    });

    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(retryMocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(retryMocks.sendMessage).toHaveBeenCalledWith('please check this order', {
      orderReference: {
        orderId: 'ord_synth_000123',
        customerName: 'Synthetic Diner',
        total: 261,
        status: 'pending',
      },
      ticketReference: undefined,
    });
    expect(composerInput()?.value).toBe('');
    expect(attachChipText()).toBe('');
  });

  it('submits the documented fallback text with an exact ticket reference when only a ticket is attached', async () => {
    setChatState(roomA);
    await render();

    await openAttachModal();
    await act(async () => {
      attachStub.selectTicket?.(attachStub.ticket);
    });
    await act(async () => {
      attachStub.closed?.();
    });
    expect(attachChipText()).toMatch(/Ticket #/);

    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(retryMocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(retryMocks.sendMessage).toHaveBeenCalledWith(
      `Referencing Ticket #${'tkt_synth_000456'.slice(-6)}`,
      {
        orderReference: undefined,
        ticketReference: {
          ticketId: 'tkt_synth_000456',
          title: 'Synthetic incident',
          priority: 'high',
        },
      }
    );
    expect(composerInput()?.value).toBe('');
    expect(attachChipText()).toBe('');
  });

  it('never sends room A bytes during the first committed room B frame', async () => {
    const commits: Array<{ text: string; chip: string }> = [];
    // Explicit phase arming: onRender must never act during room A, whose
    // composer is legitimately empty and would otherwise look like "B".
    let probeBCommit = false;
    let bSubmitDispatched = false;
    let submitHandled = false;
    let submitDefaultPrevented = false;
    let dispatchSawRoomB = false;
    // First armed-B commit observations, captured before any dispatch.
    let firstBText: string | null = null;
    let firstBChip: string | null = null;

    const renderProfiled = async (): Promise<void> => {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <React.Profiler
              id="chatpage-send-probe"
              onRender={() => {
                const text = composerInput()?.value ?? '';
                const chip = attachChipText();
                commits.push({ text, chip });

                // Nothing may happen until the room-B phase is armed. This is
                // what stops the initial empty room-A composer from being
                // mistaken for room B.
                if (!probeBCommit) return;

                // Real DOM identity for room B, not an inference from emptiness.
                const placeholder = composerInput()?.getAttribute('placeholder') ?? '';
                const isRoomB = /Ahmedabad Operations/.test(placeholder);
                if (!isRoomB) return;

                if (firstBText === null) {
                  firstBText = text;
                  firstBChip = chip;
                }

                if (bSubmitDispatched) return;
                const form = container.querySelector('form');
                if (!form) return;

                // Set BEFORE dispatching so onRender cannot re-enter itself.
                bSubmitDispatched = true;
                dispatchSawRoomB = isRoomB;
                const submitEvent = new Event('submit', {
                  bubbles: true,
                  cancelable: true,
                });
                form.dispatchEvent(submitEvent);
                submitHandled = true;
                submitDefaultPrevented = submitEvent.defaultPrevented;
              }}
            >
              <ChatPage />
            </React.Profiler>
          </MemoryRouter>
        );
      });
    };

    setChatState(roomA);
    await renderProfiled();

    await type('room A bytes');
    await openAttachModal();
    await act(async () => {
      attachStub.selectOrder?.(attachStub.order);
    });
    await act(async () => {
      attachStub.closed?.();
    });
    expect(composerInput()?.value).toBe('room A bytes');
    expect(attachChipText()).toMatch(/Order #/);
    expect(attachChipButtons()).toHaveLength(1);

    setChatState({ ...roomA, activeThreadId: null, activeThread: undefined });
    await renderProfiled();

    commits.length = 0;
    // Arm only now: room-A draft and chip are proven, and the null render is
    // done. Everything the profiler observes from here is the room-B phase.
    probeBCommit = true;
    setChatState(roomB);
    await renderProfiled();

    // The dispatch happened inside a real room-B commit, into a real form,
    // and the handler actually ran.
    expect(dispatchSawRoomB).toBe(true);
    expect(bSubmitDispatched).toBe(true);
    expect(submitHandled).toBe(true);
    expect(submitDefaultPrevented).toBe(true);
    expect(container.querySelector('form')).not.toBeNull();

    // The expected emptiness of the first B frame is asserted as an
    // observation, never used as a gate that could hide an unsafe frame.
    expect(firstBText).toBe('');
    expect(firstBChip).toBe('');

    // The policy: no room-A bytes reach the wire from the room B frame.
    expect(retryMocks.sendMessage).not.toHaveBeenCalled();

    // Commit-scoped: no committed B frame ever showed A's draft or chip.
    expect(commits.length).toBeGreaterThan(0);
    for (const commit of commits) {
      expect(commit.text).not.toBe('room A bytes');
      expect(commit.chip).not.toMatch(/Order #/);
    }
  });
});

describe('ChatPage per-feed retry controls', () => {
  /** Both feeds failed: rooms list broken and the open room's stream broken. */
  const bothFailed = {
    threads: [thread],
    activeThreadId: 'thread_a',
    activeThread: thread,
    messages: [message],
    loadingThreads: false,
    loadingMessages: false,
    messagesSynced: false,
    threadsError: 'permission-denied',
    messagesError: 'network',
  };

  /** The rooms alert is the one carrying the rooms failure headline. */
  const roomsAlert = () =>
    alerts().find((node) => /Rooms could not be refreshed/i.test(node.textContent ?? ''));

  /** The stream alert is the one carrying the stream-stopped headline. */
  const streamAlert = () =>
    alerts().find((node) =>
      /Live updates for this room stopped/i.test(node.textContent ?? '')
    );

  const alertRetry = (alert: Element | undefined): HTMLButtonElement => {
    expect(alert).toBeDefined();
    const buttons = Array.from(
      alert?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ).filter((button) => /^(Retry|Retrying…)$/.test((button.textContent ?? '').trim()));
    // Exactly one control per alert: no cross-alert bleed.
    expect(buttons).toHaveLength(1);
    return buttons[0];
  };

  it('keeps the rooms retry clickable and labelled plain Retry while messages retries', async () => {
    setChatState({ ...bothFailed, retrying: true, retryingMessages: true });
    await render();

    const button = alertRetry(roomsAlert());
    // The rooms feed is idle; only the messages feed is in flight.
    expect((button.textContent ?? '').trim()).toBe('Retry');
    expect(button.getAttribute('aria-disabled')).not.toBe('true');

    await act(async () => {
      button.click();
    });

    expect(retryMocks.retryThreads).toHaveBeenCalledTimes(1);
    expect(retryMocks.retryMessages).not.toHaveBeenCalled();
  });

  it('keeps the messages retry clickable and labelled plain Retry while rooms retries', async () => {
    setChatState({ ...bothFailed, retrying: true, retryingThreads: true });
    await render();

    const button = alertRetry(streamAlert());
    expect((button.textContent ?? '').trim()).toBe('Retry');
    expect(button.getAttribute('aria-disabled')).not.toBe('true');

    await act(async () => {
      button.click();
    });

    expect(retryMocks.retryMessages).toHaveBeenCalledTimes(1);
    expect(retryMocks.retryThreads).not.toHaveBeenCalled();
  });

  it('does not restore composer focus when only the other feed finishes', async () => {
    setChatState({ ...bothFailed, messagesError: 'network' });
    await render();

    const button = retryButton() as HTMLButtonElement | undefined;
    expect(button).toBeDefined();
    await act(async () => {
      button?.focus();
    });
    await act(async () => {
      button?.click();
    });

    // Messages retry pending; the ROOMS feed then completes.
    setChatState({
      ...bothFailed,
      retrying: true,
      retryingMessages: true,
      threadsError: null,
      retryingThreads: false,
    });
    await render();

    const search = container.querySelector<HTMLInputElement>('input[placeholder^="Search rooms"]');
    expect(search).not.toBeNull();
    await act(async () => {
      search?.focus();
    });

    // Rooms finished, messages still pending: no ownership, no focus change.
    setChatState({
      ...bothFailed,
      retrying: true,
      retryingMessages: true,
      threadsError: null,
    });
    await render();

    expect(document.activeElement).toBe(search);
  });

  it('restores composer focus on the messages retry own completion while rooms stays pending', async () => {
    setChatState({ ...bothFailed, messagesError: 'network' });
    await render();

    const button = alertRetry(streamAlert());
    await act(async () => {
      button.focus();
    });
    expect(document.activeElement).toBe(button);
    await act(async () => {
      button.click();
    });

    // Both feeds now pending, and the operator has NOT moved focus.
    setChatState({
      ...bothFailed,
      retrying: true,
      retryingThreads: true,
      retryingMessages: true,
    });
    await render();

    // Messages recover on its own; the rooms retry is still in flight, so the
    // aggregate boolean alone could never settle.
    setChatState({
      ...bothFailed,
      retrying: true,
      retryingThreads: true,
      retryingMessages: false,
      messagesError: null,
      messagesSynced: true,
    });
    await render();

    expect(composerInput()).not.toBeNull();
    expect(document.activeElement).toBe(composerInput());
  });
});

describe('ChatPage authorisation-scope composer ownership', () => {
  const roomA = {
    threads: [thread],
    activeThreadId: 'thread_a',
    activeThread: thread,
    messages: [message],
    loadingMessages: false,
    messagesSynced: true,
  };

  /**
   * TEST-BOUNDARY ONLY: an opaque identity for the fake auth user, in the
   * existing array order. Production must consume the hook's real key.
   */
  const scopeKeyFor = (user: {
    id: string;
    role: string;
    branchIds: string[];
  }): string => JSON.stringify([user.id, user.role, user.branchIds]);

  /**
   * The canonical actor for this suite, captured BY VALUE at collection time.
   * Copying the arrays matters: cases below mutate `authState.user`, and a
   * captured reference would follow those mutations.
   */
  const canonicalRole = authState.user.role;
  const canonicalBranchIds = [...authState.user.branchIds];
  const canonicalCityIds = [...authState.user.cityIds];
  const ownerScope = scopeKeyFor({
    id: authState.user.id,
    role: canonicalRole,
    branchIds: canonicalBranchIds,
  });

  /** Rebuild the canonical operator as a fresh object. */
  const restoreCanonicalActor = (): void => {
    authState.user = {
      ...authState.user,
      role: canonicalRole,
      branchIds: [...canonicalBranchIds],
      cityIds: [...canonicalCityIds],
    };
  };

  beforeEach(() => {
    // Start every case from the canonical actor, not from whatever the previous
    // case left behind (role/branches are mutated by these tests).
    restoreCanonicalActor();
    // Guard the premise: the baseline identity really is the captured scope.
    expect(scopeKeyFor(authState.user)).toBe(ownerScope);
    expect(authState.user.role).toBe('branch_owner');
    expect(authState.user.branchIds).toEqual(['branch_surat_01']);
    expect(authState.user.branchIds.length).toBeGreaterThan(0);
  });

  afterEach(() => {
    // Never leak a narrowed actor into later suites (e.g. mobile pane tests).
    restoreCanonicalActor();
  });

  const attachButtonEl = () =>
    container.querySelector<HTMLButtonElement>('button[title^="Attach Order"]');

  /** Local stream-alert retry lookup: the per-feed suite's helper is scoped there. */
  const streamRetryButton = (): HTMLButtonElement => {
    const alert = alerts().find((node) =>
      /Live updates for this room stopped/i.test(node.textContent ?? '')
    );
    expect(alert).toBeDefined();
    const buttons = Array.from(
      alert?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ).filter((button) => /^(Retry|Retrying…)$/.test((button.textContent ?? '').trim()));
    expect(buttons).toHaveLength(1);
    return buttons[0];
  };

  async function openModal(): Promise<void> {
    const button = attachButtonEl();
    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });
  }

  async function pickOrderChip(): Promise<void> {
    await openModal();
    await act(async () => {
      attachStub.selectOrder?.(attachStub.order);
    });
    await act(async () => {
      attachStub.closed?.();
    });
  }

  /**
   * Commit log for the narrowing cases. `onRender` runs AFTER the DOM for that
   * commit is in place, so a first-frame leak is observable here and invisible
   * to a settled post-act read.
   */
  interface NarrowCommit {
    text: string;
    chip: string;
    modalOpen: boolean;
  }
  let narrowCommits: NarrowCommit[] = [];

  /**
   * Render through a stable Profiler wrapper. Call for EVERY render inside a
   * case so component identity never changes (a type swap would remount the
   * page and silently wipe the draft, making the oracle vacuous).
   */
  async function renderProfiled(): Promise<void> {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <React.Profiler
            id="chatpage-narrow-probe"
            onRender={() => {
              narrowCommits.push({
                text: composerInput()?.value ?? '',
                chip: attachChipText(),
                modalOpen: container.querySelector('[data-testid="attach-stub"]') !== null,
              });
            }}
          >
            <ChatPage />
          </React.Profiler>
        </MemoryRouter>
      );
    });
  }

  beforeEach(() => {
    narrowCommits = [];
  });

  it('clears draft, chips and modal on a role narrowing into the same room', async () => {
    setChatState({ ...roomA, authorizationScopeKey: ownerScope });
    // First mount is the PROFILED wrapper, before any typing.
    await renderProfiled();

    await type('draft owned by the wider role');
    await pickOrderChip();
    await openModal();
    expect(composerInput()?.value).toBe('draft owned by the wider role');
    expect(attachChipText()).toMatch(/Order #/);
    expect(container.querySelector('[data-testid="attach-stub"]')).not.toBeNull();
    // Positive premise: we really are the baseline actor with a non-empty
    // branch set BEFORE narrowing, not a fabricated scope-key change.
    expect(authState.user.role).toBe('branch_owner');
    expect(authState.user.branchIds.length).toBeGreaterThan(0);
    expect(scopeKeyFor(authState.user)).toBe(ownerScope);

    // Same uid, same room: only the authorisation scope narrowed.
    authState.user = { ...authState.user, role: 'branch_staff' };
    const narrowedScope = scopeKeyFor(authState.user);
    expect(narrowedScope).not.toBe(ownerScope);

    // Observe the narrowed commits only.
    narrowCommits = [];
    setChatState({ ...roomA, authorizationScopeKey: narrowedScope });
    await renderProfiled();

    expect(narrowCommits.length).toBeGreaterThan(0);
    // The FIRST narrowed commit must already be clean — not merely settled.
    expect(narrowCommits[0].text).toBe('');
    expect(narrowCommits[0].chip).toBe('');
    expect(narrowCommits[0].modalOpen).toBe(false);
    // …and no later commit may reintroduce the previous scope's content.
    for (const commit of narrowCommits) {
      expect(commit.text).not.toBe('draft owned by the wider role');
      expect(commit.chip).not.toMatch(/Order #/);
      expect(commit.modalOpen).toBe(false);
    }

    expect(composerInput()?.value).toBe('');
    expect(attachChipText()).toBe('');
    expect(container.querySelector('[data-testid="attach-stub"]')).toBeNull();
  });

  it('clears on an A → null → same-A round trip after a role narrowing', async () => {
    setChatState({ ...roomA, authorizationScopeKey: ownerScope });
    await render();

    await type('draft that must not survive the narrowing');
    await pickOrderChip();

    authState.user = { ...authState.user, role: 'branch_staff' };
    const narrowedScope = scopeKeyFor(authState.user);

    // Room goes away entirely, then the SAME room returns under the new scope.
    setChatState({ ...roomA, activeThreadId: null, activeThread: undefined, authorizationScopeKey: narrowedScope });
    await render();
    setChatState({ ...roomA, authorizationScopeKey: narrowedScope });
    await render();

    expect(composerInput()?.value).toBe('');
    expect(attachChipText()).toBe('');
  });

  it('clears draft and chips on a branch narrowing in the same room', async () => {
    setChatState({ ...roomA, authorizationScopeKey: ownerScope });
    // Profiled first mount, before the draft exists.
    await renderProfiled();

    await type('draft owned by the wider branch set');
    await pickOrderChip();
    expect(composerInput()?.value).toBe('draft owned by the wider branch set');
    expect(attachChipText()).toMatch(/Order #/);
    // Positive premise: baseline actor with a non-empty branch set.
    expect(authState.user.role).toBe('branch_owner');
    expect(authState.user.branchIds.length).toBeGreaterThan(0);
    expect(scopeKeyFor(authState.user)).toBe(ownerScope);

    // Same uid and role, fewer branches, same room.
    authState.user = { ...authState.user, branchIds: [] };
    const narrowedScope = scopeKeyFor(authState.user);
    expect(narrowedScope).not.toBe(ownerScope);

    narrowCommits = [];
    setChatState({ ...roomA, authorizationScopeKey: narrowedScope });
    await renderProfiled();

    expect(narrowCommits.length).toBeGreaterThan(0);
    expect(narrowCommits[0].text).toBe('');
    expect(narrowCommits[0].chip).toBe('');
    for (const commit of narrowCommits) {
      expect(commit.text).not.toBe('draft owned by the wider branch set');
      expect(commit.chip).not.toMatch(/Order #/);
    }

    expect(composerInput()?.value).toBe('');
    expect(attachChipText()).toBe('');
  });

  it('ignores an old-scope modal callback that would clobber the fresh same-room draft', async () => {
    setChatState({ ...roomA, authorizationScopeKey: ownerScope });
    await render();

    await openModal();
    // Hold the callback the modal received under the OLD scope.
    const staleSelectOrder = attachStub.selectOrder;
    expect(staleSelectOrder).not.toBeNull();
    await act(async () => {
      attachStub.closed?.();
    });

    authState.user = { ...authState.user, role: 'branch_staff' };
    const narrowedScope = scopeKeyFor(authState.user);
    setChatState({ ...roomA, authorizationScopeKey: narrowedScope });
    await render();

    // Fresh draft in the SAME room under the new scope.
    await type('fresh draft under the narrowed scope');
    expect(composerInput()?.value).toBe('fresh draft under the narrowed scope');

    // The old scope's callback fires late.
    await act(async () => {
      staleSelectOrder?.(attachStub.order);
    });

    expect(composerInput()?.value).toBe('fresh draft under the narrowed scope');
    expect(attachChipText()).not.toMatch(/Order #/);
  });

  it('keeps the draft for an equal, freshly built auth scope', async () => {
    setChatState({ ...roomA, authorizationScopeKey: ownerScope });
    await render();

    await type('draft that survives an equal scope');
    await pickOrderChip();

    // Establish the actor identity explicitly BEFORE the swap: the retention
    // claim only means something if the scope really is unchanged.
    const scopeBefore = scopeKeyFor(authState.user);
    expect(scopeBefore).toBe(ownerScope);

    // New user object, identical values and SAME array order.
    authState.user = {
      ...authState.user,
      branchIds: [...authState.user.branchIds],
      cityIds: [...authState.user.cityIds],
    };
    const scopeAfter = scopeKeyFor(authState.user);
    // Same opaque key on both sides — provably the same actor/scope.
    expect(scopeAfter).toBe(scopeBefore);
    expect(scopeAfter).toBe(ownerScope);

    setChatState({ ...roomA, authorizationScopeKey: scopeAfter });
    await render();

    expect(composerInput()?.value).toBe('draft that survives an equal scope');
    expect(attachChipText()).toMatch(/Order #/);
  });

  it('does not move focus into a new auth scope composer when the old retry completes', async () => {
    const failing = {
      ...roomA,
      messagesError: 'network',
      messagesSynced: false,
      authorizationScopeKey: ownerScope,
    };
    setChatState(failing);
    await render();

    const button = streamRetryButton();
    await act(async () => {
      button.focus();
    });
    expect(document.activeElement).toBe(button);
    await act(async () => {
      button.click();
    });

    // Pending, and genuinely owned by this scope's focus watch.
    setChatState({ ...failing, retrying: true, retryingMessages: true });
    await render();

    // Scope narrows while the retry is still in flight.
    authState.user = { ...authState.user, role: 'branch_staff' };
    const narrowedScope = scopeKeyFor(authState.user);
    setChatState({
      ...failing,
      authorizationScopeKey: narrowedScope,
      retrying: false,
      retryingMessages: false,
      messagesError: null,
      messagesSynced: true,
    });
    await render();

    // The old scope's completion must not focus the new scope's composer.
    expect(document.activeElement).not.toBe(composerInput());
    authState.user = { ...authState.user, role: 'branch_owner' };
  });
});

describe('ChatPage automatic recovery focus', () => {
  const canonicalRole = authState.user.role;

  beforeEach(() => {
    authState.user = { ...authState.user, role: canonicalRole };
  });

  afterEach(() => {
    // Never leak a narrowed actor into later suites.
    authState.user = { ...authState.user, role: canonicalRole };
  });

  const roomA = {
    threads: [thread],
    activeThreadId: 'thread_a',
    activeThread: thread,
    messages: [message],
    loadingThreads: false,
    loadingMessages: false,
    messagesSynced: false,
    messagesError: 'network',
    authorizationScopeKey: 'scope-owner',
  };
  const streamRetry = (): HTMLButtonElement => {
    const alert = alerts().find((node) =>
      /Live updates for this room stopped/i.test(node.textContent ?? '')
    );
    expect(alert).toBeDefined();
    const buttons = Array.from(
      alert?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ).filter((button) => /^(Retry|Retrying…)$/.test((button.textContent ?? '').trim()));
    expect(buttons).toHaveLength(1);
    return buttons[0];
  };

  /** An AUTOMATIC attempt: retryingMessages goes true with no click at all. */
  async function beginAutomaticAttempt(): Promise<void> {
    setChatState({ ...roomA, retrying: true, retryingMessages: true });
    await render();
  }

  async function settleSuccessfully(): Promise<void> {
    setChatState({
      ...roomA,
      retrying: false,
      retryingMessages: false,
      messagesError: null,
      messagesSynced: true,
    });
    await render();
  }

  it('restores composer focus when an automatic attempt succeeds while Retry held focus', async () => {
    setChatState(roomA);
    await render();

    const button = streamRetry();
    await act(async () => {
      button.focus();
    });
    expect(document.activeElement).toBe(button);

    // No click: the hint started this one.
    await beginAutomaticAttempt();
    await settleSuccessfully();

    expect(composerInput()).not.toBeNull();
    expect(document.activeElement).toBe(composerInput());
  });

  it('does not steal focus when an automatic attempt starts with focus elsewhere', async () => {
    setChatState(roomA);
    await render();

    const search = container.querySelector<HTMLInputElement>(
      'input[placeholder^="Search rooms"]'
    );
    expect(search).not.toBeNull();
    await act(async () => {
      search?.focus();
    });

    await beginAutomaticAttempt();
    await settleSuccessfully();

    expect(document.activeElement).toBe(search);
  });

  it('does not restore focus when the operator moved it during an automatic attempt', async () => {
    setChatState(roomA);
    await render();

    const button = streamRetry();
    await act(async () => {
      button.focus();
    });

    await beginAutomaticAttempt();

    const paperclip = container.querySelector<HTMLButtonElement>(
      'button[title^="Attach Order"]'
    );
    expect(paperclip).not.toBeNull();
    await act(async () => {
      paperclip?.focus();
    });

    await settleSuccessfully();

    expect(document.activeElement).toBe(paperclip);
  });

  it('does not restore focus for an automatic attempt that began in an older scope', async () => {
    setChatState(roomA);
    await render();

    const button = streamRetry();
    await act(async () => {
      button.focus();
    });

    await beginAutomaticAttempt();

    // The authorisation scope changes while the attempt is still in flight.
    authState.user = { ...authState.user, role: 'branch_staff' };
    setChatState({
      ...roomA,
      authorizationScopeKey: 'scope-narrowed',
      retrying: false,
      retryingMessages: false,
      messagesError: null,
      messagesSynced: true,
    });
    await render();

    authState.user = { ...authState.user, role: 'branch_owner' };
    expect(document.activeElement).not.toBe(composerInput());
  });
});

describe('ChatPage icon button accessible names', () => {
  const roomA = {
    threads: [thread],
    activeThreadId: 'thread_a',
    activeThread: thread,
    messages: [message],
    loadingMessages: false,
    messagesSynced: true,
    authorizationScopeKey: 'scope-owner',
  };

  const backButton = () =>
    Array.from(container.querySelectorAll('button')).find((button) =>
      (button.getAttribute('class') ?? '').includes('md:hidden')
    );

  const submitButton = () => container.querySelector<HTMLButtonElement>('button[type="submit"]');

  async function addOrderChip(): Promise<void> {
    const attach = container.querySelector<HTMLButtonElement>('button[title^="Attach Order"]');
    expect(attach).not.toBeNull();
    await act(async () => {
      attach?.click();
    });
    const pick = container.querySelector<HTMLButtonElement>('[data-testid="attach-select-order"]');
    expect(pick).not.toBeNull();
    await act(async () => {
      pick?.click();
    });
  }

  async function addTicketChip(): Promise<void> {
    const attach = container.querySelector<HTMLButtonElement>('button[title^="Attach Order"]');
    expect(attach).not.toBeNull();
    await act(async () => {
      attach?.click();
    });
    const pick = container.querySelector<HTMLButtonElement>('[data-testid="attach-select-ticket"]');
    expect(pick).not.toBeNull();
    await act(async () => {
      pick?.click();
    });
  }

  it('names the phone back button', async () => {
    setChatState(roomA);
    await render();

    const button = backButton();
    expect(button).toBeDefined();
    expect(button?.getAttribute('aria-label')).toBe('Back to rooms');
  });

  it('names the send button', async () => {
    setChatState(roomA);
    await render();

    const button = submitButton();
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe('Send message');
  });

  it('names the attached-order chip dismiss control', async () => {
    setChatState(roomA);
    await render();

    await addOrderChip();
    const dismiss = attachChipButtons();
    expect(dismiss).toHaveLength(1);
    expect(dismiss[0].getAttribute('aria-label')).toBe('Remove attached order');
  });

  it('names the attached-ticket chip dismiss control', async () => {
    setChatState(roomA);
    await render();

    await addTicketChip();
    const dismiss = attachChipButtons();
    expect(dismiss).toHaveLength(1);
    expect(dismiss[0].getAttribute('aria-label')).toBe('Remove attached ticket');
  });
});

/**
 * Send-outcome contract at the page/hook boundary.
 *
 * A send is only "accepted" when it really persisted. These cases pin the three
 * pre-existing faults: a failed write consumed the draft, a guard no-op was
 * indistinguishable from a sent message, and a completion belonging to an older
 * owner/draft could clear or claim state it did not own.
 */
describe('ChatPage send outcome', () => {
  const threadB = {
    id: 'thread_b',
    type: 'branch_channel' as const,
    title: 'Ahmedabad Operations',
    participantIds: [],
    participantNames: {},
    createdAt: timestamp,
  };

  const roomA = {
    threads: [thread],
    activeThreadId: 'thread_a',
    activeThread: thread,
    messages: [message],
    loadingMessages: false,
    messagesSynced: true,
  };

  const roomB = {
    threads: [thread, threadB],
    activeThreadId: 'thread_b',
    activeThread: threadB,
    messages: [],
    loadingMessages: false,
    messagesSynced: true,
  };

  interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
  }

  const deferred = <T,>(): Deferred<T> => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  /** A rejection surfaces as an alert on the page, never as a silent drop. */
  const sendAlert = () =>
    alerts().find((node) => /could not be sent/i.test(node.textContent ?? ''));

  const submit = async (): Promise<void> => {
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  };

  const attachOrder = async (): Promise<void> => {
    const button = container.querySelector<HTMLButtonElement>('button[title^="Attach Order"]');
    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });
    const pick = container.querySelector<HTMLButtonElement>('[data-testid="attach-select-order"]');
    expect(pick).not.toBeNull();
    await act(async () => {
      pick?.click();
    });
    await act(async () => {
      attachStub.closed?.();
    });
  };

  /**
   * Escaped rejections must be zero: the page settles its own promise. The
   * probe is installed per case and removed in `afterEach`, so a failing
   * assertion cannot leave a listener behind.
   */
  const rejectionProbe = createRejectionProbe();
  const rejections = rejectionProbe.rejections;

  beforeEach(() => {
    rejectionProbe.install();
    // Each case starts from a clean, explicit success default: a leftover
    // one-shot implementation from a failed case must never decide the next.
    retryMocks.sendMessage.mockReset();
    retryMocks.sendMessage.mockImplementation(async () => ({
      status: 'sent',
      messageId: 'msg_page_fixture',
    }));
  });

  afterEach(() => {
    rejectionProbe.uninstall();
  });

  it('keeps the captured text and order chip when the write rejects, and shows a visible failure', async () => {
    setChatState(roomA);
    await render();

    await type('please resend this');
    await attachOrder();
    expect(attachChipText()).toMatch(/Order #/);

    retryMocks.sendMessage.mockImplementationOnce(async () => {
      throw new Error('permission-denied');
    });
    await submit();
    await act(async () => {});

    // The operator's bytes are theirs until the room confirms persistence.
    expect(composerInput()?.value).toBe('please resend this');
    expect(attachChipText()).toMatch(/Order #/);
    const alert = sendAlert();
    expect(alert).toBeDefined();
    expect((alert?.textContent ?? '').length).toBeGreaterThan(0);
    // Caught, not escaped: an unhandled rejection would be a second defect.
    expect(rejections).toHaveLength(0);
  });

  it('does not consume the composer or claim success when the hook refuses the send', async () => {
    setChatState(roomA);
    await render();

    await type('this must not vanish');
    retryMocks.sendMessage.mockResolvedValueOnce({ status: 'refused' });

    await submit();
    await act(async () => {});

    expect(composerInput()?.value).toBe('this must not vanish');
    expect(sendAlert()).toBeDefined();
    expect(rejections).toHaveLength(0);

    // No automatic resend, but a manual retry by the operator must work.
    expect(retryMocks.sendMessage).toHaveBeenCalledTimes(1);
    retryMocks.sendMessage.mockResolvedValueOnce({ status: 'sent', messageId: 'msg_manual' });
    await submit();
    expect(retryMocks.sendMessage).toHaveBeenCalledTimes(2);
    expect(composerInput()?.value).toBe('');
  });

  it('keeps the submitted draft visible while the write is still in flight', async () => {
    setChatState(roomA);
    await render();

    await type('still being written');
    const pending = deferred<{ status: 'sent'; messageId: string }>();
    retryMocks.sendMessage.mockImplementationOnce(() => pending.promise);

    await submit();

    // Nothing is confirmed yet, so nothing may be consumed yet.
    expect(composerInput()?.value).toBe('still being written');

    await act(async () => {
      pending.resolve({ status: 'sent', messageId: 'msg_late' });
      await pending.promise;
    });

    // …and once it really persisted, the submitted version is consumed.
    expect(composerInput()?.value).toBe('');
  });

  it('keeps bytes the operator typed after submitting instead of erasing them on success', async () => {
    setChatState(roomA);
    await render();

    await type('first message');
    const pending = deferred<{ status: 'sent'; messageId: string }>();
    retryMocks.sendMessage.mockImplementationOnce(() => pending.promise);

    await submit();
    await type('second thoughts');

    await act(async () => {
      pending.resolve({ status: 'sent', messageId: 'msg_late' });
      await pending.promise;
    });

    // The old send owned the first version only.
    expect(composerInput()?.value).toBe('second thoughts');
    expect(retryMocks.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate the write when the same attempt is submitted twice', async () => {
    setChatState(roomA);
    await render();

    await type('one message only');
    const pending = deferred<{ status: 'sent'; messageId: string }>();
    retryMocks.sendMessage.mockImplementationOnce(() => pending.promise);

    // Two submits inside ONE tick, as a double Enter / Enter-plus-click does.
    // A naive fix that clears only after the await would still be holding the
    // same text for the second handler and write the message twice.
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(retryMocks.sendMessage).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ status: 'sent', messageId: 'msg_once' });
      await pending.promise;
    });

    expect(composerInput()?.value).toBe('');
  });

  it('does not let a completion from an old room clear or warn in the room that replaced it', async () => {
    setChatState(roomA);
    await render();

    await type('room A message');
    const pending = deferred<{ status: 'sent'; messageId: string }>();
    retryMocks.sendMessage.mockImplementationOnce(() => pending.promise);
    await submit();

    // Same operator, different room, while room A's write is still open.
    setChatState({ ...roomA, activeThreadId: null, activeThread: undefined });
    await render();
    setChatState(roomB);
    await render();
    await type('room B draft');

    await act(async () => {
      pending.resolve({ status: 'sent', messageId: 'msg_room_a' });
      await pending.promise;
    });

    expect(composerInput()?.value).toBe('room B draft');
    expect(sendAlert()).toBeUndefined();
    // The completion stayed with the attempt that made it.
    expect(attachChipText()).toBe('');
  });

  it('does not surface an old room failure as this room\'s send error', async () => {
    setChatState(roomA);
    await render();

    await type('room A failure');
    const pending = deferred<{ status: 'sent'; messageId: string }>();
    retryMocks.sendMessage.mockImplementationOnce(() => pending.promise);
    await submit();

    setChatState({ ...roomA, activeThreadId: null, activeThread: undefined });
    await render();
    setChatState(roomB);
    await render();
    await type('room B is fine');

    await act(async () => {
      pending.reject(new Error('permission-denied'));
      await pending.promise.catch(() => undefined);
    });
    await act(async () => {});

    expect(composerInput()?.value).toBe('room B is fine');
    expect(sendAlert()).toBeUndefined();
    expect(rejections).toHaveLength(0);
  });

  it('stops touching the page after unmount, even if the write settles late', async () => {
    setChatState(roomA);
    await render();

    await type('unmounted attempt');
    const pending = deferred<{ status: 'sent'; messageId: string }>();
    retryMocks.sendMessage.mockImplementationOnce(() => pending.promise);
    await submit();

    await act(async () => root.unmount());

    await act(async () => {
      pending.resolve({ status: 'sent', messageId: 'msg_after_unmount' });
      await pending.promise;
    });

    expect(container.textContent).toBe('');
    expect(rejections).toHaveLength(0);

    // Remount so the shared afterEach unmount has a live root to tear down.
    root = createRoot(container);
  });
});

/**
 * Owner-adoption races.
 *
 * The composer is one slot reused by every operator/scope/room. A send attempt
 * therefore needs an identity that survives a round trip, or a late settlement
 * will erase or warn about a draft it never submitted.
 */
describe('ChatPage send attempt identity across owner round trips', () => {
  const threadB = {
    id: 'thread_b',
    type: 'branch_channel' as const,
    title: 'Ahmedabad Operations',
    participantIds: [],
    participantNames: {},
    createdAt: timestamp,
  };

  /** Opaque identities: the page must consume them, never derive them. */
  const scopeA = 'opaque-auth-scope-A';
  const scopeB = 'opaque-auth-scope-B';

  const roomA = {
    threads: [thread],
    activeThreadId: 'thread_a',
    activeThread: thread,
    messages: [message],
    loadingMessages: false,
    messagesSynced: true,
    authorizationScopeKey: scopeA,
  };

  const roomB = {
    threads: [thread, threadB],
    activeThreadId: 'thread_b',
    activeThread: threadB,
    messages: [],
    loadingMessages: false,
    messagesSynced: true,
    authorizationScopeKey: scopeB,
  };

  interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
  }

  const deferred = <T,>(): Deferred<T> => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  const sendAlert = () =>
    alerts().find((node) => /could not be sent/i.test(node.textContent ?? ''));
  const otherAlerts = () =>
    alerts().filter((node) => !/could not be sent/i.test(node.textContent ?? ''));

  const submit = async (): Promise<void> => {
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  };

  const attachOrder = async (): Promise<void> => {
    const button = container.querySelector<HTMLButtonElement>('button[title^="Attach Order"]');
    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });
    const pick = container.querySelector<HTMLButtonElement>('[data-testid="attach-select-order"]');
    expect(pick).not.toBeNull();
    await act(async () => {
      pick?.click();
    });
    await act(async () => {
      attachStub.closed?.();
    });
  };

  const rejectionProbe = createRejectionProbe();
  const rejections = rejectionProbe.rejections;

  beforeEach(() => {
    rejectionProbe.install();
    retryMocks.sendMessage.mockReset();
    retryMocks.sendMessage.mockImplementation(async () => ({
      status: 'sent',
      messageId: 'msg_page_fixture',
    }));
  });

  afterEach(() => {
    rejectionProbe.uninstall();
  });

  /** Room A → room B → room A, keeping each room's own hook owner. */
  async function roundTripToRoomBAndBack(): Promise<void> {
    setChatState({ ...roomA, activeThreadId: null, activeThread: undefined });
    await render();
    setChatState(roomB);
    await render();
    setChatState(roomA);
    await render();
  }

  it('keeps the new room-A draft when an earlier room-A attempt succeeds after the round trip', async () => {
    setChatState(roomA);
    await render();

    await type('A one');
    const pendingA1 = deferred<{ status: 'sent'; messageId: string }>();
    retryMocks.sendMessage.mockImplementationOnce(() => pendingA1.promise);
    await submit();

    await roundTripToRoomBAndBack();
    // A brand-new draft in the SAME owner keys, adopted after the round trip.
    await type('A two');

    await act(async () => {
      pendingA1.resolve({ status: 'sent', messageId: 'msg_a1' });
      await pendingA1.promise;
    });

    // A1 owned its own version only; A two was never submitted by it.
    expect(composerInput()?.value).toBe('A two');
    expect(sendAlert()).toBeUndefined();
    expect(rejections).toHaveLength(0);
  });

  it('does not warn the new room-A draft when the earlier room-A attempt fails after the round trip', async () => {
    setChatState(roomA);
    await render();

    await type('A one');
    const pendingA1 = deferred<{ status: 'sent'; messageId: string }>();
    retryMocks.sendMessage.mockImplementationOnce(() => pendingA1.promise);
    await submit();

    await roundTripToRoomBAndBack();
    await type('A two');

    await act(async () => {
      pendingA1.reject(new Error('permission-denied'));
      await pendingA1.promise.catch(() => undefined);
    });
    await act(async () => {});

    expect(composerInput()?.value).toBe('A two');
    expect(sendAlert()).toBeUndefined();
    expect(rejections).toHaveLength(0);
  });

  it('keeps a separately submitted room-A attempt when the earlier attempt settles late', async () => {
    setChatState(roomA);
    await render();

    await type('A one');
    const pendingA1 = deferred<{ status: 'sent'; messageId: string }>();
    retryMocks.sendMessage.mockImplementationOnce(() => pendingA1.promise);
    await submit();

    // Room B: its own draft and its own in-flight write.
    setChatState({ ...roomA, activeThreadId: null, activeThread: undefined });
    await render();
    setChatState(roomB);
    await render();
    await type('B one');
    const pendingB1 = deferred<{ status: 'sent'; messageId: string }>();
    retryMocks.sendMessage.mockImplementationOnce(() => pendingB1.promise);
    await submit();

    // Back to room A: a new draft and a new manual submit of its own.
    setChatState({ ...roomB, activeThreadId: null, activeThread: undefined });
    await render();
    setChatState(roomA);
    await render();
    await type('A two');
    const pendingA2 = deferred<{ status: 'sent'; messageId: string }>();
    retryMocks.sendMessage.mockImplementationOnce(() => pendingA2.promise);
    await submit();

    expect(retryMocks.sendMessage).toHaveBeenCalledTimes(3);
    expect(composerInput()?.value).toBe('A two');

    // The earlier attempts settle late: neither may touch A2's ownership.
    await act(async () => {
      pendingA1.resolve({ status: 'sent', messageId: 'msg_a1' });
      await pendingA1.promise;
    });
    await act(async () => {
      pendingB1.reject(new Error('permission-denied'));
      await pendingB1.promise.catch(() => undefined);
    });
    await act(async () => {});

    expect(composerInput()?.value).toBe('A two');
    expect(sendAlert()).toBeUndefined();
    expect(otherAlerts()).toHaveLength(0);
    expect(rejections).toHaveLength(0);

    // A2 settles its own submitted version, and only that.
    await act(async () => {
      pendingA2.resolve({ status: 'sent', messageId: 'msg_a2' });
      await pendingA2.promise;
    });
    expect(composerInput()?.value).toBe('');
    expect(retryMocks.sendMessage).toHaveBeenCalledTimes(3);
  });

  it('keeps a reference-only edit made while the write is pending', async () => {
    setChatState(roomA);
    await render();

    await type('same text throughout');
    const pending = deferred<{ status: 'sent'; messageId: string }>();
    retryMocks.sendMessage.mockImplementationOnce(() => pending.promise);
    await submit();

    // Text untouched; only the attached reference changes.
    await attachOrder();
    expect(attachChipText()).toMatch(/Order #/);

    await act(async () => {
      pending.resolve({ status: 'sent', messageId: 'msg_ref_edit' });
      await pending.promise;
    });

    expect(composerInput()?.value).toBe('same text throughout');
    expect(attachChipText()).toMatch(/Order #/);
    expect(sendAlert()).toBeUndefined();
  });
});
