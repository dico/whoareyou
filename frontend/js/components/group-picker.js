import { api } from '../api/client.js';
import { t } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';
import { navigate } from '../app.js';

// Group hierarchy UI shared by the group list and group detail pages:
// an inline group search (no modal-in-modal), a "parent group" picker for
// forms, the create-group dialog and the "move an existing group here" dialog.

export const GROUP_TYPES = ['company', 'school', 'club', 'team', 'association', 'class', 'other'];
export const GROUP_TYPE_ICONS = {
  company: 'bi-building', school: 'bi-mortarboard', club: 'bi-people',
  team: 'bi-trophy', association: 'bi-diagram-3', class: 'bi-easel', other: 'bi-collection',
};

/** "Åsly skole › 9. trinn" — the path above a group, or '' at top level. */
export function groupPathText(group) {
  return group.path?.length ? group.path.join(' › ') : '';
}

function groupRowHtml(g, active) {
  const avatar = g.logo_path
    ? `<img src="${authUrl(g.logo_path)}" alt="">`
    : `<i class="bi ${GROUP_TYPE_ICONS[g.type] || 'bi-people'}"></i>`;
  const path = groupPathText(g);
  return `
    <div class="contact-row group-search-item${active ? ' active' : ''}" data-uuid="${g.uuid}">
      <span class="contact-row-avatar group-row-avatar">${avatar}</span>
      <span class="contact-row-info">
        <span class="contact-row-name">${esc(g.name)}</span>
        <span class="contact-row-meta text-muted small">${path ? `${esc(path)} · ` : ''}${t('groups.types.' + (g.type || 'other'))}</span>
      </span>
    </div>
  `;
}

/**
 * Inline group search: results render into `results` below the input.
 * @param {HTMLInputElement} input
 * @param {HTMLElement} results
 * @param {{ onSelect: (group) => void, excludeUuids?: string[] }} opts
 */
export function attachGroupSearch(input, results, { onSelect, excludeUuids = [] }) {
  let items = [];
  let timer;

  const load = async () => {
    const q = input.value.trim();
    try {
      const { companies } = await api.get(`/companies${q ? `?search=${encodeURIComponent(q)}` : ''}`);
      items = companies.filter(c => !excludeUuids.includes(c.uuid)).slice(0, 8);
      results.innerHTML = items.length
        ? items.map((g, i) => groupRowHtml(g, i === 0)).join('')
        : `<div class="text-muted small p-2">${t('common.noResults')}</div>`;
    } catch {
      results.innerHTML = '';
    }
  };

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 200); });
  input.addEventListener('keydown', (e) => {
    const rows = [...results.querySelectorAll('.group-search-item')];
    let i = rows.findIndex(r => r.classList.contains('active'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      i = e.key === 'ArrowDown' ? Math.min(i + 1, rows.length - 1) : Math.max(i - 1, 0);
      rows.forEach((r, j) => r.classList.toggle('active', j === i));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[Math.max(i, 0)]) onSelect(items[Math.max(i, 0)]);
    }
  });
  results.addEventListener('click', (e) => {
    const row = e.target.closest('.group-search-item');
    if (row) onSelect(items.find(g => g.uuid === row.dataset.uuid));
  });

  load();
  return { reload: load };
}

/**
 * "Parent group" field for forms: shows the chosen group as a chip, or a
 * search to pick one. `getValue()` returns the uuid or null (top level).
 */
export function attachParentPicker(container, { value = null, excludeUuids = [] } = {}) {
  let current = value; // { uuid, name } | null

  const render = () => {
    if (current) {
      container.innerHTML = `
        <div class="d-flex align-items-center gap-2">
          <span class="contact-chip"><i class="bi bi-diagram-3"></i>${esc(current.name)}
            <button type="button" class="contact-chip-remove" aria-label="${t('groups.parentClear')}">×</button>
          </span>
        </div>
      `;
      container.querySelector('.contact-chip-remove').addEventListener('click', () => { current = null; render(); });
      return;
    }
    container.innerHTML = `
      <input type="text" class="form-control form-control-sm" placeholder="${t('groups.parentSearch')}" autocomplete="off">
      <div class="contact-search-results mt-1"></div>
    `;
    const input = container.querySelector('input');
    const results = container.querySelector('.contact-search-results');
    results.classList.add('d-none');
    input.addEventListener('focus', () => results.classList.remove('d-none'));
    attachGroupSearch(input, results, {
      excludeUuids,
      onSelect: (g) => { current = { uuid: g.uuid, name: g.name }; render(); },
    });
  };

  render();
  return { getValue: () => current?.uuid || null };
}

/**
 * Create a group. `parent` ({ uuid, name }) presets the parent group, e.g.
 * "+ Undergruppe" inside a group. Navigates to the new group.
 */
export function openCreateGroupDialog({ parent = null, type = null } = {}) {
  const mid = 'new-group-' + Date.now();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${parent ? t('groups.newSubgroup') : t('groups.newGroup')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${t('common.close')}"></button>
          </div>
          <form id="${mid}-form">
            <div class="modal-body">
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="${mid}-name" required>
                <label>${t('companies.name')}</label>
              </div>
              <div class="form-floating mb-3">
                <select class="form-select" id="${mid}-type">
                  ${GROUP_TYPES.map(tp => `<option value="${tp}" ${tp === (type || 'company') ? 'selected' : ''}>${t('groups.types.' + tp)}</option>`).join('')}
                </select>
                <label>${t('groups.type')}</label>
              </div>
              <div class="mb-3">
                <label class="form-label small text-muted">${t('groups.parentGroup')} <span class="text-muted">(${t('common.optional')})</span></label>
                <div id="${mid}-parent"></div>
              </div>
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="${mid}-industry">
                <label>${t('companies.industry')}</label>
              </div>
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="${mid}-website" placeholder="example.com">
                <label>${t('companies.website')}</label>
              </div>
              <div class="mb-3">
                <label class="form-label small text-muted">${t('groups.description')}</label>
                <textarea class="form-control" id="${mid}-desc" rows="2"></textarea>
              </div>
              <div id="${mid}-error" class="alert alert-danger d-none"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="submit" class="btn btn-primary btn-sm">${t('contacts.create')}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);
  const modalEl = document.getElementById(mid);
  const modal = new bootstrap.Modal(modalEl);
  const parentPicker = attachParentPicker(document.getElementById(`${mid}-parent`), { value: parent });
  modalEl.addEventListener('shown.bs.modal', () => document.getElementById(`${mid}-name`).focus(), { once: true });
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });

  // Enter in the parent search picks a group — it must not submit the form
  modalEl.querySelector('form').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.closest(`#${mid}-parent`)) e.preventDefault();
  });

  document.getElementById(`${mid}-form`).addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById(`${mid}-error`);
    errorEl.classList.add('d-none');
    let website = document.getElementById(`${mid}-website`).value.trim();
    if (website && !/^https?:\/\//.test(website)) website = 'https://' + website;
    try {
      const { company } = await api.post('/companies', {
        name: document.getElementById(`${mid}-name`).value,
        type: document.getElementById(`${mid}-type`).value,
        parent_uuid: parentPicker.getValue(),
        industry: document.getElementById(`${mid}-industry`).value || null,
        description: document.getElementById(`${mid}-desc`).value || null,
        website: website || null,
      });
      modal.hide();
      navigate(`/groups/${company.uuid}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });

  modal.show();
}

/**
 * «Legg til undergruppe» under `target` ({ uuid, name }) — one dialog with
 * two tabs: pick an existing group to move here (default), or create a new
 * one. Text typed in the search carries over as the new group's name.
 * `excludeUuids` should hold the target, its ancestors and current
 * subgroups (the backend rejects loops too). Moving calls `onMoved`;
 * creating navigates to the new group (like openCreateGroupDialog).
 */
export function openAddSubgroupDialog({ target, excludeUuids = [], type = null, onMoved }) {
  const mid = 'add-subgroup-' + Date.now();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('groups.addSubgroupTitle', { name: esc(target.name) })}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${t('common.close')}"></button>
          </div>
          <div class="modal-body">
            <div class="filter-tabs mb-3" role="tablist">
              <button type="button" class="filter-tab active" data-tab="existing"><i class="bi bi-box-arrow-in-down-right me-1"></i>${t('groups.addSubgroupExisting')}</button>
              <button type="button" class="filter-tab" data-tab="new"><i class="bi bi-plus-lg me-1"></i>${t('groups.addSubgroupNew')}</button>
            </div>
            <div data-pane="existing">
              <p class="small text-muted">${t('groups.moveHereHint')}</p>
              <input type="text" class="form-control mb-2" id="${mid}-search" placeholder="${t('groups.searchGroups')}" autocomplete="off">
              <div class="contact-search-results" id="${mid}-results"></div>
            </div>
            <form data-pane="new" class="d-none" id="${mid}-form">
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="${mid}-name" required>
                <label>${t('companies.name')}</label>
              </div>
              <div class="form-floating mb-3">
                <select class="form-select" id="${mid}-type">
                  ${GROUP_TYPES.map(tp => `<option value="${tp}" ${tp === (type || 'company') ? 'selected' : ''}>${t('groups.types.' + tp)}</option>`).join('')}
                </select>
                <label>${t('groups.type')}</label>
              </div>
              <p class="small text-muted mb-0">${t('groups.addSubgroupNewHint')}</p>
            </form>
          </div>
          <div class="modal-footer d-none" id="${mid}-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
            <button type="submit" form="${mid}-form" class="btn btn-primary btn-sm">${t('contacts.create')}</button>
          </div>
        </div>
      </div>
    </div>
  `);
  const modalEl = document.getElementById(mid);
  const modal = new bootstrap.Modal(modalEl);
  const input = document.getElementById(`${mid}-search`);
  const nameInput = document.getElementById(`${mid}-name`);
  const footer = document.getElementById(`${mid}-footer`);
  modalEl.addEventListener('shown.bs.modal', () => input.focus(), { once: true });
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });

  const showError = async (err) => {
    const { confirmDialog } = await import('./dialogs.js');
    confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
  };

  const switchTab = (tab) => {
    modalEl.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    modalEl.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('d-none', p.dataset.pane !== tab));
    footer.classList.toggle('d-none', tab !== 'new');
    if (tab === 'new') {
      if (!nameInput.value && input.value.trim()) nameInput.value = input.value.trim();
      nameInput.focus();
    } else {
      input.focus();
    }
  };
  modalEl.querySelector('.filter-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (tab) switchTab(tab.dataset.tab);
  });

  attachGroupSearch(input, document.getElementById(`${mid}-results`), {
    excludeUuids,
    onSelect: async (g) => {
      try {
        await api.put(`/companies/${g.uuid}`, { parent_uuid: target.uuid });
        modal.hide();
        onMoved?.();
      } catch (err) {
        showError(err);
      }
    },
  });

  document.getElementById(`${mid}-form`).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { company } = await api.post('/companies', {
        name: nameInput.value,
        type: document.getElementById(`${mid}-type`).value,
        parent_uuid: target.uuid,
      });
      modal.hide();
      navigate(`/groups/${company.uuid}`);
    } catch (err) {
      showError(err);
    }
  });

  modal.show();
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}
