import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t } from '../utils/i18n.js';
import { confirmDialog } from '../components/dialogs.js';
import { attachContactSearch } from '../components/contact-search.js';
import { authUrl } from '../utils/auth-url.js';

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function screenRowHtml(screen) {
  return `
    <div class="glass-card signage-screen-row" data-screen-uuid="${screen.uuid}" style="cursor:pointer">
      <div class="signage-screen-icon ${screen.is_active ? '' : 'is-inactive'}">
        <i class="bi bi-tv"></i>
      </div>
      <div class="signage-screen-info">
        <p class="signage-screen-title">${esc(screen.name)}</p>
        <p class="signage-screen-meta">
          ${t('signage.mode_' + screen.display_mode)} ·
          ${screen.contact_uuids.length} ${t('signage.contacts')} ·
          ${screen.days_back ? t('signage.daysBack', { n: screen.days_back }) : t('signage.allTime')}
          ${screen.last_accessed_at ? ` · ${t('signage.lastSeen')}: ${new Date(screen.last_accessed_at).toLocaleDateString()}` : ''}
        </p>
      </div>
      <div class="signage-screen-actions">
        <div class="dropdown">
          <button class="btn btn-link btn-sm" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="bi bi-three-dots"></i>
          </button>
          <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
            <li><button class="dropdown-item btn-edit-screen" data-uuid="${screen.uuid}"><i class="bi bi-pencil me-2"></i>${t('signage.editScreen')}</button></li>
            <li><button class="dropdown-item btn-toggle-active" data-uuid="${screen.uuid}" data-active="${screen.is_active ? '1' : '0'}">
              <i class="bi bi-${screen.is_active ? 'pause-circle' : 'play-circle'} me-2"></i>${screen.is_active ? t('signage.deactivate') : t('signage.activate')}
            </button></li>
            <li><button class="dropdown-item btn-open-screen" data-uuid="${screen.uuid}"><i class="bi bi-box-arrow-up-right me-2"></i>${t('signage.openScreen')}</button></li>
            <li><button class="dropdown-item btn-copy-url" data-uuid="${screen.uuid}"><i class="bi bi-link-45deg me-2"></i>${t('signage.copyUrl')}</button></li>
            <li><button class="dropdown-item btn-regen-token" data-uuid="${screen.uuid}"><i class="bi bi-arrow-clockwise me-2"></i>${t('signage.regenToken')}</button></li>
            <li><hr class="dropdown-divider"></li>
            <li><button class="dropdown-item text-danger btn-delete-screen" data-uuid="${screen.uuid}"><i class="bi bi-trash3 me-2"></i>${t('signage.deleteScreen')}</button></li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

function configFormHtml(screen = null) {
  const s = screen || {};
  const isEdit = !!screen;
  return `
    <div class="glass-card p-4 mb-3" id="signage-form-wrap">
      <h4 class="mb-3">${isEdit ? t('signage.editScreen') : t('signage.newScreen')}</h4>
      <form id="signage-form">
        <div class="mb-3">
          <label class="form-label">${t('signage.fieldName')}</label>
          <input type="text" class="form-control" id="sig-name" required maxlength="255"
            value="${esc(s.name || '')}">
        </div>

        <div class="mb-3">
          <label class="form-label">${t('signage.fieldContacts')}</label>
          <div id="sig-contact-chips" class="mb-2 d-flex flex-wrap gap-2 align-items-center"></div>
          <input type="text" class="form-control" id="sig-contact-search"
            placeholder="${t('signage.fieldContactPlaceholder')}">
        </div>

        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label class="form-label">${t('signage.fieldMode')}</label>
            <select class="form-select" id="sig-mode">
              <option value="slideshow" ${s.display_mode === 'slideshow' || !s.display_mode ? 'selected' : ''}>${t('signage.mode_slideshow')}</option>
              <option value="feed" ${s.display_mode === 'feed' ? 'selected' : ''}>${t('signage.mode_feed')}</option>
            </select>
          </div>
          <div class="col-sm-6">
            <label class="form-label">${t('signage.fieldDaysBack')}</label>
            <select class="form-select" id="sig-days-back">
              <option value="7" ${s.days_back === 7 ? 'selected' : ''}>${t('signage.days7')}</option>
              <option value="30" ${s.days_back === 30 ? 'selected' : ''}>${t('signage.days30')}</option>
              <option value="90" ${s.days_back === 90 ? 'selected' : ''}>${t('signage.days90')}</option>
              <option value="180" ${s.days_back === 180 ? 'selected' : ''}>${t('signage.days180')}</option>
              <option value="365" ${s.days_back === 365 ? 'selected' : ''}>${t('signage.days365')}</option>
              <option value="" ${!s.days_back ? 'selected' : ''}>${t('signage.allTime')}</option>
            </select>
          </div>
        </div>

        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label class="form-label">${t('signage.fieldSlideInterval')}</label>
            <select class="form-select" id="sig-interval">
              ${[5,10,15,20,30,60].map(v => `<option value="${v}" ${(s.slide_interval || 15) === v ? 'selected' : ''}>${v}s</option>`).join('')}
            </select>
          </div>
          <div class="col-sm-6">
            <label class="form-label">${t('signage.fieldVisibility')}</label>
            <select class="form-select" id="sig-visibility">
              <option value="shared" ${s.visibility_filter === 'shared' || !s.visibility_filter ? 'selected' : ''}>${t('signage.visibilityShared')}</option>
              <option value="shared_family" ${s.visibility_filter === 'shared_family' ? 'selected' : ''}>${t('signage.visibilityFamily')}</option>
            </select>
          </div>
        </div>

        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label class="form-label">${t('signage.fieldFeedLayout')}</label>
            <select class="form-select" id="sig-feed-layout">
              <option value="horizontal" ${s.feed_layout !== 'vertical' ? 'selected' : ''}>${t('signage.layoutHorizontal')}</option>
              <option value="vertical" ${s.feed_layout === 'vertical' ? 'selected' : ''}>${t('signage.layoutVertical')}</option>
            </select>
          </div>
          <div class="col-sm-6">
            <label class="form-label">${t('signage.fieldMaxPosts')}</label>
            <select class="form-select" id="sig-max-posts">
              ${[1,2,3,4,5,6].map(v => `<option value="${v}" ${(s.max_posts || 3) === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label class="form-label">${t('signage.fieldMultiImage')}</label>
            <select class="form-select" id="sig-multi-image">
              <option value="collage" ${s.multi_image !== 'first' && s.multi_image !== 'rotate' ? 'selected' : ''}>${t('signage.multiCollage')}</option>
              <option value="first" ${s.multi_image === 'first' ? 'selected' : ''}>${t('signage.multiFirst')}</option>
            </select>
          </div>
          <div class="col-sm-6">
            <label class="form-label">${t('signage.fieldImageFit')}</label>
            <select class="form-select" id="sig-image-fit">
              <option value="contain" ${s.image_fit !== 'cover' ? 'selected' : ''}>${t('signage.fitContain')}</option>
              <option value="cover" ${s.image_fit === 'cover' ? 'selected' : ''}>${t('signage.fitCover')}</option>
            </select>
          </div>
        </div>

        <label class="form-label">${t('signage.fieldOverlays')}</label>
        <div class="d-flex flex-wrap gap-3 mb-3">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="sig-show-contact-name" ${s.show_contact_name !== false ? 'checked' : ''}>
            <label class="form-check-label" for="sig-show-contact-name">${t('signage.showContactName')}</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="sig-show-body" ${s.show_body ? 'checked' : ''}>
            <label class="form-check-label" for="sig-show-body">${t('signage.showBody')}</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="sig-show-date" ${s.show_date !== false ? 'checked' : ''}>
            <label class="form-check-label" for="sig-show-date">${t('signage.showDate')}</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="sig-show-reactions" ${s.show_reactions ? 'checked' : ''}>
            <label class="form-check-label" for="sig-show-reactions">${t('signage.showReactions')}</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="sig-show-comments" ${s.show_comments ? 'checked' : ''}>
            <label class="form-check-label" for="sig-show-comments">${t('signage.showComments')}</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="sig-shuffle" ${s.shuffle ? 'checked' : ''}>
            <label class="form-check-label" for="sig-shuffle">${t('signage.shuffle')}</label>
          </div>
        </div>

        <div class="d-flex gap-2 justify-content-end">
          <button type="button" class="btn btn-outline-secondary btn-sm" id="sig-cancel">${t('common.cancel')}</button>
          <button type="submit" class="btn btn-primary btn-sm" id="sig-save">
            ${isEdit ? t('common.save') : t('signage.create')}
          </button>
        </div>
      </form>
    </div>
  `;
}

export async function renderSignage() {
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2><i class="bi bi-tv"></i> ${t('signage.settingsCardLabel')}</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-screen">
          <i class="bi bi-plus-lg me-1"></i>${t('signage.newScreen')}
        </button>
      </div>
      <div id="signage-form-slot"></div>
      <div id="signage-list"><div class="loading small">${t('app.loading')}</div></div>
    </div>
  `;

  document.getElementById('btn-back').onclick = () => navigate('/settings');

  let editingUuid = null;
  let screens = [];

  async function loadList() {
    const el = document.getElementById('signage-list');
    try {
      const res = await api.get('/signage');
      screens = res.screens || [];
      if (!screens.length) {
        el.innerHTML = `<p class="text-muted">${t('signage.noScreens')}</p>`;
        return;
      }
      el.innerHTML = screens.map(screenRowHtml).join('');

      // Click anywhere on the row → edit (except the dropdown)
      el.querySelectorAll('.signage-screen-row').forEach(row => {
        row.onclick = (e) => {
          if (e.target.closest('.dropdown')) return;
          openForm(screens.find(s => s.uuid === row.dataset.screenUuid));
        };
      });
      el.querySelectorAll('.btn-edit-screen').forEach(btn => {
        btn.onclick = () => openForm(screens.find(s => s.uuid === btn.dataset.uuid));
      });
      el.querySelectorAll('.btn-toggle-active').forEach(btn => {
        btn.onclick = async () => {
          const isActive = btn.dataset.active === '1';
          await api.patch(`/signage/${btn.dataset.uuid}`, { is_active: !isActive });
          loadList();
        };
      });
      // Ensure the screen has a token (legacy screens created before migration
      // 074 have token=null). Lazily generates one on first use.
      async function ensureToken(screen) {
        if (screen.token) return screen.token;
        const res = await api.post(`/signage/${screen.uuid}/regenerate-token`, {});
        screen.token = res.token;
        return res.token;
      }
      el.querySelectorAll('.btn-open-screen').forEach(btn => {
        btn.onclick = async () => {
          const screen = screens.find(s => s.uuid === btn.dataset.uuid);
          if (!screen) return;
          const token = await ensureToken(screen);
          window.open(`/signage/${token}`, '_blank');
        };
      });
      el.querySelectorAll('.btn-copy-url').forEach(btn => {
        btn.onclick = async () => {
          const screen = screens.find(s => s.uuid === btn.dataset.uuid);
          if (!screen) return;
          const token = await ensureToken(screen);
          const url = `${window.location.origin}/signage/${token}`;
          try {
            await navigator.clipboard.writeText(url);
            btn.innerHTML = `<i class="bi bi-check-lg me-2"></i>${t('signage.urlCopied')}`;
            setTimeout(() => { btn.innerHTML = `<i class="bi bi-link-45deg me-2"></i>${t('signage.copyUrl')}`; }, 2000);
          } catch {}
        };
      });
      el.querySelectorAll('.btn-regen-token').forEach(btn => {
        btn.onclick = async () => {
          if (!await confirmDialog(t('signage.regenTokenConfirm'), { title: t('signage.regenToken') })) return;
          try {
            await api.post(`/signage/${btn.dataset.uuid}/regenerate-token`, {});
            loadList();
          } catch (err) {
            confirmDialog(err.message || 'Failed', { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
          }
        };
      });
      el.querySelectorAll('.btn-delete-screen').forEach(btn => {
        btn.onclick = async () => {
          if (!await confirmDialog(t('signage.confirmDelete'), { title: t('signage.deleteScreen') })) return;
          await api.delete(`/signage/${btn.dataset.uuid}`);
          loadList();
        };
      });
    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    }
  }

  function openForm(screen = null) {
    editingUuid = screen?.uuid || null;
    const slot = document.getElementById('signage-form-slot');
    slot.innerHTML = configFormHtml(screen);
    document.getElementById('btn-new-screen').style.display = 'none';

    // Contact multi-select
    const selectedContacts = [];
    const searchInput = document.getElementById('sig-contact-search');
    const chipWrap = document.getElementById('sig-contact-chips');

    // If editing, resolve each UUID individually so we never miss contacts
    // that are beyond page 1 of a large contact list.
    if (screen?.contact_uuids?.length) {
      Promise.all(screen.contact_uuids.map(uuid =>
        api.get(`/contacts/${uuid}`).then(r => {
          const c = r.contact;
          // GET /contacts/:uuid returns photos[] but no top-level avatar.
          // Derive it so the chip renderer can show the profile photo.
          if (c && !c.avatar && c.photos?.length) {
            const primary = c.photos.find(p => p.is_primary) || c.photos[0];
            c.avatar = primary?.thumbnail_path || null;
          }
          return c;
        }).catch(() => null)
      )).then(results => {
        for (const c of results) {
          if (c) selectedContacts.push(c);
        }
        renderChips();
      });
    }

    function renderChips() {
      chipWrap.innerHTML = selectedContacts.map((c, i) => {
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.uuid;
        const initials = [c.first_name, c.last_name].filter(Boolean).map(s => s[0]).join('').toUpperCase();
        const avatarHtml = c.avatar
          ? `<img src="${authUrl(c.avatar)}" alt="">`
          : `<span>${esc(initials)}</span>`;
        return `
          <span class="contact-chip" data-idx="${i}">
            <span class="contact-chip-avatar">${avatarHtml}</span>
            ${esc(name)}
            <button type="button" class="contact-chip-remove" data-remove-idx="${i}">×</button>
          </span>
        `;
      }).join('');
      chipWrap.querySelectorAll('[data-remove-idx]').forEach(btn => {
        btn.onclick = () => {
          selectedContacts.splice(parseInt(btn.dataset.removeIdx), 1);
          renderChips();
        };
      });
    }

    attachContactSearch(searchInput, {
      onSelect: (c) => {
        if (selectedContacts.some(s => s.uuid === c.uuid)) return;
        selectedContacts.push(c);
        renderChips();
        searchInput.value = '';
      },
    });

    document.getElementById('sig-cancel').onclick = closeForm;

    document.getElementById('signage-form').onsubmit = async (e) => {
      e.preventDefault();
      if (!selectedContacts.length) return;

      const btn = document.getElementById('sig-save');
      btn.disabled = true;
      const origHtml = btn.innerHTML;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

      const payload = {
        name: document.getElementById('sig-name').value.trim(),
        contact_uuids: selectedContacts.map(c => c.uuid),
        display_mode: document.getElementById('sig-mode').value,
        days_back: parseInt(document.getElementById('sig-days-back').value) || null,
        slide_interval: parseInt(document.getElementById('sig-interval').value) || 15,
        visibility_filter: document.getElementById('sig-visibility').value,
        feed_layout: document.getElementById('sig-feed-layout').value,
        max_posts: parseInt(document.getElementById('sig-max-posts').value) || 3,
        multi_image: document.getElementById('sig-multi-image').value,
        image_fit: document.getElementById('sig-image-fit').value,
        show_contact_name: document.getElementById('sig-show-contact-name').checked,
        show_body: document.getElementById('sig-show-body').checked,
        show_date: document.getElementById('sig-show-date').checked,
        show_reactions: document.getElementById('sig-show-reactions').checked,
        show_comments: document.getElementById('sig-show-comments').checked,
        shuffle: document.getElementById('sig-shuffle').checked,
      };

      try {
        if (editingUuid) {
          await api.patch(`/signage/${editingUuid}`, payload);
        } else {
          const res = await api.post('/signage', payload);
          // Show the token URL in a dialog
          if (res.screen?.token) {
            const url = `${window.location.origin}/signage/${res.screen.token}`;
            await confirmDialog(`
              <div class="mb-2"><strong>${t('signage.urlReady')}</strong></div>
              <div class="mb-3 text-muted small">${t('signage.urlHint')}</div>
              <input type="text" class="form-control form-control-sm" value="${esc(url)}" readonly onclick="this.select()">
            `, {
              title: t('signage.newScreen'),
              confirmText: t('common.ok'),
              confirmClass: 'btn-primary',
              size: 'modal-lg',
            });
          }
        }
        closeForm();
        loadList();
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
        confirmDialog(err.message || t('signage.errSaveFailed'), { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
      }
    };

    slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeForm() {
    document.getElementById('signage-form-slot').innerHTML = '';
    document.getElementById('btn-new-screen').style.display = '';
    editingUuid = null;
  }

  document.getElementById('btn-new-screen').onclick = () => openForm();
  await loadList();
}
