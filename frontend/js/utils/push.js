import { api } from '../api/client.js';

/**
 * Web Push helpers. Reads VAPID key from the backend, registers the service
 * worker, subscribes via PushManager, and posts the subscription back.
 *
 * Browser support: Chrome/Firefox/Edge/Safari 16.4+ (iOS requires the PWA
 * to be installed to home screen; Notification.permission will return
 * 'denied' without warning in Safari otherwise).
 */

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function pushPermission() {
  return pushSupported() ? Notification.permission : 'unsupported';
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.warn('SW registration failed:', err);
    return null;
  }
}

async function getActiveSubscription() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function isSubscribed() {
  if (!pushSupported()) return false;
  const sub = await getActiveSubscription();
  return !!sub;
}

export async function subscribe() {
  if (!pushSupported()) throw new Error('Push not supported');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(`Permission ${perm}`);

  const { publicKey } = await api.get('/notifications/push/vapid-key');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const raw = sub.toJSON();
  await api.post('/notifications/push/subscribe', {
    endpoint: raw.endpoint,
    keys: raw.keys,
  });
  return sub;
}

export async function unsubscribe() {
  if (!pushSupported()) return;
  const sub = await getActiveSubscription();
  if (!sub) return;
  const raw = sub.toJSON();
  try { await api.post('/notifications/push/unsubscribe', { endpoint: raw.endpoint }); } catch {}
  await sub.unsubscribe();
}

// VAPID key comes as base64url; the browser PushManager wants a Uint8Array.
function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}
