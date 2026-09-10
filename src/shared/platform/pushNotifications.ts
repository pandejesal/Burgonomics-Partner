/**
 * Native Push Notifications Manager for Burgonomics Partner POS.
 *
 * Connects @capacitor/push-notifications with device token syncing to Firestore,
 * notification channel creation with custom sound (new_order.wav),
 * and foreground chime + toast alerts for incoming kitchen orders.
 */
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { logger } from '@/core/logging/logger';
import { isSafeDeepLink } from '@/utils/urlSafety';
import type { User } from '@/types';

let listenersAttached = false;
let currentToken: string | null = null;
// Topics this device holds server-side (for unsubscribing stale branches on
// account/branch switch — otherwise old outlets keep paging this terminal).
let subscribedTopics: string[] = [];

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
 * Initializes notification channels and listeners. Listeners attach ONCE, but
 * topic subscription re-runs on every user/branch change: the old single
 * `isInitialized` guard made post-login calls no-ops, so branch/role
 * switches never re-subscribed (and stale topics were never released).
 */
export async function initPushNotifications(user?: User | null): Promise<void> {
  if (!isNativePlatform()) return;
  const freshUser = await currentStoreUser(user);
  await attachListenersOnce();
  await subscribeUserTopics(freshUser);
  // First-run prompt: previously nothing ever asked, so fresh installs that
  // never granted permission got no token despite tapping notification UIs.
  try {
    await requestPushPermissions();
  } catch {
    // Permission flow is best-effort; denial just means no pushes.
  }
}

async function currentStoreUser(fallback?: User | null): Promise<User | null> {
  try {
    const { useAuthStore } = await import('@/stores/authStore');
    return useAuthStore.getState().user || fallback || null;
  } catch {
    return fallback || null;
  }
}

/** Desired topics for a user (branch + escalation fan-out per role). */
function desiredTopicsFor(user: User | null): string[] {
  if (!user) return [];
  const topics = (user.branchIds || []).flatMap((b) => [
    `branch_${b}_orders`,
    `branch_${b}_tickets`,
  ]);
  if (user.role === 'regional_manager' || user.role === 'support') {
    topics.push('regional_managers');
  }
  if (user.role === 'brand_owner' || user.role === 'developer') {
    topics.push('superadmins');
  }
  if (user.role !== 'customer') topics.push('tickets_escalated');
  return [...new Set(topics)];
}

/**
 * Reconciles device topic subscriptions with the current user: subscribes
 * missing topics, unsubscribes stale ones (old branches after a switch —
 * otherwise the previous outlet keeps paging this terminal).
 */
async function subscribeUserTopics(user: User | null): Promise<void> {
  const token = getCachedToken();
  if (!token) return;
  const wanted = desiredTopicsFor(user);
  const toAdd = wanted.filter((t) => !subscribedTopics.includes(t));
  const toDrop = subscribedTopics.filter((t) => !wanted.includes(t));
  if (toAdd.length === 0 && toDrop.length === 0) return;
  try {
    const { partnerFunctionsApi } = await import('@/services/partnerFunctionsApi');
    if (toAdd.length > 0) await partnerFunctionsApi.subscribeToTopics(token, toAdd);
    if (toDrop.length > 0) await partnerFunctionsApi.unsubscribeFromTopics(token, toDrop);
    subscribedTopics = wanted;
  } catch (subErr) {
    console.warn('[Push] Topic subscription reconcile failed:', subErr);
  }
}

async function attachListenersOnce(): Promise<void> {
  if (listenersAttached) return;
  listenersAttached = true;

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

      // ALWAYS resolve the user fresh (never the init-time closure) for both
      // topic subscription and the Firestore registry write.
      const freshUser = await currentStoreUser();
      await subscribeUserTopics(freshUser);

      if (freshUser) {
        try {
          // device_tokens is server-owned (firestore.rules denies direct
          // client writes) — register via the server endpoint so KOT pushes
          // actually reach this terminal.
          const { partnerFunctionsApi } = await import('@/services/partnerFunctionsApi');
          await partnerFunctionsApi.registerDeviceToken(token.value, Capacitor.getPlatform());
        } catch (dbErr) {
          console.warn('[Push] Failed to register token via server:', dbErr);
        }
      }
    });

    // 3. Registration Error Listener
    PushNotifications.addListener('registrationError', (err: any) => {
      console.warn('[Push] Registration error:', err);
    });

    // 4. Foreground Push Listener
    PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
      logger.debug('[Push] Foreground notification received');

      // Play chime if available
      try {
        const audio = new Audio('/sounds/new_order.wav');
        audio.play().catch(() => {});
      } catch {
        // Non-blocking audio play
      }

      // Typed payload only: a generic targetId used to route chats, campaigns
      // and announcements into /orders/<id>. Unknown types surface a toast
      // with NO navigation instead of a full reload to a wrong page.
      const data = notification?.data || {};
      const title = notification?.title || '🔔 New Alert';
      const body = notification?.body || '';
      const kind = data.type as string | undefined;
      const orderId = typeof data.orderId === 'string' && data.orderId ? data.orderId : undefined;
      const ticketId = typeof data.ticketId === 'string' && data.ticketId ? data.ticketId : undefined;
      const action =
        orderId && (!kind || kind === 'order' || kind === 'NEW_KOT' || kind === 'payment_captured')
          ? {
              label: 'View Order',
              onClick: () => {
                window.location.href = `/orders/${orderId}`;
              },
            }
          : ticketId && (!kind || kind === 'ticket' || kind === 'ticket_escalated' || kind === 'ticket_reminder')
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

    // Loop 11: map an allowlisted deep link to an in-app path.
    // burgonomics://menu/offers → /menu/offers; owned https → its path.
    // Returns null when nothing safe can be derived (caller skips).
    const toInAppPath = (link: string): string | null => {
      const appMatch = /^burgonomics:\/\/([^?#]+)((?:[?#].*)?)$/.exec(link.trim());
      if (appMatch) return `/${appMatch[1]}${appMatch[2] || ''}`;
      try {
        const u = new URL(link.trim());
        if (/^(burgonomics\.com|partner\.burgonomics\.com|burgonomics\.netlify\.app)$/.test(u.hostname)) {
          return `${u.pathname}${u.search}${u.hash}` || '/';
        }
      } catch {
        return null;
      }
      return null;
    };

    // 5. System Tray Click Action Listener
    PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
      const data = action?.notification?.data || {};
      const kind = data.type as string | undefined;
      const orderId = typeof data.orderId === 'string' && data.orderId ? data.orderId : undefined;
      const ticketId = typeof data.ticketId === 'string' && data.ticketId ? data.ticketId : undefined;

      if (orderId && (!kind || kind === 'order' || kind === 'NEW_KOT' || kind === 'payment_captured')) {
        setTimeout(() => {
          window.location.href = `/orders/${orderId}`;
        }, 100);
      } else if (ticketId && (!kind || kind === 'ticket' || kind === 'ticket_escalated' || kind === 'ticket_reminder')) {
        setTimeout(() => {
          window.location.href = `/tickets/${ticketId}`;
        }, 100);
      } else if (typeof data.deepLink === 'string' && isSafeDeepLink(data.deepLink)) {
        // Loop 11: campaign deep links (burgonomics://menu, owned https) used
        // to die — no native scheme handler exists. Route allowlisted links
        // through the in-app router instead. Unknown schemes/hosts rejected
        // by isSafeDeepLink, never navigated.
        const path = toInAppPath(data.deepLink);
        if (path) {
          setTimeout(() => {
            window.location.href = path;
          }, 100);
        }
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
