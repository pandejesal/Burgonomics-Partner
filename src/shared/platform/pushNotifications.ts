/**
 * Native Push Notifications Manager for Burgonomics Partner POS.
 *
 * Connects @capacitor/push-notifications with device token syncing to Firestore,
 * notification channel creation with custom sound (new_order.wav),
 * and foreground chime + toast alerts for incoming kitchen orders.
 */
import { Capacitor } from '@capacitor/core';
import { db } from '@/config/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { logger } from '@/core/logging/logger';
import type { User } from '@/types';

let isInitialized = false;
let currentToken: string | null = null;

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function getCachedToken(): string | null {
  if (currentToken) return currentToken;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem('burg_partner_device_token');
  }
  return null;
}

function setCachedToken(token: string | null) {
  currentToken = token;
  if (typeof window !== 'undefined' && window.localStorage) {
    if (token) {
      window.localStorage.setItem('burg_partner_device_token', token);
    } else {
      window.localStorage.removeItem('burg_partner_device_token');
    }
  }
}

/**
 * Initializes notification channels and listeners.
 */
export async function initPushNotifications(user?: User | null): Promise<void> {
  if (!isNativePlatform() || isInitialized) return;
  isInitialized = true;

  try {
    const pushModule: any = await import('@capacitor/push-notifications').catch(() => null);
    if (!pushModule || !pushModule.PushNotifications) return;
    const PushNotifications = pushModule.PushNotifications;

    // 1. Create Android Notification Channels with high importance & custom sound
    if (Capacitor.getPlatform() === 'android') {
      try {
        await PushNotifications.createChannel({
          id: 'burgonomics_orders_channel',
          name: 'Kitchen & Order Alerts',
          description: 'High-priority notifications for new orders and preparation updates',
          importance: 5,
          visibility: 1,
          sound: 'new_order.wav',
          vibration: true,
          lights: true,
          lightColor: '#0E4825',
        });

        await PushNotifications.createChannel({
          id: 'burgonomics_updates_channel',
          name: 'General Operational Updates',
          description: 'Standard updates, messages and support notices',
          importance: 4,
          visibility: 1,
          sound: 'default',
          vibration: true,
        });
      } catch (channelErr) {
        console.warn('[Push] Channel creation warning:', channelErr);
      }
    }

    // 2. Token Registration Listener
    PushNotifications.addListener('registration', async (token: { value: string }) => {
      if (!token?.value) return;
      // Never log token material, even truncated — prefixes are stable
      // identifiers. Dev-only debug through the gated logger.
      logger.debug('[Push] FCM/APNs registration received');
      setCachedToken(token.value);

      // Subscribe to branch topics so kitchen + ticket alerts arrive. Reads
      // the CURRENT user from the store (not the init-time closure) so
      // account switches re-subscribe correctly on token refresh.
      let freshUser: User | null = user || null;
      try {
        const { useAuthStore } = await import('@/stores/authStore');
        freshUser = useAuthStore.getState().user || user || null;
      } catch {
        // store unavailable — fall back to init-time user
      }
      const branchIds = freshUser?.branchIds?.length ? freshUser.branchIds : [];
      if (branchIds.length > 0) {
        try {
          const { partnerFunctionsApi } = await import('@/services/partnerFunctionsApi');
          await partnerFunctionsApi.subscribeToTopics(
            token.value,
            branchIds.flatMap((b) => [`branch_${b}_orders`, `branch_${b}_tickets`])
          );
        } catch (subErr) {
          console.warn('[Push] Branch topic subscription failed:', subErr);
        }
      }

      if (user) {
        try {
          await setDoc(
            doc(db, 'device_tokens', token.value),
            {
              token: token.value,
              userId: user.id,
              role: user.role,
              branchIds: user.branchIds || [],
              platform: Capacitor.getPlatform(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (dbErr) {
          console.warn('[Push] Failed to register token in Firestore:', dbErr);
        }
      }
    });

    // 3. Registration Error Listener
    PushNotifications.addListener('registrationError', (err: any) => {
      console.warn('[Push] Registration error:', err);
    });

    // 4. Foreground Push Listener
    PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
      console.log('[Push] Foreground notification received:', notification?.title);

      // Play chime if available
      try {
        const audio = new Audio('/sounds/new_order.wav');
        audio.play().catch(() => {});
      } catch {
        // Non-blocking audio play
      }

      const data = notification?.data || {};
      const orderId = data.orderId || data.targetId;
      const ticketId = data.ticketId;
      const title = notification?.title || '🔔 New Alert';
      const body = notification?.body || '';
      const action = orderId
        ? {
            label: 'View Order',
            onClick: () => {
              window.location.href = `/orders/${orderId}`;
            },
          }
        : ticketId
          ? {
              label: 'View Ticket',
              onClick: () => {
                window.location.href = `/tickets/${ticketId}`;
              },
            }
          : undefined;

      toast(title, {
        description: body,
        duration: 8000,
        action,
      });
    });

    // 5. System Tray Click Action Listener
    PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
      const data = action?.notification?.data || {};
      const orderId = data.orderId || data.targetId;
      const ticketId = data.ticketId;

      if (orderId) {
        setTimeout(() => {
          window.location.href = `/orders/${orderId}`;
        }, 100);
      } else if (ticketId) {
        setTimeout(() => {
          window.location.href = `/tickets/${ticketId}`;
        }, 100);
      }
    });

    // 6. Check existing permissions and register if already granted
    const permStatus = await PushNotifications.checkPermissions();
    if (permStatus?.receive === 'granted') {
      await PushNotifications.register();
    }
  } catch (err) {
    console.warn('[Push] Initialization failed:', err);
  }
}

/**
 * Requests push notification permissions and registers the device.
 */
export async function requestPushPermissions(): Promise<boolean> {
  if (!isNativePlatform()) return true;

  try {
    const pushModule: any = await import('@capacitor/push-notifications').catch(() => null);
    if (!pushModule || !pushModule.PushNotifications) return false;
    const PushNotifications = pushModule.PushNotifications;

    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus?.receive === 'prompt' || permStatus?.receive === 'prompt-with-rationale') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus?.receive === 'granted') {
      await PushNotifications.register();
      return true;
    }

    return false;
  } catch (err) {
    console.error('[Push] Request permissions error:', err);
    return false;
  }
}
