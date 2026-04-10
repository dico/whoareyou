import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';

export function addContactModalHtml() {
  return `
    <div class="modal fade" id="add-contact-modal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content glass-card">
          <div class="modal-header">
            <h5 class="modal-title">${t('contacts.newContact')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="add-contact-form">
            <div class="modal-body">
              <div class="row g-2 mb-3">
                <div class="col">
                  <div class="form-floating">
                    <input type="text" class="form-control" id="new-first-name" placeholder="${t('auth.firstName')}" required>
                    <label>${t('auth.firstName')}</label>
                  </div>
                </div>
                <div class="col">
                  <div class="form-floating">
                    <input type="text" class="form-control" id="new-last-name" placeholder="${t('auth.lastName')}">
                    <label>${t('auth.lastName')}</label>
                  </div>
                </div>
              </div>
              <div id="duplicate-hint" class="d-none mb-3"></div>
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="new-nickname" placeholder="${t('contacts.nickname')}">
                <label>${t('contacts.nickname')}</label>
              </div>
              <label class="form-label small mb-1">${t('contacts.dateOfBirth')}</label>
              <div class="row g-2 mb-3">
                <div class="col-4">
                  <select class="form-select" id="new-birth-day">
                    <option value="">${t('contacts.day')}</option>
                    ${Array.from({length: 31}, (_, i) => `<option value="${i+1}">${i+1}</option>`).join('')}
                  </select>
                </div>
                <div class="col-4">
                  <select class="form-select" id="new-birth-month">
                    <option value="">${t('contacts.month')}</option>
                    ${Array.from({length: 12}, (_, i) => `<option value="${i+1}">${t('contacts.months.' + (i+1))}</option>`).join('')}
                  </select>
                </div>
                <div class="col-4">
                  <input type="number" class="form-control" id="new-birth-year" placeholder="${t('contacts.year')}" min="1900" max="${new Date().getFullYear()}">
                </div>
              </div>
              <div class="form-floating mb-3">
                <textarea class="form-control" id="new-how-met" placeholder="${t('contacts.howWeMet')}" style="height:80px"></textarea>
                <label>${t('contacts.howWeMet')}</label>
              </div>
              <div class="mb-3 d-flex gap-2 align-items-center flex-wrap">
                <div class="visibility-pill" id="new-visibility-btn" data-visibility="shared">
                  <span class="visibility-pill-option active" data-val="shared"><i class="bi bi-people-fill"></i> ${t('visibility.shared')}</span>
                  <span class="visibility-pill-option" data-val="private"><i class="bi bi-lock-fill"></i> ${t('visibility.private')}</span>
                </div>
                <button type="button" class="sensitive-toggle" id="new-sensitive-btn"
                  data-sensitive="0"
                  title="${t('sensitive.markContactHint')}">
                  <i class="bi bi-eye-slash"></i>
                  <span>${t('sensitive.markShort')}</span>
                </button>
              </div>
              <div id="add-contact-error" class="alert alert-danger d-none"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t('contacts.cancel')}</button>
              <button type="submit" class="btn btn-primary">${t('contacts.create')}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

export function initAddContactModal() {
  // Visibility pill toggle
  document.getElementById('new-visibility-btn').addEventListener('click', (e) => {
    const pill = e.currentTarget;
    const clicked = e.target.closest('.visibility-pill-option');
    if (!clicked) return;
    pill.dataset.visibility = clicked.dataset.val;
    pill.querySelectorAll('.visibility-pill-option').forEach(o => o.classList.toggle('active', o.dataset.val === clicked.dataset.val));
  });

  // Sensitive toggle
  document.getElementById('new-sensitive-btn').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const next = btn.dataset.sensitive === '1' ? '0' : '1';
    btn.dataset.sensitive = next;
    btn.classList.toggle('is-on', next === '1');
  });

  // Duplicate hint — debounced search as user types name
  let dupTimeout;
  function checkDuplicates() {
    clearTimeout(dupTimeout);
    dupTimeout = setTimeout(async () => {
      const first = document.getElementById('new-first-name').value.trim();
      const last = document.getElementById('new-last-name').value.trim();
      const hint = document.getElementById('duplicate-hint');
      if (!first || first.length < 2) { hint.classList.add('d-none'); return; }

      const q = `${first} ${last}`.trim();
      try {
        const { contacts } = await api.get(`/contacts?search=${encodeURIComponent(q)}&limit=5`);
        if (!contacts.length) { hint.classList.add('d-none'); return; }

        hint.classList.remove('d-none');
        hint.innerHTML = `
          <div class="small" style="color:var(--color-text-secondary)"><i class="bi bi-exclamation-triangle me-1" style="color:#e67e22"></i>${t('contacts.duplicateHint')}</div>
          <div class="d-flex flex-wrap gap-2 mt-2">
            ${contacts.map(c => `
              <a href="/contacts/${c.uuid}" data-link class="contact-chip" style="font-size:0.75rem">
                <span class="contact-chip-avatar">${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${(c.first_name[0] || '') + (c.last_name?.[0] || '')}</span>`}</span>
                ${c.first_name} ${c.last_name || ''}
              </a>
            `).join('')}
          </div>`;
      } catch { hint.classList.add('d-none'); }
    }, 400);
  }

  document.getElementById('new-first-name').addEventListener('input', checkDuplicates);
  document.getElementById('new-last-name').addEventListener('input', checkDuplicates);

  // Form submit
  document.getElementById('add-contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('add-contact-error');
    errorEl.classList.add('d-none');

    try {
      const data = await api.post('/contacts', {
        first_name: document.getElementById('new-first-name').value,
        last_name: document.getElementById('new-last-name').value || undefined,
        nickname: document.getElementById('new-nickname').value || undefined,
        birth_day: parseInt(document.getElementById('new-birth-day').value) || undefined,
        birth_month: parseInt(document.getElementById('new-birth-month').value) || undefined,
        birth_year: parseInt(document.getElementById('new-birth-year').value) || undefined,
        how_we_met: document.getElementById('new-how-met').value || undefined,
        visibility: document.getElementById('new-visibility-btn').dataset.visibility,
        is_sensitive: document.getElementById('new-sensitive-btn').dataset.sensitive === '1',
      });

      bootstrap.Modal.getInstance(document.getElementById('add-contact-modal')).hide();
      e.target.reset();
      navigate(`/contacts/${data.contact.uuid}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });
}

export function showAddContactModal() {
  const modal = new bootstrap.Modal(document.getElementById('add-contact-modal'));
  modal.show();
}
