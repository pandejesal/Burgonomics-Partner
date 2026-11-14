import { db } from '@/config/firebase';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  getDocs,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import type { ChatMessage, ChatThread, UserRole } from '@/types';

export interface SendMessageParams {
  chatId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
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
  threadInfo?: {
    type: 'branch_channel' | 'direct_dm';
    title: string;
    branchId?: string;
    branchName?: string;
    participantIds: string[];
    participantNames: Record<string, string>;
  };
}

/**
 * The message to show for a listener failure. A message that is absent, empty
 * or whitespace-only gets the documented fallback so an error state can never
 * be visually blank — but a meaningful message is returned UNTRIMMED, exactly
 * as the SDK supplied it.
 */
function errorMessageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.trim().length > 0) return message;
  }
  return fallback;
}

/**
 * The SDK `error.code`, forwarded untouched. Firestore denials are opaque or
 * localised in `message`, so the code is the only reliable denial signal.
 * Presence is a trim test (a whitespace-only code carries no information), but
 * a real code is returned UNTRIMMED and unchanged.
 */
function errorCodeOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (typeof code === 'string' && code.trim().length > 0) return code;
  }
  return undefined;
}

export const chatService = {
  /**
   * Subscribe to chat threads for a user (either by participation or branch scoping)
   */
  subscribeToThreads(
    userId: string,
    userRole: UserRole,
    branchIds: string[],
    callback: (threads: ChatThread[]) => void,
    onError?: (message: string, code?: string) => void
  ): Unsubscribe {
    const chatsRef = collection(db, 'chats');

    // Brand Owner, Developer, Support see all threads; Branch Owner/Staff see branch channels + their DMs.
    // Bounded: the old code subscribed with no limit (and client-sorted) —
    // history grew the listener, bandwidth, and bill without bound. Scoped
    // roles keep client-side sort deliberately: array-contains + orderBy on
    // another field needs a composite index that is not deployed, and a
    // missing index fails the listener to empty (worse than sorting 50).
    const q =
      userRole === 'brand_owner' || userRole === 'developer' || userRole === 'support'
        ? query(chatsRef, orderBy('lastMessageAt', 'desc'), limit(30))
        : query(chatsRef, where('participantIds', 'array-contains', userId), limit(50));

    return onSnapshot(
      q,
      (snapshot) => {
        const threads: ChatThread[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as ChatThread[];

        // Client-side sort by most recent message or creation timestamp
        threads.sort((a, b) => {
          const timeA = a.lastMessageAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
          const timeB = b.lastMessageAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        });

        callback(threads);
      },
      (error) => {
        console.error('Error fetching chat threads:', error);
        // Listener death is an error, never an empty list: keep existing
        // data on screen and let the caller render the failure. The SDK code
        // travels with the message so callers can treat a denial as a denial
        // even when the message is opaque or localised.
        onError?.(errorMessageOf(error, 'Chat threads failed to load'), errorCodeOf(error));
      }
    );
  },

  /**
   * Subscribe to real-time messages of a specific chat thread
   */
  subscribeToMessages(
    chatId: string,
    callback: (messages: ChatMessage[]) => void,
    onError?: (message: string, code?: string) => void
  ): Unsubscribe {
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    // Latest 50 only: the old code subscribed to the thread's ENTIRE history
    // and re-downloaded it on every new message. Descending + reverse keeps
    // the UI's oldest-first order. ("Load older" pagination: follow-up.)
    const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(50));

    return onSnapshot(
      q,
      (snapshot) => {
        const messages: ChatMessage[] = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })) as ChatMessage[];
        messages.reverse();
        callback(messages);
      },
      (error) => {
        console.error(`Error fetching messages for chat ${chatId}:`, error);
        // Listener death is an error, never an empty list. The SDK code is
        // forwarded unchanged alongside the message.
        onError?.(errorMessageOf(error, 'Messages failed to load'), errorCodeOf(error));
      }
    );
  },

  /**
   * Send a message to a chat thread and update thread metadata
   */
  async sendMessage(params: SendMessageParams): Promise<string> {
    const now = Timestamp.now();
    const chatDocRef = doc(db, 'chats', params.chatId);

    // If thread info is provided and doc might not exist, ensure the parent thread is created
    if (params.threadInfo) {
      await setDoc(
        chatDocRef,
        {
          type: params.threadInfo.type,
          title: params.threadInfo.title,
          branchId: params.threadInfo.branchId || null,
          branchName: params.threadInfo.branchName || null,
          participantIds: params.threadInfo.participantIds,
          participantNames: params.threadInfo.participantNames,
          lastMessageText: params.text,
          lastMessageSender: params.senderName,
          lastMessageAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    } else {
      await updateDoc(chatDocRef, {
        lastMessageText: params.text,
        lastMessageSender: params.senderName,
        lastMessageAt: now,
        updatedAt: now,
      }).catch(async () => {
        // Fallback create if thread was missing
        await setDoc(
          chatDocRef,
          {
            lastMessageText: params.text,
            lastMessageSender: params.senderName,
            lastMessageAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      });
    }

    // Add message to messages subcollection
    const messagesRef = collection(db, 'chats', params.chatId, 'messages');
    const newMsg = await addDoc(messagesRef, {
      chatId: params.chatId,
      senderId: params.senderId,
      senderName: params.senderName,
      senderRole: params.senderRole,
      text: params.text,
      imageUrl: params.imageUrl || null,
      orderReference: params.orderReference || null,
      ticketReference: params.ticketReference || null,
      createdAt: now,
      readBy: [params.senderId],
    });

    return newMsg.id;
  },

  /**
   * Create or fetch a branch-level group chat channel
   */
  async getOrCreateBranchChannel(
    branchId: string,
    branchName: string,
    currentUser: { id: string; name: string }
  ): Promise<string> {
    const chatId = `channel_${branchId}`;
    const chatDocRef = doc(db, 'chats', chatId);

    const now = Timestamp.now();
    await setDoc(
      chatDocRef,
      {
        id: chatId,
        type: 'branch_channel',
        title: `${branchName} Operations Hub`,
        branchId,
        branchName,
        participantIds: [branchId, currentUser.id, 'brand_hq', 'dev_team', 'support_team'],
        participantNames: {
          [currentUser.id]: currentUser.name,
          [branchId]: branchName,
          brand_hq: 'Brand HQ',
          dev_team: 'Developer Team',
          support_team: 'Support Team',
        },
        lastMessageText: 'Operational channel initialized',
        lastMessageSender: 'System',
        lastMessageAt: now,
        createdAt: now,
      },
      { merge: true }
    );

    return chatId;
  },

  /**
   * Create or fetch a 1:1 Direct DM channel between two users
   */
  async getOrCreateDirectDm(
    userA: { id: string; name: string },
    userB: { id: string; name: string }
  ): Promise<string> {
    const sortedIds = [userA.id, userB.id].sort();
    const chatId = `dm_${sortedIds[0]}_${sortedIds[1]}`;
    const chatDocRef = doc(db, 'chats', chatId);
    const now = Timestamp.now();

    await setDoc(
      chatDocRef,
      {
        id: chatId,
        type: 'direct_dm',
        title: `${userA.name} & ${userB.name}`,
        participantIds: [userA.id, userB.id],
        participantNames: {
          [userA.id]: userA.name,
          [userB.id]: userB.name,
        },
        lastMessageText: 'Direct conversation initialized',
        lastMessageSender: 'System',
        lastMessageAt: now,
        createdAt: now,
      },
      { merge: true }
    );

    return chatId;
  },
};
