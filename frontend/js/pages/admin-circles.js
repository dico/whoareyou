import { api } from '../api/client.js';
import { t } from '../utils/i18n.js';
import { confirmDialog } from '../components/dialogs.js';
import { listRowHtml } from '../components/list-row.js';
import { CIRCLE_ICON, invalidateCircles } from '../components/visibility-picker.js';

/**
 * Visibility circles admin (tab in /admin/tenant). A circle is a named set
 * of household members — e.g. "Foreldre" — that appears as an extra option
 * in the post visibility picker. Circles only control who can see posts;
 * they grant no other permissions.
 */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

const fullName = (m) => `${m.first_name || ''} ${m.last_name || ''}`.trim();

export async function loadCircles() {
  const el = document.getElementById('circles-list');
  if (!el) return;

  try {
    const { circles } = await api.get('/circles');
    if (!circles.length) {
      el.innerHTML = `<p class="text-muted small mb-0">${t('circles.empty')}</p>`;
      return;
    }

    el.innerHTML = circles.map(c => listRowHtml({
      icon: CIRCLE_ICON,
      title: escapeHtml(c.name),
      meta: `${c.members.length ? escapeHtml(c.members.map(m => m.first_name).join(', ')) : t('circles.noMembers')}
        · ${t('circles.postCount', { count: c.post_count })}`,
      extraClass: 'circle-row',
      data: { circleUuid: c.uuid },
      actions: `
        <div class="dropdown">
          <button class="btn btn-link btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
          <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
            <li><a class="dropdown-item btn-edit-circle" href="#" data-uuid="${c.uuid}"><i class="bi bi-pencil me-2"></i>${t('common.edit')}</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger btn-delete-circle" href="#" data-uuid="${c.uuid}"><i class="bi bi-trash me-2"></i>${t('common.delete')}</a></li>
          </ul>
        </div>`,
    })).join('');

    const byUuid = new Map(circles.map(c => [c.uuid, c]));
    el.querySelectorAll('.btn-edit-circle').forEach(btn => btn.addEventListener('click', (e) => {
      e.preventDefault();
      showCircleModal(byUuid.get(btn.dataset.uuid));
    }));
    el.querySelectorAll('.btn-delete-circle').forEach(btn => btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const c = byUuid.get(btn.dataset.uuid);
      // confirmDialog renders the message as HTML — escape the user-supplied name
      const ok = await confirmDialog(t('circles.deleteConfirm', { name: escapeHtml(c.name), count: c.post_count }), {
        title: t('circles.deleteTitle'), confirmText: t('common.delete'), confirmClass: 'btn-danger',
      });
      if (!ok) return;
      await api.delete(`/circles/${c.uuid}`);
      invalidateCircles();
      loadCircles();
    }));
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
}

/** Create (no circle) or edit a circle: name + member checkboxes. */
export async function showCircleModal(circle = null) {
  const { members } = await api.get('/auth/members');
  // Only members who can log in can see anything — others are listed disabled
  const selected = new Set((circle?.members || []).map(m => m.uuid));
  const id = 'circle-modal-' + Date.now();

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content glass-card">
          <div class="modal-header">
            <h5 class="modal-title">${circle ? t('circles.edit') : t('circles.create')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form>
            <div class="modal-body">
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="${id}-name" maxlength="100" required value="${escapeHtml(circle?.name || '')}" placeholder="${t('circles.namePlaceholder')}">
                <label>${t('circles.name')}</label>
              </div>
              <label class="form-label small">${t('circles.members')}</label>
              <div class="circle-member-list">
                ${members.map(m => `
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="${id}-m-${m.uuid}" value="${m.uuid}"
                      ${selected.has(m.uuid) ? 'checked' : ''} ${!m.email ? 'disabled' : ''}>
                    <label class="form-check-label" for="${id}-m-${m.uuid}">
                      ${escapeHtml(fullName(m))}
                      ${!m.email ? `<span class="text-muted small">(${t('admin.noLogin')})</span>` : ''}
                    </label>
                  </div>`).join('')}
              </div>
              <div class="form-text">${t('circles.hint')}</div>
              <div class="alert alert-danger d-none mt-2" id="${id}-error"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="submit" class="btn btn-primary btn-sm">${t('common.save')}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(id);
  const modal = new bootstrap.Modal(modalEl);
  modalEl.addEventListener('shown.bs.modal', () => document.getElementById(`${id}-name`).focus());
  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });

  modalEl.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('[type="submit"]');
    const btnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
    const errorEl = document.getElementById(`${id}-error`);
    errorEl.classList.add('d-none');

    const payload = {
      name: document.getElementById(`${id}-name`).value.trim(),
      user_uuids: [...modalEl.querySelectorAll('.form-check-input:checked')].map(i => i.value),
    };
    try {
      if (circle) await api.put(`/circles/${circle.uuid}`, payload);
      else await api.post('/circles', payload);
      invalidateCircles();
      modal.hide();
      loadCircles();
    } catch (err) {
      errorEl.textContent = err.status === 409 ? t('circles.exists') : err.message;
      errorEl.classList.remove('d-none');
      submitBtn.disabled = false;
      submitBtn.innerHTML = btnText;
    }
  });

  modal.show();
}
