import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t } from '../utils/i18n.js';

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
              <div class="mb-3">
                <div class="visibility-pill" id="new-visibility-btn" data-visibility="shared">
                  <span class="visibility-pill-option active" data-val="shared"><i class="bi bi-people-fill"></i> ${t('visibility.shared')}</span>
                  <span class="visibility-pill-option" data-val="private"><i class="bi bi-lock-fill"></i> ${t('visibility.private')}</span>
                </div>
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
