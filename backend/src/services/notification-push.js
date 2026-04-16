import webpush from 'web-push';
import { db } from '../db.js';
import { getSetting, setSetting } from '../utils/settings.js';

let cachedKeys = null;

/**
 * Get or generate the VAPID key pair for this installation. Stored in
 * `system_settings` so it survives restarts. Generated once on first use.
 */
export async function getVapidKeys() {
  if (cachedKeys) return cachedKeys;
  let publicKey = await getSetting('vapid_public_key');
  let privateKey = await getSetting('vapid_private_key');
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    await setSetting('vapid_public_key', publicKey);
    await setSetting('vapid_private_key', privateKey);
  }
  cachedKeys = { publicKey, privateKey };
  return cachedKeys;
}

async function configureWebPush() {
  const { publicKey, privateKey } = await getVapidKeys();
  const contact = (await getSetting('smtp_from')) || 'mailto:admin@example.com';
  const mailto = contact.includes('<') ? contact.match(/<(.+)>/)?.[1] || contact : contact;
  webpush.setVapidDetails(
    mailto.startsWith('mailto:') ? mailto : `mailto:${mailto}`,
    publicKey,
    privateKey,
  );
}

/**
 * Send a web push to all of a user's active subscriptions. Expired
 * subscriptions (HTTP 404/410 from the push service) are deleted so we don't
 * keep trying.
 *
 * Payload shape (what the service worker receives):
 *   { title, body, icon, url, tag }
 */
export async function sendPushToUser(userId, tenantId, payload) {
  await configureWebPush();

  const subs = await db('push_subscriptions')
    .where({ user_id: userId, tenant_id: tenantId })
    .select('*');
  if (!subs.length) return 0;

  const jsonPayload = JSON.stringify(payload);
  let sent = 0;
  for (const sub of subs) {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    try {
      await webpush.sendNotification(subscription, jsonPayload, { TTL: 86400 });
      await db('push_subscriptions').where({ id: sub.id }).update({ last_used_at: db.fn.now() });
      sent++;
    } catch (err) {
      // 404/410 = subscription no longer valid, drop it.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db('push_subscriptions').where({ id: sub.id }).del();
      } else {
        console.error('Web push failed:', err.statusCode, err.body || err.message);
      }
    }
  }
  return sent;
}

/**
 * Build a push payload from a notification row for delivery to the browser.
 * Mirrors the navbar rendering so the title/body match.
 */
export function payloadFromNotification(n) {
  const icon = '/img/icon-192.png';
  let title = n.title;
  let body = '';
  if (n.type === 'birthday') {
    title = `🎂 ${n.title}`;
    body = 'har bursdag i dag';
  } else if (n.type === 'anniversary') {
    const parts = (n.body || '').split('|');
    title = `💝 ${n.title}`;
    body = `${parts[1] || ''} — ${parts[2] || ''} år`;
  } else if (n.type === 'reminder') {
    title = `🔔 ${n.title}`;
  } else if (n.type === 'memory') {
    const parts = (n.body || '').split('|');
    const years = parseInt(n.title, 10) || 1;
    title = `🕰️ Minner fra ${years} år siden`;
    body = `${parts[0] || '1'} innlegg fra i dag`;
  } else if (n.type === 'family_post') {
    title = `✉️ ${n.title}`;
    body = 'la ut et innlegg';
  } else if (n.type === 'family_comment') {
    const parts = (n.body || '').split('|');
    title = `💬 ${n.title}`;
    body = parts[1] || '';
  }
  return {
    title,
    body,
    icon,
    tag: `notif-${n.id}`,
    url: n.link || '/',
  };
}
