import { api } from '../api/client.js';
import { confirmDialog } from './dialogs.js';
import { t } from '../utils/i18n.js';

let fieldTypes = null;

async function getFieldTypes() {
  if (!fieldTypes) {
    const data = await api.get('/contacts/field-types/list');
    fieldTypes = data.types;
  }
  return fieldTypes;
}

/**
 * Render the contact info section with inline add/edit/delete.
 * @param {string} containerId - DOM element ID
 * @param {string} contactUuid - Contact UUID
 * @param {Array} fields - Current fields from contact detail API
 */
export async function renderContactFields(containerId, contactUuid, fields) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const types = await getFieldTypes();

  el.innerHTML = `
    <h4>
      <i class="bi bi-telephone"></i> ${t('fields.title')}
      <button type="button" class="btn btn-link btn-sm field-add-btn" id="btn-add-field" title="Add">
        <i class="bi bi-plus-lg"></i>
      </button>
    </h4>
    ${fields.length ? `
      <div class="detail-fields" id="fields-list">
        ${renderGroupedFields(fields)}
      </div>
    ` : `
      <div class="detail-fields" id="fields-list">
        <p class="text-muted small" id="fields-empty">${t('fields.noFields')}</p>
      </div>
    `}
    <div id="field-add-form" class="field-form d-none">
      ${renderFieldForm(types)}
    </div>
  `;

  // Add field button
  el.querySelector('#btn-add-field').addEventListener('click', () => {
    const form = el.querySelector('#field-add-form');
    form.classList.toggle('d-none');
    if (!form.classList.contains('d-none')) {
      form.querySelector('.field-value-input').focus();
    }
  });

  // Add field form submit
  el.querySelector('#field-add-form form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fieldTypeId = parseInt(form.querySelector('.field-type-select').value);
    const value = form.querySelector('.field-value-input').value.trim();
    const label = form.querySelector('.field-label-input').value.trim();

    if (!value) return;

    try {
      const { field } = await api.post(`/contacts/${contactUuid}/fields`, {
        field_type_id: fieldTypeId,
        value,
        label: label || undefined,
      });

      // Re-render grouped list with new field
      const list = el.querySelector('#fields-list');
      const existing = list.querySelectorAll('.detail-field:not(.editing)');
      const allFields = [];
      existing.forEach(row => {
        allFields.push({ id: row.dataset.fieldId, type: row.dataset.type, value: row.dataset.value, label: row.dataset.label, icon: row.querySelector('i')?.className });
      });
      allFields.push(field);
      list.innerHTML = renderGroupedFields(allFields);
      list.querySelectorAll('.detail-field').forEach(row => attachFieldHandlers(row, contactUuid));

      // Reset form
      form.querySelector('.field-value-input').value = '';
      form.querySelector('.field-label-input').value = '';
      el.querySelector('#field-add-form').classList.add('d-none');
    } catch (err) {
      confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
    }
  });

  // Cancel add
  el.querySelector('.field-form-cancel').addEventListener('click', () => {
    el.querySelector('#field-add-form').classList.add('d-none');
  });

  // Attach handlers to existing fields
  el.querySelectorAll('.detail-field').forEach(row => {
    attachFieldHandlers(row, contactUuid);
  });
}

const SOCIAL_TYPES = ['facebook', 'instagram', 'linkedin', 'x', 'snapchat', 'youtube', 'tiktok'];
const CONTACT_TYPES = ['phone', 'email'];
const WEB_TYPES = ['website'];

// Group fields by category for display
function groupFields(fields) {
  const groups = [];
  const contact = fields.filter(f => CONTACT_TYPES.includes(f.type));
  const web = fields.filter(f => WEB_TYPES.includes(f.type));
  const social = fields.filter(f => SOCIAL_TYPES.includes(f.type));
  const other = fields.filter(f => !CONTACT_TYPES.includes(f.type) && !WEB_TYPES.includes(f.type) && !SOCIAL_TYPES.includes(f.type));

  if (contact.length) groups.push({ fields: contact });
  if (web.length) groups.push({ fields: web });
  if (social.length) groups.push({ fields: social });
  if (other.length) groups.push({ fields: other });
  return groups;
}

function renderGroupedFields(fields) {
  const groups = groupFields(fields);
  return groups.map((group, i) => `
    <div class="field-group${i > 0 ? ' field-group-separated' : ''}">
      ${group.fields.map(f => renderFieldRow(f)).join('')}
    </div>
  `).join('');
}

function renderFieldRow(f) {
  const isSocial = SOCIAL_TYPES.includes(f.type);
  const isWebsite = f.type === 'website';
  const displayValue = isSocial ? formatSocialValue(f.value, f.type) : f.value;
  const href = buildFieldHref(f);

  // For websites: show label if available, otherwise show domain
  const websiteDisplay = isWebsite
    ? (f.label || extractDomain(f.value))
    : null;

  return `
    <div class="detail-field ${isSocial || isWebsite ? 'field-social' : ''}" data-field-id="${f.id}" data-type="${f.type || ''}" data-value="${escapeAttr(f.value)}" data-label="${escapeAttr(f.label || '')}">
      <a href="${href}" target="_blank" rel="noopener" class="field-link" title="${escapeAttr(f.value)}">
        <i class="${f.icon || 'bi bi-info-circle'}"></i>
        ${isSocial ? `<span class="field-social-name">${escapeHtml(displayValue)}</span>` : ''}
        ${isWebsite ? `<span class="field-social-name">${escapeHtml(websiteDisplay)}</span>` : ''}
      </a>
      ${!isSocial && !isWebsite ? `
      <div class="field-content">
        <a href="${href}" target="_blank" rel="noopener">${escapeHtml(f.value)}</a>
        ${f.label ? `<span class="text-muted small">${escapeHtml(f.label)}</span>` : ''}
      </div>
      ` : ''}
      <div class="field-actions">
        <button type="button" class="btn btn-link btn-sm btn-edit-field" title="Edit"><i class="bi bi-pencil"></i></button>
        <button type="button" class="btn btn-link btn-sm text-danger btn-delete-field" title="Delete"><i class="bi bi-trash"></i></button>
      </div>
    </div>
  `;
}

function renderFieldForm(types, field = null) {
  return `
    <form class="field-inline-form">
      <select class="form-select form-select-sm field-type-select">
        ${types.map(t => `<option value="${t.id}" ${field && field.type === t.name ? 'selected' : ''}>${capitalize(t.name)}</option>`).join('')}
      </select>
      <input type="text" class="form-control form-control-sm field-value-input" placeholder="${t('fields.valuePlaceholder')}" value="${field ? escapeAttr(field.value) : ''}" required>
      <input type="text" class="form-control form-control-sm field-label-input" placeholder="${t('fields.labelPlaceholder')}" value="${field ? escapeAttr(field.label || '') : ''}">
      <div class="field-form-actions">
        <button type="submit" class="btn btn-primary btn-sm">${field ? 'Save' : 'Add'}</button>
        <button type="button" class="btn btn-outline-secondary btn-sm field-form-cancel">Cancel</button>
      </div>
    </form>
  `;
}

function attachFieldHandlers(row, contactUuid) {
  const fieldId = row.dataset.fieldId;

  // Delete
  row.querySelector('.btn-delete-field')?.addEventListener('click', async () => {
    if (await confirmDialog(t('fields.deleteConfirm'), { title: t('fields.deleteField'), confirmText: t('common.delete') })) {
      try {
        await api.delete(`/contacts/${contactUuid}/fields/${fieldId}`);
        row.remove();
      } catch (err) {
        confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
      }
    }
  });

  // Edit — inline replace
  row.querySelector('.btn-edit-field')?.addEventListener('click', async () => {
    const types = await getFieldTypes();
    const currentValue = row.dataset.value || '';
    const currentLabel = row.dataset.label || '';
    const currentTypeName = row.dataset.type || '';

    const editHtml = `
      <div class="detail-field editing" data-field-id="${fieldId}">
        ${renderFieldForm(types, { type: currentTypeName, value: currentValue, label: currentLabel })}
      </div>
    `;

    row.insertAdjacentHTML('afterend', editHtml);
    const editRow = row.nextElementSibling;
    row.classList.add('d-none');

    // Focus value input
    editRow.querySelector('.field-value-input').focus();

    // Save
    editRow.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fieldTypeId = parseInt(editRow.querySelector('.field-type-select').value);
      const value = editRow.querySelector('.field-value-input').value.trim();
      const label = editRow.querySelector('.field-label-input').value.trim();

      if (!value) return;

      try {
        const { field } = await api.put(`/contacts/${contactUuid}/fields/${fieldId}`, {
          field_type_id: fieldTypeId,
          value,
          label: label || undefined,
        });

        // Replace row
        const newRow = document.createElement('div');
        newRow.innerHTML = renderFieldRow(field);
        const newFieldRow = newRow.firstElementChild;
        editRow.replaceWith(newFieldRow);
        row.remove();
        attachFieldHandlers(newFieldRow, contactUuid);
      } catch (err) {
        confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
      }
    });

    // Cancel
    editRow.querySelector('.field-form-cancel').addEventListener('click', () => {
      editRow.remove();
      row.classList.remove('d-none');
    });
  });
}

function extractDomain(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function formatSocialValue(value, type) {
  // If value is a full URL, extract the username/handle part
  const url = value.replace(/\/+$/, '');
  const lastSegment = url.split('/').pop();
  // Remove @ prefix if present
  return lastSegment.replace(/^@/, '');
}

function buildFieldHref(f) {
  // If value is already a full URL, use it directly
  if (f.value.startsWith('http://') || f.value.startsWith('https://')) {
    return f.value;
  }
  return (f.protocol || '') + f.value;
}

function capitalize(str) {
  return t(`fieldTypes.${str}`) !== `fieldTypes.${str}` ? t(`fieldTypes.${str}`) : str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
