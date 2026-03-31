import { api } from '../api/client.js';
import { state, navigate } from '../app.js';
import { t } from '../utils/i18n.js';
import { confirmDialog } from '../components/dialogs.js';
import { contactRowHtml } from '../components/contact-row.js';
import { authUrl } from '../utils/auth-url.js';

let allLabels = [];
let leftLabelId = null;
let rightLabelId = null;
let leftContacts = [];
let rightContacts = [];
let selectedLeft = new Set();
let selectedRight = new Set();

export async function renderLabelAdmin() {
  const content = document.getElementById('app-content');

  content.innerHTML = `
    <div class="page-container" style="max-width:1200px">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2><i class="bi bi-tags"></i> ${t('labels.manage')}</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-label"><i class="bi bi-plus-lg me-1"></i>${t('labels.createNew')}</button>
      </div>

      <div class="label-admin-layout">
        <!-- Left panel -->
        <div class="label-panel glass-card">
          <div class="label-panel-header">
            <select class="form-select form-select-sm" id="left-label-select">
              <option value="">${t('labels.choose')}</option>
            </select>
            <div class="label-panel-actions" id="left-actions"></div>
          </div>
          <div class="label-panel-toolbar d-none" id="left-toolbar">
            <button class="btn btn-sm btn-outline-primary" id="left-select-all">${t('labels.selectAll')}</button>
            <button class="btn btn-sm btn-outline-secondary" id="left-select-none">${t('labels.selectNone')}</button>
            <span class="text-muted small" id="left-count"></span>
          </div>
          <div class="label-panel-list" id="left-list"></div>
        </div>

        <!-- Transfer buttons -->
        <div class="label-transfer">
          <button class="btn btn-outline-primary btn-sm" id="btn-move-right" title="${t('labels.moveRight')}" disabled>
            ${t('labels.move')} <i class="bi bi-arrow-right"></i>
          </button>
          <button class="btn btn-outline-secondary btn-sm" id="btn-copy-right" title="${t('labels.copyRight')}" disabled>
            ${t('labels.copy')} <i class="bi bi-arrow-right"></i>
          </button>
          <button class="btn btn-outline-secondary btn-sm" id="btn-copy-left" title="${t('labels.copyLeft')}" disabled>
            <i class="bi bi-arrow-left"></i> ${t('labels.copy')}
          </button>
          <button class="btn btn-outline-primary btn-sm" id="btn-move-left" title="${t('labels.moveLeft')}" disabled>
            <i class="bi bi-arrow-left"></i> ${t('labels.move')}
          </button>
        </div>

        <!-- Right panel -->
        <div class="label-panel glass-card">
          <div class="label-panel-header">
            <select class="form-select form-select-sm" id="right-label-select">
              <option value="">${t('labels.choose')}</option>
            </select>
            <div class="label-panel-actions" id="right-actions"></div>
          </div>
          <div class="label-panel-toolbar d-none" id="right-toolbar">
            <button class="btn btn-sm btn-outline-primary" id="right-select-all">${t('labels.selectAll')}</button>
            <button class="btn btn-sm btn-outline-secondary" id="right-select-none">${t('labels.selectNone')}</button>
            <span class="text-muted small" id="right-count"></span>
          </div>
          <div class="label-panel-list" id="right-list"></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('/settings'));

  // Create new label
  document.getElementById('btn-new-label').addEventListener('click', async () => {
    const id = 'new-label-' + Date.now();
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade" id="${id}" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content glass-card">
            <div class="modal-header"><h5 class="modal-title">${t('labels.createNew')}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
            <div class="modal-body">
              <div class="form-floating mb-2"><input type="text" class="form-control" id="${id}-name" required><label>${t('labels.newLabel')}</label></div>
              <div class="d-flex align-items-center gap-2">
                <label class="form-label mb-0 small">${t('labels.color')}</label>
                <input type="color" class="form-control form-control-color" id="${id}-color" value="#007aff" style="width:40px;height:32px">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="button" class="btn btn-primary btn-sm" id="${id}-save">${t('common.save')}</button>
            </div>
          </div>
        </div>
      </div>`);
    const modalEl = document.getElementById(id);
    const modal = new bootstrap.Modal(modalEl);
    document.getElementById(`${id}-save`).addEventListener('click', async () => {
      const name = document.getElementById(`${id}-name`).value.trim();
      if (!name) return;
      const color = document.getElementById(`${id}-color`).value;
      await api.post('/labels', { name, color });
      modal.hide();
      const data = await api.get('/labels');
      allLabels = data.labels;
      populateSelects();
    });
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
    modal.show();
    document.getElementById(`${id}-name`).focus();
  });

  // Load labels
  try {
    const data = await api.get('/labels');
    allLabels = data.labels;
    populateSelects();
  } catch {}

  // Label selection
  document.getElementById('left-label-select').addEventListener('change', (e) => {
    leftLabelId = e.target.value || null;
    selectedLeft.clear();
    loadPanel('left');
  });

  document.getElementById('right-label-select').addEventListener('change', (e) => {
    rightLabelId = e.target.value || null;
    selectedRight.clear();
    loadPanel('right');
  });

  // Select all/none
  document.getElementById('left-select-all').addEventListener('click', () => { leftContacts.forEach(c => selectedLeft.add(c.uuid)); renderPanel('left'); });
  document.getElementById('left-select-none').addEventListener('click', () => { selectedLeft.clear(); renderPanel('left'); });
  document.getElementById('right-select-all').addEventListener('click', () => { rightContacts.forEach(c => selectedRight.add(c.uuid)); renderPanel('right'); });
  document.getElementById('right-select-none').addEventListener('click', () => { selectedRight.clear(); renderPanel('right'); });

  // Transfer buttons
  document.getElementById('btn-move-right').addEventListener('click', () => transfer('move', 'right'));
  document.getElementById('btn-copy-right').addEventListener('click', () => transfer('copy', 'right'));
  document.getElementById('btn-copy-left').addEventListener('click', () => transfer('copy', 'left'));
  document.getElementById('btn-move-left').addEventListener('click', () => transfer('move', 'left'));
}

function populateSelects() {
  const opts = allLabels.map(l => `<option value="${l.id}">${l.name} (${l.contact_count})</option>`).join('');
  document.getElementById('left-label-select').innerHTML = `<option value="">${t('labels.choose')}</option>` + opts;
  document.getElementById('right-label-select').innerHTML = `<option value="">${t('labels.choose')}</option>` + opts;
}

async function loadPanel(side) {
  const labelId = side === 'left' ? leftLabelId : rightLabelId;
  const listEl = document.getElementById(`${side}-list`);
  const toolbar = document.getElementById(`${side}-toolbar`);

  const actionsEl = document.getElementById(`${side}-actions`);

  if (!labelId) {
    listEl.innerHTML = `<p class="text-muted small p-3">${t('labels.selectLabel')}</p>`;
    toolbar.classList.add('d-none');
    actionsEl.innerHTML = '';
    updateTransferButtons();
    return;
  }

  listEl.innerHTML = `<div class="loading small p-3">${t('app.loading')}</div>`;

  const label = allLabels.find(l => String(l.id) === String(labelId));

  // Show action buttons for selected label
  actionsEl.innerHTML = `
    <button class="btn btn-link btn-sm" id="${side}-edit-label" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
    <button class="btn btn-link btn-sm text-danger" id="${side}-delete-label" title="${t('common.delete')}"><i class="bi bi-trash"></i></button>
    <button class="btn btn-link btn-sm" id="${side}-add-contact" title="${t('labels.addContact')}"><i class="bi bi-person-plus"></i></button>
  `;

  // Edit label — inline input replacing select
  document.getElementById(`${side}-edit-label`).addEventListener('click', () => {
    const selectEl = document.getElementById(`${side}-label-select`);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control form-control-sm';
    input.value = label?.name || '';
    selectEl.style.display = 'none';
    selectEl.parentNode.insertBefore(input, selectEl);
    input.focus();
    input.select();
    const save = async () => {
      const newName = input.value.trim();
      if (newName && newName !== label?.name) {
        await api.put(`/labels/${labelId}`, { name: newName });
        const data = await api.get('/labels');
        allLabels = data.labels;
        populateSelects();
      }
      input.remove();
      selectEl.style.display = '';
      selectEl.value = labelId;
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { input.remove(); selectEl.style.display = ''; } });
  });

  // Delete label
  document.getElementById(`${side}-delete-label`).addEventListener('click', async () => {
    if (!await confirmDialog(t('labels.deleteConfirm', { name: label?.name }))) return;
    await api.delete(`/labels/${labelId}`);
    if (side === 'left') { leftLabelId = null; leftContacts = []; }
    else { rightLabelId = null; rightContacts = []; }
    const data = await api.get('/labels');
    allLabels = data.labels;
    populateSelects();
    loadPanel(side);
  });

  // Add contact to label — floating dropdown search
  document.getElementById(`${side}-add-contact`).addEventListener('click', () => {
    // Remove existing search if open
    document.getElementById(`${side}-search-area`)?.remove();
    const searchHtml = `<div class="label-search-floating" id="${side}-search-area">
      <input type="text" class="form-control form-control-sm" id="${side}-contact-search" placeholder="${t('common.search')}">
      <div id="${side}-search-results" class="label-search-dropdown"></div>
    </div>`;
    listEl.insertAdjacentHTML('beforebegin', searchHtml);
    const searchInput = document.getElementById(`${side}-contact-search`);
    let searchTimeout;
    searchInput.focus();
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const q = searchInput.value.trim();
      const resultsEl = document.getElementById(`${side}-search-results`);
      if (q.length < 2) { resultsEl.innerHTML = ''; resultsEl.style.display = 'none'; return; }
      searchTimeout = setTimeout(async () => {
        const data = await api.get(`/contacts?search=${encodeURIComponent(q)}&limit=8`);
        resultsEl.innerHTML = data.contacts.map(c => `
          <div class="contact-row label-search-result" data-uuid="${c.uuid}" style="cursor:pointer">
            <div class="contact-row-avatar">
              ${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${(c.first_name[0] || '') + (c.last_name?.[0] || '')}</span>`}
            </div>
            <div class="contact-row-info"><div class="contact-row-name">${c.first_name} ${c.last_name || ''}</div></div>
          </div>
        `).join('');
        resultsEl.style.display = data.contacts.length ? 'block' : 'none';
        resultsEl.querySelectorAll('.label-search-result').forEach(row => {
          row.addEventListener('click', async () => {
            await api.post(`/labels/${labelId}/contacts`, { contact_uuid: row.dataset.uuid });
            document.getElementById(`${side}-search-area`)?.remove();
            loadPanel(side);
          });
        });
      }, 200);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { document.getElementById(`${side}-search-area`)?.remove(); return; }
      const resultsEl = document.getElementById(`${side}-search-results`);
      const items = resultsEl?.querySelectorAll('.label-search-result') || [];
      const active = resultsEl?.querySelector('.label-search-result.active');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = active ? active.nextElementSibling : items[0];
        if (active) active.classList.remove('active');
        if (next) { next.classList.add('active'); next.scrollIntoView({ block: 'nearest' }); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = active?.previousElementSibling;
        if (active) active.classList.remove('active');
        if (prev) { prev.classList.add('active'); prev.scrollIntoView({ block: 'nearest' }); }
      } else if (e.key === 'Enter' && active) {
        e.preventDefault();
        active.click();
      }
    });
  });

  try {
    const { contacts } = await api.get(`/labels/${labelId}/contacts`);
    if (side === 'left') leftContacts = contacts;
    else rightContacts = contacts;
    toolbar.classList.remove('d-none');
    renderPanel(side);
  } catch {
    listEl.innerHTML = '';
  }
}

function renderPanel(side) {
  const contacts = side === 'left' ? leftContacts : rightContacts;
  const selected = side === 'left' ? selectedLeft : selectedRight;
  const listEl = document.getElementById(`${side}-list`);
  const countEl = document.getElementById(`${side}-count`);

  if (!contacts.length) {
    listEl.innerHTML = `<p class="text-muted small p-3">${t('labels.noContacts')}</p>`;
    countEl.textContent = '';
    updateTransferButtons();
    return;
  }

  listEl.innerHTML = contacts.map(c => `
    <div class="label-contact-row ${selected.has(c.uuid) ? 'selected' : ''}" data-uuid="${c.uuid}">
      <input type="checkbox" ${selected.has(c.uuid) ? 'checked' : ''}>
      <div class="contact-row-avatar">
        ${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${(c.first_name[0] || '') + (c.last_name?.[0] || '')}</span>`}
      </div>
      <span class="contact-row-name">${c.first_name} ${c.last_name || ''}</span>
    </div>
  `).join('');

  countEl.textContent = selected.size ? `${selected.size} / ${contacts.length}` : `${contacts.length}`;

  // Click handlers
  listEl.querySelectorAll('.label-contact-row').forEach(row => {
    row.addEventListener('click', () => {
      const uuid = row.dataset.uuid;
      if (selected.has(uuid)) selected.delete(uuid);
      else selected.add(uuid);
      renderPanel(side);
    });
  });

  updateTransferButtons();
}

function updateTransferButtons() {
  const hasLeft = selectedLeft.size > 0 && rightLabelId;
  const hasRight = selectedRight.size > 0 && leftLabelId;
  document.getElementById('btn-move-right').disabled = !hasLeft;
  document.getElementById('btn-copy-right').disabled = !hasLeft;
  document.getElementById('btn-move-left').disabled = !hasRight;
  document.getElementById('btn-copy-left').disabled = !hasRight;
}

async function transfer(mode, direction) {
  // direction: 'right' means left→right, 'left' means right→left
  const sourceSelected = direction === 'right' ? selectedLeft : selectedRight;
  const sourceLabelId = direction === 'right' ? leftLabelId : rightLabelId;
  const targetLabelId = direction === 'right' ? rightLabelId : leftLabelId;
  const uuids = [...sourceSelected];

  if (!uuids.length || !targetLabelId) return;

  try {
    // Add to target
    await api.post(`/labels/${targetLabelId}/contacts/batch`, { contact_uuids: uuids });

    // If move (not copy), remove from source
    if (mode === 'move') {
      await api.post(`/labels/${sourceLabelId}/contacts/batch-remove`, { contact_uuids: uuids });
    }

    // Reload both panels and refresh label counts
    sourceSelected.clear();
    const data = await api.get('/labels');
    allLabels = data.labels;
    populateSelects();
    // Re-select current labels
    document.getElementById('left-label-select').value = leftLabelId || '';
    document.getElementById('right-label-select').value = rightLabelId || '';
    await Promise.all([loadPanel('left'), loadPanel('right')]);
  } catch (err) {
    confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
  }
}
