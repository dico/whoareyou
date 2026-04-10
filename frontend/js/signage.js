/**
 * Signage display — standalone fullscreen viewer for TVs.
 *
 * Entry point: /signage/{token}
 * Fetches /api/signage/feed/{token} and renders either a slideshow
 * (one image at a time with fade transitions) or a feed (1-6 cards).
 * Polls for fresh data every N seconds (slide_interval × slide count
 * for slideshow, or 60s for feed).
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
      // Poll for fresh data
      setInterval(async () => {
        try {
          const fresh = await fetchFeed();
          if (fresh.posts.length) renderFeed(fresh);
        } catch {}
      }, 60000);
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
  const { config, posts } = data;
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

    if (images.length === 1 || config.multi_image === 'first') {
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

    // Overlay
    if (config.show_contact_name || config.show_body || config.show_date || config.show_reactions || config.show_comments) {
      const overlay = document.createElement('div');
      overlay.className = 'signage-overlay';

      if (config.show_contact_name && post.contact_names?.length) {
        const el = document.createElement('div');
        el.className = 'signage-overlay-names';
        el.textContent = post.contact_names.join(', ');
        overlay.appendChild(el);
      }

      if (config.show_body && post.body) {
        const el = document.createElement('div');
        el.className = 'signage-overlay-body';
        el.textContent = post.body;
        overlay.appendChild(el);
      }

      const meta = [];
      if (config.show_date && post.post_date) {
        meta.push(formatDate(post.post_date));
      }
      if (config.show_reactions && post.reactions) {
        meta.push(`❤ ${post.reactions}`);
      }
      if (meta.length) {
        const el = document.createElement('div');
        el.className = 'signage-overlay-meta';
        el.innerHTML = meta.map(m => `<span>${esc(m)}</span>`).join('');
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

      if (overlay.children.length) div.appendChild(overlay);
    }

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
        // Full re-render — simple and correct
        renderSlideshow(fresh);
      }
    } catch {}
  }, reloadInterval);
}

// ── Feed ─────────────────────────────────────────

function renderFeed(data) {
  const { config, posts } = data;
  const container = document.createElement('div');
  container.className = `signage-feed layout-${config.feed_layout || 'horizontal'}`;
  root.innerHTML = '';
  root.appendChild(container);

  for (const post of posts.slice(0, config.max_posts || 3)) {
    const card = document.createElement('div');
    card.className = 'signage-feed-card';

    // Image area
    const images = post.images || [];
    if (images.length) {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'signage-feed-card-img';

      if (images.length === 1 || config.multi_image === 'first') {
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

    // Body area
    const body = document.createElement('div');
    body.className = 'signage-feed-card-body';

    if (config.show_contact_name && post.contact_names?.length) {
      const el = document.createElement('div');
      el.className = 'signage-feed-card-names';
      el.textContent = post.contact_names.join(', ');
      body.appendChild(el);
    }

    if (config.show_body && post.body) {
      const el = document.createElement('div');
      el.className = 'signage-feed-card-text';
      el.textContent = post.body;
      body.appendChild(el);
    }

    const meta = [];
    if (config.show_date && post.post_date) meta.push(formatDate(post.post_date));
    if (config.show_reactions && post.reactions) meta.push(`❤ ${post.reactions}`);
    if (meta.length) {
      const el = document.createElement('div');
      el.className = 'signage-feed-card-meta';
      el.innerHTML = meta.map(m => `<span>${esc(m)}</span>`).join('');
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

    if (body.children.length) card.appendChild(body);
    container.appendChild(card);
  }
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
