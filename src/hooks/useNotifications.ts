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
import type { Notification } from '@/types';

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user) return [];

      try {
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
      } catch (err) {
        console.warn('Error fetching notifications from Firestore:', err);
        return [];
      }
    },
    enabled: !!user,
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
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!user) return;

      try {
        const notifSnap = await getDocs(
          query(
            collection(db, 'notifications'),
            where('userId', '==', user.id),
            where('read', '==', false)
          )
        );

        const batch = notifSnap.docs.map((d) =>
          updateDoc(d.ref, {
            read: true,
            readAt: Timestamp.now(),
          })
        );

        await Promise.all(batch);
      } catch (err) {
        console.warn('Error marking all notifications as read:', err);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, isLoading, unreadCount, markAsRead, markAllAsRead };
}
