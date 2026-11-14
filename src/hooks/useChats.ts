import { useState, useEffect, useCallback, useRef } from 'react';
import type { Unsubscribe } from 'firebase/firestore';
import { useAuthStore } from '@/stores/authStore';
import { chatService, SendMessageParams } from '@/services/chatService';
import type { ChatThread, ChatMessage, UserRole } from '@/types';

// Stable empty references so derived "wrong scope" values don't churn the
// identity of `messages`/`threads` on every render (auto-scroll effects depend
// on that identity).
const EMPTY_THREADS: ChatThread[] = [];
const EMPTY_MESSAGES: ChatMessage[] = [];

interface ThreadsScopeState {
  scopeKey: string | null;
  threads: ChatThread[];
  error: string | null;
  loading: boolean;
}

interface MessagesScopeState {
  userId: string | null;
  scopeKey: string | null;
  threadId: string | null;
  messages: ChatMessage[];
  error: string | null;
  loading: boolean;
  /** True only once this scope's listener delivered a snapshot. */
  synced: boolean;
}

/** What a listener was authorised to read; a change here invalidates its data. */
interface AuthScope {
  userId: string;
  role: UserRole;
  branchIds: string[];
}

function authScopeKey(scope: AuthScope | null): string | null {
  if (!scope) return null;
  return `${scope.userId}|${scope.role}|${scope.branchIds.join('|')}`;
}

/**
 * Authorisation failures are not staleness: a denied read must not keep
 * privileged rows on screen as "last good". Firestore reports these as
 * "Missing or insufficient permissions" (permission-denied) or unauthenticated.
 *
 * A missing index / failed-precondition is a deployment fault, NOT a denial:
 * it must keep the last good data behind a stale notice like any other error.
 *
 * When the SDK supplies a code, the CODE is authoritative — the message may be
 * opaque, localised, or misleadingly say "permission-denied". Only when no code
 * is available does the legacy message heuristic apply.
 */
function isAuthorisationError(message: string, code?: string): boolean {
  // A whitespace-only code carries no information: treat it as absent and fall
  // through to the legacy message heuristic.
  if (code && code.trim().length > 0) {
    // Non-denial codes win even over a denial-sounding message.
    if (/failed-precondition|requires an index|missing index/i.test(code)) return false;
    if (/^unavailable$/i.test(code)) return false;
    return /permission-denied|unauthenticated/i.test(code);
  }
  if (/failed-precondition|requires an index|missing index/i.test(message)) return false;
  return /permission-denied|insufficient permissions|unauthenticated/i.test(message);
}

/** The SDK `error.code` from an unknown thrown value, without casting. */
function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (typeof code === 'string' && code.trim().length > 0) return code;
  }
  return undefined;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.trim().length > 0) return message;
  }
  return fallback;
}

export function useChats() {
  const { user } = useAuthStore();
  const scope: AuthScope | null = user
    ? { userId: user.id, role: user.role, branchIds: user.branchIds || [] }
    : null;
  const scopeKey = authScopeKey(scope);
  const scopeUserId = scope?.userId ?? null;
  // Latest scope for the listener effects. Effects key on scopeKey (a string),
  // so an equal-but-fresh user object never churns the subscriptions, while
  // the closures still see the current role/branch values.
  const scopeRef = useRef<AuthScope | null>(scope);
  scopeRef.current = scope;
  const scopeKeyRef = useRef<string | null>(scopeKey);
  scopeKeyRef.current = scopeKey;
  const scopedThreadIdRef = useRef<string | null>(null);

  const [threadsState, setThreadsState] = useState<ThreadsScopeState>({
    scopeKey: null,
    threads: EMPTY_THREADS,
    error: null,
    loading: true,
  });
  // A selection is scope-tagged so a direct A→B switch or an authorisation
  // narrowing cannot render the previous scope's room for a commit.
  const [selection, setSelection] = useState<{ scopeKey: string; threadId: string } | null>(
    null
  );
  const [messagesState, setMessagesState] = useState<MessagesScopeState>({
    userId: null,
    scopeKey: null,
    threadId: null,
    messages: EMPTY_MESSAGES,
    error: null,
    loading: false,
    synced: false,
  });
  // Retry is a resubscription, never a re-send: bumping these tokens re-runs
  // the listener effect and leaves last good data on screen until a snapshot
  // proves the stream is healthy again.
  const [threadsRetryToken, setThreadsRetryToken] = useState(0);
  const [messagesRetryToken, setMessagesRetryToken] = useState(0);
  // Pending retries are OWNED: tagged with the scope (and, for messages, the
  // room) that started them. A pending retry from another scope or room is
  // fenced out at render, so an old messages retry can never appear on the
  // first frame of a new room, and a rooms retry is never cleared by a switch.
  const [threadsRetryPending, setThreadsRetryPending] = useState<{ scopeKey: string } | null>(
    null
  );
  const [messagesRetryPending, setMessagesRetryPending] = useState<{
    scopeKey: string;
    threadId: string;
  } | null>(null);

  // Scope fenced at render time, not in an effect: a user or authorisation
  // change must never paint one frame of the previous scope's data.
  const threadsScopeMatches = scopeKey !== null && threadsState.scopeKey === scopeKey;
  const threads = threadsScopeMatches ? threadsState.threads : EMPTY_THREADS;
  const threadsError = threadsScopeMatches ? threadsState.error : null;
  const loadingThreads = scope ? !threadsScopeMatches || threadsState.loading : false;

  const scopedThreadId =
    scope && selection && selection.scopeKey === scopeKey ? selection.threadId : null;
  const messageScopeMatches =
    !!scopedThreadId &&
    messagesState.userId === scopeUserId &&
    messagesState.scopeKey === scopeKey &&
    messagesState.threadId === scopedThreadId;
  const messages = messageScopeMatches ? messagesState.messages : EMPTY_MESSAGES;
  const messagesError = messageScopeMatches ? messagesState.error : null;
  const loadingMessages = !!scopedThreadId && (!messageScopeMatches || messagesState.loading);
  /** The current thread's stream delivered data and has not errored since. */
  const messagesSynced = messageScopeMatches && messagesState.synced && !messagesState.error;

  // Per-feed pending, fenced to the current scope (and room for messages).
  const retryingThreads =
    scopeKey !== null && threadsRetryPending?.scopeKey === scopeKey;
  const retryingMessages =
    scopeKey !== null &&
    scopedThreadId !== null &&
    messagesRetryPending?.scopeKey === scopeKey &&
    messagesRetryPending?.threadId === scopedThreadId;
  /** Kept for compatibility with aggregate-only consumers. */
  const retrying = retryingThreads || retryingMessages;
  // Latest fenced room for the imperative retry starter, which must not read
  // a captured value from an older render.
  scopedThreadIdRef.current = scopedThreadId;

  const setActiveThreadId = useCallback((threadId: string | null) => {
    if (threadId === null) {
      setSelection(null);
      return;
    }
    // Scope-tag at the moment of selection, so the very next render already
    // fences it and a mode change (channel/DM open) cannot be lost.
    const currentScopeKey = scopeKeyRef.current;
    if (!currentScopeKey) return;
    setSelection({ scopeKey: currentScopeKey, threadId });
  }, []);

  // Scope change wipes every scope: no list, selection or message from the
  // previous identity OR previous authorisation may survive. Keyed on the
  // scope key (id + role + branch list), so a narrowing role cannot leave
  // privileged data on screen, while a mere re-render cannot churn it.
  useEffect(() => {
    setThreadsState({
      scopeKey,
      threads: EMPTY_THREADS,
      error: null,
      loading: scopeKey !== null,
    });
    setSelection(null);
    setMessagesState({
      userId: scopeUserId,
      scopeKey,
      threadId: null,
      messages: EMPTY_MESSAGES,
      error: null,
      loading: false,
      synced: false,
    });
    setThreadsRetryPending(null);
    setMessagesRetryPending(null);
  }, [scopeKey, scopeUserId]);

  // Subscribe to threads
  useEffect(() => {
    if (!scopeKey) return;
    const activeScope = scopeRef.current;
    if (!activeScope) return;
    const listener = { cancelled: false };
    let unsubscribe: Unsubscribe | undefined;

    try {
      unsubscribe = chatService.subscribeToThreads(
        activeScope.userId,
        activeScope.role,
        activeScope.branchIds,
        (fetchedThreads) => {
          if (listener.cancelled) return;
          setThreadsState({
            scopeKey,
            threads: fetchedThreads,
            error: null,
            loading: false,
          });
          // Only the threads retry may be ended here; a messages retry in
          // flight belongs to the other listener.
          setThreadsRetryPending(null);

          // Functional update: never auto-select from a captured initial null.
          // An explicit selection always wins and is never forced to change.
          const firstThreadId = fetchedThreads[0]?.id ?? null;
          if (firstThreadId) {
            setSelection((current) => current ?? { scopeKey, threadId: firstThreadId });
          }
        },
        (message, code) => {
          if (listener.cancelled) return;
          setThreadsRetryPending(null);
          // A blank OR whitespace-only async message must still leave a
          // visible, non-empty error; a meaningful message stays untrimmed.
          const shown =
            message.trim().length > 0 ? message : 'Chat threads failed to load';
          // Listener death is not an empty list. A permission failure is not
          // staleness though: drop the retained list instead of showing it.
          setThreadsState((previous) => {
            if (previous.scopeKey !== scopeKey) return previous;
            return isAuthorisationError(shown, code)
              ? { ...previous, threads: EMPTY_THREADS, error: shown, loading: false }
              : { ...previous, error: shown, loading: false };
          });
        }
      );
    } catch (error) {
      const message = errorMessage(error, 'Chat threads failed to load');
      const code = errorCode(error);
      if (!listener.cancelled) {
        // A synchronous failure must not masquerade as an empty hub: keep the
        // last good list for this same scope and surface the error.
        setThreadsState((previous) =>
          previous.scopeKey === scopeKey
            ? {
                ...previous,
                threads: isAuthorisationError(message, code) ? EMPTY_THREADS : previous.threads,
                error: message,
                loading: false,
              }
            : {
                scopeKey,
                threads: EMPTY_THREADS,
                error: message,
                loading: false,
              }
        );
        setThreadsRetryPending(null);
      }
    }

    return () => {
      listener.cancelled = true;
      unsubscribe?.();
    };
  }, [scopeKey, threadsRetryToken]);

  // A messages retry belongs to the room that started it. Abandoning that room
  // (switching rooms, or the selection going to null) abandons the retry, so
  // returning to the same room later must not show a pending retry that is no
  // longer in flight. This deliberately depends on scope/room only — NOT on
  // messagesRetryToken — so a retry that was just started is never cleared.
  useEffect(() => {
    setMessagesRetryPending(null);
  }, [scopeKey, scopedThreadId]);

  // Subscribe to active thread messages
  useEffect(() => {
    if (!scopeKey || !scopedThreadId) return;
    const activeScope = scopeRef.current;
    if (!activeScope) return;
    const threadId = scopedThreadId;

    const listener = { cancelled: false };
    let unsubscribe: Unsubscribe | undefined;

    // First attach for this thread starts the loader. A retry keeps the last
    // good messages and the error visible until a snapshot proves recovery.
    setMessagesState((previous) =>
      previous.userId === activeScope.userId &&
      previous.scopeKey === scopeKey &&
      previous.threadId === threadId
        ? previous
        : {
            userId: activeScope.userId,
            scopeKey,
            threadId,
            messages: EMPTY_MESSAGES,
            error: null,
            loading: true,
            synced: false,
          }
    );

    try {
      unsubscribe = chatService.subscribeToMessages(
        threadId,
        (newMessages) => {
          if (listener.cancelled) return;
          setMessagesState({
            userId: activeScope.userId,
            scopeKey,
            threadId,
            messages: newMessages,
            error: null,
            loading: false,
            synced: true,
          });
          setMessagesRetryPending(null);
        },
        (message, code) => {
          if (listener.cancelled) return;
          setMessagesRetryPending(null);
          // A blank OR whitespace-only async message must still leave a
          // visible, non-empty error; a meaningful message stays untrimmed.
          const shown = message.trim().length > 0 ? message : 'Messages failed to load';
          setMessagesState((previous) => {
            if (previous.scopeKey !== scopeKey || previous.threadId !== threadId) return previous;
            // Denied reads drop the privileged rows; other failures keep them
            // with an honest stale notice.
            return isAuthorisationError(shown, code)
              ? {
                  ...previous,
                  messages: EMPTY_MESSAGES,
                  error: shown,
                  loading: false,
                  synced: false,
                }
              : { ...previous, error: shown, loading: false };
          });
        }
      );
    } catch (error) {
      const message = errorMessage(error, 'Messages failed to load');
      const code = errorCode(error);
      if (!listener.cancelled) {
        setMessagesState((previous) =>
          previous.scopeKey === scopeKey && previous.threadId === threadId
            ? {
                ...previous,
                messages: isAuthorisationError(message, code) ? EMPTY_MESSAGES : previous.messages,
                error: message,
                loading: false,
                synced: false,
              }
            : previous
        );
        setMessagesRetryPending(null);
      }
    }

    return () => {
      listener.cancelled = true;
      unsubscribe?.();
    };
  }, [scopeKey, scopedThreadId, messagesRetryToken]);

  const retryThreads = useCallback(() => {
    // Owned by the scope that starts it, so a later scope change cannot make a
    // stale pending flag appear against the new scope.
    if (scopeKeyRef.current) {
      setThreadsRetryPending({ scopeKey: scopeKeyRef.current });
    }
    setThreadsRetryToken((token) => token + 1);
  }, []);

  const retryMessages = useCallback(() => {
    const currentScopeKey = scopeKeyRef.current;
    const currentThreadId = scopedThreadIdRef.current;
    if (currentScopeKey && currentThreadId) {
      setMessagesRetryPending({ scopeKey: currentScopeKey, threadId: currentThreadId });
    }
    setMessagesRetryToken((token) => token + 1);
  }, []);

  // Latest failure/health state for the recovery handlers, so the listeners
  // never capture an old scope, error or pending flag.
  const recoveryStateRef = useRef({
    scopeKey: null as string | null,
    threadId: null as string | null,
    threadsFailed: false,
    messagesFailed: false,
    threadsPending: false,
    messagesPending: false,
  });
  recoveryStateRef.current = {
    scopeKey,
    threadId: scopedThreadId,
    threadsFailed: threadsError !== null,
    messagesFailed: messagesError !== null,
    threadsPending: retryingThreads,
    messagesPending: retryingMessages,
  };

  // Render-time snapshot of the committed retry tokens. A request is identified
  // by the token that was in force when it was issued.
  const recoveryTokensRef = useRef({ threads: threadsRetryToken, messages: messagesRetryToken });
  recoveryTokensRef.current = { threads: threadsRetryToken, messages: messagesRetryToken };

  // Synchronous latches, keyed to the retry TOKEN each request was issued
  // against. State updates are async, so several hints arriving in the same
  // tick would all still read "not pending" and each request a retry. A latch
  // therefore records the token it requested against, and blocks only while
  // that token is still the current one — i.e. only until the request it made
  // has actually rendered. A request that settles, or is retired by a room
  // switch, inside the same batch cannot wedge the latch, and nothing here is
  // mutated during render.
  const recoveryRequestedRef = useRef<{ threads: number | null; messages: number | null }>({
    threads: null,
    messages: null,
  });

  /**
   * Foreground recovery: an external browser hint may ask a FAILED feed to
   * resubscribe. A hint is a liveness nudge, never a health claim — it does not
   * clear last good data, the stale notice or `synced`; only the feed's own
   * snapshot does that. Automatic hints never stack on a manual retry, never
   * touch the healthy feed, and never fire while offline or hidden.
   */
  useEffect(() => {
    if (!scopeKey) return;

    const maybeRecover = () => {
      const current = recoveryStateRef.current;
      if (!current.scopeKey) return;
      // Only a real, connected, visible page may ask for a resubscription.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      const latch = recoveryRequestedRef.current;
      const tokens = recoveryTokensRef.current;
      // Each feed is independent, and a feed already in flight (or already
      // asked for while that request has not yet rendered) is not stacked. The
      // latch is clear once the token it recorded has been superseded, so a
      // request that settled inside the same batch cannot wedge it.
      const threadsLatchClear = latch.threads !== tokens.threads;
      if (current.threadsFailed && !current.threadsPending && threadsLatchClear) {
        latch.threads = tokens.threads;
        retryThreads();
      }
      const messagesLatchClear = latch.messages !== tokens.messages;
      if (
        current.messagesFailed &&
        !current.messagesPending &&
        current.threadId &&
        messagesLatchClear
      ) {
        latch.messages = tokens.messages;
        retryMessages();
      }
    };

    const onFocus = () => maybeRecover();
    const onOnline = () => maybeRecover();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') maybeRecover();
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [scopeKey, retryThreads, retryMessages]);

  const sendMessage = async (
    text: string,
    options?: {
      imageUrl?: string;
      orderReference?: {
        orderId: string;
        customerName: string;
        total: number;
        status: string;
      };
      ticketReference?: {
        ticketId: string;
        title: string;
        priority: string;
      };
    }
  ) => {
    if (!user || !scopedThreadId || (!text.trim() && !options?.imageUrl && !options?.orderReference && !options?.ticketReference))
      return;

    // The producer's owner is the scope/room THIS callback closed over at
    // render time. Compare it against the LATEST committed values, so a stale
    // callback is refused before any I/O — and so a current callback is never
    // admitted by comparing a value with itself.
    const producerScopeKey = scopeKey;
    const producerThreadId = scopedThreadId;
    if (producerScopeKey !== scopeKeyRef.current) return;
    if (producerThreadId !== scopedThreadIdRef.current) return;

    const currentThread = threads.find((t) => t.id === scopedThreadId);

    await chatService.sendMessage({
      chatId: scopedThreadId,
      senderId: user.id,
      senderName: user.name || 'Staff Member',
      senderRole: user.role,
      text: text.trim(),
      imageUrl: options?.imageUrl,
      orderReference: options?.orderReference,
      ticketReference: options?.ticketReference,
      threadInfo: currentThread
        ? {
            type: currentThread.type,
            title: currentThread.title,
            branchId: currentThread.branchId,
            branchName: currentThread.branchName,
            participantIds: currentThread.participantIds,
            participantNames: currentThread.participantNames,
          }
        : undefined,
    });
  };

  const createOrOpenBranchChannel = async (branchId: string, branchName: string) => {
    const chatId = `channel_${branchId}`;
    setActiveThreadId(chatId);
    if (user) {
      chatService
        .getOrCreateBranchChannel(branchId, branchName, {
          id: user.id,
          name: user.name || 'Branch Operator',
        })
        .catch((err) => console.warn('Background channel setup:', err));
    }
    return chatId;
  };

  const createOrOpenDirectDm = async (targetUser: { id: string; name: string }) => {
    if (!user) return;
    const sortedIds = [user.id, targetUser.id].sort();
    const chatId = `dm_${sortedIds[0]}_${sortedIds[1]}`;
    setActiveThreadId(chatId);
    chatService
      .getOrCreateDirectDm({ id: user.id, name: user.name || 'User' }, targetUser)
      .catch((err) => console.warn('Background DM setup:', err));
    return chatId;
  };

  return {
    threads,
    activeThreadId: scopedThreadId,
    setActiveThreadId,
    activeThread: threadsScopeMatches
      ? threads.find((t) => t.id === scopedThreadId)
      : undefined,
    messages,
    loadingThreads,
    loadingMessages,
    messagesSynced,
    threadsError,
    messagesError,
    /**
     * The hook's OWN auth-scope key. Exported additively so callers (the page)
     * consume exactly this value instead of recomputing a duplicate identity.
     */
    authorizationScopeKey: scopeKey,
    retrying,
    retryingThreads,
    retryingMessages,
    retryThreads,
    retryMessages,
    sendMessage,
    createOrOpenBranchChannel,
    createOrOpenDirectDm,
  };
}
