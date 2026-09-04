import { db } from '@/config/firebase';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
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
  threadInfo?: {
    type: 'branch_channel' | 'direct_dm';
    title: string;
    branchId?: string;
    branchName?: string;
    participantIds: string[];
    participantNames: Record<string, string>;
  };
}

export const chatService = {
  /**
   * Subscribe to chat threads for a user (either by participation or branch scoping)
   */
  subscribeToThreads(
    userId: string,
    userRole: UserRole,
    branchIds: string[],
    callback: (threads: ChatThread[]) => void
  ): Unsubscribe {
    const chatsRef = collection(db, 'chats');

    // Brand Owner, Developer, Support see all threads; Branch Owner/Staff see branch channels + their DMs
    const q =
      userRole === 'brand_owner' || userRole === 'developer' || userRole === 'support'
        ? query(chatsRef, orderBy('lastMessageAt', 'desc'))
        : query(chatsRef, where('participantIds', 'array-contains', userId));

    return onSnapshot(
      q,
      (snapshot) => {
        const threads: ChatThread[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as ChatThread[];
        callback(threads);
      },
      (error) => {
        console.error('Error fetching chat threads:', error);
        callback([]);
      }
    );
  },

  /**
   * Subscribe to real-time messages of a specific chat thread
   */
  subscribeToMessages(
    chatId: string,
    callback: (messages: ChatMessage[]) => void
  ): Unsubscribe {
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const messages: ChatMessage[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as ChatMessage[];
        callback(messages);
      },
      (error) => {
        console.error(`Error fetching messages for chat ${chatId}:`, error);
        callback([]);
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
        createdAt: Timestamp.now(),
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
        createdAt: Timestamp.now(),
      },
      { merge: true }
    );

    return chatId;
  },
};
