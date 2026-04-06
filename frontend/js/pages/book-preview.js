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

// Content-stable key for a batch: sorted UUIDs joined. Survives reordering
// within the batch but resets if posts are added or removed.
function batchKey(posts) {
  return posts.map(p => p.uuid).sort().join('|');
}

// Valid batch layout variants per post count, with the first entry as default.
const BATCH_VARIANTS = {
  2: ['horizontal', 'vertical'],
  3: ['big-left', 'big-top'],
  4: ['grid', 'rows', 'columns'],
};

function scorePost(post) {
  const likes = (post.reactions || []).length;
  const comments = (post.comments || []).length;
  const mediaCount = (post.media || []).filter(m => (m.file_type || '').startsWith('image/')).length;
  const bodyLen = (post.body || '').length;
  return likes * 3 + comments * 4 + bodyLen / 20 + mediaCount * 2;
}

function autoWeightForPost(post) {
  const score = scorePost(post);
  // Posts with meaningful engagement or content get their own page; the
  // rest are batched onto shared pages to save space.
  return score >= 8 ? 'full' : 'small';
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
      if (slice.length === 1) {
        pages.push({ type: 'post', post: slice[0], weight: 'small-solo' });
      } else {
        // Apply manual ordering if the user reordered this batch. The
        // stored order only includes posts still present in the batch;
        // any new posts append at the end in chronological order.
        const key = batchKey(slice);
        const storedOrder = overrides.batchOrder?.[key];
        let ordered = slice;
        if (Array.isArray(storedOrder)) {
          const byUuid = new Map(slice.map(p => [p.uuid, p]));
          const result = [];
          for (const uuid of storedOrder) {
            if (byUuid.has(uuid)) {
              result.push(byUuid.get(uuid));
              byUuid.delete(uuid);
            }
          }
          for (const p of byUuid.values()) result.push(p);
          ordered = result;
        }
        pages.push({ type: 'batch', posts: ordered, key });
      }
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
      // 'full' interrupts a batch run
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

const TEMPLATES = ['hero-top', 'full-bleed', 'grid-2', 'grid-3', 'grid-4', 'text-heavy', 'image-side'];
// Three-state weight model: a post either gets its own page, shares a
// batch page with other small posts, or is hidden. The visual style of a
// full page is decided by template selection (auto-picked from content +
// engagement score, or manually overridden in the page editor).
const VALID_WEIGHTS = ['full', 'small', 'hidden'];
// Legacy values from earlier versions of the model.
const WEIGHT_LEGACY = { big: 'full', normal: 'full' };
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
  if (VALID_WEIGHTS.includes(value)) return value;
  if (WEIGHT_LEGACY[value]) return WEIGHT_LEGACY[value];
  return null;
}

function autoSelectTemplate(ctx) {
  const { images, bodyLen, comments, post } = ctx;
  const commentCount = (comments || []).length;
  const score = scorePost(post);
  // High-engagement posts with a single image get the impact full-bleed.
  const isHighImpact = score >= 20;
  // Lots of comments + 1-2 images → side-by-side so comments get their
  // own column instead of being squeezed under the image.
  if (commentCount >= 4 && images.length >= 1 && images.length <= 2) return 'image-side';
  if (bodyLen > 600 && images.length <= 1) return 'text-heavy';
  if (images.length === 0) return 'text-heavy';
  if (images.length === 1) {
    if (isHighImpact || bodyLen < 40) return 'full-bleed';
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
  // The contact name is redundant when the book is dedicated to a single
  // contact (their name is on the cover). Only show on multi-contact books.
  // Reactions live inline in the meta row so they don't steal vertical
  // space from the comments list below.
  const reactionBadge = ctx.reactionCount
    ? `<span class="book-post-reactions-inline">❤ ${ctx.reactionCount}</span>`
    : '';
  return `
    <div class="book-post-meta">
      <span class="book-post-meta-left">
        ${ctx.dateStr ? `<span class="book-post-date">${escapeHtml(ctx.dateStr)}</span>` : ''}
        ${reactionBadge}
      </span>
      ${ctx.showAuthor && ctx.authorName ? `<span class="book-post-author">${escapeHtml(ctx.authorName)}</span>` : ''}
    </div>
  `;
}

function renderCommentBubble(c) {
  const initials = (c.author_name || '').split(/\s+/).filter(Boolean).map(s => s[0]).join('').toUpperCase().slice(0, 2);
  const avatarHtml = c.author_avatar
    ? `<img src="${authUrl(c.author_avatar)}" alt="">`
    : `<span>${escapeHtml(initials || '?')}</span>`;
  return `
    <div class="book-comment">
      <span class="book-comment-avatar">${avatarHtml}</span>
      <div class="book-comment-bubble">
        ${c.author_name ? `<span class="book-comment-author">${escapeHtml(c.author_name)}</span>` : ''}
        <span class="book-comment-text">${escapeHtml(c.body)}</span>
      </div>
    </div>
  `;
}

function renderCommentsAndReactions(ctx) {
  // Reactions are rendered inline in renderMeta to preserve vertical space
  // for comments. This function now only renders the comment list.
  return ctx.comments.length
    ? `<div class="book-post-comments">
         ${ctx.comments.slice(0, 6).map(renderCommentBubble).join('')}
       </div>`
    : '';
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
        ${renderCommentsAndReactions(ctx)}
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
      ${heroImage ? imageBox(heroImage, ctx.overrides, 'book-tpl-text-hero') : ''}
      <div class="book-post-body book-post-body-long">
        ${renderMeta(ctx)}
        ${ctx.body ? `<div class="book-post-text-long-body">${escapeHtml(ctx.body)}</div>` : ''}
        ${renderCommentsAndReactions(ctx)}
      </div>
    </div>
  `;
}

// Image-side: image fills the left half, content (meta, body, comments)
// runs as a column on the right. Best when a post has many comments.
function renderTplImageSide(ctx) {
  return `
    <div class="book-tpl book-tpl-image-side">
      ${imageBox(ctx.images[0], ctx.overrides, 'book-tpl-side-img')}
      <div class="book-tpl-side-content">
        ${renderMeta(ctx)}
        ${ctx.body ? `<div class="book-post-text-long-body">${escapeHtml(ctx.body)}</div>` : ''}
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
    case 'image-side': return renderTplImageSide(ctx);
    case 'hero-top':
    default: return renderTplHeroTop(ctx);
  }
}

function renderPostPage(post, overrides, weight, bookMeta) {
  const excludedMedia = new Set(overrides.excludedMedia || []);
  const allImages = (post.media || []).filter(m => (m.file_type || '').startsWith('image/'));
  const images = allImages.filter(m => !excludedMedia.has(m.file_path));

  const effectiveBody = overrides.customText?.[post.uuid] != null
    ? overrides.customText[post.uuid]
    : (post.body || '');
  const hideComments = !!overrides.hideComments?.[post.uuid];
  const ctx = {
    post,
    overrides,
    images,
    body: effectiveBody,
    bodyLen: effectiveBody.length,
    dateStr: post.post_date ? formatDateLong(post.post_date) : '',
    authorName: post.contact ? [post.contact.first_name, post.contact.last_name].filter(Boolean).join(' ') : '',
    comments: hideComments ? [] : (post.comments || []),
    reactionCount: (post.reactions || []).length,
    // Only show the contact name on pages when the book covers multiple
    // contacts — otherwise the name is redundant with the book title.
    showAuthor: (bookMeta?.contactCount || 0) > 1,
  };

  const override = safeTemplate(overrides.templates?.[post.uuid]);
  const templateName = override || autoSelectTemplate(ctx);
  const safeW = safeWeight(weight) || 'full';

  return `
    <div class="book-page book-page-post book-page-weight-${safeW}" data-post-uuid="${escapeHtml(post.uuid)}" data-template="${templateName}">
      ${renderTemplate(templateName, ctx)}
    </div>
  `;
}

// Batch page: 2-4 small posts on one page. Uses an adaptive layout based on
// post count, with user-selectable variants per count (e.g. 3 posts can be
// "big-left" or "big-top"). Post order can also be customized per batch.
function renderBatchPage(posts, overrides, key) {
  const variants = BATCH_VARIANTS[posts.length] || ['grid'];
  const variant = (key && overrides.batchVariant?.[key]) || variants[0];
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
    <div class="book-page book-page-batch book-page-batch-${posts.length} book-page-batch-${variant}">
      <div class="book-batch-grid">${cells}</div>
    </div>
  `;
}

function renderPage(page, overrides, bookMeta) {
  switch (page.type) {
    case 'cover': return renderCoverPage(page.book);
    case 'chapter': return renderChapterPage(page.year);
    case 'back': return renderBackPage();
    case 'post': return renderPostPage(page.post, overrides, page.weight, bookMeta);
    case 'batch': return renderBatchPage(page.posts, overrides, page.key);
    default: return '<div class="book-page"></div>';
  }
}

// URL hash format: #view=flip&p=42, #view=grid, #view=editor
// Default is #view=flip&p=1 if no hash. Keeps refresh on the correct view.
function readHashState() {
  const hash = (window.location.hash || '').replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const view = params.get('view') || 'flip';
  const page = parseInt(params.get('p') || '1', 10);
  return { view, page: Math.max(0, page - 1) };
}

function writeHashState({ view, pageIdx }) {
  const params = new URLSearchParams();
  params.set('view', view);
  if (view === 'flip' && pageIdx != null) params.set('p', String(pageIdx + 1));
  const newHash = '#' + params.toString();
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

  // Book-level metadata passed to every page renderer. Used e.g. to decide
  // whether to show the contact name in the meta row.
  const bookMeta = {
    contactCount: (data.book.contact_uuids || []).length,
  };

  // Overrides live in book.layout_options.overrides. Clone so we don't mutate
  // the response object unnecessarily.
  const overrides = {
    excludedPosts: [...(data.book.layout_options?.overrides?.excludedPosts || [])],
    excludedMedia: [...(data.book.layout_options?.overrides?.excludedMedia || [])],
    mediaFocal: { ...(data.book.layout_options?.overrides?.mediaFocal || {}) },
    templates: { ...(data.book.layout_options?.overrides?.templates || {}) },
    postWeight: { ...(data.book.layout_options?.overrides?.postWeight || {}) },
    // Per-post body text override: used instead of post.body in book
    // rendering only (never mutates the original post).
    customText: { ...(data.book.layout_options?.overrides?.customText || {}) },
    // Per-post comment visibility override (true = hide comments on this
    // page even if the book-level includeComments setting is on).
    hideComments: { ...(data.book.layout_options?.overrides?.hideComments || {}) },
    // Per-batch layout variant and post order. Keyed by a content-stable
    // hash of the sorted post UUIDs in the batch so the key survives
    // reorderings. Reset automatically if the batch composition changes.
    batchVariant: { ...(data.book.layout_options?.overrides?.batchVariant || {}) },
    batchOrder: { ...(data.book.layout_options?.overrides?.batchOrder || {}) },
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
            customText: overrides.customText,
            hideComments: overrides.hideComments,
            batchVariant: overrides.batchVariant,
            batchOrder: overrides.batchOrder,
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
  // to the flip view. spreadMode is a sub-mode of flip view. pageEditPostUuid,
  // when set, takes over the whole stage with a dedicated single-page editor.
  let spreadMode = localStorage.getItem('bookSpreadMode') === '1';
  let gridMode = false;
  let editorMode = false;
  let pageEditPostUuid = null;
  let batchEditPageIdx = null;

  // Restore view mode from URL hash so refresh keeps the user where they were.
  const initialState = readHashState();
  if (initialState.view === 'grid') gridMode = true;
  else if (initialState.view === 'editor') editorMode = true;

  let pages = buildPages(data, overrides);
  let currentPage = Math.min(initialState.page, pages.length - 1);
  if (currentPage < 0) currentPage = 0;

  const renderShell = () => {
    content.innerHTML = `
      <div class="book-viewer${gridMode ? ' is-grid' : ''}${editorMode ? ' is-editor' : ''}${(pageEditPostUuid || batchEditPageIdx != null) ? ' is-page-edit' : ''}" id="book-viewer">
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

        ${batchEditPageIdx != null ? renderBatchEditView() : (pageEditPostUuid ? renderPageEditView() : (gridMode ? renderGridView() : (editorMode ? renderEditorView() : renderFlipView())))}

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
              ${renderPage(p, overrides, bookMeta)}
              ${p.type === 'post' ? `
                <button type="button" class="book-page-edit-btn no-print" data-page-edit-post="${escapeHtml(p.post.uuid)}" title="${escapeHtml(t('book.editPage'))}">
                  <i class="bi bi-pencil"></i>
                </button>
              ` : ''}
              ${p.type === 'batch' ? `
                <button type="button" class="book-page-edit-btn no-print" data-page-edit-batch="${i}" title="${escapeHtml(t('book.editPage'))}">
                  <i class="bi bi-pencil"></i>
                </button>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      <button class="book-nav book-nav-next no-print" id="book-nav-next" aria-label="next">
        <i class="bi bi-chevron-right"></i>
      </button>
    </div>
  `;

  // Dedicated page editor — takes over the stage with a large preview on
  // the left and a control panel on the right. All per-page edits happen
  // here (focal point, template, custom text, image exclusion).
  const renderPageEditView = () => {
    const post = data.posts.find(p => p.uuid === pageEditPostUuid);
    if (!post) return '<div class="book-empty-state"><p class="text-muted">Post not found</p></div>';

    const weight = effectiveWeight(post, overrides);
    const activeTpl = safeTemplate(overrides.templates[post.uuid]) || 'auto';
    const customText = overrides.customText[post.uuid];
    const allImages = (post.media || []).filter(m => (m.file_type || '').startsWith('image/'));
    const excludedMedia = new Set(overrides.excludedMedia || []);

    // Only show templates that make visual sense for this image count.
    const availableCount = allImages.filter(m => !excludedMedia.has(m.file_path)).length;
    const tplButtons = [{ id: 'auto', icon: 'magic' }];
    if (availableCount >= 1) {
      tplButtons.push({ id: 'hero-top', icon: 'image' });
      tplButtons.push({ id: 'full-bleed', icon: 'aspect-ratio' });
      tplButtons.push({ id: 'image-side', icon: 'layout-text-sidebar-reverse' });
    }
    if (availableCount >= 2) tplButtons.push({ id: 'grid-2', icon: 'layout-split' });
    if (availableCount >= 3) tplButtons.push({ id: 'grid-3', icon: 'grid-3x2-gap' });
    if (availableCount >= 4) tplButtons.push({ id: 'grid-4', icon: 'grid' });
    tplButtons.push({ id: 'text-heavy', icon: 'text-paragraph' });

    return `
      <div class="book-page-editor">
        <div class="book-page-editor-preview">
          <div class="book-page-editor-preview-frame">
            <div class="book-page-editor-preview-scale" id="book-page-editor-scale">
              ${renderPage({ type: 'post', post, weight }, overrides, bookMeta)}
            </div>
          </div>
          <p class="text-muted small mt-3 text-center">
            <i class="bi bi-info-circle me-1"></i>${t('book.pageEditHint')}
          </p>
        </div>
        <div class="book-page-editor-panel glass-card">
          <div class="book-page-editor-header">
            <div>
              <div class="book-page-editor-title">${escapeHtml(post.post_date ? formatDateLong(post.post_date) : '')}</div>
              <div class="text-muted small">${t('book.weight')}: ${t('book.weight_' + weight)}</div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" id="book-page-editor-done">
              <i class="bi bi-check-lg me-1"></i>${t('book.done')}
            </button>
          </div>

          <div class="book-page-editor-section">
            <label class="book-editor-label">${t('book.template')}</label>
            <div class="book-editor-tpl-row">
              ${tplButtons.map(b => `
                <button type="button"
                  class="book-tpl-btn ${activeTpl === b.id ? 'is-active' : ''}"
                  data-page-editor-tpl="${b.id}"
                  title="${escapeHtml(t('book.tpl_' + b.id.replace('-', '_')))}">
                  <i class="bi bi-${b.icon}"></i>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="book-page-editor-section">
            <label class="book-editor-label" for="book-page-editor-text">${t('book.customText')}</label>
            <textarea class="form-control form-control-sm" id="book-page-editor-text" rows="5" placeholder="${escapeHtml(post.body || t('book.customTextPlaceholder'))}">${escapeHtml(customText != null ? customText : '')}</textarea>
            <div class="form-text">${t('book.customTextHint')}</div>
          </div>

          ${allImages.length ? `
            <div class="book-page-editor-section">
              <label class="book-editor-label">${t('book.images')} (${availableCount}/${allImages.length})</label>
              <div class="book-editor-images">
                ${allImages.map(m => {
                  const isImgExcluded = excludedMedia.has(m.file_path);
                  return `
                    <div class="book-editor-img-thumb ${isImgExcluded ? 'is-excluded' : ''}">
                      <img src="${authUrl(m.file_path)}" alt="">
                      <button type="button"
                        class="book-editor-img-toggle"
                        data-page-editor-img="${escapeHtml(m.file_path)}"
                        title="${isImgExcluded ? escapeHtml(t('book.include')) : escapeHtml(t('book.excludeImage'))}">
                        <i class="bi bi-${isImgExcluded ? 'arrow-counterclockwise' : 'x-lg'}"></i>
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <div class="book-page-editor-section">
            <label class="book-editor-label">${t('book.commentsLabel')}</label>
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" id="book-page-editor-comments" ${overrides.hideComments[post.uuid] ? '' : 'checked'}>
              <label class="form-check-label" for="book-page-editor-comments">${t('book.showCommentsOnPage')}</label>
            </div>
          </div>

          <div class="book-page-editor-section">
            <button type="button" class="btn btn-outline-danger btn-sm w-100" data-page-editor-hide>
              <i class="bi bi-eye-slash me-1"></i>${t('book.excludePage')}
            </button>
          </div>
        </div>
      </div>
    `;
  };

  // Batch editor: shown when the pencil is clicked on a batch page. Focused
  // strictly on editing THIS page — focal points and per-post captions.
  // Structural actions (promote / hide / change weight) live in the Editor
  // view, not here. That way clicking in the batch editor never causes
  // surprising book-wide changes.
  const renderBatchEditView = () => {
    const page = pages[batchEditPageIdx];
    if (!page || page.type !== 'batch') {
      return '<div class="book-empty-state"><p class="text-muted">Batch not found</p></div>';
    }

    return `
      <div class="book-page-editor">
        <div class="book-page-editor-preview">
          <div class="book-page-editor-preview-frame">
            <div class="book-page-editor-preview-scale" id="book-page-editor-scale">
              ${renderPage(page, overrides, bookMeta)}
            </div>
          </div>
          <p class="text-muted small mt-3 text-center">
            <i class="bi bi-info-circle me-1"></i>${t('book.batchEditHint')}
          </p>
        </div>
        <div class="book-page-editor-panel glass-card">
          <div class="book-page-editor-header">
            <div>
              <div class="book-page-editor-title">${t('book.batchPageTitle', { count: page.posts.length })}</div>
              <div class="text-muted small">${t('book.batchPageSubtitle')}</div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" id="book-page-editor-done">
              <i class="bi bi-check-lg me-1"></i>${t('book.done')}
            </button>
          </div>

          <div class="book-page-editor-section">
            <label class="book-editor-label">${t('book.layout')}</label>
            <div class="book-batch-variant-row">
              ${(BATCH_VARIANTS[page.posts.length] || []).map((v) => {
                const activeVariant = (page.key && overrides.batchVariant?.[page.key]) || BATCH_VARIANTS[page.posts.length][0];
                const icon = {
                  'horizontal': 'layout-split',
                  'vertical': 'layout-split rotate-90',
                  'big-left': 'layout-sidebar',
                  'big-top': 'window',
                  'grid': 'grid',
                  'rows': 'list',
                  'columns': 'three-dots-vertical',
                }[v] || 'grid';
                return `
                  <button type="button"
                    class="book-tpl-btn ${activeVariant === v ? 'is-active' : ''}"
                    data-batch-variant="${v}"
                    title="${escapeHtml(t('book.batchVariant_' + v.replace('-', '_')))}">
                    <i class="bi bi-${icon.split(' ')[0]}"></i>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <div class="book-page-editor-section">
            <label class="book-editor-label">${t('book.postsInBatch')}</label>
            <div class="book-batch-edit-list">
              ${page.posts.map((post, slotIdx) => {
                const img = (post.media || []).find(m => (m.file_type || '').startsWith('image/'));
                const displayText = overrides.customText[post.uuid] != null
                  ? overrides.customText[post.uuid]
                  : (post.body || '');
                return `
                  <div class="book-batch-edit-item" data-slot="${slotIdx}">
                    <div class="book-batch-edit-reorder">
                      <button type="button" class="btn btn-link btn-sm p-0"
                        data-batch-move="up" data-batch-slot="${slotIdx}"
                        ${slotIdx === 0 ? 'disabled' : ''}
                        title="${escapeHtml(t('book.moveUp'))}">
                        <i class="bi bi-chevron-up"></i>
                      </button>
                      <button type="button" class="btn btn-link btn-sm p-0"
                        data-batch-move="down" data-batch-slot="${slotIdx}"
                        ${slotIdx === page.posts.length - 1 ? 'disabled' : ''}
                        title="${escapeHtml(t('book.moveDown'))}">
                        <i class="bi bi-chevron-down"></i>
                      </button>
                    </div>
                    ${img ? `<img src="${authUrl(img.thumbnail_path || img.file_path)}" alt="">` : '<div class="book-batch-edit-noimg"></div>'}
                    <div class="book-batch-edit-info">
                      <div class="book-batch-edit-date">${escapeHtml(post.post_date ? formatDateLong(post.post_date) : '')}</div>
                      <div class="book-batch-edit-snippet">${escapeHtml(displayText.slice(0, 60))}</div>
                    </div>
                    <button type="button" class="btn btn-link btn-sm p-1" data-batch-caption="${escapeHtml(post.uuid)}" title="${escapeHtml(t('book.editCaption'))}">
                      <i class="bi bi-chat-left-text"></i>
                    </button>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  };

  // Small modal for editing just the caption text of a single post inside
  // a batch. Keeps the user on the batch page instead of navigating away.
  const showCaptionModal = (post) => {
    const existing = document.getElementById('book-caption-modal');
    if (existing) existing.remove();
    const current = overrides.customText[post.uuid] != null
      ? overrides.customText[post.uuid]
      : (post.body || '');
    const wrap = document.createElement('div');
    wrap.id = 'book-caption-modal';
    wrap.className = 'modal fade';
    wrap.tabIndex = -1;
    wrap.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content glass-card">
          <div class="modal-header">
            <h5 class="modal-title">${t('book.editCaption')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <p class="text-muted small">${escapeHtml(post.post_date ? formatDateLong(post.post_date) : '')}</p>
            <textarea class="form-control" id="caption-text" rows="5" placeholder="${escapeHtml(post.body || '')}">${escapeHtml(current)}</textarea>
            <div class="form-text">${t('book.customTextHint')}</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${t('common.cancel')}</button>
            <button type="button" class="btn btn-primary btn-sm" id="caption-save">${t('common.save')}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    const modal = new window.bootstrap.Modal(wrap);
    modal.show();
    wrap.querySelector('#caption-save').onclick = () => {
      const val = wrap.querySelector('#caption-text').value;
      if (val === '' || val === (post.body || '')) {
        delete overrides.customText[post.uuid];
      } else {
        overrides.customText[post.uuid] = val;
      }
      saveOverrides();
      modal.hide();
      // Refresh only the preview and list
      const scale = document.getElementById('book-page-editor-scale');
      if (scale) {
        const page = pages[batchEditPageIdx];
        if (page) scale.innerHTML = renderPage(page, overrides, bookMeta);
      }
      // Re-render the list snippet
      const item = document.querySelector(`[data-batch-caption="${post.uuid}"]`);
      if (item) {
        const row = item.closest('.book-batch-edit-item');
        const snippetEl = row?.querySelector('.book-batch-edit-snippet');
        if (snippetEl) {
          const displayText = overrides.customText[post.uuid] != null
            ? overrides.customText[post.uuid]
            : (post.body || '');
          snippetEl.textContent = displayText.slice(0, 60);
        }
      }
    };
    wrap.addEventListener('hidden.bs.modal', () => wrap.remove());
  };

  // Grid view: compact overview of the packed pages. Click a thumbnail to
  // jump to that page in flip view. Hover shows a pencil to open the
  // corresponding page editor. Exclusion and weight changes are NOT
  // available here — those belong in the Editor view.
  const renderGridView = () => {
    return `
      <div class="book-grid">
        ${pages.map((p, i) => {
          const postUuid = p.type === 'post' ? p.post.uuid : null;
          const isBatch = p.type === 'batch';
          const clickable = !!(postUuid || isBatch || p.type === 'cover' || p.type === 'chapter' || p.type === 'back');
          return `
            <div class="book-grid-item ${clickable ? 'is-clickable' : ''}" data-grid-idx="${i}">
              <div class="book-grid-thumb">
                ${renderPage(p, overrides, bookMeta)}
              </div>
              ${postUuid ? `
                <button type="button" class="book-grid-edit-btn no-print"
                        data-grid-edit-post="${escapeHtml(postUuid)}"
                        title="${escapeHtml(t('book.editPage'))}">
                  <i class="bi bi-pencil"></i>
                </button>
              ` : ''}
              ${isBatch ? `
                <button type="button" class="book-grid-edit-btn no-print"
                        data-grid-edit-batch="${i}"
                        title="${escapeHtml(t('book.editPage'))}">
                  <i class="bi bi-pencil"></i>
                </button>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  };

  // Editor view: vertical list of every post ordered chronologically, with
  // a side panel to change the post's weight. Weight is the primary lever
  // that controls how much space the post gets in the book and whether it
  // shares a page with other small posts.
  //
  // Performance: a full re-render of all rows is expensive (each row contains
  // a scaled book page). We render each row via renderEditorRow() and the
  // weight handler updates only the changed row + the page-count summary.

  const editorBatchPostUuids = () => {
    const set = new Set();
    for (const p of pages) {
      if (p.type === 'batch') for (const bp of p.posts) set.add(bp.uuid);
    }
    return set;
  };

  const renderEditorRow = (post, idx, batchUuids) => {
    const weight = effectiveWeight(post, overrides);
    const autoW = autoWeightForPost(post);
    const isOverridden = !!overrides.postWeight[post.uuid];
    const isExcluded = weight === 'hidden';
    const inBatch = batchUuids.has(post.uuid);
    const allImages = (post.media || []).filter(m => (m.file_type || '').startsWith('image/'));
    const excludedMedia = new Set(overrides.excludedMedia || []);
    const visibleImages = allImages.filter(m => !excludedMedia.has(m.file_path)).length;
    return `
      <div class="book-editor-row ${isExcluded ? 'is-excluded' : ''} book-editor-weight-${weight}" data-editor-post="${escapeHtml(post.uuid)}">
        <div class="book-editor-preview">
          <div class="book-editor-preview-scale">
            ${renderPage({ type: 'post', post, weight }, overrides, bookMeta)}
          </div>
        </div>
        <div class="book-editor-panel">
          <div class="book-editor-panel-header">
            <span class="book-editor-num">#${idx + 1}</span>
            <span class="book-editor-date">${escapeHtml(post.post_date ? formatDateLong(post.post_date) : '')}</span>
          </div>

          <div class="book-editor-section">
            <label class="book-editor-label">
              ${t('book.weight')}
              ${isOverridden ? `<span class="book-editor-auto-hint">(${t('book.manualOverride')})</span>` : `<span class="book-editor-auto-hint">${t('book.auto')}: ${t('book.weight_' + autoW)}</span>`}
            </label>
            <div class="btn-group book-weight-group w-100" role="group">
              ${['full', 'small', 'hidden'].map(w => `
                <button type="button"
                  class="btn btn-sm btn-outline-secondary ${weight === w ? 'active' : ''}"
                  data-editor-weight="${w}"
                  data-post-uuid="${escapeHtml(post.uuid)}"
                  title="${escapeHtml(t('book.weightDesc_' + w))}">
                  <i class="bi bi-${w === 'full' ? 'file-earmark' : w === 'small' ? 'collection' : 'eye-slash'}"></i>
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
              <label class="book-editor-label">${t('book.images')} (${visibleImages}/${allImages.length})</label>
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
  };

  const renderEditorView = () => {
    if (!data.posts.length) {
      return `<div class="book-editor-empty"><p class="text-muted">${t('book.emptyState')}</p></div>`;
    }
    const batchUuids = editorBatchPostUuids();
    return `
      <div class="book-editor">
        <div class="book-editor-summary">
          <strong id="book-editor-page-count">${pages.length}</strong> ${t('book.pagesTotal')}
          <span class="text-muted small ms-2">${t('book.editorSummaryHint')}</span>
        </div>
        ${data.posts.map((post, i) => renderEditorRow(post, i, batchUuids)).join('')}
      </div>
    `;
  };

  // Update only one editor row in place after a change. Avoids re-rendering
  // hundreds of rows when the user toggles weight on a single post.
  const updateEditorRow = (postUuid) => {
    const row = document.querySelector(`[data-editor-post="${postUuid}"]`);
    if (!row) return;
    const idx = data.posts.findIndex(p => p.uuid === postUuid);
    const post = data.posts[idx];
    const batchUuids = editorBatchPostUuids();
    const tmp = document.createElement('div');
    tmp.innerHTML = renderEditorRow(post, idx, batchUuids).trim();
    const newRow = tmp.firstChild;
    row.replaceWith(newRow);
    attachEditorRowHandlers(newRow);

    // Refresh the live page-count badge.
    const counter = document.getElementById('book-editor-page-count');
    if (counter) counter.textContent = String(pages.length);
  };

  // Attach handlers for the buttons inside a single editor row.
  function attachEditorRowHandlers(row) {
    row.querySelectorAll('[data-editor-weight]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const postUuid = btn.dataset.postUuid;
        overrides.postWeight[postUuid] = btn.dataset.editorWeight;
        saveOverrides();
        rebuildPages({ skipRender: true });
        updateEditorRow(postUuid);
      };
    });
    row.querySelectorAll('[data-editor-reset-weight]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const postUuid = btn.dataset.editorResetWeight;
        delete overrides.postWeight[postUuid];
        saveOverrides();
        rebuildPages({ skipRender: true });
        updateEditorRow(postUuid);
      };
    });
    row.querySelectorAll('[data-editor-img-toggle]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const mediaPath = btn.dataset.editorImgToggle;
        const idx = overrides.excludedMedia.indexOf(mediaPath);
        if (idx >= 0) overrides.excludedMedia.splice(idx, 1);
        else overrides.excludedMedia.push(mediaPath);
        saveOverrides();
        rebuildPages({ skipRender: true });
        const postUuid = row.dataset.editorPost;
        updateEditorRow(postUuid);
      };
    });
  }

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
    writeHashState({ view: 'flip', pageIdx: currentPage });
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

  const rebuildPages = (opts = {}) => {
    pages = buildPages(data, overrides);
    if (currentPage >= pages.length) currentPage = Math.max(0, pages.length - 1);
    if (!opts.skipRender) renderShell();
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
    // Segmented view mode buttons — mutually exclusive. Clicking any exits
    // sub-modes like page-edit or batch-edit.
    document.getElementById('book-btn-flip').onclick = () => {
      gridMode = false; editorMode = false;
      pageEditPostUuid = null; batchEditPageIdx = null;
      writeHashState({ view: 'flip', pageIdx: currentPage });
      renderShell();
    };
    document.getElementById('book-btn-grid').onclick = () => {
      gridMode = true; editorMode = false;
      pageEditPostUuid = null; batchEditPageIdx = null;
      writeHashState({ view: 'grid' });
      renderShell();
    };
    document.getElementById('book-btn-editor').onclick = () => {
      editorMode = true; gridMode = false;
      pageEditPostUuid = null; batchEditPageIdx = null;
      writeHashState({ view: 'editor' });
      renderShell();
    };

    // Batch editor handlers — opened via pencil on a batch page. Focused
    // only on editing THIS page (focal points + captions). Structural
    // changes happen in the Editor view.
    if (batchEditPageIdx != null) {
      const scaleEl = document.getElementById('book-page-editor-scale');
      if (scaleEl) {
        const frame = scaleEl.parentElement;
        const applyScale = () => {
          const w = frame.clientWidth;
          const MM = 96 / 25.4;
          const scale = Math.min(1, w / (200 * MM));
          scaleEl.style.transform = `scale(${scale})`;
          frame.style.height = `${200 * MM * scale}px`;
        };
        applyScale();
        window.requestAnimationFrame(applyScale);

        // Click an image in the batch preview → set focal point.
        scaleEl.querySelectorAll('.book-img img').forEach((img) => {
          img.style.cursor = 'crosshair';
          img.addEventListener('click', (e) => {
            const box = img.closest('[data-media-path]');
            const mediaPath = box?.dataset?.mediaPath;
            if (!mediaPath) return;
            const rect = img.getBoundingClientRect();
            const pctX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            const pctY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
            const value = `${pctX.toFixed(1)}% ${pctY.toFixed(1)}%`;
            overrides.mediaFocal[mediaPath] = value;
            img.style.objectPosition = value;
            saveOverrides();
            e.stopPropagation();
          });
        });
      }

      // Caption edit — opens a compact modal, keeps user on the batch page.
      document.querySelectorAll('[data-batch-caption]').forEach((btn) => {
        btn.onclick = () => {
          const postUuid = btn.dataset.batchCaption;
          const post = data.posts.find(p => p.uuid === postUuid);
          if (post) showCaptionModal(post);
        };
      });

      // Layout variant picker
      const currentBatch = pages[batchEditPageIdx];
      const currentBatchKey = currentBatch?.key;
      document.querySelectorAll('[data-batch-variant]').forEach((btn) => {
        btn.onclick = () => {
          if (!currentBatchKey) return;
          overrides.batchVariant[currentBatchKey] = btn.dataset.batchVariant;
          saveOverrides();
          rebuildPages({ skipRender: true });
          renderShell();
        };
      });

      // Move a post up or down within the batch
      document.querySelectorAll('[data-batch-move]').forEach((btn) => {
        btn.onclick = () => {
          if (!currentBatchKey) return;
          const dir = btn.dataset.batchMove;
          const slotIdx = parseInt(btn.dataset.batchSlot, 10);
          const currentOrder = [...currentBatch.posts.map(p => p.uuid)];
          const targetIdx = dir === 'up' ? slotIdx - 1 : slotIdx + 1;
          if (targetIdx < 0 || targetIdx >= currentOrder.length) return;
          [currentOrder[slotIdx], currentOrder[targetIdx]] = [currentOrder[targetIdx], currentOrder[slotIdx]];
          overrides.batchOrder[currentBatchKey] = currentOrder;
          saveOverrides();
          rebuildPages({ skipRender: true });
          renderShell();
        };
      });

      document.getElementById('book-page-editor-done').onclick = () => {
        batchEditPageIdx = null;
        renderShell();
      };
      return;
    }

    // Page editor handlers — the dedicated per-page edit view.
    if (pageEditPostUuid) {
      const scaleEl = document.getElementById('book-page-editor-scale');
      // Compute preview scale to fit available width.
      if (scaleEl) {
        const frame = scaleEl.parentElement;
        const applyScale = () => {
          const w = frame.clientWidth;
          const MM = 96 / 25.4;
          const scale = Math.min(1, w / (200 * MM));
          scaleEl.style.transform = `scale(${scale})`;
          frame.style.height = `${200 * MM * scale}px`;
        };
        applyScale();
        window.requestAnimationFrame(applyScale);
      }

      // Click image in preview → set focal point
      const previewImgs = document.querySelectorAll('#book-page-editor-scale .book-img img');
      previewImgs.forEach((img) => {
        img.style.cursor = 'crosshair';
        img.addEventListener('click', (e) => {
          const box = img.closest('[data-media-path]');
          const mediaPath = box?.dataset?.mediaPath;
          if (!mediaPath) return;
          const rect = img.getBoundingClientRect();
          const pctX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
          const pctY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
          const value = `${pctX.toFixed(1)}% ${pctY.toFixed(1)}%`;
          overrides.mediaFocal[mediaPath] = value;
          img.style.objectPosition = value;
          saveOverrides();
          e.stopPropagation();
        });
      });

      // Template buttons
      document.querySelectorAll('[data-page-editor-tpl]').forEach((btn) => {
        btn.onclick = () => {
          const tpl = btn.dataset.pageEditorTpl;
          if (tpl === 'auto') delete overrides.templates[pageEditPostUuid];
          else overrides.templates[pageEditPostUuid] = tpl;
          saveOverrides();
          rebuildPages();
          renderShell();
        };
      });

      // Custom text with debounced auto-save
      const textEl = document.getElementById('book-page-editor-text');
      if (textEl) {
        let textTimer = null;
        textEl.addEventListener('input', () => {
          if (textTimer) clearTimeout(textTimer);
          textTimer = setTimeout(() => {
            const val = textEl.value;
            if (val === '' || val === (data.posts.find(p => p.uuid === pageEditPostUuid)?.body || '')) {
              delete overrides.customText[pageEditPostUuid];
            } else {
              overrides.customText[pageEditPostUuid] = val;
            }
            saveOverrides();
            // Re-render just the preview inside the editor without losing
            // textarea focus.
            const scale = document.getElementById('book-page-editor-scale');
            if (scale) {
              const post = data.posts.find(p => p.uuid === pageEditPostUuid);
              const weight = effectiveWeight(post, overrides);
              scale.innerHTML = renderPage({ type: 'post', post, weight }, overrides, bookMeta);
            }
          }, 400);
        });
      }

      // Per-image exclude toggles
      document.querySelectorAll('[data-page-editor-img]').forEach((btn) => {
        btn.onclick = () => {
          const mediaPath = btn.dataset.pageEditorImg;
          const idx = overrides.excludedMedia.indexOf(mediaPath);
          if (idx >= 0) overrides.excludedMedia.splice(idx, 1);
          else overrides.excludedMedia.push(mediaPath);
          saveOverrides();
          renderShell();
        };
      });

      // Comment visibility toggle
      const commentsToggle = document.getElementById('book-page-editor-comments');
      if (commentsToggle) {
        commentsToggle.onchange = () => {
          if (commentsToggle.checked) {
            delete overrides.hideComments[pageEditPostUuid];
          } else {
            overrides.hideComments[pageEditPostUuid] = true;
          }
          saveOverrides();
          // Re-render preview only
          const scale = document.getElementById('book-page-editor-scale');
          if (scale) {
            const post = data.posts.find(p => p.uuid === pageEditPostUuid);
            const weight = effectiveWeight(post, overrides);
            scale.innerHTML = renderPage({ type: 'post', post, weight }, overrides, bookMeta);
          }
        };
      }

      // Hide page
      const hideBtn = document.querySelector('[data-page-editor-hide]');
      if (hideBtn) {
        hideBtn.onclick = () => {
          overrides.postWeight[pageEditPostUuid] = 'hidden';
          saveOverrides();
          pageEditPostUuid = null;
          rebuildPages();
          renderShell();
        };
      }

      // Done button
      document.getElementById('book-page-editor-done').onclick = () => {
        pageEditPostUuid = null;
        rebuildPages();
        renderShell();
      };

      return; // Skip other handlers
    }

    if (editorMode) {
      // Attach handlers per row — clicking a weight button only re-renders
      // that row, not the whole editor (which would be very slow for books
      // with hundreds of posts).
      document.querySelectorAll('.book-editor-row').forEach(attachEditorRowHandlers);
    } else if (!gridMode) {
      document.getElementById('book-nav-prev').onclick = prev;
      document.getElementById('book-nav-next').onclick = next;
      // Pencil on a post page → dedicated per-page editor
      document.querySelectorAll('[data-page-edit-post]').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          pageEditPostUuid = btn.dataset.pageEditPost;
          renderShell();
        };
      });
      // Pencil on a batch page → batch editor
      document.querySelectorAll('[data-page-edit-batch]').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          batchEditPageIdx = parseInt(btn.dataset.pageEditBatch, 10);
          renderShell();
        };
      });
    } else {
      // Grid interactions: click to jump to flip view, pencil to edit
      const viewer = document.getElementById('book-viewer');
      // Pencil buttons — open the matching editor, don't bubble to the
      // jump-to-page click on the parent item.
      viewer.querySelectorAll('[data-grid-edit-post]').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          pageEditPostUuid = btn.dataset.gridEditPost;
          gridMode = false;
          renderShell();
        };
      });
      viewer.querySelectorAll('[data-grid-edit-batch]').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          batchEditPageIdx = parseInt(btn.dataset.gridEditBatch, 10);
          gridMode = false;
          renderShell();
        };
      });
      // Clicking the thumbnail itself jumps to that page in flip view.
      viewer.querySelectorAll('[data-grid-idx]').forEach((item) => {
        item.onclick = () => {
          const idx = parseInt(item.dataset.gridIdx, 10);
          gridMode = false;
          writeHashState({ view: 'flip', pageIdx: idx });
          renderShell();
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
            customText: overrides.customText,
            hideComments: overrides.hideComments,
            batchVariant: overrides.batchVariant,
            batchOrder: overrides.batchOrder,
          },
        };
        api.patch(`/books/${bookUuid}`, { layout_options: merged }).catch(() => {});
      }
    }
  });
  observer.observe(content, { childList: true });

  renderShell();
}
