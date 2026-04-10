import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t, formatDate } from '../utils/i18n.js';
import { contactRowHtml } from '../components/contact-row.js';
import { attachContactSearch } from '../components/contact-search.js';
import { confirmDialog } from '../components/dialogs.js';
import { authUrl } from '../utils/auth-url.js';
import { renderPostList } from '../components/post-list.js';
import { showPhotoViewer } from '../components/photo-viewer.js';
import { loadGalleryInto } from './contact-detail.js';
import { enableDropZone } from '../utils/drop-zone.js';

const TYPE_ICONS = {
  company: 'bi-building', school: 'bi-mortarboard', club: 'bi-people',
  team: 'bi-trophy', association: 'bi-diagram-3', class: 'bi-easel', other: 'bi-collection',
};

export async function renderCompanyDetail(uuid) {
  const content = document.getElementById('app-content');
  content.innerHTML = `<div class="page-container"><div class="loading">${t('app.loading')}</div></div>`;

  try {
    const { company, photos, currentEmployees, previousEmployees } = await api.get(`/companies/${uuid}`);
    const isCompanyType = company.type === 'company';
    const membersLabel = isCompanyType ? t('companies.employees') : t('groups.members');
    const prevMembersLabel = isCompanyType ? t('companies.previousEmployees') : t('groups.previousMembers');
    const addMemberLabel = isCompanyType ? t('companies.addEmployee') : t('groups.addMember');
    const endLabel = isCompanyType ? t('companies.endEmployment') : t('groups.endMembership');
    const typeIcon = TYPE_ICONS[company.type] || 'bi-people';

    const TYPE_COLORS = {
      company: 'linear-gradient(135deg, #3498db, #2980b9)', school: 'linear-gradient(135deg, #27ae60, #2ecc71)',
      club: 'linear-gradient(135deg, #e67e22, #f39c12)', team: 'linear-gradient(135deg, #e74c3c, #c0392b)',
      association: 'linear-gradient(135deg, #9b59b6, #8e44ad)', class: 'linear-gradient(135deg, #1abc9c, #16a085)',
      other: 'linear-gradient(135deg, #7f8c8d, #95a5a6)',
    };

    const hasInfo = company.org_number || company.industry || company.address || company.website || company.phone || company.email || company.notes || (company.latitude && company.longitude);

    content.innerHTML = `
      <div class="page-container">
        <div class="detail-header-wrap">
          <div class="detail-header glass-card" id="group-header">
            <div class="detail-avatar" id="group-logo-wrap" style="width:56px;height:56px;flex-shrink:0;position:relative;cursor:pointer">
              ${company.logo_path
                ? `<img src="${authUrl(company.logo_path)}" alt="" style="width:56px;height:56px;border-radius:var(--radius-full);object-fit:cover">`
                : `<div class="detail-header-icon" style="background:${TYPE_COLORS[company.type] || TYPE_COLORS.other}"><i class="bi ${typeIcon}"></i></div>`
              }
              <div class="avatar-overlay"><i class="bi bi-${company.logo_path ? 'images' : 'camera-fill'}"></i></div>
              <input type="file" id="group-logo-input" accept="image/*" hidden>
            </div>
            <div class="detail-header-info">
              <h3 class="mb-0">${escapeHtml(company.name)}</h3>
              <span class="text-muted small">${t('groups.types.' + (company.type || 'other'))}${company.parent ? ` · ${t('groups.parentGroup')}: <a href="/groups/${company.parent.uuid}" data-link class="text-muted">${escapeHtml(company.parent.name)}</a>` : ''}${company.description ? ` · ${escapeHtml(company.description)}` : ''}</span>
            </div>
            <div class="detail-header-actions">
              <div class="dropdown">
                <button class="btn btn-link btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
                <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
                  <li><a class="dropdown-item" href="#" id="btn-edit-company"><i class="bi bi-pencil me-2"></i>${t('common.edit')}</a></li>
                  <li><hr class="dropdown-divider"></li>
                  <li><a class="dropdown-item text-danger" href="#" id="btn-delete-company"><i class="bi bi-trash me-2"></i>${t('common.delete')}</a></li>
                </ul>
              </div>
            </div>
          </div>
          <div class="detail-header-toolbar">
            <div class="filter-tabs" id="group-view-tabs">
              <button class="filter-tab active" data-view="members"><i class="bi bi-people me-1"></i>${membersLabel} (${currentEmployees.length})</button>
              <button class="filter-tab" data-view="info"><i class="bi bi-info-circle me-1"></i>${t('common.info')}</button>
              <button class="filter-tab" data-view="gallery"><i class="bi bi-grid-3x3-gap me-1"></i>${t('groups.photos')}${photos.length ? ` (${photos.length})` : ''}</button>
            </div>
            <button type="button" class="btn btn-primary btn-sm" id="btn-add-employee">
              <i class="bi bi-plus-lg me-1"></i>${addMemberLabel}
            </button>
          </div>
        </div>

        <div>
            ${company.children?.length ? `
            <div class="detail-card glass-card mb-3">
              <h4><i class="bi bi-diagram-3"></i> ${t('groups.childGroups')}</h4>
              <div class="address-residents">
                ${company.children.map(c => `
                  <a href="/groups/${c.uuid}" data-link class="contact-row">
                    <div class="contact-row-avatar" style="background:var(--color-text-secondary)">
                      ${c.logo_path ? `<img src="${authUrl(c.logo_path)}" alt="">` : `<i class="bi ${TYPE_ICONS[c.type] || 'bi-people'}" style="font-size:0.8rem;color:#fff"></i>`}
                    </div>
                    <div class="contact-row-info">
                      <div class="contact-row-name">${escapeHtml(c.name)}</div>
                      <div class="contact-row-meta">${t('groups.types.' + (c.type || 'other'))}</div>
                    </div>
                  </a>
                `).join('')}
              </div>
            </div>
            ` : ''}

            <!-- Members view (default) -->
            <div id="group-members">
              ${currentEmployees.length ? `
                <div class="contacts-list">
                  ${currentEmployees.map(e => {
                    const age = e.birth_year ? calcAge(e.birth_year) : null;
                    return `
                    <div class="contact-card" style="cursor:default">
                      <a href="/contacts/${e.uuid}" data-link style="display:flex;align-items:center;gap:var(--space-sm);flex:1;text-decoration:none;min-width:0">
                        <div class="contact-avatar">
                          ${e.avatar ? `<img src="${authUrl(e.avatar)}" alt="">` : `<span>${(e.first_name[0] || '') + (e.last_name?.[0] || '')}</span>`}
                        </div>
                        <div class="contact-info">
                          <div class="contact-name">${escapeHtml(e.first_name)} ${escapeHtml(e.last_name || '')}</div>
                          <div class="contact-meta">${e.title || (age ? `<i class="bi bi-cake2"></i> ${age}` : '')}</div>
                        </div>
                      </a>
                      <div class="contact-badges">
                        <div class="dropdown">
                          <button class="btn btn-link btn-sm p-0" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
                          <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
                            <li><a class="dropdown-item btn-edit-membership" href="#" data-link-id="${e.link_id}" data-title="${escapeHtml(e.title || '')}" data-start="${e.start_date || ''}" data-end="${e.end_date || ''}"><i class="bi bi-pencil me-2"></i>${t('common.edit')}</a></li>
                            <li><a class="dropdown-item btn-end-employment" href="#" data-link-id="${e.link_id}"><i class="bi bi-box-arrow-right me-2"></i>${endLabel}</a></li>
                          </ul>
                        </div>
                      </div>
                    </div>`;
                  }).join('')}
                </div>
              ` : `
                <div class="empty-state">
                  <i class="bi bi-people"></i>
                  <p>${isCompanyType ? t('companies.noEmployees') : t('groups.noMembers')}</p>
                </div>
              `}

              ${previousEmployees.length ? `
                <h5 class="text-muted small mt-4 mb-2"><i class="bi bi-clock-history me-1"></i>${prevMembersLabel}</h5>
                <div class="contacts-list">
                  ${previousEmployees.map(e => `
                    <a href="/contacts/${e.uuid}" data-link class="contact-card">
                      <div class="contact-avatar">
                        ${e.avatar ? `<img src="${authUrl(e.avatar)}" alt="">` : `<span>${(e.first_name[0] || '') + (e.last_name?.[0] || '')}</span>`}
                      </div>
                      <div class="contact-info">
                        <div class="contact-name">${escapeHtml(e.first_name)} ${escapeHtml(e.last_name || '')}</div>
                        <div class="contact-meta">${[e.title, [e.start_date ? formatDate(e.start_date) : '', e.end_date ? formatDate(e.end_date) : ''].filter(Boolean).join(' — ')].filter(Boolean).join(' — ')}</div>
                      </div>
                    </a>
                  `).join('')}
                </div>
              ` : ''}
            </div>

            <!-- Info view (hidden) — posts + sidebar with details/map -->
            <div id="group-info-section" class="d-none">
              <div class="profile-layout">
                <div class="profile-main">
                  <div class="detail-card glass-card post-compose-inline">
                    <form id="group-post-form">
                      <textarea class="form-control" id="group-post-body" rows="2" placeholder="${t('posts.placeholder')}"></textarea>
                      <div id="group-post-media-preview" class="post-media-preview d-none"></div>
                      <div class="post-compose-bar">
                        <div class="visibility-pill" id="group-post-visibility" data-visibility="shared" title="${t('visibility.sharedHint')}">
                          <span class="visibility-pill-option active" data-val="shared"><i class="bi bi-globe2"></i> ${t('visibility.shared')}</span>
                          <span class="visibility-pill-option" data-val="family"><i class="bi bi-people-fill"></i> ${t('visibility.family')}</span>
                          <span class="visibility-pill-option" data-val="private"><i class="bi bi-lock-fill"></i> ${t('visibility.private')}</span>
                        </div>
                        <div class="post-compose-actions">
                          <label class="post-media-btn" title="${t('posts.addMedia')}">
                            <i class="bi bi-image"></i>
                            <input type="file" id="group-post-media-input" multiple accept="image/*,video/*" hidden>
                          </label>
                          <label class="post-media-btn" title="${t('posts.addDocument')}">
                            <i class="bi bi-paperclip"></i>
                            <input type="file" id="group-post-doc-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" hidden>
                          </label>
                          <button type="submit" class="btn btn-primary btn-sm">${t('posts.post')}</button>
                        </div>
                      </div>
                    </form>
                  </div>
                  <div id="group-posts" class="timeline"></div>
                </div>
                <div class="profile-sidebar">
                  <div class="sidebar-card glass-card">
                    <h4><i class="bi bi-info-circle"></i> ${t('common.info')}</h4>
                    ${(() => {
                      const fields = [
                        company.org_number ? `<div class="info-field"><span class="info-label">${t('companies.orgNumber')}</span><span>${escapeHtml(company.org_number)}</span></div>` : '',
                        company.industry ? `<div class="info-field"><span class="info-label">${t('companies.industry')}</span><span>${escapeHtml(company.industry)}</span></div>` : '',
                        company.address ? `<div class="info-field"><span class="info-label">${t('addresses.address')}</span><span>${escapeHtml(company.address)}</span></div>` : '',
                        company.website ? `<div class="info-field"><span class="info-label">${t('companies.website')}</span><a href="${safeUrl(company.website)}" target="_blank" rel="noopener">${escapeHtml(company.website)}</a></div>` : '',
                        company.phone ? `<div class="info-field"><span class="info-label">${t('companies.phone')}</span><a href="tel:${company.phone}">${escapeHtml(company.phone)}</a></div>` : '',
                        company.email ? `<div class="info-field"><span class="info-label">${t('companies.email')}</span><a href="mailto:${company.email}">${escapeHtml(company.email)}</a></div>` : '',
                        company.notes ? `<div class="info-field"><span class="info-label">${t('contacts.notes')}</span><span class="text-muted">${escapeHtml(company.notes)}</span></div>` : '',
                      ].filter(Boolean);
                      return fields.length ? fields.join('') : `<p class="text-muted small">${t('common.noInfo')}</p>`;
                    })()}
                  </div>
                  ${company.latitude && company.longitude ? `
                  <div class="sidebar-card glass-card">
                    <h4><i class="bi bi-geo-alt"></i> ${t('nav.map')}</h4>
                    <div id="company-map" class="contact-map" style="height:200px;border-radius:var(--radius-md)"></div>
                  </div>
                  ` : ''}
                </div>
              </div>
            </div>

            <!-- Photo gallery (hidden) -->
            <div id="group-gallery" class="d-none">
              <div id="group-gallery-grid"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add employee/member
    document.getElementById('btn-add-employee').addEventListener('click', () => {
      showAddEmployeeDialog(uuid, isCompanyType, () => renderCompanyDetail(uuid));
    });

    // End employment/membership
    document.querySelectorAll('.btn-end-employment').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await api.put(`/companies/employees/${btn.dataset.linkId}`, { end_date: new Date().toISOString().split('T')[0] });
        renderCompanyDetail(uuid);
      });
    });

    // Edit membership (title, dates)
    document.querySelectorAll('.btn-edit-membership').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const linkId = btn.dataset.linkId;
        const mid = 'edit-member-' + Date.now();
        const titleLabel = isCompanyType ? t('companies.jobTitle') : t('companies.role');
        document.body.insertAdjacentHTML('beforeend', `
          <div class="modal fade" id="${mid}" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
              <div class="modal-content glass-card">
                <div class="modal-header">
                  <h5 class="modal-title">${t('common.edit')}</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                  <div class="form-floating mb-3">
                    <input type="text" class="form-control" id="${mid}-title" value="${escapeHtml(btn.dataset.title)}">
                    <label>${titleLabel}</label>
                  </div>
                  <div class="d-flex gap-2">
                    <div class="flex-fill">
                      <label class="form-label small text-muted">${t('common.since')}</label>
                      <input type="date" class="form-control form-control-sm" id="${mid}-start" value="${btn.dataset.start}">
                    </div>
                    <div class="flex-fill">
                      <label class="form-label small text-muted">${t('common.until')}</label>
                      <input type="date" class="form-control form-control-sm" id="${mid}-end" value="${btn.dataset.end}">
                    </div>
                  </div>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
                  <button type="button" class="btn btn-primary btn-sm" id="${mid}-save">${t('common.save')}</button>
                </div>
              </div>
            </div>
          </div>`);
        const modalEl = document.getElementById(mid);
        const modal = new bootstrap.Modal(modalEl);
        document.getElementById(`${mid}-save`).addEventListener('click', async () => {
          await api.put(`/companies/employees/${linkId}`, {
            title: document.getElementById(`${mid}-title`).value.trim() || null,
            start_date: document.getElementById(`${mid}-start`).value || null,
            end_date: document.getElementById(`${mid}-end`).value || null,
          });
          modal.hide();
          renderCompanyDetail(uuid);
        });
        modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
        modal.show();
      });
    });

    // Edit
    document.getElementById('btn-edit-company').addEventListener('click', async (e) => {
      e.preventDefault();
      showEditCompanyDialog(uuid, company, () => renderCompanyDetail(uuid));
    });

    // Delete
    document.getElementById('btn-delete-company').addEventListener('click', async (e) => {
      e.preventDefault();
      if (await confirmDialog(t('companies.deleteConfirm', { name: company.name }), { title: t('common.delete'), confirmText: t('common.delete') })) {
        await api.delete(`/companies/${uuid}`);
        navigate('/groups');
      }
    });

    // Logo upload (click + drag & drop)
    const logoWrap = document.getElementById('group-logo-wrap');
    const logoInput = document.getElementById('group-logo-input');
    const uploadLogo = async (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      const formData = new FormData();
      formData.append('logo', file);
      await api.upload(`/companies/${uuid}/logo`, formData);
      renderCompanyDetail(uuid);
    };
    logoWrap?.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (company.logo_path) {
        // Show logo in photo viewer (with upload capability)
        const logoAsPhoto = [{ id: 'logo', file_path: company.logo_path, thumbnail_path: company.logo_path, is_primary: true }];
        showPhotoViewer(uuid, logoAsPhoto, 0, () => renderCompanyDetail(uuid), {
          apiBase: `/companies/${uuid}`,
          skipCrop: true,
        });
      } else {
        logoInput?.click();
      }
    });
    logoInput?.addEventListener('change', (e) => uploadLogo(e.target.files[0]));
    // Drop zone on logo icon
    logoWrap?.addEventListener('dragover', (e) => { e.preventDefault(); logoWrap.classList.add('avatar-drag-over'); });
    logoWrap?.addEventListener('dragleave', (e) => { if (!logoWrap.contains(e.relatedTarget)) logoWrap.classList.remove('avatar-drag-over'); });
    logoWrap?.addEventListener('drop', (e) => { e.preventDefault(); logoWrap.classList.remove('avatar-drag-over'); uploadLogo(e.dataTransfer.files[0]); });

    // Also accept drop on the entire header (easier target)
    const headerEl = document.getElementById('group-header');
    headerEl?.addEventListener('dragover', (e) => { e.preventDefault(); logoWrap?.classList.add('avatar-drag-over'); });
    headerEl?.addEventListener('dragleave', (e) => { if (!headerEl.contains(e.relatedTarget)) logoWrap?.classList.remove('avatar-drag-over'); });
    headerEl?.addEventListener('drop', (e) => { e.preventDefault(); logoWrap?.classList.remove('avatar-drag-over'); uploadLogo(e.dataTransfer.files[0]); });

    // View tabs (members / info / gallery)
    let postsLoaded = false;
    let galleryLoaded = false;
    document.getElementById('group-view-tabs')?.addEventListener('click', async (e) => {
      const tab = e.target.closest('.filter-tab');
      if (!tab) return;
      document.querySelectorAll('#group-view-tabs .filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const view = tab.dataset.view;
      document.getElementById('group-members')?.classList.toggle('d-none', view !== 'members');
      document.getElementById('group-info-section')?.classList.toggle('d-none', view !== 'info');
      document.getElementById('group-gallery')?.classList.toggle('d-none', view !== 'gallery');
      // Lazy-load gallery on first switch
      if (view === 'gallery' && !galleryLoaded) {
        galleryLoaded = true;
        await loadGallery();
      }
      // Lazy-load posts + map on first switch to info tab
      if (view === 'info' && !postsLoaded) {
        postsLoaded = true;
        await loadGroupPosts();
        // Load map if present (needs to be visible for Leaflet to render correctly)
        if (company.latitude && company.longitude) {
          const mapEl = document.getElementById('company-map');
          if (mapEl && !mapEl.dataset.loaded) {
            mapEl.dataset.loaded = 'true';
            await loadLeaflet();
            const map = L.map(mapEl, { scrollWheelZoom: false }).setView([company.latitude, company.longitude], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
            L.marker([company.latitude, company.longitude]).addTo(map);
            setTimeout(() => map.invalidateSize(), 100);
          }
        }
      }
    });

    // Gallery: load company photos + post images using shared gallery component
    async function loadGallery() {
      // Convert company_photos to same format as post gallery images
      const extraPhotos = photos.map(p => ({
        file_path: p.file_path,
        thumbnail_path: p.thumbnail_path,
        post_body: p.caption || '',
        reaction_count: 0,
        comment_count: 0,
      }));
      await loadGalleryInto('group-gallery-grid', `/posts/gallery?company=${uuid}`, uuid, extraPhotos);
    }


    // Visibility pill
    const visPill = document.getElementById('group-post-visibility');
    visPill?.addEventListener('click', (e) => {
      const clicked = e.target.closest('.visibility-pill-option');
      if (!clicked) return;
      visPill.dataset.visibility = clicked.dataset.val;
      visPill.querySelectorAll('.visibility-pill-option').forEach(o => o.classList.toggle('active', o.dataset.val === clicked.dataset.val));
    });

    // Group post media handling
    let groupPostMedia = [];
    document.getElementById('group-post-media-input')?.addEventListener('change', (e) => {
      for (const file of e.target.files) {
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) groupPostMedia.push(file);
      }
      renderGroupMediaPreview();
      e.target.value = '';
    });

    document.getElementById('group-post-doc-input')?.addEventListener('change', (e) => {
      for (const file of e.target.files) groupPostMedia.push(file);
      renderGroupMediaPreview();
      e.target.value = '';
    });

    // Drop zone on compose area
    const composeEl = document.getElementById('group-post-form')?.closest('.post-compose-inline');
    if (composeEl) {
      enableDropZone(composeEl, (files) => {
        groupPostMedia.push(...files);
        renderGroupMediaPreview();
      }, { acceptDocuments: true });
    }

    function renderGroupMediaPreview() {
      const el = document.getElementById('group-post-media-preview');
      if (!el) return;
      if (!groupPostMedia.length) { el.classList.add('d-none'); el.innerHTML = ''; return; }
      el.classList.remove('d-none');
      el.innerHTML = groupPostMedia.map((f, i) => {
        if (f.type.startsWith('image/')) {
          return `<div class="media-preview-item"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" class="media-preview-remove" data-index="${i}"><i class="bi bi-x"></i></button></div>`;
        }
        if (f.type.startsWith('video/')) {
          return `<div class="media-preview-item"><video src="${URL.createObjectURL(f)}" muted style="height:64px;width:64px;object-fit:cover;border-radius:var(--radius-sm)"></video><div class="media-preview-video-badge"><i class="bi bi-play-fill"></i></div><button type="button" class="media-preview-remove" data-index="${i}"><i class="bi bi-x"></i></button></div>`;
        }
        return `<div class="media-preview-item media-preview-doc"><i class="bi bi-file-earmark"></i><span class="media-preview-doc-name">${f.name}</span><button type="button" class="media-preview-remove" data-index="${i}"><i class="bi bi-x"></i></button></div>`;
      }).join('');
      el.querySelectorAll('.media-preview-remove').forEach(btn => {
        btn.addEventListener('click', () => { groupPostMedia.splice(parseInt(btn.dataset.index), 1); renderGroupMediaPreview(); });
      });
    }

    // Group post submit
    document.getElementById('group-post-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = document.getElementById('group-post-body').value.trim();
      if (!body && !groupPostMedia.length) return;

      const submitBtn = e.target.querySelector('[type="submit"]');
      const btnText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;

      const visibility = document.getElementById('group-post-visibility')?.dataset.visibility || 'shared';
      const { post } = await api.post('/posts', { body: body || '', company_uuid: uuid, visibility, has_media: groupPostMedia.length > 0 });

      if (groupPostMedia.length && post?.uuid) {
        const formData = new FormData();
        for (const file of groupPostMedia) formData.append('media', file);
        const uploadResult = await api.upload(`/posts/${post.uuid}/media`, formData);
        if (uploadResult?.suggestedDate) {
          await api.put(`/posts/${post.uuid}`, { post_date: uploadResult.suggestedDate });
        }
      }

      document.getElementById('group-post-body').value = '';
      groupPostMedia = [];
      renderGroupMediaPreview();
      submitBtn.disabled = false;
      submitBtn.innerHTML = btnText;
      loadGroupPosts();
    });

    // Load timeline (lazy — loaded on tab switch)
    async function loadGroupPosts() {
      await renderPostList('group-posts', null, loadGroupPosts, { companyUuid: uuid });
    }

    // Map is lazy-loaded when info tab is first shown

  } catch (err) {
    content.innerHTML = `<div class="page-container"><div class="alert alert-danger">${err.message}</div></div>`;
  }
}

async function showAddEmployeeDialog(companyUuid, isCompanyType, onDone) {
  const id = 'add-emp-' + Date.now();
  const titleLabel = isCompanyType ? t('companies.jobTitle') : t('companies.role');
  const addLabel = isCompanyType ? t('companies.addEmployee') : t('groups.addMember');

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${addLabel}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div id="${id}-search-area">
              <input type="text" class="form-control mb-2" id="${id}-search" placeholder="${t('relationships.searchContact')}" autofocus>
              <div id="${id}-results" class="contact-search-results"></div>
            </div>
            <div id="${id}-selected" class="d-none">
              <div class="d-flex align-items-center gap-2 mb-3">
                <span class="text-muted small">${t('relationships.contact')}:</span>
                <strong id="${id}-name"></strong>
                <button type="button" class="btn btn-link btn-sm p-0" id="${id}-clear"><i class="bi bi-x-lg"></i></button>
              </div>
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="${id}-title" placeholder="${t('companies.jobTitlePlaceholder')}">
                <label>${titleLabel}</label>
              </div>
              <div class="form-floating">
                <input type="date" class="form-control" id="${id}-start">
                <label>${t('common.since')} <span class="text-muted">(${t('common.optional')})</span></label>
              </div>
            </div>
          </div>
          <div class="modal-footer d-none" id="${id}-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
            <button type="button" class="btn btn-primary btn-sm" id="${id}-submit">${addLabel}</button>
          </div>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(id);
  const modal = new bootstrap.Modal(modalEl);
  const searchInput = document.getElementById(`${id}-search`);
  let selectedContact = null;

  modalEl.addEventListener('shown.bs.modal', () => searchInput.focus());

  attachContactSearch(searchInput, {
    limit: 8,
    floating: false,
    onSelect: (c) => {
      selectedContact = { uuid: c.uuid, first_name: c.first_name, last_name: c.last_name };
      document.getElementById(`${id}-name`).textContent = `${c.first_name} ${c.last_name || ''}`;
      document.getElementById(`${id}-selected`).classList.remove('d-none');
      document.getElementById(`${id}-footer`).classList.remove('d-none');
      document.getElementById(`${id}-search-area`).classList.add('d-none');
      document.getElementById(`${id}-title`).focus();
    },
  });

  document.getElementById(`${id}-clear`).addEventListener('click', () => {
    selectedContact = null;
    document.getElementById(`${id}-selected`).classList.add('d-none');
    document.getElementById(`${id}-footer`).classList.add('d-none');
    document.getElementById(`${id}-search-area`).classList.remove('d-none');
    searchInput.value = '';
    searchInput.focus();
  });

  document.getElementById(`${id}-submit`).addEventListener('click', async () => {
    if (!selectedContact) return;
    try {
      await api.post(`/companies/${companyUuid}/employees`, {
        contact_uuid: selectedContact.uuid,
        title: document.getElementById(`${id}-title`).value.trim() || undefined,
        start_date: document.getElementById(`${id}-start`).value || undefined,
      });
      modal.hide();
      if (onDone) onDone();
    } catch (err) {
      confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
    }
  });

  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
}

function showEditCompanyDialog(uuid, company, onDone) {
  const id = 'edit-co-' + Date.now();
  const TYPES = ['company', 'school', 'club', 'team', 'association', 'class', 'other'];

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('common.edit')} — ${escapeHtml(company.name)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="${id}-form">
            <div class="modal-body">
              <div class="row g-2 mb-2">
                <div class="col-8"><div class="form-floating"><input type="text" class="form-control" id="${id}-name" value="${escapeAttr(company.name)}" required><label>${t('companies.name')}</label></div></div>
                <div class="col-4"><div class="form-floating"><select class="form-select" id="${id}-type">${TYPES.map(tp => `<option value="${tp}" ${company.type === tp ? 'selected' : ''}>${t('groups.types.' + tp)}</option>`).join('')}</select><label>${t('groups.type')}</label></div></div>
              </div>
              <div class="form-floating mb-2"><textarea class="form-control" id="${id}-desc" style="height:60px" placeholder="${t('groups.descriptionPlaceholder')}">${escapeHtml(company.description || '')}</textarea><label>${t('groups.description')}</label></div>
              <div class="d-flex gap-2 mb-2">
                <div class="form-floating flex-grow-1"><input type="text" class="form-control" id="${id}-org" value="${escapeAttr(company.org_number || '')}" placeholder="123456789"><label>${t('companies.orgNumber')}</label></div>
                <button type="button" class="btn btn-outline-primary btn-sm align-self-center" id="${id}-brreg" title="${t('companies.brregLookup')}"><i class="bi bi-search"></i> Brreg</button>
              </div>
              <div id="${id}-brreg-status" class="small text-muted mb-2 d-none"></div>
              <div class="form-floating mb-2"><input type="text" class="form-control" id="${id}-industry" value="${escapeAttr(company.industry || '')}"><label>${t('companies.industry')}</label></div>
              <div class="form-floating mb-2"><input type="text" class="form-control" id="${id}-address" value="${escapeAttr(company.address || '')}"><label>${t('addresses.address')}</label></div>
              <div class="form-floating mb-2"><input type="text" class="form-control" id="${id}-website" value="${escapeAttr(company.website || '')}" placeholder="example.com"><label>${t('companies.website')}</label></div>
              <div class="row g-2 mb-2">
                <div class="col"><div class="form-floating"><input type="text" class="form-control" id="${id}-phone" value="${escapeAttr(company.phone || '')}"><label>${t('companies.phone')}</label></div></div>
                <div class="col"><div class="form-floating"><input type="email" class="form-control" id="${id}-email" value="${escapeAttr(company.email || '')}"><label>${t('companies.email')}</label></div></div>
              </div>
              <div class="form-floating mb-2"><textarea class="form-control" id="${id}-notes" style="height:80px">${escapeHtml(company.notes || '')}</textarea><label>${t('contacts.notes')}</label></div>
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

  // Brreg lookup
  document.getElementById(`${id}-brreg`).addEventListener('click', async () => {
    const orgNr = document.getElementById(`${id}-org`).value.replace(/\s/g, '');
    if (!orgNr) return;
    const statusEl = document.getElementById(`${id}-brreg-status`);
    statusEl.textContent = t('companies.brregLooking');
    statusEl.classList.remove('d-none');
    try {
      const data = await api.get(`/companies/brreg/${orgNr}`);
      if (data.name) document.getElementById(`${id}-name`).value = data.name;
      if (data.industry) document.getElementById(`${id}-industry`).value = data.industry;
      if (data.address) document.getElementById(`${id}-address`).value = data.address;
      if (data.website) document.getElementById(`${id}-website`).value = data.website;
      if (data.org_number) document.getElementById(`${id}-org`).value = data.org_number;
      statusEl.textContent = t('companies.brregFound', { name: data.name });
      statusEl.className = 'small text-success mb-2';
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'small text-danger mb-2';
    }
  });

  // Submit
  document.getElementById(`${id}-form`).addEventListener('submit', async (e) => {
    e.preventDefault();
    const address = document.getElementById(`${id}-address`).value || null;

    let latitude = company.latitude, longitude = company.longitude;
    if (address && address !== company.address) {
      try {
        const geo = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`);
        const results = await geo.json();
        if (results[0]) { latitude = parseFloat(results[0].lat); longitude = parseFloat(results[0].lon); }
      } catch {}
    }

    await api.put(`/companies/${uuid}`, {
      name: document.getElementById(`${id}-name`).value,
      type: document.getElementById(`${id}-type`).value,
      description: document.getElementById(`${id}-desc`).value || null,
      org_number: document.getElementById(`${id}-org`).value || null,
      industry: document.getElementById(`${id}-industry`).value || null,
      address, latitude, longitude,
      website: (() => { let w = document.getElementById(`${id}-website`).value.trim(); if (w && !w.match(/^https?:\/\//)) w = 'https://' + w; return w || null; })(),
      phone: document.getElementById(`${id}-phone`).value || null,
      email: document.getElementById(`${id}-email`).value || null,
      notes: document.getElementById(`${id}-notes`).value || null,
    });
    modal.hide();
    if (onDone) onDone();
  });

  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
}

function calcAge(birthYear) {
  return `${new Date().getFullYear() - birthYear} ${t('contacts.years')}`;
}

function safeUrl(url) {
  if (!url) return '';
  try { const u = new URL(url.startsWith('http') ? url : 'https://' + url); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; }
  catch { return ''; }
}

function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str) { return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

async function loadLeaflet() {
  if (window.L) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = resolve;
    document.head.appendChild(script);
  });
}
