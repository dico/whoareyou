/**
 * Signage display — standalone fullscreen viewer for TVs.
 *
 * Entry point: /signage/{token}
 * Fetches /api/signage/feed/{token} and renders either a slideshow
 * (one image at a time with fade transitions) or a feed (1-6 cards).
 *
 * slide_interval drives both:
 *  - Slideshow: time per slide. With multi_image='rotate', each image in a
 *    post becomes its own slide.
 *  - Feed: one card is replaced every slide_interval (staggered, so the
 *    whole grid isn't refreshed at once). Within a card, images rotate at
 *    the same rate when multi_image='rotate'.
 */

const root = document.getElementById('signage-root');

// Extract token from URL path: /signage/{token}
const pathParts = window.location.pathname.split('/').filter(Boolean);
const token = pathParts[pathParts.length - 1];

if (!token || token === 'signage') {
  root.innerHTML = '<div class="signage-center signage-error">No token in URL</div>';
} else {
  init();
}

async function init() {
  try {
    const data = await fetchFeed();
    if (!data.posts.length) {
      root.innerHTML = '<div class="signage-center">No posts to display</div>';
      return;
    }

    // Show fullscreen hint
    if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
      const hint = document.createElement('button');
      hint.className = 'signage-fullscreen-hint';
      hint.textContent = 'Fullscreen';
      hint.onclick = () => {
        const el = document.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        hint.remove();
      };
      document.body.appendChild(hint);
      setTimeout(() => hint.remove(), 15000);
    }

    if (data.config.display_mode === 'feed') {
      renderFeed(data);
    } else {
      renderSlideshow(data);
    }
  } catch (err) {
    root.innerHTML = `<div class="signage-center signage-error">${err.message || 'Failed to load'}</div>`;
  }
}

async function fetchFeed() {
  const res = await fetch(`/api/signage/feed/${token}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function mediaUrl(filePath) {
  // Use the signage media proxy so no auth token is needed.
  // Strip leading /uploads/ since the proxy expects relative paths.
  const rel = filePath.replace(/^\/uploads\//, '');
  return `/api/signage/media/${token}?path=${encodeURIComponent(rel)}`;
}

// ── Slideshow ────────────────────────────────────

function renderSlideshow(data) {
  const { config } = data;
  // When multi_image='rotate', expand each multi-image post into one slide
  // per image so the existing slide loop handles rotation for free.
  const posts = (config.multi_image === 'rotate')
    ? data.posts.flatMap((p) => {
      const imgs = p.images || [];
      if (imgs.length <= 1) return [p];
      return imgs.map((img) => ({ ...p, images: [img] }));
    })
    : data.posts;

  const container = document.createElement('div');
  container.className = 'signage-slideshow';
  root.innerHTML = '';
  root.appendChild(container);

  // Build slides
  const slides = posts.map((post, i) => {
    const div = document.createElement('div');
    div.className = 'signage-slide';

    // Image(s)
    const images = post.images || [];
    if (images.length === 0) return null;

    if (images.length === 1 || config.multi_image === 'first' || config.multi_image === 'rotate') {
      const img = document.createElement('img');
      img.className = 'signage-slide-img';
      img.style.objectFit = config.image_fit || 'contain';
      img.src = mediaUrl(images[0].file_path);
      img.alt = '';
      img.loading = i < 2 ? 'eager' : 'lazy';
      div.appendChild(img);
    } else {
      // Collage
      const collage = document.createElement('div');
      const count = Math.min(images.length, 4);
      collage.className = `signage-collage count-${count}`;
      for (let j = 0; j < count; j++) {
        const img = document.createElement('img');
        img.src = mediaUrl(images[j].file_path);
        img.alt = '';
        img.loading = i < 2 ? 'eager' : 'lazy';
        collage.appendChild(img);
      }
      div.appendChild(collage);
    }

    appendOverlays(div, post, config);
    return div;
  }).filter(Boolean);

  if (!slides.length) {
    root.innerHTML = '<div class="signage-center">No images to display</div>';
    return;
  }

  for (const s of slides) container.appendChild(s);

  // Animate
  let current = 0;
  slides[0].classList.add('is-active');

  // Preload next few images
  const preloadAhead = 3;
  function preloadSlides(from) {
    for (let i = 1; i <= preloadAhead; i++) {
      const idx = (from + i) % slides.length;
      const imgs = slides[idx].querySelectorAll('img[loading="lazy"]');
      imgs.forEach(img => img.loading = 'eager');
    }
  }
  preloadSlides(0);

  const interval = (config.slide_interval || 15) * 1000;
  setInterval(() => {
    slides[current].classList.remove('is-active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('is-active');
    preloadSlides(current);
  }, interval);

  // Reload data periodically (new posts, etc.)
  const reloadInterval = Math.max(interval * slides.length, 60000);
  setInterval(async () => {
    try {
      const fresh = await fetchFeed();
      if (fresh.posts.length) {
        renderSlideshow(fresh);
      }
    } catch {}
  }, reloadInterval);
}

// Builds the bottom/top overlays (date, body, comments, names, reactions).
// Shared by slideshow slides and feed cards' overlay area.
function appendOverlays(slide, post, config) {
  // Date badge — top-right corner
  if (config.show_date && post.post_date) {
    const badge = document.createElement('div');
    badge.className = 'signage-date-badge';
    badge.textContent = formatDate(post.post_date);
    slide.appendChild(badge);
  }

  if (!(config.show_contact_name || config.show_body || config.show_reactions || config.show_comments)) return;

  const overlay = document.createElement('div');
  overlay.className = 'signage-overlay';

  if (config.show_body && post.body) {
    const el = document.createElement('div');
    el.className = 'signage-overlay-body';
    el.textContent = post.body;
    overlay.appendChild(el);
  }

  if (config.show_comments && post.comments?.length) {
    const el = document.createElement('div');
    el.className = 'signage-overlay-comments';
    for (const c of post.comments) {
      const row = document.createElement('div');
      row.className = 'signage-overlay-comment';
      row.innerHTML = `<strong>${esc(c.author)}</strong>${esc(c.body)}`;
      el.appendChild(row);
    }
    overlay.appendChild(el);
  }

  if (config.show_contact_name) {
    const nameParts = [];
    if (post.contact_names?.length) nameParts.push(post.contact_names.join(', '));
    if (post.author_name && post.author_name !== nameParts[0]) {
      nameParts.push(`Publisert av ${post.author_name}`);
    }
    if (nameParts.length) {
      const el = document.createElement('div');
      el.className = 'signage-overlay-names';
      el.textContent = nameParts.join(' · ');
      overlay.appendChild(el);
    }
  }

  const meta = [];
  if (config.show_reactions && post.reactions) meta.push(`❤ ${post.reactions}`);
  if (meta.length) {
    const el = document.createElement('div');
    el.className = 'signage-overlay-meta';
    el.innerHTML = meta.map(m => `<span>${m}</span>`).join('');
    overlay.appendChild(el);
  }

  if (overlay.children.length) slide.appendChild(overlay);
}

// ── Feed ─────────────────────────────────────────

function renderFeed(data) {
  const { config } = data;
  const intervalMs = (config.slide_interval || 15) * 1000;

  const displayable = filterDisplayable(data.posts, config);
  if (!displayable.length) {
    root.innerHTML = '<div class="signage-center">No posts to display</div>';
    return;
  }

  const maxPosts = Math.min(config.max_posts || 3, displayable.length);

  const container = document.createElement('div');
  container.className = `signage-feed layout-${config.feed_layout || 'horizontal'} count-${maxPosts}`;
  root.innerHTML = '';
  root.appendChild(container);

  // Pool of available posts; slots hold the currently-visible ones.
  const pool = displayable;
  const slots = []; // { card, postIdx, imageTimer }
  let cursor = 0; // round-robin pointer into pool for the next replacement

  for (let i = 0; i < maxPosts; i++) {
    const card = buildFeedCard(pool[i], config);
    container.appendChild(card);
    const slot = { card, postIdx: i, imageTimer: null };
    slots.push(slot);
    startImageRotation(slot, pool, config, intervalMs);
  }
  cursor = maxPosts;

  function replaceSlot(slotIdx) {
    if (pool.length <= slots.length) return; // nothing fresh to rotate to
    const slot = slots[slotIdx];
    const visible = new Set(slots.map((s) => s.postIdx));
    let pick = -1;
    for (let i = 0; i < pool.length; i++) {
      const candidate = (cursor + i) % pool.length;
      if (!visible.has(candidate)) { pick = candidate; break; }
    }
    if (pick < 0) return;
    cursor = (pick + 1) % pool.length;

    clearInterval(slot.imageTimer);
    slot.postIdx = pick;

    const newCard = buildFeedCard(pool[pick], config);
    newCard.classList.add('is-entering');
    slot.card.replaceWith(newCard);
    slot.card = newCard;
    requestAnimationFrame(() => newCard.classList.remove('is-entering'));

    startImageRotation(slot, pool, config, intervalMs);
  }

  // Staggered card swap: each tick replaces ONE slot, so the grid never
  // refreshes all at once.
  let swapSlot = 0;
  const cardSwapTimer = setInterval(() => {
    replaceSlot(swapSlot);
    swapSlot = (swapSlot + 1) % slots.length;
  }, intervalMs);

  // Refresh the pool periodically so new posts trickle in. Full re-render
  // is simpler than reconciling visible-vs-pool indices.
  const refreshMs = Math.max(intervalMs * slots.length * 4, 300000); // ≥ 5 min
  setInterval(async () => {
    try {
      const fresh = await fetchFeed();
      const freshDisplayable = filterDisplayable(fresh.posts || [], fresh.config || config);
      if (!freshDisplayable.length) return;
      clearInterval(cardSwapTimer);
      for (const s of slots) clearInterval(s.imageTimer);
      renderFeed(fresh);
    } catch {}
  }, refreshMs);
}

function filterDisplayable(posts, config) {
  return posts.filter((p) => {
    const hasImage = (p.images || []).length > 0;
    const hasVisibleBody = config.show_body && p.body && p.body.trim();
    return hasImage || hasVisibleBody;
  });
}

function startImageRotation(slot, pool, config, intervalMs) {
  clearInterval(slot.imageTimer);
  if (config.multi_image !== 'rotate') return;
  const images = pool[slot.postIdx]?.images || [];
  if (images.length < 2) return;
  let imageIdx = 0;
  slot.imageTimer = setInterval(() => {
    imageIdx = (imageIdx + 1) % images.length;
    const img = slot.card.querySelector('.signage-feed-card-img > img');
    if (img) {
      img.classList.add('is-fading');
      // Use a tiny timeout so the browser registers the opacity drop
      // before swapping src — produces a soft cross-fade via CSS.
      setTimeout(() => {
        img.src = mediaUrl(images[imageIdx].file_path);
        img.onload = () => img.classList.remove('is-fading');
      }, 150);
    }
  }, intervalMs);
}

function buildFeedCard(post, config) {
  const card = document.createElement('div');
  const images = post.images || [];
  const isTextOnly = !images.length;
  card.className = `signage-feed-card${isTextOnly ? ' text-only' : ''}`;

  // Image area
  if (images.length) {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'signage-feed-card-img';
    imgWrap.style.setProperty('--img-fit', config.image_fit || 'contain');

    if (images.length === 1 || config.multi_image === 'first' || config.multi_image === 'rotate') {
      const img = document.createElement('img');
      img.src = mediaUrl(images[0].file_path);
      img.alt = '';
      imgWrap.appendChild(img);
    } else {
      const collage = document.createElement('div');
      const count = Math.min(images.length, 4);
      collage.className = `signage-collage count-${count}`;
      for (let j = 0; j < count; j++) {
        const img = document.createElement('img');
        img.src = mediaUrl(images[j].file_path);
        img.alt = '';
        collage.appendChild(img);
      }
      imgWrap.appendChild(collage);
    }
    card.appendChild(imgWrap);
  }

  // Date badge — top-right of card
  if (config.show_date && post.post_date) {
    const badge = document.createElement('div');
    badge.className = 'signage-date-badge';
    badge.textContent = formatDate(post.post_date);
    card.appendChild(badge);
  }

  // Body area
  const body = document.createElement('div');
  body.className = 'signage-feed-card-body';

  if (config.show_body && post.body) {
    const el = document.createElement('div');
    el.className = 'signage-feed-card-text';
    // Scale font for text-only cards based on content length
    if (isTextOnly) {
      const len = post.body.length;
      if (len < 80) el.style.fontSize = '3.5vmin';
      else if (len < 200) el.style.fontSize = '2.8vmin';
      else if (len < 500) el.style.fontSize = '2.2vmin';
    }
    el.textContent = post.body;
    body.appendChild(el);
  }

  if (config.show_comments && post.comments?.length) {
    const el = document.createElement('div');
    el.className = 'signage-feed-card-comments';
    for (const c of post.comments) {
      const row = document.createElement('div');
      row.innerHTML = `<strong>${esc(c.author)}</strong>${esc(c.body)}`;
      el.appendChild(row);
    }
    body.appendChild(el);
  }

  if (config.show_contact_name) {
    const nameParts = [];
    if (post.contact_names?.length) nameParts.push(post.contact_names.join(', '));
    if (post.author_name && post.author_name !== nameParts[0]) {
      nameParts.push(`Publisert av ${post.author_name}`);
    }
    if (nameParts.length) {
      const el = document.createElement('div');
      el.className = 'signage-feed-card-names';
      el.textContent = nameParts.join(' · ');
      body.appendChild(el);
    }
  }

  const meta = [];
  if (config.show_reactions && post.reactions) meta.push(`❤ ${post.reactions}`);
  if (meta.length) {
    const el = document.createElement('div');
    el.className = 'signage-feed-card-meta';
    el.innerHTML = meta.map(m => `<span>${m}</span>`).join('');
    body.appendChild(el);
  }

  if (body.children.length) card.appendChild(body);
  return card;
}

// ── Helpers ──────────────────────────────────────

function esc(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return dateStr; }
}
