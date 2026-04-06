// Book list + creation/edit wizard.
//
// Phase 1 MVP: shows existing books as a list, "+ new" opens an inline
// wizard form. Same form is reused for editing an existing book (PATCH).

import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t, getLocale, formatDateLong } from '../utils/i18n.js';
import { attachContactSearch } from '../components/contact-search.js';
import { confirmDialog } from '../components/dialogs.js';
import { authUrl } from '../utils/auth-url.js';

function showError(message) {
  return confirmDialog(message, {
    title: t('common.error'),
    confirmText: t('common.ok'),
    confirmClass: 'btn-primary',
  });
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Create-book wizard. Metadata editing of existing books goes through the
// showEditInfoModal modal in book-preview.js, not this form.
function wizardFormHtml() {
  return `
    <div class="glass-card p-4 mb-3" id="book-wizard">
      <h4 class="mb-3">${t('book.wizardTitle')}</h4>
      <p class="text-muted small">${t('book.wizardIntro')}</p>

      <form id="book-form">
        <div class="mb-3">
          <label class="form-label">${t('book.fieldTitle')}</label>
          <input type="text" class="form-control" id="book-title" required maxlength="255">
          <div class="form-text">${t('book.fieldTitleHint')}</div>
        </div>

        <div class="mb-3">
          <label class="form-label">${t('book.fieldSubtitle')}</label>
          <input type="text" class="form-control" id="book-subtitle" maxlength="255">
        </div>

        <div class="mb-3">
          <label class="form-label">${t('book.fieldContacts')}</label>
          <div id="book-contact-chip-wrap" class="mb-2 d-flex flex-wrap gap-2 align-items-center"></div>
          <input type="text" class="form-control" id="book-contact-search" placeholder="${t('book.fieldContactPlaceholder')}">
          <div class="form-text">${t('book.fieldContactsHint')}</div>
        </div>

        <div class="row g-2 mb-3">
          <div class="col-sm-6">
            <label class="form-label">${t('book.fieldDateFrom')}</label>
            <input type="date" class="form-control" id="book-date-from">
          </div>
          <div class="col-sm-6">
            <label class="form-label">${t('book.fieldDateTo')}</label>
            <input type="date" class="form-control" id="book-date-to">
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label">${t('book.fieldLanguage')}</label>
          <select class="form-select" id="book-language">
            <option value="nb">Norsk</option>
            <option value="en">English</option>
          </select>
        </div>

        <div class="mb-3">
          <label class="form-label">${t('book.fieldChapterGrouping')}</label>
          <select class="form-select" id="book-chapter-grouping">
            <option value="year">${t('book.chapterPerYear')}</option>
            <option value="contact">${t('book.chapterPerContact')}</option>
            <option value="none">${t('book.chapterNone')}</option>
          </select>
        </div>

        <div class="form-check mb-2">
          <input class="form-check-input" type="checkbox" id="book-include-comments" checked>
          <label class="form-check-label" for="book-include-comments">${t('book.includeComments')}</label>
        </div>
        <div class="form-check mb-4">
          <input class="form-check-input" type="checkbox" id="book-include-reactions" checked>
          <label class="form-check-label" for="book-include-reactions">${t('book.includeReactions')}</label>
        </div>

        <div class="d-flex gap-2 justify-content-end align-items-center">
          <span class="text-muted small me-auto" id="book-preview-count"></span>
          <button type="button" class="btn btn-outline-secondary btn-sm" id="btn-cancel">${t('common.cancel')}</button>
          <button type="submit" class="btn btn-primary btn-sm" id="btn-save">
            <i class="bi bi-eye me-1"></i>${t('book.createAndPreview')}
          </button>
        </div>
      </form>
    </div>
  `;
}

function bookListItemHtml(book) {
  const created = book.created_at ? formatDateLong(book.created_at) : '';
  return `
    <div class="glass-card book-list-item" data-book-uuid="${book.uuid}">
      <div class="book-list-icon"><i class="bi bi-book"></i></div>
      <a href="/books/${book.uuid}/preview" data-link class="book-list-info">
        <p class="book-list-title">${escapeHtml(book.title)}</p>
        <p class="book-list-meta">
          ${book.subtitle ? escapeHtml(book.subtitle) + ' · ' : ''}${escapeHtml(created)}
        </p>
      </a>
      <div class="book-list-actions">
        <a href="/books/${book.uuid}/preview" data-link class="btn btn-primary btn-sm">
          <i class="bi bi-eye me-1"></i>${t('book.open')}
        </a>
        <div class="dropdown">
          <button class="btn btn-link btn-sm" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="bi bi-three-dots"></i>
          </button>
          <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
            <li><button class="dropdown-item" data-book-action="edit" data-book-uuid="${escapeHtml(book.uuid)}"><i class="bi bi-pencil me-2"></i>${t('book.editInfo')}</button></li>
            <li><hr class="dropdown-divider"></li>
            <li><button class="dropdown-item text-danger" data-book-action="delete" data-book-uuid="${escapeHtml(book.uuid)}"><i class="bi bi-trash3 me-2"></i>${t('book.delete')}</button></li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

function renderList(books) {
  if (!books.length) {
    return `<p class="text-muted">${t('book.listEmpty')}</p>`;
  }
  return `<div class="book-list">${books.map(bookListItemHtml).join('')}</div>`;
}

async function loadAndRenderList() {
  const container = document.getElementById('book-list-container');
  if (!container) return;
  container.innerHTML = `<p class="text-muted">${t('common.loading')}</p>`;
  try {
    const res = await api.get('/books');
    const books = res.books || [];
    container.innerHTML = renderList(books);

    // Wire dropdown actions per row
    container.querySelectorAll('[data-book-action="edit"]').forEach((btn) => {
      btn.onclick = async () => {
        const uuid = btn.dataset.bookUuid;
        const book = books.find(b => b.uuid === uuid);
        if (!book) return;
        const { showEditInfoModal } = await import('./book-preview.js');
        showEditInfoModal(book, async (payload) => {
          try {
            await api.patch(`/books/${uuid}`, payload);
            await loadAndRenderList();
          } catch (err) { showError(err.message || t('book.errSaveFailed')); }
        });
      };
    });
    container.querySelectorAll('[data-book-action="delete"]').forEach((btn) => {
      btn.onclick = async () => {
        const ok = await confirmDialog(t('book.confirmDelete'), {
          title: t('book.delete'),
          confirmText: t('common.delete'),
        });
        if (!ok) return;
        try {
          await api.delete(`/books/${btn.dataset.bookUuid}`);
          await loadAndRenderList();
        } catch (err) { showError(err.message || t('book.errDeleteFailed')); }
      };
    });
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message || 'Failed to load')}</div>`;
  }
}

function attachWizardHandlers() {
  const titleInput = document.getElementById('book-title');
  const subtitleInput = document.getElementById('book-subtitle');
  const langSelect = document.getElementById('book-language');
  const chapterSelect = document.getElementById('book-chapter-grouping');
  const commentsCheck = document.getElementById('book-include-comments');
  const reactionsCheck = document.getElementById('book-include-reactions');

  langSelect.value = getLocale() || 'nb';

  // Multi-contact selection: keep an ordered list of selected contacts so
  // a single book can cover an entire family.
  const selectedContacts = [];
  const searchInput = document.getElementById('book-contact-search');
  const chipWrap = document.getElementById('book-contact-chip-wrap');

  const renderChips = () => {
    if (!selectedContacts.length) {
      chipWrap.innerHTML = '';
      return;
    }
    chipWrap.innerHTML = selectedContacts.map((c, i) => {
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
      const initials = [c.first_name, c.last_name]
        .filter(Boolean).map(s => s[0]).join('').toUpperCase();
      const avatarHtml = c.avatar
        ? `<img src="${authUrl(c.avatar)}" alt="">`
        : `<span>${escapeHtml(initials)}</span>`;
      return `
        <span class="contact-chip" data-chip-idx="${i}">
          <span class="contact-chip-avatar">${avatarHtml}</span>
          ${escapeHtml(name)}
          <button type="button" class="contact-chip-remove" data-remove-idx="${i}" aria-label="remove">×</button>
        </span>
      `;
    }).join(' ');
    chipWrap.querySelectorAll('[data-remove-idx]').forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.removeIdx, 10);
        selectedContacts.splice(idx, 1);
        renderChips();
        searchInput.focus();
      };
    });
  };

  attachContactSearch(searchInput, {
    onSelect: (c) => {
      // Skip duplicates
      if (selectedContacts.some(s => s.uuid === c.uuid)) return;
      selectedContacts.push(c);
      if (selectedContacts.length === 1 && !titleInput.value.trim()) {
        titleInput.value = [c.first_name, c.last_name].filter(Boolean).join(' ');
      }
      renderChips();
      searchInput.value = '';
      schedulePreview();
    },
  });

  // Live page-count estimate. Debounced so the user can change date inputs
  // without firing a request on every keystroke.
  const previewEl = document.getElementById('book-preview-count');
  let previewTimer = null;
  const schedulePreview = () => {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 350);
  };
  const refreshPreview = async () => {
    if (!selectedContacts.length) {
      previewEl.textContent = '';
      return;
    }
    previewEl.textContent = t('common.loading');
    try {
      const res = await api.post('/books/preview', {
        contact_uuids: selectedContacts.map(c => c.uuid),
        date_from: document.getElementById('book-date-from').value || null,
        date_to: document.getElementById('book-date-to').value || null,
        visibility_filter: 'shared_family',
      });
      previewEl.textContent = t('book.previewEstimate', {
        posts: res.postCount,
        pages: res.estimatedPages,
      });
    } catch {
      previewEl.textContent = '';
    }
  };
  document.getElementById('book-date-from').addEventListener('change', schedulePreview);
  document.getElementById('book-date-to').addEventListener('change', schedulePreview);

  document.getElementById('btn-cancel').onclick = hideWizard;

  document.getElementById('book-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!selectedContacts.length) {
      showError(t('book.errNoContact'));
      return;
    }
    const btn = document.getElementById('btn-save');
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    try {
      const payload = {
        title: titleInput.value.trim(),
        subtitle: subtitleInput.value.trim() || null,
        contact_uuids: selectedContacts.map(c => c.uuid),
        date_from: document.getElementById('book-date-from').value || null,
        date_to: document.getElementById('book-date-to').value || null,
        visibility_filter: 'shared_family',
        layout_options: {
          language: langSelect.value,
          chapterGrouping: chapterSelect.value,
          includeComments: commentsCheck.checked,
          includeReactions: reactionsCheck.checked,
        },
      };
      const res = await api.post('/books', payload);
      navigate(`/books/${res.book.uuid}/preview`);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      showError(err.message || t('book.errSaveFailed'));
    }
  };
}

function showWizard() {
  const slot = document.getElementById('book-wizard-slot');
  slot.innerHTML = wizardFormHtml();
  document.getElementById('btn-new-book').style.display = 'none';
  attachWizardHandlers();
  slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideWizard() {
  document.getElementById('book-wizard-slot').innerHTML = '';
  document.getElementById('btn-new-book').style.display = '';
}

export async function renderGenerateBook() {
  const content = document.getElementById('app-content');

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2><i class="bi bi-book"></i> ${t('book.settingsCardLabel')}</h2>
        <button class="btn btn-primary btn-sm" id="btn-new-book">
          <i class="bi bi-plus-lg me-1"></i>${t('book.newBook')}
        </button>
      </div>

      <div id="book-wizard-slot"></div>

      <h5 class="mb-3">${t('book.listTitle')}</h5>
      <div id="book-list-container"></div>
    </div>
  `;

  document.getElementById('btn-back').onclick = () => navigate('/settings');
  document.getElementById('btn-new-book').onclick = showWizard;

  await loadAndRenderList();
}

