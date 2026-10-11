import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/config/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
  limit,
} from 'firebase/firestore';
import { toast } from 'sonner';
import type { Notification } from '@/types';

// F15: every failure on this screen used to be swallowed (queryFn returned []
// after a console.warn, markAllAsRead caught and logged, and the caller's
// fire-and-forget .mutate() never saw a rejection) — so the badge dropped to
// zero and "Mark all as read" reported nothing while rules denied the writes.
// Errors now reject the mutation AND raise a toast; read failures surface as
// an inline role="alert" on NotificationsPage.
const readFailCopy = 'Notifications could not be read.';

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: notifications = [],
    isLoading,
    isError: isReadError,
    error: readError,
  } = useQuery<Notification[]>({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Re-throw: returning [] here made a denied/failed read look identical
      // to "no notifications", so the unread badge silently read 0.
      const notifSnap = await getDocs(
        query(
          collection(db, 'notifications'),
          where('userId', '==', user.id),
          orderBy('createdAt', 'desc'),
          limit(50)
        )
      );

      return notifSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Notification[];
    },
    enabled: !!user,
    retry: 1,
  });

  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const notifRef = doc(db, 'notifications', notificationId);
      await updateDoc(notifRef, {
        read: true,
        readAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
    onError: (err) => {
      toast.error('Marked as read FAILED — the notification is still unread.', {
        description: errorText(err),
      });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!user) {
        throw new Error('You must be signed in to mark notifications as read.');
      }

      const notifSnap = await getDocs(
        query(
          collection(db, 'notifications'),
          where('userId', '==', user.id),
          where('read', '==', false)
        )
      );

      // Reject loudly: this used to be wrapped in a catch that only logged,
      // so onSuccess still invalidated the cache and the caller showed a
      // success path for writes Firestore had denied.
      await Promise.all(
        notifSnap.docs.map((d) =>
          updateDoc(d.ref, {
            read: true,
            readAt: Timestamp.now(),
          })
        )
      );
    },
    onSuccess: (_data, _vars, _ctx) => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
    onError: (err) => {
      toast.error('Notifications were NOT marked as read.', {
        description: errorText(err),
      });
    },
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    isLoading,
    isReadError,
    readError,
    readFailCopy,
    unreadCount,
    markAsRead,
    markAllAsRead,
  };
}
