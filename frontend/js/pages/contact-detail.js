import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { renderPostList } from '../components/post-list.js';
import { attachMention } from '../components/mention.js';
import { confirmDialog, contactSearchDialog } from '../components/dialogs.js';
import { showPhotoViewer } from '../components/photo-viewer.js';
import { showCropper } from '../components/image-cropper.js';
import { toggleVisibilityBtn, visibilityToggleHtml } from '../utils/visibility.js';
import { renderContactFields } from '../components/contact-fields.js';
import { contactRowHtml } from '../components/contact-row.js';
import { t, formatDate } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';
import { enableDropZone } from '../utils/drop-zone.js';

export async function renderContactDetail(uuid) {
  const content = document.getElementById('app-content');
  content.innerHTML = `<div class="page-container"><div class="loading">${t('app.loading')}</div></div>`;

  try {
    const { contact } = await api.get(`/contacts/${uuid}`);

    content.innerHTML = `
      <div class="page-container">
        <!-- Header -->
        <div class="page-header">
          <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
          <h2>${contact.first_name} ${contact.last_name || ''}</h2>
          <div class="dropdown">
            <button class="btn btn-link" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
            <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
              <li><a class="dropdown-item" href="#" id="btn-edit"><i class="bi bi-pencil me-2"></i>${t('contacts.edit')}</a></li>
              <li><a class="dropdown-item" href="#" id="btn-toggle-fav">
                <i class="bi bi-star${contact.is_favorite ? '-fill' : ''} me-2"></i>
                ${contact.is_favorite ? t('contacts.removeFromFavorites') : t('contacts.addToFavorites')}
              </a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger" href="#" id="btn-delete"><i class="bi bi-trash me-2"></i>${t('contacts.delete')}</a></li>
            </ul>
          </div>
        </div>

        <!-- Profile layout: content + sidebar -->
        <div class="profile-layout">
          <!-- Main content: posts -->
          <div class="profile-main">
            <!-- Profile card -->
            <div class="detail-card glass-card">
              <div class="detail-profile">
                <div class="detail-avatar" id="avatar-area">
                  ${contact.photos.length
                    ? `<img src="${authUrl(contact.photos.find(p => p.is_primary)?.file_path || contact.photos[0].file_path)}" alt="">`
                    : `<span>${(contact.first_name[0] || '') + (contact.last_name?.[0] || '')}</span>`
                  }
                  <div class="avatar-overlay" id="avatar-overlay" title="${contact.photos.length ? t('photos.viewPhotos') : t('photos.uploadPhoto')}">
                    <i class="bi bi-${contact.photos.length ? 'images' : 'camera-fill'}"></i>
                  </div>
                  <input type="file" id="photo-upload" accept="image/*" hidden>
                </div>
                <div>
                  <h3>${contact.first_name} ${contact.last_name || ''}</h3>
                  ${contact.nickname ? `<p class="text-muted">"${contact.nickname}"</p>` : ''}
                  ${contact.birth_month && contact.birth_day
                    ? `<p class="detail-meta"><i class="bi bi-cake2"></i> ${formatBirthParts(contact.birth_day, contact.birth_month, contact.birth_year)}</p>`
                    : contact.birth_year
                      ? `<p class="detail-meta"><i class="bi bi-cake2"></i> ${t('contacts.bornYear', { year: contact.birth_year })}</p>`
                      : ''
                  }
                  ${contact.visibility === 'private'
                    ? `<span class="badge bg-secondary"><i class="bi bi-lock-fill"></i> ${t('visibility.private')}</span>`
                    : `<span class="badge bg-light text-muted"><i class="bi bi-people-fill"></i> ${t('visibility.shared')}</span>`
                  }
                  ${contact.is_favorite ? `<span class="badge bg-warning text-dark"><i class="bi bi-star-fill"></i> ${t('contacts.favorites')}</span>` : ''}
                </div>
              </div>
              ${contact.photos.length > 1 ? `
                <div class="photo-strip">
                  ${contact.photos.map(p => `
                    <div class="photo-strip-item ${p.is_primary ? 'active' : ''}" data-photo-id="${p.id}">
                      <img src="${authUrl(p.thumbnail_path)}" alt="${p.caption || ''}">
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>

            <!-- New post compose -->
            <div class="detail-card glass-card post-compose-inline">
              <form id="quick-post-form">
                <textarea class="form-control" id="quick-post-body" placeholder="${t('posts.writeAbout', { name: contact.first_name })}" rows="2"></textarea>
                <div id="quick-post-media-preview" class="post-media-preview d-none"></div>
                <div id="quick-post-link-preview" class="d-none"></div>
                <div class="post-compose-bar">
                  <div class="visibility-pill" id="quick-post-visibility-btn" data-visibility="shared" title="${t('visibility.sharedHint')}">
                    <span class="visibility-pill-option active" data-val="shared"><i class="bi bi-globe2"></i> ${t('visibility.shared')}</span>
                    <span class="visibility-pill-option" data-val="family"><i class="bi bi-people-fill"></i> ${t('visibility.family')}</span>
                    <span class="visibility-pill-option" data-val="private"><i class="bi bi-lock-fill"></i> ${t('visibility.private')}</span>
                  </div>
                  <div class="post-compose-actions">
                    <label class="post-media-btn" title="${t('posts.addMedia')}">
                      <i class="bi bi-image"></i>
                      <input type="file" id="quick-post-media-input" multiple accept="image/*,video/*" hidden>
                    </label>
                    <label class="post-media-btn" title="${t('posts.addDocument')}">
                      <i class="bi bi-paperclip"></i>
                      <input type="file" id="quick-post-doc-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" hidden>
                    </label>
                    <button type="submit" class="btn btn-primary btn-sm">${t('posts.post')}</button>
                  </div>
                </div>
              </form>
            </div>

            <!-- View tabs -->
            <div class="filter-tabs mb-3" id="profile-view-tabs">
              <button class="filter-tab active" data-view="posts"><i class="bi bi-journal-text me-1"></i>${t('posts.title')}</button>
              <button class="filter-tab" data-view="gallery"><i class="bi bi-grid-3x3-gap me-1"></i>${t('posts.gallery')}</button>
            </div>

            <!-- Timeline -->
            <div id="contact-posts" class="timeline">
              <div class="loading">${t('posts.loadingPosts')}</div>
            </div>

            <!-- Photo gallery (hidden by default) -->
            <div id="contact-gallery" class="d-none"></div>
          </div>

          <!-- Sidebar -->
          <div class="profile-sidebar">
            <!-- How we met -->
            ${contact.how_we_met ? `
            <div class="sidebar-card glass-card">
              <h4><i class="bi bi-chat-quote"></i> ${t('sidebar.howWeMet')}</h4>
              <p>${escapeHtml(contact.how_we_met)}</p>
            </div>
            ` : ''}

            <!-- Notes -->
            ${contact.notes ? `
            <div class="sidebar-card glass-card">
              <h4><i class="bi bi-journal-text"></i> ${t('sidebar.notes')}</h4>
              <p>${linkify(escapeHtml(contact.notes))}</p>
            </div>
            ` : ''}

            <!-- Contact info (editable) -->
            <div class="sidebar-card glass-card" id="contact-fields-section"></div>

            <!-- Relationships -->
            <div class="sidebar-card glass-card">
              <h4>
                <i class="bi bi-diagram-3"></i> ${t('relationships.title')}
                <span class="field-add-btns">
                  <button type="button" class="btn btn-link btn-sm field-add-btn" id="btn-show-tree" title="${t('relationships.familyTree')}"><i class="bi bi-diagram-2"></i></button>
                  <button type="button" class="btn btn-link btn-sm field-add-btn" id="btn-add-relationship" title="${t('relationships.add')}"><i class="bi bi-plus-lg"></i></button>
                </span>
              </h4>
            ${contact.relationships.length ? `
              <div class="detail-relationships">
                ${renderGroupedRelationships(contact.relationships, { hasAddress: contact.addresses.some(a => !a.moved_out_at && a.address_id) })}
              </div>
            ` : `<p class="text-muted small">${t('relationships.noRelationships')}</p>`}
            </div>

            <!-- Household -->
            ${contact.household?.length ? `
            <div class="sidebar-card glass-card">
              <h4><i class="bi bi-house-door"></i> ${t('household.title')}</h4>
              <div class="detail-relationships">
                ${contact.household.map(h =>
                  contactRowHtml(h, { meta: h.street })
                ).join('')}
              </div>
              ${contact.addresses.filter(a => !a.moved_out_at && a.address_id).map(a => `
                <div class="text-center mt-2">
                  <a href="/addresses/${a.address_id}" data-link class="subtle-link">
                    <i class="bi bi-house-door"></i> ${t('addresses.viewAddress')}
                  </a>
                </div>
              `).join('')}
            </div>
            ` : ''}

            <!-- Addresses -->
            <div class="sidebar-card glass-card">
              <h4>
                <i class="bi bi-geo-alt"></i> ${t('addresses.title')}
                <button type="button" class="btn btn-link btn-sm field-add-btn" id="btn-add-address" title="${t('addresses.add')}">
                  <i class="bi bi-plus-lg"></i>
                </button>
              </h4>
              ${contact.addresses.length ? contact.addresses.map(a => `
                <div class="detail-address ${a.moved_out_at ? 'text-muted' : ''}" data-address-id="${a.address_id}">
                  <div class="detail-address-header">
                    <strong>${a.label || 'Address'}</strong>
                    ${a.moved_out_at ? `<span class="badge bg-secondary ms-1">${t('addresses.previous')}</span>` : ''}
                    <div class="detail-address-actions">
                      ${!a.moved_out_at ? `
                        <button type="button" class="btn btn-link btn-sm btn-edit-address" data-address-id="${a.address_id}" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
                        <button type="button" class="btn btn-link btn-sm btn-moveout-address" data-address-id="${a.address_id}" title="${t('addresses.moveOut')}"><i class="bi bi-box-arrow-right"></i></button>
                      ` : `
                        <button type="button" class="btn btn-link btn-sm btn-movein-address" data-address-id="${a.address_id}" title="${t('addresses.moveBackIn')}"><i class="bi bi-arrow-counterclockwise"></i></button>
                      `}
                      <button type="button" class="btn btn-link btn-sm text-danger btn-remove-address" data-address-id="${a.address_id}" title="${t('common.delete')}"><i class="bi bi-x-lg"></i></button>
                    </div>
                  </div>
                  <a href="/addresses/${a.address_id}" data-link class="detail-address-street">${escapeHtml(a.street)}${a.street2 ? ', ' + escapeHtml(a.street2) : ''}</a>
                  <p class="mb-0">
                  ${[a.postal_code, a.city].filter(Boolean).join(' ')}</p>
                </div>
              `).join('') : `<p class="text-muted small">${t('addresses.noAddresses')}</p>`}
              ${contact.addresses.some(a => a.latitude && !a.moved_out_at) ? `
                <div id="contact-mini-map" class="contact-mini-map" title="Click to expand"></div>
              ` : ''}
              <div id="address-add-form" class="d-none mt-2">
                <div class="address-add-tabs mb-2">
                  <button type="button" class="btn btn-sm btn-outline-primary active" data-tab="new">${t('addresses.newAddress')}</button>
                  <button type="button" class="btn btn-sm btn-outline-secondary" data-tab="same">${t('addresses.sameAs')}</button>
                </div>
                <div id="address-tab-new">
                  <form id="new-address-form">
                    <input type="text" class="form-control form-control-sm mb-1" id="addr-street" placeholder="${t('addresses.street')}" required>
                    <div class="row g-1 mb-1">
                      <div class="col-4"><input type="text" class="form-control form-control-sm" id="addr-postal" placeholder="${t('addresses.postalCode')}"></div>
                      <div class="col-8"><input type="text" class="form-control form-control-sm" id="addr-city" placeholder="${t('addresses.city')}"></div>
                    </div>
                    <input type="text" class="form-control form-control-sm mb-1" id="addr-label" placeholder="${t('addresses.label')}" value="${t('addresses.defaultLabel')}">
                    <div class="d-flex gap-1">
                      <button type="submit" class="btn btn-primary btn-sm">${t('addresses.add')}</button>
                      <button type="button" class="btn btn-outline-secondary btn-sm" id="addr-cancel">${t('common.cancel')}</button>
                    </div>
                  </form>
                </div>
                <div id="address-tab-same" class="d-none">
                  <input type="text" class="form-control form-control-sm mb-1" id="addr-same-search" placeholder="${t('relationships.searchContact')}">
                  <div id="addr-same-results" class="address-search-results"></div>
                </div>
              </div>
            </div>

            <!-- Labels & Interests -->
            <div class="sidebar-card glass-card">
              <h4>
                <i class="bi bi-tags"></i> ${t('labels.title')}
                <span class="field-add-btns">
                  <button type="button" class="btn btn-link btn-sm field-add-btn" id="btn-add-label" title="${t('labels.addGroup')}"><i class="bi bi-tag"></i></button>
                  <button type="button" class="btn btn-link btn-sm field-add-btn" id="btn-add-interest" title="${t('interests.addInterest')}"><i class="bi bi-heart"></i></button>
                </span>
              </h4>
              <div class="detail-labels" id="contact-labels">
                ${contact.labels.length
                  ? contact.labels.map(l => `
                    <span class="badge label-badge" style="background:${l.category === 'interest' ? '#FF9500' : l.color}" data-label-id="${l.id}" title="${l.category === 'interest' ? t('interests.title') : t('labels.title')}">
                      ${l.category === 'interest' ? '<i class="bi bi-heart-fill" style="font-size:0.55rem;margin-right:2px"></i>' : ''}
                      <a href="/contacts?label=${encodeURIComponent(l.name)}" data-link class="label-link">${escapeHtml(l.name)}</a>
                      <button type="button" class="btn-remove-label" data-label-id="${l.id}" title="${t('common.delete')}"><i class="bi bi-x"></i></button>
                    </span>
                  `).join(' ')
                  : `<p class="text-muted small">${t('labels.noLabels')}</p>`
                }
              </div>
              <div id="label-add-area" class="d-none mt-2">
                <div class="label-add-tabs mb-2">
                  <button type="button" class="btn btn-sm btn-outline-primary active" data-label-tab="existing">
                    <i class="bi bi-tag"></i> ${t('labels.existing')}
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-secondary" data-label-tab="new">
                    <i class="bi bi-plus-circle"></i> ${t('labels.createNew')}
                  </button>
                </div>
                <div id="label-tab-existing">
                  <select class="form-select form-select-sm" id="label-select">
                    <option value="" disabled selected>${t('labels.choose')}</option>
                  </select>
                </div>
                <div id="label-tab-new" class="d-none">
                  <div class="input-group input-group-sm">
                    <input type="text" class="form-control" id="new-label-name" placeholder="${t('labels.newLabel')}">
                    <button type="button" class="btn btn-primary" id="btn-create-label">${t('common.add')}</button>
                  </div>
                </div>
              </div>
              <div id="interest-add-area" class="d-none mt-2">
                <div class="label-add-tabs mb-2">
                  <button type="button" class="btn btn-sm btn-outline-primary active" data-interest-tab="existing">
                    <i class="bi bi-heart"></i> ${t('labels.existing')}
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-secondary" data-interest-tab="new">
                    <i class="bi bi-plus-circle"></i> ${t('labels.createNew')}
                  </button>
                </div>
                <div id="interest-tab-existing">
                  <select class="form-select form-select-sm" id="interest-select">
                    <option value="" disabled selected>${t('interests.choose')}</option>
                  </select>
                </div>
                <div id="interest-tab-new" class="d-none">
                  <div class="input-group input-group-sm">
                    <input type="text" class="form-control" id="new-interest-name" placeholder="${t('interests.newInterest')}">
                    <button type="button" class="btn btn-primary" id="btn-create-interest">${t('common.add')}</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Companies -->
            <div class="sidebar-card glass-card">
              <h4>
                <i class="bi bi-building"></i> ${t('companies.title')}
                <button type="button" class="btn btn-link btn-sm float-end" id="btn-add-company" title="${t('common.add')}"><i class="bi bi-plus-lg"></i></button>
              </h4>
              <div id="contact-companies-list" class="detail-relationships">
                ${(contact.companies || []).map(c => renderCompanyRow(c)).join('')}
              </div>
              <div id="add-company-form" class="d-none mt-2">
                <div class="mb-2 position-relative">
                  <input type="text" class="form-control form-control-sm" id="company-search-input" placeholder="${t('companies.searchOrCreate')}">
                  <div id="company-search-results" class="dropdown-menu w-100" style="display:none;position:absolute;z-index:10"></div>
                </div>
                <div class="d-flex gap-2 mb-2">
                  <input type="text" class="form-control form-control-sm" id="company-role-input" placeholder="${t('companies.role')}">
                  <input type="date" class="form-control form-control-sm" id="company-start-input" style="max-width:140px">
                </div>
                <div class="d-flex gap-2">
                  <button type="button" class="btn btn-outline-secondary btn-sm" id="btn-cancel-company">${t('common.cancel')}</button>
                  <button type="button" class="btn btn-primary btn-sm" id="btn-save-company" disabled>${t('common.save')}</button>
                </div>
              </div>
            </div>

            <!-- Life events -->
            <div class="sidebar-card glass-card">
              <h4>
                <i class="bi bi-calendar-event"></i> ${t('lifeEvents.title')}
                <button type="button" class="btn btn-link btn-sm field-add-btn" id="btn-add-life-event" title="${t('common.add')}">
                  <i class="bi bi-plus-lg"></i>
                </button>
              </h4>
              <div id="contact-life-events"></div>
            </div>

            <!-- Reminders -->
            <div class="sidebar-card glass-card">
              <h4>
                <i class="bi bi-bell"></i> ${t('reminders.title')}
                <button type="button" class="btn btn-link btn-sm field-add-btn" id="btn-add-reminder" title="${t('common.add')}">
                  <i class="bi bi-plus-lg"></i>
                </button>
              </h4>
              <div id="contact-reminders"></div>
              <div id="reminder-add-form" class="d-none mt-2">
                <input type="text" class="form-control form-control-sm mb-1" id="reminder-title" placeholder="${t('reminders.placeholder')}">
                <div class="row g-1 mb-1">
                  <div class="col-7"><input type="date" class="form-control form-control-sm" id="reminder-date"></div>
                  <div class="col-5">
                    <div class="form-check form-check-inline" style="font-size:0.8rem">
                      <input type="checkbox" class="form-check-input" id="reminder-recurring">
                      <label class="form-check-label" for="reminder-recurring">${t('reminders.recurring')}</label>
                    </div>
                  </div>
                </div>
                <div class="d-flex gap-1">
                  <button type="button" class="btn btn-primary btn-sm" id="btn-save-reminder">${t('common.add')}</button>
                  <button type="button" class="btn btn-outline-secondary btn-sm" id="btn-cancel-reminder">${t('common.cancel')}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Mini map for address
    const addrWithCoords = contact.addresses.find(a => a.latitude && !a.moved_out_at);
    if (addrWithCoords && document.getElementById('contact-mini-map')) {
      initMiniMap(addrWithCoords, contact);
    }

    // Event handlers
    document.getElementById('btn-back').addEventListener('click', () => navigate('/contacts'));

    document.getElementById('btn-toggle-fav').addEventListener('click', async (e) => {
      e.preventDefault();
      await api.put(`/contacts/${uuid}`, { is_favorite: !contact.is_favorite });
      renderContactDetail(uuid);
    });

    document.getElementById('btn-delete').addEventListener('click', async (e) => {
      e.preventDefault();
      if (await confirmDialog(t('contacts.deleteConfirm', { name: contact.first_name + ' ' + (contact.last_name || '') }), { title: t('contacts.deleteContact'), confirmText: t('contacts.delete') })) {
        await api.delete(`/contacts/${uuid}`);
        navigate('/contacts');
      }
    });

    document.getElementById('btn-edit').addEventListener('click', (e) => {
      e.preventDefault();
      renderEditMode(contact);
    });

    // Upload helper — always shows cropper first
    async function uploadPhoto(source) {
      const cropped = await showCropper(source);
      if (!cropped) return; // User cancelled

      const formData = new FormData();
      formData.append('photo', new File([cropped], 'cropped.jpg', { type: 'image/jpeg' }));
      try {
        await api.upload(`/contacts/${uuid}/photos`, formData);
        renderContactDetail(uuid);
      } catch (err) {
        confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
      }
    }

    // Hidden file input for upload
    document.getElementById('photo-upload')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) uploadPhoto(file);
    });

    // Avatar overlay click → viewer (if photos) or file picker (if none)
    document.getElementById('avatar-overlay')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (contact.photos.length) {
        const primaryIndex = contact.photos.findIndex(p => p.is_primary);
        showPhotoViewer(uuid, contact.photos, Math.max(primaryIndex, 0), () => renderContactDetail(uuid));
      } else {
        document.getElementById('photo-upload')?.click();
      }
    });

    // Drag-and-drop on avatar area
    const avatarArea = document.getElementById('avatar-area');
    avatarArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      avatarArea.classList.add('avatar-drag-over');
    });
    avatarArea.addEventListener('dragleave', () => {
      avatarArea.classList.remove('avatar-drag-over');
    });
    avatarArea.addEventListener('drop', async (e) => {
      e.preventDefault();
      avatarArea.classList.remove('avatar-drag-over');

      // Dropped file
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
        uploadPhoto(file);
        return;
      }

      // Dropped image URL (e.g. dragged from Facebook)
      const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          if (blob.type.startsWith('image/')) {
            uploadPhoto(new File([blob], 'dragged-image.jpg', { type: blob.type }));
          }
        } catch {}
      }
    });

    // Photo strip — click to open viewer at that photo
    document.querySelectorAll('.photo-strip-item').forEach((item, i) => {
      item.addEventListener('click', () => {
        showPhotoViewer(uuid, contact.photos, i, () => renderContactDetail(uuid));
      });
    });

    // Load contact fields (editable)
    renderContactFields('contact-fields-section', uuid, contact.fields);

    // Labels
    // Label tab switching
    document.querySelectorAll('.label-add-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.label-add-tabs button').forEach(b => {
          b.classList.toggle('active', b === btn);
          b.classList.toggle('btn-outline-primary', b === btn);
          b.classList.toggle('btn-outline-secondary', b !== btn);
        });
        document.getElementById('label-tab-existing').classList.toggle('d-none', btn.dataset.labelTab !== 'existing');
        document.getElementById('label-tab-new').classList.toggle('d-none', btn.dataset.labelTab !== 'new');
      });
    });

    document.getElementById('btn-add-label')?.addEventListener('click', async () => {
      const area = document.getElementById('label-add-area');
      document.getElementById('interest-add-area').classList.add('d-none'); // Close other
      area.classList.toggle('d-none');
      if (!area.classList.contains('d-none')) {
        // Load available labels into select
        try {
          const { labels: allLabels } = await api.get('/labels?category=group');
          const assignedIds = contact.labels.map(l => l.id);
          const available = allLabels.filter(l => !assignedIds.includes(l.id));
          const select = document.getElementById('label-select');
          select.innerHTML = `<option value="" disabled selected>${t('labels.choose')}</option>` +
            available.map(l => `<option value="${l.id}" data-color="${l.color}">${l.name}</option>`).join('');
        } catch {}
      }
    });

    // Assign existing label from select
    document.getElementById('label-select')?.addEventListener('change', async (e) => {
      const labelId = e.target.value;
      if (!labelId) return;
      try {
        await api.post(`/labels/${labelId}/contacts`, { contact_uuid: uuid });
        renderContactDetail(uuid);
      } catch (err) {
        confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
      }
    });

    // Create new label and assign
    document.getElementById('btn-create-label')?.addEventListener('click', async () => {
      const name = document.getElementById('new-label-name').value.trim();
      if (!name) return;
      const color = document.getElementById('new-label-color').value;
      try {
        const { label } = await api.post('/labels', { name, color });
        await api.post(`/labels/${label.id}/contacts`, { contact_uuid: uuid });
        renderContactDetail(uuid);
      } catch (err) {
        confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
      }
    });

    // Remove label from contact
    document.querySelectorAll('.btn-remove-label').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await api.delete(`/labels/${btn.dataset.labelId}/contacts/${uuid}`);
          renderContactDetail(uuid);
        } catch (err) {
          confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
        }
      });
    });

    // Interest tab switching
    document.querySelectorAll('[data-interest-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-interest-tab]').forEach(b => {
          b.classList.toggle('active', b === btn);
          b.classList.toggle('btn-outline-primary', b === btn);
          b.classList.toggle('btn-outline-secondary', b !== btn);
        });
        document.getElementById('interest-tab-existing').classList.toggle('d-none', btn.dataset.interestTab !== 'existing');
        document.getElementById('interest-tab-new').classList.toggle('d-none', btn.dataset.interestTab !== 'new');
      });
    });

    document.getElementById('btn-add-interest')?.addEventListener('click', async () => {
      const area = document.getElementById('interest-add-area');
      document.getElementById('label-add-area').classList.add('d-none'); // Close other
      area.classList.toggle('d-none');
      if (!area.classList.contains('d-none')) {
        try {
          const { labels: allInterests } = await api.get('/labels?category=interest');
          const assignedIds = contact.labels.map(l => l.id);
          const available = allInterests.filter(l => !assignedIds.includes(l.id));
          const select = document.getElementById('interest-select');
          select.innerHTML = `<option value="" disabled selected>${t('interests.choose')}</option>` +
            available.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
        } catch {}
      }
    });

    document.getElementById('interest-select')?.addEventListener('change', async (e) => {
      if (!e.target.value) return;
      try {
        await api.post(`/labels/${e.target.value}/contacts`, { contact_uuid: uuid });
        renderContactDetail(uuid);
      } catch (err) {
        confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
      }
    });

    document.getElementById('btn-create-interest')?.addEventListener('click', async () => {
      const name = document.getElementById('new-interest-name').value.trim();
      if (!name) return;
      const color = document.getElementById('new-interest-color').value;
      try {
        const { label } = await api.post('/labels', { name, color, category: 'interest' });
        await api.post(`/labels/${label.id}/contacts`, { contact_uuid: uuid });
        renderContactDetail(uuid);
      } catch (err) {
        confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
      }
    });

    // Reminders
    loadContactReminders(uuid);

    document.getElementById('btn-add-reminder')?.addEventListener('click', () => {
      document.getElementById('reminder-add-form').classList.toggle('d-none');
    });
    document.getElementById('btn-cancel-reminder')?.addEventListener('click', () => {
      document.getElementById('reminder-add-form').classList.add('d-none');
    });
    document.getElementById('btn-save-reminder')?.addEventListener('click', async () => {
      const title = document.getElementById('reminder-title').value.trim();
      const date = document.getElementById('reminder-date').value;
      if (!title || !date) return;
      try {
        await api.post('/reminders', {
          title,
          reminder_date: date,
          is_recurring: document.getElementById('reminder-recurring').checked,
          contact_uuid: uuid,
        });
        document.getElementById('reminder-title').value = '';
        document.getElementById('reminder-date').value = '';
        document.getElementById('reminder-recurring').checked = false;
        document.getElementById('reminder-add-form').classList.add('d-none');
        loadContactReminders(uuid);
      } catch (err) {
        confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
      }
    });

    // Life events
    loadContactLifeEvents(uuid);

    document.getElementById('btn-add-life-event')?.addEventListener('click', () => {
      showAddLifeEventDialog(uuid, () => {
        loadContactLifeEvents(uuid);
      });
    });

    // Add relationship
    document.getElementById('btn-show-tree')?.addEventListener('click', () => {
      showFamilyTree(uuid);
    });

    document.getElementById('btn-add-relationship')?.addEventListener('click', () => {
      showAddRelationshipDialog(uuid, contact.relationships, () => renderContactDetail(uuid));
    });

    // Share address with related contact
    const currentAddresses = contact.addresses.filter(a => !a.moved_out_at && a.address_id);
    document.querySelectorAll('.btn-share-address').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!currentAddresses.length) {
          confirmDialog(t('addresses.noAddressToShare'), { title: t('addresses.shareAddress'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
          return;
        }
        const wrapper = btn.closest('.relationship-row-wrapper');
        const relContactUuid = wrapper.dataset.contactUuid;
        const relName = wrapper.querySelector('.contact-row-name')?.textContent || '';

        // If only one address, share it directly. Otherwise let user pick.
        let addressToShare;
        if (currentAddresses.length === 1) {
          addressToShare = currentAddresses[0];
        } else {
          // Show picker
          const picked = await showAddressPicker(currentAddresses);
          if (!picked) return;
          addressToShare = picked;
        }

        try {
          await api.post('/addresses/link', {
            contact_uuid: relContactUuid,
            address_id: addressToShare.address_id,
          });
          renderContactDetail(uuid);
        } catch (err) {
          confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
        }
      });
    });

    // Edit relationship
    document.querySelectorAll('.btn-edit-rel').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const wrapper = btn.closest('.relationship-row-wrapper');
        showEditRelationshipDialog(wrapper, () => renderContactDetail(uuid));
      });
    });

    // Delete relationship
    document.querySelectorAll('.btn-delete-rel').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const wrapper = btn.closest('.relationship-row-wrapper');
        const relId = wrapper.dataset.relId;
        if (await confirmDialog(t('relationships.deleteConfirm'), { title: t('common.delete'), confirmText: t('common.delete') })) {
          try {
            await api.delete(`/relationships/${relId}`);
            renderContactDetail(uuid);
          } catch (err) {
            confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
          }
        }
      });
    });

    // Edit address
    document.querySelectorAll('.btn-edit-address').forEach(btn => {
      btn.addEventListener('click', () => {
        const addrEl = btn.closest('.detail-address');
        const addrId = btn.dataset.addressId;
        const addr = contact.addresses.find(a => String(a.address_id) === addrId);
        if (!addr) return;
        showEditAddressDialog(uuid, addr, () => renderContactDetail(uuid));
      });
    });

    // Move out from address
    document.querySelectorAll('.btn-moveout-address').forEach(btn => {
      btn.addEventListener('click', async () => {
        const addrId = btn.dataset.addressId;
        if (await confirmDialog(t('addresses.moveOutConfirm'), { title: t('addresses.moveOut'), confirmText: t('addresses.moveOut') })) {
          try {
            await api.patch(`/addresses/contact/${uuid}/${addrId}/move-out`, {});
            renderContactDetail(uuid);
          } catch (err) {
            confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
          }
        }
      });
    });

    // Move back in (undo move-out)
    document.querySelectorAll('.btn-movein-address').forEach(btn => {
      btn.addEventListener('click', async () => {
        const addrId = btn.dataset.addressId;
        try {
          await api.patch(`/addresses/contact/${uuid}/${addrId}/move-in`, {});
          renderContactDetail(uuid);
        } catch (err) {
          confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
        }
      });
    });

    // Remove address link
    document.querySelectorAll('.btn-remove-address').forEach(btn => {
      btn.addEventListener('click', async () => {
        const addrId = btn.dataset.addressId;
        if (await confirmDialog(t('addresses.removeConfirm'), { title: t('common.delete'), confirmText: t('common.delete') })) {
          try {
            await api.delete(`/addresses/contact/${uuid}/${addrId}`);
            renderContactDetail(uuid);
          } catch (err) {
            confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
          }
        }
      });
    });

    // Address add form
    document.getElementById('btn-add-address')?.addEventListener('click', () => {
      document.getElementById('address-add-form').classList.toggle('d-none');
    });
    document.getElementById('addr-cancel')?.addEventListener('click', () => {
      document.getElementById('address-add-form').classList.add('d-none');
    });

    // Address tab switching
    document.querySelectorAll('.address-add-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.address-add-tabs button').forEach(b => {
          b.classList.toggle('active', b === btn);
          b.classList.toggle('btn-outline-primary', b === btn);
          b.classList.toggle('btn-outline-secondary', b !== btn);
        });
        document.getElementById('address-tab-new').classList.toggle('d-none', btn.dataset.tab !== 'new');
        document.getElementById('address-tab-same').classList.toggle('d-none', btn.dataset.tab !== 'same');
      });
    });

    // New address form
    document.getElementById('new-address-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.post('/addresses', {
          contact_uuid: uuid,
          street: document.getElementById('addr-street').value,
          postal_code: document.getElementById('addr-postal').value || undefined,
          city: document.getElementById('addr-city').value || undefined,
          label: document.getElementById('addr-label').value || t('addresses.defaultLabel'),
        });
        renderContactDetail(uuid);
      } catch (err) {
        confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
      }
    });

    // "Same address as" search
    let sameTimeout;
    document.getElementById('addr-same-search')?.addEventListener('input', (e) => {
      clearTimeout(sameTimeout);
      const q = e.target.value.trim();
      if (q.length < 2) { document.getElementById('addr-same-results').innerHTML = ''; return; }
      sameTimeout = setTimeout(() => loadSameAddressResults(q, uuid), 200);
    });

    async function loadSameAddressResults(q, contactUuid) {
      const results = document.getElementById('addr-same-results');
      try {
        const data = await api.get(`/addresses/search?q=${encodeURIComponent(q)}`);
        if (!data.results.length) { results.innerHTML = `<p class="text-muted small">${t('addresses.noResults')}</p>`; return; }
        // Group by address_id
        const byAddr = new Map();
        for (const r of data.results) {
          const key = r.address_id;
          if (!byAddr.has(key)) byAddr.set(key, { ...r, contacts: [] });
          byAddr.get(key).contacts.push(`${r.first_name} ${r.last_name || ''}`);
        }
        results.innerHTML = Array.from(byAddr.values()).map(a => `
          <button type="button" class="address-result" data-address-id="${a.address_id}">
            <strong>${escapeHtml(a.street)}</strong>
            <span class="text-muted small">${[a.postal_code, a.city].filter(Boolean).join(' ')} — ${a.contacts.join(', ')}</span>
          </button>
        `).join('');
        results.querySelectorAll('.address-result').forEach(btn => {
          btn.addEventListener('click', async () => {
            try {
              await api.post('/addresses/link', {
                contact_uuid: contactUuid,
                address_id: parseInt(btn.dataset.addressId),
                label: t('addresses.defaultLabel'),
              });
              renderContactDetail(contactUuid);
            } catch (err) {
              confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
            }
          });
        });
      } catch { results.innerHTML = ''; }
    }

    // ── Company management ──
    let selectedCompany = null;
    const companyForm = document.getElementById('add-company-form');
    const companySearchInput = document.getElementById('company-search-input');
    const companyResults = document.getElementById('company-search-results');
    const companySaveBtn = document.getElementById('btn-save-company');

    document.getElementById('btn-add-company')?.addEventListener('click', () => {
      companyForm.classList.toggle('d-none');
      if (!companyForm.classList.contains('d-none')) companySearchInput.focus();
    });

    document.getElementById('btn-cancel-company')?.addEventListener('click', () => {
      companyForm.classList.add('d-none');
      selectedCompany = null;
      companySearchInput.value = '';
      document.getElementById('company-role-input').value = '';
      document.getElementById('company-start-input').value = '';
      companySaveBtn.disabled = true;
    });

    let companySearchTimeout;
    companySearchInput?.addEventListener('input', () => {
      clearTimeout(companySearchTimeout);
      const q = companySearchInput.value.trim();
      if (q.length < 2) { companyResults.style.display = 'none'; selectedCompany = null; companySaveBtn.disabled = true; return; }
      companySearchTimeout = setTimeout(async () => {
        const { companies } = await api.get(`/companies?search=${encodeURIComponent(q)}`);
        companyResults.innerHTML = companies.slice(0, 5).map(c => `
          <button type="button" class="dropdown-item company-result" data-uuid="${c.uuid}" data-name="${escapeHtml(c.name)}">
            <i class="bi bi-building me-2"></i>${escapeHtml(c.name)}${c.industry ? ` <span class="text-muted small">— ${escapeHtml(c.industry)}</span>` : ''}
          </button>
        `).join('') + `
          <button type="button" class="dropdown-item company-create text-primary">
            <i class="bi bi-plus me-2"></i>${t('companies.createNew', { name: escapeHtml(q) })}
          </button>`;
        companyResults.style.display = 'block';

        companyResults.querySelectorAll('.company-result').forEach(btn => {
          btn.addEventListener('click', () => {
            selectedCompany = { uuid: btn.dataset.uuid, name: btn.dataset.name };
            companySearchInput.value = btn.dataset.name;
            companyResults.style.display = 'none';
            companySaveBtn.disabled = false;
          });
        });

        companyResults.querySelector('.company-create')?.addEventListener('click', async () => {
          const { company } = await api.post('/companies', { name: q });
          selectedCompany = { uuid: company.uuid, name: company.name };
          companySearchInput.value = company.name;
          companyResults.style.display = 'none';
          companySaveBtn.disabled = false;
        });
      }, 200);
    });

    companySearchInput?.addEventListener('blur', () => setTimeout(() => { companyResults.style.display = 'none'; }, 200));

    companySaveBtn?.addEventListener('click', async () => {
      if (!selectedCompany) return;
      await api.post(`/companies/${selectedCompany.uuid}/employees`, {
        contact_uuid: uuid,
        title: document.getElementById('company-role-input').value.trim() || null,
        start_date: document.getElementById('company-start-input').value || null,
      });
      // Reset form and reload
      companyForm.classList.add('d-none');
      selectedCompany = null;
      companySearchInput.value = '';
      document.getElementById('company-role-input').value = '';
      document.getElementById('company-start-input').value = '';
      companySaveBtn.disabled = true;
      renderContactDetail(contactUuid);
    });

    // Remove company link
    document.querySelectorAll('.company-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const row = btn.closest('.company-row');
        const ok = await confirmDialog(t('companies.removeConfirm'));
        if (!ok) return;
        await api.delete(`/companies/employees/${row.dataset.linkId}`);
        row.remove();
      });
    });

    // Load posts with edit/delete support
    const reloadPosts = () => renderPostList('contact-posts', uuid, reloadPosts);
    reloadPosts();

    // Profile view tabs (posts / gallery)
    let galleryLoaded = false;
    document.getElementById('profile-view-tabs').addEventListener('click', async (e) => {
      const tab = e.target.closest('.filter-tab');
      if (!tab) return;
      document.querySelectorAll('#profile-view-tabs .filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const view = tab.dataset.view;
      document.getElementById('contact-posts').classList.toggle('d-none', view !== 'posts');
      document.querySelector('.post-compose-inline')?.classList.toggle('d-none', view !== 'posts');
      document.getElementById('contact-gallery').classList.toggle('d-none', view !== 'gallery');

      if (view === 'gallery' && !galleryLoaded) {
        galleryLoaded = true;
        await loadContactGallery(uuid);
      }
    });

    // Quick post visibility pill toggle
    document.getElementById('quick-post-visibility-btn').addEventListener('click', (e) => {
      const pill = e.currentTarget;
      const clicked = e.target.closest('.visibility-pill-option');
      if (!clicked) return;
      pill.dataset.visibility = clicked.dataset.val;
      pill.querySelectorAll('.visibility-pill-option').forEach(o => o.classList.toggle('active', o.dataset.val === clicked.dataset.val));
    });

    // Quick post media handling (images + documents)
    let quickPostMedia = [];
    document.getElementById('quick-post-media-input')?.addEventListener('change', (e) => {
      for (const file of e.target.files) {
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) quickPostMedia.push(file);
      }
      renderQuickMediaPreview();
      e.target.value = '';
    });

    document.getElementById('quick-post-doc-input')?.addEventListener('change', (e) => {
      for (const file of e.target.files) quickPostMedia.push(file);
      renderQuickMediaPreview();
      e.target.value = '';
    });

    // Drop zone for quick post (images + documents)
    enableDropZone(document.getElementById('quick-post-form').closest('.post-compose-inline'), (files) => {
      quickPostMedia.push(...files);
      renderQuickMediaPreview();
    }, { acceptDocuments: true });

    const docIcons = { 'application/pdf': 'bi-file-earmark-pdf', 'text/plain': 'bi-file-earmark-text', 'text/csv': 'bi-file-earmark-spreadsheet' };
    function getDocIcon(type) {
      if (type.includes('word') || type.includes('document')) return 'bi-file-earmark-word';
      if (type.includes('excel') || type.includes('sheet') || type.includes('csv')) return 'bi-file-earmark-spreadsheet';
      return docIcons[type] || 'bi-file-earmark';
    }

    function renderQuickMediaPreview() {
      const el = document.getElementById('quick-post-media-preview');
      if (!quickPostMedia.length) { el.classList.add('d-none'); el.innerHTML = ''; return; }
      el.classList.remove('d-none');
      el.innerHTML = quickPostMedia.map((f, i) => {
        if (f.type.startsWith('image/')) {
          return `<div class="media-preview-item">
            <img src="${URL.createObjectURL(f)}" alt="">
            <button type="button" class="media-preview-remove" data-index="${i}"><i class="bi bi-x"></i></button>
          </div>`;
        }
        if (f.type.startsWith('video/')) {
          return `<div class="media-preview-item">
            <video src="${URL.createObjectURL(f)}" muted style="height:64px;width:64px;object-fit:cover;border-radius:var(--radius-sm)"></video>
            <div class="media-preview-video-badge"><i class="bi bi-play-fill"></i></div>
            <button type="button" class="media-preview-remove" data-index="${i}"><i class="bi bi-x"></i></button>
          </div>`;
        }
        return `<div class="media-preview-item media-preview-doc">
          <i class="${getDocIcon(f.type)}"></i>
          <span class="media-preview-doc-name">${f.name}</span>
          <button type="button" class="media-preview-remove" data-index="${i}"><i class="bi bi-x"></i></button>
        </div>`;
      }).join('');
      el.querySelectorAll('.media-preview-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          quickPostMedia.splice(parseInt(btn.dataset.index), 1);
          renderQuickMediaPreview();
        });
      });
    }

    // Quick post with @-mention support
    const quickPostExtra = [];
    attachMention(document.getElementById('quick-post-body'), (contact) => {
      if (contact.uuid !== uuid && !quickPostExtra.find((c) => c.uuid === contact.uuid)) {
        quickPostExtra.push(contact);
      }
    });

    // ── Link preview detection ──
    let quickPostLinkPreview = null;
    let linkPreviewFetchedUrl = null;
    let linkPreviewDismissed = false;
    let linkPreviewTimeout = null;
    const urlRegex = /https?:\/\/[^\s<]+/g;

    const postBody = document.getElementById('quick-post-body');
    const linkPreviewEl = document.getElementById('quick-post-link-preview');

    function renderQuickLinkPreview() {
      if (!quickPostLinkPreview || linkPreviewDismissed) {
        linkPreviewEl.classList.add('d-none');
        linkPreviewEl.innerHTML = '';
        return;
      }
      const lp = quickPostLinkPreview;
      const domain = lp.site_name || (() => { try { return new URL(lp.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
      linkPreviewEl.innerHTML = `
        <div class="link-preview-compose">
          <button type="button" class="link-preview-dismiss" title="${t('common.cancel')}"><i class="bi bi-x-lg"></i></button>
          <a href="${lp.url}" target="_blank" rel="noopener noreferrer" class="link-preview-card">
            ${lp.image_url ? `<div class="link-preview-image"><img src="${lp.image_url}" alt="" loading="lazy"></div>` : ''}
            <div class="link-preview-body">
              ${domain ? `<span class="link-preview-site">${domain}</span>` : ''}
              <span class="link-preview-title">${lp.title || lp.url}</span>
              ${lp.description ? `<span class="link-preview-desc">${lp.description}</span>` : ''}
            </div>
          </a>
        </div>`;
      linkPreviewEl.classList.remove('d-none');
      linkPreviewEl.querySelector('.link-preview-dismiss').addEventListener('click', () => {
        linkPreviewDismissed = true;
        quickPostLinkPreview = null;
        renderQuickLinkPreview();
      });
    }

    postBody.addEventListener('input', () => {
      clearTimeout(linkPreviewTimeout);
      if (linkPreviewDismissed) return;
      linkPreviewTimeout = setTimeout(async () => {
        const urls = postBody.value.match(urlRegex);
        const firstUrl = urls?.[0];
        if (!firstUrl || firstUrl === linkPreviewFetchedUrl) return;
        linkPreviewFetchedUrl = firstUrl;
        try {
          const data = await api.get(`/posts/link-preview?url=${encodeURIComponent(firstUrl)}`);
          if (data.title) {
            quickPostLinkPreview = data;
            renderQuickLinkPreview();
          }
        } catch {}
      }, 600);
    });

    // Also detect on paste (immediate)
    postBody.addEventListener('paste', () => {
      if (linkPreviewDismissed) return;
      setTimeout(() => postBody.dispatchEvent(new Event('input')), 100);
    });

    document.getElementById('quick-post-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = document.getElementById('quick-post-body').value.trim();
      if (!body) return;

      const extraUuids = quickPostExtra.map((c) => c.uuid);
      const { post } = await api.post('/posts', {
        body,
        about_contact_uuid: uuid,
        contact_uuids: extraUuids.length ? extraUuids : undefined,
        visibility: document.getElementById('quick-post-visibility-btn').dataset.visibility,
        link_preview: quickPostLinkPreview || undefined,
      });

      // Upload media
      if (quickPostMedia.length && post?.uuid) {
        const formData = new FormData();
        for (const file of quickPostMedia) formData.append('media', file);
        await api.upload(`/posts/${post.uuid}/media`, formData);
      }

      document.getElementById('quick-post-body').value = '';
      quickPostMedia = [];
      renderQuickMediaPreview();
      quickPostExtra.length = 0;
      quickPostLinkPreview = null;
      linkPreviewFetchedUrl = null;
      linkPreviewDismissed = false;
      renderQuickLinkPreview();
      reloadPosts();
    });

  } catch (err) {
    content.innerHTML = `<div class="page-container"><div class="alert alert-danger">${err.message}</div></div>`;
  }
}

async function loadContactGallery(contactUuid) {
  const el = document.getElementById('contact-gallery');
  if (!el) return;

  el.innerHTML = `<div class="loading">${t('app.loading')}</div>`;

  try {
    const { images } = await api.get(`/posts/gallery?contact=${contactUuid}`);

    if (!images.length) {
      el.innerHTML = `<div class="empty-state"><i class="bi bi-image"></i><p>${t('posts.noPhotos')}</p></div>`;
      return;
    }

    el.innerHTML = `
      <div class="contact-gallery-grid">
        ${images.map((img, i) => `
          <div class="contact-gallery-item" data-index="${i}">
            <img src="${authUrl(img.thumbnail_path || img.file_path)}" alt="" loading="lazy">
            ${img.reaction_count || img.comment_count ? `
              <div class="contact-gallery-meta">
                ${img.reaction_count ? `<span><i class="bi bi-heart-fill"></i> ${img.reaction_count}</span>` : ''}
                ${img.comment_count ? `<span><i class="bi bi-chat-fill"></i> ${img.comment_count}</span>` : ''}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;

    // Lightbox — navigate across ALL images for this contact
    el.querySelectorAll('.contact-gallery-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index);
        showGalleryLightbox(images, idx, contactUuid);
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function showGalleryLightbox(images, startIndex, contactUuid) {
  let current = startIndex;
  let commentDebounce = null;
  const mid = 'gallery-lb-' + Date.now();

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${mid}" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-centered">
        <div class="modal-content gallery-lb-content">
          <div class="gallery-lb-image-area">
            <div class="photo-viewer" id="${mid}-viewer"></div>
          </div>
          <div class="gallery-lb-sidebar" id="${mid}-sidebar"></div>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(mid);
  const modal = new bootstrap.Modal(modalEl);

  async function update() {
    const img = images[current];

    // Image area
    document.getElementById(`${mid}-viewer`).innerHTML = `
      <img src="${authUrl(img.file_path)}" alt="">
      ${images.length > 1 ? `
        <button type="button" class="photo-viewer-nav photo-viewer-prev" id="${mid}-prev"><i class="bi bi-chevron-left"></i></button>
        <button type="button" class="photo-viewer-nav photo-viewer-next" id="${mid}-next"><i class="bi bi-chevron-right"></i></button>
      ` : ''}
    `;

    // Sidebar
    const postDate = img.post_date ? formatDate(img.post_date) : '';
    const sidebar = document.getElementById(`${mid}-sidebar`);
    sidebar.innerHTML = `
      <div class="gallery-lb-sidebar-header">
        <span class="small">${current + 1} / ${images.length}</span>
        ${postDate ? `<span class="text-muted small">${postDate}</span>` : ''}
        <button type="button" class="btn-close ms-auto" data-bs-dismiss="modal"></button>
      </div>
      ${img.post_body ? `<p class="small mb-3">${escapeHtml(img.post_body)}</p>` : ''}
      <div class="gallery-lb-stats mb-3">
        ${img.reaction_count ? `<span class="small"><i class="bi bi-heart-fill text-danger"></i> ${img.reaction_count}</span>` : ''}
        ${img.comment_count ? `<span class="small"><i class="bi bi-chat-fill"></i> ${img.comment_count}</span>` : ''}
      </div>
      <div id="${mid}-comments" class="gallery-lb-comments">
        <div class="loading small">${t('app.loading')}</div>
      </div>
      ${img.post_uuid ? `<a href="/contacts/${contactUuid}?post=${img.post_uuid}" data-link class="subtle-link small d-block mt-2" data-bs-dismiss="modal"><i class="bi bi-journal-text me-1"></i>${t('posts.viewPost')}</a>` : ''}
    `;

    attachNav();

    // Load comments with debounce (avoid rate-limit when browsing fast)
    clearTimeout(commentDebounce);
    const commentsEl = document.getElementById(`${mid}-comments`);
    if (img.comment_count && img.post_uuid) {
      commentDebounce = setTimeout(async () => {
        try {
          const { comments } = await api.get(`/posts/${img.post_uuid}/comments`);
          const el = document.getElementById(`${mid}-comments`);
          if (el) {
            el.innerHTML = comments.length ? comments.map(c => `
              <div class="gallery-lb-comment">
                <strong class="small">${escapeHtml(c.user?.first_name || '')} ${escapeHtml(c.user?.last_name || '')}</strong>
                <span class="small">${escapeHtml(c.body)}</span>
              </div>
            `).join('') : '';
          }
        } catch { /* ignore */ }
      }, 500);
    } else if (commentsEl) {
      commentsEl.innerHTML = '';
    }
  }

  function attachNav() {
    document.getElementById(`${mid}-prev`)?.addEventListener('click', () => { current = (current - 1 + images.length) % images.length; update(); });
    document.getElementById(`${mid}-next`)?.addEventListener('click', () => { current = (current + 1) % images.length; update(); });
  }

  const keyHandler = (e) => {
    if (e.key === 'ArrowLeft') { current = (current - 1 + images.length) % images.length; update(); }
    if (e.key === 'ArrowRight') { current = (current + 1) % images.length; update(); }
  };
  document.addEventListener('keydown', keyHandler);

  modalEl.addEventListener('hidden.bs.modal', () => {
    document.removeEventListener('keydown', keyHandler);
    modalEl.remove();
  }, { once: true });

  update();
  modal.show();
}

function renderEditMode(contact) {
  const content = document.getElementById('app-content');

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-cancel"><i class="bi bi-x-lg"></i></button>
        <h2>${t('contacts.editContact')}</h2>
        <div></div>
      </div>
      <form id="edit-form" class="detail-card glass-card">
        <div class="row g-2 mb-3">
          <div class="col">
            <div class="form-floating">
              <input type="text" class="form-control" id="edit-first-name" value="${escapeAttr(contact.first_name)}" required>
              <label>${t('auth.firstName')}</label>
            </div>
          </div>
          <div class="col">
            <div class="form-floating">
              <input type="text" class="form-control" id="edit-last-name" value="${escapeAttr(contact.last_name || '')}">
              <label>${t('auth.lastName')}</label>
            </div>
          </div>
        </div>
        <div class="form-floating mb-3">
          <input type="text" class="form-control" id="edit-nickname" value="${escapeAttr(contact.nickname || '')}">
          <label>${t('contacts.nickname')}</label>
        </div>
        <label class="form-label small mb-1">${t('contacts.dateOfBirth')}</label>
        <div class="row g-2 mb-3">
          <div class="col-4">
            <select class="form-select" id="edit-birth-day">
              <option value="">${t('contacts.day')}</option>
              ${Array.from({length: 31}, (_, i) => `<option value="${i+1}" ${contact.birth_day === i+1 ? 'selected' : ''}>${i+1}</option>`).join('')}
            </select>
          </div>
          <div class="col-4">
            <select class="form-select" id="edit-birth-month">
              <option value="">${t('contacts.month')}</option>
              ${Array.from({length: 12}, (_, i) => `<option value="${i+1}" ${contact.birth_month === i+1 ? 'selected' : ''}>${t('contacts.months.' + (i+1))}</option>`).join('')}
            </select>
          </div>
          <div class="col-4">
            <input type="number" class="form-control" id="edit-birth-year" placeholder="${t('contacts.year')}" min="1900" max="${new Date().getFullYear()}" value="${contact.birth_year || ''}">
          </div>
        </div>
        <div class="form-floating mb-3">
          <textarea class="form-control" id="edit-how-met" style="height:80px">${escapeHtml(contact.how_we_met || '')}</textarea>
          <label>${t('contacts.howWeMet')}</label>
        </div>
        <div class="form-floating mb-3">
          <textarea class="form-control" id="edit-notes" style="height:100px">${escapeHtml(contact.notes || '')}</textarea>
          <label>${t('contacts.notes')}</label>
        </div>
        <div class="mt-3">
          <label class="form-label small">${t('visibility.shared')} / ${t('visibility.private')}</label>
          <div class="visibility-pill" id="edit-visibility-btn" data-visibility="${contact.visibility}">
            <span class="visibility-pill-option ${contact.visibility === 'shared' ? 'active' : ''}" data-val="shared"><i class="bi bi-people-fill"></i> ${t('visibility.shared')}</span>
            <span class="visibility-pill-option ${contact.visibility === 'private' ? 'active' : ''}" data-val="private"><i class="bi bi-lock-fill"></i> ${t('visibility.private')}</span>
          </div>
        </div>
        <div id="edit-error" class="alert alert-danger d-none mt-3"></div>
        <div class="d-flex gap-2 mt-3">
          <button type="submit" class="btn btn-primary">${t('common.save')}</button>
          <button type="button" class="btn btn-outline-secondary" id="btn-cancel-2">${t('common.cancel')}</button>
        </div>
      </form>
    </div>
  `;

  const goBack = () => renderContactDetail(contact.uuid);
  document.getElementById('btn-cancel').addEventListener('click', goBack);
  document.getElementById('btn-cancel-2').addEventListener('click', goBack);

  document.getElementById('edit-visibility-btn').addEventListener('click', (e) => {
    const pill = e.currentTarget;
    const clicked = e.target.closest('.visibility-pill-option');
    if (!clicked) return;
    pill.dataset.visibility = clicked.dataset.val;
    pill.querySelectorAll('.visibility-pill-option').forEach(o => o.classList.toggle('active', o.dataset.val === clicked.dataset.val));
  });

  document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('edit-error');
    errorEl.classList.add('d-none');
    try {
      await api.put(`/contacts/${contact.uuid}`, {
        first_name: document.getElementById('edit-first-name').value,
        last_name: document.getElementById('edit-last-name').value || null,
        nickname: document.getElementById('edit-nickname').value || null,
        birth_day: parseInt(document.getElementById('edit-birth-day').value) || null,
        birth_month: parseInt(document.getElementById('edit-birth-month').value) || null,
        birth_year: parseInt(document.getElementById('edit-birth-year').value) || null,
        how_we_met: document.getElementById('edit-how-met').value || null,
        notes: document.getElementById('edit-notes').value || null,
        visibility: document.getElementById('edit-visibility-btn').dataset.visibility,
      });
      renderContactDetail(contact.uuid);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('d-none');
    }
  });
}

async function loadContactLifeEvents(contactUuid) {
  const el = document.getElementById('contact-life-events');
  if (!el) return;
  try {
    const { events } = await api.get(`/life-events?contact_uuid=${contactUuid}`);
    if (!events.length) {
      el.innerHTML = `<p class="text-muted small">${t('lifeEvents.noEvents')}</p>`;
      return;
    }
    el.innerHTML = events.map(e => `
      <div class="life-event-item">
        <div class="life-event-icon" style="color:${e.color}">
          <i class="${e.icon}"></i>
        </div>
        <div class="life-event-info">
          <div class="life-event-type">${t('lifeEvents.types.' + e.event_type)} ${e.remind_annually ? '<i class="bi bi-bell-fill text-muted" style="font-size:0.65rem" title="' + t('lifeEvents.remindAnnually') + '"></i>' : ''}</div>
          <div class="life-event-date text-muted small">${formatDate(e.event_date)}</div>
          ${e.description ? `<div class="life-event-desc text-muted small">${escapeHtml(e.description)}</div>` : ''}
          ${e.linked_contacts.length ? `
            <div class="life-event-linked">
              ${e.linked_contacts.map(c => `<a href="/contacts/${c.uuid}" data-link class="text-muted small">${c.first_name} ${c.last_name || ''}</a>`).join(', ')}
            </div>
          ` : ''}
        </div>
        <div class="life-event-actions">
          <button class="btn btn-link btn-sm btn-edit-event" data-uuid="${e.uuid}" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-link btn-sm text-danger btn-delete-event" data-uuid="${e.uuid}" title="${t('common.delete')}"><i class="bi bi-x-lg"></i></button>
        </div>
      </div>
    `).join('');

    el.querySelectorAll('.btn-edit-event').forEach(btn => {
      btn.addEventListener('click', () => {
        const event = events.find(e => e.uuid === btn.dataset.uuid);
        if (event) showEditLifeEventDialog(event, () => loadContactLifeEvents(contactUuid));
      });
    });

    el.querySelectorAll('.btn-delete-event').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api.delete(`/life-events/${btn.dataset.uuid}`);
        loadContactLifeEvents(contactUuid);
      });
    });
  } catch { el.innerHTML = ''; }
}

async function showLifeEventDialog(contactUuid, existingEvent, onDone) {
  let types;
  try {
    types = (await api.get('/life-events/types')).types;
  } catch { return; }

  const isEdit = !!existingEvent;
  const id = 'le-dlg-' + Date.now();
  let linkedContacts = isEdit ? [...(existingEvent.linked_contacts || [])] : [];

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${isEdit ? t('common.edit') : t('lifeEvents.add')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label small">${t('lifeEvents.eventType')}</label>
              <div class="life-event-type-grid">
                ${types.map(tp => `
                  <button type="button" class="life-event-type-btn ${isEdit && existingEvent.event_type === tp.name ? 'active' : ''}" data-id="${tp.id}" data-name="${tp.name}">
                    <i class="${tp.icon}" style="color:${tp.color}"></i>
                    <span>${t('lifeEvents.types.' + tp.name)}</span>
                  </button>
                `).join('')}
              </div>
            </div>
            <div id="${id}-details" class="${isEdit ? '' : 'd-none'}">
              <div class="form-floating mb-3">
                <input type="date" class="form-control" id="${id}-date" value="${isEdit ? (existingEvent.event_date || '').substring(0, 10) : ''}" required>
                <label>${t('lifeEvents.date')}</label>
              </div>
              <div class="form-floating mb-3">
                <textarea class="form-control" id="${id}-desc" style="height:60px">${isEdit ? escapeHtml(existingEvent.description || '') : ''}</textarea>
                <label>${t('lifeEvents.description')}</label>
              </div>
              <div class="form-check mb-3">
                <input type="checkbox" class="form-check-input" id="${id}-remind" ${isEdit && existingEvent.remind_annually ? 'checked' : ''}>
                <label class="form-check-label small" for="${id}-remind">${t('lifeEvents.remindAnnually')}</label>
              </div>
              <div class="mb-3">
                <label class="form-label small">${t('lifeEvents.linkedContacts')}</label>
                <div id="${id}-linked" class="d-flex flex-wrap gap-1 mb-1"></div>
                <div class="position-relative">
                  <input type="text" class="form-control form-control-sm" id="${id}-link-search" placeholder="${t('relationships.searchContact')}">
                  <div id="${id}-link-results" class="contact-search-results position-absolute w-100" style="z-index:1100;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-sm);box-shadow:var(--shadow-md);max-height:200px;overflow-y:auto"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer ${isEdit ? '' : 'd-none'}" id="${id}-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
            <button type="button" class="btn btn-primary btn-sm" id="${id}-submit">${t('common.save')}</button>
          </div>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(id);
  const modal = new bootstrap.Modal(modalEl);
  let selectedTypeId = isEdit ? types.find(tp => tp.name === existingEvent.event_type)?.id : null;

  function renderLinked() {
    const el = document.getElementById(`${id}-linked`);
    el.innerHTML = linkedContacts.map(c => `
      <span class="contact-chip" data-uuid="${c.uuid}">
        <span class="contact-chip-avatar">
          ${c.avatar
            ? `<img src="${authUrl(c.avatar)}" alt="">`
            : `<span>${(c.first_name?.[0] || '') + (c.last_name?.[0] || '')}</span>`
          }
        </span>
        ${c.first_name} ${c.last_name || ''}
        <button type="button" class="contact-chip-remove" data-uuid="${c.uuid}"><i class="bi bi-x"></i></button>
      </span>
    `).join('');
    el.querySelectorAll('.contact-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        linkedContacts = linkedContacts.filter(c => c.uuid !== btn.dataset.uuid);
        renderLinked();
      });
    });
  }
  renderLinked();

  // Inline search for linked contacts
  const linkSearch = document.getElementById(`${id}-link-search`);
  const linkResults = document.getElementById(`${id}-link-results`);
  let linkTimeout;
  linkSearch.addEventListener('input', () => {
    clearTimeout(linkTimeout);
    const q = linkSearch.value.trim();
    if (q.length < 1) { linkResults.innerHTML = ''; return; }
    linkTimeout = setTimeout(async () => {
      try {
        const data = await api.get(`/contacts?search=${encodeURIComponent(q)}&limit=6`);
        const filtered = data.contacts.filter(c => !linkedContacts.find(lc => lc.uuid === c.uuid));
        linkResults.innerHTML = filtered.map(c =>
          contactRowHtml(c, { tag: 'div', meta: c.nickname ? `"${c.nickname}"` : '' })
        ).join('') || '';
        linkResults.querySelectorAll('.contact-row').forEach((item, i) => {
          item.addEventListener('click', () => {
            const c = filtered[i];
            linkedContacts.push({ uuid: c.uuid, first_name: c.first_name, last_name: c.last_name, avatar: c.avatar || null });
            renderLinked();
            linkSearch.value = '';
            linkResults.innerHTML = '';
          });
        });
      } catch {}
    }, 200);
  });
  linkSearch.addEventListener('blur', () => setTimeout(() => { linkResults.innerHTML = ''; }, 200));

  // Type selection
  modalEl.querySelectorAll('.life-event-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modalEl.querySelectorAll('.life-event-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTypeId = parseInt(btn.dataset.id);
      document.getElementById(`${id}-details`).classList.remove('d-none');
      document.getElementById(`${id}-footer`).classList.remove('d-none');
      document.getElementById(`${id}-date`).focus();
    });
  });

  // Submit
  document.getElementById(`${id}-submit`).addEventListener('click', async () => {
    const date = document.getElementById(`${id}-date`).value;
    if (!selectedTypeId || !date) return;
    try {
      const payload = {
        event_type_id: selectedTypeId,
        event_date: date,
        description: document.getElementById(`${id}-desc`).value.trim() || undefined,
        remind_annually: document.getElementById(`${id}-remind`).checked,
        linked_contact_uuids: linkedContacts.map(c => c.uuid),
      };
      if (isEdit) {
        await api.put(`/life-events/${existingEvent.uuid}`, payload);
      } else {
        payload.contact_uuid = contactUuid;
        await api.post('/life-events', payload);
      }
      modal.hide();
      if (onDone) onDone();
    } catch (err) {
      confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
    }
  });

  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
}

function showAddLifeEventDialog(contactUuid, onDone) {
  return showLifeEventDialog(contactUuid, null, onDone);
}

function showEditLifeEventDialog(event, onDone) {
  return showLifeEventDialog(null, event, onDone);
}

async function loadContactReminders(contactUuid) {
  const el = document.getElementById('contact-reminders');
  if (!el) return;
  try {
    const { reminders } = await api.get(`/reminders?contact_uuid=${contactUuid}`);
    if (!reminders.length) {
      el.innerHTML = `<p class="text-muted small">${t('reminders.noReminders')}</p>`;
      return;
    }
    el.innerHTML = reminders.map(r => `
      <div class="reminder-item ${r.is_completed ? 'text-muted' : ''}">
        <div class="reminder-info">
          <span class="reminder-title">${r.is_recurring ? '🔁 ' : ''}${escapeHtml(r.title)}</span>
          <span class="reminder-date text-muted small">${r.next_date}</span>
        </div>
        <div class="reminder-actions">
          ${!r.is_completed ? `<button class="btn btn-link btn-sm btn-complete-reminder" data-id="${r.id}" title="${t('reminders.complete')}"><i class="bi bi-check-lg"></i></button>` : ''}
          <button class="btn btn-link btn-sm text-danger btn-delete-reminder" data-id="${r.id}" title="${t('common.delete')}"><i class="bi bi-x-lg"></i></button>
        </div>
      </div>
    `).join('');

    el.querySelectorAll('.btn-complete-reminder').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api.put(`/reminders/${btn.dataset.id}`, { is_completed: true });
        loadContactReminders(contactUuid);
      });
    });
    el.querySelectorAll('.btn-delete-reminder').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api.delete(`/reminders/${btn.dataset.id}`);
        loadContactReminders(contactUuid);
      });
    });
  } catch { el.innerHTML = ''; }
}

function renderGroupedRelationships(relationships, { hasAddress = false } = {}) {
  // Sort order for relationship types
  const typePriority = { spouse: 0, cohabitant: 1, boyfriend_girlfriend: 2, partner: 3, child: 4, parent: 5, sibling: 6, grandchild: 7, grandparent: 8, stepchild: 9, stepparent: 10 };
  const catPriority = { family: 0, social: 1, professional: 2 };

  // Sort: family first, then by type priority, then alphabetically
  const sorted = [...relationships].sort((a, b) => {
    const catA = catPriority[a.category] ?? 9;
    const catB = catPriority[b.category] ?? 9;
    if (catA !== catB) return catA - catB;
    const typeA = typePriority[a.relationship] ?? 6;
    const typeB = typePriority[b.relationship] ?? 6;
    if (typeA !== typeB) return typeA - typeB;
    return (a.first_name || '').localeCompare(b.first_name || '');
  });

  // Group by category
  const groups = new Map();
  for (const r of sorted) {
    const cat = r.category || 'other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(r);
  }

  let html = '';
  for (const [cat, items] of groups) {
    if (groups.size > 1) {
      const catLabel = { family: t('relationships.categories.family'), social: t('relationships.categories.social'), professional: t('relationships.categories.professional') }[cat] || cat;
      html += `<div class="relationship-group-label">${catLabel}</div>`;
    }
    html += items.map(r => `
      <div class="relationship-row-wrapper" data-rel-id="${r.relationship_id}" data-rel-type-id="${r.relationship_type_id}" data-start="${r.start_date || ''}" data-end="${r.end_date || ''}" data-contact-uuid="${r.uuid}">
        ${contactRowHtml(r, { meta: t(`relationships.types.${r.relationship}`) })}
        <div class="relationship-actions">
          ${hasAddress ? `<button type="button" class="btn btn-link btn-sm btn-share-address" title="${t('addresses.shareAddress')}"><i class="bi bi-house-add"></i></button>` : ''}
          <button type="button" class="btn btn-link btn-sm btn-edit-rel" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
          <button type="button" class="btn btn-link btn-sm text-danger btn-delete-rel" title="${t('common.delete')}"><i class="bi bi-x-lg"></i></button>
        </div>
      </div>
    `).join('');
  }
  return html;
}

let _treeModal = null; // persistent modal instance

async function showFamilyTree(contactUuid) {
  // Create modal shell (recreate if DOM element was removed)
  if (_treeModal && !document.contains(_treeModal.el)) {
    _treeModal = null;
  }
  if (!_treeModal) {
    const dlgId = 'tree-modal-' + Date.now();
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade" id="${dlgId}" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered" style="max-width:90vw;width:90vw">
          <div class="modal-content" style="height:85vh">
            <div class="modal-header">
              <h5 class="modal-title"><i class="bi bi-diagram-2 me-2"></i>${t('relationships.familyTree')}</h5>
              <div class="d-flex align-items-center gap-3 ms-auto me-3" id="tree-controls"></div>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body tree-pan-container" style="overflow:hidden;flex:1;position:relative;cursor:grab">
              <div class="tree-pan-inner" id="tree-inner" style="transform-origin:0 0"></div>
            </div>
          </div>
        </div>
      </div>
    `);

    const modalEl = document.getElementById(dlgId);
    _treeModal = { el: modalEl, bs: new bootstrap.Modal(modalEl) };

    // --- Pan & Zoom (attached once) ---
    const container = modalEl.querySelector('.tree-pan-container');
    const inner = document.getElementById('tree-inner');
    let scale = 1, panX = 0, panY = 0, isPanning = false, startX, startY;

    _treeModal._visible = false;

    _treeModal.resetView = (w, h) => {
      _treeModal._svgW = w;
      _treeModal._svgH = h;
      const cw = container.clientWidth, ch = container.clientHeight;
      if (cw && ch && w && h) {
        const pad = 40;
        scale = Math.min((cw - pad) / w, (ch - pad) / h, 1.5);
        panX = (cw - w * scale) / 2;
        panY = (ch - h * scale) / 2;
        inner.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
      }
    };

    // Only source of truth for first-time fit: after modal animation completes
    modalEl.addEventListener('shown.bs.modal', () => {
      _treeModal._visible = true;
      if (_treeModal._svgW) {
        _treeModal.resetView(_treeModal._svgW, _treeModal._svgH);
        inner.style.visibility = '';
      }
    });
    modalEl.addEventListener('hidden.bs.modal', () => { _treeModal._visible = false; });

    function applyTransform() {
      inner.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }

    container.addEventListener('mousedown', (e) => {
      if (e.target.closest('.tree-node')) return;
      isPanning = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      container.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      applyTransform();
    });

    window.addEventListener('mouseup', () => {
      isPanning = false;
      if (container) container.style.cursor = 'grab';
    });

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(Math.max(scale * delta, 0.2), 3);
      panX = mx - (mx - panX) * (newScale / scale);
      panY = my - (my - panY) * (newScale / scale);
      scale = newScale;
      applyTransform();
    }, { passive: false });

    let lastTouchDist = 0;
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) { isPanning = true; startX = e.touches[0].clientX - panX; startY = e.touches[0].clientY - panY; }
      else if (e.touches.length === 2) { lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
    }, { passive: true });
    container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && isPanning) { panX = e.touches[0].clientX - startX; panY = e.touches[0].clientY - startY; applyTransform(); }
      else if (e.touches.length === 2) { const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (lastTouchDist) { scale = Math.min(Math.max(scale * (dist / lastTouchDist), 0.2), 3); applyTransform(); } lastTouchDist = dist; }
    }, { passive: true });
    container.addEventListener('touchend', () => { isPanning = false; lastTouchDist = 0; });
  }

  // Load and render tree content
  await renderTreeContent(contactUuid, 3, ['family']);
  _treeModal.bs.show();
}

async function renderTreeContent(contactUuid, treeDepth, treeCategories, treeMode = 'full') {
  const inner = document.getElementById('tree-inner');
  const controlsEl = document.getElementById('tree-controls');
  inner.innerHTML = `<div class="text-center p-4 text-muted">${t('app.loading')}</div>`;

  const parentTypes = ['parent', 'stepparent', 'godparent', 'grandparent'];
  const childTypes = ['child', 'stepchild', 'godchild', 'grandchild'];
  const partnerTypes = ['spouse', 'partner', 'boyfriend_girlfriend', 'cohabitant'];

  try {
    const params = `depth=${treeDepth}&categories=${treeCategories.join(',')}`;
    const data = await api.get(`/relationships/tree/${contactUuid}?${params}`);
    const { rootId, nodes, edges: rawEdges } = data;

    if (nodes.length < 2) {
      inner.innerHTML = `<div class="text-center p-4 text-muted">${t('relationships.noFamilyTree')}</div>`;
      return;
    }

    // Filter edges based on tree mode
    // For directional modes, we need to do a two-pass:
    // 1. BFS with filtered edge types to find reachable nodes
    // 2. Only include edges between reachable nodes
    let edges;
    if (treeMode === 'full') {
      edges = rawEdges;
    } else {
      // Determine which edge types to follow during BFS
      const allowedForTraversal = (type, fromId, toId, currentId) => {
        const isPartner = partnerTypes.includes(type);
        if (isPartner) return true; // always follow partner edges

        if (treeMode === 'lineage') {
          // Only parent/child — no siblings, uncles, etc.
          return parentTypes.includes(type) || childTypes.includes(type);
        }
        if (treeMode === 'ancestors') {
          // Only go up: from current's perspective, follow edges where the other is a parent
          if (currentId === toId && parentTypes.includes(type)) return true; // other (from) is parent of me
          if (currentId === fromId && childTypes.includes(type)) return true; // I am child of other → other is parent
          return false;
        }
        if (treeMode === 'descendants') {
          // Only go down: from current's perspective, follow edges where the other is a child
          if (currentId === fromId && parentTypes.includes(type)) return true; // I am parent of other → other is child
          if (currentId === toId && childTypes.includes(type)) return true; // other (from) is child of me
          return false;
        }
        return true;
      };

      // BFS with filtered traversal to find reachable nodes
      const reachable = new Set([rootId]);
      const q = [rootId];
      while (q.length) {
        const cid = q.shift();
        for (const e of rawEdges) {
          let otherId;
          if (e.from === cid) otherId = e.to;
          else if (e.to === cid) otherId = e.from;
          else continue;
          if (reachable.has(otherId)) continue;
          if (allowedForTraversal(e.type, e.from, e.to, cid)) {
            reachable.add(otherId);
            q.push(otherId);
          }
        }
      }

      // Include only edges where both nodes are reachable
      edges = rawEdges.filter(e => reachable.has(e.from) && reachable.has(e.to));
      // Also filter out sibling edges in lineage/ancestors/descendants modes
      if (treeMode !== 'full') {
        edges = edges.filter(e => {
          const t = e.type;
          return parentTypes.includes(t) || childTypes.includes(t) || partnerTypes.includes(t)
            || (treeMode === 'full');
        });
      }
    }

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const levels = new Map();
    const partners = new Map();

    levels.set(rootId, 0);
    const bfsQ = [rootId];
    const bfsVisited = new Set([rootId]);

    while (bfsQ.length) {
      const cid = bfsQ.shift();
      const cLevel = levels.get(cid);
      for (const e of edges) {
        let otherId;
        if (e.from === cid) otherId = e.to;
        else if (e.to === cid) otherId = e.from;
        else continue;
        if (bfsVisited.has(otherId)) continue;
        bfsVisited.add(otherId);

        let level = cLevel;

        if (cid === e.from) {
          if (parentTypes.includes(e.type)) level = cLevel - 1;
          else if (childTypes.includes(e.type)) level = cLevel + 1;
          else if (partnerTypes.includes(e.type)) { partners.set(cid, otherId); partners.set(otherId, cid); }
        } else {
          if (parentTypes.includes(e.type)) level = cLevel + 1;
          else if (childTypes.includes(e.type)) level = cLevel - 1;
          else if (partnerTypes.includes(e.type)) { partners.set(cid, otherId); partners.set(otherId, cid); }
        }

        if (['sibling', 'friend', 'neighbor', 'classmate', 'colleague'].includes(e.type)) level = cLevel;

        levels.set(otherId, level);
        bfsQ.push(otherId);
      }
    }

    const byLevel = new Map();
    for (const [nid, level] of levels) {
      if (!byLevel.has(level)) byLevel.set(level, []);
      byLevel.get(level).push(nid);
    }

    for (const [, ids] of byLevel) {
      const ordered = [];
      const placed = new Set();
      if (ids.includes(rootId)) { ordered.push(rootId); placed.add(rootId); if (partners.has(rootId) && ids.includes(partners.get(rootId))) { ordered.push(partners.get(rootId)); placed.add(partners.get(rootId)); } }
      for (const nid of ids) {
        if (placed.has(nid)) continue;
        ordered.push(nid); placed.add(nid);
        if (partners.has(nid) && ids.includes(partners.get(nid)) && !placed.has(partners.get(nid))) { ordered.push(partners.get(nid)); placed.add(partners.get(nid)); }
      }
      ids.length = 0;
      ids.push(...ordered);
    }

    const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
    const nodeW = 130, nodeH = 64, avatarR = 16, gapX = 20, partnerGapX = 70, gapY = 70;

    // Calculate row widths accounting for wider partner gaps
    const partnerSet = new Set();
    for (const [a, b] of partners) partnerSet.add(`${Math.min(a,b)}-${Math.max(a,b)}`);

    function rowWidth(ids) {
      let w = 0;
      for (let i = 0; i < ids.length; i++) {
        if (i > 0) {
          const prev = ids[i - 1], cur = ids[i];
          const isPartnerPair = partners.get(prev) === cur || partners.get(cur) === prev;
          w += isPartnerPair ? partnerGapX : gapX;
        }
        w += nodeW;
      }
      return w;
    }

    const maxRowW = Math.max(...[...byLevel.values()].map(ids => rowWidth(ids)));
    const svgW = Math.max(400, maxRowW + gapX * 4);
    const svgH = sortedLevels.length * (nodeH + gapY) + gapY;

    const positions = new Map();
    for (const level of sortedLevels) {
      const ids = byLevel.get(level);
      const rw = rowWidth(ids);
      let x = (svgW - rw) / 2;
      const y = (level - sortedLevels[0]) * (nodeH + gapY) + gapY / 2;
      for (let i = 0; i < ids.length; i++) {
        if (i > 0) {
          const prev = ids[i - 1], cur = ids[i];
          const isPartnerPair = partners.get(prev) === cur || partners.get(cur) === prev;
          x += isPartnerPair ? partnerGapX : gapX;
        }
        positions.set(ids[i], { x, y });
        x += nodeW;
      }
    }

    const relLabels = {};
    for (const key of Object.keys(t('relationships.types') || {})) {
      relLabels[key] = t('relationships.types.' + key);
    }

    // Build SVG
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" style="display:block">`;
    svg += `<defs><clipPath id="clip-circle" clipPathUnits="objectBoundingBox"><circle cx="0.5" cy="0.5" r="0.5"/></clipPath></defs>`;
    svg += `<style>
      .tree-edge { stroke: #d1d5db; stroke-width: 1.5; fill: none; transition: stroke 0.15s, stroke-width 0.15s; }
      .tree-edge.highlight { stroke: #007AFF; stroke-width: 2.5; }
      .tree-partner-edge { stroke: #f472b6; stroke-width: 1.5; stroke-dasharray: 4 3; fill: none; transition: stroke 0.15s, stroke-width 0.15s; }
      .tree-partner-edge.highlight { stroke: #007AFF; stroke-width: 2.5; }
      .tree-node { cursor: pointer; }
      .tree-node rect { fill: #fff; stroke: #e5e7eb; stroke-width: 1.5; rx: 10; transition: stroke 0.15s; }
      .tree-node.root rect { stroke: #007AFF; stroke-width: 2; fill: #f0f7ff; }
      .tree-node:hover rect { stroke: #007AFF; }
      .tree-node.dim { opacity: 0.3; }
      .tree-name { font-family: -apple-system, sans-serif; font-size: 11px; font-weight: 600; fill: #1f2937; }
      .tree-age { font-family: -apple-system, sans-serif; font-size: 9px; fill: #9ca3af; }
      .tree-edge-label { font-family: -apple-system, sans-serif; font-size: 8px; fill: #9ca3af; text-anchor: middle; pointer-events: none; }
    </style>`;

    const drawnPartners = new Set();
    for (const e of edges) {
      const from = positions.get(e.from), to = positions.get(e.to);
      if (!from || !to) continue;
      const isPartner = ['spouse', 'partner', 'boyfriend_girlfriend', 'cohabitant'].includes(e.type);
      const fx = from.x + nodeW / 2, tx = to.x + nodeW / 2;

      if (isPartner) {
        const key = [Math.min(e.from, e.to), Math.max(e.from, e.to)].join('-');
        if (!drawnPartners.has(key)) {
          drawnPartners.add(key);
          const y = Math.min(from.y, to.y) + nodeH / 2;
          const lx = Math.min(from.x, to.x) + nodeW, rx = Math.max(from.x, to.x);
          svg += `<line class="tree-partner-edge" data-from="${e.from}" data-to="${e.to}" x1="${lx}" y1="${y}" x2="${rx}" y2="${y}" />`;
          svg += `<text class="tree-edge-label" x="${(lx + rx) / 2}" y="${y - 5}">${relLabels[e.type] || e.type}</text>`;
        }
      } else {
        const startY = from.y < to.y ? from.y + nodeH : from.y;
        const endY = to.y < from.y ? to.y + nodeH : to.y;
        const midY = (startY + endY) / 2;
        svg += `<path class="tree-edge" data-from="${e.from}" data-to="${e.to}" d="M${fx},${startY} C${fx},${midY} ${tx},${midY} ${tx},${endY}" />`;
        svg += `<text class="tree-edge-label" x="${(fx + tx) / 2}" y="${midY - 4}">${relLabels[e.type] || e.type}</text>`;
      }
    }

    for (const [nid, pos] of positions) {
      const node = nodeMap.get(nid);
      if (!node) continue;
      let name = `${node.first_name} ${(node.last_name || '').charAt(0)}.`.trim();
      if (name.length > 12) name = name.substring(0, 11) + '…';
      const hasAvatar = !!node.avatar;
      const avatarSize = avatarR * 2, avatarX = 8, avatarY = (nodeH - avatarSize) / 2, textX = avatarX + avatarSize + 6;

      svg += `<g class="tree-node ${node.is_root ? 'root' : ''}" data-uuid="${node.uuid}" transform="translate(${pos.x},${pos.y})">`;
      svg += `<rect width="${nodeW}" height="${nodeH}" />`;
      if (hasAvatar) {
        svg += `<image href="${authUrl(node.avatar)}" x="${avatarX}" y="${avatarY}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#clip-circle)" preserveAspectRatio="xMidYMid slice" />`;
      } else {
        svg += `<circle cx="${avatarX + avatarR}" cy="${nodeH / 2}" r="${avatarR}" fill="#007AFF" />`;
        svg += `<text x="${avatarX + avatarR}" y="${nodeH / 2 + 4}" text-anchor="middle" fill="#fff" font-size="10" font-weight="600" font-family="-apple-system,sans-serif">${(node.first_name[0] || '') + (node.last_name?.[0] || '')}</text>`;
      }
      svg += `<text class="tree-name" x="${textX}" y="${nodeH / 2 - 2}" text-anchor="start">${escapeHtml(name)}</text>`;
      if (node.birth_year) {
        svg += `<text class="tree-age" x="${textX}" y="${nodeH / 2 + 12}" text-anchor="start">${new Date().getFullYear() - node.birth_year} ${t('contacts.years')}</text>`;
      }
      svg += `</g>`;
    }
    svg += '</svg>';

    // Update SVG content
    inner.innerHTML = svg;

    // Update controls
    const allCats = ['family', 'social', 'professional'];
    const modes = [
      { id: 'full', label: t('relationships.treeModeFull') },
      { id: 'lineage', label: t('relationships.treeModeLineage') },
      { id: 'ancestors', label: t('relationships.treeModeAncestors') },
      { id: 'descendants', label: t('relationships.treeModeDescendants') },
    ];

    controlsEl.innerHTML = `
      <select class="form-select form-select-sm" id="tree-mode" style="width:auto">
        ${modes.map(m => `<option value="${m.id}" ${treeMode === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}
      </select>
      <div class="d-flex align-items-center gap-1">
        ${allCats.map(c => `<button class="btn btn-sm ${treeCategories.includes(c) ? 'btn-primary' : 'btn-outline-secondary'} tree-cat-btn" data-cat="${c}">${t('relationships.categories.' + c)}</button>`).join('')}
      </div>
      <div class="d-flex align-items-center gap-2">
        <label class="form-label mb-0 small text-muted">${t('relationships.treeDepth')}</label>
        <input type="range" class="form-range" id="tree-depth" min="1" max="6" value="${treeDepth}" style="width:80px">
        <span class="small text-muted" id="tree-depth-val">${treeDepth}</span>
      </div>
    `;

    // Reset pan/zoom to fit
    // Store dimensions and fit to view
    _treeModal._svgW = svgW;
    _treeModal._svgH = svgH;
    if (_treeModal._visible) {
      // Modal already open (re-render from filter/depth change)
      _treeModal.resetView(svgW, svgH);
    } else {
      // First open — hide content until shown.bs.modal fires with correct dimensions
      inner.style.visibility = 'hidden';
    }

    // --- Controls: mode ---
    controlsEl.querySelector('#tree-mode').addEventListener('change', (e) => {
      renderTreeContent(contactUuid, treeDepth, treeCategories, e.target.value);
    });

    // --- Controls: depth ---
    let depthTimeout;
    controlsEl.querySelector('#tree-depth').addEventListener('input', (e) => {
      controlsEl.querySelector('#tree-depth-val').textContent = e.target.value;
      clearTimeout(depthTimeout);
      depthTimeout = setTimeout(() => renderTreeContent(contactUuid, parseInt(e.target.value), treeCategories, treeMode), 400);
    });

    // --- Controls: category filter ---
    controlsEl.querySelectorAll('.tree-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        let newCats = [...treeCategories];
        if (newCats.includes(cat)) { newCats = newCats.filter(c => c !== cat); if (!newCats.length) newCats = [cat]; }
        else newCats.push(cat);
        renderTreeContent(contactUuid, treeDepth, newCats, treeMode);
      });
    });

    // --- Node interactions ---
    const modalEl = _treeModal.el;
    const allNodes = inner.querySelectorAll('.tree-node');
    const allEdges = inner.querySelectorAll('.tree-edge, .tree-partner-edge');

    allNodes.forEach(node => {
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        _treeModal.bs.hide();
        navigate(`/contacts/${node.dataset.uuid}`);
      });

      const nodeId = [...positions.entries()].find(([id]) => nodeMap.get(id)?.uuid === node.dataset.uuid)?.[0];

      node.addEventListener('mouseenter', () => {
        allEdges.forEach(edge => {
          const f = parseInt(edge.dataset.from), tt = parseInt(edge.dataset.to);
          if (f === nodeId || tt === nodeId) edge.classList.add('highlight');
        });
        allNodes.forEach(n => {
          if (n !== node) {
            const otherId = [...positions.entries()].find(([id]) => nodeMap.get(id)?.uuid === n.dataset.uuid)?.[0];
            const connected = [...allEdges].some(e => { const f = parseInt(e.dataset.from), tt = parseInt(e.dataset.to); return (f === nodeId && tt === otherId) || (tt === nodeId && f === otherId); });
            if (!connected) n.classList.add('dim');
          }
        });
      });

      node.addEventListener('mouseleave', () => {
        allEdges.forEach(e => e.classList.remove('highlight'));
        allNodes.forEach(n => n.classList.remove('dim'));
      });
    });
  } catch (err) {
    inner.innerHTML = `<div class="text-center p-4 text-danger">${err.message}</div>`;
  }
}

function renderCompanyRow(c) {
  return `<div class="contact-row company-row" data-link-id="${c.link_id}">
    <a href="/companies/${c.company_uuid}" data-link class="d-flex align-items-center gap-2 flex-grow-1 text-decoration-none">
      <div class="contact-row-avatar" style="background:var(--color-text-secondary)">
        <i class="bi bi-building" style="font-size:0.7rem"></i>
      </div>
      <div class="contact-row-info">
        <div class="contact-row-name">${escapeHtml(c.company_name)}</div>
        <div class="contact-row-meta">${[c.title, c.end_date ? t('addresses.previous') : ''].filter(Boolean).join(' — ')}</div>
      </div>
    </a>
    <button class="btn btn-link btn-sm company-remove" title="${t('common.delete')}"><i class="bi bi-x"></i></button>
  </div>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatBirthParts(day, month, year) {
  const date = new Date(year || 2000, month - 1, day);
  const opts = year ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long' };
  let str = date.toLocaleDateString(undefined, opts);
  if (year) {
    const today = new Date();
    let age = today.getFullYear() - year;
    const m = today.getMonth() + 1 - month;
    if (m < 0 || (m === 0 && today.getDate() < day)) age--;
    str += ` (${age} ${t('contacts.years')})`;
  }
  return str;
}

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

async function initMiniMap(addr, contact) {
  await loadLeaflet();

  const el = document.getElementById('contact-mini-map');
  if (!el) return;

  const lat = parseFloat(addr.latitude);
  const lng = parseFloat(addr.longitude);

  const miniMap = L.map(el, {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
  }).setView([lat, lng], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(miniMap);
  L.marker([lat, lng]).addTo(miniMap);

  // Click to expand
  el.addEventListener('click', () => {
    showExpandedMap(lat, lng, addr, contact);
  });
}

function showExpandedMap(lat, lng, addr, contact) {
  const id = 'map-expanded-' + Date.now();
  const html = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content glass-card">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-geo-alt"></i>
              ${contact.first_name} ${contact.last_name || ''} — ${escapeHtml(addr.street)}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-0">
            <div id="${id}-map" style="height:450px;border-radius:0 0 var(--radius-lg) var(--radius-lg)"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  const modalEl = document.getElementById(id);
  const modal = new bootstrap.Modal(modalEl);

  modalEl.addEventListener('shown.bs.modal', () => {
    const bigMap = L.map(`${id}-map`).setView([lat, lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(bigMap);
    L.marker([lat, lng])
      .addTo(bigMap)
      .bindPopup(`<strong>${contact.first_name} ${contact.last_name || ''}</strong><br>${escapeHtml(addr.street)}<br>${[addr.postal_code, addr.city].filter(Boolean).join(' ')}`)
      .openPopup();
  });

  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
}

function showAddressPicker(addresses) {
  return new Promise(resolve => {
    const id = 'addr-pick-' + Date.now();
    const html = `
      <div class="modal fade" id="${id}" tabindex="-1">
        <div class="modal-dialog modal-sm modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">${t('addresses.chooseAddress')}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              ${addresses.map(a => `
                <button type="button" class="btn btn-outline-secondary btn-sm w-100 mb-1 text-start addr-pick-btn" data-address-id="${a.address_id}">
                  <strong>${a.label || 'Address'}</strong><br>
                  <span class="text-muted small">${a.street}, ${[a.postal_code, a.city].filter(Boolean).join(' ')}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const modalEl = document.getElementById(id);
    const modal = new bootstrap.Modal(modalEl);
    let resolved = false;

    modalEl.querySelectorAll('.addr-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        resolved = true;
        modal.hide();
        resolve(addresses.find(a => String(a.address_id) === btn.dataset.addressId));
      });
    });

    modalEl.addEventListener('hidden.bs.modal', () => {
      modalEl.remove();
      if (!resolved) resolve(null);
    }, { once: true });

    modal.show();
  });
}

async function showEditAddressDialog(contactUuid, addr, onDone) {
  const id = 'addr-edit-' + Date.now();
  const html = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('common.edit')} — ${escapeHtml(addr.label || 'Address')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="${id}-form">
            <div class="modal-body">
              <input type="text" class="form-control form-control-sm mb-2" id="${id}-street" placeholder="${t('addresses.street')}" value="${escapeAttr(addr.street || '')}" required>
              <input type="text" class="form-control form-control-sm mb-2" id="${id}-street2" placeholder="${t('addresses.street')} 2" value="${escapeAttr(addr.street2 || '')}">
              <div class="row g-1 mb-2">
                <div class="col-4"><input type="text" class="form-control form-control-sm" id="${id}-postal" placeholder="${t('addresses.postalCode')}" value="${escapeAttr(addr.postal_code || '')}"></div>
                <div class="col-8"><input type="text" class="form-control form-control-sm" id="${id}-city" placeholder="${t('addresses.city')}" value="${escapeAttr(addr.city || '')}"></div>
              </div>
              <input type="text" class="form-control form-control-sm mb-2" id="${id}-label" placeholder="${t('addresses.label')}" value="${escapeAttr(addr.label || '')}">
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="submit" class="btn btn-primary btn-sm">${t('common.save')}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  const modalEl = document.getElementById(id);
  const modal = new bootstrap.Modal(modalEl);

  document.getElementById(`${id}-form`).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.put(`/addresses/${addr.address_id}`, {
        street: document.getElementById(`${id}-street`).value,
        street2: document.getElementById(`${id}-street2`).value || null,
        postal_code: document.getElementById(`${id}-postal`).value || null,
        city: document.getElementById(`${id}-city`).value || null,
        label: document.getElementById(`${id}-label`).value || null,
        contact_uuid: contactUuid,
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

async function showEditRelationshipDialog(wrapper, onDone) {
  const relId = wrapper.dataset.relId;
  const currentTypeId = wrapper.dataset.relTypeId;
  const startDate = wrapper.dataset.start;
  const endDate = wrapper.dataset.end;
  const contactName = wrapper.querySelector('.contact-row-name')?.textContent || '';

  let types;
  try {
    types = (await api.get('/relationships/types')).types;
  } catch (err) {
    confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
    return;
  }

  const catLabels = { family: t('relationships.categories.family'), social: t('relationships.categories.social'), professional: t('relationships.categories.professional') };
  const typeOptions = ['family', 'social', 'professional'].map(cat => {
    const catTypes = types.filter(t => t.category === cat);
    if (!catTypes.length) return '';
    return `<optgroup label="${catLabels[cat]}">
      ${catTypes.map(tp => `<option value="${tp.id}" ${String(tp.id) === currentTypeId ? 'selected' : ''}>${t('relationships.types.' + tp.name) !== 'relationships.types.' + tp.name ? t('relationships.types.' + tp.name) : tp.name}</option>`).join('')}
    </optgroup>`;
  }).join('');

  const id = 'rel-edit-' + Date.now();
  const html = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('common.edit')} — ${escapeHtml(contactName)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label small">${t('relationships.type')}</label>
              <select class="form-select form-select-sm" id="${id}-type">
                ${typeOptions}
              </select>
            </div>
            <div class="row g-2 mb-3">
              <div class="col">
                <label class="form-label small">${t('relationships.since')} <span class="text-muted">(${t('relationships.optional')})</span></label>
                <input type="date" class="form-control form-control-sm" id="${id}-start" value="${startDate || ''}">
              </div>
              <div class="col">
                <label class="form-label small">${t('relationships.until')} <span class="text-muted">(${t('relationships.optional')})</span></label>
                <input type="date" class="form-control form-control-sm" id="${id}-end" value="${endDate || ''}">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
            <button type="button" class="btn btn-primary btn-sm" id="${id}-submit">${t('common.save')}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  const modalEl = document.getElementById(id);
  const modal = new bootstrap.Modal(modalEl);

  document.getElementById(`${id}-submit`).addEventListener('click', async () => {
    try {
      await api.put(`/relationships/${relId}`, {
        relationship_type_id: parseInt(document.getElementById(`${id}-type`).value),
        start_date: document.getElementById(`${id}-start`).value || null,
        end_date: document.getElementById(`${id}-end`).value || null,
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

async function showAddRelationshipDialog(contactUuid, existingRelationships, onDone) {
  let types;
  try {
    types = (await api.get('/relationships/types')).types;
  } catch (err) {
    confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
    return;
  }

  const catLabels = { family: t('relationships.categories.family'), social: t('relationships.categories.social'), professional: t('relationships.categories.professional') };
  const typeOptions = ['family', 'social', 'professional'].map(cat => {
    const catTypes = types.filter(tp => tp.category === cat);
    if (!catTypes.length) return '';
    const options = [];
    for (const tp of catTypes) {
      const label = t('relationships.types.' + tp.name) !== 'relationships.types.' + tp.name ? t('relationships.types.' + tp.name) : tp.name;
      options.push(`<option value="${tp.id}">${label}</option>`);
      // Add inverse as separate option if different (e.g. parent → child)
      if (tp.inverse_name !== tp.name) {
        const invLabel = t('relationships.types.' + tp.inverse_name) !== 'relationships.types.' + tp.inverse_name ? t('relationships.types.' + tp.inverse_name) : tp.inverse_name;
        options.push(`<option value="${tp.id}:inverse">${invLabel}</option>`);
      }
    }
    return `<optgroup label="${catLabels[cat]}">${options.join('')}</optgroup>`;
  }).join('');

  const id = 'rel-add-' + Date.now();
  const html = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${t('relationships.add')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div id="${id}-search-area">
              <input type="text" class="form-control mb-2" id="${id}-search" placeholder="${t('relationships.searchContact')}" autofocus>
              <div id="${id}-results" class="contact-search-results"></div>
              <button type="button" class="btn btn-outline-primary btn-sm mt-2 w-100" id="${id}-create-new">
                <i class="bi bi-person-plus me-1"></i>${t('relationships.createAndLink')}
              </button>
            </div>
            <div id="${id}-create-area" class="d-none">
              <p class="text-muted small mb-2">${t('relationships.createAndLinkDesc')}</p>
              <div class="row g-2 mb-2">
                <div class="col">
                  <div class="form-floating">
                    <input type="text" class="form-control" id="${id}-new-first" required>
                    <label>${t('auth.firstName')}</label>
                  </div>
                </div>
                <div class="col">
                  <div class="form-floating">
                    <input type="text" class="form-control" id="${id}-new-last">
                    <label>${t('auth.lastName')}</label>
                  </div>
                </div>
              </div>
              <div class="mb-2">
                <label class="form-label small">${t('relationships.type')}</label>
                <select class="form-select form-select-sm" id="${id}-new-type">
                  <option value="" disabled selected>${t('relationships.chooseType')}</option>
                  ${typeOptions}
                </select>
              </div>
              <button type="button" class="btn btn-link btn-sm p-0" id="${id}-back-to-search"><i class="bi bi-arrow-left me-1"></i>${t('relationships.backToSearch')}</button>
            </div>
            <div id="${id}-selected" class="d-none">
              <div class="d-flex align-items-center gap-2 mb-3">
                <span class="text-muted small">${t('relationships.contact')}</span>
                <strong id="${id}-selected-name"></strong>
                <button type="button" class="btn btn-link btn-sm p-0" id="${id}-clear" title="${t('relationships.change')}"><i class="bi bi-x-lg"></i></button>
              </div>
              <div class="mb-3">
                <label class="form-label small">${t('relationships.type')}</label>
                <select class="form-select form-select-sm" id="${id}-type">
                  <option value="" disabled selected>${t('relationships.chooseType')}</option>
                  ${typeOptions}
                </select>
              </div>
              <div class="row g-2 mb-3">
                <div class="col">
                  <label class="form-label small">${t('relationships.since')} <span class="text-muted">(${t('relationships.optional')})</span></label>
                  <input type="date" class="form-control form-control-sm" id="${id}-start">
                </div>
                <div class="col">
                  <label class="form-label small">${t('relationships.until')} <span class="text-muted">(${t('relationships.optional')})</span></label>
                  <input type="date" class="form-control form-control-sm" id="${id}-end">
                </div>
              </div>
            </div>
            <div id="${id}-other-parent" class="d-none mb-3">
              <label class="form-label small">${t('relationships.otherParent')} <span class="text-muted">(${t('relationships.optional')})</span></label>
              <select class="form-select form-select-sm" id="${id}-other-parent-select">
                <option value="">${t('relationships.noOtherParent')}</option>
                ${(existingRelationships || [])
                  .filter(r => ['spouse','partner','boyfriend_girlfriend','cohabitant','ex'].includes(r.relationship))
                  .map(r => `<option value="${r.uuid}">${r.first_name} ${r.last_name || ''}</option>`)
                  .join('')}
              </select>
            </div>
          </div>
          <div class="modal-footer d-none" id="${id}-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
            <button type="button" class="btn btn-primary btn-sm" id="${id}-submit">${t('relationships.add')}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  const modalEl = document.getElementById(id);
  const modal = new bootstrap.Modal(modalEl);
  const searchInput = document.getElementById(`${id}-search`);
  const resultsEl = document.getElementById(`${id}-results`);
  const selectedEl = document.getElementById(`${id}-selected`);

  let selectedContact = null;

  modalEl.addEventListener('shown.bs.modal', () => searchInput.focus());

  // Search
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = searchInput.value.trim();
    if (q.length < 1) { resultsEl.innerHTML = ''; return; }
    searchTimeout = setTimeout(() => loadResults(q), 200);
  });

  async function loadResults(q) {
    try {
      const data = await api.get(`/contacts?search=${encodeURIComponent(q)}&limit=8`);
      resultsEl.innerHTML = data.contacts.map((c, i) =>
        contactRowHtml(c, { tag: 'div', active: i === 0, meta: c.nickname ? `"${c.nickname}"` : '' })
      ).join('') || '<p class="text-muted small p-2">No contacts found</p>';

      resultsEl.querySelectorAll('.contact-row').forEach(item => {
        item.addEventListener('click', () => selectContact(item, data.contacts));
      });
    } catch { resultsEl.innerHTML = ''; }
  }

  function selectContact(item, contacts) {
    const c = contacts.find(c => c.uuid === item.dataset.uuid) || {
      uuid: item.dataset.uuid,
      first_name: item.dataset.first,
      last_name: item.dataset.last,
    };
    selectedContact = c;
    document.getElementById(`${id}-selected-name`).textContent = `${c.first_name} ${c.last_name || ''}`;
    selectedEl.classList.remove('d-none');
    document.getElementById(`${id}-footer`).classList.remove('d-none');
    document.getElementById(`${id}-search-area`).classList.add('d-none');
  }

  // Clear selection
  document.getElementById(`${id}-clear`).addEventListener('click', () => {
    selectedContact = null;
    selectedEl.classList.add('d-none');
    document.getElementById(`${id}-footer`).classList.add('d-none');
    document.getElementById(`${id}-search-area`).classList.remove('d-none');
    searchInput.value = '';
    resultsEl.innerHTML = '';
    searchInput.focus();
  });

  // Show "other parent" when child-type selected
  const childTypeValues = new Set();
  for (const tp of types) {
    if (['parent', 'stepparent', 'godparent'].includes(tp.name)) childTypeValues.add(`${tp.id}:inverse`);
  }

  function checkOtherParent(selectEl) {
    const otherParent = document.getElementById(`${id}-other-parent`);
    if (childTypeValues.has(selectEl.value)) {
      otherParent.classList.remove('d-none');
    } else {
      otherParent.classList.add('d-none');
    }
  }

  document.getElementById(`${id}-type`)?.addEventListener('change', (e) => checkOtherParent(e.target));
  document.getElementById(`${id}-new-type`)?.addEventListener('change', (e) => checkOtherParent(e.target));

  // Create new contact flow
  document.getElementById(`${id}-create-new`).addEventListener('click', () => {
    document.getElementById(`${id}-search-area`).classList.add('d-none');
    document.getElementById(`${id}-create-area`).classList.remove('d-none');
    document.getElementById(`${id}-footer`).classList.remove('d-none');
    document.getElementById(`${id}-new-first`).focus();
  });

  document.getElementById(`${id}-back-to-search`).addEventListener('click', () => {
    document.getElementById(`${id}-create-area`).classList.add('d-none');
    document.getElementById(`${id}-search-area`).classList.remove('d-none');
    document.getElementById(`${id}-footer`).classList.add('d-none');
    searchInput.focus();
  });

  // Submit
  document.getElementById(`${id}-submit`).addEventListener('click', async () => {
    // If in create-new mode
    const createArea = document.getElementById(`${id}-create-area`);
    if (!createArea.classList.contains('d-none')) {
      const firstName = document.getElementById(`${id}-new-first`).value.trim();
      if (!firstName) { document.getElementById(`${id}-new-first`).focus(); return; }
      const newTypeSelect = document.getElementById(`${id}-new-type`);
      if (!newTypeSelect.value) { newTypeSelect.focus(); return; }
      try {
        // Create contact
        const { contact } = await api.post('/contacts', {
          first_name: firstName,
          last_name: document.getElementById(`${id}-new-last`).value.trim() || undefined,
        });
        // Create relationship (handle inverse direction)
        const newIsInverse = newTypeSelect.value.includes(':inverse');
        const newTypeId = parseInt(newTypeSelect.value);
        await api.post('/relationships', {
          contact_uuid: newIsInverse ? contact.uuid : contactUuid,
          related_contact_uuid: newIsInverse ? contactUuid : contact.uuid,
          relationship_type_id: newTypeId,
        });
        // Also link to other parent if selected
        const otherParentUuid = document.getElementById(`${id}-other-parent-select`)?.value;
        if (otherParentUuid && childTypeValues.has(newTypeSelect.value)) {
          try {
            await api.post('/relationships', {
              contact_uuid: contact.uuid,
              related_contact_uuid: otherParentUuid,
              relationship_type_id: newTypeId,
            });
          } catch {} // Ignore if already exists
        }
        modal.hide();
        if (onDone) onDone();
      } catch (err) {
        confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
      }
      return;
    }

    if (!selectedContact) return;
    const typeSelect = document.getElementById(`${id}-type`);
    if (!typeSelect.value) { typeSelect.focus(); return; }
    const isInverse = typeSelect.value.includes(':inverse');
    const typeId = parseInt(typeSelect.value);
    const startDate = document.getElementById(`${id}-start`).value || undefined;
    const endDate = document.getElementById(`${id}-end`).value || undefined;
    try {
      const childUuid = isInverse ? contactUuid : selectedContact.uuid;
      await api.post('/relationships', {
        contact_uuid: isInverse ? selectedContact.uuid : contactUuid,
        related_contact_uuid: childUuid,
        relationship_type_id: typeId,
        start_date: startDate,
        end_date: endDate,
      });
      // Also link to other parent if selected
      const otherParentUuid = document.getElementById(`${id}-other-parent-select`)?.value;
      if (otherParentUuid && childTypeValues.has(typeSelect.value)) {
        try {
          await api.post('/relationships', {
            contact_uuid: childUuid,
            related_contact_uuid: otherParentUuid,
            relationship_type_id: typeId,
          });
        } catch {} // Ignore if already exists
      }
      modal.hide();
      if (onDone) onDone();
    } catch (err) {
      confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
    }
  });

  modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove(), { once: true });
  modal.show();
}

function linkify(html) {
  return html
    .replace(/\n/g, '<br>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}
