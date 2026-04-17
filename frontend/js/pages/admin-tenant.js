import { api } from '../api/client.js';
import { state, navigate } from '../app.js';
import { confirmDialog, contactSearchDialog } from '../components/dialogs.js';
import { t, formatDate } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';
import { contactRowHtml } from '../components/contact-row.js';
import { attachContactSearch } from '../components/contact-search.js';

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
        <h2>
          <span id="tenant-name-display">${state.user?.tenant_name || t('settings.familyHousehold')}</span>
          <button class="btn btn-link btn-sm" id="btn-edit-tenant-name" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
        </h2>
        <button class="btn btn-primary btn-sm d-none" id="btn-invite">
          <i class="bi bi-person-plus-fill"></i> ${t('admin.addMember')}
        </button>
      </div>

      <div class="filter-tabs mb-3" id="tenant-tabs">
        <button class="filter-tab active" data-tab="members"><i class="bi bi-people me-1"></i>${t('admin.manageMembers')}</button>
        <button class="filter-tab" data-tab="portal"><i class="bi bi-share me-1"></i>${t('portal.title')}</button>
        <button class="filter-tab" data-tab="sessions"><i class="bi bi-laptop me-1"></i>${t('admin.sessions')}</button>
        <button class="filter-tab" data-tab="security"><i class="bi bi-shield-lock me-1"></i>${t('settings.security')}</button>
      </div>

      <!-- Members tab -->
      <div id="tab-members">
        <div class="settings-section glass-card">
          <p class="text-muted small">${t('admin.householdDesc')}</p>
          <div id="members-list" class="mt-3">
            <div class="loading">${t('admin.loadingMembers')}</div>
          </div>
        </div>
      </div>

      <!-- Sessions tab -->
      <div id="tab-sessions" class="d-none">
        <div class="settings-section glass-card">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h4 class="mb-0">${t('admin.sessions')}</h4>
            <button class="btn btn-outline-danger btn-sm" id="btn-revoke-all-sessions">
              <i class="bi bi-x-circle me-1"></i>${t('admin.revokeAll')}
            </button>
          </div>
          <div id="tenant-sessions-list"><div class="loading">${t('app.loading')}</div></div>
        </div>
      </div>

      <!-- Portal tab -->
      <div id="tab-portal" class="d-none">
        <div class="settings-section glass-card">
          <h4 class="mb-1">${t('portal.title')}</h4>
          <p class="text-muted small">${t('portal.desc')}</p>
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="portal-tenant-toggle">
            <label class="form-check-label" for="portal-tenant-toggle">${t('portal.enableForTenant')}</label>
            <div class="form-text">${t('portal.enableForTenantHint')}</div>
          </div>
          <span id="portal-toggle-feedback" class="small"></span>
        </div>

        <div id="portal-content">
          <div class="settings-section glass-card">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="mb-0">${t('portal.guests')}</h5>
              <button class="btn btn-primary btn-sm" id="btn-add-guest">
                <i class="bi bi-person-plus me-1"></i>${t('portal.addGuest')}
              </button>
            </div>
            <div id="portal-guests-list"></div>
          </div>
        </div>
      </div>

      <!-- Security tab -->
      <div id="tab-security" class="d-none">
        <div class="settings-section glass-card">
          <h4><i class="bi bi-wifi me-2"></i>${t('admin.trustedIpRanges')}</h4>
          <p class="text-muted small">${t('admin.trustedIpDesc')}</p>
          <div class="d-flex gap-2 align-items-end">
            <div class="flex-grow-1">
              <input type="text" class="form-control form-control-sm" id="trusted-ip-input"
                placeholder="192.168.1.0/24, 10.0.0.0/8">
            </div>
            <button class="btn btn-primary btn-sm" id="btn-save-ip">${t('common.save')}</button>
          </div>
          <div id="ip-save-status" class="small mt-1"></div>
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

  // Edit tenant name
  document.getElementById('btn-edit-tenant-name').addEventListener('click', async () => {
    const nameEl = document.getElementById('tenant-name-display');
    const current = nameEl.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control form-control-sm d-inline-block';
    input.style.width = 'auto';
    input.value = current;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const save = async () => {
      const newName = input.value.trim();
      if (newName && newName !== current) {
        await api.put('/auth/tenant', { name: newName });
        state.user.tenant_name = newName;
      }
      renderTenantAdmin();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') renderTenantAdmin(); });
  });

  // Tab switching
  const inviteBtn = document.getElementById('btn-invite');
  document.getElementById('tenant-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('#tenant-tabs .filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    ['members', 'sessions', 'portal', 'security'].forEach(id => {
      document.getElementById(`tab-${id}`)?.classList.toggle('d-none', id !== tab.dataset.tab);
    });
    inviteBtn.classList.toggle('d-none', tab.dataset.tab !== 'members');
    if (tab.dataset.tab === 'sessions') loadTenantSessions();
    if (tab.dataset.tab === 'security') loadTrustedIps();
    if (tab.dataset.tab === 'portal') loadPortal();
  });
  inviteBtn.classList.remove('d-none');

  // Revoke all sessions
  document.getElementById('btn-revoke-all-sessions')?.addEventListener('click', async () => {
    if (!await confirmDialog(t('admin.revokeAllConfirm'))) return;
    await api.delete('/auth/sessions');
    loadTenantSessions();
  });

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

// ═══════════════════════════════════════
// Portal management
// ═══════════════════════════════════════

async function loadTenantSessions() {
  const el = document.getElementById('tenant-sessions-list');
  if (!el) return;

  try {
    const { sessions } = await api.get('/auth/tenant-sessions');

    if (!sessions.length) {
      el.innerHTML = `<p class="text-muted small">${t('admin.noSessions')}</p>`;
      return;
    }

    el.innerHTML = `
      <table class="table table-sm small mb-0">
        <thead><tr>
          <th></th>
          <th>${t('admin.user')}</th>
          <th>${t('admin.device')}</th>
          <th>IP</th>
          <th></th>
          <th>${t('admin.lastActive')}</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${sessions.map(s => `
            <tr${s.is_current ? ' class="table-active"' : ''}>
              <td>${s.user.avatar ? `<img src="${authUrl(s.user.avatar)}" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover">` : `<span class="contact-row-avatar" style="width:24px;height:24px;font-size:0.6rem"><span>${(s.user.first_name?.[0] || '') + (s.user.last_name?.[0] || '')}</span></span>`}</td>
              <td>${s.user.contact_uuid ? `<a href="/contacts/${s.user.contact_uuid}" data-link>${s.user.first_name} ${s.user.last_name || ''}</a>` : `${s.user.first_name} ${s.user.last_name || ''}`}</td>
              <td>${s.device_label || ''}</td>
              <td>${s.ip_address || ''}</td>
              <td>${s.country_code && /^[A-Z]{2}$/i.test(s.country_code) ? `<img src="/img/flags/${s.country_code.toLowerCase()}.svg" alt="${s.country_code}" style="width:16px;height:12px">` : ''}</td>
              <td>${timeAgo(s.last_activity_at)}</td>
              <td>${s.is_current
                ? `<i class="bi bi-circle-fill text-success" style="font-size:0.5rem" title="${t('admin.currentSession')}"></i>`
                : `<div class="dropdown">
                    <button class="btn btn-link btn-sm p-0" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
                    <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
                      <li><a class="dropdown-item text-danger btn-revoke-session" href="#" data-uuid="${s.uuid}"><i class="bi bi-x-circle me-2"></i>${t('admin.revoke')}</a></li>
                    </ul>
                  </div>`
              }</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    el.querySelectorAll('#tenant-sessions-list .btn-revoke-session').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await api.delete(`/auth/tenant-sessions/${btn.dataset.uuid}`);
        const tr = btn.closest('tr');
        tr.style.transition = 'opacity 0.3s';
        tr.style.opacity = '0';
        setTimeout(() => { tr?.remove(); }, 300);
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('time.justNow');
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

async function loadPortal() {
  const toggle = document.getElementById('portal-tenant-toggle');
  const content = document.getElementById('portal-content');
  const feedback = document.getElementById('portal-toggle-feedback');
  if (!toggle || !content) return;

  // Always load current state
  try {
    const { tenants } = await api.get('/auth/tenants');
    const myTenant = tenants.find(t => t.uuid === state.user.tenant_uuid);
    toggle.checked = !!myTenant?.portal_enabled;
    content.classList.toggle('d-none', !toggle.checked);
  } catch { /* ignore */ }

  // Remove old listeners by replacing element
  const newToggle = toggle.cloneNode(true);
  toggle.replaceWith(newToggle);
  newToggle.addEventListener('change', async (e) => {
    try {
      await api.put('/auth/tenant/security', { portal_enabled: e.target.checked });
      content.classList.toggle('d-none', !e.target.checked);
      feedback.className = 'small text-success';
      feedback.textContent = t('common.saved');
      setTimeout(() => { feedback.textContent = ''; }, 2000);
      if (e.target.checked) await loadPortalGuests();
    } catch (err) {
      e.target.checked = !e.target.checked;
      feedback.className = 'small text-danger';
      feedback.textContent = err.message;
    }
  });

  document.getElementById('btn-add-guest')?.addEventListener('click', () => showAddGuestModal());

  if (newToggle.checked) {
    await loadPortalGuests();
  }
}

async function loadPortalGuests() {
  const el = document.getElementById('portal-guests-list');
  if (!el) return;
  try {
    const { guests } = await api.get('/portal-admin/guests');
    if (!guests.length) {
      el.innerHTML = `<p class="text-muted small">${t('portal.noGuests')}</p>`;
      return;
    }
    el.innerHTML = guests.map(g => {
      const initials = (g.display_name || '?')[0];
      const avatarHtml = g.avatar
        ? `<img src="${authUrl(g.avatar)}" alt="">`
        : `<span>${initials}</span>`;
      const canSee = g.contacts.map(c => c.first_name).join(', ');

      // Build "can see" chips with avatars
      const canSeeChips = g.contacts.map(c => `
        <a href="/contacts/${c.uuid}" data-link class="contact-chip" style="font-size:0.75rem">
          <span class="contact-chip-avatar">${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${(c.first_name?.[0] || '')}</span>`}</span>
          ${c.first_name}
        </a>
      `).join(' ');

      // Title + first name (e.g. "Bestemor Vigdis")
      const displayTitle = g.display_name + (g.contact_first_name ? ` ${g.contact_first_name}` : '');

      return `
        <div class="member-row portal-guest-row" ${g.linked_contact_uuid ? `data-href="/contacts/${g.linked_contact_uuid}"` : ''}>
          <div class="member-avatar">${avatarHtml}</div>
          <div class="member-info">
            <strong>${displayTitle}</strong>
            <div class="mt-1">${canSeeChips || `<span class="text-muted small">—</span>`}</div>
          </div>
          <div class="member-badges">
            ${g.is_active ? '' : `<span class="badge bg-danger">${t('admin.inactive')}</span>`}
            ${g.active_sessions > 0 ? `<button class="badge bg-light text-dark border btn-view-sessions" data-uuid="${g.uuid}" data-name="${g.display_name}" style="cursor:pointer"><i class="bi bi-circle-fill text-success" style="font-size:0.4rem"></i> ${g.active_sessions}</button>` : ''}
          </div>
          <div class="member-actions">
            <div class="dropdown">
              <button class="btn btn-link btn-sm" data-bs-toggle="dropdown" data-bs-display="static"><i class="bi bi-three-dots"></i></button>
              <ul class="dropdown-menu dropdown-menu-end glass-dropdown" style="z-index:1050">
                <li><a class="dropdown-item btn-edit-guest" href="#" data-uuid="${g.uuid}" data-name="${g.display_name}" data-email="${g.email || ''}" data-linked="${g.linked_contact_uuid || ''}" data-linked-name="${[g.contact_first_name, g.contact_last_name].filter(Boolean).join(' ')}" data-linked-avatar="${g.avatar || ''}" data-linked-emails='${JSON.stringify(g.linked_contact_emails || [])}' data-contacts='${JSON.stringify(g.contacts.map(c=>c.uuid))}' data-notifications-enabled="${g.notifications_enabled ? '1' : '0'}"><i class="bi bi-pencil me-2"></i>${t('common.edit')}</a></li>
                <li><a class="dropdown-item btn-create-guest-link" href="#" data-uuid="${g.uuid}" data-name="${g.display_name}"><i class="bi bi-link-45deg me-2"></i>${t('portal.shareLinks')}</a></li>
                <li><a class="dropdown-item btn-toggle-guest" href="#" data-uuid="${g.uuid}" data-active="${g.is_active ? '1' : '0'}"><i class="bi bi-${g.is_active ? 'pause' : 'play'} me-2"></i>${g.is_active ? t('admin.deactivate') : t('admin.activate')}</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-danger btn-delete-guest" href="#" data-uuid="${g.uuid}" data-name="${g.display_name}"><i class="bi bi-trash me-2"></i>${t('common.delete')}</a></li>
              </ul>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Click on guest row → navigate to contact
    el.querySelectorAll('.portal-guest-row[data-href]').forEach(row => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', (e) => {
        if (e.target.closest('.dropdown') || e.target.closest('.contact-chip') || e.target.closest('.btn-view-sessions')) return;
        navigate(row.dataset.href);
      });
    });

    // Edit guest
    el.querySelectorAll('.btn-edit-guest').forEach(btn => {
      btn.addEventListener('click', (e) => { e.preventDefault(); showEditGuestModal(btn.dataset); });
    });

    // Toggle active
    el.querySelectorAll('.btn-toggle-guest').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await api.put(`/portal-admin/guests/${btn.dataset.uuid}`, { is_active: btn.dataset.active === '0' });
        loadPortalGuests();
      });
    });

    // Delete guest
    el.querySelectorAll('.btn-delete-guest').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (await confirmDialog(t('portal.deleteGuestConfirm', { name: btn.dataset.name }), { title: t('common.delete'), confirmText: t('common.delete') })) {
          await api.delete(`/portal-admin/guests/${btn.dataset.uuid}`);
          loadPortalGuests();
        }
      });
    });
    // View sessions for guest
    el.querySelectorAll('.btn-view-sessions').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          const { sessions } = await api.get('/portal-admin/sessions');
          // Filter by this guest's name (sessions include display_name)
          const guestSessions = sessions.filter(s => s.display_name === btn.dataset.name);
          const mid = 'portal-sessions-' + Date.now();
          document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="${mid}" tabindex="-1">
              <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title">${t('portal.activeSessions')} — ${btn.dataset.name}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                  </div>
                  <div class="modal-body">
                    ${guestSessions.length ? guestSessions.map(s => `
                      <div class="d-flex align-items-center gap-2 mb-2 pb-2 border-bottom">
                        <div class="flex-grow-1">
                          <div class="small"><strong>${s.device_label || t('admin.unknown')}</strong></div>
                          <div class="text-muted small">${s.ip_address || ''} · ${formatDate(s.last_activity_at)}</div>
                        </div>
                        <button class="btn btn-outline-danger btn-sm portal-revoke-session" data-uuid="${s.uuid}"><i class="bi bi-x-lg"></i></button>
                      </div>
                    `).join('') : `<p class="text-muted small">${t('portal.noSessions')}</p>`}
                  </div>
                </div>
              </div>
            </div>
          `);
          const modalEl = document.getElementById(mid);
          const modal = new bootstrap.Modal(modalEl);
          modalEl.querySelectorAll('.portal-revoke-session').forEach(rb => {
            rb.addEventListener('click', async () => {
              await api.delete(`/portal-admin/sessions/${rb.dataset.uuid}`);
              rb.closest('.d-flex').remove();
            });
          });
          modalEl.addEventListener('hidden.bs.modal', () => { modalEl.remove(); loadPortalGuests(); }, { once: true });
          modal.show();
        } catch { /* ignore */ }
      });
    });

    // Manage links for guest
    el.querySelectorAll('.btn-create-guest-link').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await showGuestLinksModal(btn.dataset.uuid, btn.dataset.name);
      });
    });
  } catch (err) { el.innerHTML = `<div class="text-danger small">${err.message}</div>`; }
}

async function loadPortalLinks() {
  const el = document.getElementById('portal-links-list');
  if (!el) return;
  try {
    const { links } = await api.get('/portal-admin/links');
    if (!links.length) {
      el.innerHTML = `<p class="text-muted small">${t('portal.noLinks')}</p>`;
      return;
    }
    el.innerHTML = links.map(l => `
      <div class="member-row">
        <div class="member-avatar"><span><i class="bi bi-link-45deg"></i></span></div>
        <div class="member-info">
          <strong>${l.label || t('portal.shareLink')}</strong>
          ${l.guest_name ? `<span class="text-muted small">→ ${l.guest_name}</span>` : ''}
          <span class="text-muted small">${l.last_used_at ? `${t('portal.lastUsed')}: ${formatDate(l.last_used_at)}` : t('portal.neverUsed')}</span>
        </div>
        <div class="member-badges">
          ${!l.is_active ? `<span class="badge bg-danger">${t('admin.inactive')}</span>` : ''}
          ${l.expires_at && new Date(l.expires_at) < new Date() ? `<span class="badge bg-warning">${t('portal.expired')}</span>` : ''}
        </div>
        <div class="member-actions">
          ${l.is_active ? `<button class="btn btn-outline-danger btn-sm btn-revoke-link" data-uuid="${l.uuid}"><i class="bi bi-x-lg"></i></button>` : ''}
        </div>
      </div>
    `).join('');

    el.querySelectorAll('.btn-revoke-link').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api.delete(`/portal-admin/links/${btn.dataset.uuid}`);
        loadPortalGuests();
      });
    });
  } catch (err) { el.innerHTML = `<div class="text-danger small">${err.message}</div>`; }
}

async function loadPortalSessions() {
  const el = document.getElementById('portal-sessions-list');
  if (!el) return;
  try {
    const { sessions } = await api.get('/portal-admin/sessions');
    if (!sessions.length) {
      el.innerHTML = `<p class="text-muted small">${t('portal.noSessions')}</p>`;
      return;
    }
    el.innerHTML = sessions.map(s => `
      <div class="member-row">
        <div class="member-info">
          <strong>${s.display_name}</strong>
          <span class="text-muted small">${s.device_label || ''} · ${s.ip_address || ''} · ${formatDate(s.last_activity_at)}</span>
        </div>
        <button class="btn btn-outline-danger btn-sm btn-revoke-session" data-uuid="${s.uuid}"><i class="bi bi-x-lg"></i></button>
      </div>
    `).join('');

    el.querySelectorAll('.btn-revoke-session').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api.delete(`/portal-admin/sessions/${btn.dataset.uuid}`);
        loadPortalGuests();
      });
    });
  } catch (err) { el.innerHTML = ''; }
}

function showAddGuestModal() {
  const mid = 'add-guest-' + Date.now();
  const selectedContacts = [];

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('portal.addGuest')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="${mid}-form">
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">${t('portal.whoIsGuest')}</label>
                <div class="position-relative">
                  <input type="text" class="form-control form-control-sm" id="${mid}-contact-search" placeholder="${t('common.search')}" autocomplete="off">
                  <div class="product-picker-dropdown d-none" id="${mid}-contact-results"></div>
                  <input type="hidden" id="${mid}-linked-uuid">
                </div>
                <div id="${mid}-linked-chip" class="mt-1"></div>
              </div>
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="${mid}-name" required>
                <label>${t('portal.guestName')}</label>
              </div>
              <div class="mb-3">
                <label class="form-label">${t('portal.accessTo')}</label>
                <div class="gift-chips-wrap" id="${mid}-chips"></div>
                <div class="position-relative mt-1">
                  <input type="text" class="form-control form-control-sm" id="${mid}-search" placeholder="${t('common.search')}" autocomplete="off">
                  <div class="product-picker-dropdown d-none" id="${mid}-results"></div>
                </div>
              </div>
              <hr>
              <p class="text-muted small">${t('portal.loginOptional')}</p>
              <div class="form-floating mb-3">
                <input type="email" class="form-control" id="${mid}-email">
                <label>${t('auth.email')}</label>
              </div>
              <div class="form-floating mb-3">
                <input type="password" class="form-control" id="${mid}-password">
                <label>${t('auth.password')}</label>
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

  // "Who is this guest" contact search
  let guestDebounce = null;
  const guestSearch = document.getElementById(`${mid}-contact-search`);
  const guestResults = document.getElementById(`${mid}-contact-results`);
  if (guestSearch) {
    const guestSearchWrap = guestSearch.closest('.position-relative');
    attachContactSearch(guestSearch, {
      limit: 6,
      onSelect: (c) => {
        document.getElementById(`${mid}-linked-uuid`).value = c.uuid;
        document.getElementById(`${mid}-name`).value = document.getElementById(`${mid}-name`).value || c.first_name + (c.last_name ? ' ' + c.last_name : '');
        // Hide search, show chip
        guestSearchWrap.style.display = 'none';
        const chipEl = document.getElementById(`${mid}-linked-chip`);
        chipEl.innerHTML = `
          <span class="contact-chip">
            <span class="contact-chip-avatar">${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${(c.first_name?.[0] || '')}</span>`}</span>
            ${c.first_name} ${c.last_name || ''}
            <button type="button" class="contact-chip-remove"><i class="bi bi-x"></i></button>
          </span>`;
        chipEl.querySelector('.contact-chip-remove').addEventListener('click', () => {
          chipEl.innerHTML = '';
          document.getElementById(`${mid}-linked-uuid`).value = '';
          guestSearchWrap.style.display = '';
          guestSearch.value = '';
          guestSearch.focus();
        });
      },
    });
  }

  // "Can see" contact search
  setupPortalContactSearch(`${mid}-search`, `${mid}-results`, `${mid}-chips`, selectedContacts);

  document.getElementById(`${mid}-form`).addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById(`${mid}-error`);
    errorEl.classList.add('d-none');
    try {
      await api.post('/portal-admin/guests', {
        display_name: document.getElementById(`${mid}-name`).value.trim(),
        email: document.getElementById(`${mid}-email`).value.trim() || null,
        password: document.getElementById(`${mid}-password`).value || null,
        linked_contact_uuid: document.getElementById(`${mid}-linked-uuid`).value || null,
        contact_uuids: selectedContacts.map(c => c.uuid),
      });
      modal.hide();
      loadPortalGuests();
    } catch (err) { errorEl.textContent = err.message; errorEl.classList.remove('d-none'); }
  });

  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
}

function showEditGuestModal(data) {
  const mid = 'edit-guest-' + Date.now();
  const existingContactUuids = JSON.parse(data.contacts || '[]');
  const linkedEmails = JSON.parse(data.linkedEmails || '[]');
  const selectedContacts = [];

  // Linked contact chip (read-only)
  const linkedChipHtml = data.linked ? `
    <div class="mb-3">
      <label class="form-label text-muted small">${t('portal.whoIsGuest')}</label>
      <div>
        <a href="/contacts/${data.linked}" class="contact-chip text-decoration-none">
          <span class="contact-chip-avatar">${data.linkedAvatar ? `<img src="${authUrl(data.linkedAvatar)}" alt="">` : `<span>${(data.linkedName?.[0] || '')}</span>`}</span>
          ${data.linkedName}
        </a>
      </div>
    </div>` : '';

  // Email field: select with contact emails if available, else plain input
  const emailFieldHtml = linkedEmails.length ? `
    <div class="mb-3">
      <label class="form-label">${t('auth.email')}</label>
      <select class="form-select" id="${mid}-email-select">
        <option value="">${t('portal.noEmail')}</option>
        ${linkedEmails.map(e => `<option value="${e}" ${data.email === e ? 'selected' : ''}>${e}</option>`).join('')}
        <option value="__custom__" ${data.email && !linkedEmails.includes(data.email) ? 'selected' : ''}>${t('portal.customEmail')}</option>
      </select>
      <input type="email" class="form-control mt-2 ${data.email && !linkedEmails.includes(data.email) ? '' : 'd-none'}" id="${mid}-email-custom" value="${data.email && !linkedEmails.includes(data.email) ? data.email : ''}" placeholder="${t('auth.email')}">
    </div>` : `
    <div class="form-floating mb-3">
      <input type="email" class="form-control" id="${mid}-email" value="${data.email}">
      <label>${t('auth.email')}</label>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('portal.editGuest')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="${mid}-form">
            <div class="modal-body">
              ${linkedChipHtml}
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="${mid}-name" value="${data.name}" required>
                <label>${t('portal.guestName')}</label>
              </div>
              <div class="mb-3">
                <label class="form-label">${t('portal.accessTo')}</label>
                <div class="gift-chips-wrap" id="${mid}-chips"></div>
                <div class="position-relative mt-1">
                  <input type="text" class="form-control form-control-sm" id="${mid}-search" placeholder="${t('common.search')}" autocomplete="off">
                  <div class="product-picker-dropdown d-none" id="${mid}-results"></div>
                </div>
              </div>
              ${emailFieldHtml}
              <div class="form-floating mb-3">
                <input type="password" class="form-control" id="${mid}-password" placeholder=" ">
                <label>${t('admin.newPassword')} <span class="text-muted fw-normal">(${t('admin.newPasswordHint')})</span></label>
              </div>
              <div class="form-check form-switch mb-3">
                <input class="form-check-input" type="checkbox" id="${mid}-notif" ${data.notificationsEnabled === '1' ? 'checked' : ''}>
                <label class="form-check-label" for="${mid}-notif">${t('portal.notificationsEnabled')}</label>
                <div class="form-text">${t('portal.notificationsEnabledHint')}</div>
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

  // Pre-fill existing contacts
  if (existingContactUuids.length) {
    api.get('/contacts?limit=500').then(({ contacts }) => {
      for (const uuid of existingContactUuids) {
        const c = contacts.find(ct => ct.uuid === uuid);
        if (c && !selectedContacts.some(s => s.uuid === c.uuid)) {
          selectedContacts.push(c);
        }
      }
      renderPortalChips(`${mid}-chips`, selectedContacts);
    });
  }

  setupPortalContactSearch(`${mid}-search`, `${mid}-results`, `${mid}-chips`, selectedContacts);

  // Toggle custom email input when "Annen e-post..." is selected
  const emailSelect = document.getElementById(`${mid}-email-select`);
  if (emailSelect) {
    emailSelect.addEventListener('change', () => {
      const customInput = document.getElementById(`${mid}-email-custom`);
      if (emailSelect.value === '__custom__') {
        customInput.classList.remove('d-none');
        customInput.focus();
      } else {
        customInput.classList.add('d-none');
        customInput.value = '';
      }
    });
  }

  document.getElementById(`${mid}-form`).addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById(`${mid}-error`);
    errorEl.classList.add('d-none');
    try {
      let email;
      if (emailSelect) {
        email = emailSelect.value === '__custom__'
          ? (document.getElementById(`${mid}-email-custom`).value.trim() || null)
          : (emailSelect.value || null);
      } else {
        email = document.getElementById(`${mid}-email`).value.trim() || null;
      }
      const payload = {
        display_name: document.getElementById(`${mid}-name`).value.trim(),
        email,
        notifications_enabled: document.getElementById(`${mid}-notif`).checked,
      };
      const pw = document.getElementById(`${mid}-password`).value;
      if (pw) payload.password = pw;
      await api.put(`/portal-admin/guests/${data.uuid}`, payload);
      await api.put(`/portal-admin/guests/${data.uuid}/contacts`, { contact_uuids: selectedContacts.map(c => c.uuid) });
      modal.hide();
      loadPortalGuests();
    } catch (err) { errorEl.textContent = err.message; errorEl.classList.remove('d-none'); }
  });

  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
}

function showCreateLinkModal() {
  const mid = 'create-link-' + Date.now();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('portal.createLink')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="${mid}-form">
            <div class="modal-body">
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="${mid}-label" placeholder=" ">
                <label>${t('portal.linkLabel')}</label>
              </div>
              <div class="mb-3">
                <label class="form-label">${t('portal.accessTo')}</label>
                <div class="gift-chips-wrap" id="${mid}-chips"></div>
                <div class="position-relative mt-1">
                  <input type="text" class="form-control form-control-sm" id="${mid}-search" placeholder="${t('common.search')}" autocomplete="off">
                  <div class="product-picker-dropdown d-none" id="${mid}-results"></div>
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label">${t('portal.expiresIn')}</label>
                <select class="form-select form-select-sm" id="${mid}-expires">
                  <option value="">${t('portal.neverExpires')}</option>
                  <option value="30">30 ${t('portal.days')}</option>
                  <option value="90">90 ${t('portal.days')}</option>
                  <option value="365" selected>1 ${t('portal.year')}</option>
                </select>
              </div>
              <div id="${mid}-error" class="alert alert-danger d-none"></div>
              <div id="${mid}-result" class="d-none"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="submit" class="btn btn-primary btn-sm" id="${mid}-submit">${t('contacts.create')}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(mid);
  const modal = new bootstrap.Modal(modalEl);

  const linkContacts = [];
  setupPortalContactSearch(`${mid}-search`, `${mid}-results`, `${mid}-chips`, linkContacts);

  document.getElementById(`${mid}-form`).addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById(`${mid}-error`);
    errorEl.classList.add('d-none');
    const contactUuids = linkContacts.map(c => c.uuid);
    try {
      const expDays = parseInt(document.getElementById(`${mid}-expires`).value) || null;
      const result = await api.post('/portal-admin/links', {
        label: document.getElementById(`${mid}-label`).value.trim() || null,
        contact_uuids: contactUuids,
        expires_days: expDays,
      });
      // Show the URL for copying
      document.getElementById(`${mid}-result`).classList.remove('d-none');
      document.getElementById(`${mid}-result`).innerHTML = `
        <div class="alert alert-success small">
          <strong>${t('portal.linkCreated')}</strong><br>
          <input type="text" class="form-control form-control-sm mt-2" value="${result.url}" readonly id="${mid}-url">
          <button type="button" class="btn btn-outline-primary btn-sm mt-1" id="${mid}-copy"><i class="bi bi-clipboard me-1"></i>${t('portal.copyLink')}</button>
        </div>
      `;
      document.getElementById(`${mid}-copy`).addEventListener('click', () => {
        const urlInput = document.getElementById(`${mid}-url`); urlInput.select(); document.execCommand('copy');
        document.getElementById(`${mid}-copy`).innerHTML = `<i class="bi bi-check me-1"></i>${t('portal.copied')}`;
      });
      document.getElementById(`${mid}-submit`).classList.add('d-none');
    } catch (err) { errorEl.textContent = err.message; errorEl.classList.remove('d-none'); }
  });

  modalEl.addEventListener('hidden.bs.modal', () => { modalEl.remove(); loadPortalGuests(); }, { once: true });
  modal.show();
}

async function showGuestLinksModal(guestUuid, guestName) {
  const mid = 'guest-links-' + Date.now();
  const { links } = await api.get(`/portal-admin/links?guest_uuid=${guestUuid}`);

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('portal.shareLinks')} — ${guestName}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div id="${mid}-list">
              ${links.length ? links.map(l => {
                const expired = l.expires_at && new Date(l.expires_at) < new Date();
                return `
                  <div class="d-flex align-items-center gap-2 mb-2 pb-2 border-bottom" data-link-uuid="${l.uuid}">
                    <div class="flex-grow-1">
                      <div class="small">
                        ${l.is_active && !expired
                          ? `<i class="bi bi-circle-fill text-success" style="font-size:0.4rem"></i>`
                          : `<i class="bi bi-circle-fill text-danger" style="font-size:0.4rem"></i>`
                        }
                        ${l.label || t('portal.shareLink')}
                      </div>
                      <div class="text-muted small">
                        ${l.last_used_at ? `${t('portal.lastUsed')}: ${formatDate(l.last_used_at)}` : t('portal.neverUsed')}
                        ${l.expires_at ? ` · ${expired ? t('portal.expired') : `${t('portal.expiresIn')}: ${formatDate(l.expires_at)}`}` : ` · ${t('portal.neverExpires')}`}
                      </div>
                    </div>
                    ${l.is_active ? `<button class="btn btn-outline-danger btn-sm portal-revoke-link" data-uuid="${l.uuid}" title="${t('common.delete')}"><i class="bi bi-x-lg"></i></button>` : ''}
                  </div>
                `;
              }).join('') : `<p class="text-muted small">${t('portal.noLinks')}</p>`}
            </div>

            <hr>
            <h6 class="small text-uppercase text-muted">${t('portal.createLink')}</h6>
            <div class="d-flex gap-2 align-items-end">
              <div class="flex-grow-1">
                <select class="form-select form-select-sm" id="${mid}-expires">
                  <option value="365" selected>1 ${t('portal.year')}</option>
                  <option value="90">90 ${t('portal.days')}</option>
                  <option value="30">30 ${t('portal.days')}</option>
                  <option value="">${t('portal.neverExpires')}</option>
                </select>
              </div>
              <button class="btn btn-primary btn-sm" id="${mid}-create">${t('portal.createLink')}</button>
            </div>
            <div id="${mid}-result" class="mt-2 d-none"></div>
          </div>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(mid);
  const modal = new bootstrap.Modal(modalEl);

  // Revoke links
  modalEl.querySelectorAll('.portal-revoke-link').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api.delete(`/portal-admin/links/${btn.dataset.uuid}`);
      btn.closest('[data-link-uuid]').remove();
    });
  });

  // Create new link
  document.getElementById(`${mid}-create`).addEventListener('click', async () => {
    try {
      const expDays = parseInt(document.getElementById(`${mid}-expires`).value) || null;
      const result = await api.post('/portal-admin/links', {
        label: guestName,
        portal_guest_uuid: guestUuid,
        expires_days: expDays,
      });
      const resultEl = document.getElementById(`${mid}-result`);
      resultEl.classList.remove('d-none');
      resultEl.innerHTML = `
        <div class="alert alert-success small mb-0">
          <input type="text" class="form-control form-control-sm mb-1" value="${result.url}" readonly id="${mid}-url">
          <button class="btn btn-outline-primary btn-sm w-100" id="${mid}-copy"><i class="bi bi-clipboard me-1"></i>${t('portal.copyLink')}</button>
        </div>
      `;
      document.getElementById(`${mid}-copy`).addEventListener('click', () => {
        const urlInput = document.getElementById(`${mid}-url`); urlInput.select(); document.execCommand('copy');
        document.getElementById(`${mid}-copy`).innerHTML = `<i class="bi bi-check me-1"></i>${t('portal.copied')}`;
      });
    } catch (err) {
      confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
    }
  });

  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
}

function setupPortalContactSearch(inputId, resultsId, chipsId, selectedContacts) {
  const input = document.getElementById(inputId);
  if (!input) return;
  // Remove old results div — attachContactSearch creates its own dropdown
  document.getElementById(resultsId)?.remove();

  attachContactSearch(input, {
    limit: 6,
    onSelect: (c) => {
      if (!selectedContacts.some(s => s.uuid === c.uuid)) {
        selectedContacts.push({ uuid: c.uuid, first_name: c.first_name, last_name: c.last_name || '', avatar: c.avatar || null });
        renderPortalChips(chipsId, selectedContacts);
      }
      input.value = '';
      input.focus();
    },
  });
}

function renderPortalChips(chipsId, contacts) {
  const container = document.getElementById(chipsId);
  if (!container) return;
  container.innerHTML = contacts.map((c, i) => `
    <span class="contact-chip">
      <span class="contact-chip-avatar">
        ${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${(c.first_name?.[0] || '') + (c.last_name?.[0] || '')}</span>`}
      </span>
      ${c.first_name} ${c.last_name || ''}
      <button type="button" class="contact-chip-remove" data-index="${i}"><i class="bi bi-x"></i></button>
    </span>
  `).join('');
  container.querySelectorAll('.contact-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      contacts.splice(parseInt(btn.dataset.index), 1);
      renderPortalChips(chipsId, contacts);
    });
  });
}

async function loadTrustedIps() {
  try {
    const { trusted_ip_ranges } = await api.get('/auth/tenant/security');
    document.getElementById('trusted-ip-input').value = trusted_ip_ranges || '';
  } catch {}

  document.getElementById('btn-save-ip')?.addEventListener('click', async () => {
    const value = document.getElementById('trusted-ip-input').value.trim();
    const statusEl = document.getElementById('ip-save-status');
    try {
      await api.put('/auth/tenant/security', { trusted_ip_ranges: value });
      statusEl.textContent = t('common.saved');
      statusEl.className = 'small mt-1 text-success';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'small mt-1 text-danger';
    }
  });
}
