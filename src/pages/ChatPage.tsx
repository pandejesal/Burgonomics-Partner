import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useChats } from '@/hooks/useChats';
import { useAuthStore } from '@/stores/authStore';
import { AttachReferenceModal } from '@/components/chat/AttachReferenceModal';
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
    sendMessage,
    createOrOpenBranchChannel,
    createOrOpenDirectDm,
  } = useChats();

  const [inputMessage, setInputMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'channels' | 'direct'>('channels');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileList, setShowMobileList] = useState(true);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [attachedOrder, setAttachedOrder] = useState<Order | null>(null);
  const [attachedTicket, setAttachedTicket] = useState<Ticket | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const displayThread =
    activeThread ||
    (activeThreadId
      ? ({
          id: activeThreadId,
          type: activeThreadId.startsWith('channel_') ? 'branch_channel' : 'direct_dm',
          title:
            activeThreadId === 'channel_branch_surat_01'
              ? 'Surat Adajan Operations Hub'
              : activeThreadId === 'channel_branch_ahmedabad_01'
              ? 'Ahmedabad SG Operations Hub'
              : 'Branch Operations Hub',
          branchName:
            activeThreadId === 'channel_branch_surat_01'
              ? 'Surat Adajan'
              : activeThreadId === 'channel_branch_ahmedabad_01'
              ? 'Ahmedabad SG'
              : 'Branch',
          participantIds: [],
          participantNames: {},
          createdAt: { toDate: () => new Date() } as any,
        } as ChatThread)
      : null);

  // Auto scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
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
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
                user.name ? `${user.name}'s Branch` : 'My Branch'
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
            showMobileList ? 'flex' : 'hidden'
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
          <div className="flex-1 overflow-y-auto divide-y divide-[#1A3320]">
            {loadingThreads ? (
              <div className="p-8 text-center text-xs text-zinc-500">Loading rooms...</div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-xs text-zinc-400">No active conversations found.</p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  {activeTab === 'channels'
                    ? 'Branch channels appear when operational updates are broadcast.'
                    : 'Start a 1:1 conversation with Brand Owners, Developers or Support.'}
                </p>
                {/* Fallback default rooms */}
                <div className="pt-2 flex flex-col space-y-2">
                  <button
                    onClick={async () => {
                      await createOrOpenBranchChannel('branch_surat_01', 'Surat Adajan Hub');
                      setShowMobileList(false);
                    }}
                    className="px-3 py-2 text-xs bg-surface hover:bg-surface-hover border border-border text-zinc-200 rounded-xl text-left font-bold cursor-pointer"
                  >
                    + Join Surat Adajan Hub
                  </button>
                  <button
                    onClick={async () => {
                      await createOrOpenBranchChannel('branch_ahmedabad_01', 'Ahmedabad SG Hub');
                      setShowMobileList(false);
                    }}
                    className="px-3 py-2 text-xs bg-surface hover:bg-surface-hover border border-border text-zinc-200 rounded-xl text-left font-bold cursor-pointer"
                  >
                    + Join Ahmedabad SG Hub
                  </button>
                </div>
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
          } md:flex flex-1 flex-col bg-[#0A0A0A]`}
        >
          {displayThread ? (
            <>
              {/* Active Header */}
              <div className="p-3.5 bg-surface border-b border-border flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setShowMobileList(true)}
                    className="md:hidden p-1 text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="p-2 rounded-xl bg-surface-hover text-accent-light border border-border">
                    {displayThread.type === 'branch_channel' ? (
                      <Hash className="w-4 h-4" />
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                      <span>{displayThread.title}</span>
                      {displayThread.branchName && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#1A351F] text-emerald-400 font-bold border border-border">
                          {displayThread.branchName}
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
                  <span className="text-emerald-400 font-bold text-[11px]">Live Channel</span>
                </div>
              </div>

              {/* Messages Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingMessages ? (
                  <div className="p-8 text-center text-xs text-zinc-500">Loading messages...</div>
                ) : messages.length === 0 ? (
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
                  type="text"
                  placeholder={`Message ${displayThread.title}...`}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="flex-1 px-4 py-2.5 text-xs bg-bg border border-border rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
                />

                <button
                  type="submit"
                  disabled={!inputMessage.trim() && !attachedOrder && !attachedTicket}
                  className="p-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl transition-colors shadow-md flex items-center justify-center cursor-pointer"
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

      {/* Attach Reference Modal */}
      <AttachReferenceModal
        isOpen={showAttachModal}
        onClose={() => setShowAttachModal(false)}
        onSelectOrder={(order) => {
          setAttachedOrder(order);
          setAttachedTicket(null);
        }}
        onSelectTicket={(ticket) => {
          setAttachedTicket(ticket);
          setAttachedOrder(null);
        }}
      />
    </div>
  );
};

export default ChatPage;
