import { db } from '../db.js';

/**
 * Get the linked_contact_id for a user in a specific tenant.
 * Uses tenant_members (per-tenant linking) with fallback to users table (legacy).
 */
export async function getLinkedContactId(userId, tenantId) {
  const membership = await db('tenant_members')
    .where({ user_id: userId, tenant_id: tenantId })
    .select('linked_contact_id')
    .first();
  if (membership?.linked_contact_id) return membership.linked_contact_id;

  // Fallback: check users.linked_contact_id if contact belongs to this tenant
  const user = await db('users').where({ id: userId }).select('linked_contact_id').first();
  if (user?.linked_contact_id) {
    const contact = await db('contacts').where({ id: user.linked_contact_id, tenant_id: tenantId }).first();
    if (contact) return contact.id;
  }
  return null;
}
