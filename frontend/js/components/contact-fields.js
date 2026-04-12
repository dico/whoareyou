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

  // Auto-detect field type from value
  const addForm = el.querySelector('#field-add-form');
  const autoBadge = addForm?.querySelector('.field-auto-badge');
  const addSelect = addForm?.querySelector('.field-type-select');

  // Click badge to toggle manual select
  autoBadge?.addEventListener('click', () => {
    addSelect.style.display = addSelect.style.display === 'none' ? '' : 'none';
    autoBadge.style.display = addSelect.style.display === 'none' ? '' : 'none';
  });

  addForm?.querySelector('.field-value-input')?.addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    const typeMap = {
      'facebook.com': 'facebook', 'fb.com': 'facebook',
      'instagram.com': 'instagram',
      'linkedin.com': 'linkedin',
      'x.com': 'twitter', 'twitter.com': 'twitter',
      'snapchat.com': 'snapchat',
      'youtube.com': 'youtube', 'youtu.be': 'youtube',
      'tiktok.com': 'tiktok',
    };
    let detected = null;
    for (const [domain, type] of Object.entries(typeMap)) {
      if (val.includes(domain)) { detected = type; break; }
    }
    if (!detected && val.includes('@') && val.includes('.') && !val.includes('://')) detected = 'email';
    if (!detected && /^[+\d][\d\s\-().]{6,}$/.test(val)) detected = 'phone';
    if (!detected && (val.startsWith('http') || val.startsWith('www.'))) detected = 'website';

    if (detected) {
      const opt = [...addSelect.options].find(o => {
        const n = o.text.toLowerCase();
        return n === detected || n.includes(detected) || (detected === 'email' && (n.includes('e-post') || n === 'email'))
          || (detected === 'phone' && (n.includes('telefon') || n === 'phone'))
          || (detected === 'website' && (n.includes('nettside') || n === 'website'));
      });
      if (opt) addSelect.value = opt.value;
      if (autoBadge) autoBadge.innerHTML = `<i class="bi bi-check-circle me-1"></i>${capitalize(detected)}`;
    } else if (autoBadge) {
      autoBadge.innerHTML = '<i class="bi bi-magic me-1"></i>auto';
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
const WEB_TYPES = ['website'];

// Group fields by type for display — each type gets its own visual
// section so phone numbers stay together, emails stay together, etc.
function groupFields(fields) {
  const order = ['phone', 'email', 'website', ...SOCIAL_TYPES];
  const byType = new Map();
  for (const f of fields) {
    const key = f.type || '_other';
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key).push(f);
  }
  // Sort groups: known types first (in defined order), then unknowns at end
  const groups = [];
  for (const t of order) {
    if (byType.has(t)) { groups.push({ fields: byType.get(t) }); byType.delete(t); }
  }
  for (const [, v] of byType) groups.push({ fields: v });
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
  const typeNames = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', twitter: 'X', snapchat: 'Snapchat', youtube: 'YouTube', tiktok: 'TikTok' };
  const displayValue = isSocial ? (f.label || typeNames[f.type] || f.type) : f.value;
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
        <a href="${href}" target="_blank" rel="noopener">${escapeHtml(f.type === 'phone' ? formatPhone(f.value) : f.value)}</a>
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
      <select class="form-select form-select-sm field-type-select" ${!field ? 'style="display:none"' : ''}>
        ${types.map(tp => `<option value="${tp.id}" ${field && field.type === tp.name ? 'selected' : ''}>${capitalize(tp.name)}</option>`).join('')}
      </select>
      ${!field ? '<span class="field-auto-badge text-muted small" style="white-space:nowrap"><i class="bi bi-magic me-1"></i>auto</span>' : ''}
      <input type="text" class="form-control form-control-sm field-value-input" placeholder="${!field ? t('fields.autoPlaceholder') : t('fields.valuePlaceholder')}" value="${field ? escapeAttr(field.value) : ''}" required>
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
  // If value is a full URL, try to extract username/handle
  const url = value.replace(/\/+$/, '');
  const lastSegment = url.split('/').pop();
  const clean = lastSegment.replace(/^@/, '').split('?')[0]; // remove query params
  // If result is empty or looks like a file (e.g. profile.php), use type name
  if (!clean || /\.\w{2,4}$/.test(clean) || clean.length < 2) {
    const typeNames = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', twitter: 'X', snapchat: 'Snapchat', youtube: 'YouTube', tiktok: 'TikTok' };
    return typeNames[type] || type;
  }
  return clean;
}

function formatPhone(value) {
  // Normalize: remove all non-digit except leading +
  const hasPlus = value.startsWith('+');
  const digits = value.replace(/\D/g, '');
  // Norwegian 8-digit: XX XX XX XX
  if (digits.length === 8 && !hasPlus) {
    return digits.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4');
  }
  // +47 XX XX XX XX
  if (digits.length === 10 && digits.startsWith('47')) {
    return '+47 ' + digits.slice(2).replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4');
  }
  if (digits.length === 11 && digits.startsWith('47')) {
    return '+47 ' + digits.slice(2).replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4');
  }
  // International: keep + prefix, group by 3s
  if (hasPlus) return '+' + digits.replace(/(\d{2})(\d{3})(\d{2})(\d{3})/, '$1 $2 $3 $4');
  return value; // fallback: return as-is
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
