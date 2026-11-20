import { api } from '../api/client.js';
import { t, getLocale } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';
import { attachGroupSearch } from '../components/group-picker.js';

// Kontaktoversikt — a filtered table of contacts with chosen columns
// (own fields, or fields of related people such as parents). Built for
// "who in 9A–9C do I have parent phone numbers for?" but generic: filters
// and columns are typed pieces that map 1:1 to POST /api/reports/contacts.
//
// The whole setup lives in the URL (?v=<json>) so a view can be bookmarked,
// shared within the household and reopened from the contacts page.

const FILTER_TYPES = ['group', 'label', 'name', 'last_name', 'relation', 'field', 'birth_year', 'birth_month', 'city', 'favorite'];
const FILTER_ICONS = {
  group: 'bi-diagram-3', label: 'bi-tag', name: 'bi-person', last_name: 'bi-person-vcard',
  relation: 'bi-people', field: 'bi-ui-checks', birth_year: 'bi-calendar', birth_month: 'bi-cake2',
  city: 'bi-geo-alt', favorite: 'bi-star',
};
// "Has / missing" checks that aren't contact field types.
const BUILTIN_FIELDS = ['birthday', 'birth_year', 'address', 'photo', 'group', 'label'];
const SIMPLE_COLUMNS = ['birthday', 'address', 'groups', 'labels'];
const DEFAULT_COLUMNS = [{ type: 'birthday' }, { type: 'field', field: 'phone' }, { type: 'field', field: 'email' }];

const PRESETS = {
  parents: [{ type: 'relation', role: 'parent', fields: ['phone', 'email'] }],
  contactInfo: [{ type: 'field', field: 'phone' }, { type: 'field', field: 'email' }, { type: 'address' }],
  birthdays: [{ type: 'birthday' }],
};

let view = { filters: [], columns: [], sort: 'first' };
let meta = { labels: [], fieldTypes: [], roles: [] };
let lastResult = null;
let runSeq = 0;

export async function renderContactOverview() {
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="page-container contact-overview">
      <div class="page-header">
        <div>
          <a href="/contacts" data-link class="text-muted small report-back"><i class="bi bi-arrow-left"></i> ${t('contacts.title')}</a>
          <h2>${t('overview.title')}</h2>
        </div>
        <div class="report-actions d-flex gap-2">
          <button class="btn btn-outline-secondary btn-sm" id="ov-print"><i class="bi bi-printer"></i> <span class="d-none d-sm-inline">${t('overview.print')}</span></button>
          <button class="btn btn-outline-secondary btn-sm" id="ov-csv"><i class="bi bi-download"></i> <span class="d-none d-sm-inline">CSV</span></button>
        </div>
      </div>

      <div class="report-controls glass-card">
        <div class="report-section">
          <div class="report-section-head">
            <span class="report-section-title">${t('overview.who')}</span>
            <div class="dropdown">
              <button class="btn btn-outline-primary btn-sm dropdown-toggle" data-bs-toggle="dropdown" id="ov-add-filter">
                <i class="bi bi-funnel"></i> ${t('overview.addFilter')}
              </button>
              <ul class="dropdown-menu">
                ${FILTER_TYPES.map(type => `
                  <li><button class="dropdown-item" data-add-filter="${type}">
                    <i class="bi ${FILTER_ICONS[type]} me-2"></i>${t('overview.filters.' + type)}
                  </button></li>`).join('')}
              </ul>
            </div>
          </div>
          <div id="ov-filters" class="report-filters"></div>
        </div>

        <div class="report-section">
          <div class="report-section-head">
            <span class="report-section-title">${t('overview.show')}</span>
            <div class="report-presets">
              <span class="text-muted small">${t('overview.presets')}:</span>
              ${Object.keys(PRESETS).map(p => `<button class="btn btn-link btn-sm p-0" data-preset="${p}">${t('overview.preset.' + p)}</button>`).join('')}
            </div>
          </div>
          <div id="ov-columns" class="report-columns"></div>
        </div>
      </div>

      <div class="report-result-bar">
        <span id="ov-count" class="text-muted small"></span>
        <select class="form-select form-select-sm sort-select" id="ov-sort">
          <option value="first">${t('contacts.sortNameAZ')}</option>
          <option value="last">${t('overview.sortLastName')}</option>
          <option value="birthday">${t('overview.sortBirthday')}</option>
          <option value="age">${t('overview.sortAge')}</option>
        </select>
      </div>
      <div class="report-print-head">
        <h3>${t('overview.title')}</h3>
        <div id="ov-print-summary" class="small"></div>
      </div>
      <div id="ov-result"><div class="loading">${t('app.loading')}</div></div>
    </div>
  `;

  const [labels, fieldTypes, relTypes] = await Promise.all([
    api.get('/labels').then(r => r.labels).catch(() => []),
    api.get('/contacts/field-types/list').then(r => r.types).catch(() => []),
    api.get('/relationships/types').then(r => r.types).catch(() => []),
  ]);
  meta = {
    labels,
    fieldTypes: [...new Map(fieldTypes.map(f => [f.name, f])).values()],
    roles: [...new Set(relTypes.flatMap(r => [r.name, r.inverse_name]).filter(Boolean))]
      .sort((a, b) => roleLabel(a).localeCompare(roleLabel(b), getLocale())),
  };

  view = readViewFromUrl();
  document.getElementById('ov-sort').value = view.sort;

  content.querySelectorAll('[data-add-filter]').forEach(btn => btn.addEventListener('click', () => {
    view.filters.push(newFilter(btn.dataset.addFilter));
    renderFilters();
    // Focus the new row's first input so the user can type right away.
    document.querySelector('#ov-filters .report-filter:last-child input, #ov-filters .report-filter:last-child select')?.focus();
    if (isComplete(view.filters.at(-1))) run();
  }));
  content.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => {
    view.columns = structuredClone(PRESETS[btn.dataset.preset]);
    renderColumns();
    run();
  }));
  document.getElementById('ov-sort').addEventListener('change', (e) => {
    view.sort = e.target.value;
    saveViewToUrl();
    renderResult();
  });
  document.getElementById('ov-print').addEventListener('click', () => window.print());
  document.getElementById('ov-csv').addEventListener('click', downloadCsv);

  renderFilters();
  renderColumns();
  run();
}

// ── View state (URL) ──

function readViewFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('v')) {
    try {
      const v = JSON.parse(params.get('v'));
      return {
        filters: Array.isArray(v.filters) ? v.filters.filter(f => FILTER_TYPES.includes(f?.type)) : [],
        columns: Array.isArray(v.columns) ? v.columns : DEFAULT_COLUMNS,
        sort: ['first', 'last', 'birthday', 'age'].includes(v.sort) ? v.sort : 'first',
      };
    } catch { /* fall through to defaults */ }
  }
  // Entry from the contacts page: its filters arrive as plain params.
  const filters = [];
  if (params.get('company')) filters.push({ type: 'group', uuid: params.get('company'), name: params.get('company_name') || '', subgroups: true });
  if (params.get('label')) {
    const label = meta.labels.find(l => l.name === params.get('label'));
    if (label) filters.push({ type: 'label', id: label.id });
  }
  if (params.get('birth_year')) filters.push({ type: 'birth_year', from: params.get('birth_year'), to: params.get('birth_year') });
  if (params.get('search')) filters.push({ type: 'name', value: params.get('search') });
  if (params.get('favorite') === '1') filters.push({ type: 'favorite' });
  return { filters, columns: structuredClone(DEFAULT_COLUMNS), sort: 'first' };
}

function saveViewToUrl() {
  const url = `/contacts/overview?v=${encodeURIComponent(JSON.stringify(view))}`;
  window.history.replaceState({}, '', url);
}

function newFilter(type) {
  switch (type) {
    case 'group': return { type, uuid: '', name: '', subgroups: true };
    case 'label': return { type, id: meta.labels[0]?.id || '' };
    case 'relation': return { type, mode: 'missing', role: 'parent' };
    case 'field': return { type, mode: 'missing', field: 'phone' };
    case 'birth_month': return { type, value: new Date().getMonth() + 1 };
    case 'favorite': return { type };
    default: return { type, value: '' };
  }
}

/** Incomplete filters (empty group pick, empty text) are not sent. */
function isComplete(f) {
  switch (f.type) {
    case 'group': return !!f.uuid;
    case 'label': return !!f.id;
    case 'name': case 'last_name': case 'city': return !!f.value?.trim();
    case 'birth_year': return !!(f.from || f.to);
    default: return true;
  }
}

// ── Filters ──

function renderFilters() {
  const el = document.getElementById('ov-filters');
  if (!view.filters.length) {
    el.innerHTML = `<div class="text-muted small">${t('overview.noFilters')}</div>`;
    return;
  }
  el.innerHTML = view.filters.map((f, i) => `
    <div class="report-filter" data-i="${i}">
      <span class="report-filter-label"><i class="bi ${FILTER_ICONS[f.type]}"></i> ${t('overview.filters.' + f.type)}</span>
      <div class="report-filter-controls">${filterControlsHtml(f, i)}</div>
      <button class="btn btn-link btn-sm text-muted report-filter-remove" data-remove="${i}" title="${t('common.delete')}"><i class="bi bi-x-lg"></i></button>
    </div>
  `).join('');

  el.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => {
    view.filters.splice(parseInt(btn.dataset.remove), 1);
    renderFilters();
    run();
  }));

  // Generic bindings: data-key on inputs/selects/checkboxes
  let timer;
  el.querySelectorAll('[data-key]').forEach(input => {
    const i = parseInt(input.closest('.report-filter').dataset.i);
    const apply = () => {
      const f = view.filters[i];
      const key = input.dataset.key;
      f[key] = input.type === 'checkbox' ? input.checked : input.value;
      if (key === 'mode' && !f[key]) delete f[key];
    };
    if (input.tagName === 'INPUT' && input.type !== 'checkbox') {
      input.addEventListener('input', () => { apply(); clearTimeout(timer); timer = setTimeout(run, 400); });
    } else {
      input.addEventListener('change', () => { apply(); run(); });
    }
  });

  // Group filters: chip with clear, or inline search
  el.querySelectorAll('[data-group-clear]').forEach(btn => btn.addEventListener('click', () => {
    const f = view.filters[parseInt(btn.dataset.groupClear)];
    f.uuid = ''; f.name = '';
    renderFilters();
    run();
  }));
  el.querySelectorAll('.report-group-search').forEach(wrap => {
    const i = parseInt(wrap.closest('.report-filter').dataset.i);
    const input = wrap.querySelector('input');
    const results = wrap.querySelector('.contact-search-results');
    results.classList.add('d-none');
    input.addEventListener('focus', () => results.classList.remove('d-none'));
    input.addEventListener('blur', () => setTimeout(() => results.classList.add('d-none'), 200));
    attachGroupSearch(input, results, {
      onSelect: (g) => {
        Object.assign(view.filters[i], { uuid: g.uuid, name: g.name });
        renderFilters();
        run();
      },
    });
  });
}

function modeSelect(f, options) {
  return `<select class="form-select form-select-sm report-mode" data-key="mode">
    ${options.map(([value, key]) => `<option value="${value}" ${(f.mode || '') === value ? 'selected' : ''}>${t(key)}</option>`).join('')}
  </select>`;
}

function filterControlsHtml(f, i) {
  switch (f.type) {
    case 'group': {
      const mode = modeSelect(f, [['', 'overview.mode.isIn'], ['not', 'overview.mode.notIn']]);
      const picker = f.uuid
        ? `<span class="contact-chip"><i class="bi bi-diagram-3 me-1"></i>${esc(f.name || t('overview.filters.group'))}
             <button type="button" class="contact-chip-remove" data-group-clear="${i}" aria-label="${t('common.delete')}">×</button></span>`
        : `<div class="report-group-search">
             <input type="text" class="form-control form-control-sm" placeholder="${t('overview.searchGroup')}" autocomplete="off">
             <div class="contact-search-results"></div>
           </div>`;
      return `${mode}${picker}
        <label class="form-check form-check-inline small mb-0">
          <input type="checkbox" class="form-check-input" data-key="subgroups" ${f.subgroups !== false ? 'checked' : ''}>
          <span class="form-check-label">${t('overview.includeSubgroups')}</span>
        </label>`;
    }
    case 'label':
      return `${modeSelect(f, [['', 'overview.mode.has'], ['not', 'overview.mode.hasNot']])}
        <select class="form-select form-select-sm" data-key="id">
          ${meta.labels.map(l => `<option value="${l.id}" ${String(f.id) === String(l.id) ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
        </select>`;
    case 'name': case 'last_name': case 'city':
      return `<input type="text" class="form-control form-control-sm" data-key="value" value="${esc(f.value || '')}" placeholder="${t('overview.contains')}">`;
    case 'relation':
      return `${modeSelect(f, [['', 'overview.mode.has'], ['missing', 'overview.mode.missing']])}
        <select class="form-select form-select-sm" data-key="role">
          ${meta.roles.map(r => `<option value="${r}" ${f.role === r ? 'selected' : ''}>${esc(roleLabel(r))}</option>`).join('')}
        </select>`;
    case 'field':
      return `${modeSelect(f, [['', 'overview.mode.has'], ['missing', 'overview.mode.missing']])}
        <select class="form-select form-select-sm" data-key="field">
          <optgroup label="${t('overview.fieldGroups.person')}">
            ${BUILTIN_FIELDS.map(b => `<option value="${b}" ${f.field === b ? 'selected' : ''}>${t('overview.builtin.' + b)}</option>`).join('')}
          </optgroup>
          <optgroup label="${t('overview.fieldGroups.contactInfo')}">
            ${meta.fieldTypes.map(ft => `<option value="${esc(ft.name)}" ${f.field === ft.name ? 'selected' : ''}>${esc(fieldLabel(ft.name))}</option>`).join('')}
          </optgroup>
        </select>`;
    case 'birth_year':
      return `<input type="number" class="form-control form-control-sm report-year" data-key="from" value="${esc(f.from || '')}" placeholder="${t('overview.from')}">
        <span class="text-muted">–</span>
        <input type="number" class="form-control form-control-sm report-year" data-key="to" value="${esc(f.to || '')}" placeholder="${t('overview.to')}">`;
    case 'birth_month':
      return `<select class="form-select form-select-sm" data-key="value">
        ${Array.from({ length: 12 }, (_, m) => `<option value="${m + 1}" ${parseInt(f.value) === m + 1 ? 'selected' : ''}>${monthName(m + 1)}</option>`).join('')}
      </select>`;
    case 'favorite':
      return modeSelect(f, [['', 'overview.mode.isFavorite'], ['not', 'overview.mode.notFavorite']]);
    default:
      return '';
  }
}

// ── Columns ──

function columnKey(c) {
  return c.type === 'field' ? `field:${c.field}` : c.type === 'relation' ? `rel:${c.role}` : c.type;
}

function columnLabel(c) {
  if (c.type === 'field') return fieldLabel(c.field);
  if (c.type === 'relation') return roleLabel(c.role);
  return t('overview.columns.' + c.type);
}

function renderColumns() {
  const el = document.getElementById('ov-columns');
  const active = new Set(view.columns.map(columnKey));
  const available = [
    ...SIMPLE_COLUMNS.filter(c => !active.has(c)).map(c => ({ type: c })),
    ...meta.fieldTypes.filter(ft => !active.has(`field:${ft.name}`)).map(ft => ({ type: 'field', field: ft.name })),
  ];

  el.innerHTML = `
    <span class="contact-chip report-col-fixed"><i class="bi bi-person me-1"></i>${t('overview.columns.name')}</span>
    ${view.columns.map((c, i) => c.type === 'relation' ? relationChipHtml(c, i) : `
      <span class="contact-chip">${esc(columnLabel(c))}
        <button type="button" class="contact-chip-remove" data-col-remove="${i}" aria-label="${t('common.delete')}">×</button>
      </span>`).join('')}
    <div class="dropdown d-inline-block">
      <button class="btn btn-outline-secondary btn-sm dropdown-toggle" data-bs-toggle="dropdown"><i class="bi bi-plus-lg"></i> ${t('overview.addColumn')}</button>
      <ul class="dropdown-menu report-col-menu">
        ${available.map(c => `<li><button class="dropdown-item" data-col-add='${esc(JSON.stringify(c))}'>${esc(columnLabel(c))}</button></li>`).join('')}
        <li><hr class="dropdown-divider"></li>
        <li><h6 class="dropdown-header">${t('overview.relatedPeople')}</h6></li>
        ${meta.roles.filter(r => !active.has(`rel:${r}`)).map(r => `
          <li><button class="dropdown-item" data-col-add='${esc(JSON.stringify({ type: 'relation', role: r, fields: ['phone', 'email'] }))}'>
            <i class="bi bi-people me-2"></i>${esc(roleLabel(r))}</button></li>`).join('')}
      </ul>
    </div>
  `;

  el.querySelectorAll('[data-col-remove]').forEach(btn => btn.addEventListener('click', () => {
    view.columns.splice(parseInt(btn.dataset.colRemove), 1);
    renderColumns();
    run();
  }));
  el.querySelectorAll('[data-col-add]').forEach(btn => btn.addEventListener('click', () => {
    view.columns.push(JSON.parse(btn.dataset.colAdd));
    renderColumns();
    run();
  }));
  el.querySelectorAll('[data-rel-field]').forEach(cb => cb.addEventListener('change', () => {
    const col = view.columns[parseInt(cb.dataset.col)];
    const set = new Set(col.fields);
    if (cb.checked) set.add(cb.dataset.relField); else set.delete(cb.dataset.relField);
    col.fields = meta.fieldTypes.map(f => f.name).filter(n => set.has(n));
    renderColumns();
    run();
  }));
}

function relationChipHtml(c, i) {
  const fields = c.fields.length ? ` <span class="text-muted">(${c.fields.map(f => esc(fieldLabel(f).toLowerCase())).join(', ')})</span>` : '';
  return `
    <span class="contact-chip dropdown">
      <button class="btn btn-link btn-sm p-0 report-chip-btn" data-bs-toggle="dropdown" data-bs-auto-close="outside">
        <i class="bi bi-people me-1"></i>${esc(roleLabel(c.role))}${fields}
      </button>
      <div class="dropdown-menu p-2">
        <div class="small text-muted mb-1">${t('overview.relatedFields')}</div>
        ${meta.fieldTypes.map(ft => `
          <label class="form-check small">
            <input type="checkbox" class="form-check-input" data-col="${i}" data-rel-field="${esc(ft.name)}" ${c.fields.includes(ft.name) ? 'checked' : ''}>
            <span class="form-check-label">${esc(fieldLabel(ft.name))}</span>
          </label>`).join('')}
      </div>
      <button type="button" class="contact-chip-remove" data-col-remove="${i}" aria-label="${t('common.delete')}">×</button>
    </span>`;
}

// ── Load + render result ──

async function run() {
  saveViewToUrl();
  const seq = ++runSeq;
  const resultEl = document.getElementById('ov-result');
  if (!resultEl) return;
  resultEl.classList.add('report-loading');
  try {
    const data = await api.post('/reports/contacts', {
      filters: view.filters.filter(isComplete).map(stripDisplayOnly),
      columns: view.columns,
    });
    if (seq !== runSeq) return; // a newer request is on its way
    lastResult = data;
    renderResult();
  } catch (err) {
    if (seq !== runSeq) return;
    resultEl.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  } finally {
    if (seq === runSeq) resultEl.classList.remove('report-loading');
  }
}

function stripDisplayOnly(f) {
  const { name, ...rest } = f;
  return f.type === 'group' ? rest : f;
}

function sortedRows() {
  const rows = [...lastResult.rows];
  const collator = new Intl.Collator(getLocale(), { sensitivity: 'base' });
  const byName = (a, b) => collator.compare(a.first_name || '', b.first_name || '') || collator.compare(a.last_name || '', b.last_name || '');
  switch (view.sort) {
    case 'last':
      return rows.sort((a, b) => collator.compare(a.last_name || '', b.last_name || '') || byName(a, b));
    case 'birthday': // calendar order, unknown last
      return rows.sort((a, b) => ((a.birth_month || 13) * 32 + (a.birth_day || 0)) - ((b.birth_month || 13) * 32 + (b.birth_day || 0)) || byName(a, b));
    case 'age': // oldest first, unknown last
      return rows.sort((a, b) => birthSortKey(a) - birthSortKey(b) || byName(a, b));
    default:
      return rows.sort(byName);
  }
}

function birthSortKey(r) {
  if (!r.birth_year) return Infinity;
  return r.birth_year * 10000 + (r.birth_month || 0) * 100 + (r.birth_day || 0);
}

function renderResult() {
  const el = document.getElementById('ov-result');
  if (!el || !lastResult) return;
  const rows = sortedRows();
  const cols = view.columns;

  // Count rows where each column is empty — the "who am I missing?" answer.
  const missing = cols.map(c => rows.filter(r => isEmpty(r, c)).length);

  document.getElementById('ov-count').textContent = lastResult.truncated
    ? t('overview.countTruncated', { shown: rows.length, total: lastResult.total })
    : t('overview.count', { count: lastResult.total });
  document.getElementById('ov-print-summary').textContent = printSummary(rows.length);

  if (!rows.length) {
    el.innerHTML = `<div class="empty-state"><i class="bi bi-table"></i><p>${t('overview.noResults')}</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="report-table-wrap glass-card">
      <table class="report-table">
        <thead><tr>
          <th>${t('overview.columns.name')}</th>
          ${cols.map((c, i) => `<th>${esc(columnLabel(c))}${missing[i] ? ` <span class="report-missing-count" title="${t('overview.missingTooltip')}">${t('overview.missingCount', { count: missing[i] })}</span>` : ''}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="report-name" data-label="${t('overview.columns.name')}">
                <a href="/contacts/${r.uuid}" data-link class="report-person">
                  <span class="report-avatar">${r.avatar ? `<img src="${authUrl(r.avatar)}" alt="">` : esc(initials(r))}</span>
                  <span>${esc(fullName(r))}${r.deceased_date ? ' †' : ''}</span>
                </a>
              </td>
              ${cols.map(c => `<td data-label="${esc(columnLabel(c))}"><div class="report-cell">${cellHtml(r, c)}</div></td>`).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

const MISSING = '<span class="report-missing">–</span>';

function isEmpty(r, c) {
  switch (c.type) {
    case 'birthday': return !(r.birth_day && r.birth_month) && !r.birth_year;
    case 'field': return !r.fields?.[c.field]?.length;
    case 'address': return !r.address;
    case 'groups': return !r.groups?.length;
    case 'labels': return !r.labels?.length;
    case 'relation': {
      const people = r.relations?.[c.role] || [];
      if (!people.length) return true;
      // With fields requested, a person without any of them doesn't count.
      return c.fields.length > 0 && !people.some(p => c.fields.some(f => p.fields?.[f]?.length));
    }
    default: return true;
  }
}

function cellHtml(r, c) {
  if (isEmpty(r, c) && c.type !== 'relation') return MISSING;
  switch (c.type) {
    case 'birthday': return esc(birthdayText(r));
    case 'field': return fieldValuesHtml(r.fields[c.field]);
    case 'address': return esc([r.address.street, [r.address.postal_code, r.address.city].filter(Boolean).join(' ')].filter(Boolean).join(', '));
    case 'groups': return r.groups.map(g => `<a href="/groups/${g.uuid}" data-link>${esc(g.name)}</a>`).join(', ');
    case 'labels': return r.labels.map(l => esc(l.name)).join(', ');
    case 'relation': {
      const people = r.relations?.[c.role] || [];
      if (!people.length) return MISSING;
      return people.map(p => `
        <div class="report-related">
          <a href="/contacts/${p.uuid}" data-link class="fw-medium">${esc(fullName(p))}${p.deceased ? ' †' : ''}</a>
          ${c.fields.map(f => p.fields?.[f]?.length ? fieldValuesHtml(p.fields[f]) : `<div class="report-missing small">${t('overview.noField', { field: fieldLabel(f).toLowerCase() })}</div>`).join('')}
        </div>`).join('');
    }
    default: return '';
  }
}

function fieldValuesHtml(values) {
  return values.map(v => {
    const href = v.protocol && /^(tel:|mailto:)$/.test(v.protocol) ? `${v.protocol}${v.protocol === 'tel:' ? v.value.replace(/\s+/g, '') : v.value}` : null;
    const text = esc(v.value);
    return `<div class="report-value">${href ? `<a href="${esc(href)}">${text}</a>` : text}${v.label ? ` <span class="text-muted small">${esc(v.label)}</span>` : ''}</div>`;
  }).join('');
}

// ── CSV ──

function downloadCsv() {
  if (!lastResult) return;
  const cols = view.columns;
  const header = [t('overview.columns.name'), ...cols.map(columnLabel)];
  const flat = (values) => (values || []).map(v => v.label ? `${v.value} (${v.label})` : v.value).join(', ');
  const lines = sortedRows().map(r => [
    fullName(r),
    ...cols.map(c => {
      switch (c.type) {
        case 'birthday': return isEmpty(r, c) ? '' : birthdayText(r);
        case 'field': return flat(r.fields?.[c.field]);
        case 'address': return r.address ? [r.address.street, r.address.postal_code, r.address.city].filter(Boolean).join(' ') : '';
        case 'groups': return (r.groups || []).map(g => g.name).join(', ');
        case 'labels': return (r.labels || []).map(l => l.name).join(', ');
        case 'relation': return (r.relations?.[c.role] || []).map(p => {
          const info = c.fields.map(f => flat(p.fields?.[f])).filter(Boolean).join(', ');
          return info ? `${fullName(p)}: ${info}` : fullName(p);
        }).join(' | ');
        default: return '';
      }
    }),
  ]);
  // Semicolon + BOM: opens correctly in Norwegian Excel.
  const csv = '﻿' + [header, ...lines].map(row => row.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${t('overview.fileName')}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Helpers ──

function printSummary(count) {
  const parts = view.filters.filter(isComplete).map(f => {
    switch (f.type) {
      case 'group': return `${t('overview.filters.group')}: ${f.name}`;
      case 'label': return `${t('overview.filters.label')}: ${meta.labels.find(l => String(l.id) === String(f.id))?.name || ''}`;
      case 'relation': return `${t(f.mode === 'missing' ? 'overview.mode.missing' : 'overview.mode.has')} ${roleLabel(f.role).toLowerCase()}`;
      case 'field': return `${t(f.mode === 'missing' ? 'overview.mode.missing' : 'overview.mode.has')} ${(BUILTIN_FIELDS.includes(f.field) ? t('overview.builtin.' + f.field) : fieldLabel(f.field)).toLowerCase()}`;
      case 'birth_year': return `${t('overview.filters.birth_year')}: ${f.from || ''}–${f.to || ''}`;
      case 'birth_month': return `${t('overview.filters.birth_month')}: ${monthName(parseInt(f.value))}`;
      case 'favorite': return t(f.mode === 'not' ? 'overview.mode.notFavorite' : 'overview.mode.isFavorite');
      default: return `${t('overview.filters.' + f.type)}: ${f.value}`;
    }
  });
  const date = new Date().toLocaleDateString(getLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
  return [t('overview.count', { count }), ...parts, date].join(' · ');
}

function fullName(p) {
  return [p.first_name, p.last_name].filter(Boolean).join(' ');
}

function initials(p) {
  return ((p.first_name?.[0] || '') + (p.last_name?.[0] || '')).toUpperCase();
}

function roleLabel(role) {
  const key = `relationships.types.${role}`;
  const s = t(key);
  return s && s !== key ? s : role;
}

function fieldLabel(name) {
  const key = `fieldTypes.${name}`;
  const s = t(key);
  return s && s !== key ? s : name.charAt(0).toUpperCase() + name.slice(1);
}

function monthName(m) {
  return new Date(2000, m - 1, 1).toLocaleDateString(getLocale(), { month: 'long' });
}

function birthdayText(r) {
  const locale = getLocale();
  if (r.birth_day && r.birth_month) {
    const opts = r.birth_year ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'long' };
    const text = new Date(r.birth_year || 2000, r.birth_month - 1, r.birth_day).toLocaleDateString(locale, opts);
    return r.birth_year && !r.deceased_date ? `${text} (${age(r)})` : text;
  }
  return r.birth_year ? `${r.birth_year}${r.deceased_date ? '' : ` (${age(r)})`}` : '';
}

function age(r) {
  const today = new Date();
  let a = today.getFullYear() - r.birth_year;
  if (r.birth_month && r.birth_day) {
    const m = today.getMonth() + 1 - r.birth_month;
    if (m < 0 || (m === 0 && today.getDate() < r.birth_day)) a--;
  }
  return t('overview.age', { age: a });
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
