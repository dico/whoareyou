import { api } from '../api/client.js';
import { state } from '../app.js';
import { t } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';
import { enableDropZone } from '../utils/drop-zone.js';
import { attachDatePicker } from '../utils/datepicker.js';
import { createMentionInput, extractMentionUuids } from './mention-input.js';
import { attachContactSearch } from './contact-search.js';
import { attachTagSourceSearch, fetchTagSourceMembers } from './tag-group-dialog.js';
import { visibilityPickerHtml, attachVisibilityPicker } from './visibility-picker.js';
import { confirmDialog } from './dialogs.js';

/**
 * Post composer — one modal used by every "new post" entry point
 * (timeline, contact profile, group page). Desktop: centered modal.
 * Mobile: fullscreen (modal-fullscreen-sm-down) with Publish in the header
 * so the on-screen keyboard can't hide it.
 *
 * Layout: author + context, then the two settings that change how the post
 * is shown (visibility + date) as chips, the text, attachments/tags, and an
 * icon-only toolbar (media, document, tag person, tag group, sensitive).
 *
 * Tagging happens in an inline panel — the composer is a modal, and
 * design rule 4 forbids search modals inside modals.
 *
 * Usage:
 *   openPostComposer({ about: contact, onPosted: reload });
 *   openPostComposer({ company: { uuid, name, memberCount }, files });
 *
 * @param {object} opts
 * @param {object} [opts.about]   - { uuid, first_name, last_name } profile post target
 * @param {object} [opts.company] - { uuid, name, memberCount } group post target
 * @param {Array}  [opts.tags]    - pre-tagged contacts { uuid, first_name, last_name, avatar }
 * @param {File[]} [opts.files]   - pre-attached files (e.g. dropped on a trigger)
 * @param {boolean} [opts.pickMedia] - open the media file picker right away (must be called from a user gesture)
 * @param {string} [opts.placeholder]
 * @param {(post: object) => void} [opts.onPosted]
 */
export function openPostComposer(opts = {}) {
  const { about = null, company = null, onPosted } = opts;
  const placeholder = opts.placeholder
    || (about ? t('posts.writeAbout', { name: about.first_name }) : t('posts.placeholder'));
  const user = state.user || {};
  const id = 'post-composer-' + Date.now();
  const targetName = about ? about.first_name : company?.name;

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade post-composer-modal" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-fullscreen-sm-down">
        <form class="modal-content glass-card post-composer" novalidate>
          <div class="modal-header">
            <h5 class="modal-title">${t('posts.newPost')}</h5>
            <div class="composer-header-actions">
              <button type="submit" class="btn btn-primary btn-sm d-sm-none">${t('posts.post')}</button>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${t('common.close')}"></button>
            </div>
          </div>
          <div class="modal-body">
            <div class="composer-author">
              <span class="composer-avatar">${avatarHtml(user)}</span>
              <div class="composer-author-info">
                <div class="composer-author-name">
                  ${escapeHtml(`${user.first_name || ''} ${user.last_name || ''}`.trim())}${targetName
                    ? ` <i class="bi bi-arrow-right-short"></i> ${escapeHtml(targetName)}` : ''}
                </div>
                <div class="composer-meta">
                  ${visibilityPickerHtml(`${id}-visibility`)}
                  <div class="composer-date" title="${t('posts.dateHint')}">
                    <i class="bi bi-calendar3"></i>
                    <input type="text" class="composer-date-input" placeholder="${t('posts.dateToday')}">
                    <button type="button" class="composer-date-clear d-none" title="${t('posts.dateClear')}"><i class="bi bi-x"></i></button>
                  </div>
                </div>
              </div>
            </div>

            <div class="mention-input form-control composer-body"></div>
            <div class="composer-link-preview d-none"></div>
            <div class="post-media-preview composer-media d-none"></div>
            <div class="post-tags composer-tags"></div>
            ${company?.memberCount ? `
              <button type="button" class="composer-suggest">
                <i class="bi bi-people"></i> ${t('posts.tagMembers', { count: company.memberCount })}
              </button>` : ''}

            <div class="composer-tag-panel d-none">
              <div class="composer-tag-panel-head">
                <span class="composer-tag-panel-title"></span>
                <button type="button" class="btn-close btn-sm composer-tag-panel-close" aria-label="${t('common.close')}"></button>
              </div>
              <div class="composer-tag-contact">
                <input type="text" class="form-control form-control-sm" placeholder="${t('common.search')}">
              </div>
              <div class="composer-tag-group d-none">
                <input type="text" class="form-control form-control-sm mb-2" placeholder="${t('posts.tagGroupSearch')}">
                <div class="contact-search-results"></div>
              </div>
            </div>

            <div class="alert alert-danger composer-error d-none mt-2 mb-0"></div>
          </div>
          <div class="modal-footer composer-toolbar">
            <div class="composer-tools">
              <label class="composer-tool" title="${t('posts.addMedia')}">
                <i class="bi bi-image"></i>
                <input type="file" class="composer-media-input" multiple accept="image/*,video/*" hidden>
              </label>
              <label class="composer-tool" title="${t('posts.addDocument')}">
                <i class="bi bi-paperclip"></i>
                <input type="file" class="composer-doc-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" hidden>
              </label>
              <button type="button" class="composer-tool" data-tag-mode="contact" title="${t('posts.tagContact')}"><i class="bi bi-person-plus"></i></button>
              <button type="button" class="composer-tool" data-tag-mode="group" title="${t('posts.tagGroup')}"><i class="bi bi-people"></i></button>
              <button type="button" class="composer-tool composer-sensitive" data-sensitive="0" title="${t('sensitive.markPostHint')}"><i class="bi bi-eye-slash"></i></button>
            </div>
            <button type="submit" class="btn btn-primary btn-sm d-none d-sm-inline-block">${t('posts.post')}</button>
          </div>
        </form>
      </div>
    </div>
  `);

  const modalEl = document.getElementById(id);
  const form = modalEl.querySelector('form');
  const $ = (sel) => modalEl.querySelector(sel);
  const modal = new bootstrap.Modal(modalEl);

  let media = [];
  let tags = (opts.tags || []).filter(c => c.uuid !== about?.uuid);
  let linkPreview = null;
  let posted = false;
  let discardConfirmed = false;

  // ── Text ──
  const bodyInput = createMentionInput({
    el: $('.composer-body'),
    placeholder,
    onTag: (c) => addTags([c]),
  });

  // ── Visibility + date ──
  const visibility = attachVisibilityPicker($(`#${id}-visibility`));

  const dateInput = $('.composer-date-input');
  const dateClear = $('.composer-date-clear');
  const datePicker = attachDatePicker(dateInput, {
    allowInput: false,   // read-only field → no on-screen keyboard on mobile
    static: true,        // calendar stays inside the modal (focus trap)
    altInputClass: 'composer-date-input',
    onChange: () => syncDate(),
  });
  function syncDate() {
    const set = !!dateInput.value;
    dateClear.classList.toggle('d-none', !set);
    $('.composer-date').classList.toggle('is-set', set);
  }
  // The whole chip opens the calendar, not just the text field
  $('.composer-date').addEventListener('click', async (e) => {
    if (e.target.closest('.flatpickr-calendar, .composer-date-clear')) return;
    (await datePicker)?.open();
  });
  dateClear.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    (await datePicker)?.clear();
    syncDate();
  });

  // ── Sensitive ──
  const sensitiveBtn = $('.composer-sensitive');
  sensitiveBtn.addEventListener('click', () => {
    const on = sensitiveBtn.dataset.sensitive !== '1';
    sensitiveBtn.dataset.sensitive = on ? '1' : '0';
    sensitiveBtn.classList.toggle('is-on', on);
  });

  // ── Media ──
  function acceptFiles(files, predicate) {
    const skipped = [];
    for (const file of files) {
      if (predicate && !predicate(file)) continue;
      if (!file.size) { skipped.push(file.name); continue; }
      media.push(file);
    }
    if (skipped.length) showError(skipped.map((n) => t('posts.emptyFileSkipped', { name: n })).join(' '));
    renderMedia();
  }

  const mediaInput = $('.composer-media-input');
  mediaInput.addEventListener('change', (e) => {
    acceptFiles(e.target.files, (f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    e.target.value = '';
  });
  $('.composer-doc-input').addEventListener('change', (e) => {
    acceptFiles(e.target.files);
    e.target.value = '';
  });
  enableDropZone(form, (files) => acceptFiles(files), { acceptDocuments: true });

  function renderMedia() {
    const el = $('.composer-media');
    el.querySelectorAll('img, video').forEach(m => URL.revokeObjectURL(m.src));
    el.classList.toggle('d-none', !media.length);
    el.innerHTML = media.map((f, i) => {
      const remove = `<button type="button" class="media-preview-remove" data-index="${i}"><i class="bi bi-x"></i></button>`;
      if (f.type.startsWith('image/')) {
        return `<div class="media-preview-item"><img src="${URL.createObjectURL(f)}" alt="">${remove}</div>`;
      }
      if (f.type.startsWith('video/')) {
        return `<div class="media-preview-item"><video src="${URL.createObjectURL(f)}" muted class="media-preview-video"></video><div class="media-preview-video-badge"><i class="bi bi-play-fill"></i></div>${remove}</div>`;
      }
      return `<div class="media-preview-item media-preview-doc"><i class="${docIcon(f.type)}"></i><span class="media-preview-doc-name">${escapeHtml(f.name)}</span>${remove}</div>`;
    }).join('');
    el.querySelectorAll('.media-preview-remove').forEach(btn => {
      btn.addEventListener('click', () => { media.splice(Number(btn.dataset.index), 1); renderMedia(); });
    });
  }

  // ── Tags ──
  function addTags(contacts) {
    for (const c of contacts) {
      if (c.uuid === about?.uuid || tags.some(x => x.uuid === c.uuid)) continue;
      tags.push({ uuid: c.uuid, first_name: c.first_name, last_name: c.last_name, avatar: c.avatar || null });
    }
    renderTags();
  }

  function renderTags() {
    const el = $('.composer-tags');
    el.innerHTML = tags.map((c) => `
      <span class="contact-chip" data-uuid="${c.uuid}">
        <span class="contact-chip-avatar">${avatarHtml(c)}</span>
        ${escapeHtml(`${c.first_name || ''} ${c.last_name || ''}`.trim())}
        <button type="button" class="contact-chip-remove" data-uuid="${c.uuid}"><i class="bi bi-x"></i></button>
      </span>`).join('');
    el.querySelectorAll('.contact-chip-remove').forEach((btn) => {
      btn.addEventListener('click', () => { tags = tags.filter((c) => c.uuid !== btn.dataset.uuid); renderTags(); });
    });
  }

  $('.composer-suggest')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      addTags(await fetchTagSourceMembers({ groupUuid: company.uuid }));
      btn.remove();
    } catch {
      btn.disabled = false;
    }
  });

  // Inline tag panel (person or group/label)
  const panel = $('.composer-tag-panel');
  const contactInput = $('.composer-tag-contact input');
  const groupInput = $('.composer-tag-group input');
  const contactSearch = attachContactSearch(contactInput, {
    limit: 8,
    floating: false,
    onSelect: (c) => { addTags([c]); contactSearch.clear(); contactInput.focus(); },
  });
  const groupSearch = attachTagSourceSearch(groupInput, $('.composer-tag-group .contact-search-results'), {
    onSelect: ({ contacts }) => { addTags(contacts); closePanel(); },
    onEscape: () => closePanel(),
  });
  // Escape in the person search clears it, then closes the panel — never the modal
  contactInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    if (contactInput.value) contactSearch.clear();
    else closePanel();
  });

  function openPanel(mode) {
    const isGroup = mode === 'group';
    if (!panel.classList.contains('d-none') && panel.dataset.mode === mode) { closePanel(); return; }
    panel.dataset.mode = mode;
    panel.classList.remove('d-none');
    $('.composer-tag-panel-title').textContent = isGroup ? t('posts.tagGroup') : t('posts.tagContact');
    $('.composer-tag-contact').classList.toggle('d-none', isGroup);
    $('.composer-tag-group').classList.toggle('d-none', !isGroup);
    modalEl.querySelectorAll('[data-tag-mode]').forEach(b => b.classList.toggle('is-active', b.dataset.tagMode === mode));
    if (isGroup) { groupInput.value = ''; groupSearch.load(''); groupInput.focus(); }
    else { contactSearch.clear(); contactInput.focus(); }
  }
  function closePanel() {
    panel.classList.add('d-none');
    modalEl.querySelectorAll('[data-tag-mode]').forEach(b => b.classList.remove('is-active'));
  }
  modalEl.querySelectorAll('[data-tag-mode]').forEach(btn => {
    btn.addEventListener('click', () => openPanel(btn.dataset.tagMode));
  });
  $('.composer-tag-panel-close').addEventListener('click', closePanel);

  // ── Link preview (debounced on input, immediate on paste) ──
  const urlRegex = /https?:\/\/[^\s<]+/g;
  let linkFetchedUrl = null;
  let linkDismissed = false;
  let linkTimeout = null;

  function renderLinkPreview() {
    const el = $('.composer-link-preview');
    if (!linkPreview || linkDismissed) { el.classList.add('d-none'); el.innerHTML = ''; return; }
    const lp = linkPreview;
    const domain = lp.site_name || (() => { try { return new URL(lp.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    el.innerHTML = `
      <div class="link-preview-compose">
        <button type="button" class="link-preview-dismiss" title="${t('common.cancel')}"><i class="bi bi-x-lg"></i></button>
        <a href="${escapeHtml(lp.url)}" target="_blank" rel="noopener noreferrer" class="link-preview-card">
          ${lp.image_url ? `<div class="link-preview-image"><img src="${escapeHtml(lp.image_url)}" alt="" loading="lazy"></div>` : ''}
          <div class="link-preview-body">
            ${domain ? `<span class="link-preview-site">${escapeHtml(domain)}</span>` : ''}
            <span class="link-preview-title">${escapeHtml(lp.title || lp.url)}</span>
            ${lp.description ? `<span class="link-preview-desc">${escapeHtml(lp.description)}</span>` : ''}
          </div>
        </a>
      </div>`;
    el.classList.remove('d-none');
    el.querySelector('.link-preview-dismiss').addEventListener('click', () => {
      linkDismissed = true;
      linkPreview = null;
      renderLinkPreview();
    });
  }

  const bodyEl = $('.composer-body');
  bodyEl.addEventListener('input', () => {
    clearTimeout(linkTimeout);
    if (linkDismissed) return;
    linkTimeout = setTimeout(async () => {
      const firstUrl = bodyInput.getValue().match(urlRegex)?.[0];
      if (!firstUrl || firstUrl === linkFetchedUrl) return;
      linkFetchedUrl = firstUrl;
      try {
        const data = await api.get(`/posts/link-preview?url=${encodeURIComponent(firstUrl)}`);
        if (data.title) { linkPreview = data; renderLinkPreview(); }
      } catch {}
    }, 600);
  });
  bodyEl.addEventListener('paste', () => {
    if (!linkDismissed) setTimeout(() => bodyEl.dispatchEvent(new Event('input')), 100);
  });

  // Ctrl/Cmd+Enter publishes
  bodyEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
  });
  // Escape while the @-mention list is open closes the list, not the modal.
  // Capture phase so it runs before mention-input removes the list.
  bodyEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.querySelector('.mention-dropdown')) e.stopPropagation();
  }, true);
  // Enter in a text field (tag search, date) must not submit the form
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault();
  });

  // ── Submit ──
  function showError(message) {
    const el = $('.composer-error');
    el.textContent = message;
    el.classList.remove('d-none');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = bodyInput.getValue();
    if (!body.trim() && !media.length) { bodyInput.focus(); return; }

    const submitBtns = [...form.querySelectorAll('[type="submit"]')];
    const labels = submitBtns.map(b => b.innerHTML);
    submitBtns.forEach(b => { b.disabled = true; b.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; });
    $('.composer-error').classList.add('d-none');

    const chosenDate = dateInput.value || null;
    const contactUuids = [...new Set([...extractMentionUuids(body), ...tags.map(c => c.uuid)])]
      .filter(u => u !== about?.uuid);
    let postUuid = null;

    try {
      const { post } = await api.post('/posts', {
        body,
        about_contact_uuid: about?.uuid,
        company_uuid: company?.uuid,
        contact_uuids: contactUuids.length ? contactUuids : undefined,
        ...visibility.value(),
        is_sensitive: sensitiveBtn.dataset.sensitive === '1',
        has_media: media.length > 0,
        link_preview: linkPreview || undefined,
        post_date: chosenDate || undefined,
      });
      postUuid = post?.uuid || null;

      if (media.length && postUuid) {
        try {
          const formData = new FormData();
          for (const file of media) formData.append('media', file);
          const result = await api.upload(`/posts/${postUuid}/media`, formData);
          // EXIF date only when the user didn't pick one themselves
          if (result?.suggestedDate && !chosenDate) {
            await api.put(`/posts/${postUuid}`, { post_date: result.suggestedDate });
          }
        } catch (uploadErr) {
          // Roll back the post if it would otherwise be left empty
          if (!body.trim()) await api.delete(`/posts/${postUuid}`).catch(() => {});
          throw new Error(t('posts.mediaUploadFailed', { message: uploadErr.message }));
        }
      }

      posted = true;
      modal.hide();
      onPosted?.(post);
    } catch (err) {
      showError(err.message);
      submitBtns.forEach((b, i) => { b.disabled = false; b.innerHTML = labels[i]; });
    }
  });

  // ── Close: confirm before throwing away work ──
  function isDirty() {
    return !!bodyInput.getValue().trim() || media.length > 0;
  }
  modalEl.addEventListener('hide.bs.modal', (e) => {
    if (posted || discardConfirmed || !isDirty()) return;
    e.preventDefault();
    confirmDialog(t('posts.discardConfirm'), {
      title: t('posts.discardTitle'),
      confirmText: t('posts.discard'),
    }).then((ok) => {
      if (!ok) return;
      discardConfirmed = true;
      modal.hide();
    });
  });

  modalEl.addEventListener('shown.bs.modal', () => {
    if (!opts.pickMedia) bodyInput.focus();
  });
  modalEl.addEventListener('hidden.bs.modal', async () => {
    bodyInput.destroy();
    contactSearch.destroy();
    (await datePicker)?.destroy();
    modalEl.querySelectorAll('img, video').forEach(m => m.src.startsWith('blob:') && URL.revokeObjectURL(m.src));
    modalEl.remove();
  }, { once: true });

  renderTags();
  if (opts.files?.length) acceptFiles(opts.files);
  modal.show();
  // Must run inside the caller's click handler for the browser to allow it
  if (opts.pickMedia) mediaInput.click();
}

/**
 * Compact "What happened?" card that opens the composer — used where a
 * page shows the composer entry inline (contact profile, group page).
 * Pair with attachComposerTrigger().
 */
export function composerTriggerHtml({ id, placeholder = t('posts.placeholder'), extraClass = '' }) {
  return `
    <div class="glass-card composer-trigger ${extraClass}" id="${id}">
      <span class="composer-avatar">${avatarHtml(state.user || {})}</span>
      <button type="button" class="composer-trigger-input">${escapeHtml(placeholder)}</button>
      <button type="button" class="composer-tool composer-trigger-media" title="${t('posts.addMedia')}"><i class="bi bi-image"></i></button>
    </div>`;
}

/**
 * Wire a trigger card: click opens the composer, the image button opens it
 * with the file picker, and files dropped/pasted on the card are attached.
 * @param {HTMLElement} el
 * @param {(extra?: { files?: File[], pickMedia?: boolean }) => void} open
 */
export function attachComposerTrigger(el, open) {
  el.querySelector('.composer-trigger-input').addEventListener('click', () => open());
  el.querySelector('.composer-trigger-media').addEventListener('click', () => open({ pickMedia: true }));
  enableDropZone(el, (files) => open({ files }), { acceptDocuments: true });
}

function avatarHtml(c) {
  if (c.avatar) return `<img src="${authUrl(c.avatar)}" alt="">`;
  return `<span>${escapeHtml((c.first_name?.[0] || '') + (c.last_name?.[0] || ''))}</span>`;
}

function docIcon(type) {
  if (type.includes('pdf')) return 'bi bi-file-earmark-pdf';
  if (type.includes('word') || type.includes('document')) return 'bi bi-file-earmark-word';
  if (type.includes('excel') || type.includes('sheet') || type.includes('csv')) return 'bi bi-file-earmark-spreadsheet';
  if (type === 'text/plain') return 'bi bi-file-earmark-text';
  return 'bi bi-file-earmark';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
