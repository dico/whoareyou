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
import { t, formatDate, formatDateLong } from '../utils/i18n.js';

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
                    ? `<img src="${contact.photos.find(p => p.is_primary)?.file_path || contact.photos[0].file_path}" alt="">`
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
                  ${contact.date_of_birth ? `<p class="detail-meta"><i class="bi bi-cake2"></i> ${formatDateLong(contact.date_of_birth)} (${calcAge(contact.date_of_birth)})</p>` : ''}
                  ${contact.visibility === 'private' ? `<span class="badge bg-secondary"><i class="bi bi-lock-fill"></i> ${t('visibility.private')}</span>` : ''}
                  ${contact.is_favorite ? `<span class="badge bg-warning text-dark"><i class="bi bi-star-fill"></i> ${t('contacts.favorites')}</span>` : ''}
                </div>
              </div>
              ${contact.photos.length > 1 ? `
                <div class="photo-strip">
                  ${contact.photos.map(p => `
                    <div class="photo-strip-item ${p.is_primary ? 'active' : ''}" data-photo-id="${p.id}">
                      <img src="${p.thumbnail_path}" alt="${p.caption || ''}">
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>

            <!-- New post compose -->
            <div class="detail-card glass-card post-compose-inline">
              <form id="quick-post-form">
                <textarea class="form-control" id="quick-post-body" placeholder="${t('posts.writeAbout', { name: contact.first_name })}" rows="2"></textarea>
                <div class="post-compose-bar">
                  <div class="visibility-pill" id="quick-post-visibility-btn" data-visibility="shared" title="${t('visibility.sharedHint')}">
                    <span class="visibility-pill-option active" data-val="shared"><i class="bi bi-people-fill"></i> ${t('visibility.shared')}</span>
                    <span class="visibility-pill-option" data-val="private"><i class="bi bi-lock-fill"></i> ${t('visibility.private')}</span>
                  </div>
                  <button type="submit" class="btn btn-primary btn-sm">${t('posts.post')}</button>
                </div>
              </form>
            </div>

            <!-- Timeline -->
            <div id="contact-posts" class="timeline">
              <div class="loading">${t('posts.loadingPosts')}</div>
            </div>
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
                <button type="button" class="btn btn-link btn-sm field-add-btn" id="btn-add-relationship" title="${t('relationships.add')}">
                  <i class="bi bi-plus-lg"></i>
                </button>
              </h4>
            ${contact.relationships.length ? `
              <div class="detail-relationships">
                ${renderGroupedRelationships(contact.relationships)}
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
                <div class="detail-address ${a.moved_out_at ? 'text-muted' : ''}">
                  <strong>${a.label || 'Address'}</strong>
                  ${a.moved_out_at ? `<span class="badge bg-secondary ms-1">${t('addresses.previous')}</span>` : ''}
                  <p class="mb-0">${escapeHtml(a.street)}${a.street2 ? ', ' + escapeHtml(a.street2) : ''}<br>
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

            <!-- Labels -->
            ${contact.labels.length ? `
            <div class="sidebar-card glass-card">
              <h4><i class="bi bi-tags"></i> ${t('labels.title')}</h4>
              <div class="detail-labels">
                ${contact.labels.map(l => `<span class="badge" style="background:${l.color}">${escapeHtml(l.name)}</span>`).join(' ')}
              </div>
            </div>
            ` : ''}
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

    // Add relationship
    document.getElementById('btn-add-relationship')?.addEventListener('click', () => {
      showAddRelationshipDialog(uuid, () => renderContactDetail(uuid));
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
        // Group by address
        const byAddr = new Map();
        for (const r of data.results) {
          const key = `${r.street}|${r.postal_code}|${r.city}`;
          if (!byAddr.has(key)) byAddr.set(key, { ...r, contacts: [] });
          byAddr.get(key).contacts.push(`${r.first_name} ${r.last_name || ''}`);
        }
        results.innerHTML = Array.from(byAddr.values()).map(a => `
          <button type="button" class="address-result" data-street="${escapeAttr(a.street)}" data-postal="${escapeAttr(a.postal_code || '')}" data-city="${escapeAttr(a.city || '')}">
            <strong>${escapeHtml(a.street)}</strong>
            <span class="text-muted small">${[a.postal_code, a.city].filter(Boolean).join(' ')} — ${a.contacts.join(', ')}</span>
          </button>
        `).join('');
        results.querySelectorAll('.address-result').forEach(btn => {
          btn.addEventListener('click', async () => {
            try {
              await api.post('/addresses', {
                contact_uuid: contactUuid,
                street: btn.dataset.street,
                postal_code: btn.dataset.postal || undefined,
                city: btn.dataset.city || undefined,
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

    // Load posts with edit/delete support
    const reloadPosts = () => renderPostList('contact-posts', uuid, reloadPosts);
    reloadPosts();

    // Quick post visibility pill toggle
    document.getElementById('quick-post-visibility-btn').addEventListener('click', (e) => {
      const pill = e.currentTarget;
      const clicked = e.target.closest('.visibility-pill-option');
      if (!clicked) return;
      pill.dataset.visibility = clicked.dataset.val;
      pill.querySelectorAll('.visibility-pill-option').forEach(o => o.classList.toggle('active', o.dataset.val === clicked.dataset.val));
    });

    // Quick post with @-mention support
    const quickPostExtra = [];
    attachMention(document.getElementById('quick-post-body'), (contact) => {
      if (contact.uuid !== uuid && !quickPostExtra.find((c) => c.uuid === contact.uuid)) {
        quickPostExtra.push(contact);
      }
    });

    document.getElementById('quick-post-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = document.getElementById('quick-post-body').value.trim();
      if (!body) return;

      const extraUuids = quickPostExtra.map((c) => c.uuid);
      await api.post('/posts', {
        body,
        about_contact_uuid: uuid,
        contact_uuids: extraUuids.length ? extraUuids : undefined,
        visibility: document.getElementById('quick-post-visibility-btn').dataset.visibility,
      });
      document.getElementById('quick-post-body').value = '';
      quickPostExtra.length = 0;
      reloadPosts();
    });

  } catch (err) {
    content.innerHTML = `<div class="page-container"><div class="alert alert-danger">${err.message}</div></div>`;
  }
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
        <div class="form-floating mb-3">
          <input type="date" class="form-control" id="edit-dob" value="${contact.date_of_birth ? contact.date_of_birth.slice(0, 10) : ''}">
          <label>${t('contacts.dateOfBirth')}</label>
        </div>
        <div class="form-floating mb-3">
          <textarea class="form-control" id="edit-how-met" style="height:80px">${escapeHtml(contact.how_we_met || '')}</textarea>
          <label>${t('contacts.howWeMet')}</label>
        </div>
        <div class="form-floating mb-3">
          <textarea class="form-control" id="edit-notes" style="height:100px">${escapeHtml(contact.notes || '')}</textarea>
          <label>${t('contacts.notes')}</label>
        </div>
        ${visibilityToggleHtml('edit', contact.visibility)}
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
    toggleVisibilityBtn(e.currentTarget);
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
        date_of_birth: document.getElementById('edit-dob').value || null,
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

function renderGroupedRelationships(relationships) {
  // Sort order for relationship types
  const typePriority = { spouse: 0, child: 1, parent: 2, sibling: 3, grandchild: 4, grandparent: 5 };
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
    html += items.map(r =>
      contactRowHtml(r, { meta: t(`relationships.types.${r.relationship}`) })
    ).join('');
  }
  return html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function calcAge(dateStr) {
  const birth = new Date(dateStr);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return `${age} years`;
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

async function showAddRelationshipDialog(contactUuid, onDone) {
  let types;
  try {
    types = (await api.get('/relationships/types')).types;
  } catch (err) {
    confirmDialog(err.message, { title: t('common.error'), confirmText: 'OK', confirmClass: 'btn-primary' });
    return;
  }

  const catLabels = { family: t('relationships.categories.family'), social: t('relationships.categories.social'), professional: t('relationships.categories.professional') };
  const typeOptions = ['family', 'social', 'professional'].map(cat => {
    const catTypes = types.filter(t => t.category === cat);
    if (!catTypes.length) return '';
    return `<optgroup label="${catLabels[cat]}">
      ${catTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
    </optgroup>`;
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

  // Submit
  document.getElementById(`${id}-submit`).addEventListener('click', async () => {
    if (!selectedContact) return;
    const typeSelect = document.getElementById(`${id}-type`);
    if (!typeSelect.value) { typeSelect.focus(); return; }
    const typeId = parseInt(typeSelect.value);
    const startDate = document.getElementById(`${id}-start`).value || undefined;
    const endDate = document.getElementById(`${id}-end`).value || undefined;
    try {
      await api.post('/relationships', {
        contact_uuid: contactUuid,
        related_contact_uuid: selectedContact.uuid,
        relationship_type_id: typeId,
        start_date: startDate,
        end_date: endDate,
      });
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
