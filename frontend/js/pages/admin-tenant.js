import { api } from '../api/client.js';
import { state, navigate } from '../app.js';
import { confirmDialog, contactSearchDialog } from '../components/dialogs.js';
import { t, formatDate } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';

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
          <i class="bi bi-person-plus-fill"></i> ${t('admin.addMember')}
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
            <h5 class="modal-title">${t('admin.addMember')}</h5>
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
              <div class="form-check form-switch mb-3">
                <input class="form-check-input" type="checkbox" id="invite-login-enabled" checked>
                <label class="form-check-label" for="invite-login-enabled">${t('admin.loginEnabled')}</label>
                <div class="form-text">${t('admin.loginEnabledHint')}</div>
              </div>
              <div id="invite-login-fields">
                <div class="form-floating mb-3">
                  <input type="email" class="form-control" id="invite-email">
                  <label>${t('auth.email')}</label>
                </div>
                <div class="form-floating mb-3">
                  <input type="password" class="form-control" id="invite-password" placeholder="${t('admin.autoGeneratePassword')}">
                  <label>${t('admin.tempPassword')} <span class="text-muted fw-normal">(${t('admin.autoGeneratePassword')})</span></label>
                </div>
                <div class="mb-3">
                  <label class="form-label small">${t('settings.role')}</label>
                  <select class="form-select form-select-sm" id="invite-role">
                    <option value="member">${t('admin.roleMember')}</option>
                    <option value="admin">${t('admin.roleAdmin')}</option>
                  </select>
                </div>
                <div class="form-check mb-3">
                  <input class="form-check-input" type="checkbox" id="invite-send-email">
                  <label class="form-check-label" for="invite-send-email">${t('admin.sendWelcomeEmail')}</label>
                  <div class="form-text">${t('admin.sendWelcomeEmailHint')}</div>
                </div>
              </div>
              <div id="invite-error" class="alert alert-danger d-none"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="submit" class="btn btn-primary btn-sm">${t('contacts.create')}</button>
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

  // Toggle login fields visibility
  document.getElementById('invite-login-enabled').addEventListener('change', (e) => {
    const fields = document.getElementById('invite-login-fields');
    fields.style.display = e.target.checked ? '' : 'none';
  });

  // Invite form
  document.getElementById('invite-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('invite-error');
    errorEl.classList.add('d-none');
    const loginEnabled = document.getElementById('invite-login-enabled').checked;
    try {
      const payload = {
        first_name: document.getElementById('invite-first').value,
        last_name: document.getElementById('invite-last').value,
        login_enabled: loginEnabled,
      };
      if (loginEnabled) {
        payload.email = document.getElementById('invite-email').value;
        payload.password = document.getElementById('invite-password').value;
        payload.role = document.getElementById('invite-role').value;
        payload.send_email = document.getElementById('invite-send-email').checked;
      }
      await api.post('/auth/invite', payload);
      bootstrap.Modal.getInstance(document.getElementById('invite-modal')).hide();
      e.target.reset();
      document.getElementById('invite-login-fields').style.display = '';
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
          ${m.avatar
            ? `<img src="${authUrl(m.avatar)}" alt="">`
            : `<span>${m.first_name[0]}${m.last_name[0]}</span>`
          }
        </div>
        <div class="member-info">
          <strong>${m.first_name} ${m.last_name}</strong>
          ${m.email ? `<span class="text-muted small">${m.email}</span>` : ''}
          ${m.linked_contact_uuid ? `
            <a href="/contacts/${m.linked_contact_uuid}" data-link class="text-muted small d-block">
              <i class="bi bi-link-45deg"></i> ${m.linked_contact_first_name} ${m.linked_contact_last_name || ''}
            </a>
          ` : m.suggested_contact ? `
            <span class="small d-block">
              <i class="bi bi-lightbulb text-warning"></i>
              <a href="/contacts/${m.suggested_contact.uuid}" data-link class="text-muted">${m.suggested_contact.first_name} ${m.suggested_contact.last_name || ''}</a>
              <button class="btn btn-outline-primary btn-sm ms-1 py-0 px-1 btn-accept-suggestion" data-user-uuid="${m.uuid}" data-contact-uuid="${m.suggested_contact.uuid}" style="font-size:0.7rem">${t('admin.linkContact')}</button>
            </span>
          ` : ''}
        </div>
        <div class="member-badges">
          <span class="badge bg-${m.role === 'admin' ? 'primary' : 'secondary'}">${m.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleMember')}</span>
          ${m.is_system_admin ? `<span class="badge bg-dark">${t('nav.systemAdmin')}</span>` : ''}
          ${!m.is_active && m.email ? `<span class="badge bg-danger">${t('admin.inactive')}</span>` : ''}
          ${!m.email ? `<span class="badge bg-info">${t('admin.noLogin')}</span>` : ''}
        </div>
        <div class="member-actions">
          <div class="dropdown">
            <button class="btn btn-link btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
            <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
              <li><a class="dropdown-item btn-edit-member" href="#" data-uuid="${m.uuid}" data-first="${m.first_name}" data-last="${m.last_name || ''}" data-email="${m.email || ''}" data-role="${m.role}" data-totp="${m.totp_enabled ? '1' : '0'}">
                <i class="bi bi-pencil me-2"></i>${t('common.edit')}
              </a></li>
              <li><a class="dropdown-item btn-toggle-role" href="#" data-uuid="${m.uuid}" data-current="${m.role}">
                <i class="bi bi-shield me-2"></i>${m.role === 'admin' ? t('admin.demoteToMember') : t('admin.promoteToAdmin')}
              </a></li>
              <li><a class="dropdown-item btn-link-contact" href="#" data-uuid="${m.uuid}">
                <i class="bi bi-link-45deg me-2"></i>${t('admin.linkContact')}
              </a></li>
              ${!m.linked_contact_uuid ? `
              <li><a class="dropdown-item btn-create-contact" href="#" data-uuid="${m.uuid}" data-first="${m.first_name}" data-last="${m.last_name || ''}">
                <i class="bi bi-person-plus me-2"></i>${t('admin.createAsContact')}
              </a></li>
              ` : ''}
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

    // Edit member
    el.querySelectorAll('.btn-edit-member').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const mid = 'edit-member-' + Date.now();
        const hasLogin = !!btn.dataset.email;
        const has2fa = btn.dataset.totp === '1';

        document.body.insertAdjacentHTML('beforeend', `
          <div class="modal fade" id="${mid}" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title">${t('admin.editMember')}</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <form id="${mid}-form">
                  <div class="modal-body">
                    <div class="row g-2 mb-3">
                      <div class="col">
                        <div class="form-floating">
                          <input type="text" class="form-control" id="${mid}-first" value="${btn.dataset.first}" required>
                          <label>${t('auth.firstName')}</label>
                        </div>
                      </div>
                      <div class="col">
                        <div class="form-floating">
                          <input type="text" class="form-control" id="${mid}-last" value="${btn.dataset.last}">
                          <label>${t('auth.lastName')}</label>
                        </div>
                      </div>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" id="${mid}-login" ${hasLogin ? 'checked' : ''}>
                      <label class="form-check-label" for="${mid}-login">${t('admin.loginEnabled')}</label>
                      <div class="form-text">${t('admin.loginEnabledHint')}</div>
                    </div>
                    <div id="${mid}-login-fields" ${hasLogin ? '' : 'style="display:none"'}>
                      <div class="form-floating mb-3">
                        <input type="email" class="form-control" id="${mid}-email" value="${btn.dataset.email}">
                        <label>${t('auth.email')}</label>
                      </div>
                      <div class="form-floating mb-3">
                        <input type="text" class="form-control" id="${mid}-password" placeholder=" ">
                        <label>${t('admin.newPassword')} <span class="text-muted fw-normal">(${t('admin.newPasswordHint')})</span></label>
                      </div>
                      <div class="form-text mb-3"><i class="bi bi-info-circle me-1"></i>${t('admin.passwordChangeNotice')}</div>
                      ${has2fa ? `
                        <div class="form-check mb-2">
                          <input class="form-check-input" type="checkbox" id="${mid}-reset-2fa">
                          <label class="form-check-label text-danger" for="${mid}-reset-2fa">${t('admin.reset2fa')}</label>
                          <div class="form-text">${t('admin.reset2faHint')}</div>
                        </div>
                        <div class="mb-3 d-none" id="${mid}-admin-pw-wrap">
                          <div class="form-floating">
                            <input type="password" class="form-control" id="${mid}-admin-pw" required>
                            <label>${t('admin.yourPassword')}</label>
                          </div>
                        </div>
                      ` : ''}
                      <div class="mb-3">
                        <label class="form-label small">${t('settings.role')}</label>
                        <select class="form-select form-select-sm" id="${mid}-role">
                          <option value="member" ${btn.dataset.role === 'member' ? 'selected' : ''}>${t('admin.roleMember')}</option>
                          <option value="admin" ${btn.dataset.role === 'admin' ? 'selected' : ''}>${t('admin.roleAdmin')}</option>
                        </select>
                      </div>
                    </div>
                    <div id="${mid}-error" class="alert alert-danger d-none"></div>
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

        const modalEl = document.getElementById(mid);
        const modal = new bootstrap.Modal(modalEl);

        // Show admin password field when 2FA reset is checked
        document.getElementById(`${mid}-reset-2fa`)?.addEventListener('change', (ev) => {
          document.getElementById(`${mid}-admin-pw-wrap`)?.classList.toggle('d-none', !ev.target.checked);
        });

        document.getElementById(`${mid}-login`).addEventListener('change', (ev) => {
          document.getElementById(`${mid}-login-fields`).style.display = ev.target.checked ? '' : 'none';
        });

        document.getElementById(`${mid}-form`).addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const errorEl = document.getElementById(`${mid}-error`);
          errorEl.classList.add('d-none');

          const loginEnabled = document.getElementById(`${mid}-login`).checked;
          const payload = {
            first_name: document.getElementById(`${mid}-first`).value.trim(),
            last_name: document.getElementById(`${mid}-last`).value.trim(),
          };

          if (loginEnabled) {
            payload.email = document.getElementById(`${mid}-email`).value.trim() || null;
            payload.role = document.getElementById(`${mid}-role`).value;
            const pw = document.getElementById(`${mid}-password`).value;
            if (pw) payload.password = pw;
            if (document.getElementById(`${mid}-reset-2fa`)?.checked) {
              payload.reset_2fa = true;
              payload.admin_password = document.getElementById(`${mid}-admin-pw`)?.value;
            }
          } else {
            payload.email = null;
            payload.is_active = false;
          }

          try {
            await api.put(`/auth/members/${btn.dataset.uuid}`, payload);
            modal.hide();
            loadMembers();
          } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('d-none');
          }
        });

        modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
        modal.show();
      });
    });

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

    // Accept suggested contact link
    el.querySelectorAll('.btn-accept-suggestion').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await api.put(`/auth/members/${btn.dataset.userUuid}`, { linked_contact_uuid: btn.dataset.contactUuid });
        loadMembers();
      });
    });

    // Create as contact — creates contact + auto-links
    el.querySelectorAll('.btn-create-contact').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          const { contact } = await api.post('/contacts', {
            first_name: btn.dataset.first,
            last_name: btn.dataset.last,
            visibility: 'shared',
          });
          await api.put(`/auth/members/${btn.dataset.uuid}`, { linked_contact_uuid: contact.uuid });
          loadMembers();
        } catch (err) {
          confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
        }
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
