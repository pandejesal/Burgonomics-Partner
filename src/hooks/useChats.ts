import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { chatService, SendMessageParams } from '@/services/chatService';
import type { ChatThread, ChatMessage } from '@/types';

export function useChats() {
  const { user } = useAuthStore();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Subscribe to threads
  useEffect(() => {
    if (!user) {
      setThreads([]);
      setLoadingThreads(false);
      return;
    }

    const unsubscribe = chatService.subscribeToThreads(
      user.id,
      user.role,
      user.branchIds || [],
      (fetchedThreads) => {
        setThreads(fetchedThreads);
        setLoadingThreads(false);

        // Auto-select first thread if none selected
        if (!activeThreadId && fetchedThreads.length > 0) {
          setActiveThreadId(fetchedThreads[0].id);
        }
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Subscribe to active thread messages
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    const unsubscribe = chatService.subscribeToMessages(activeThreadId, (newMessages) => {
      setMessages(newMessages);
      setLoadingMessages(false);
    });

    return () => unsubscribe();
  }, [activeThreadId]);

  const sendMessage = async (text: string, imageUrl?: string) => {
    if (!user || !activeThreadId || (!text.trim() && !imageUrl)) return;

    const currentThread = threads.find((t) => t.id === activeThreadId);

    await chatService.sendMessage({
      chatId: activeThreadId,
      senderId: user.id,
      senderName: user.name || 'Staff Member',
      senderRole: user.role,
      text: text.trim(),
      imageUrl,
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
    if (!user) return;
    const chatId = await chatService.getOrCreateBranchChannel(branchId, branchName, {
      id: user.id,
      name: user.name || 'Branch Operator',
    });
    setActiveThreadId(chatId);
    return chatId;
  };

  const createOrOpenDirectDm = async (targetUser: { id: string; name: string }) => {
    if (!user) return;
    const chatId = await chatService.getOrCreateDirectDm(
      { id: user.id, name: user.name || 'User' },
      targetUser
    );
    setActiveThreadId(chatId);
    return chatId;
  };

  return {
    threads,
    activeThreadId,
    setActiveThreadId,
    activeThread: threads.find((t) => t.id === activeThreadId),
    messages,
    loadingThreads,
    loadingMessages,
    sendMessage,
    createOrOpenBranchChannel,
    createOrOpenDirectDm,
  };
}
