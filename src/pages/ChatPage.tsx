import React, { useState, useRef, useEffect } from 'react';
import { useChats } from '@/hooks/useChats';
import { useAuthStore } from '@/stores/authStore';
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
  ShieldAlert,
  Code,
  LifeBuoy,
} from 'lucide-react';
import type { UserRole } from '@/types';

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
    threadsError,
    messagesError,
    sendMessage,
    createOrOpenBranchChannel,
    createOrOpenDirectDm,
  } = useChats();

  const [inputMessage, setInputMessage] = useState('');
  // A send that failed (offline or write error) keeps its text here with a
  // queued state and a retry action — never silently dropped.
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'channels' | 'direct'>('channels');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileList, setShowMobileList] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e?: { preventDefault(): void }) => {
    e?.preventDefault();
    const text = (queuedMessage ?? inputMessage).trim();
    if (!text || sending) return;
    // Clear the queued banner but hold the text until the write lands.
    setQueuedMessage(null);
    setSending(true);
    try {
      await sendMessage(text);
      setInputMessage('');
    } catch {
      // Offline or write failure: keep the text and offer retry.
      setQueuedMessage(text);
      if (!inputMessage) setInputMessage(text);
    } finally {
      setSending(false);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'brand_owner':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#D95D0F]/20 text-[#D95D0F] border border-[#D95D0F]/40">
            Brand Owner
          </span>
        );
      case 'developer':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-950 text-cyan-400 border border-cyan-800">
            Developer
          </span>
        );
      case 'support':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
            Support
          </span>
        );
      case 'regional_manager':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-950 text-indigo-400 border border-indigo-800">
            Regional
          </span>
        );
      case 'branch_owner':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-400 border border-amber-800">
            Branch Owner
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
            Staff
          </span>
        );
    }
  };

  const filteredThreads = threads.filter((t) => {
    const matchesTab =
      activeTab === 'channels' ? t.type === 'branch_channel' : t.type === 'direct_dm';
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.branchName && t.branchName.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTab && matchesSearch;
  });

  return (
    <div className="h-[calc(100vh-8.5rem)] flex flex-col bg-[#0D0F0D] rounded-xl border border-[#1E3A24] overflow-hidden">
      {/* Top Banner / Header */}
      <div className="bg-[#132A17] px-6 py-4 border-b border-[#1E3A24] flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-[#1E3A24] text-[#D95D0F]">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide">Partner Communications Hub</h1>
            <p className="text-xs text-zinc-400">
              Direct real-time channel between Branch Operators, Brand Owners, Developers & Support
            </p>
          </div>
        </div>

        {/* Quick Branch Channel Opener if none exists */}
        {user?.role === 'branch_owner' && user.branchIds?.[0] && (
          <button
            onClick={() =>
              createOrOpenBranchChannel(
                user.branchIds[0],
                user.name ? `${user.name}'s Branch` : 'My Branch'
              )
            }
            className="hidden sm:inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#D95D0F] hover:bg-[#b84d0b] text-white transition-colors shadow-sm"
          >
            <Store className="w-3.5 h-3.5 mr-1.5" />
            Open Branch Channel
          </button>
        )}
      </div>

      {/* Main Chat Splitter */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Thread List (Hidden on mobile when chat is open) */}
        <div
          className={`${
            showMobileList ? 'flex' : 'hidden'
          } md:flex flex-col w-full md:w-80 lg:w-96 border-r border-[#1E3A24] bg-[#0E1E12]`}
        >
          {/* Channel / DM Tabs */}
          <div className="p-3 border-b border-[#1E3A24] space-y-3">
            <div className="grid grid-cols-2 p-1 bg-[#132A17] rounded-lg text-xs font-medium">
              <button
                onClick={() => setActiveTab('channels')}
                className={`py-1.5 rounded-md transition-colors flex items-center justify-center space-x-1.5 ${
                  activeTab === 'channels'
                    ? 'bg-[#D95D0F] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Hash className="w-3.5 h-3.5" />
                <span>Branch Rooms</span>
              </button>
              <button
                onClick={() => setActiveTab('direct')}
                className={`py-1.5 rounded-md transition-colors flex items-center justify-center space-x-1.5 ${
                  activeTab === 'direct'
                    ? 'bg-[#D95D0F] text-white shadow-sm'
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
                placeholder="Search channels or teammates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#132A17] border border-[#234B2A] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
              />
            </div>
          </div>

          {/* Threads List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#1A3320]">
            {loadingThreads ? (
              <div className="p-8 text-center text-xs text-zinc-500">Loading channels...</div>
            ) : threadsError ? (
              <div role="alert" className="p-8 text-center space-y-2">
                <p className="text-xs text-rose-300 font-semibold">Channels failed to load</p>
                <p className="text-[11px] text-zinc-500">{threadsError}</p>
                <p className="text-[11px] text-zinc-500">
                  Showing last known threads. Check connection and reopen chat to retry.
                </p>
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-xs text-zinc-400">No active threads found.</p>
                <p className="text-[11px] text-zinc-500">
                  {activeTab === 'channels'
                    ? 'Branch channels will appear when operational messages are sent.'
                    : 'Start a 1:1 conversation with Brand Owners, Developers or Support.'}
                </p>
                {/* Branch-scoped quick join: only the user's own outlets, never
                    hardcoded cross-outlet rooms. */}
                {(user?.branchIds?.length ? user.branchIds : []).map((branchId) => (
                  <button
                    key={branchId}
                    onClick={() => createOrOpenBranchChannel(branchId, branchId)}
                    className="px-3 py-1.5 text-xs bg-[#132A17] hover:bg-[#1E3A24] border border-[#234B2A] text-zinc-300 rounded-lg text-left w-full"
                  >
                    + Open {branchId} channel
                  </button>
                ))}
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
                    className={`w-full text-left p-3.5 transition-colors flex items-start space-x-3 ${
                      isActive ? 'bg-[#16301B] border-l-4 border-l-[#D95D0F]' : 'hover:bg-[#122416]'
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-[#1E3A24] text-[#D95D0F] shrink-0 mt-0.5">
                      {thread.type === 'branch_channel' ? (
                        <Store className="w-4 h-4" />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs text-white truncate">
                          {thread.title}
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

        {/* Right Active Chat Box */}
        <div
          className={`${
            !showMobileList ? 'flex' : 'hidden'
          } md:flex flex-1 flex-col bg-[#0A0C0A]`}
        >
          {activeThread ? (
            <>
              {/* Active Header */}
              <div className="p-3.5 bg-[#102314] border-b border-[#1E3A24] flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setShowMobileList(true)}
                    className="md:hidden p-1 text-zinc-400 hover:text-white"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="p-2 rounded-lg bg-[#1A351F] text-[#D95D0F]">
                    {activeThread.type === 'branch_channel' ? (
                      <Hash className="w-4 h-4" />
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                      <span>{activeThread.title}</span>
                      {activeThread.branchName && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1A351F] text-emerald-400 font-normal">
                          {activeThread.branchName}
                        </span>
                      )}
                    </h2>
                    <p className="text-[10px] text-zinc-400">
                      Real-time synchronized chat · Firestore persistence
                    </p>
                  </div>
                </div>

                <div className="hidden sm:flex items-center space-x-2 text-xs text-zinc-400">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span>Active Channel</span>
                </div>
              </div>

              {/* Messages Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingMessages ? (
                  <div className="p-8 text-center text-xs text-zinc-500">Loading messages...</div>
                ) : messagesError ? (
                  <div role="alert" className="p-8 text-center space-y-2">
                    <p className="text-xs text-rose-300 font-semibold">Messages failed to load</p>
                    <p className="text-[11px] text-zinc-500">{messagesError}</p>
                    <p className="text-[11px] text-zinc-500">
                      Last known messages are shown. Reopen this thread to retry.
                    </p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2">
                    <div className="p-4 rounded-full bg-[#132A17] text-[#D95D0F]">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold text-zinc-300">Welcome to {activeThread.title}</p>
                    <p className="text-xs text-zinc-500 max-w-sm">
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
                          <span className="text-[11px] font-semibold text-zinc-300">
                            {isMe ? 'You' : msg.senderName}
                          </span>
                          {getRoleBadge(msg.senderRole)}
                          <span className="text-[10px] text-zinc-500">
                            {msg.createdAt?.toDate
                              ? msg.createdAt.toDate().toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Just now'}
                          </span>
                        </div>
                        <div
                          className={`max-w-md lg:max-w-xl px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${
                            isMe
                              ? 'bg-[#D95D0F] text-white rounded-br-none shadow-md'
                              : 'bg-[#142C19] border border-[#234B2A] text-zinc-200 rounded-bl-none'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                          {msg.imageUrl && (
                            <img
                              src={msg.imageUrl}
                              alt="attachment"
                              className="mt-2 rounded-lg max-h-48 object-cover"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Queued (unsent) message banner with retry */}
              {queuedMessage && (
                <div
                  role="alert"
                  className="mx-4 mb-2 p-3 bg-amber-950/60 border border-amber-800 rounded-xl flex items-center justify-between gap-2"
                >
                  <p className="text-[11px] text-amber-200">
                    Message not sent — kept below. Check connection, then retry.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={sending}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-[11px] font-bold shrink-0"
                  >
                    {sending ? 'Sending…' : 'Retry send'}
                  </button>
                </div>
              )}

              {/* Message Composer Bar */}
              <form
                onSubmit={handleSend}
                className="p-3 bg-[#102314] border-t border-[#1E3A24] flex items-center space-x-2"
              >
                <input
                  type="text"
                  placeholder={`Message ${activeThread.title}...`}
                  value={inputMessage}
                  onChange={(e) => {
                    setInputMessage(e.target.value);
                    if (queuedMessage === null) return;
                    if (e.target.value !== queuedMessage) setQueuedMessage(null);
                  }}
                  className="flex-1 px-4 py-2.5 text-xs bg-[#0D0F0D] border border-[#234B2A] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#D95D0F]"
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim() || sending}
                  className="p-2.5 bg-[#D95D0F] hover:bg-[#b84d0b] disabled:opacity-50 text-white rounded-xl transition-colors shadow-sm flex items-center justify-center"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-zinc-500">
              <MessageSquare className="w-12 h-12 mb-3 text-zinc-600" />
              <p className="text-sm font-semibold text-zinc-400">Select a conversation</p>
              <p className="text-xs text-zinc-600">
                Choose a branch operational room or 1:1 direct message to start chatting.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
