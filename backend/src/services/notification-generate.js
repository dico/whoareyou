import { db } from '../db.js';
import { tryCreateNotification } from '../utils/notification-prefs.js';
import { sendDigestsForTenant } from './notification-email.js';

/**
 * Generate date-driven notifications for all active users in a tenant:
 * birthdays, custom reminders, life-event anniversaries, and memory milestones.
 * Also kicks off the hourly-throttled email digest.
 *
 * Safe to call multiple times per day — each notification type has an
 * idempotency check (existing row for today).
 *
 * @param {number} tenantId
 * @returns {Promise<number>} number of new notifications created
 */
export async function generateNotificationsForTenant(tenantId) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  const users = await db('users')
    .where({ tenant_id: tenantId, is_active: true })
    .select('id');

  if (!users.length) return 0;

  let generated = 0;

  // 1. Birthday reminders
  const contacts = await db('contacts')
    .where({ tenant_id: tenantId })
    .whereNull('deleted_at')
    .whereNotNull('birth_day')
    .whereNotNull('birth_month')
    .select('id', 'uuid', 'first_name', 'last_name', 'birth_day', 'birth_month', 'birth_year');

  for (const contact of contacts) {
    if ((contact.birth_month - 1) === todayMonth && contact.birth_day === todayDay) {
      for (const user of users) {
        const existing = await db('notifications')
          .where({ user_id: user.id, tenant_id: tenantId, type: 'birthday' })
          .where('created_at', '>=', todayStr)
          .whereRaw('body LIKE ?', [`%${contact.uuid}%`])
          .first();
        if (existing) continue;
        const id = await tryCreateNotification(user.id, tenantId, 'birthday', {
          title: `${contact.first_name} ${contact.last_name || ''}`.trim(),
          body: `${contact.uuid}`,
          link: `/contacts/${contact.uuid}`,
        }, { contactId: contact.id });
        if (id) generated++;
      }
    }
  }

  // 2. Custom reminders due today
  const dueReminders = await db('reminders')
    .where({ 'reminders.tenant_id': tenantId, 'reminders.is_completed': false })
    .where(function () {
      this.where(function () {
        this.where('is_recurring', false).where('reminder_date', todayStr);
      }).orWhere(function () {
        this.where('is_recurring', true)
          .whereRaw('MONTH(reminder_date) = ?', [todayMonth + 1])
          .whereRaw('DAY(reminder_date) = ?', [todayDay]);
      });
    })
    .leftJoin('contacts', 'reminders.contact_id', 'contacts.id')
    .select('reminders.*', 'contacts.uuid as contact_uuid');

  for (const rem of dueReminders) {
    const reminderTitle = rem.title;
    for (const user of users) {
      const existing = await db('notifications')
        .where({ user_id: user.id, tenant_id: tenantId, type: 'reminder' })
        .where('created_at', '>=', todayStr)
        .whereRaw('title = ?', [reminderTitle])
        .first();
      if (existing) continue;
      const id = await tryCreateNotification(user.id, tenantId, 'reminder', {
        title: reminderTitle,
        body: rem.contact_uuid || '',
        link: rem.contact_uuid ? `/contacts/${rem.contact_uuid}` : '/',
      }, { contactId: rem.contact_id || null });
      if (id) generated++;
    }
  }

  // 3. Life event anniversaries (remind_annually = true, month+day match)
  const anniversaries = await db('life_events')
    .join('life_event_types', 'life_events.event_type_id', 'life_event_types.id')
    .join('contacts', 'life_events.contact_id', 'contacts.id')
    .where({ 'life_events.tenant_id': tenantId, 'life_events.remind_annually': true })
    .whereRaw('MONTH(life_events.event_date) = ?', [todayMonth + 1])
    .whereRaw('DAY(life_events.event_date) = ?', [todayDay])
    .whereNull('contacts.deleted_at')
    .select(
      'life_events.id', 'life_events.event_date',
      'life_event_types.name as event_type',
      'contacts.id as contact_id', 'contacts.uuid as contact_uuid', 'contacts.first_name', 'contacts.last_name'
    );

  for (const ann of anniversaries) {
    const years = today.getFullYear() - new Date(ann.event_date).getFullYear();
    for (const user of users) {
      const existing = await db('notifications')
        .where({ user_id: user.id, tenant_id: tenantId, type: 'anniversary' })
        .where('created_at', '>=', todayStr)
        .whereRaw('body LIKE ?', [`%${ann.contact_uuid}%`])
        .first();
      if (existing) continue;
      const id = await tryCreateNotification(user.id, tenantId, 'anniversary', {
        title: `${ann.first_name} ${ann.last_name || ''}`.trim(),
        body: `${ann.contact_uuid}|${ann.event_type}|${years}`,
        link: `/contacts/${ann.contact_uuid}`,
      }, { contactId: ann.contact_id });
      if (id) generated++;
    }
  }

  // 4. Memory notifications — posts from the same MM-DD in previous years.
  //    Only fires on milestone anniversaries to avoid yearly noise.
  //    Excludes sensitive posts and sensitive contacts.
  const MEMORY_MILESTONES = new Set([1, 5, 10, 15, 20, 25, 30, 40, 50]);

  const memoryPosts = await db('posts')
    .where('posts.tenant_id', tenantId)
    .whereNull('posts.deleted_at')
    .whereIn('posts.visibility', ['shared', 'family'])
    .where('posts.is_sensitive', false)
    .whereRaw('MONTH(posts.post_date) = ?', [todayMonth + 1])
    .whereRaw('DAY(posts.post_date) = ?', [todayDay])
    .whereRaw('YEAR(posts.post_date) < ?', [today.getFullYear()])
    .whereNotExists(
      db('contacts')
        .whereRaw('contacts.id = posts.contact_id')
        .where('contacts.is_sensitive', true)
    )
    .whereNotExists(
      db('post_contacts')
        .join('contacts', 'post_contacts.contact_id', 'contacts.id')
        .whereRaw('post_contacts.post_id = posts.id')
        .where('contacts.is_sensitive', true)
    )
    .select('posts.id', 'posts.uuid', 'posts.post_date', 'posts.body')
    .orderBy('posts.post_date', 'asc');

  const milestonePosts = memoryPosts.filter(p => {
    const years = today.getFullYear() - new Date(p.post_date).getFullYear();
    return MEMORY_MILESTONES.has(years);
  });

  if (milestonePosts.length) {
    const postIds = milestonePosts.map(p => p.id);
    const media = await db('post_media')
      .whereIn('post_id', postIds)
      .where('file_type', 'like', 'image/%')
      .select('post_id', 'thumbnail_path')
      .orderBy('sort_order');
    const thumbByPost = new Map();
    for (const m of media) if (!thumbByPost.has(m.post_id)) thumbByPost.set(m.post_id, m.thumbnail_path);

    const pickedPost = milestonePosts.find(p => thumbByPost.has(p.id)) || milestonePosts[0];
    const pickedThumb = thumbByPost.get(pickedPost.id) || '';
    const years = today.getFullYear() - new Date(pickedPost.post_date).getFullYear();
    const totalCount = milestonePosts.length;

    for (const user of users) {
      const existing = await db('notifications')
        .where({ user_id: user.id, tenant_id: tenantId, type: 'memory' })
        .where('created_at', '>=', todayStr)
        .first();
      if (existing) continue;
      const id = await tryCreateNotification(user.id, tenantId, 'memory', {
        title: String(years),
        body: `${totalCount}|${pickedThumb}|${pickedPost.uuid}`,
        link: '/memories',
      });
      if (id) generated++;
    }
  }

  sendDigestsForTenant(tenantId).catch(() => {});
  return generated;
}
