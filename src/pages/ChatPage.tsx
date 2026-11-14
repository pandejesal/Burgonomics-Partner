import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { useChats } from '@/hooks/useChats';
import { useBranches } from '@/hooks/useBranches';
import { useAuthStore } from '@/stores/authStore';
import { AttachReferenceModal } from '@/components/chat/AttachReferenceModal';
import { useOnlineStatus } from '@/components/ui/OfflineBanner';
import {
  MessageSquare,
  Send,
  Hash,
  User,
  Users,
  Search,
  Plus,
  ArrowLeft,
  Store,
  Paperclip,
  X,
  ShoppingBag,
  LifeBuoy,
  ExternalLink,
  ChefHat,
  ShieldCheck,
} from 'lucide-react';
import type { UserRole, ChatThread, Order, Ticket } from '@/types';

/** Who a draft belongs to: one operator, one authorisation scope, one room. */
interface ComposerOwner {
  userId: string | null;
  /** The hook's OWN auth-scope key (role + branches). Never page-derived. */
  authScopeKey: string | null;
  threadId: string | null;
}

interface ComposerDraft {
  owner: ComposerOwner;
  text: string;
  order: Order | null;
  ticket: Ticket | null;
  attachOpen: boolean;
}

const EMPTY_DRAFT: Omit<ComposerDraft, 'owner'> = {
  text: '',
  order: null,
  ticket: null,
  attachOpen: false,
};

export const ChatPage: React.FC = () => {
  const { user } = useAuthStore();
  const {
    threads,
    activeThreadId,
    setActiveThreadId,
    activeThread,
    messages,
    loadingThreads,
    loadingMessages,
    messagesSynced,
    retryingThreads,
    retryingMessages,
    authorizationScopeKey,
    threadsError,
    messagesError,
    retryThreads,
    retryMessages,
    sendMessage,
    createOrOpenBranchChannel,
    createOrOpenDirectDm,
  } = useChats();
  const online = useOnlineStatus();
  const { branches } = useBranches();

  const myBranches = branches.filter((b) => !!user?.branchIds?.includes(b.id));
  const homeBranch = branches.find((b) => b.id === user?.branchIds?.[0]);

  const threadLabel = (t: ChatThread) =>
    t.title || (t.type === 'branch_channel' ? 'Branch channel' : 'Direct message');

  const [activeTab, setActiveTab] = useState<'channels' | 'direct'>('channels');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileList, setShowMobileList] = useState(true);

  // One composer draft, owned by (uid, actual room). A draft typed in room A
  // must never render — or be sendable — under room B or another operator.
  const [composerDraft, setComposerDraft] = useState<ComposerDraft>(() => ({
    owner: {
      userId: user?.id ?? null,
      authScopeKey: authorizationScopeKey ?? null,
      threadId: activeThreadId ?? null,
    },
    ...EMPTY_DRAFT,
  }));

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const composerOwner: ComposerOwner = {
    userId: user?.id ?? null,
    authScopeKey: authorizationScopeKey ?? null,
    threadId: activeThreadId ?? null,
  };

  // The owner that actually took effect on screen. Writers compare against this
  // (not against the owner they happened to close over) so a callback captured
  // under a previous owner is rejected rather than rebinding the live draft.
  // Updated in a layout effect — never during render.
  const committedOwnerRef = useRef<ComposerOwner>(composerOwner);
  useLayoutEffect(() => {
    committedOwnerRef.current = {
      userId: user?.id ?? null,
      authScopeKey: authorizationScopeKey ?? null,
      threadId: activeThreadId ?? null,
    };
  });

  // FENCED at render: anything whose owner is not the current (uid, scope,
  // room) is foreign and displays as empty. This is the security boundary — an
  // effect alone would let old room A's draft commit into the first room B frame.
  const draftOwned =
    composerDraft.owner.userId === composerOwner.userId &&
    composerDraft.owner.authScopeKey === composerOwner.authScopeKey &&
    composerDraft.owner.threadId === composerOwner.threadId;
  const inputMessage = draftOwned ? composerDraft.text : '';
  const attachedOrder = draftOwned ? composerDraft.order : null;
  const attachedTicket = draftOwned ? composerDraft.ticket : null;
  const attachModalOpen = draftOwned ? composerDraft.attachOpen : false;

  // Retention/cleanup, NOT the security boundary: the render fence decides what
  // may be displayed and the writer guard decides what may be written. This
  // effect does actively clear a different owner's bytes after commit, and
  // adopts the current owner. A transient null room keeps the stored draft (and
  // its room tag) only within the SAME operator AND the SAME auth scope;
  // nothing is shown while the room is null.
  useEffect(() => {
    setComposerDraft((previous) => {
      const sameUser = previous.owner.userId === (user?.id ?? null);
      const sameScope =
        previous.owner.authScopeKey === (authorizationScopeKey ?? null);
      const sameThread = previous.owner.threadId === (activeThreadId ?? null);
      if (sameUser && sameScope && sameThread) return previous;
      const transientNull = activeThreadId === null && sameUser && sameScope;
      if (transientNull) {
        // Same operator and scope, room momentarily unset: keep the stored draft
        // AND its room tag so returning to that room restores it. Nothing is
        // displayed while the room is null, so this is not a leak.
        return previous;
      }
      return { owner: composerOwner, ...EMPTY_DRAFT };
    });
  }, [user?.id, authorizationScopeKey, activeThreadId]);

  const displayThread =
    activeThread ||
    (activeThreadId
      ? ({
          id: activeThreadId,
          type: activeThreadId.startsWith('channel_') ? 'branch_channel' : 'direct_dm',
          title: activeThreadId.startsWith('channel_') ? 'Branch channel' : 'Direct message',
          participantIds: [],
          participantNames: {},
          createdAt: { toDate: () => new Date() } as any,
        } as ChatThread)
      : null);

  // Only claim "live" when the device is online, this thread's stream has
  // delivered a snapshot, and it has not errored since. A quiet onSnapshot
  // never reports network loss, so the online signal is the only evidence.
  const channelLive = online && messagesSynced && !messagesError;
  // A dead listener is not a network problem: permission and index failures
  // arrive with the device still online.
  const streamLabel = channelLive
    ? 'Live Channel'
    : !online
    ? 'Offline'
    : messagesError
    ? 'Disconnected'
    : 'Connecting…';
  const streamTone = channelLive ? 'text-emerald-400' : 'text-amber-300';
  const streamDot = channelLive ? 'bg-emerald-500' : 'bg-amber-500';
  const showRetry = !channelLive && !loadingMessages;

  // Phone pane rule: with no room there is nothing to show on the chat side, so
  // the rooms list must stay reachable (error or empty) instead of leaving a
  // bare "Select a conversation" with the back button gone. Desktop `md:flex`
  // still shows both panes.
  const listPaneVisible = showMobileList || !displayThread;

  // Persist the "return to the list" intent across a forced clear. When the
  // selection is dropped to null we cannot know which room the hook will
  // auto-select next, so the list (not an operator-chosen room) is what the
  // phone should land on. A real row tap still sets the flag back to false, so
  // deliberate navigation keeps working; ordinary re-renders in the same room
  // never touch this state.
  useEffect(() => {
    if (activeThreadId === null) setShowMobileList(true);
  }, [activeThreadId]);

  // On recovery, return focus to the composer only when this retry still owns
  // focus and the operator has not moved it. Ownership is tracked on the retry
  // button node itself (identity, not text) while the request is pending, so
  // the control unmounting on success cannot erase the decision.
  const composerRef = useRef<HTMLInputElement>(null);
  /** The real stream Retry button, so an automatically started attempt can adopt focus. */
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  /** Scope the pending retry belongs to; a stale retry must not focus a new user. */
  const focusOwnerRef = useRef<{
    scopeId: string;
    authScopeKey: string | null;
    threadId: string | null;
  } | null>(null);
  const retryFocusHad = useRef(false);
  /** True once THIS attempt's focus ownership was claimed (by click or adoption). */
  const retryFocusClaimedRef = useRef(false);
  const wasRetryingRef = useRef(false);
  const detachFocusWatchRef = useRef<(() => void) | null>(null);

  const beginRetryFocus = (scopeId: string, threadId: string | null, button: Element | null) => {
    detachFocusWatchRef.current?.();
    detachFocusWatchRef.current = null;
    focusOwnerRef.current = { scopeId, authScopeKey: authorizationScopeKey ?? null, threadId };
    retryFocusHad.current = false;
    retryFocusClaimedRef.current = true;
    if (button instanceof HTMLButtonElement && document.activeElement === button) {
      retryFocusHad.current = true;
      // Any focus landing elsewhere during the pending retry releases ownership.
      const onFocusIn = (event: FocusEvent) => {
        if (event.target !== button) {
          retryFocusHad.current = false;
          detach();
        }
      };
      const detach = () => {
        document.removeEventListener('focusin', onFocusIn, true);
        detachFocusWatchRef.current = null;
      };
      document.addEventListener('focusin', onFocusIn, true);
      detachFocusWatchRef.current = detach;
    }
  };

  // Never leave the focus watch attached once the page goes away.
  useEffect(() => () => detachFocusWatchRef.current?.(), []);

  useEffect(() => {
    // Focus restoration must follow THIS feed's retry, not the aggregate: a
    // rooms retry finishing must never move focus on behalf of the stream.
    const finished = wasRetryingRef.current && !retryingMessages;
    wasRetryingRef.current = !!retryingMessages;
    if (!finished) return;

    // The pending retry is over: stop watching focus before deciding.
    detachFocusWatchRef.current?.();
    detachFocusWatchRef.current = null;

    const owner = focusOwnerRef.current;
    focusOwnerRef.current = null;
    const shouldRestore = retryFocusHad.current;
    retryFocusHad.current = false;
    retryFocusClaimedRef.current = false;
    if (!owner || !shouldRestore) return;

    // Success only: a still-failing stream must not yank focus to the composer,
    // and a delayed old retry must never focus another user's composer.
    if (!messagesSynced || messagesError) return;
    if (owner.scopeId !== (user?.id ?? null)) return;
    // A stale retry from a previous authorisation scope must never focus this
    // scope's composer, even in the same room.
    if (owner.authScopeKey !== (authorizationScopeKey ?? null)) return;
    if (owner.threadId !== activeThreadId) return;
    composerRef.current?.focus();
  }, [
    retryingMessages,
    messagesSynced,
    messagesError,
    activeThreadId,
    user?.id,
    authorizationScopeKey,
  ]);

  /**
   * Automatic attempts: a foreground hint can start this feed's retry with no
   * click, so there is no `currentTarget` to hand over. If the operator was
   * resting on the real Retry button, that button's focus IS the waiting
   * intent — adopt the same ownership a click would have claimed. If focus is
   * anywhere else, nothing is claimed and focus is never stolen.
   */
  const adoptWasRetryingRef = useRef(false);
  useEffect(() => {
    const started = !adoptWasRetryingRef.current && !!retryingMessages;
    adoptWasRetryingRef.current = !!retryingMessages;
    if (!started) return;
    // A click already claimed this attempt, through the button's own handler.
    if (retryFocusClaimedRef.current) return;
    const button = retryButtonRef.current;
    if (!button || document.activeElement !== button) return;
    beginRetryFocus(user?.id ?? '', activeThreadId, button);
  }, [retryingMessages, user?.id, activeThreadId]);

  const onRetryMessages = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (retryingMessages) return;
    beginRetryFocus(user?.id ?? '', activeThreadId, event.currentTarget);
    retryMessages();
  };

  const onRetryThreads = () => {
    if (retryingThreads) return;
    retryThreads();
  };

  // Auto scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Writers ADMIT or REJECT. A callback captured under an owner that is no
  // longer committed is dropped outright and returns `previous` unchanged, so
  // it cannot rebind the live draft, overwrite fresh room B text, close B's
  // modal or re-introduce a foreign chip. The first keystroke in a genuinely
  // new room B is accepted because the committed owner is already B by then;
  // its typed value is applied to a fresh empty draft for B.
  const updateDraft = (change: (current: ComposerDraft) => ComposerDraft) => {
    const admittedOwner = composerOwner;
    setComposerDraft((previous) => {
      const committed = committedOwnerRef.current;
      // A stale callback carries an owner the committed state has moved past.
      if (
        admittedOwner.userId !== committed.userId ||
        admittedOwner.authScopeKey !== committed.authScopeKey ||
        admittedOwner.threadId !== committed.threadId
      ) {
        return previous;
      }
      // Writers require a real operator and a real room.
      if (!committed.userId || !committed.threadId) return previous;

      const sameOwner =
        previous.owner.userId === committed.userId &&
        previous.owner.authScopeKey === committed.authScopeKey &&
        previous.owner.threadId === committed.threadId;

      return change(
        sameOwner ? previous : { owner: committed, ...EMPTY_DRAFT }
      );
    });
  };

  const setInputMessage = (text: string) => updateDraft((current) => ({ ...current, text }));
  const setAttachedOrder = (order: Order | null) =>
    updateDraft((current) => ({ ...current, order, ticket: order ? null : current.ticket }));
  const setAttachedTicket = (ticket: Ticket | null) =>
    updateDraft((current) => ({ ...current, ticket, order: ticket ? null : current.order }));
  const setShowAttachModal = (attachOpen: boolean) =>
    updateDraft((current) => ({ ...current, attachOpen }));

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    // Refuse without a current owned room, operator AND authorisation scope: a
    // draft whose owner no longer matches must never be sent into whatever room
    // happens to be open.
    if (!user || !activeThreadId || !draftOwned) return;
    // A producer callback captured under an owner the committed state has moved
    // past must refuse before any payload is built or any local clear runs.
    const committed = committedOwnerRef.current;
    if (
      composerOwner.userId !== committed.userId ||
      composerOwner.authScopeKey !== committed.authScopeKey ||
      composerOwner.threadId !== committed.threadId
    ) {
      return;
    }
    if (!inputMessage.trim() && !attachedOrder && !attachedTicket) return;

    const text = inputMessage.trim() || (attachedOrder ? `Referencing Order #${attachedOrder.id.slice(-6)}` : `Referencing Ticket #${attachedTicket?.id.slice(-6)}`);
    const orderRef = attachedOrder
      ? {
          orderId: attachedOrder.id,
          customerName: attachedOrder.customerName,
          total: attachedOrder.total,
          status: attachedOrder.status,
        }
      : undefined;

    const ticketRef = attachedTicket
      ? {
          ticketId: attachedTicket.id,
          title: attachedTicket.title,
          priority: attachedTicket.priority,
        }
      : undefined;

    setInputMessage('');
    setAttachedOrder(null);
    setAttachedTicket(null);

    await sendMessage(text, {
      orderReference: orderRef,
      ticketReference: ticketRef,
    });
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'brand_owner':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-purple-950/80 text-purple-300 border border-purple-700/60 uppercase">
            👑 Brand Owner
          </span>
        );
      case 'developer':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-950/80 text-rose-300 border border-rose-700/60 uppercase">
            💻 Developer
          </span>
        );
      case 'support':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 uppercase">
            🎧 Support
          </span>
        );
      case 'regional_manager':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-950/80 text-blue-300 border border-blue-700/60 uppercase">
            🏢 Regional
          </span>
        );
      case 'branch_owner':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 uppercase">
            🏪 Branch Owner
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent/20 text-accent-light border border-accent/40 uppercase">
            👨‍🍳 Kitchen Staff
          </span>
        );
    }
  };

  const filteredThreads = threads.filter((t) => {
    const matchesTab =
      activeTab === 'channels' ? t.type === 'branch_channel' : t.type === 'direct_dm';
    const matchesSearch =
      threadLabel(t).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.branchName && t.branchName.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTab && matchesSearch;
  });

  return (
    <div className="h-[calc(100vh-8.5rem)] flex flex-col bg-[#0A0A0A] rounded-2xl border border-border overflow-hidden shadow-2xl select-none">
      {/* Top Banner / Header */}
      <div className="bg-surface px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-surface-hover text-accent-light border border-border">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wide">
              Partner Real-Time Communications Hub
            </h1>
            <p className="text-xs text-zinc-400">
              Synchronized 1:1 Direct DMs & Branch Operation Rooms · Zero external WebSockets
            </p>
          </div>
        </div>

        {/* Quick Branch Channel Opener */}
        {user?.role === 'branch_owner' && user.branchIds?.[0] && (
          <button
            onClick={() =>
              createOrOpenBranchChannel(
                user.branchIds[0],
                homeBranch?.name ?? 'Branch room'
              )
            }
            className="hidden sm:inline-flex items-center px-3.5 py-2 text-xs font-bold rounded-xl bg-accent hover:bg-accent-hover text-white transition-colors shadow-md cursor-pointer"
          >
            <Store className="w-4 h-4 mr-1.5" />
            <span>Open Branch Room</span>
          </button>
        )}
      </div>

      {/* Main Splitter */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Thread List */}
        <div
          className={`${
            listPaneVisible ? 'flex' : 'hidden'
          } md:flex flex-col w-full md:w-80 lg:w-96 border-r border-border bg-[#0E1E12]`}
        >
          {/* Channel / DM Tabs */}
          <div className="p-3 border-b border-border space-y-3">
            <div className="grid grid-cols-2 p-1 bg-bg rounded-xl border border-border text-xs font-bold">
              <button
                onClick={() => setActiveTab('channels')}
                className={`py-1.5 rounded-lg transition-colors flex items-center justify-center space-x-1.5 cursor-pointer ${
                  activeTab === 'channels'
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Hash className="w-3.5 h-3.5" />
                <span>Branch Rooms</span>
              </button>
              <button
                onClick={() => setActiveTab('direct')}
                className={`py-1.5 rounded-lg transition-colors flex items-center justify-center space-x-1.5 cursor-pointer ${
                  activeTab === 'direct'
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Direct DMs</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search rooms or team members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-bg border border-border rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Threads List */}
          <div className="flex-1 overflow-y-auto">
            {threadsError && !loadingThreads && (
              <div
                role="alert"
                className="p-4 space-y-3 border-b border-amber-800/60 bg-amber-950/30"
              >
                <p className="text-xs font-bold text-amber-300">Rooms could not be refreshed.</p>
                <p className="text-[11px] text-zinc-300 leading-relaxed break-words">
                  {threadsError}
                </p>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  {threads.length > 0
                    ? 'The rooms listed below are the last ones received and may be out of date.'
                    : 'No rooms were returned for your access scope.'}
                </p>
                <button
                  type="button"
                  onClick={onRetryThreads}
                  aria-disabled={retryingThreads}
                  className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] text-xs font-bold rounded-xl bg-surface hover:bg-surface-hover border border-border text-white transition-colors cursor-pointer aria-disabled:opacity-60"
                >
                  {retryingThreads ? 'Retrying…' : 'Retry'}
                </button>
              </div>
            )}
            <div className="divide-y divide-[#1A3320]">
              {loadingThreads ? (
                <div className="p-8 text-center text-xs text-zinc-500">Loading rooms...</div>
              ) : threadsError && filteredThreads.length === 0 ? (
                // The banner above already explains the failure; a second
                // "no conversations" claim would contradict it.
                null
              ) : filteredThreads.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-xs text-zinc-400">No active conversations found.</p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  {activeTab === 'channels'
                    ? 'Branch channels appear when operational updates are broadcast.'
                    : 'Start a 1:1 conversation with Brand Owners, Developers or Support.'}
                </p>
                {myBranches.length > 0 && (
                  <div className="pt-2 flex flex-col space-y-2">
                    {myBranches.map((b) => (
                      <button
                        key={b.id}
                        onClick={async () => {
                          await createOrOpenBranchChannel(b.id, b.name);
                          setShowMobileList(false);
                        }}
                        className="px-3 py-2 text-xs bg-surface hover:bg-surface-hover border border-border text-zinc-200 rounded-xl text-left font-bold cursor-pointer"
                      >
                        + Open {b.name} room
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const isActive = thread.id === activeThreadId;
                return (
                  <button
                    key={thread.id}
                    onClick={() => {
                      setActiveThreadId(thread.id);
                      setShowMobileList(false);
                    }}
                    className={`w-full text-left p-3.5 transition-colors flex items-start space-x-3 cursor-pointer ${
                      isActive ? 'bg-[#16301B] border-l-4 border-l-[#D95D0F]' : 'hover:bg-[#122416]'
                    }`}
                  >
                    <div className="p-2 rounded-xl bg-surface-hover text-accent-light border border-border shrink-0 mt-0.5">
                      {thread.type === 'branch_channel' ? (
                        <Store className="w-4 h-4" />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-white truncate">
                          {threadLabel(thread)}
                        </span>
                        {thread.lastMessageAt && (
                          <span className="text-[10px] text-zinc-500 shrink-0">
                            {thread.lastMessageAt.toDate().toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 truncate">
                        {thread.lastMessageSender ? `${thread.lastMessageSender}: ` : ''}
                        {thread.lastMessageText || 'No messages yet'}
                      </p>
                    </div>
                  </button>
                );
              })
              )}
            </div>
          </div>
        </div>

        {/* Right Active Chat Box */}
        <div
          className={`${
            listPaneVisible ? 'hidden' : 'flex'
          } md:flex flex-1 flex-col min-w-0 bg-[#0A0A0A]`}
        >
          {displayThread ? (
            <>
              {/* Active Header */}
              <div className="p-3.5 bg-surface border-b border-border flex items-center justify-between gap-2">
                <div className="flex items-center space-x-3 min-w-0">
                  <button
                    type="button"
                    aria-label="Back to rooms"
                    onClick={() => setShowMobileList(true)}
                    className="md:hidden shrink-0 p-1 text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="p-2 rounded-xl bg-surface-hover text-accent-light border border-border shrink-0">
                    {displayThread.type === 'branch_channel' ? (
                      <Hash className="w-4 h-4" />
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-white flex items-center flex-wrap gap-x-2 gap-y-1 min-w-0">
                      <span className="min-w-0 break-words">{displayThread.title}</span>
                      {displayThread.branchName && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#1A351F] text-emerald-400 font-bold border border-border">
                          {displayThread.branchName}
                        </span>
                      )}
                    </h2>
                    <p className="text-[10px] text-zinc-400 truncate">
                      Real-time synchronized chat · Firestore persistence
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-xs text-zinc-400 shrink-0">
                  <span className="flex h-2 w-2 relative">
                    {channelLive && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${streamDot}`} />
                  </span>
                  {/* A dead, offline or still-connecting listener is never "live". */}
                  <span role="status" className={`font-bold text-[11px] ${streamTone}`}>
                    {streamLabel}
                  </span>
                </div>
              </div>

              {/* Stream failure: outside the scrolling region so it cannot
                  scroll out of view on a phone. */}
              {showRetry && (
                <div
                  role="alert"
                  className="px-4 py-3 border-b border-amber-800/60 bg-amber-950/30 space-y-2"
                >
                  <p className="text-xs font-bold text-amber-300">
                    {messagesError
                      ? 'Live updates for this room stopped.'
                      : !online
                      ? 'Device offline.'
                      : 'Connecting to this room…'}
                  </p>
                  {messagesError && (
                    <p className="text-[11px] text-zinc-300 leading-relaxed break-words">
                      {messagesError}
                    </p>
                  )}
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {messagesError
                      ? messages.length > 0
                        ? 'Messages below are the last ones received and may be out of date.'
                        : 'No messages could be read from this room.'
                      : !online
                      ? 'Messages below may be out of date until this device reconnects.'
                      : 'Messages will appear as soon as the connection is established.'}
                  </p>
                  <button
                    ref={retryButtonRef}
                    type="button"
                    onClick={onRetryMessages}
                    aria-disabled={retryingMessages}
                    className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] text-xs font-bold rounded-xl bg-surface hover:bg-surface-hover border border-border text-white transition-colors cursor-pointer aria-disabled:opacity-60"
                  >
                    {retryingMessages ? 'Retrying…' : 'Retry'}
                  </button>
                </div>
              )}

              {/* Messages Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingMessages ? (
                  <div className="p-8 text-center text-xs text-zinc-500">
                    Loading messages...
                  </div>
                ) : !messagesError && messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                    <div className="p-4 rounded-2xl bg-surface text-accent-light border border-border">
                      <MessageSquare className="w-8 h-8" />
                    </div>
                    <p className="text-sm font-bold text-white">Welcome to {displayThread.title}</p>
                    <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
                      Send a message below to connect with Branch staff, Brand Owners, Support, and
                      Developers in real time.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.senderId === user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-[11px] font-bold text-zinc-300">
                            {isMe ? 'You' : msg.senderName}
                          </span>
                          {getRoleBadge(msg.senderRole)}
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {msg.createdAt?.toDate
                              ? msg.createdAt.toDate().toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Just now'}
                          </span>
                        </div>

                        <div
                          className={`max-w-md lg:max-w-xl px-4 py-2.5 rounded-2xl text-xs leading-relaxed space-y-2 ${
                            isMe
                              ? 'bg-accent text-white rounded-br-none shadow-md'
                              : 'bg-surface border border-border text-zinc-200 rounded-bl-none'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.text}</p>

                          {/* Interactive Order Reference Card */}
                          {msg.orderReference && (
                            <Link
                              to={`/orders/${msg.orderReference.orderId}`}
                              className="block p-2.5 rounded-xl bg-black/40 border border-white/10 hover:border-accent transition-all text-xs group"
                            >
                              <div className="flex items-center justify-between font-bold">
                                <div className="flex items-center gap-1.5 text-amber-300">
                                  <ShoppingBag className="w-3.5 h-3.5" />
                                  <span>Order #{msg.orderReference.orderId.slice(-6).toUpperCase()}</span>
                                </div>
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-900/60 text-emerald-300 border border-emerald-700/60">
                                  {msg.orderReference.status}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-zinc-300 mt-1">
                                <span>Customer: {msg.orderReference.customerName}</span>
                                <span className="font-mono font-bold text-white">
                                  ₹{msg.orderReference.total}
                                </span>
                              </div>
                            </Link>
                          )}

                          {/* Interactive Ticket Reference Card */}
                          {msg.ticketReference && (
                            <Link
                              to={`/tickets/${msg.ticketReference.ticketId}`}
                              className="block p-2.5 rounded-xl bg-black/40 border border-white/10 hover:border-accent transition-all text-xs group"
                            >
                              <div className="flex items-center justify-between font-bold">
                                <div className="flex items-center gap-1.5 text-rose-300">
                                  <LifeBuoy className="w-3.5 h-3.5" />
                                  <span>Ticket #{msg.ticketReference.ticketId.slice(-6).toUpperCase()}</span>
                                </div>
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-900/60 text-rose-300 border border-rose-700/60 uppercase">
                                  {msg.ticketReference.priority}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-300 mt-1 truncate">
                                {msg.ticketReference.title}
                              </p>
                            </Link>
                          )}

                          {msg.imageUrl && (
                            <img
                              src={msg.imageUrl}
                              alt="attachment"
                              className="mt-2 rounded-xl max-h-48 object-cover border border-white/10"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Active Attached Chip Previews */}
              {(attachedOrder || attachedTicket) && (
                <div className="px-4 py-2 bg-[#0E1E12] border-t border-border flex items-center gap-2 text-xs">
                  <span className="text-zinc-400 text-[11px] font-bold">Attached Reference:</span>
                  {attachedOrder && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface border border-border text-amber-300">
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Order #{attachedOrder.id.slice(-6).toUpperCase()}</span>
                      <button
                        type="button"
                        aria-label="Remove attached order"
                        onClick={() => setAttachedOrder(null)}
                        className="hover:text-white ml-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {attachedTicket && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface border border-border text-rose-300">
                      <LifeBuoy className="w-3.5 h-3.5" />
                      <span>Ticket #{attachedTicket.id.slice(-6).toUpperCase()}</span>
                      <button
                        type="button"
                        aria-label="Remove attached ticket"
                        onClick={() => setAttachedTicket(null)}
                        className="hover:text-white ml-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Message Composer Bar */}
              <form
                onSubmit={handleSend}
                className="p-3 bg-surface border-t border-border flex items-center space-x-2"
              >
                <button
                  type="button"
                  onClick={() => setShowAttachModal(true)}
                  className="p-2.5 rounded-xl bg-bg hover:bg-surface-hover text-zinc-400 hover:text-white border border-border transition-colors cursor-pointer"
                  title="Attach Order or Incident Ticket Reference"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <input
                  ref={composerRef}
                  type="text"
                  placeholder={`Message ${displayThread.title}...`}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="flex-1 min-w-0 px-4 py-2.5 text-xs bg-bg border border-border rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
                />

                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={!inputMessage.trim() && !attachedOrder && !attachedTicket}
                  className="p-2.5 shrink-0 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl transition-colors shadow-md flex items-center justify-center cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-zinc-500">
              <MessageSquare className="w-12 h-12 mb-3 text-zinc-600" />
              <p className="text-sm font-bold text-zinc-400">Select a conversation</p>
              <p className="text-xs text-zinc-600">
                Choose a branch operational room or 1:1 direct message to start chatting.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Attach Reference Modal — `isOpen` is the render fence, so a modal opened
          for a previous owner is not displayed. Fencing does not stop a stale
          callback from arriving; selection is rejected by the writer guard when
          its captured owner is no longer committed. */}
      <AttachReferenceModal
        isOpen={attachModalOpen}
        onClose={() => setShowAttachModal(false)}
        onSelectOrder={(order) => {
          setAttachedOrder(order);
        }}
        onSelectTicket={(ticket) => {
          setAttachedTicket(ticket);
        }}
      />
    </div>
  );
};

export default ChatPage;
