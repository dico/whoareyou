// Book preview — flippable HTML book reader with browser-PDF export.
//
// Supports:
//  - Single-page and two-page spread view
//  - Grid (thumbnail) view of all pages
//  - Curate mode: click images to set focal point, exclude individual pages
//  - URL hash for current page (refresh preserves position)
//
// Overrides are stored in book.layout_options.overrides:
//   { excludedPosts: [postUuid, ...],
//     mediaFocal: { "<file_path>": "x% y%" } }
// Changes are debounce-saved via PATCH /api/books/:uuid.

import { api } from '../api/client.js';
import { navigate } from '../app.js';
import { t, formatDateLong } from '../utils/i18n.js';
import { authUrl } from '../utils/auth-url.js';
import { confirmDialog } from '../components/dialogs.js';

// Display an error via the shared confirmDialog (no native alert()).
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

function postYear(post) {
  if (!post.post_date) return null;
  return new Date(post.post_date).getUTCFullYear();
}

// ── Weight-based packing ──────────────────────────────────
//
// Each post has a "weight" that determines how much space it gets:
//   - big:    full page, hero or full-bleed
//   - normal: full page, grid/hero/text based on content
//   - small:  packed together with other small posts into shared pages
//   - hidden: excluded from the book, still visible in editor for recovery
//
// Default weight comes from a score that prioritizes engagement and content
// richness. Users can override per post in the editor.

const BATCH_PAGE_CAPACITY = 4; // small posts per batch page

function scorePost(post) {
  const likes = (post.reactions || []).length;
  const comments = (post.comments || []).length;
  const mediaCount = (post.media || []).filter(m => (m.file_type || '').startsWith('image/')).length;
  const bodyLen = (post.body || '').length;
  return likes * 3 + comments * 4 + bodyLen / 20 + mediaCount * 2;
}

function autoWeightForPost(post) {
  const score = scorePost(post);
  if (score >= 20) return 'big';
  if (score >= 8) return 'normal';
  return 'small';
}

function effectiveWeight(post, overrides) {
  const override = safeWeight(overrides.postWeight?.[post.uuid]);
  if (override) return override;
  // Legacy: excludedPosts behaves like 'hidden'
  if ((overrides.excludedPosts || []).includes(post.uuid)) return 'hidden';
  return autoWeightForPost(post);
}

// Build pages using weight-based packing. Posts remain in chronological
// order; small posts are collapsed into shared pages only when adjacent
// (i.e. no big/normal post interrupts the run).
function buildPages(bookData, overrides) {
  const { book, posts } = bookData;
  const layout = book.layout_options || {};

  const pages = [];
  pages.push({ type: 'cover', book });

  const flushBatch = (batch) => {
    while (batch.length) {
      const slice = batch.splice(0, BATCH_PAGE_CAPACITY);
      pages.push({ type: 'batch', posts: slice });
    }
  };

  const withYearDivider = layout.chapterGrouping === 'year';
  let currentYear = null;
  let batch = [];

  for (const post of posts) {
    const weight = effectiveWeight(post, overrides);
    if (weight === 'hidden') continue;

    // Year chapter divider — flush any pending small batch first so the
    // divider visually separates years.
    if (withYearDivider) {
      const year = postYear(post);
      if (year !== currentYear) {
        flushBatch(batch);
        currentYear = year;
        pages.push({ type: 'chapter', year });
      }
    }

    if (weight === 'small') {
      batch.push(post);
      if (batch.length === BATCH_PAGE_CAPACITY) flushBatch(batch);
    } else {
      // big or normal interrupts a batch run
      flushBatch(batch);
      pages.push({ type: 'post', post, weight });
    }
  }
  flushBatch(batch);

  pages.push({ type: 'back', book });
  return pages;
}

function renderCoverPage(book) {
  const from = book.date_from ? new Date(book.date_from).getUTCFullYear() : null;
  const to = book.date_to ? new Date(book.date_to).getUTCFullYear() : null;
  const dateRange = from && to ? (from === to ? `${from}` : `${from} – ${to}`) : (from || to || '');
  return `
    <div class="book-page book-page-cover">
      <div class="book-cover-inner">
        <h1 class="book-cover-title">${escapeHtml(book.title)}</h1>
        ${book.subtitle ? `<p class="book-cover-subtitle">${escapeHtml(book.subtitle)}</p>` : ''}
        ${dateRange ? `<p class="book-cover-dates">${escapeHtml(dateRange)}</p>` : ''}
      </div>
    </div>
  `;
}

function renderChapterPage(year) {
  return `
    <div class="book-page book-page-chapter">
      <div class="book-chapter-inner">
        <h2 class="book-chapter-year">${year}</h2>
      </div>
    </div>
  `;
}

function renderBackPage() {
  return `
    <div class="book-page book-page-back">
      <div class="book-back-inner">
        <p class="book-back-text">${t('book.backPageText')}</p>
      </div>
    </div>
  `;
}

// ── Templates ─────────────────────────────────────────────
//
// Each template receives a normalized `ctx` object and returns HTML for
// the page body inside `.book-page-post`. Adding a new template is just
// adding an entry to TEMPLATES and an auto-select rule.

const TEMPLATES = ['hero-top', 'full-bleed', 'grid-2', 'grid-3', 'grid-4', 'text-heavy'];
const VALID_WEIGHTS = ['big', 'normal', 'small', 'hidden'];
// Focal point format: "<num>% <num>%" — strict to prevent CSS injection via
// user-saved layout_options.overrides.mediaFocal[...] values.
const FOCAL_RE = /^\d+(\.\d+)?%\s\d+(\.\d+)?%$/;

function safeFocal(value) {
  return typeof value === 'string' && FOCAL_RE.test(value) ? value : null;
}
function safeTemplate(value) {
  return TEMPLATES.includes(value) ? value : null;
}
function safeWeight(value) {
  return VALID_WEIGHTS.includes(value) ? value : null;
}

function autoSelectTemplate(ctx, weight) {
  const { images, bodyLen } = ctx;
  // Big posts always get an impact layout.
  if (weight === 'big') {
    if (images.length === 0) return 'text-heavy';
    if (images.length === 1) return 'full-bleed';
    if (images.length === 2) return 'grid-2';
    if (images.length === 3) return 'grid-3';
    return 'grid-4';
  }
  // Normal and fallback auto logic.
  if (bodyLen > 600 && images.length <= 1) return 'text-heavy';
  if (images.length === 0) return 'text-heavy';
  if (images.length === 1) {
    if (bodyLen < 40) return 'full-bleed';
    return 'hero-top';
  }
  if (images.length === 2) return 'grid-2';
  if (images.length === 3) return 'grid-3';
  return 'grid-4';
}

function imageTag(media, overrides, extraClass = '') {
  const focal = safeFocal(overrides.mediaFocal?.[media.file_path]);
  const style = focal ? ` style="object-position:${focal}"` : '';
  return `<img src="${authUrl(media.file_path)}" alt="" loading="lazy"
    data-media-path="${escapeHtml(media.file_path)}"
    class="${extraClass}"${style}>`;
}

function imageBox(media, overrides, extraClass = '') {
  if (!media) return `<div class="book-img book-img-empty ${extraClass}"></div>`;
  const focal = safeFocal(overrides.mediaFocal?.[media.file_path]);
  const style = focal ? ` style="object-position:${focal}"` : '';
  return `
    <div class="book-img ${extraClass}" data-media-path="${escapeHtml(media.file_path)}">
      <img src="${authUrl(media.file_path)}" alt="" loading="lazy"${style}>
      <button type="button" class="book-img-remove no-print" data-exclude-media="${escapeHtml(media.file_path)}" title="${escapeHtml(t('book.excludeImage'))}">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>
  `;
}

function renderMeta(ctx) {
  return `
    <div class="book-post-meta">
      ${ctx.dateStr ? `<span class="book-post-date">${escapeHtml(ctx.dateStr)}</span>` : ''}
      ${ctx.authorName ? `<span class="book-post-author">${escapeHtml(ctx.authorName)}</span>` : ''}
    </div>
  `;
}

function renderCommentsAndReactions(ctx) {
  const commentsHtml = ctx.comments.length
    ? `<div class="book-post-comments">
         ${ctx.comments.slice(0, 6).map(c => `
           <div class="book-post-comment">
             ${c.author_name ? `<strong>${escapeHtml(c.author_name)}:</strong> ` : ''}
             ${escapeHtml(c.body)}
           </div>
         `).join('')}
       </div>`
    : '';
  const reactionsHtml = ctx.reactionCount ? `<div class="book-post-reactions">❤ ${ctx.reactionCount}</div>` : '';
  return commentsHtml + reactionsHtml;
}

function renderTplHeroTop(ctx) {
  return `
    <div class="book-tpl book-tpl-hero-top">
      ${imageBox(ctx.images[0], ctx.overrides, 'book-tpl-hero')}
      <div class="book-post-body">
        ${renderMeta(ctx)}
        ${ctx.body ? `<div class="book-post-text">${escapeHtml(ctx.body)}</div>` : ''}
        ${renderCommentsAndReactions(ctx)}
      </div>
    </div>
  `;
}

function renderTplFullBleed(ctx) {
  return `
    <div class="book-tpl book-tpl-full-bleed">
      ${imageBox(ctx.images[0], ctx.overrides, 'book-tpl-bleed')}
      <div class="book-tpl-caption">
        ${renderMeta(ctx)}
        ${ctx.body ? `<div class="book-post-text">${escapeHtml(ctx.body)}</div>` : ''}
      </div>
    </div>
  `;
}

function renderTplGrid(ctx, requestedCols) {
  // Grid templates adapt to the actual image count: if the user picks
  // grid-4 but the post only has 1 image, we render a single full image
  // instead of three empty cells. The post's template override is still
  // preserved so adding more images later would populate more cells.
  const available = ctx.images.length;
  if (available === 0) return renderTplTextHeavy(ctx);
  if (available === 1) return renderTplFullBleed(ctx);
  const effective = Math.min(requestedCols, available);
  const images = ctx.images.slice(0, effective);
  const cells = images.map(img => imageBox(img, ctx.overrides, 'book-grid-cell')).join('');
  return `
    <div class="book-tpl book-tpl-grid book-tpl-grid-${effective}">
      <div class="book-tpl-grid-inner">
        ${cells}
      </div>
      <div class="book-post-body book-post-body-compact">
        ${renderMeta(ctx)}
        ${ctx.body ? `<div class="book-post-text">${escapeHtml(ctx.body)}</div>` : ''}
        ${renderCommentsAndReactions(ctx)}
      </div>
    </div>
  `;
}

function renderTplTextHeavy(ctx) {
  const heroImage = ctx.images[0];
  return `
    <div class="book-tpl book-tpl-text-heavy">
      ${heroImage ? `<div class="book-tpl-text-hero">${imageBox(heroImage, ctx.overrides, '')}</div>` : ''}
      <div class="book-post-body book-post-body-long">
        ${renderMeta(ctx)}
        ${ctx.body ? `<div class="book-post-text book-post-text-long">${escapeHtml(ctx.body)}</div>` : ''}
        ${renderCommentsAndReactions(ctx)}
      </div>
    </div>
  `;
}

function renderTemplate(name, ctx) {
  switch (name) {
    case 'full-bleed': return renderTplFullBleed(ctx);
    case 'grid-2': return renderTplGrid(ctx, 2);
    case 'grid-3': return renderTplGrid(ctx, 3);
    case 'grid-4': return renderTplGrid(ctx, 4);
    case 'text-heavy': return renderTplTextHeavy(ctx);
    case 'hero-top':
    default: return renderTplHeroTop(ctx);
  }
}

function renderPostPage(post, overrides, weight) {
  const excludedMedia = new Set(overrides.excludedMedia || []);
  const allImages = (post.media || []).filter(m => (m.file_type || '').startsWith('image/'));
  const images = allImages.filter(m => !excludedMedia.has(m.file_path));

  const ctx = {
    post,
    overrides,
    images,
    body: post.body || '',
    bodyLen: (post.body || '').length,
    dateStr: post.post_date ? formatDateLong(post.post_date) : '',
    authorName: post.contact ? [post.contact.first_name, post.contact.last_name].filter(Boolean).join(' ') : '',
    comments: post.comments || [],
    reactionCount: (post.reactions || []).length,
  };

  const override = safeTemplate(overrides.templates?.[post.uuid]);
  const templateName = override || autoSelectTemplate(ctx, weight);
  const safeW = safeWeight(weight) || 'normal';

  return `
    <div class="book-page book-page-post book-page-weight-${safeW}" data-post-uuid="${escapeHtml(post.uuid)}" data-template="${templateName}">
      ${renderTemplate(templateName, ctx)}
    </div>
  `;
}

// Batch page: 4 small posts on one page, kept in chronological order.
function renderBatchPage(posts, overrides) {
  const excludedMedia = new Set(overrides.excludedMedia || []);
  const cells = posts.map((post) => {
    const images = (post.media || [])
      .filter(m => (m.file_type || '').startsWith('image/'))
      .filter(m => !excludedMedia.has(m.file_path));
    const primary = images[0];
    const dateStr = post.post_date ? formatDateLong(post.post_date) : '';
    const snippet = (post.body || '').slice(0, 80);
    return `
      <div class="book-batch-cell" data-post-uuid="${escapeHtml(post.uuid)}">
        ${imageBox(primary, overrides, 'book-batch-img')}
        <div class="book-batch-caption">
          ${dateStr ? `<span class="book-batch-date">${escapeHtml(dateStr)}</span>` : ''}
          ${snippet ? `<span class="book-batch-body">${escapeHtml(snippet)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="book-page book-page-batch">
      <div class="book-batch-grid">${cells}</div>
    </div>
  `;
}

function renderPage(page, overrides) {
  switch (page.type) {
    case 'cover': return renderCoverPage(page.book);
    case 'chapter': return renderChapterPage(page.year);
    case 'back': return renderBackPage();
    case 'post': return renderPostPage(page.post, overrides, page.weight);
    case 'batch': return renderBatchPage(page.posts, overrides);
    default: return '<div class="book-page"></div>';
  }
}

function readPageFromHash() {
  const m = (window.location.hash || '').match(/p=(\d+)/);
  return m ? Math.max(0, parseInt(m[1], 10) - 1) : 0;
}

function writePageToHash(pageIdx) {
  const newHash = `#p=${pageIdx + 1}`;
  if (window.location.hash !== newHash) {
    history.replaceState({}, '', window.location.pathname + newHash);
  }
}

// Modal for inline metadata editing (title, subtitle, language, chapter
// grouping, comments/reactions toggles). Opens over the preview without
// navigating away.
export function showEditInfoModal(book, onSave) {
  // Remove any existing modal instance first
  const existing = document.getElementById('book-edit-info-modal');
  if (existing) existing.remove();

  const layout = book.layout_options || {};
  const wrap = document.createElement('div');
  wrap.id = 'book-edit-info-modal';
  wrap.className = 'modal fade';
  wrap.tabIndex = -1;
  wrap.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content glass-card">
        <div class="modal-header">
          <h5 class="modal-title">${t('book.editInfo')}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <form id="book-edit-info-form">
            <div class="mb-3">
              <label class="form-label">${t('book.fieldTitle')}</label>
              <input type="text" class="form-control" id="edit-title" maxlength="255" value="${escapeHtml(book.title || '')}" required>
            </div>
            <div class="mb-3">
              <label class="form-label">${t('book.fieldSubtitle')}</label>
              <input type="text" class="form-control" id="edit-subtitle" maxlength="255" value="${escapeHtml(book.subtitle || '')}">
            </div>
            <div class="mb-3">
              <label class="form-label">${t('book.fieldLanguage')}</label>
              <select class="form-select" id="edit-language">
                <option value="nb"${(layout.language || 'nb') === 'nb' ? ' selected' : ''}>Norsk</option>
                <option value="en"${layout.language === 'en' ? ' selected' : ''}>English</option>
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label">${t('book.fieldChapterGrouping')}</label>
              <select class="form-select" id="edit-chapter">
                <option value="year"${(layout.chapterGrouping || 'year') === 'year' ? ' selected' : ''}>${t('book.chapterPerYear')}</option>
                <option value="none"${layout.chapterGrouping === 'none' ? ' selected' : ''}>${t('book.chapterNone')}</option>
              </select>
            </div>
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="edit-comments" ${layout.includeComments !== false ? 'checked' : ''}>
              <label class="form-check-label" for="edit-comments">${t('book.includeComments')}</label>
            </div>
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="edit-reactions" ${layout.includeReactions !== false ? 'checked' : ''}>
              <label class="form-check-label" for="edit-reactions">${t('book.includeReactions')}</label>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
          <button type="button" class="btn btn-primary btn-sm" id="edit-info-save">${t('common.save')}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  const modal = new window.bootstrap.Modal(wrap);
  modal.show();

  wrap.querySelector('#edit-info-save').onclick = async () => {
    const payload = {
      title: wrap.querySelector('#edit-title').value.trim(),
      subtitle: wrap.querySelector('#edit-subtitle').value.trim() || null,
      layout_options: {
        ...(book.layout_options || {}),
        language: wrap.querySelector('#edit-language').value,
        chapterGrouping: wrap.querySelector('#edit-chapter').value,
        includeComments: wrap.querySelector('#edit-comments').checked,
        includeReactions: wrap.querySelector('#edit-reactions').checked,
      },
    };
    if (!payload.title) return;
    await onSave(payload);
    modal.hide();
  };

  wrap.addEventListener('hidden.bs.modal', () => wrap.remove());
}

export async function renderBookPreview(bookUuid) {
  const content = document.getElementById('app-content');
  content.innerHTML = `<div class="page-container"><p class="text-muted">${t('common.loading')}</p></div>`;

  let data;
  try {
    data = await api.get(`/books/${bookUuid}/data`);
  } catch (err) {
    content.innerHTML = `<div class="page-container"><div class="alert alert-danger">${escapeHtml(err.message || 'Failed to load book')}</div></div>`;
    return;
  }

  // Overrides live in book.layout_options.overrides. Clone so we don't mutate
  // the response object unnecessarily.
  const overrides = {
    excludedPosts: [...(data.book.layout_options?.overrides?.excludedPosts || [])],
    excludedMedia: [...(data.book.layout_options?.overrides?.excludedMedia || [])],
    mediaFocal: { ...(data.book.layout_options?.overrides?.mediaFocal || {}) },
    templates: { ...(data.book.layout_options?.overrides?.templates || {}) },
    postWeight: { ...(data.book.layout_options?.overrides?.postWeight || {}) },
  };

  // Debounced PATCH of the full layout_options.overrides.
  let saveTimer = null;
  let savePending = false;
  const saveOverrides = () => {
    savePending = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      savePending = false;
      try {
        const merged = {
          ...(data.book.layout_options || {}),
          overrides: {
            excludedPosts: overrides.excludedPosts,
            excludedMedia: overrides.excludedMedia,
            mediaFocal: overrides.mediaFocal,
            templates: overrides.templates,
            postWeight: overrides.postWeight,
          },
        };
        await api.patch(`/books/${bookUuid}`, { layout_options: merged });
        const statusEl = document.getElementById('book-save-status');
        if (statusEl) {
          statusEl.textContent = t('book.saved');
          setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 1500);
        }
      } catch (err) {
        console.error('book save failed', err);
      }
    }, 500);
  };

  // View state. gridMode and editorMode are mutually exclusive alternatives
  // to the flip view. spreadMode and curateMode are sub-modes of flip view.
  let spreadMode = localStorage.getItem('bookSpreadMode') === '1';
  let curateMode = false;
  let gridMode = false;
  let editorMode = false;

  let pages = buildPages(data, overrides);
  let currentPage = Math.min(readPageFromHash(), pages.length - 1);
  if (currentPage < 0) currentPage = 0;

  const renderShell = () => {
    content.innerHTML = `
      <div class="book-viewer${curateMode ? ' is-curate' : ''}${gridMode ? ' is-grid' : ''}${editorMode ? ' is-editor' : ''}" id="book-viewer">
        <div class="book-toolbar no-print">
          <div class="book-toolbar-inner">
            <button class="btn btn-outline-secondary btn-sm" id="book-btn-back">
              <i class="bi bi-arrow-left"></i> ${t('common.back')}
            </button>
            <div class="book-toolbar-center">
              <div class="btn-group book-viewmode-group" role="group" aria-label="${t('book.viewMode')}">
                <button class="btn btn-outline-secondary btn-sm ${(!gridMode && !editorMode) ? 'active' : ''}" id="book-btn-flip" title="${t('book.toggleFlip')}">
                  <i class="bi bi-book"></i>
                </button>
                <button class="btn btn-outline-secondary btn-sm ${gridMode ? 'active' : ''}" id="book-btn-grid" title="${t('book.toggleGrid')}">
                  <i class="bi bi-grid-3x3-gap"></i>
                </button>
                <button class="btn btn-outline-secondary btn-sm ${editorMode ? 'active' : ''}" id="book-btn-editor" title="${t('book.toggleEditor')}">
                  <i class="bi bi-list-ul"></i>
                </button>
              </div>
              ${(!gridMode && !editorMode) ? `
                <button class="btn btn-outline-secondary btn-sm ms-2 ${spreadMode ? 'active' : ''}" id="book-btn-spread" title="${t('book.toggleSpread')}">
                  <i class="bi bi-book-half"></i>
                </button>
              ` : ''}
              <span class="book-page-indicator ms-3" id="book-page-indicator"></span>
              <span class="book-save-status text-muted small ms-2" id="book-save-status"></span>
            </div>
            <div class="book-toolbar-actions">
              <div class="dropdown">
                <button class="btn btn-link btn-sm" data-bs-toggle="dropdown" aria-expanded="false">
                  <i class="bi bi-three-dots"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
                  <li><button class="dropdown-item" id="book-btn-editmeta"><i class="bi bi-pencil me-2"></i>${t('book.editInfo')}</button></li>
                  <li><button class="dropdown-item" id="book-btn-print"><i class="bi bi-printer me-2"></i>${t('book.printPdf')}</button></li>
                  <li><hr class="dropdown-divider"></li>
                  <li><button class="dropdown-item text-danger" id="book-btn-delete"><i class="bi bi-trash3 me-2"></i>${t('book.delete')}</button></li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        ${gridMode ? renderGridView() : (editorMode ? renderEditorView() : renderFlipView())}

        ${data.posts.length === 0 ? `<div class="book-empty-state no-print"><p class="text-muted">${t('book.emptyState')}</p></div>` : ''}
      </div>
    `;
    attachShellHandlers();
    if (!gridMode && !editorMode) {
      computeScale();
      updateFlipView();
    }
  };

  const renderFlipView = () => `
    <div class="book-stage" id="book-stage">
      <button class="book-nav book-nav-prev no-print" id="book-nav-prev" aria-label="prev">
        <i class="bi bi-chevron-left"></i>
      </button>
      <div class="book-pages-frame ${spreadMode ? 'is-spread' : ''}" id="book-pages-frame">
        <div class="book-pages ${spreadMode ? 'is-spread' : ''}" id="book-pages">
          ${pages.map((p, i) => `
            <div class="book-page-wrap" data-idx="${i}">
              ${renderPage(p, overrides)}
              ${(p.type === 'post' || p.type === 'batch') ? `
                <button type="button" class="book-page-edit-btn no-print" data-page-edit-toggle title="${escapeHtml(t('book.editPage'))}">
                  <i class="bi bi-${curateMode ? 'check-lg' : 'pencil'}"></i>
                </button>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      <button class="book-nav book-nav-next no-print" id="book-nav-next" aria-label="next">
        <i class="bi bi-chevron-right"></i>
      </button>
      ${curateMode ? renderTemplatePicker() : ''}
      ${curateMode ? `
        <div class="book-curate-hint no-print">
          <i class="bi bi-info-circle me-1"></i>${t('book.curateHint')}
        </div>
      ` : ''}
    </div>
  `;

  const renderGridView = () => {
    // Grid shows the actual packed pages (including batch pages), plus
    // hidden posts surfaced individually for recovery.
    const hiddenPosts = data.posts.filter(p => effectiveWeight(p, overrides) === 'hidden');

    const visiblePages = pages; // already packed via buildPages

    return `
      <div class="book-grid">
        ${visiblePages.map((p) => {
          const postUuid = p.type === 'post' ? p.post.uuid : null;
          return `
            <div class="book-grid-item" ${postUuid ? `data-grid-post="${escapeHtml(postUuid)}"` : ''}>
              <div class="book-grid-thumb">
                ${renderPage(p, overrides)}
              </div>
              ${postUuid ? `
                <button type="button" class="book-grid-toggle"
                        data-grid-toggle="${escapeHtml(postUuid)}"
                        title="${t('book.excludePage')}">
                  <i class="bi bi-x-lg"></i>
                </button>
              ` : ''}
            </div>
          `;
        }).join('')}
        ${hiddenPosts.length ? `
          <div class="book-grid-hidden-header">
            <h6 class="text-muted mb-0"><i class="bi bi-eye-slash me-2"></i>${t('book.hiddenPostsHeader')} (${hiddenPosts.length})</h6>
          </div>
          ${hiddenPosts.map((post) => `
            <div class="book-grid-item is-excluded" data-grid-post="${escapeHtml(post.uuid)}">
              <div class="book-grid-thumb">
                ${renderPage({ type: 'post', post, weight: autoWeightForPost(post) }, overrides)}
              </div>
              <button type="button" class="book-grid-toggle"
                      data-grid-toggle="${escapeHtml(post.uuid)}"
                      title="${t('book.include')}">
                <i class="bi bi-arrow-counterclockwise"></i>
              </button>
            </div>
          `).join('')}
        ` : ''}
      </div>
    `;
  };

  // Editor view: vertical list of every post ordered chronologically, with
  // a side panel to change the post's weight. Weight is the primary lever
  // that controls how much space the post gets in the book and whether it
  // shares a page with other small posts. Template override is tucked under
  // "advanced" — weight covers 99% of the use cases.
  const renderEditorView = () => {
    if (!data.posts.length) {
      return `<div class="book-editor-empty"><p class="text-muted">${t('book.emptyState')}</p></div>`;
    }

    // Compute page count live so the user can see impact of weight changes.
    const pageCount = pages.length;

    // Pre-compute which posts land on shared batch pages so we can badge them.
    const batchPostUuids = new Set();
    for (const p of pages) {
      if (p.type === 'batch') for (const bp of p.posts) batchPostUuids.add(bp.uuid);
    }

    return `
      <div class="book-editor">
        <div class="book-editor-summary">
          <strong>${pageCount}</strong> ${t('book.pagesTotal')}
          <span class="text-muted small ms-2">${t('book.editorSummaryHint')}</span>
        </div>
        ${data.posts.map((post, i) => {
          const weight = effectiveWeight(post, overrides);
          const autoW = autoWeightForPost(post);
          const isOverridden = !!overrides.postWeight[post.uuid];
          const isExcluded = weight === 'hidden';
          const inBatch = batchPostUuids.has(post.uuid);
          const allImages = (post.media || []).filter(m => (m.file_type || '').startsWith('image/'));
          const excludedMedia = new Set(overrides.excludedMedia || []);
          return `
            <div class="book-editor-row ${isExcluded ? 'is-excluded' : ''} book-editor-weight-${weight}" data-editor-post="${escapeHtml(post.uuid)}">
              <div class="book-editor-preview">
                <div class="book-editor-preview-scale">
                  ${renderPage({ type: 'post', post, weight }, overrides)}
                </div>
              </div>
              <div class="book-editor-panel">
                <div class="book-editor-panel-header">
                  <span class="book-editor-num">#${i + 1}</span>
                  <span class="book-editor-date">${escapeHtml(post.post_date ? formatDateLong(post.post_date) : '')}</span>
                </div>

                <div class="book-editor-section">
                  <label class="book-editor-label">
                    ${t('book.weight')}
                    ${isOverridden ? `<span class="book-editor-auto-hint">(${t('book.manualOverride')})</span>` : `<span class="book-editor-auto-hint">${t('book.auto')}: ${t('book.weight_' + autoW)}</span>`}
                  </label>
                  <div class="btn-group book-weight-group w-100" role="group">
                    ${['big', 'normal', 'small', 'hidden'].map(w => `
                      <button type="button"
                        class="btn btn-sm btn-outline-secondary ${weight === w ? 'active' : ''}"
                        data-editor-weight="${w}"
                        data-post-uuid="${escapeHtml(post.uuid)}"
                        title="${escapeHtml(t('book.weightDesc_' + w))}">
                        <i class="bi bi-${w === 'big' ? 'star-fill' : w === 'normal' ? 'circle-fill' : w === 'small' ? 'dash-circle' : 'eye-slash'}"></i>
                        ${t('book.weight_' + w)}
                      </button>
                    `).join('')}
                  </div>
                  ${isOverridden ? `
                    <button type="button" class="btn btn-link btn-sm p-0 mt-1" data-editor-reset-weight="${escapeHtml(post.uuid)}">
                      <i class="bi bi-arrow-counterclockwise me-1"></i>${t('book.resetToAuto')}
                    </button>
                  ` : ''}
                  ${inBatch ? `
                    <p class="text-muted small mb-0 mt-1"><i class="bi bi-info-circle me-1"></i>${t('book.sharedPageHint')}</p>
                  ` : ''}
                </div>

                ${allImages.length && !isExcluded ? `
                  <div class="book-editor-section">
                    <label class="book-editor-label">${t('book.images')} (${allImages.length - [...excludedMedia].filter(p => allImages.some(i => i.file_path === p)).length}/${allImages.length})</label>
                    <div class="book-editor-images">
                      ${allImages.map(m => {
                        const isImgExcluded = excludedMedia.has(m.file_path);
                        return `
                          <div class="book-editor-img-thumb ${isImgExcluded ? 'is-excluded' : ''}">
                            <img src="${authUrl(m.file_path)}" alt="">
                            <button type="button"
                              class="book-editor-img-toggle"
                              data-editor-img-toggle="${escapeHtml(m.file_path)}"
                              title="${isImgExcluded ? escapeHtml(t('book.include')) : escapeHtml(t('book.excludeImage'))}">
                              <i class="bi bi-${isImgExcluded ? 'arrow-counterclockwise' : 'x-lg'}"></i>
                            </button>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  };

  const updateFlipView = () => {
    const pagesEl = document.getElementById('book-pages');
    if (!pagesEl) return;
    const indicator = document.getElementById('book-page-indicator');
    const wraps = pagesEl.querySelectorAll('.book-page-wrap');

    // Clamp after rebuilds
    if (currentPage >= pages.length) currentPage = Math.max(0, pages.length - 1);

    wraps.forEach((el, i) => {
      let active = false;
      let slot = null;
      if (spreadMode) {
        if (currentPage === 0) {
          active = (i === 0);
          slot = 'right';
        } else {
          const leftIdx = currentPage % 2 === 1 ? currentPage : currentPage - 1;
          if (i === leftIdx) { active = true; slot = 'left'; }
          else if (i === leftIdx + 1 && i < pages.length) { active = true; slot = 'right'; }
        }
      } else {
        active = (i === currentPage);
      }
      el.classList.toggle('is-active', active);
      el.classList.toggle('is-left', slot === 'left');
      el.classList.toggle('is-right', slot === 'right');
    });

    if (indicator) indicator.textContent = `${currentPage + 1} / ${pages.length}`;
    writePageToHash(currentPage);

    // Re-render the template picker since its active state depends on the
    // currently visible post page.
    if (curateMode) {
      const existing = document.querySelector('.book-template-picker');
      if (existing) {
        existing.outerHTML = renderTemplatePicker();
        document.querySelectorAll('.book-tpl-btn[data-tpl]').forEach((btn) => {
          btn.onclick = () => setTemplateForCurrentPage(btn.dataset.tpl);
        });
      }
    }
  };

  // Compute how much the book-pages need to shrink to fit the stage.
  // 200mm ≈ 755.9px at 96dpi. For spread, content width is 2 * 200mm + 2mm.
  const computeScale = () => {
    const stage = document.getElementById('book-stage');
    if (!stage) return;
    const MM_PER_INCH = 25.4;
    const DPI = 96;
    const PX_PER_MM = DPI / MM_PER_INCH; // ≈ 3.7795
    const pageW = 200 * PX_PER_MM;
    const pageH = 200 * PX_PER_MM;
    const contentW = spreadMode ? (pageW * 2 + 2 * PX_PER_MM) : pageW;
    const contentH = pageH;

    // Subtract nav button widths + their margins + some breathing room.
    const NAV_RESERVED = (48 + 16) * 2 + 48;
    const stageRect = stage.getBoundingClientRect();
    const availW = Math.max(200, stageRect.width - NAV_RESERVED);
    const availH = Math.max(200, window.innerHeight - stageRect.top - 40);

    const scale = Math.min(1, availW / contentW, availH / contentH);
    stage.style.setProperty('--book-scale', scale.toFixed(4));
  };

  const openEditInfoModal = () => {
    showEditInfoModal(data.book, async (payload) => {
      try {
        const res = await api.patch(`/books/${bookUuid}`, payload);
        // Update local data reference and re-render
        data.book = res.book;
        // Preserve overrides (they live inside layout_options so they came back)
        renderShell();
      } catch (err) {
        showError(err.message || t('book.errSaveFailed'));
      }
    });
  };

  const rebuildPages = () => {
    pages = buildPages(data, overrides);
    if (currentPage >= pages.length) currentPage = Math.max(0, pages.length - 1);
    renderShell();
  };

  const goTo = (idx) => {
    currentPage = Math.max(0, Math.min(pages.length - 1, idx));
    if (spreadMode && currentPage > 0 && currentPage % 2 === 0) {
      currentPage = currentPage - 1;
    }
    updateFlipView();
  };

  const next = () => {
    if (spreadMode) {
      if (currentPage === 0) goTo(1);
      else goTo(currentPage + 2);
    } else {
      goTo(currentPage + 1);
    }
  };
  const prev = () => {
    if (spreadMode) {
      if (currentPage <= 1) goTo(0);
      else goTo(currentPage - 2);
    } else {
      goTo(currentPage - 1);
    }
  };

  // Click an image in curate mode → set focal point at the click location.
  // Click the × overlay → exclude that individual image.
  const handleFlipClick = (e) => {
    if (!curateMode) return;

    // Exclude button on an image
    const excludeBtn = e.target.closest('[data-exclude-media]');
    if (excludeBtn) {
      const mediaPath = excludeBtn.dataset.excludeMedia;
      if (!overrides.excludedMedia.includes(mediaPath)) {
        overrides.excludedMedia.push(mediaPath);
      }
      saveOverrides();
      rebuildPages();
      e.stopPropagation();
      return;
    }

    // Focal point on an image
    const bookImg = e.target.closest('.book-img img, .book-post-extras img');
    if (bookImg) {
      const box = bookImg.closest('[data-media-path]');
      const mediaPath = box?.dataset?.mediaPath;
      if (!mediaPath) return;
      const rect = bookImg.getBoundingClientRect();
      const pctX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const pctY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      const value = `${pctX.toFixed(1)}% ${pctY.toFixed(1)}%`;
      overrides.mediaFocal[mediaPath] = value;
      bookImg.style.objectPosition = value;
      saveOverrides();
      e.stopPropagation();
    }
  };

  // Template picker: change the layout template for the current post page.
  const setTemplateForCurrentPage = (templateName) => {
    const page = pages[currentPage];
    if (!page || page.type !== 'post') return;
    const postUuid = page.post.uuid;
    if (templateName === 'auto') {
      delete overrides.templates[postUuid];
    } else {
      overrides.templates[postUuid] = templateName;
    }
    saveOverrides();
    rebuildPages();
  };

  const renderTemplatePicker = () => {
    const page = pages[currentPage];
    if (!page || page.type !== 'post') return '';
    const currentOverride = overrides.templates[page.post.uuid];
    const activeTpl = currentOverride || 'auto';
    const buttons = [
      { id: 'auto', icon: 'magic' },
      { id: 'hero-top', icon: 'image' },
      { id: 'full-bleed', icon: 'aspect-ratio' },
      { id: 'grid-2', icon: 'layout-split' },
      { id: 'grid-3', icon: 'grid-3x2-gap' },
      { id: 'grid-4', icon: 'grid' },
      { id: 'text-heavy', icon: 'text-paragraph' },
    ];
    return `
      <div class="book-template-picker no-print">
        <span class="book-template-picker-label">${t('book.template')}:</span>
        ${buttons.map(b => `
          <button type="button"
            class="book-tpl-btn ${activeTpl === b.id ? 'is-active' : ''}"
            data-tpl="${b.id}"
            title="${escapeHtml(t('book.tpl_' + b.id.replace('-', '_')))}">
            <i class="bi bi-${b.icon}"></i>
          </button>
        `).join('')}
      </div>
    `;
  };

  // Toggle visibility of a post. Uses the weight model: hidden posts are
  // excluded from the book but remain visible in the editor for recovery.
  const togglePostExclusion = (postUuid) => {
    const post = data.posts.find(p => p.uuid === postUuid);
    if (!post) return;
    const current = effectiveWeight(post, overrides);
    if (current === 'hidden') {
      // Un-hide: clear the override so auto-weight applies again.
      delete overrides.postWeight[postUuid];
    } else {
      overrides.postWeight[postUuid] = 'hidden';
    }
    saveOverrides();
    rebuildPages();
  };

  function attachShellHandlers() {
    document.getElementById('book-btn-back').onclick = () => navigate('/settings/generate-book');
    document.getElementById('book-btn-editmeta').onclick = () => openEditInfoModal();
    document.getElementById('book-btn-print').onclick = () => {
      // Always print the full (non-excluded) flip view, so disable grid mode first.
      const wasGrid = gridMode;
      if (wasGrid) { gridMode = false; renderShell(); }
      document.body.classList.add('book-printing');
      setTimeout(() => {
        window.print();
        setTimeout(() => document.body.classList.remove('book-printing'), 500);
      }, 50);
    };
    document.getElementById('book-btn-delete').onclick = async () => {
      const ok = await confirmDialog(t('book.confirmDelete'), {
        title: t('book.delete'),
        confirmText: t('common.delete'),
      });
      if (!ok) return;
      try {
        await api.delete(`/books/${bookUuid}`);
        navigate('/settings/generate-book');
      } catch (err) {
        showError(err.message || t('book.errDeleteFailed'));
      }
    };
    const spreadBtn = document.getElementById('book-btn-spread');
    if (spreadBtn) {
      spreadBtn.onclick = () => {
        spreadMode = !spreadMode;
        localStorage.setItem('bookSpreadMode', spreadMode ? '1' : '0');
        renderShell();
      };
    }
    // Segmented view mode buttons — mutually exclusive.
    document.getElementById('book-btn-flip').onclick = () => {
      gridMode = false; editorMode = false;
      renderShell();
    };
    document.getElementById('book-btn-grid').onclick = () => {
      gridMode = true; editorMode = false; curateMode = false;
      renderShell();
    };
    document.getElementById('book-btn-editor').onclick = () => {
      editorMode = true; gridMode = false; curateMode = false;
      renderShell();
    };

    if (editorMode) {
      // Weight buttons per row — the primary control
      document.querySelectorAll('[data-editor-weight]').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const postUuid = btn.dataset.postUuid;
          overrides.postWeight[postUuid] = btn.dataset.editorWeight;
          saveOverrides();
          rebuildPages();
          renderShell();
        };
      });
      // Reset weight to auto
      document.querySelectorAll('[data-editor-reset-weight]').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const postUuid = btn.dataset.editorResetWeight;
          delete overrides.postWeight[postUuid];
          saveOverrides();
          rebuildPages();
          renderShell();
        };
      });
      // Per-image exclude toggles
      document.querySelectorAll('[data-editor-img-toggle]').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const mediaPath = btn.dataset.editorImgToggle;
          const idx = overrides.excludedMedia.indexOf(mediaPath);
          if (idx >= 0) overrides.excludedMedia.splice(idx, 1);
          else overrides.excludedMedia.push(mediaPath);
          saveOverrides();
          renderShell();
        };
      });
    } else if (!gridMode) {
      document.getElementById('book-nav-prev').onclick = prev;
      document.getElementById('book-nav-next').onclick = next;
      // Page-edit pencil: toggles curate mode for the whole flip view.
      document.querySelectorAll('[data-page-edit-toggle]').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          curateMode = !curateMode;
          renderShell();
        };
      });
      // Curate-mode interactions on flip view
      const pagesEl = document.getElementById('book-pages');
      if (pagesEl) {
        pagesEl.addEventListener('click', handleFlipClick);
      }
      // Template picker buttons
      document.querySelectorAll('.book-tpl-btn[data-tpl]').forEach((btn) => {
        btn.onclick = () => setTemplateForCurrentPage(btn.dataset.tpl);
      });
    } else {
      // Grid interactions
      const viewer = document.getElementById('book-viewer');
      viewer.querySelectorAll('[data-grid-toggle]').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          togglePostExclusion(btn.dataset.gridToggle);
        };
      });
      viewer.querySelectorAll('[data-grid-post]').forEach((item) => {
        item.onclick = () => {
          // Jump to this page in flip view.
          const postUuid = item.dataset.gridPost;
          gridMode = false;
          renderShell();
          // Find the page index after rebuild.
          const idx = pages.findIndex(p => p.type === 'post' && p.post.uuid === postUuid);
          if (idx >= 0) goTo(idx);
        };
      });
    }
  }

  const resizeHandler = () => { if (!gridMode && !editorMode) computeScale(); };
  window.addEventListener('resize', resizeHandler);

  const keyHandler = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (gridMode || editorMode) return;
    if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'ArrowRight') next();
  };
  document.addEventListener('keydown', keyHandler);

  const observer = new MutationObserver(() => {
    if (!document.getElementById('book-viewer')) {
      document.removeEventListener('keydown', keyHandler);
      window.removeEventListener('resize', resizeHandler);
      observer.disconnect();
      // Flush pending save on navigation away
      if (savePending && saveTimer) {
        clearTimeout(saveTimer);
        const merged = {
          ...(data.book.layout_options || {}),
          overrides: {
            excludedPosts: overrides.excludedPosts,
            excludedMedia: overrides.excludedMedia,
            mediaFocal: overrides.mediaFocal,
            templates: overrides.templates,
            postWeight: overrides.postWeight,
          },
        };
        api.patch(`/books/${bookUuid}`, { layout_options: merged }).catch(() => {});
      }
    }
  });
  observer.observe(content, { childList: true });

  renderShell();
}
