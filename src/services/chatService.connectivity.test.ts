/**
 * chatService error-code propagation contract.
 *
 * This file calls the REAL `chatService`. Only the Firebase boundary is faked:
 * the `db` handle from `@/config/firebase` and the Firestore query/listener
 * functions. The service itself — its query construction, its `onSnapshot`
 * wiring, its error handling and its unsubscribe identity — runs for real.
 *
 * Policy under test (additive, no permission or query-logic change):
 *   onError(message, code?) forwards the SDK `error.code` unchanged so callers
 *   can treat a denial as a denial even when the message is opaque/localised,
 *   and can keep last-good data when the code says the failure is staleness.
 *
 * No Firestore wire, no real SDK initialisation, no writes: addDoc/setDoc/
 * updateDoc/getDocs are tripwires that fail the test if the code under test
 * ever reaches for them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatThread, UserRole } from '@/types';

const firestore = vi.hoisted(() => ({
  collection: vi.fn((..._args: unknown[]) => ({ __ref: 'collection' })),
  doc: vi.fn((..._args: unknown[]) => ({ __ref: 'doc' })),
  query: vi.fn((..._args: unknown[]) => ({ __ref: 'query' })),
  where: vi.fn((..._args: unknown[]) => ({ __ref: 'where' })),
  orderBy: vi.fn((..._args: unknown[]) => ({ __ref: 'orderBy' })),
  limit: vi.fn((..._args: unknown[]) => ({ __ref: 'limit' })),
  onSnapshot: vi.fn(),
  // Write + read APIs are never expected here.
  addDoc: vi.fn((): void => {
    throw new Error('addDoc must not be called by a read subscription');
  }),
  setDoc: vi.fn((): void => {
    throw new Error('setDoc must not be called by a read subscription');
  }),
  updateDoc: vi.fn((): void => {
    throw new Error('updateDoc must not be called by a read subscription');
  }),
  getDocs: vi.fn((): void => {
    throw new Error('getDocs must not be called by a read subscription');
  }),
  Timestamp: {
    now: () => ({ toMillis: () => 0, toDate: () => new Date(0) }),
    fromMillis: (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) }),
  },
}));

vi.mock('firebase/firestore', () => firestore);
vi.mock('@/config/firebase', () => ({ db: { __ref: 'db' }, app: {}, auth: {} }));

const { chatService } = await import('./chatService');

type ThreadsCallback = (threads: ChatThread[]) => void;
type MessagesCallback = (messages: ChatMessage[]) => void;
/** The additive contract: an optional second `code` argument. */
type ErrorCallback = (message: string, code?: string) => void;

let unsubscribes: Array<ReturnType<typeof vi.fn>>;

/** Drive the LAST onSnapshot registration's error handler with arbitrary input. */
function fireLastSnapshotError(error: unknown): void {
  const call = firestore.onSnapshot.mock.calls[firestore.onSnapshot.mock.calls.length - 1];
  (call[2] as (err: unknown) => void)(error);
}

/** Drive the LAST onSnapshot registration's success handler with `count` docs. */
function fireLastSnapshotData(docs: Array<Record<string, unknown>>): void {
  const call = firestore.onSnapshot.mock.calls[firestore.onSnapshot.mock.calls.length - 1];
  (call[1] as (snap: {
    docs: Array<{ id: string; data: () => Record<string, unknown> }>;
  }) => void)({
    docs: docs.map((data, index) => ({ id: `doc_${index}`, data: () => data })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  unsubscribes = [];
  firestore.onSnapshot.mockImplementation(() => {
    const unsubscribe = vi.fn();
    unsubscribes.push(unsubscribe);
    return unsubscribe;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('chatService.subscribeToThreads error-code forwarding', () => {
  it('forwards the exact SDK message and code to the error handler', () => {
    const onThreads = vi.fn<ThreadsCallback>();
    const onError = vi.fn<ErrorCallback>();

    chatService.subscribeToThreads('usr_1', 'branch_owner' as UserRole, ['branch_surat_01'], onThreads, onError);

    fireLastSnapshotError({
      message: '要求された操作を完了できません',
      code: 'permission-denied',
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('要求された操作を完了できません', 'permission-denied');
    // A dead listener must never be reported as an empty thread list.
    expect(onThreads).not.toHaveBeenCalled();
  });

  it('falls back to the documented message when the SDK message is blank, keeping the code', () => {
    const onError = vi.fn<ErrorCallback>();
    chatService.subscribeToThreads('usr_1', 'branch_owner' as UserRole, [], vi.fn(), onError);

    fireLastSnapshotError({ message: '', code: 'unauthenticated' });

    expect(onError).toHaveBeenCalledWith('Chat threads failed to load', 'unauthenticated');
  });

  it('falls back to the documented message when the SDK message is whitespace-only, keeping the code', () => {
    const onError = vi.fn<ErrorCallback>();
    chatService.subscribeToThreads('usr_1', 'branch_owner' as UserRole, [], vi.fn(), onError);

    // Whitespace is truthy but visually blank: it must not become the error copy.
    fireLastSnapshotError({ message: ' \t ', code: 'permission-denied' });

    expect(onError).toHaveBeenCalledWith('Chat threads failed to load', 'permission-denied');
  });

  it('still calls a legacy one-argument handler without requiring the code', () => {
    const legacyCalls: string[] = [];
    const legacyHandler = (message: string) => {
      legacyCalls.push(message);
    };

    chatService.subscribeToThreads('usr_1', 'branch_owner' as UserRole, [], vi.fn(), legacyHandler);

    fireLastSnapshotError({ message: 'listener died' });

    expect(legacyCalls).toEqual(['listener died']);
  });

  it('returns the real onSnapshot unsubscribe identity', () => {
    const unsubscribe = chatService.subscribeToThreads(
      'usr_1',
      'branch_owner' as UserRole,
      [],
      vi.fn(),
      vi.fn()
    );

    expect(firestore.onSnapshot).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toBe(unsubscribes[0]);
    unsubscribe();
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
  });

  it('keeps the branch-scoped query bounded and scoped to the caller', () => {
    chatService.subscribeToThreads(
      'usr_branch_op',
      'branch_owner' as UserRole,
      ['branch_surat_01'],
      vi.fn(),
      vi.fn()
    );

    expect(firestore.where).toHaveBeenCalledWith('participantIds', 'array-contains', 'usr_branch_op');
    expect(firestore.limit).toHaveBeenCalledWith(50);
    expect(firestore.orderBy).not.toHaveBeenCalled();
  });

  it('keeps the brand-role query ordered and bounded', () => {
    chatService.subscribeToThreads('usr_brand', 'brand_owner' as UserRole, [], vi.fn(), vi.fn());

    expect(firestore.orderBy).toHaveBeenCalledWith('lastMessageAt', 'desc');
    expect(firestore.limit).toHaveBeenCalledWith(30);
    expect(firestore.where).not.toHaveBeenCalled();
  });

  it('delivers a real snapshot through the success handler', () => {
    const onThreads = vi.fn<ThreadsCallback>();
    const onError = vi.fn<ErrorCallback>();

    chatService.subscribeToThreads('usr_1', 'branch_owner' as UserRole, [], onThreads, onError);

    fireLastSnapshotData([
      {
        type: 'branch_channel',
        title: 'Surat Operations',
        participantIds: [],
        participantNames: {},
        createdAt: { toMillis: () => 0 },
      },
    ]);

    expect(onThreads).toHaveBeenCalledTimes(1);
    expect(onThreads.mock.calls[0][0].map((t) => t.title)).toEqual(['Surat Operations']);
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('chatService.subscribeToMessages error-code forwarding', () => {
  it('forwards the exact SDK message and code to the error handler', () => {
    const onMessages = vi.fn<MessagesCallback>();
    const onError = vi.fn<ErrorCallback>();

    chatService.subscribeToMessages('thread_a', onMessages, onError);

    fireLastSnapshotError({ message: 'opaque denial text', code: 'permission-denied' });

    expect(onError).toHaveBeenCalledWith('opaque denial text', 'permission-denied');
    expect(onMessages).not.toHaveBeenCalled();
  });

  it('falls back to the documented message when blank, keeping the code', () => {
    const onError = vi.fn<ErrorCallback>();
    chatService.subscribeToMessages('thread_a', vi.fn(), onError);

    fireLastSnapshotError({ message: '', code: 'unauthenticated' });

    expect(onError).toHaveBeenCalledWith('Messages failed to load', 'unauthenticated');
  });

  it('falls back to the documented message when whitespace-only, keeping the code', () => {
    const onError = vi.fn<ErrorCallback>();
    chatService.subscribeToMessages('thread_a', vi.fn(), onError);

    fireLastSnapshotError({ message: ' \t ', code: 'permission-denied' });

    expect(onError).toHaveBeenCalledWith('Messages failed to load', 'permission-denied');
  });

  it('keeps the message listener bounded to the latest 50, oldest-first', () => {
    chatService.subscribeToMessages('thread_a', vi.fn(), vi.fn());

    expect(firestore.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(firestore.limit).toHaveBeenCalledWith(50);
  });

  it('reverses the descending snapshot back to oldest-first for the UI', () => {
    const onMessages = vi.fn<MessagesCallback>();
    chatService.subscribeToMessages('thread_a', onMessages, vi.fn());

    fireLastSnapshotData([
      { text: 'newest', senderId: 'u', senderName: 'U', senderRole: 'branch_owner', chatId: 'thread_a' },
      { text: 'oldest', senderId: 'u', senderName: 'U', senderRole: 'branch_owner', chatId: 'thread_a' },
    ]);

    expect(onMessages).toHaveBeenCalledTimes(1);
    expect(onMessages.mock.calls[0][0].map((m) => m.text)).toEqual(['oldest', 'newest']);
  });

  it('never reaches for a write API', () => {
    chatService.subscribeToMessages('thread_a', vi.fn(), vi.fn());
    chatService.subscribeToThreads('usr_1', 'branch_owner' as UserRole, [], vi.fn(), vi.fn());

    expect(firestore.addDoc).not.toHaveBeenCalled();
    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(firestore.updateDoc).not.toHaveBeenCalled();
    expect(firestore.getDocs).not.toHaveBeenCalled();
  });
});

describe('chatService malformed SDK error metadata', () => {
  /** Both feeds must behave identically for each malformed input. */
  const feeds = [
    {
      label: 'threads',
      fallback: 'Chat threads failed to load',
      subscribe: (onError: (message: string, code?: string) => void) =>
        chatService.subscribeToThreads('usr_1', 'branch_owner' as UserRole, [], vi.fn(), onError),
    },
    {
      label: 'messages',
      fallback: 'Messages failed to load',
      subscribe: (onError: (message: string, code?: string) => void) =>
        chatService.subscribeToMessages('thread_a', vi.fn(), onError),
    },
  ];

  it.each(feeds)(
    'keeps the exact message and reports no code for a numeric $label code',
    ({ subscribe }) => {
      const onError = vi.fn<ErrorCallback>();
      subscribe(onError);

      // A numeric code is not a string: it must not be forwarded, and it must
      // NOT degrade a perfectly good message into the fallback.
      fireLastSnapshotError({ message: 'real failure text', code: 500 });

      expect(onError).toHaveBeenCalledWith('real failure text', undefined);
    }
  );

  it.each(feeds)('reports no code for a whitespace-only $label code', ({ subscribe }) => {
    const onError = vi.fn<ErrorCallback>();
    subscribe(onError);

    fireLastSnapshotError({ message: 'real failure text', code: '   ' });

    expect(onError).toHaveBeenCalledWith('real failure text', undefined);
  });

  it.each(feeds)('falls back for a null $label error', ({ subscribe, fallback }) => {
    const onError = vi.fn<ErrorCallback>();
    subscribe(onError);

    fireLastSnapshotError(null);

    expect(onError).toHaveBeenCalledWith(fallback, undefined);
  });

  it.each(feeds)('falls back for an undefined $label error', ({ subscribe, fallback }) => {
    const onError = vi.fn<ErrorCallback>();
    subscribe(onError);

    fireLastSnapshotError(undefined);

    expect(onError).toHaveBeenCalledWith(fallback, undefined);
  });

  it.each(feeds)('falls back for a bare string $label error', ({ subscribe, fallback }) => {
    const onError = vi.fn<ErrorCallback>();
    subscribe(onError);

    // A thrown string has no `.message`; it must not become the copy verbatim.
    fireLastSnapshotError('boom');

    expect(onError).toHaveBeenCalledWith(fallback, undefined);
  });

  it.each(feeds)('forwards padded message and code unchanged for $label', ({ subscribe }) => {
    const onError = vi.fn<ErrorCallback>();
    subscribe(onError);

    fireLastSnapshotError({ message: '  padded failure  ', code: ' permission-denied ' });

    // Neither value is trimmed by the boundary: presence is tested, payload is not.
    expect(onError).toHaveBeenCalledWith('  padded failure  ', ' permission-denied ');
  });

  it.each(feeds)('emits no data for a malformed $label error', ({ subscribe }) => {
    const onThreads = vi.fn<ThreadsCallback>();
    const onMessages = vi.fn<MessagesCallback>();
    const onError = vi.fn<ErrorCallback>();

    if (subscribe === feeds[0].subscribe) {
      chatService.subscribeToThreads('usr_1', 'branch_owner' as UserRole, [], onThreads, onError);
    } else {
      chatService.subscribeToMessages('thread_a', onMessages, onError);
    }

    fireLastSnapshotError({ message: 'x', code: 42 });

    expect(onThreads).not.toHaveBeenCalled();
    expect(onMessages).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
