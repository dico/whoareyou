import { api } from '../api/client.js';
import { t } from '../utils/i18n.js';
import { contactRowHtml } from './contact-row.js';

const MAX_PER_KIND = 8;

/**
 * Fetch the contacts to tag for a group (current members only) or a label.
 * Uses /contacts so private contacts of other users are excluded by the
 * backend. Sensitive contacts are always skipped: tagging one makes the whole
 * post sensitive (cascade), which a bulk action should never do implicitly.
 *
 * @param {{ groupUuid?: string, labelName?: string }} source
 * @returns {Promise<Array<{uuid, first_name, last_name, avatar}>>}
 */
export async function fetchTagSourceMembers({ groupUuid, labelName }) {
  const params = new URLSearchParams({ limit: '200' });
  if (groupUuid) { params.set('company', groupUuid); params.set('company_active', 'true'); }
  else params.set('label', labelName);
  const { contacts } = await api.get(`/contacts?${params}`);
  return contacts
    .filter(c => !c.is_sensitive)
    .map(c => ({ uuid: c.uuid, first_name: c.first_name, last_name: c.last_name, avatar: c.avatar || null }));
}

/**
 * Group/label search wired to an input + results container. Shared by
 * tagGroupDialog() (modal) and the post composer (inline panel, since the
 * composer is itself a modal). Selecting a row resolves it to its members.
 *
 * @param {HTMLInputElement} input
 * @param {HTMLElement} results
 * @param {{ onSelect: (r: { name: string, contacts: Array }) => void, onEscape?: () => void }} options
 * @returns {{ load: (q?: string) => Promise<void> }}
 */
export function attachTagSourceSearch(input, results, { onSelect, onEscape }) {
  let labels = null;
  let items = [];

  let searchTimeout;
  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => load(input.value.trim()), 200);
  });

  input.addEventListener('keydown', (e) => {
    const rows = [...results.querySelectorAll('.contact-row')];
    const active = results.querySelector('.contact-row.active');
    let index = rows.indexOf(active);
    if (e.key === 'ArrowDown') { e.preventDefault(); index = Math.min(index + 1, rows.length - 1); rows.forEach(r => r.classList.remove('active')); rows[index]?.classList.add('active'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); index = Math.max(index - 1, 0); rows.forEach(r => r.classList.remove('active')); rows[index]?.classList.add('active'); }
    else if (e.key === 'Enter') { e.preventDefault(); const target = active || rows[0]; if (target) selectItem(items[rows.indexOf(target)]); }
    else if (e.key === 'Escape' && onEscape) { e.preventDefault(); e.stopPropagation(); onEscape(); }
  });

  async function load(q = '') {
    try {
      if (!labels) labels = (await api.get('/labels')).labels || [];
      const { companies } = await api.get(`/companies${q ? `?search=${encodeURIComponent(q)}` : ''}`);
      const lq = q.toLowerCase();

      items = [
        ...(companies || []).filter(c => c.employee_count > 0).slice(0, MAX_PER_KIND).map(c => ({
          kind: 'group', key: c.uuid, name: c.name, avatar: c.logo_path,
          meta: `<i class="bi bi-people"></i> ${t('groups.types.' + (c.type || 'other'))} · ${t('posts.tagGroupMembers', { count: c.employee_count })}`,
        })),
        ...labels.filter(l => l.contact_count > 0 && l.name.toLowerCase().includes(lq)).slice(0, MAX_PER_KIND).map(l => ({
          kind: 'label', key: l.name, name: l.name, avatar: null,
          meta: `<i class="bi bi-tag"></i> ${t('posts.tagGroupLabel')} · ${t('posts.tagGroupMembers', { count: l.contact_count })}`,
        })),
      ];

      if (!items.length) {
        results.innerHTML = `<div class="text-muted small p-2">${t('common.noResults')}</div>`;
        return;
      }

      results.innerHTML = items.map((it, i) =>
        contactRowHtml({ uuid: it.key, first_name: it.name, last_name: '', avatar: it.avatar }, {
          tag: 'div', active: i === 0, meta: it.meta,
        })
      ).join('');
      results.querySelectorAll('.contact-row').forEach((row, i) => {
        row.addEventListener('click', () => selectItem(items[i]));
      });
    } catch {
      results.innerHTML = '';
    }
  }

  async function selectItem(item) {
    if (!item) return;
    try {
      const contacts = await fetchTagSourceMembers(
        item.kind === 'group' ? { groupUuid: item.key } : { labelName: item.key }
      );
      onSelect({ name: item.name, contacts });
    } catch {
      results.innerHTML = `<div class="text-danger small p-2">${t('common.error')}</div>`;
    }
  }

  return { load };
}

/**
 * Pick a group or label and resolve to its members, so a post can be
 * tagged with everyone at once. Members are expanded to plain contact tags
 * (snapshot) — later membership changes do not alter existing posts.
 *
 * Groups only include current members (no end_date). See
 * fetchTagSourceMembers() for which contacts are skipped.
 *
 * @param {object} options - { title, excludeUuids }
 * @returns {Promise<{ name: string, contacts: Array<{uuid, first_name, last_name, avatar}> }|null>}
 */
export function tagGroupDialog(options = {}) {
  const { title = t('posts.tagGroup'), excludeUuids = [] } = options;

  return new Promise((resolve) => {
    const id = 'dialog-tag-group-' + Date.now();
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade" id="${id}" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">${title}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <input type="text" class="form-control mb-3" id="${id}-input" placeholder="${t('posts.tagGroupSearch')}" autofocus>
              <div id="${id}-results" class="contact-search-results"></div>
            </div>
          </div>
        </div>
      </div>
    `);

    const modalEl = document.getElementById(id);
    const modal = new bootstrap.Modal(modalEl);
    const input = document.getElementById(`${id}-input`);
    let resolved = false;

    modalEl.addEventListener('shown.bs.modal', () => input.focus());

    const search = attachTagSourceSearch(input, document.getElementById(`${id}-results`), {
      onSelect: ({ name, contacts }) => {
        resolved = true;
        modal.hide();
        resolve({ name, contacts: contacts.filter(c => !excludeUuids.includes(c.uuid)) });
      },
    });

    modalEl.addEventListener('hidden.bs.modal', () => { modalEl.remove(); if (!resolved) resolve(null); }, { once: true });
    modal.show();
    search.load('');
  });
}
