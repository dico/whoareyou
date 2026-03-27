import { api } from '../api/client.js';
import { state, navigate } from '../app.js';
import { confirmDialog, contactSearchDialog } from '../components/dialogs.js';
import { t, formatDate } from '../utils/i18n.js';

export async function renderTenantAdmin() {
  const content = document.getElementById('app-content');

  if (state.user?.role !== 'admin' && !state.user?.is_system_admin) {
    content.innerHTML = `<div class="page-container"><div class="alert alert-danger">${t('admin.accessRequired')}</div></div>`;
    return;
  }

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2>${t('admin.manageMembers')}</h2>
        <button class="btn btn-primary btn-sm" id="btn-invite">
          <i class="bi bi-person-plus-fill"></i> ${t('admin.invite')}
        </button>
      </div>

      <div class="settings-section glass-card">
        <h4><i class="bi bi-people"></i> ${state.user?.tenant_name || t('settings.familyHousehold')}</h4>
        <p class="text-muted small">${t('admin.householdDesc')}</p>
        <div id="members-list" class="mt-3">
          <div class="loading">${t('admin.loadingMembers')}</div>
        </div>
      </div>

    </div>

    <!-- Invite modal -->
    <div class="modal fade" id="invite-modal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('admin.inviteMember')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="invite-form">
            <div class="modal-body">
              <div class="row g-2 mb-3">
                <div class="col">
                  <div class="form-floating">
                    <input type="text" class="form-control" id="invite-first" required>
                    <label>${t('auth.firstName')}</label>
                  </div>
                </div>
                <div class="col">
                  <div class="form-floating">
                    <input type="text" class="form-control" id="invite-last" required>
                    <label>${t('auth.lastName')}</label>
                  </div>
                </div>
              </div>
              <div class="form-floating mb-3">
                <input type="email" class="form-control" id="invite-email" required>
                <label>${t('auth.email')}</label>
              </div>
              <div class="form-floating mb-3">
                <input type="password" class="form-control" id="invite-password" minlength="8" required>
                <label>${t('admin.tempPassword')}</label>
              </div>
              <div class="mb-3">
                <label class="form-label small">${t('settings.role')}</label>
                <select class="form-select form-select-sm" id="invite-role">
                  <option value="member">${t('admin.roleMember')}</option>
                  <option value="admin">${t('admin.roleAdmin')}</option>
                </select>
              </div>
              <div id="invite-error" class="alert alert-danger d-none"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="submit" class="btn btn-primary btn-sm">${t('admin.invite')}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('/settings'));

  // Invite button
  document.getElementById('btn-invite').addEventListener('click', () => {
    new bootstrap.Modal(document.getElementById('invite-modal')).show();
  });

  // Invite form
  document.getElementById('invite-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('invite-error');
    errorEl.classList.add('d-none');
    try {
      await api.post('/auth/invite', {
        first_name: document.getElementById('invite-first').value,
        last_name: document.getElementById('invite-last').value,
        email: document.getElementById('invite-email').value,
        password: document.getElementById('invite-password').value,
        role: document.getElementById('invite-role').value,
      });
      bootstrap.Modal.getInstance(document.getElementById('invite-modal')).hide();
      e.target.reset();
      loadMembers();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });

  await loadMembers();
}

async function loadMembers() {
  const el = document.getElementById('members-list');
  if (!el) return;

  try {
    const { members } = await api.get('/auth/members');

    el.innerHTML = members.map(m => `
      <div class="member-row" data-uuid="${m.uuid}">
        <div class="member-avatar">
          <span>${m.first_name[0]}${m.last_name[0]}</span>
        </div>
        <div class="member-info">
          <strong>${m.first_name} ${m.last_name}</strong>
          <span class="text-muted small">${m.email}</span>
          ${m.linked_contact_uuid ? `
            <a href="/contacts/${m.linked_contact_uuid}" data-link class="text-muted small d-block">
              <i class="bi bi-link-45deg"></i> ${m.linked_contact_first_name} ${m.linked_contact_last_name || ''}
            </a>
          ` : ''}
        </div>
        <div class="member-badges">
          <span class="badge bg-${m.role === 'admin' ? 'primary' : 'secondary'}">${m.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleMember')}</span>
          ${m.is_system_admin ? `<span class="badge bg-dark">${t('nav.systemAdmin')}</span>` : ''}
          ${!m.is_active ? `<span class="badge bg-danger">${t('admin.inactive')}</span>` : ''}
        </div>
        <div class="member-actions">
          <div class="dropdown">
            <button class="btn btn-link btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
            <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
              <li><a class="dropdown-item btn-toggle-role" href="#" data-uuid="${m.uuid}" data-current="${m.role}">
                <i class="bi bi-shield me-2"></i>${m.role === 'admin' ? t('admin.demoteToMember') : t('admin.promoteToAdmin')}
              </a></li>
              <li><a class="dropdown-item btn-link-contact" href="#" data-uuid="${m.uuid}">
                <i class="bi bi-link-45deg me-2"></i>${t('admin.linkContact')}
              </a></li>
              ${m.is_active ? `
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger btn-deactivate" href="#" data-uuid="${m.uuid}" data-name="${m.first_name}">
                <i class="bi bi-person-slash me-2"></i>${t('admin.deactivate')}
              </a></li>
              ` : `
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item btn-activate" href="#" data-uuid="${m.uuid}">
                <i class="bi bi-person-check me-2"></i>${t('admin.activate')}
              </a></li>
              `}
            </ul>
          </div>
        </div>
      </div>
    `).join('');

    // Toggle role
    el.querySelectorAll('.btn-toggle-role').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const newRole = btn.dataset.current === 'admin' ? 'member' : 'admin';
        await api.put(`/auth/members/${btn.dataset.uuid}`, { role: newRole });
        loadMembers();
      });
    });

    // Link contact
    el.querySelectorAll('.btn-link-contact').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const contact = await contactSearchDialog({ title: t('admin.linkContact') });
        if (!contact) return;
        await api.put(`/auth/members/${btn.dataset.uuid}`, { linked_contact_uuid: contact.uuid });
        loadMembers();
      });
    });

    // Deactivate
    el.querySelectorAll('.btn-deactivate').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (await confirmDialog(t('admin.deactivateConfirm', { name: btn.dataset.name }), {
          title: t('admin.deactivate'), confirmText: t('admin.deactivate')
        })) {
          await api.put(`/auth/members/${btn.dataset.uuid}`, { is_active: false });
          loadMembers();
        }
      });
    });

    // Activate
    el.querySelectorAll('.btn-activate').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await api.put(`/auth/members/${btn.dataset.uuid}`, { is_active: true });
        loadMembers();
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}
