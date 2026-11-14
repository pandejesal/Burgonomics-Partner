/** @vitest-environment jsdom */
/**
 * Connectivity/scope contract for the chat subscription hook.
 *
 * The service (chatService) deliberately keeps its last good data and reports
 * listener death through an onError callback instead of emitting an empty
 * list. Before this suite the hook never passed those callbacks, so a dead
 * listener left `loadingThreads`/`loadingMessages` true forever and the page
 * could not tell "loaded and empty" from "never loaded".
 *
 * Every test drives the REAL hook through React with a stubbed chatService and
 * a stubbed auth store — no Firebase, no network.
 */
import { act } from 'react';
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatThread } from '@/types';
import { useChats } from './useChats';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface TestUser {
  id: string;
  name: string;
  email: string;
  role: 'branch_owner' | 'developer' | 'branch_staff';
  branchIds: string[];
  cityIds: string[];
}

const authState: { user: TestUser | null } = { user: null };

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: authState.user }),
}));

const chatMocks = vi.hoisted(() => ({
  subscribeToThreads: vi.fn(),
  subscribeToMessages: vi.fn(),
  sendMessage: vi.fn(),
  getOrCreateBranchChannel: vi.fn(),
  getOrCreateDirectDm: vi.fn(),
}));

// `SendMessageParams` is a type-only import in the hook; the key is here only
// so the module mock never reports a missing export.
vi.mock('@/services/chatService', () => ({
  chatService: chatMocks,
  SendMessageParams: undefined,
}));

type ThreadsCallback = (threads: ChatThread[]) => void;
type MessagesCallback = (messages: ChatMessage[]) => void;
type ErrorCallback = (message: string, code?: string) => void;

/** The hook's own return type, plus the fields the per-feed retry slice adds. */
type ChatHook = ReturnType<typeof useChats> & {
  /** True between a Retry click and the next listener callback. */
  retrying?: boolean;
  /** Per-feed: a threads resubscription is in flight. */
  retryingThreads?: boolean;
  /** Per-feed: a messages resubscription is in flight. */
  retryingMessages?: boolean;
  /**
   * Additive future field: the hook's OWN auth-scope key. Tests use it before
   * the source patch lands; the page must consume this, never recompute it.
   */
  authorizationScopeKey?: string | null;
};

const operator: TestUser = {
  id: 'usr_branch_op',
  name: 'Branch Operator',
  email: 'op@burgonomics.test',
  role: 'branch_owner',
  branchIds: ['branch_surat_01'],
  cityIds: ['Surat'],
};

const threadFixture = (id: string, title = id): ChatThread => ({
  id,
  type: 'branch_channel',
  title,
  participantIds: [],
  participantNames: {},
  createdAt: { toMillis: () => 0, toDate: () => new Date(0) } as never,
});

const messageFixture = (id: string, text = id): ChatMessage => ({
  id,
  chatId: 'thread_a',
  senderId: 'usr_branch_op',
  senderName: 'Branch Operator',
  senderRole: 'branch_owner',
  text,
  createdAt: { toDate: () => new Date(0) } as never,
});

let root: Root;
let container: HTMLDivElement;
let mounted: boolean;
let latest: ChatHook;
let threadUnsubscribe: ReturnType<typeof vi.fn>;
let messageUnsubscribe: ReturnType<typeof vi.fn>;

function Probe() {
  const chats = useChats() as ChatHook;
  // Publish the latest hook result for assertions. Effects run after commit,
  // which keeps this out of the render phase.
  React.useEffect(() => {
    latest = chats;
  });
  return null;
}

/**
 * Records every committed render so a test can prove no intermediate frame
 * ever exposed another scope's data. Must stay mounted across the switch —
 * swapping component types would remount the hook and hide the defect.
 */
interface RenderRecord {
  ids: string[];
  messages: string[];
  active: string | null;
}
const renderLog: RenderRecord[] = [];

function RecordingProbe() {
  const chats = useChats() as ChatHook;
  React.useEffect(() => {
    latest = chats;
    renderLog.push({
      ids: chats.threads.map((t) => t.id),
      messages: chats.messages.map((m) => m.id),
      active: chats.activeThreadId,
    });
  });
  return null;
}

async function mount(): Promise<void> {
  mounted = true;
  await act(async () => {
    root.render(<Probe />);
  });
}

/** Mount under StrictMode, as main.tsx does, to prove effects survive double-invocation. */
async function mountStrict(): Promise<void> {
  mounted = true;
  await act(async () => {
    root.render(
      <React.StrictMode>
        <Probe />
      </React.StrictMode>
    );
  });
}

async function rerender(): Promise<void> {
  await act(async () => {
    root.render(<Probe />);
  });
}

/**
 * Mount the render-recording probe. Must be used from the first mount of a
 * test: swapping component types later would remount the hook and hide the
 * very defect the recording exists to catch.
 */
async function mountRecording(): Promise<void> {
  mounted = true;
  await act(async () => {
    root.render(<RecordingProbe />);
  });
}

async function rerenderRecording(): Promise<void> {
  await act(async () => {
    root.render(<RecordingProbe />);
  });
}

/** Threads subscription as created by the hook, in call order. */
const threadsCall = (index = 0) => chatMocks.subscribeToThreads.mock.calls[index];
const messagesCall = (index = 0) => chatMocks.subscribeToMessages.mock.calls[index];

/** Drive the hook to the "one thread loaded and auto-selected" state. */
async function selectFirstThread(id = 'thread_a'): Promise<void> {
  const onThreads = threadsCall()[3] as ThreadsCallback;
  await act(async () => {
    onThreads([threadFixture(id)]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { ...operator };
  threadUnsubscribe = vi.fn();
  messageUnsubscribe = vi.fn();
  chatMocks.subscribeToThreads.mockReturnValue(threadUnsubscribe);
  chatMocks.subscribeToMessages.mockReturnValue(messageUnsubscribe);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  mounted = false;
  renderLog.length = 0;
});

afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('useChats subscription error reporting', () => {
  it('passes an onError to the thread listener, ends the loader and scopes the error', async () => {
    await mount();
    expect(latest.loadingThreads).toBe(true);

    const onThreadError = threadsCall()[4] as ErrorCallback | undefined;
    expect(typeof onThreadError).toBe('function');

    await act(async () => {
      onThreadError?.('permission-denied');
    });

    expect(latest.loadingThreads).toBe(false);
    expect(latest.threadsError).toBe('permission-denied');
  });

  it('keeps the last good thread list when the thread listener dies', async () => {
    await mount();
    const onThreads = threadsCall()[3] as ThreadsCallback;
    const onThreadError = threadsCall()[4] as ErrorCallback;

    await act(async () => {
      onThreads([threadFixture('thread_a'), threadFixture('thread_b')]);
    });
    expect(latest.threads.map((t) => t.id)).toEqual(['thread_a', 'thread_b']);

    await act(async () => {
      onThreadError('listener died');
    });

    expect(latest.threads.map((t) => t.id)).toEqual(['thread_a', 'thread_b']);
    expect(latest.threadsError).toBe('listener died');
    expect(latest.loadingThreads).toBe(false);
  });

  it('keeps the same-thread last good messages when the message listener dies', async () => {
    await mount();
    await selectFirstThread();

    const onMessages = messagesCall()[1] as MessagesCallback;
    const onMessagesError = messagesCall()[2] as ErrorCallback | undefined;
    expect(typeof onMessagesError).toBe('function');

    await act(async () => {
      onMessages([messageFixture('msg_1', 'hello there')]);
    });
    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);
    expect(latest.loadingMessages).toBe(false);

    await act(async () => {
      onMessagesError?.('network');
    });

    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);
    expect(latest.messagesError).toBe('network');
    expect(latest.loadingMessages).toBe(false);
    // A dead stream must never keep advertising itself as synced/live.
    expect(latest.messagesSynced).toBe(false);
  });

  it('reports an initial message error before any snapshot instead of loading forever', async () => {
    await mount();
    await selectFirstThread();
    expect(latest.loadingMessages).toBe(true);

    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onMessagesError('unavailable');
    });

    expect(latest.messages).toEqual([]);
    expect(latest.messagesError).toBe('unavailable');
    expect(latest.loadingMessages).toBe(false);
  });

  it('reports messagesSynced false before a snapshot, true after, and false again after an error', async () => {
    await mount();
    await selectFirstThread();

    // Connecting: no snapshot yet, so nothing may claim to be live.
    expect(latest.messagesSynced).toBe(false);
    expect(latest.loadingMessages).toBe(true);

    const onMessages = messagesCall()[1] as MessagesCallback;
    const onMessagesError = messagesCall()[2] as ErrorCallback;

    await act(async () => {
      onMessages([]);
    });
    // An empty thread that really did deliver a snapshot is still synced.
    expect(latest.messagesSynced).toBe(true);

    await act(async () => {
      onMessagesError('permission-denied');
    });
    expect(latest.messagesSynced).toBe(false);
  });
});

describe('useChats retry', () => {
  it('resubscribes messages exactly once, retains last good data and clears the error only on success', async () => {
    await mount();
    await selectFirstThread();

    const onMessages = messagesCall()[1] as MessagesCallback;
    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onMessages([messageFixture('msg_1', 'hello there')]);
      onMessagesError('offline');
    });
    expect(latest.messagesError).toBe('offline');

    await act(async () => {
      latest.retryMessages?.();
    });

    expect(chatMocks.subscribeToMessages).toHaveBeenCalledTimes(2);
    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);
    expect(latest.messagesError).toBe('offline');
    // The dead listener must be torn down before the replacement attaches.
    expect(messageUnsubscribe).toHaveBeenCalledTimes(1);

    const retryOnMessages = messagesCall(1)[1] as MessagesCallback;
    await act(async () => {
      retryOnMessages([messageFixture('msg_1', 'hello there'), messageFixture('msg_2', 'again')]);
    });

    expect(latest.messagesError).toBeNull();
    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1', 'msg_2']);

    // A late error from the SUPERSEDED listener must not resurrect the alert.
    await act(async () => {
      onMessagesError('offline');
    });
    expect(latest.messagesError).toBeNull();
    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1', 'msg_2']);
  });

  it('surfaces a genuine failure of the recovered message listener, even with the same message', async () => {
    await mount();
    await selectFirstThread();

    const onMessages = messagesCall()[1] as MessagesCallback;
    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onMessages([messageFixture('msg_1', 'hello there')]);
      onMessagesError('offline');
    });

    await act(async () => {
      latest.retryMessages?.();
    });

    const retryOnMessages = messagesCall(1)[1] as MessagesCallback;
    const retryOnMessagesError = messagesCall(1)[2] as ErrorCallback;
    await act(async () => {
      retryOnMessages([messageFixture('msg_1', 'hello there'), messageFixture('msg_2', 'again')]);
    });
    expect(latest.messagesError).toBeNull();

    // The CURRENT listener dying is real: it must raise the alert again even
    // though the identical message was already seen and recovered from.
    await act(async () => {
      retryOnMessagesError('offline');
    });

    expect(latest.messagesError).toBe('offline');
    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1', 'msg_2']);
  });

  it('flags a retry in flight and clears the flag on the next message callback', async () => {
    await mount();
    await selectFirstThread();

    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onMessagesError('offline');
    });
    expect(latest.retrying ?? false).toBe(false);

    await act(async () => {
      latest.retryMessages?.();
    });
    expect(latest.retrying).toBe(true);

    const retryOnMessages = messagesCall(1)[1] as MessagesCallback;
    await act(async () => {
      retryOnMessages([messageFixture('msg_1')]);
    });
    expect(latest.retrying).toBe(false);
  });

  it('keeps the message retry flag while unrelated thread callbacks arrive', async () => {
    await mount();
    await selectFirstThread();

    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onMessagesError('offline');
    });

    await act(async () => {
      latest.retryMessages?.();
    });
    expect(latest.retrying).toBe(true);

    // A thread snapshot, thread error and thread sync-throw all belong to the
    // other list. None of them may end the message retry that is in flight.
    const onThreads = threadsCall()[3] as ThreadsCallback;
    const onThreadError = threadsCall()[4] as ErrorCallback;

    await act(async () => {
      onThreads([threadFixture('thread_a'), threadFixture('thread_b')]);
    });
    expect(latest.retrying).toBe(true);

    await act(async () => {
      onThreadError('threads boom');
    });
    expect(latest.retrying).toBe(true);

    // The reply from the message listener is the only thing that clears it.
    const retryOnMessages = messagesCall(1)[1] as MessagesCallback;
    await act(async () => {
      retryOnMessages([messageFixture('msg_1')]);
    });
    expect(latest.retrying).toBe(false);
  });

  it('keeps the thread retry flag while unrelated message callbacks arrive', async () => {
    await mount();
    await selectFirstThread();

    const onThreadError = threadsCall()[4] as ErrorCallback;
    await act(async () => {
      onThreadError('boom');
    });

    await act(async () => {
      latest.retryThreads?.();
    });
    expect(latest.retrying).toBe(true);

    // Symmetric: a message snapshot or message error is not the threads
    // listener's reply and must not end the threads retry.
    const onMessages = messagesCall()[1] as MessagesCallback;
    const onMessagesError = messagesCall()[2] as ErrorCallback;

    await act(async () => {
      onMessages([messageFixture('msg_1', 'hello there')]);
    });
    expect(latest.retrying).toBe(true);

    await act(async () => {
      onMessagesError('messages boom');
    });
    expect(latest.retrying).toBe(true);

    const retryOnThreads = threadsCall(1)[3] as ThreadsCallback;
    await act(async () => {
      retryOnThreads([threadFixture('thread_a')]);
    });
    expect(latest.retrying).toBe(false);
  });

  it('resubscribes threads exactly once and clears the error on the next snapshot', async () => {
    await mount();
    const onThreadError = threadsCall()[4] as ErrorCallback;
    await act(async () => {
      onThreadError('boom');
    });
    expect(latest.threadsError).toBe('boom');

    await act(async () => {
      latest.retryThreads?.();
    });

    expect(chatMocks.subscribeToThreads).toHaveBeenCalledTimes(2);
    expect(latest.threadsError).toBe('boom');
    expect(threadUnsubscribe).toHaveBeenCalledTimes(1);

    const retryOnThreads = threadsCall(1)[3] as ThreadsCallback;
    await act(async () => {
      retryOnThreads([threadFixture('thread_a')]);
    });

    expect(latest.threadsError).toBeNull();
    expect(latest.threads.map((t) => t.id)).toEqual(['thread_a']);

    // The SUPERSEDED listener's late failure must stay ignored.
    await act(async () => {
      onThreadError('boom');
    });
    expect(latest.threadsError).toBeNull();
    expect(latest.threads.map((t) => t.id)).toEqual(['thread_a']);
  });

  it('surfaces a genuine failure of the recovered thread listener, even with the same message', async () => {
    await mount();
    const onThreadError = threadsCall()[4] as ErrorCallback;
    await act(async () => {
      onThreadError('boom');
    });

    await act(async () => {
      latest.retryThreads?.();
    });

    const retryOnThreads = threadsCall(1)[3] as ThreadsCallback;
    const retryOnThreadError = threadsCall(1)[4] as ErrorCallback;
    await act(async () => {
      retryOnThreads([threadFixture('thread_a')]);
    });
    expect(latest.threadsError).toBeNull();

    // The CURRENT listener dying is real, so the error must surface again.
    await act(async () => {
      retryOnThreadError('boom');
    });

    expect(latest.threadsError).toBe('boom');
    expect(latest.threads.map((t) => t.id)).toEqual(['thread_a']);
  });
});

describe('useChats synchronous subscribe failure', () => {
  it('retains the same-user thread list when a resubscribe throws synchronously', async () => {
    await mount();
    const onThreads = threadsCall()[3] as ThreadsCallback;
    await act(async () => {
      onThreads([threadFixture('thread_a'), threadFixture('thread_b')]);
    });
    expect(latest.threads.map((t) => t.id)).toEqual(['thread_a', 'thread_b']);

    chatMocks.subscribeToThreads.mockImplementationOnce(() => {
      throw new Error('listener could not be created');
    });

    await act(async () => {
      latest.retryThreads?.();
    });

    // Last good rooms survive: the failure must not masquerade as an empty hub.
    expect(latest.threads.map((t) => t.id)).toEqual(['thread_a', 'thread_b']);
    expect(latest.threadsError).toMatch(/listener could not be created/i);
    expect(latest.loadingThreads).toBe(false);
  });
});

describe('useChats scope fencing', () => {
  it('drops the previous thread messages the moment another thread is selected', async () => {
    await mount();
    const onThreads = threadsCall()[3] as ThreadsCallback;
    await act(async () => {
      onThreads([threadFixture('thread_a'), threadFixture('thread_b')]);
    });

    const onMessages = messagesCall()[1] as MessagesCallback;
    await act(async () => {
      onMessages([messageFixture('msg_1', 'hello there')]);
    });
    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);

    await act(async () => {
      latest.setActiveThreadId('thread_b');
    });

    expect(latest.messages).toEqual([]);
  });

  it('ignores a late snapshot from the unsubscribed previous thread', async () => {
    await mount();
    const onThreads = threadsCall()[3] as ThreadsCallback;
    await act(async () => {
      onThreads([threadFixture('thread_a'), threadFixture('thread_b')]);
    });

    const staleOnMessages = messagesCall()[1] as MessagesCallback;
    await act(async () => {
      latest.setActiveThreadId('thread_b');
    });
    // Only the message listener is scoped to the thread; the thread-list
    // listener legitimately stays attached.
    expect(messageUnsubscribe).toHaveBeenCalled();

    await act(async () => {
      staleOnMessages([messageFixture('msg_old', 'from the old room')]);
    });

    expect(latest.messages).toEqual([]);
  });

  it('clears the active thread and messages when the signed-in user goes away', async () => {
    await mount();
    await selectFirstThread();
    const onMessages = messagesCall()[1] as MessagesCallback;
    await act(async () => {
      onMessages([messageFixture('msg_1', 'hello there')]);
    });
    expect(latest.activeThreadId).toBe('thread_a');

    authState.user = null;
    await rerender();

    expect(latest.activeThreadId).toBeNull();
    expect(latest.messages).toEqual([]);
    expect(latest.threads).toEqual([]);
  });

  it('never renders the previous user\'s thread or messages after a direct A-to-B switch', async () => {
    // Record from the very first mount so the A-to-B switch is a re-render of
    // the same hook instance, exactly as it is in the running app.
    await mountRecording();
    const onThreads = threadsCall()[3] as ThreadsCallback;
    await act(async () => {
      onThreads([threadFixture('thread_a', 'Surat Operations')]);
    });

    const onMessages = messagesCall()[1] as MessagesCallback;
    await act(async () => {
      onMessages([messageFixture('msg_1', 'hello there')]);
    });
    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);

    // Only the switch commits matter: a single frame of operator A's data
    // rendered under operator B is the defect.
    renderLog.length = 0;

    authState.user = { ...operator, id: 'usr_second_op' };
    await rerenderRecording();

    expect(renderLog.length).toBeGreaterThan(0);
    for (const render of renderLog) {
      expect(render.ids).not.toContain('thread_a');
      expect(render.messages).not.toContain('msg_1');
      expect(render.active).not.toBe('thread_a');
    }
    expect(latest.threads).toEqual([]);
    expect(latest.messages).toEqual([]);
  });

  it('ignores a thread-list snapshot from the previous user after an account switch', async () => {
    await mount();
    const staleOnThreads = threadsCall()[3] as ThreadsCallback;
    const staleOnThreadError = threadsCall()[4] as ErrorCallback;

    authState.user = { ...operator, id: 'usr_other_op' };
    await rerender();

    await act(async () => {
      staleOnThreads([threadFixture('thread_from_prev_user')]);
      staleOnThreadError('old listener died');
    });

    expect(latest.threads).toEqual([]);
    expect(latest.threadsError).toBeNull();
  });

  it('keeps the thread the operator picked when the thread list re-delivers', async () => {
    await mount();
    const onThreads = threadsCall()[3] as ThreadsCallback;
    await act(async () => {
      onThreads([threadFixture('thread_a'), threadFixture('thread_b')]);
    });
    expect(latest.activeThreadId).toBe('thread_a');

    await act(async () => {
      latest.setActiveThreadId('thread_b');
    });

    await act(async () => {
      onThreads([threadFixture('thread_a'), threadFixture('thread_b')]);
    });

    expect(latest.activeThreadId).toBe('thread_b');
  });
});

describe('useChats authorisation scope', () => {
  it('resubscribes with the full role and branch scope when they change', async () => {
    await mount();
    expect(threadsCall()[1]).toBe('branch_owner');
    expect(threadsCall()[2]).toEqual(['branch_surat_01']);

    authState.user = { ...operator, role: 'developer', branchIds: ['branch_surat_01', 'branch_amd_01'] };
    await rerender();

    const latestThreadsCall = threadsCall(chatMocks.subscribeToThreads.mock.calls.length - 1);
    expect(latestThreadsCall[0]).toBe('usr_branch_op');
    expect(latestThreadsCall[1]).toBe('developer');
    expect(latestThreadsCall[2]).toEqual(['branch_surat_01', 'branch_amd_01']);
    expect(threadUnsubscribe).toHaveBeenCalled();
  });

  it('cancels every subscription on unmount and ignores a late callback afterwards', async () => {
    await mount();
    await selectFirstThread();
    expect(chatMocks.subscribeToMessages).toHaveBeenCalledTimes(1);

    const onMessages = messagesCall()[1] as MessagesCallback;
    const onMessagesError = messagesCall()[2] as ErrorCallback;

    await act(async () => {
      root.unmount();
    });
    mounted = false;

    expect(threadUnsubscribe).toHaveBeenCalledTimes(1);
    expect(messageUnsubscribe).toHaveBeenCalledTimes(1);

    // Fire the dropped listeners. If either wrote to state React would warn
    // about updating an unmounted tree; the guards must swallow them.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      onMessages([messageFixture('msg_after_unmount')]);
      onMessagesError('after unmount');
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('does not resubscribe when the auth store hands back an equal, freshly built user object', async () => {
    await mount();
    expect(chatMocks.subscribeToThreads).toHaveBeenCalledTimes(1);

    // authStore sets a brand-new profile object for the same operator on every
    // sign-in bootstrap; identity churn alone must not rebuild the listener.
    authState.user = { ...operator, branchIds: [...operator.branchIds] };
    await rerender();

    expect(chatMocks.subscribeToThreads).toHaveBeenCalledTimes(1);
    expect(threadUnsubscribe).not.toHaveBeenCalled();
  });

  it('resubscribes when only the branch list changes, so branch scope is never stale', async () => {
    await mount();
    expect(chatMocks.subscribeToThreads).toHaveBeenCalledTimes(1);

    authState.user = { ...operator, branchIds: ['branch_surat_01', 'branch_amd_01'] };
    await rerender();

    expect(chatMocks.subscribeToThreads).toHaveBeenCalledTimes(2);
    const latestThreadsCall = threadsCall(1);
    expect(latestThreadsCall[1]).toBe('branch_owner');
    expect(latestThreadsCall[2]).toEqual(['branch_surat_01', 'branch_amd_01']);
  });
});

describe('useChats authorisation downgrade', () => {
  it('clears retained threads, messages and selection when the role scope narrows', async () => {
    await mount();
    const onThreads = threadsCall()[3] as ThreadsCallback;
    await act(async () => {
      onThreads([threadFixture('thread_a'), threadFixture('thread_b')]);
    });
    const onMessages = messagesCall()[1] as MessagesCallback;
    await act(async () => {
      onMessages([messageFixture('msg_1', 'privileged')]);
    });
    expect(latest.activeThreadId).toBe('thread_a');

    // Same id, reduced role: the operator loses the scope that produced this
    // data, so it must not linger on screen as "last good".
    authState.user = { ...operator, role: 'branch_staff' };
    await rerender();

    expect(latest.threads).toEqual([]);
    expect(latest.messages).toEqual([]);
    expect(latest.activeThreadId).toBeNull();
  });

  it('clears retained data on a permission-denied error for that scope', async () => {
    await mount();
    const onThreads = threadsCall()[3] as ThreadsCallback;
    await act(async () => {
      onThreads([threadFixture('thread_a')]);
    });
    const onMessages = messagesCall()[1] as MessagesCallback;
    await act(async () => {
      onMessages([messageFixture('msg_1', 'privileged')]);
    });

    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onMessagesError('Missing or insufficient permissions.');
    });

    // Authorization failures are not staleness: drop the data, keep the error.
    expect(latest.messages).toEqual([]);
    expect(latest.messagesError).toMatch(/permission/i);
  });

  it('still keeps last good data on a non-authorisation error', async () => {
    await mount();
    await selectFirstThread();
    const onMessages = messagesCall()[1] as MessagesCallback;
    await act(async () => {
      onMessages([messageFixture('msg_1', 'hello there')]);
    });

    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onMessagesError('network');
    });

    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);
    expect(latest.messagesError).toBe('network');
  });

  it('keeps last good data on a missing-index (failed-precondition) error', async () => {
    await mount();
    const onThreads = threadsCall()[3] as ThreadsCallback;
    await act(async () => {
      onThreads([threadFixture('thread_a')]);
    });
    const onMessages = messagesCall()[1] as MessagesCallback;
    await act(async () => {
      onMessages([messageFixture('msg_1', 'hello there')]);
    });

    // A missing composite index is a deployment fault, not a denied read:
    // the operator may still see what they already had.
    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onMessagesError('The query requires an index. (failed-precondition)');
    });

    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);
    expect(latest.messagesError).toMatch(/index/i);
  });

  it('keeps last good rooms on a missing-index (failed-precondition) error', async () => {
    await mount();
    const onThreads = threadsCall()[3] as ThreadsCallback;
    await act(async () => {
      onThreads([threadFixture('thread_a'), threadFixture('thread_b')]);
    });

    const onThreadError = threadsCall()[4] as ErrorCallback;
    await act(async () => {
      onThreadError('The query requires an index. (failed-precondition)');
    });

    expect(latest.threads.map((t) => t.id)).toEqual(['thread_a', 'thread_b']);
    expect(latest.threadsError).toMatch(/index/i);
  });
});

describe('useChats authoritative SDK error code', () => {
  /** Seed BOTH feeds with last-good data so a denial has something to clear. */
  async function seedBothFeeds(): Promise<void> {
    const onThreads = threadsCall()[3] as ThreadsCallback;
    await act(async () => {
      onThreads([threadFixture('thread_a'), threadFixture('thread_b')]);
    });
    const onMessages = messagesCall()[1] as MessagesCallback;
    await act(async () => {
      onMessages([messageFixture('msg_1', 'hello there')]);
    });
    expect(latest.threads.map((t) => t.id)).toEqual(['thread_a', 'thread_b']);
    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);
  }

  it('clears only the denied feed on an opaque permission-denied code', async () => {
    await mount();
    await seedBothFeeds();

    // Opaque, non-English message: only the code identifies a denial.
    const onThreadError = threadsCall()[4] as ErrorCallback;
    await act(async () => {
      onThreadError('要求された操作を完了できません', 'permission-denied');
    });

    // Denied feed drops its privileged rows and reports the failure…
    expect(latest.threads).toEqual([]);
    expect(latest.threadsError).toMatch(/完了/);
    expect(latest.loadingThreads).toBe(false);
    // …and the healthy feed is untouched.
    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);
    expect(latest.messagesError).toBeNull();
  });

  it('clears only the denied feed on an unauthenticated code with blank message', async () => {
    await mount();
    await seedBothFeeds();

    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onMessagesError('', 'unauthenticated');
    });

    expect(latest.messages).toEqual([]);
    expect(latest.messagesSynced).toBe(false);
    expect(latest.loadingMessages).toBe(false);
    // A blank SDK message must still surface a non-empty, visible fallback.
    expect(typeof latest.messagesError).toBe('string');
    expect((latest.messagesError ?? '').length).toBeGreaterThan(0);
    expect(latest.threads.map((t) => t.id)).toEqual(['thread_a', 'thread_b']);
    expect(latest.threadsError).toBeNull();
  });

  it('clears only the denied feed on an opaque permission-denied message', async () => {
    await mount();
    await seedBothFeeds();

    // Same policy, opposite diagonal: the MESSAGES feed denied with an opaque
    // message and an authoritative code.
    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onMessagesError('要求された操作を完了できません', 'permission-denied');
    });

    expect(latest.messages).toEqual([]);
    expect(latest.messagesSynced).toBe(false);
    expect(latest.loadingMessages).toBe(false);
    expect(latest.messagesError).toMatch(/完了/);
    // The healthy threads feed is untouched.
    expect(latest.threads.map((t) => t.id)).toEqual(['thread_a', 'thread_b']);
    expect(latest.threadsError).toBeNull();
  });

  it('clears only the denied feed on an unauthenticated code with blank message on threads', async () => {
    await mount();
    await seedBothFeeds();

    const onThreadError = threadsCall()[4] as ErrorCallback;
    await act(async () => {
      onThreadError('', 'unauthenticated');
    });

    expect(latest.threads).toEqual([]);
    expect(latest.loadingThreads).toBe(false);
    expect(latest.threadsError).not.toBeNull();
    // A blank SDK message must still surface a non-empty, visible fallback.
    expect(typeof latest.threadsError).toBe('string');
    expect((latest.threadsError ?? '').length).toBeGreaterThan(0);
    // The healthy messages feed is untouched.
    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);
    expect(latest.messagesError).toBeNull();
  });

  it('clears both feeds when a synchronous subscribe throw carries a denial code', async () => {
    await mount();
    await seedBothFeeds();

    chatMocks.subscribeToThreads.mockImplementationOnce((): never => {
      throw Object.assign(new Error('opaque'), { code: 'permission-denied' });
    });
    chatMocks.subscribeToMessages.mockImplementationOnce((): never => {
      throw Object.assign(new Error('opaque'), { code: 'permission-denied' });
    });

    await act(async () => {
      latest.retryThreads?.();
    });
    await act(async () => {
      latest.retryMessages?.();
    });

    expect(latest.threads).toEqual([]);
    expect(latest.messages).toEqual([]);
    expect(latest.threadsError).not.toBeNull();
    expect(latest.messagesError).not.toBeNull();
  });

  it('keeps last good rows when a failed-precondition code contradicts a denial message', async () => {
    await mount();
    await seedBothFeeds();

    const onThreadError = threadsCall()[4] as ErrorCallback;
    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onThreadError('permission-denied', 'failed-precondition');
      onMessagesError('permission-denied', 'failed-precondition');
    });

    expect(latest.threads.map((t) => t.id)).toEqual(['thread_a', 'thread_b']);
    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);
    expect(latest.threadsError).not.toBeNull();
    expect(latest.messagesError).not.toBeNull();
  });

  it('keeps last good rows when an unavailable code contradicts a denial message', async () => {
    await mount();
    await seedBothFeeds();

    const onThreadError = threadsCall()[4] as ErrorCallback;
    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onThreadError('permission-denied', 'unavailable');
      onMessagesError('permission-denied', 'unavailable');
    });

    expect(latest.threads.map((t) => t.id)).toEqual(['thread_a', 'thread_b']);
    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);
    expect(latest.threadsError).not.toBeNull();
    expect(latest.messagesError).not.toBeNull();
  });

  it('legacy codeless denial still clears via the message heuristic', async () => {
    await mount();
    await seedBothFeeds();

    const onThreadError = threadsCall()[4] as ErrorCallback;
    await act(async () => {
      onThreadError('Missing or insufficient permissions.');
    });

    expect(latest.threads).toEqual([]);
    expect(latest.threadsError).toMatch(/permission/i);
    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);
  });

  it('clears both feeds and shows the documented fallback on a whitespace-only message with a denial code', async () => {
    await mount();
    await seedBothFeeds();

    // Whitespace is truthy but visually blank: it must not become the error copy.
    const onThreadError = threadsCall()[4] as ErrorCallback;
    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onThreadError(' \t ', 'permission-denied');
      onMessagesError(' \t ', 'unauthenticated');
    });

    expect(latest.threads).toEqual([]);
    expect(latest.messages).toEqual([]);
    expect(latest.loadingThreads).toBe(false);
    expect(latest.loadingMessages).toBe(false);
    expect(latest.messagesSynced).toBe(false);
    expect(latest.threadsError).toBe('Chat threads failed to load');
    expect(latest.messagesError).toBe('Messages failed to load');
  });

  it('treats a whitespace-only code as absent and falls back to the legacy denial heuristic', async () => {
    await mount();
    await seedBothFeeds();

    // A blank code must not suppress the message heuristic…
    const onThreadError = threadsCall()[4] as ErrorCallback;
    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onThreadError('Missing or insufficient permissions.', ' \t ');
      onMessagesError('Missing or insufficient permissions.', ' \t ');
    });

    // …so both denied feeds still clear.
    expect(latest.threads).toEqual([]);
    expect(latest.messages).toEqual([]);
    expect(latest.threadsError).toMatch(/permission/i);
    expect(latest.messagesError).toMatch(/permission/i);
  });

  it('clears both feeds on a whitespace-only synchronous throw message with a real denial code', async () => {
    await mount();
    await seedBothFeeds();

    chatMocks.subscribeToThreads.mockImplementationOnce((): never => {
      throw Object.assign(new Error(' \t '), { code: 'permission-denied' });
    });
    chatMocks.subscribeToMessages.mockImplementationOnce((): never => {
      throw Object.assign(new Error(' \t '), { code: 'unauthenticated' });
    });

    await act(async () => {
      latest.retryThreads?.();
    });
    await act(async () => {
      latest.retryMessages?.();
    });

    expect(latest.threads).toEqual([]);
    expect(latest.messages).toEqual([]);
    expect(latest.threadsError).toBe('Chat threads failed to load');
    expect(latest.messagesError).toBe('Messages failed to load');
  });
});

describe('useChats per-feed retry ownership', () => {
  /** Both feeds failed, so both Retry controls are legitimately available. */
  async function bothFeedsFailed(): Promise<void> {
    await mount();
    await selectFirstThread();
    const onThreadError = threadsCall()[4] as ErrorCallback;
    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onThreadError('threads boom');
      onMessagesError('messages boom');
    });
  }

  it('exposes per-feed retry flags independently of the aggregate flag', async () => {
    await bothFeedsFailed();

    expect(latest.retrying).toBe(false);
    expect(latest.retryingThreads).toBe(false);
    expect(latest.retryingMessages).toBe(false);

    await act(async () => {
      latest.retryMessages?.();
    });

    // The messages retry owns only its own feed…
    expect(latest.retryingMessages).toBe(true);
    expect(latest.retryingThreads).toBe(false);
    // …while the aggregate stays true for compatibility.
    expect(latest.retrying).toBe(true);
  });

  it('leaves the rooms retry available while a messages retry is pending', async () => {
    await bothFeedsFailed();
    await act(async () => {
      latest.retryMessages?.();
    });

    // The failed rooms feed is a different request; it must still be retryable.
    expect(latest.retryingThreads).toBe(false);
    const threadsCallCount = chatMocks.subscribeToThreads.mock.calls.length;

    await act(async () => {
      latest.retryThreads?.();
    });

    expect(chatMocks.subscribeToThreads.mock.calls.length).toBe(threadsCallCount + 1);
    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(2);
  });

  it('leaves the messages retry available while a threads retry is pending', async () => {
    await bothFeedsFailed();
    await act(async () => {
      latest.retryThreads?.();
    });

    expect(latest.retryingMessages).toBe(false);
    const messagesCallCount = chatMocks.subscribeToMessages.mock.calls.length;

    await act(async () => {
      latest.retryMessages?.();
    });

    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(messagesCallCount + 1);
  });

  it('keeps simultaneous retries pending and settles each one independently', async () => {
    await bothFeedsFailed();

    await act(async () => {
      latest.retryThreads?.();
      latest.retryMessages?.();
    });

    expect(latest.retryingThreads).toBe(true);
    expect(latest.retryingMessages).toBe(true);

    // The threads listener answering must not settle the messages retry.
    const retryOnThreads = threadsCall(1)[3] as ThreadsCallback;
    await act(async () => {
      retryOnThreads([threadFixture('thread_a')]);
    });
    expect(latest.retryingThreads).toBe(false);
    expect(latest.retryingMessages).toBe(true);
    expect(latest.retrying).toBe(true);

    // …and its error must not settle it either.
    const retryOnThreadError = threadsCall(1)[4] as ErrorCallback;
    await act(async () => {
      retryOnThreadError('threads boom again');
    });
    expect(latest.retryingMessages).toBe(true);

    const retryOnMessages = messagesCall(1)[1] as MessagesCallback;
    await act(async () => {
      retryOnMessages([messageFixture('msg_1')]);
    });
    expect(latest.retryingMessages).toBe(false);
    expect(latest.retrying).toBe(false);
  });

  it('ends only the feed whose synchronous subscribe threw', async () => {
    await bothFeedsFailed();

    // Start a messages retry FIRST and prove it is genuinely pending, so
    // "both false" afterwards cannot pass via an incorrect blanket clear.
    await act(async () => {
      latest.retryMessages?.();
    });
    expect(latest.retryingMessages).toBe(true);

    chatMocks.subscribeToThreads.mockImplementationOnce((): never => {
      throw new Error('listener could not be created');
    });

    await act(async () => {
      latest.retryThreads?.();
    });

    // The throw settles the threads retry…
    expect(latest.retryingThreads).toBe(false);
    expect(latest.threadsError).toMatch(/listener could not be created/i);
    // …and leaves the still-in-flight messages retry untouched.
    expect(latest.retryingMessages).toBe(true);
  });

  it('ends a pending messages retry when the active room changes', async () => {
    await bothFeedsFailed();

    // Both feeds pending, so the room change must end exactly one of them.
    await act(async () => {
      latest.retryThreads?.();
      latest.retryMessages?.();
    });
    expect(latest.retryingThreads).toBe(true);
    expect(latest.retryingMessages).toBe(true);

    // Switching rooms abandons the in-flight messages resubscription…
    await act(async () => {
      latest.setActiveThreadId('thread_b');
    });

    expect(latest.retryingMessages).toBe(false);
    // …and must NOT disturb the rooms feed's own pending retry.
    expect(latest.retryingThreads).toBe(true);
  });

  it('clears both retry flags on an authorisation scope change', async () => {
    await bothFeedsFailed();
    await act(async () => {
      latest.retryThreads?.();
      latest.retryMessages?.();
    });
    expect(latest.retryingThreads).toBe(true);
    expect(latest.retryingMessages).toBe(true);

    authState.user = { ...operator, role: 'branch_staff' };
    await rerender();

    expect(latest.retryingThreads).toBe(false);
    expect(latest.retryingMessages).toBe(false);
    expect(latest.retrying).toBe(false);
  });

  it('ignores a superseded callback that would clear a newer retry', async () => {
    await bothFeedsFailed();

    const staleOnMessages = messagesCall()[1] as MessagesCallback;
    await act(async () => {
      latest.retryMessages?.();
    });
    expect(latest.retryingMessages).toBe(true);

    // The listener the retry replaced is already cancelled; its late callback
    // must not settle the retry that is currently in flight.
    await act(async () => {
      staleOnMessages([messageFixture('msg_stale')]);
    });

    expect(latest.retryingMessages).toBe(true);
    const retryOnMessages = messagesCall(1)[1] as MessagesCallback;
    await act(async () => {
      retryOnMessages([messageFixture('msg_1')]);
    });
    expect(latest.retryingMessages).toBe(false);
  });

  it('does not resurrect an abandoned messages retry when returning to room A', async () => {
    await bothFeedsFailed();

    // Rooms retry stays pending throughout, so any clearing we observe is
    // attributable to the messages feed alone.
    await act(async () => {
      latest.retryThreads?.();
    });
    expect(latest.retryingThreads).toBe(true);

    const abandonedUnsubscribe = messageUnsubscribe;
    await act(async () => {
      latest.retryMessages?.();
    });
    expect(latest.retryingMessages).toBe(true);

    // A → B: the room change abandons the message retry for room A…
    await act(async () => {
      latest.setActiveThreadId('thread_b');
    });
    expect(latest.retryingMessages).toBe(false);
    // …and the rooms retry is untouched.
    expect(latest.retryingThreads).toBe(true);

    // …back to A, still before any callback fires.
    await act(async () => {
      latest.setActiveThreadId('thread_a');
    });

    // The abandoned retry must NOT reappear as pending in room A.
    expect(latest.retryingMessages).toBe(false);
    expect(latest.retryingThreads).toBe(true);
    // The abandoned subscription was torn down, and nothing was sent.
    expect(abandonedUnsubscribe).toHaveBeenCalled();
    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
  });
});

describe('useChats authorisation-scope send ownership', () => {
  /** Load room A and capture the sendMessage bound to THIS auth scope. */
  async function captureSendInRoomA() {
    await mount();
    await selectFirstThread();
    const staleSend = latest.sendMessage;
    expect(typeof staleSend).toBe('function');
    return staleSend;
  }

  it('exposes an additive auth-scope key that changes when the role narrows', async () => {
    await mount();
    const before = latest.authorizationScopeKey;

    authState.user = { ...operator, role: 'branch_staff' };
    await rerender();

    const after = latest.authorizationScopeKey;
    // The field plus a real identity change is the contract under test.
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });

  it('keeps the auth-scope key stable for an equal, freshly built user object', async () => {
    await mount();
    const before = latest.authorizationScopeKey;

    // Same id/role/branches in the SAME ORDER, but a brand-new object.
    authState.user = {
      ...operator,
      branchIds: [...operator.branchIds],
      cityIds: [...operator.cityIds],
    };
    await rerender();

    expect(latest.authorizationScopeKey).toBe(before);
  });

  it('refuses an old captured send after a role narrowing, before the service is called', async () => {
    const staleSend = await captureSendInRoomA();

    authState.user = { ...operator, role: 'branch_staff' };
    await rerender();

    await act(async () => {
      await staleSend('message from the old scope');
    });

    // The captured callback must refuse outright: no service I/O at all.
    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('refuses an old captured send after a branch narrowing, before the service is called', async () => {
    const staleSend = await captureSendInRoomA();

    // Fewer branches, same uid and role, same room.
    authState.user = { ...operator, branchIds: [] };
    await rerender();

    await act(async () => {
      await staleSend('message from the old branch scope');
    });

    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('refuses an old captured send after the room changed', async () => {
    const staleSend = await captureSendInRoomA();

    // Capture is bound to room A; move to room B without any auth change.
    await act(async () => {
      latest.setActiveThreadId('thread_b');
    });
    expect(latest.activeThreadId).toBe('thread_b');

    await act(async () => {
      await staleSend('message aimed at the old room');
    });

    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('still sends normally from the current owner', async () => {
    const currentSend = await captureSendInRoomA();

    await act(async () => {
      await currentSend('normal current-room message');
    });

    expect(chatMocks.sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('useChats under StrictMode', () => {
  it('keeps exactly one live subscription pair after the double-invoked mount', async () => {
    await mountStrict();

    // StrictMode mounts, tears down and remounts. The subscription the hook
    // currently holds is the last one created; earlier ones must be gone.
    const lastThreadsCall =
      chatMocks.subscribeToThreads.mock.calls[chatMocks.subscribeToThreads.mock.calls.length - 1];
    const lastMessagesCallCount = chatMocks.subscribeToMessages.mock.calls.length;
    expect(lastMessagesCallCount).toBe(0);

    const onThreads = lastThreadsCall[3] as ThreadsCallback;
    await act(async () => {
      onThreads([threadFixture('thread_a')]);
    });

    // The surviving listener must still drive state…
    expect(latest.loadingThreads).toBe(false);
    expect(latest.threads.map((t) => t.id)).toEqual(['thread_a']);

    // …and every listener the double-invoke discarded must be unsubscribed.
    expect(threadUnsubscribe).toHaveBeenCalled();
    expect(chatMocks.subscribeToMessages).toHaveBeenCalledTimes(1);
    expect(latest.activeThreadId).toBe('thread_a');
  });
});

/**
 * Foreground recovery: an external browser hint (online / focus / visible)
 * asks a FAILED feed to resubscribe. This is a liveness nudge, not a health
 * claim: the feed's own snapshot still decides whether it is healthy again,
 * and healthy feeds are never disturbed.
 */
describe('useChats foreground recovery', () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');
  const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  let online = true;

  function setNavigatorOnline(value: boolean): void {
    online = value;
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => online,
    });
  }

  function setVisibility(value: 'visible' | 'hidden'): void {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => value,
    });
  }

  async function fire(target: EventTarget, event: Event): Promise<void> {
    await act(async () => {
      target.dispatchEvent(event);
    });
  }

  /** Seed room A with both feeds healthy, then fail ONLY the given feed. */
  async function failOnly(feed: 'threads' | 'messages'): Promise<void> {
    await mount();
    await selectFirstThread();
    const onThreads = threadsCall()[3] as ThreadsCallback;
    const onMessages = messagesCall()[1] as MessagesCallback;
    await act(async () => {
      onThreads([threadFixture('thread_a')]);
      onMessages([messageFixture('msg_1', 'hello there')]);
    });

    if (feed === 'threads') {
      const onThreadError = threadsCall()[4] as ErrorCallback;
      await act(async () => {
        onThreadError('threads boom');
      });
    } else {
      const onMessagesError = messagesCall()[2] as ErrorCallback;
      await act(async () => {
        onMessagesError('messages boom');
      });
    }
  }

  beforeEach(() => {
    online = true;
    setNavigatorOnline(true);
    setVisibility('visible');
  });

  afterEach(() => {
    // jsdom keeps `onLine` on the Navigator prototype, so an absent original
    // OWN descriptor means our own getter must be deleted rather than left.
    if (originalOnLine) {
      Object.defineProperty(window.navigator, 'onLine', originalOnLine);
    } else {
      delete (window.navigator as { onLine?: boolean }).onLine;
    }
    if (originalVisibility) {
      Object.defineProperty(document, 'visibilityState', originalVisibility);
    } else {
      delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState;
    }
  });

  it('resubscribes a failed messages feed on window focus while online', async () => {
    await failOnly('messages');
    const before = chatMocks.subscribeToMessages.mock.calls.length;

    await fire(window, new Event('focus'));

    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(before + 1);
  });

  it('resubscribes a failed threads feed when the document becomes visible', async () => {
    await failOnly('threads');
    const before = chatMocks.subscribeToThreads.mock.calls.length;

    setVisibility('visible');
    await fire(document, new Event('visibilitychange'));

    expect(chatMocks.subscribeToThreads.mock.calls.length).toBe(before + 1);
  });

  it('never resubscribes a healthy feed', async () => {
    await mount();
    await selectFirstThread();
    const threadsBefore = chatMocks.subscribeToThreads.mock.calls.length;
    const messagesBefore = chatMocks.subscribeToMessages.mock.calls.length;

    // Both feeds are healthy here: no error has been reported.
    await fire(window, new Event('online'));

    expect(chatMocks.subscribeToThreads.mock.calls.length).toBe(threadsBefore);
    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(messagesBefore);
  });

  it('does not retry while the browser reports offline', async () => {
    await failOnly('messages');
    const before = chatMocks.subscribeToMessages.mock.calls.length;

    setNavigatorOnline(false);
    await fire(window, new Event('focus'));
    await fire(window, new Event('online'));

    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(before);
  });

  it('starts only one attempt per feed while that feed is already pending', async () => {
    await failOnly('messages');
    const before = chatMocks.subscribeToMessages.mock.calls.length;

    // Three different external hints, one pending attempt.
    await fire(window, new Event('focus'));
    await fire(window, new Event('online'));
    await fire(document, new Event('visibilitychange'));

    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(before + 1);
  });

  it('keeps last good data and reports the error until a snapshot proves recovery', async () => {
    await failOnly('messages');
    const beforeAttempts = chatMocks.subscribeToMessages.mock.calls.length;

    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);
    expect(latest.messagesError).toBe('messages boom');

    await fire(window, new Event('focus'));

    // A retry really was attempted, and is reported as pending…
    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(beforeAttempts + 1);
    expect(latest.retryingMessages).toBe(true);
    // …so the stale notice and last good data must survive the attempt.
    expect(latest.messagesError).toBe('messages boom');
    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);
    expect(chatMocks.sendMessage).not.toHaveBeenCalled();

    // Only the feed's OWN snapshot clears its error and marks it synced.
    const retryOnMessages = messagesCall(
      chatMocks.subscribeToMessages.mock.calls.length - 1
    )[1] as MessagesCallback;
    await act(async () => {
      retryOnMessages([messageFixture('msg_1', 'hello there'), messageFixture('msg_2', 'again')]);
    });

    expect(latest.messagesError).toBeNull();
    expect(latest.messagesSynced).toBe(true);
    expect(latest.retryingMessages).toBe(false);
    // A snapshot is not an Internet-health claim; it only settles this feed.
    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('recovers a failed feed on the online event without disturbing the healthy one', async () => {
    await failOnly('messages');
    const messagesBefore = chatMocks.subscribeToMessages.mock.calls.length;
    const threadsBefore = chatMocks.subscribeToThreads.mock.calls.length;

    await fire(window, new Event('online'));

    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(messagesBefore + 1);
    // The healthy threads feed must be left alone.
    expect(chatMocks.subscribeToThreads.mock.calls.length).toBe(threadsBefore);
    expect(latest.threadsError).toBeNull();
  });

  it('makes no attempts while the page is hidden, even across every hint', async () => {
    await failOnly('messages');
    const before = chatMocks.subscribeToMessages.mock.calls.length;

    setVisibility('hidden');
    await fire(window, new Event('focus'));
    await fire(window, new Event('online'));
    await fire(document, new Event('visibilitychange'));

    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(before);

    // Becoming visible is what finally permits the bounded attempt.
    setVisibility('visible');
    await fire(document, new Event('visibilitychange'));

    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(before + 1);
  });

  it('does not stack a recovery attempt on top of a manual retry already pending', async () => {
    await failOnly('messages');

    await act(async () => {
      latest.retryMessages?.();
    });
    expect(latest.retryingMessages).toBe(true);
    const before = chatMocks.subscribeToMessages.mock.calls.length;

    await fire(window, new Event('focus'));
    await fire(window, new Event('online'));
    await fire(document, new Event('visibilitychange'));

    // Manual and automatic share one liveness slot per feed.
    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(before);
    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('ignores a stale recovery event after the scope changed', async () => {
    await failOnly('messages');

    // Narrow the authorisation scope: the old owner's feed is abandoned. The
    // scope change itself resubscribes once, so measure from AFTER it.
    authState.user = { ...operator, role: 'branch_staff' };
    await rerender();
    const before = chatMocks.subscribeToMessages.mock.calls.length;

    await fire(window, new Event('focus'));
    await fire(window, new Event('online'));
    await fire(document, new Event('visibilitychange'));

    // Nothing in the new scope is failed, so no recovery attempt may occur.
    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(before);
    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('does not self-trigger a retry loop after a synchronous subscribe failure', async () => {
    await failOnly('threads');
    const before = chatMocks.subscribeToThreads.mock.calls.length;

    chatMocks.subscribeToThreads.mockImplementationOnce((): never => {
      throw new Error('listener could not be created');
    });

    await fire(window, new Event('focus'));

    // Exactly one bounded attempt for one external event — no cascade.
    expect(chatMocks.subscribeToThreads.mock.calls.length).toBe(before + 1);
  });

  it('makes no attempts after unmount', async () => {
    await failOnly('messages');
    const before = chatMocks.subscribeToMessages.mock.calls.length;

    await act(async () => {
      root.unmount();
    });
    mounted = false;

    await fire(window, new Event('focus'));

    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(before);
  });

  it('re-arms after a hint-triggered attempt settles, and later hints retry again', async () => {
    await failOnly('messages');
    const before = chatMocks.subscribeToMessages.mock.calls.length;

    await fire(window, new Event('focus'));
    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(before + 1);
    expect(latest.retryingMessages).toBe(true);

    // The attempt settles by failing again on its own listener.
    const attemptOnMessagesError = messagesCall(
      chatMocks.subscribeToMessages.mock.calls.length - 1
    )[2] as ErrorCallback;
    await act(async () => {
      attemptOnMessagesError('messages boom again');
    });
    expect(latest.retryingMessages).toBe(false);

    // A later, separate external hint must be able to try again.
    await fire(window, new Event('online'));
    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(before + 2);
    // And it targets the current room, not a stale one.
    expect(messagesCall(chatMocks.subscribeToMessages.mock.calls.length - 1)[0]).toBe(
      'thread_a'
    );
  });

  it('recovers both failed feeds from a single hint, one attempt each', async () => {
    await mount();
    await selectFirstThread();
    const onThreads = threadsCall()[3] as ThreadsCallback;
    const onMessages = messagesCall()[1] as MessagesCallback;
    await act(async () => {
      onThreads([threadFixture('thread_a')]);
      onMessages([messageFixture('msg_1', 'hello there')]);
    });
    const onThreadError = threadsCall()[4] as ErrorCallback;
    const onMessagesError = messagesCall()[2] as ErrorCallback;
    await act(async () => {
      onThreadError('threads boom');
      onMessagesError('messages boom');
    });

    const threadsBefore = chatMocks.subscribeToThreads.mock.calls.length;
    const messagesBefore = chatMocks.subscribeToMessages.mock.calls.length;

    await fire(window, new Event('focus'));

    expect(chatMocks.subscribeToThreads.mock.calls.length).toBe(threadsBefore + 1);
    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(messagesBefore + 1);
  });

  /**
   * CONTROL — never a RED oracle.
   *
   * The retry a hint starts dies inside `subscribeToMessages` itself, before a
   * listener or an onError callback exists. That is the real "attempt died"
   * path a client SDK takes when the listener cannot be created at all, so no
   * stale callback of a previous generation is ever involved. This pins that
   * (a) the hint still issues exactly one attempt, (b) the hook's own catch
   * path re-arms the latch, keeps the last good rows and the error, and
   * (c) a later hint is still admitted against the live room.
   */
  it('re-arms after a hint-triggered attempt dies on a synchronous subscribe throw', async () => {
    await failOnly('messages');
    const before = chatMocks.subscribeToMessages.mock.calls.length;

    chatMocks.subscribeToMessages.mockImplementationOnce(() => {
      throw new Error('listener could not be created');
    });

    await fire(window, new Event('focus'));

    // Exactly one attempt was issued by the hint, and the catch path settled it.
    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(before + 1);
    expect(latest.retryingMessages).toBe(false);
    expect(latest.messagesError).toBe('listener could not be created');
    // Last good rows survive, so the error is an honest stale notice.
    expect(latest.messages.map((m) => m.id)).toEqual(['msg_1']);
    // A failed subscribe is not a send.
    expect(chatMocks.sendMessage).not.toHaveBeenCalled();

    // A later, separate external hint must still be admitted, live room only.
    await fire(window, new Event('online'));
    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(before + 2);
    expect(messagesCall(chatMocks.subscribeToMessages.mock.calls.length - 1)[0]).toBe(
      'thread_a'
    );
  });

  it('does not wedge the messages latch when a hint is batched with a room change', async () => {
    // SDK-independent path: the hint is for room A, the room then switches to B
    // in the same batch, so A's pending never renders and is retired.
    await failOnly('messages');
    const before = chatMocks.subscribeToMessages.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      latest.setActiveThreadId('thread_b');
    });

    // Fail room B's own listener so the new room is genuinely broken.
    const threadBOnMessagesError = messagesCall(
      chatMocks.subscribeToMessages.mock.calls.length - 1
    )[2] as ErrorCallback;
    await act(async () => {
      threadBOnMessagesError('thread_b boom');
    });

    const afterB = chatMocks.subscribeToMessages.mock.calls.length;

    await fire(window, new Event('online'));

    // A hint must be able to recover room B, not be blocked by A's stale latch.
    expect(chatMocks.subscribeToMessages.mock.calls.length).toBe(afterB + 1);
    expect(messagesCall(chatMocks.subscribeToMessages.mock.calls.length - 1)[0]).toBe(
      'thread_b'
    );
  });
});
