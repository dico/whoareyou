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
import { showMediaPicker } from '../components/media-picker.js';

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

// Score formula and threshold MUST match the backend (routes/books.js
// scorePostRow / FULL_PAGE_THRESHOLD). Default is "small" — only posts with
// genuine engagement or substantial body get a full page. Having an image
// is no longer a poenggivende factor; an unloved photo with a 30-char
// caption belongs on a shared page, not its own.
const FULL_PAGE_THRESHOLD = 18;

function scorePost(post) {
  const likes = (post.reactions || []).length;
  const comments = (post.comments || []).length;
  const bodyLen = (post.body || '').length;
  return likes * 4 + comments * 6 + bodyLen / 40;
}

function autoWeightForPost(post) {
  return scorePost(post) >= FULL_PAGE_THRESHOLD ? 'full' : 'small';
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
//
// Chapter grouping modes:
//   'year'    — chapter divider at every year change
//   'contact' — split posts into per-contact sections, each starting with
//               a chapter divider showing the contact's name. Within a
//               section, posts are still chronological. Only useful for
//               multi-contact books.
//   'none'    — no chapter dividers
function buildPages(bookData, overrides) {
  const { book, posts, contacts } = bookData;
  const layout = book.layout_options || {};

  const pages = [];
  pages.push({ type: 'cover', book });

  const flushBatch = (batch) => {
    while (batch.length) {
      const slice = batch.splice(0, BATCH_PAGE_CAPACITY);
      if (slice.length === 1) {
        pages.push({ type: 'post', post: slice[0], weight: 'small-solo' });
      } else {
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

  // Process a sequence of posts (already filtered) producing pages with
  // year-chapter dividers (if requested) and weight-based packing.
  const processSequence = (sequence, withYearDivider) => {
    let currentYear = null;
    let batch = [];
    for (const post of sequence) {
      const weight = effectiveWeight(post, overrides);
      if (weight === 'hidden') continue;
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
        flushBatch(batch);
        pages.push({ type: 'post', post, weight });
      }
    }
    flushBatch(batch);
  };

  const grouping = layout.chapterGrouping || 'year';

  if (grouping === 'contact' && contacts && contacts.length > 1) {
    // Per-contact sections. Each contact gets a chapter divider with
    // their name; their posts (subject only — tagged appearances are
    // assumed to be reachable in another contact's section) are listed
    // chronologically. Posts where the contact is not the subject are
    // skipped to avoid duplication.
    for (const c of contacts) {
      const contactPosts = posts.filter(p => p.contact?.uuid === c.uuid);
      if (!contactPosts.length) continue;
      pages.push({
        type: 'chapter',
        year: [c.first_name, c.last_name].filter(Boolean).join(' '),
      });
      processSequence(contactPosts, false);
    }
  } else {
    processSequence(posts, grouping === 'year');
  }

  pages.push({ type: 'back', book });
  return pages;
}

function renderCoverPage(book) {
  const from = book.date_from ? new Date(book.date_from).getUTCFullYear() : null;
  const to = book.date_to ? new Date(book.date_to).getUTCFullYear() : null;
  const dateRange = from && to ? (from === to ? `${from}` : `${from} – ${to}`) : (from || to || '');
  const theme = book.layout_options?.theme || {};
  const coverImage = theme.coverImage;
  const titlePos = theme.titlePosition || 'center';
  // Inline style for the background — either a custom image, a solid
  // color from the theme, or the default gradient.
  let bgStyle = '';
  if (coverImage) {
    bgStyle = `background-image: url('${authUrl(coverImage)}'); background-size: cover; background-position: center;`;
  } else if (theme.coverBg) {
    bgStyle = `background: ${theme.coverBg};`;
  }
  return `
    <div class="book-page book-page-cover book-cover-pos-${titlePos}" style="${bgStyle}">
      ${coverImage ? '<div class="book-cover-overlay"></div>' : ''}
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

function renderBackPage(book) {
  const customBack = book?.layout_options?.theme?.backText;
  const text = customBack && customBack.trim()
    ? customBack
    : t('book.backPageText');
  return `
    <div class="book-page book-page-back">
      <div class="book-back-inner">
        <p class="book-back-text">${escapeHtml(text)}</p>
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

// Available physical page sizes. Width and height in millimeters. Each
// entry tags which print service it matches so the wizard can group them
// in the dropdown. Templates are designed around a square aspect ratio
// so portrait formats work but may look slightly different.
const PAGE_SIZES = {
  // Bokfabrikken (Norwegian — much cheaper for Norwegian customers)
  'bf-130x210': { label: '130×210 mm', w: 130, h: 210, group: 'bokfabrikken' },
  'bf-a5':      { label: 'A5 (148×210 mm)', w: 148, h: 210, group: 'bokfabrikken' },
  'bf-170x240': { label: '170×240 mm', w: 170, h: 240, group: 'bokfabrikken' },
  'bf-a4':      { label: 'A4 (210×297 mm)', w: 210, h: 297, group: 'bokfabrikken' },
  // Blurb ImageWrap Hardcover
  'mini-square':        { label: '5×5" — Mini Square (13×13 cm)',          w: 130, h: 130, group: 'blurb' },
  'small-square':       { label: '7×7" — Small Square (18×18 cm)',         w: 180, h: 180, group: 'blurb' },
  'large-square':       { label: '12×12" — Large Square (30×30 cm)',       w: 300, h: 300, group: 'blurb' },
  'standard-portrait':  { label: '8×10" — Standard Portrait (20×25 cm)',   w: 200, h: 250, group: 'blurb' },
  'standard-landscape': { label: '10×8" — Standard Landscape (25×20 cm)',  w: 250, h: 200, group: 'blurb' },
  'large-landscape':    { label: '13×11" — Large Landscape (33×28 cm)',    w: 330, h: 280, group: 'blurb' },
  // Legacy
  'square-200':         { label: '200 mm (legacy)', w: 200, h: 200, group: 'legacy' },
};
const DEFAULT_PAGE_SIZE = 'bf-170x240';
function safePageSize(value) {
  return PAGE_SIZES[value] ? value : 'square-200';
}

// Build a grouped <select> options HTML string for the page size dropdown.
// Used by both the create wizard and the edit-info modal so the option
// list is defined in one place.
export function pageSizeOptionsHtml(currentValue) {
  const groups = {
    bokfabrikken: 'Bokfabrikken (Norway)',
    blurb: 'Blurb ImageWrap Hardcover',
    legacy: 'Legacy',
  };
  const grouped = {};
  for (const [id, ps] of Object.entries(PAGE_SIZES)) {
    if (!grouped[ps.group]) grouped[ps.group] = [];
    grouped[ps.group].push({ id, label: ps.label });
  }
  return Object.entries(groups).map(([key, label]) => {
    if (!grouped[key]) return '';
    return `
      <optgroup label="${label}">
        ${grouped[key].map(o => `
          <option value="${o.id}"${currentValue === o.id ? ' selected' : ''}>${o.label}</option>
        `).join('')}
      </optgroup>
    `;
  }).join('');
}
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
  const isHighImpact = score >= 40;
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

// Pick the smallest acceptable source URL for an image, falling back to the
// full file when no thumbnail exists. The flip view uses thumbnails by
// default to keep iOS PWA memory bounded — full-quality is only used for
// cover backgrounds and full-bleed templates.
function imageSrc(media, { useFull = false } = {}) {
  if (useFull || !media.thumbnail_path) return authUrl(media.file_path);
  return authUrl(media.thumbnail_path);
}

function safeRotation(value) {
  const n = Number(value);
  return (n === 90 || n === 180 || n === 270) ? n : 0;
}

function rotationStyle(rot) {
  return rot ? `transform:rotate(${rot}deg);` : '';
}

function imageTag(media, overrides, extraClass = '', opts = {}) {
  const focal = safeFocal(overrides.mediaFocal?.[media.file_path]);
  const rot = safeRotation(overrides.mediaRotation?.[media.file_path]);
  const inline = [
    focal ? `object-position:${focal}` : '',
    rotationStyle(rot),
  ].filter(Boolean).join('');
  const style = inline ? ` style="${inline}"` : '';
  return `<img src="${imageSrc(media, opts)}" alt="" loading="lazy"
    data-media-path="${escapeHtml(media.file_path)}"
    class="${extraClass}"${style}>`;
}

function imageBox(media, overrides, extraClass = '', opts = {}) {
  if (!media) return `<div class="book-img book-img-empty ${extraClass}"></div>`;
  const focal = safeFocal(overrides.mediaFocal?.[media.file_path]);
  const rot = safeRotation(overrides.mediaRotation?.[media.file_path]);
  const inline = [
    focal ? `object-position:${focal}` : '',
    rotationStyle(rot),
  ].filter(Boolean).join('');
  const style = inline ? ` style="${inline}"` : '';
  return `
    <div class="book-img ${extraClass}" data-media-path="${escapeHtml(media.file_path)}">
      <img src="${imageSrc(media, opts)}" alt="" loading="lazy"${style}>
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
      ${imageBox(ctx.images[0], ctx.overrides, 'book-tpl-bleed', { useFull: true })}
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
    const reactionCount = (post.reactions || []).length;
    const commentCount = (post.comments || []).length;
    return `
      <div class="book-batch-cell" data-post-uuid="${escapeHtml(post.uuid)}">
        ${imageBox(primary, overrides, 'book-batch-img')}
        ${(reactionCount || commentCount) ? `
          <div class="book-batch-engagement">
            ${reactionCount ? `<span class="book-batch-likes">❤ ${reactionCount}</span>` : ''}
            ${commentCount ? `<span class="book-batch-comments">💬 ${commentCount}</span>` : ''}
          </div>
        ` : ''}
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
    case 'back': return renderBackPage(page.book);
    case 'post': return renderPostPage(page.post, overrides, page.weight, bookMeta);
    case 'batch': return renderBatchPage(page.posts, overrides, page.key);
    default: return '<div class="book-page"></div>';
  }
}

// Page number element rendered on top of post/batch pages when the book
// has page numbers enabled. Cover, chapter dividers and back cover never
// show a number. Numbering starts at 1 on the first numbered page.
function pageNumberHtml(pageIdx, pages, book) {
  const showNumbers = book.layout_options?.showPageNumbers !== false;
  if (!showNumbers) return '';
  const page = pages[pageIdx];
  if (!page || (page.type !== 'post' && page.type !== 'batch')) return '';
  // Compute the visible number: count post/batch pages up to (and including) this index.
  let n = 0;
  for (let i = 0; i <= pageIdx; i++) {
    const p = pages[i];
    if (p.type === 'post' || p.type === 'batch') n += 1;
  }
  // Alternate left/right per book convention (odd = right, even = left).
  const side = n % 2 === 1 ? 'right' : 'left';
  return `<div class="book-page-number book-page-number-${side}">${n}</div>`;
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
                <option value="contact"${layout.chapterGrouping === 'contact' ? ' selected' : ''}>${t('book.chapterPerContact')}</option>
                <option value="none"${layout.chapterGrouping === 'none' ? ' selected' : ''}>${t('book.chapterNone')}</option>
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label">${t('book.fieldPageSize')}</label>
              <select class="form-select" id="edit-page-size">
                ${pageSizeOptionsHtml(layout.pageSize || 'bf-170x240')}
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
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="edit-page-numbers" ${layout.showPageNumbers !== false ? 'checked' : ''}>
              <label class="form-check-label" for="edit-page-numbers">${t('book.showPageNumbers')}</label>
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
        showPageNumbers: wrap.querySelector('#edit-page-numbers').checked,
        pageSize: wrap.querySelector('#edit-page-size').value,
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
  // Skeleton loading state — gives feedback while large books fetch their
  // /data response (which can take a few seconds for 1000+ post books).
  content.innerHTML = `
    <div class="book-skeleton">
      <div class="book-skeleton-toolbar"></div>
      <div class="book-skeleton-stage">
        <div class="book-skeleton-page">
          <div class="book-skeleton-shimmer"></div>
        </div>
      </div>
      <p class="book-skeleton-label">${t('book.loading')}</p>
    </div>
  `;

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
    // Per-image rotation in degrees (90/180/270). Allows correcting photos
    // that were uploaded sideways.
    mediaRotation: { ...(data.book.layout_options?.overrides?.mediaRotation || {}) },
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
            mediaRotation: overrides.mediaRotation,
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

  // View state. gridMode is the only alternative to flip view. spreadMode is
  // a sub-mode of flip view. pageEditPostUuid, when set, takes over the
  // whole stage with a dedicated single-page editor.
  let spreadMode = localStorage.getItem('bookSpreadMode') === '1';
  let gridMode = false;
  let pageEditPostUuid = null;
  let batchEditPageIdx = null;
  let coverEditMode = false;
  let regenerateInfo = null; // { added, removed, total } when diff exists
  // Tracks where the active sub-editor was opened from so the back button
  // returns the user to the right view (grid vs flip).
  let subEditorOrigin = null; // 'grid' | 'flip' | null

  // Book theme (colors + fonts + cover image + title position) is stored
  // on layout_options.theme. Applied via CSS custom properties on the
  // .book-viewer element, scoped to the book only.
  const themeVarsStyle = () => {
    const layout = data.book.layout_options || {};
    const theme = layout.theme || {};
    const parts = [];
    if (theme.accent) parts.push(`--book-accent: ${theme.accent}`);
    if (theme.fontFamily) parts.push(`--book-font: ${theme.fontFamily}`);
    const sizeScale = { small: 0.88, normal: 1, large: 1.12 };
    parts.push(`--book-text-scale: ${sizeScale[theme.fontSize] || 1}`);
    // Page dimensions from the chosen page size.
    const ps = PAGE_SIZES[safePageSize(layout.pageSize)];
    parts.push(`--book-page-width: ${ps.w}mm`);
    parts.push(`--book-page-height: ${ps.h}mm`);

    // Grid-thumbnail dimensions: derived from the actual page aspect so a
    // portrait page doesn't end up as a portrait rectangle inside a square
    // container (which left a white margin on the right). Long edge is
    // capped at THUMB_LONG, short edge follows the aspect ratio.
    const PX_PER_MM = 96 / 25.4;
    const THUMB_LONG = 220;
    const pageWPx = ps.w * PX_PER_MM;
    const pageHPx = ps.h * PX_PER_MM;
    const longEdge = Math.max(pageWPx, pageHPx);
    const thumbScale = THUMB_LONG / longEdge;
    parts.push(`--book-thumb-w: ${(pageWPx * thumbScale).toFixed(2)}px`);
    parts.push(`--book-thumb-h: ${(pageHPx * thumbScale).toFixed(2)}px`);
    parts.push(`--book-thumb-scale: ${thumbScale.toFixed(4)}`);
    return parts.join('; ');
  };

  // Restore view mode from URL hash so refresh keeps the user where they were.
  const initialState = readHashState();
  if (initialState.view === 'grid') gridMode = true;

  let pages = buildPages(data, overrides);
  let currentPage = Math.min(initialState.page, pages.length - 1);
  if (currentPage < 0) currentPage = 0;

  const renderShell = () => {
    content.innerHTML = `
      <div class="book-viewer${gridMode ? ' is-grid' : ''}${(pageEditPostUuid || batchEditPageIdx != null || coverEditMode) ? ' is-page-edit' : ''}" id="book-viewer" style="${themeVarsStyle()}">
        <div class="book-toolbar no-print">
          <div class="book-toolbar-inner">
            <button class="btn btn-outline-secondary btn-sm" id="book-btn-back">
              <i class="bi bi-arrow-left"></i> ${t('common.back')}
            </button>
            <div class="book-toolbar-center">
              <div class="btn-group book-viewmode-group" role="group" aria-label="${t('book.viewMode')}">
                <button class="btn btn-outline-secondary btn-sm ${!gridMode ? 'active' : ''}" id="book-btn-flip" title="${t('book.toggleFlip')}">
                  <i class="bi bi-book"></i>
                </button>
                <button class="btn btn-outline-secondary btn-sm ${gridMode ? 'active' : ''}" id="book-btn-grid" title="${t('book.toggleGrid')}">
                  <i class="bi bi-grid-3x3-gap"></i>
                </button>
              </div>
              ${!gridMode ? `
                <button class="btn btn-outline-secondary btn-sm ms-2 ${spreadMode ? 'active' : ''}" id="book-btn-spread" title="${t('book.toggleSpread')}">
                  <i class="bi bi-book-half"></i>
                </button>
              ` : ''}
              <span class="book-page-indicator ms-3" id="book-page-indicator"></span>
              <span class="book-save-status text-muted small ms-2" id="book-save-status"></span>
            </div>
            <div class="book-toolbar-actions">
              ${regenerateInfo && (regenerateInfo.added || regenerateInfo.removed) ? `
                <button class="btn btn-warning btn-sm me-2" id="book-btn-regen-badge" title="${t('book.regenerateAvailable')}">
                  <i class="bi bi-arrow-clockwise me-1"></i>
                  ${regenerateInfo.added ? `+${regenerateInfo.added}` : ''}${regenerateInfo.removed ? ` −${regenerateInfo.removed}` : ''}
                </button>
              ` : ''}
              <div class="dropdown">
                <button class="btn btn-link btn-sm" data-bs-toggle="dropdown" aria-expanded="false">
                  <i class="bi bi-three-dots"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end glass-dropdown">
                  <li><button class="dropdown-item" id="book-btn-editmeta"><i class="bi bi-pencil me-2"></i>${t('book.editInfo')}</button></li>
                  <li><button class="dropdown-item" id="book-btn-regenerate"><i class="bi bi-arrow-clockwise me-2"></i>${t('book.regenerate')}</button></li>
                  <li><button class="dropdown-item" id="book-btn-print"><i class="bi bi-printer me-2"></i>${t('book.printPdf')}</button></li>
                  <li><hr class="dropdown-divider"></li>
                  <li><button class="dropdown-item text-danger" id="book-btn-delete"><i class="bi bi-trash3 me-2"></i>${t('book.delete')}</button></li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        ${coverEditMode ? renderCoverEditView() : (batchEditPageIdx != null ? renderBatchEditView() : (pageEditPostUuid ? renderPageEditView() : (gridMode ? renderGridView() : renderFlipView())))}

        ${data.posts.length === 0 ? `<div class="book-empty-state no-print"><p class="text-muted">${t('book.emptyState')}</p></div>` : ''}
      </div>
    `;
    attachShellHandlers();
    if (!gridMode) {
      computeScale();
      updateFlipView();
    }
  };

  // Wire up the per-page pencil buttons (post / batch / cover edit). Called
  // both from attachShellHandlers on a full render and from remountFlipWindow
  // every time the visible window of pages changes.
  function attachFlipPageHandlers() {
    document.querySelectorAll('[data-page-edit-post]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        pageEditPostUuid = btn.dataset.pageEditPost;
        subEditorOrigin = 'flip';
        renderShell();
      };
    });
    document.querySelectorAll('[data-page-edit-batch]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        batchEditPageIdx = parseInt(btn.dataset.pageEditBatch, 10);
        subEditorOrigin = 'flip';
        renderShell();
      };
    });
    document.querySelectorAll('[data-page-edit-cover]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        coverEditMode = true;
        subEditorOrigin = 'flip';
        renderShell();
      };
    });
  }

  // Mount only a window of pages around the current page. This is critical
  // on iOS Safari PWA: mounting all pages at once with full-resolution
  // images caused the process to be killed once decoded image memory
  // exceeded ~250MB. With a small window we keep peak memory bounded.
  const FLIP_WINDOW = 2;
  const inFlipWindow = (i) => Math.abs(i - currentPage) <= FLIP_WINDOW
    || (spreadMode && Math.abs(i - currentPage) <= FLIP_WINDOW + 1);

  const renderPageWrap = (p, i) => `
    <div class="book-page-wrap" data-idx="${i}">
      ${renderPage(p, overrides, bookMeta)}
      ${pageNumberHtml(i, pages, data.book)}
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
      ${p.type === 'cover' ? `
        <button type="button" class="book-page-edit-btn no-print" data-page-edit-cover="1" title="${escapeHtml(t('book.editCover'))}">
          <i class="bi bi-pencil"></i>
        </button>
      ` : ''}
    </div>
  `;

  const renderFlipView = () => `
    <div class="book-stage" id="book-stage">
      <button class="book-nav book-nav-prev no-print" id="book-nav-prev" aria-label="prev">
        <i class="bi bi-chevron-left"></i>
      </button>
      <div class="book-pages-frame ${spreadMode ? 'is-spread' : ''}" id="book-pages-frame">
        <div class="book-pages ${spreadMode ? 'is-spread' : ''}" id="book-pages" data-flip-dir="next">
          ${pages.map((p, i) => inFlipWindow(i) ? renderPageWrap(p, i) : '').join('')}
        </div>
      </div>
      <button class="book-nav book-nav-next no-print" id="book-nav-next" aria-label="next">
        <i class="bi bi-chevron-right"></i>
      </button>
    </div>
  `;

  // Re-render only the inner book-pages list to mount/unmount the window
  // around currentPage. Cheaper than re-rendering the whole shell, and
  // preserves the toolbar and stage chrome.
  const remountFlipWindow = () => {
    const pagesEl = document.getElementById('book-pages');
    if (!pagesEl) return;
    pagesEl.innerHTML = pages.map((p, i) => inFlipWindow(i) ? renderPageWrap(p, i) : '').join('');
    attachFlipPageHandlers();
  };

  // Dedicated page editor — takes over the stage with a large preview on
  // the left and a control panel on the right. All per-page edits happen
  // here (focal point, template, custom text, image exclusion).
  const renderPageEditView = () => {
    const post = data.posts.find(p => p.uuid === pageEditPostUuid);
    if (!post) return '<div class="book-empty-state"><p class="text-muted">Post not found</p></div>';

    const weight = effectiveWeight(post, overrides);
    const isOverridden = !!overrides.postWeight[post.uuid];
    const autoW = autoWeightForPost(post);
    const activeTpl = safeTemplate(overrides.templates[post.uuid]) || 'auto';
    const customText = overrides.customText[post.uuid];
    const allImages = (post.media || []).filter(m => (m.file_type || '').startsWith('image/'));
    const excludedMedia = new Set(overrides.excludedMedia || []);

    // Find the post's actual entry in pages[] so we render it the same way
    // it appears in the book — including the `small-solo` weight which is
    // assigned in flushBatch when a small post ends up alone on its page.
    // Without this, the preview shows a generic 'small' rendering that
    // doesn't reflect what the user will actually see in the final book.
    const actualPage = pages.find(p => p.type === 'post' && p.post && p.post.uuid === post.uuid)
      || { type: 'post', post, weight };
    const isSoloSmall = actualPage.weight === 'small-solo';

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
              ${renderPage(actualPage, overrides, bookMeta)}
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
              <div class="text-muted small">
                ${t('book.weight')}: ${t('book.weight_' + weight)}
                ${isSoloSmall ? ` <span class="text-warning">· ${t('book.soloSmallNote')}</span>` : ''}
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" id="book-page-editor-done">
              <i class="bi bi-check-lg me-1"></i>${t('book.done')}
            </button>
          </div>

          <div class="book-page-editor-section">
            <label class="book-editor-label">
              ${t('book.weight')}
              ${isOverridden
                ? `<span class="book-editor-auto-hint">(${t('book.manualOverride')})</span>`
                : `<span class="book-editor-auto-hint">${t('book.auto')}: ${t('book.weight_' + autoW)}</span>`}
            </label>
            <div class="btn-group book-weight-group w-100" role="group">
              ${['full', 'small', 'hidden'].map(w => `
                <button type="button"
                  class="btn btn-sm btn-outline-secondary ${weight === w ? 'active' : ''}"
                  data-page-editor-weight="${w}"
                  title="${escapeHtml(t('book.weightDesc_' + w))}">
                  <i class="bi bi-${w === 'full' ? 'file-earmark' : w === 'small' ? 'collection' : 'eye-slash'}"></i>
                  ${t('book.weight_' + w)}
                </button>
              `).join('')}
            </div>
            ${isOverridden ? `
              <button type="button" class="btn btn-link btn-sm p-0 mt-1" data-page-editor-reset-weight>
                <i class="bi bi-arrow-counterclockwise me-1"></i>${t('book.resetToAuto')}
              </button>
            ` : ''}
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

          ${allImages.length === 1 ? `
            <div class="book-page-editor-section">
              <button type="button" class="btn btn-outline-secondary btn-sm w-100"
                data-page-editor-rotate="${escapeHtml(allImages[0].file_path)}">
                <i class="bi bi-arrow-clockwise me-1"></i>${t('book.rotateImage')}
              </button>
            </div>
          ` : ''}

          ${allImages.length > 1 ? `
            <div class="book-page-editor-section">
              <label class="book-editor-label">${t('book.images')} (${availableCount}/${allImages.length})</label>
              <div class="book-editor-images">
                ${allImages.map(m => {
                  const isImgExcluded = excludedMedia.has(m.file_path);
                  const rot = safeRotation(overrides.mediaRotation?.[m.file_path]);
                  return `
                    <div class="book-editor-img-thumb ${isImgExcluded ? 'is-excluded' : ''}" data-img-thumb-path="${escapeHtml(m.file_path)}">
                      <img src="${authUrl(m.thumbnail_path || m.file_path)}" alt="" style="${rotationStyle(rot)}">
                      <button type="button"
                        class="book-editor-img-rotate"
                        data-page-editor-rotate="${escapeHtml(m.file_path)}"
                        title="${escapeHtml(t('book.rotateImage'))}">
                        <i class="bi bi-arrow-clockwise"></i>
                      </button>
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

  // Cover editor: dedicated view for customizing the book's front cover
  // (background image or color, title position, accent color, font).
  const renderCoverEditView = () => {
    const theme = data.book.layout_options?.theme || {};
    const titlePos = theme.titlePosition || 'center';
    const accent = theme.accent || '#c88b3a';
    const coverBg = theme.coverBg || '';
    const fontFamily = theme.fontFamily || '';
    const hasImage = !!theme.coverImage;

    const FONTS = [
      { id: '', label: 'Georgia (default)' },
      { id: "'Palatino Linotype', Palatino, serif", label: 'Palatino' },
      { id: 'Garamond, serif', label: 'Garamond' },
      { id: 'Baskerville, serif', label: 'Baskerville' },
      { id: "'Helvetica Neue', Helvetica, Arial, sans-serif", label: 'Helvetica' },
      { id: "Inter, system-ui, sans-serif", label: 'Inter' },
    ];

    const POSITIONS = [
      { id: 'center', icon: 'align-center' },
      { id: 'top', icon: 'align-top' },
      { id: 'bottom', icon: 'align-bottom' },
      { id: 'bottom-left', icon: 'layout-text-window-reverse' },
    ];

    return `
      <div class="book-page-editor">
        <div class="book-page-editor-preview">
          <div class="book-page-editor-preview-frame">
            <div class="book-page-editor-preview-scale" id="book-page-editor-scale">
              ${renderCoverPage(data.book)}
            </div>
          </div>
          <p class="text-muted small mt-3 text-center">
            <i class="bi bi-info-circle me-1"></i>${t('book.coverEditHint')}
          </p>
        </div>
        <div class="book-page-editor-panel glass-card">
          <div class="book-page-editor-header">
            <div>
              <div class="book-page-editor-title">${t('book.editCover')}</div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" id="book-page-editor-done">
              <i class="bi bi-check-lg me-1"></i>${t('book.done')}
            </button>
          </div>

          <div class="book-page-editor-section">
            <label class="book-editor-label">${t('book.fieldTitle')}</label>
            <input type="text" class="form-control form-control-sm" id="cover-edit-title"
              value="${escapeHtml(data.book.title || '')}" maxlength="255">
          </div>

          <div class="book-page-editor-section">
            <label class="book-editor-label">${t('book.fieldSubtitle')}</label>
            <input type="text" class="form-control form-control-sm" id="cover-edit-subtitle"
              value="${escapeHtml(data.book.subtitle || '')}" maxlength="255">
          </div>

          <div class="book-page-editor-section">
            <label class="book-editor-label">${t('book.coverBackground')}</label>
            <div class="d-flex gap-2 flex-wrap">
              <button type="button" class="btn btn-primary btn-sm" id="cover-pick-from-book">
                <i class="bi bi-images me-1"></i>${t('book.pickFromBook')}
              </button>
              <label class="btn btn-outline-secondary btn-sm mb-0">
                <i class="bi bi-upload me-1"></i>${t('book.uploadImage')}
                <input type="file" id="cover-upload" accept="image/*" class="d-none">
              </label>
              ${hasImage ? `
                <button type="button" class="btn btn-outline-danger btn-sm" id="cover-remove-image">
                  <i class="bi bi-trash3 me-1"></i>${t('book.removeImage')}
                </button>
              ` : ''}
            </div>
            <label class="book-editor-label mt-2">${t('book.orSolidColor')}</label>
            <input type="color" class="form-control form-control-sm form-control-color"
              id="cover-edit-bg" value="${escapeHtml(coverBg || '#2c3e50')}">
          </div>

          <div class="book-page-editor-section">
            <label class="book-editor-label">${t('book.titlePosition')}</label>
            <div class="book-editor-tpl-row">
              ${POSITIONS.map(p => `
                <button type="button"
                  class="book-tpl-btn ${titlePos === p.id ? 'is-active' : ''}"
                  data-cover-pos="${p.id}"
                  title="${escapeHtml(t('book.pos_' + p.id.replace('-', '_')))}">
                  <i class="bi bi-${p.icon}"></i>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="book-page-editor-section">
            <label class="book-editor-label">${t('book.accentColor')}</label>
            <input type="color" class="form-control form-control-sm form-control-color"
              id="cover-edit-accent" value="${escapeHtml(accent)}">
          </div>

          <div class="book-page-editor-section">
            <label class="book-editor-label" for="cover-edit-font">${t('book.fontFamily')}</label>
            <select class="form-select form-select-sm" id="cover-edit-font">
              ${FONTS.map(f => `
                <option value="${escapeHtml(f.id)}" ${fontFamily === f.id ? 'selected' : ''}
                  style="font-family: ${f.id || 'Georgia, serif'}">${escapeHtml(f.label)}</option>
              `).join('')}
            </select>
          </div>

          <div class="book-page-editor-section">
            <label class="book-editor-label" for="cover-edit-back">${t('book.backText')}</label>
            <textarea class="form-control form-control-sm" id="cover-edit-back" rows="3"
              placeholder="${escapeHtml(t('book.backPageText'))}">${escapeHtml(theme.backText || '')}</textarea>
          </div>

          <div class="book-page-editor-section">
            <label class="book-editor-label" for="cover-edit-fontsize">${t('book.fontSize')}</label>
            <select class="form-select form-select-sm" id="cover-edit-fontsize">
              <option value="small" ${(theme.fontSize || 'normal') === 'small' ? 'selected' : ''}>${t('book.fontSize_small')}</option>
              <option value="normal" ${(theme.fontSize || 'normal') === 'normal' ? 'selected' : ''}>${t('book.fontSize_normal')}</option>
              <option value="large" ${theme.fontSize === 'large' ? 'selected' : ''}>${t('book.fontSize_large')}</option>
            </select>
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
                const imgRot = img ? safeRotation(overrides.mediaRotation?.[img.file_path]) : 0;
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
                    ${img ? `<img src="${authUrl(img.thumbnail_path || img.file_path)}" alt="" style="${rotationStyle(imgRot)}">` : '<div class="book-batch-edit-noimg"></div>'}
                    <div class="book-batch-edit-info">
                      <div class="book-batch-edit-date">${escapeHtml(post.post_date ? formatDateLong(post.post_date) : '')}</div>
                      <div class="book-batch-edit-snippet">${escapeHtml(displayText.slice(0, 60))}</div>
                    </div>
                    <div class="book-batch-edit-actions">
                      ${img ? `
                        <button type="button" class="btn btn-link btn-sm p-1"
                          data-batch-rotate="${escapeHtml(img.file_path)}"
                          title="${escapeHtml(t('book.rotateImage'))}">
                          <i class="bi bi-arrow-clockwise"></i>
                        </button>
                      ` : ''}
                      <button type="button" class="btn btn-link btn-sm p-1"
                        data-batch-promote="${escapeHtml(post.uuid)}"
                        title="${escapeHtml(t('book.promoteToFull'))}">
                        <i class="bi bi-arrows-fullscreen"></i>
                      </button>
                      <button type="button" class="btn btn-link btn-sm p-1" data-batch-caption="${escapeHtml(post.uuid)}" title="${escapeHtml(t('book.editCaption'))}">
                        <i class="bi bi-chat-left-text"></i>
                      </button>
                    </div>
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
  // Grid view renders empty placeholders with the correct dimensions and
  // mounts each page's actual content (which contains <img>s) only when it
  // scrolls into view. Critical for iOS PWA — a 250-page book with 4
  // thumbnails per batch page can otherwise hold 1000+ decoded <img>s in
  // memory simultaneously and exceed iOS's hard ceiling.
  const renderGridView = () => {
    return `
      <div class="book-grid">
        ${pages.map((p, i) => {
          const postUuid = p.type === 'post' ? p.post.uuid : null;
          const isBatch = p.type === 'batch';
          const clickable = !!(postUuid || isBatch || p.type === 'cover' || p.type === 'chapter' || p.type === 'back');
          // Inner thumb is empty until IntersectionObserver mounts it.
          // Pencil buttons stay outside so they're always interactive.
          return `
            <div class="book-grid-item ${clickable ? 'is-clickable' : ''}" data-grid-idx="${i}">
              <div class="book-grid-thumb" data-grid-thumb-idx="${i}"></div>
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
              ${p.type === 'cover' ? `
                <button type="button" class="book-grid-edit-btn no-print"
                        data-grid-edit-cover="1"
                        title="${escapeHtml(t('book.editCover'))}">
                  <i class="bi bi-pencil"></i>
                </button>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  };

  // IntersectionObserver instance for the grid view. Rebuilt every time the
  // grid is shown so it observes the freshly rendered placeholders.
  let gridObserver = null;

  function attachGridLazyMount() {
    if (gridObserver) { gridObserver.disconnect(); gridObserver = null; }
    const thumbs = document.querySelectorAll('[data-grid-thumb-idx]');
    if (!thumbs.length) return;
    gridObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target;
        const idx = parseInt(el.dataset.gridThumbIdx, 10);
        if (entry.isIntersecting) {
          if (!el.dataset.mounted) {
            const page = pages[idx];
            if (page) {
              el.innerHTML = renderPage(page, overrides, bookMeta);
              el.dataset.mounted = '1';
            }
          }
        } else if (el.dataset.mounted) {
          // Unmount when far out of view to free decoded image memory.
          // The placeholder keeps its size so the scrollbar doesn't jump.
          el.innerHTML = '';
          delete el.dataset.mounted;
        }
      }
    }, {
      // Generous root margin so users see thumbs before they reach the
      // viewport — feels instant on slow scroll, still bounded on fast.
      rootMargin: '600px 0px',
      threshold: 0,
    });
    thumbs.forEach(el => gridObserver.observe(el));
  }

  // Editor view was removed in favour of click-to-edit directly inside the
  // flip view. Per-post weight, image inclusion, and rotation are now
  // edited via the page-edit / batch-edit sub-views opened by the pencil
  // button on each page. The Editor view became redundant and didn't
  // scale: rendering hundreds of scaled previews ruined performance and
  // duplicated functionality already present in the per-page editors.

  const updateFlipView = () => {
    const pagesEl = document.getElementById('book-pages');
    if (!pagesEl) return;
    const indicator = document.getElementById('book-page-indicator');
    const wraps = pagesEl.querySelectorAll('.book-page-wrap');

    // Clamp after rebuilds
    if (currentPage >= pages.length) currentPage = Math.max(0, pages.length - 1);

    wraps.forEach((el) => {
      const i = parseInt(el.dataset.idx, 10);
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
  // Uses the active page size from layout_options.
  const computeScale = () => {
    const stage = document.getElementById('book-stage');
    if (!stage) return;
    const MM_PER_INCH = 25.4;
    const DPI = 96;
    const PX_PER_MM = DPI / MM_PER_INCH; // ≈ 3.7795
    const ps = PAGE_SIZES[safePageSize(data.book.layout_options?.pageSize)];
    const pageW = ps.w * PX_PER_MM;
    const pageH = ps.h * PX_PER_MM;
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
    const targetPage = Math.max(0, Math.min(pages.length - 1, idx));
    if (targetPage === currentPage) return;
    const dir = targetPage > currentPage ? 'next' : 'prev';
    const oldPage = currentPage;
    const stepDistance = Math.abs(targetPage - oldPage);

    const pagesEl = document.getElementById('book-pages');
    if (pagesEl) pagesEl.dataset.flipDir = dir;

    // Slide-out animation only on small steps where the old page is still
    // within the new mounted window. Big jumps (e.g. from grid view) snap
    // straight to the destination.
    if (pagesEl && stepDistance <= FLIP_WINDOW) {
      const oldWrap = pagesEl.querySelector(`.book-page-wrap[data-idx="${oldPage}"]`);
      if (oldWrap) {
        oldWrap.classList.remove('is-leaving-next', 'is-leaving-prev');
        oldWrap.classList.add(`is-leaving-${dir}`);
        setTimeout(() => oldWrap.classList.remove(`is-leaving-${dir}`), 500);
      }
    }

    currentPage = targetPage;
    if (spreadMode && currentPage > 0 && currentPage % 2 === 0) {
      currentPage = currentPage - 1;
    }
    remountFlipWindow();
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

  // Exit any active sub-editor (page/batch/cover) and return the user to
  // whichever view they were in when they opened it. Used by both the
  // back button and every "Done" button so navigation is consistent.
  function exitSubEditor() {
    const origin = subEditorOrigin;
    pageEditPostUuid = null;
    batchEditPageIdx = null;
    coverEditMode = false;
    subEditorOrigin = null;
    gridMode = (origin === 'grid');
    rebuildPages({ skipRender: true });
    writeHashState(gridMode ? { view: 'grid' } : { view: 'flip', pageIdx: currentPage });
    renderShell();
  }

  // Fit a sub-editor's preview frame (page/batch/cover editor) to its actual
  // page dimensions. The frame width is fixed by CSS; we scale the inner
  // .book-page (which is rendered at real mm dimensions) to fit and set the
  // frame height so the aspect ratio matches the book's pageSize.
  function applyEditorPreviewScale() {
    const scaleEl = document.getElementById('book-page-editor-scale');
    if (!scaleEl) return;
    const frame = scaleEl.parentElement;
    const PX_PER_MM = 96 / 25.4;
    const ps = PAGE_SIZES[safePageSize(data.book.layout_options?.pageSize)];
    const pageWPx = ps.w * PX_PER_MM;
    const pageHPx = ps.h * PX_PER_MM;
    const w = frame.clientWidth;
    // Cap height too so very tall pages (A4 portrait) don't push the panel
    // out of view on smaller screens.
    const maxH = Math.max(280, window.innerHeight - 220);
    const scale = Math.min(1, w / pageWPx, maxH / pageHPx);
    scaleEl.style.transform = `scale(${scale})`;
    scaleEl.style.width = `${pageWPx}px`;
    scaleEl.style.height = `${pageHPx}px`;
    frame.style.width = `${pageWPx * scale}px`;
    frame.style.height = `${pageHPx * scale}px`;
  }

  // Bind click-to-set-focal-point on all images inside the page-editor
  // preview. Re-callable so we can reattach after rerendering the preview
  // (e.g. when the user rotates an image).
  function attachPageEditorPreviewClicks() {
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
  }

  // Regenerate the book's snapshot. Asks the user to confirm with a diff
  // summary, then calls POST /:uuid/regenerate and reloads the data so
  // the new snapshot is reflected. Per-post overrides are preserved by
  // the backend as long as the post UUID still exists.
  async function doRegenerate() {
    let info = regenerateInfo;
    if (!info) {
      try {
        info = await api.get(`/books/${bookUuid}/regenerate-preview`);
      } catch (err) {
        showError(err.message || t('book.errSaveFailed'));
        return;
      }
    }
    const message = (info.added || info.removed)
      ? t('book.regenerateConfirm', { added: info.added, removed: info.removed })
      : t('book.regenerateNoChanges');
    const ok = await confirmDialog(message, {
      title: t('book.regenerate'),
      confirmText: t('book.regenerateConfirmBtn'),
    });
    if (!ok) return;
    try {
      await api.post(`/books/${bookUuid}/regenerate`, {});
      // Reload book data fresh from server so the new snapshot takes effect.
      const fresh = await api.get(`/books/${bookUuid}/data`);
      data.book = fresh.book;
      data.contacts = fresh.contacts;
      data.posts = fresh.posts;
      bookMeta.contactCount = (fresh.book.contact_uuids || []).length;
      // Re-read overrides from the merged layout the backend just saved.
      const newOverrides = fresh.book.layout_options?.overrides || {};
      overrides.postWeight = { ...(newOverrides.postWeight || {}) };
      overrides.templates = { ...(newOverrides.templates || {}) };
      overrides.customText = { ...(newOverrides.customText || {}) };
      overrides.hideComments = { ...(newOverrides.hideComments || {}) };
      regenerateInfo = null;
      rebuildPages();
    } catch (err) {
      showError(err.message || t('book.errSaveFailed'));
    }
  }

  // Probe the backend for available updates so the toolbar can show a
  // badge if new posts have appeared in the book's date range. Best-effort
  // — failures are silent.
  (async () => {
    try {
      regenerateInfo = await api.get(`/books/${bookUuid}/regenerate-preview`);
      if (regenerateInfo && (regenerateInfo.added || regenerateInfo.removed)) {
        // Re-render the toolbar to show the badge.
        renderShell();
      }
    } catch {}
  })();

  function attachShellHandlers() {
    document.getElementById('book-btn-back').onclick = () => {
      // Sub-editor → return to whichever view it was opened from.
      if (pageEditPostUuid || batchEditPageIdx != null || coverEditMode) {
        exitSubEditor();
        return;
      }
      // Grid → return to flip view (still inside the book).
      if (gridMode) {
        gridMode = false;
        writeHashState({ view: 'flip', pageIdx: currentPage });
        renderShell();
        return;
      }
      // Flip view → leave the book entirely.
      navigate('/settings/generate-book');
    };
    document.getElementById('book-btn-editmeta').onclick = () => openEditInfoModal();
    document.getElementById('book-btn-print').onclick = () => {
      // Always print the full (non-excluded) flip view, so disable grid mode first.
      const wasGrid = gridMode;
      if (wasGrid) { gridMode = false; renderShell(); }

      // Inject an @page rule with the correct dimensions for this book.
      // CSS @page can't read CSS variables, so we set the size at print
      // time via a temporary <style> element.
      const ps = PAGE_SIZES[safePageSize(data.book.layout_options?.pageSize)];
      const styleEl = document.createElement('style');
      styleEl.id = 'book-print-page-size';
      styleEl.textContent = `@page { size: ${ps.w}mm ${ps.h}mm; margin: 0; } @media print { .book-page { width: ${ps.w}mm !important; height: ${ps.h}mm !important; } }`;
      document.head.appendChild(styleEl);

      document.body.classList.add('book-printing');
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          document.body.classList.remove('book-printing');
          styleEl.remove();
        }, 500);
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
      gridMode = false;
      pageEditPostUuid = null; batchEditPageIdx = null; coverEditMode = false;
      writeHashState({ view: 'flip', pageIdx: currentPage });
      renderShell();
    };
    document.getElementById('book-btn-grid').onclick = () => {
      gridMode = true;
      pageEditPostUuid = null; batchEditPageIdx = null; coverEditMode = false;
      writeHashState({ view: 'grid' });
      renderShell();
    };

    // Regenerate menu items — both the toolbar badge (when diff exists) and
    // the dropdown menu item open the same confirm flow.
    const regenBtn = document.getElementById('book-btn-regenerate');
    if (regenBtn) regenBtn.onclick = () => doRegenerate();
    const regenBadgeBtn = document.getElementById('book-btn-regen-badge');
    if (regenBadgeBtn) regenBadgeBtn.onclick = () => doRegenerate();

    // Cover editor handlers
    if (coverEditMode) {
      applyEditorPreviewScale();
      window.requestAnimationFrame(applyEditorPreviewScale);

      const refreshCoverPreview = () => {
        const scale = document.getElementById('book-page-editor-scale');
        if (scale) scale.innerHTML = renderCoverPage(data.book);
        const viewer = document.getElementById('book-viewer');
        if (viewer) viewer.setAttribute('style', themeVarsStyle());
      };

      // Save a theme change to the book and refresh the preview.
      const saveTheme = async (themePatch) => {
        const merged = {
          ...(data.book.layout_options || {}),
          theme: { ...(data.book.layout_options?.theme || {}), ...themePatch },
        };
        data.book.layout_options = merged;
        refreshCoverPreview();
        try {
          const res = await api.patch(`/books/${bookUuid}`, { layout_options: merged });
          data.book = res.book;
        } catch (err) {
          showError(err.message || t('book.errSaveFailed'));
        }
      };

      // Title / subtitle debounced save
      const titleInput = document.getElementById('cover-edit-title');
      const subtitleInput = document.getElementById('cover-edit-subtitle');
      let metaTimer = null;
      const scheduleMetaSave = () => {
        if (metaTimer) clearTimeout(metaTimer);
        metaTimer = setTimeout(async () => {
          try {
            const res = await api.patch(`/books/${bookUuid}`, {
              title: titleInput.value.trim(),
              subtitle: subtitleInput.value.trim() || null,
            });
            data.book = res.book;
            refreshCoverPreview();
          } catch (err) { showError(err.message || t('book.errSaveFailed')); }
        }, 400);
      };
      titleInput.addEventListener('input', scheduleMetaSave);
      subtitleInput.addEventListener('input', scheduleMetaSave);

      // Title position
      document.querySelectorAll('[data-cover-pos]').forEach((btn) => {
        btn.onclick = () => {
          saveTheme({ titlePosition: btn.dataset.coverPos });
          document.querySelectorAll('[data-cover-pos]').forEach(b => b.classList.toggle('is-active', b === btn));
        };
      });

      // Background solid color
      const bgInput = document.getElementById('cover-edit-bg');
      bgInput.addEventListener('input', () => {
        saveTheme({ coverBg: bgInput.value, coverImage: null });
      });

      // Accent color
      const accentInput = document.getElementById('cover-edit-accent');
      accentInput.addEventListener('input', () => {
        saveTheme({ accent: accentInput.value });
      });

      // Font family
      const fontSelect = document.getElementById('cover-edit-font');
      fontSelect.addEventListener('change', () => {
        saveTheme({ fontFamily: fontSelect.value });
      });

      // Body font size
      const fontSizeSelect = document.getElementById('cover-edit-fontsize');
      fontSizeSelect.addEventListener('change', () => {
        saveTheme({ fontSize: fontSizeSelect.value });
      });

      // Back-cover text (debounced)
      const backTextEl = document.getElementById('cover-edit-back');
      let backTextTimer = null;
      backTextEl.addEventListener('input', () => {
        if (backTextTimer) clearTimeout(backTextTimer);
        backTextTimer = setTimeout(() => {
          saveTheme({ backText: backTextEl.value || null });
        }, 400);
      });

      // Pick cover from existing media (uses the reusable media-picker)
      const pickBtn = document.getElementById('cover-pick-from-book');
      if (pickBtn) {
        pickBtn.onclick = async () => {
          // Source from all of the book's contacts. The media picker
          // dedupes images that appear for several contacts.
          const contactUuids = data.book.contact_uuids || [];
          if (!contactUuids.length) return;
          const picked = await showMediaPicker({
            title: t('book.pickFromBook'),
            source: { contactUuids },
          });
          if (picked.length > 0) {
            saveTheme({ coverImage: picked[0].file_path });
          }
        };
      }

      // Cover image upload
      const uploadInput = document.getElementById('cover-upload');
      uploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const fd = new FormData();
          fd.append('cover', file);
          const res = await api.upload(`/books/${bookUuid}/cover`, fd);
          const merged = {
            ...(data.book.layout_options || {}),
            theme: { ...(data.book.layout_options?.theme || {}), coverImage: res.coverImage },
          };
          data.book.layout_options = merged;
          renderShell();
        } catch (err) { showError(err.message || t('book.errSaveFailed')); }
        uploadInput.value = '';
      });

      // Remove uploaded cover image
      const removeBtn = document.getElementById('cover-remove-image');
      if (removeBtn) {
        removeBtn.onclick = async () => {
          try {
            await api.delete(`/books/${bookUuid}/cover`);
            const merged = {
              ...(data.book.layout_options || {}),
              theme: { ...(data.book.layout_options?.theme || {}), coverImage: null },
            };
            data.book.layout_options = merged;
            renderShell();
          } catch (err) { showError(err.message || t('book.errSaveFailed')); }
        };
      }

      document.getElementById('book-page-editor-done').onclick = () => exitSubEditor();
      return;
    }

    // Batch editor handlers — opened via pencil on a batch page. Focused
    // only on editing THIS page (focal points + captions). Structural
    // changes happen in the Editor view.
    if (batchEditPageIdx != null) {
      applyEditorPreviewScale();
      window.requestAnimationFrame(applyEditorPreviewScale);
      const scaleEl = document.getElementById('book-page-editor-scale');
      if (scaleEl) {
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

      // Rotate the primary image of a post within this batch
      document.querySelectorAll('[data-batch-rotate]').forEach((btn) => {
        btn.onclick = () => {
          const mediaPath = btn.dataset.batchRotate;
          const cur = safeRotation(overrides.mediaRotation[mediaPath]);
          const next = (cur + 90) % 360;
          if (next === 0) delete overrides.mediaRotation[mediaPath];
          else overrides.mediaRotation[mediaPath] = next;
          saveOverrides();
          renderShell();
        };
      });

      // Promote a post out of the batch to its own full page
      document.querySelectorAll('[data-batch-promote]').forEach((btn) => {
        btn.onclick = () => {
          const postUuid = btn.dataset.batchPromote;
          overrides.postWeight[postUuid] = 'full';
          saveOverrides();
          batchEditPageIdx = null;
          rebuildPages();
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

      document.getElementById('book-page-editor-done').onclick = () => exitSubEditor();
      return;
    }

    // Page editor handlers — the dedicated per-page edit view.
    if (pageEditPostUuid) {
      applyEditorPreviewScale();
      window.requestAnimationFrame(applyEditorPreviewScale);

      attachPageEditorPreviewClicks();

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

      // Per-image rotation (cycles 0 → 90 → 180 → 270 → 0)
      document.querySelectorAll('[data-page-editor-rotate]').forEach((btn) => {
        btn.onclick = () => {
          const mediaPath = btn.dataset.pageEditorRotate;
          const current = safeRotation(overrides.mediaRotation[mediaPath]);
          const next = (current + 90) % 360;
          if (next === 0) delete overrides.mediaRotation[mediaPath];
          else overrides.mediaRotation[mediaPath] = next;
          saveOverrides();
          // Update the thumbnail in the panel without rebuilding the page.
          const thumbWrap = document.querySelector(`[data-img-thumb-path="${CSS.escape(mediaPath)}"] img`);
          if (thumbWrap) thumbWrap.style.transform = next ? `rotate(${next}deg)` : '';
          // Refresh the preview as well.
          const scale = document.getElementById('book-page-editor-scale');
          if (scale) {
            const post = data.posts.find(p => p.uuid === pageEditPostUuid);
            const weight = effectiveWeight(post, overrides);
            scale.innerHTML = renderPage({ type: 'post', post, weight }, overrides, bookMeta);
            // Re-bind the focal-point click handlers on the freshly rendered images.
            attachPageEditorPreviewClicks();
          }
        };
      });

      // Per-page weight selector
      document.querySelectorAll('[data-page-editor-weight]').forEach((btn) => {
        btn.onclick = () => {
          overrides.postWeight[pageEditPostUuid] = btn.dataset.pageEditorWeight;
          saveOverrides();
          rebuildPages();
          renderShell();
        };
      });
      const resetWeightBtn = document.querySelector('[data-page-editor-reset-weight]');
      if (resetWeightBtn) {
        resetWeightBtn.onclick = () => {
          delete overrides.postWeight[pageEditPostUuid];
          saveOverrides();
          rebuildPages();
          renderShell();
        };
      }

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
      document.getElementById('book-page-editor-done').onclick = () => exitSubEditor();

      return; // Skip other handlers
    }

    if (!gridMode) {
      document.getElementById('book-nav-prev').onclick = prev;
      document.getElementById('book-nav-next').onclick = next;
      // Swipe gestures on the page frame for mobile navigation.
      const frame = document.getElementById('book-pages-frame');
      if (frame) {
        let touchX = null;
        let touchY = null;
        frame.addEventListener('touchstart', (e) => {
          if (e.touches.length !== 1) return;
          touchX = e.touches[0].clientX;
          touchY = e.touches[0].clientY;
        }, { passive: true });
        frame.addEventListener('touchend', (e) => {
          if (touchX == null) return;
          const t2 = e.changedTouches[0];
          const dx = t2.clientX - touchX;
          const dy = t2.clientY - touchY;
          touchX = null; touchY = null;
          // Horizontal swipe of at least 50px and mostly horizontal motion.
          if (Math.abs(dx) >= 50 && Math.abs(dy) < 40) {
            if (dx < 0) next(); else prev();
          }
        }, { passive: true });
      }

      attachFlipPageHandlers();
    } else {
      // Grid interactions: click to jump to flip view, pencil to edit
      const viewer = document.getElementById('book-viewer');
      // Lazy-mount the visible thumbs (and unmount as the user scrolls past).
      attachGridLazyMount();
      // Pencil buttons — open the matching editor, don't bubble to the
      // jump-to-page click on the parent item.
      viewer.querySelectorAll('[data-grid-edit-post]').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          pageEditPostUuid = btn.dataset.gridEditPost;
          subEditorOrigin = 'grid';
          gridMode = false;
          renderShell();
        };
      });
      viewer.querySelectorAll('[data-grid-edit-batch]').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          batchEditPageIdx = parseInt(btn.dataset.gridEditBatch, 10);
          subEditorOrigin = 'grid';
          gridMode = false;
          renderShell();
        };
      });
      viewer.querySelectorAll('[data-grid-edit-cover]').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          coverEditMode = true;
          subEditorOrigin = 'grid';
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

  const resizeHandler = () => { if (!gridMode) computeScale(); };
  window.addEventListener('resize', resizeHandler);

  const keyHandler = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (gridMode) return;
    if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'ArrowRight') next();
  };
  document.addEventListener('keydown', keyHandler);

  const observer = new MutationObserver(() => {
    if (!document.getElementById('book-viewer')) {
      document.removeEventListener('keydown', keyHandler);
      window.removeEventListener('resize', resizeHandler);
      observer.disconnect();
      if (gridObserver) { gridObserver.disconnect(); gridObserver = null; }
      // Flush pending save on navigation away
      if (savePending && saveTimer) {
        clearTimeout(saveTimer);
        const merged = {
          ...(data.book.layout_options || {}),
          overrides: {
            excludedPosts: overrides.excludedPosts,
            excludedMedia: overrides.excludedMedia,
            mediaFocal: overrides.mediaFocal,
            mediaRotation: overrides.mediaRotation,
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
