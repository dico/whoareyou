import { api } from '../api/client.js';
import { state, navigate } from '../app.js';
import { t } from '../utils/i18n.js';
import { contactRowHtml } from '../components/contact-row.js';
import { attachContactSearch } from '../components/contact-search.js';
import { authUrl } from '../utils/auth-url.js';

export async function renderMomentGarden() {
  const content = document.getElementById('app-content');

  if (state.user?.role !== 'admin' && !state.user?.is_system_admin) {
    content.innerHTML = `<div class="page-container"><div class="alert alert-danger">${t('admin.accessRequired')}</div></div>`;
    return;
  }

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2><i class="bi bi-flower3 me-2"></i>MomentGarden</h2>
      </div>

      <!-- How-to -->
      <div class="settings-section glass-card">
        <h4><i class="bi bi-info-circle me-2"></i>${t('integrations.howTo')}</h4>
        <ol class="small text-muted mb-0">
          <li>${t('integrations.step1')}</li>
          <li>${t('integrations.step2')}</li>
          <li>${t('integrations.step3')}</li>
          <li>${t('integrations.step4')}</li>
        </ol>
      </div>

      <!-- Select contact -->
      <div class="settings-section glass-card mt-3">
        <h4>${t('integrations.targetContact')}</h4>
        <div class="row g-3">
          <div class="col-md-6">
            <input type="text" class="form-control" id="mg-contact-search" placeholder="${t('common.search')}">
            <div id="mg-contact-results" class="mt-1" style="max-height:150px;overflow-y:auto"></div>
            <div id="mg-contact-selected" class="mt-2"></div>
          </div>
        </div>
      </div>

      <!-- Step 2: Import ZIP -->
      <div class="settings-section glass-card mt-3">
        <h4><i class="bi bi-cloud-arrow-down me-2"></i>${t('integrations.importZip')}</h4>
        <p class="text-muted small">${t('integrations.momentgardenDesc')}</p>

        <div class="mb-3">
          <input type="file" class="form-control" id="mg-zip-input" accept=".zip">
          <div class="form-text">${t('integrations.zipHint')}</div>
        </div>

        <div id="mg-preview" class="d-none mb-3">
          <h5>${t('integrations.preview')}</h5>
          <div id="mg-preview-content" class="small" style="max-height:200px;overflow-y:auto"></div>
        </div>

        <div class="d-flex gap-2 align-items-center">
          <button class="btn btn-primary btn-sm" id="mg-import-btn" disabled>
            <i class="bi bi-cloud-arrow-down me-1"></i>${t('integrations.import')}
          </button>
          <div id="mg-progress" class="d-none flex-grow-1">
            <div class="progress" style="height:6px">
              <div class="progress-bar" id="mg-progress-bar" style="width:0%"></div>
            </div>
            <span class="small text-muted" id="mg-progress-text"></span>
          </div>
        </div>
        <div id="mg-result" class="mt-3 d-none"></div>
      </div>

      <!-- Step 3: Sync loves + comments -->
      <div class="settings-section glass-card mt-3">
        <h4><i class="bi bi-chat-heart me-2"></i>${t('integrations.syncTitle')}</h4>
        <p class="text-muted small">${t('integrations.syncDesc')}</p>

        <div class="mb-3">
          <label class="form-label small">${t('integrations.sessionCookie')}</label>
          <textarea class="form-control form-control-sm" id="mg-cookie" rows="2" placeholder="${t('integrations.cookiePlaceholder')}"></textarea>
          <div class="form-text">${t('integrations.cookieHint')}</div>
        </div>

        <div id="mg-sync-status" class="mb-3 d-none"></div>

        <div class="d-flex gap-3 align-items-center mb-3">
          <div class="d-flex align-items-center gap-2">
            <label class="form-label mb-0 small text-muted">${t('integrations.batchSize')}</label>
            <input type="number" class="form-control form-control-sm" id="mg-batch-size" value="20" min="1" max="500" style="width:80px">
          </div>
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" id="mg-resync-all">
            <label class="form-check-label small" for="mg-resync-all">${t('integrations.resyncAll')}</label>
          </div>
        </div>

        <button class="btn btn-outline-primary btn-sm" id="mg-discover-btn" disabled>
          <i class="bi bi-search me-1"></i>${t('integrations.discoverUsers')}
        </button>

        <div id="mg-user-map" class="mt-3 d-none"></div>

        <button class="btn btn-primary btn-sm mt-3 d-none" id="mg-sync-btn">
          <i class="bi bi-arrow-repeat me-1"></i>${t('integrations.syncLovesComments')}
        </button>
        <div id="mg-sync-result" class="mt-3 d-none"></div>

        <hr class="my-3">
        <h5 class="small text-muted">${t('integrations.cleanupTitle')}</h5>
        <p class="small text-muted">${t('integrations.cleanupDesc')}</p>
        <button class="btn btn-outline-danger btn-sm" id="mg-cleanup-btn">
          <i class="bi bi-trash3 me-1"></i>${t('integrations.cleanupBtn')}
        </button>
        <div id="mg-cleanup-result" class="mt-2 d-none"></div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('/admin/integrations'));

  // ── Contact search ──
  let selectedContact = null;
  const searchInput = document.getElementById('mg-contact-search');
  const resultsEl = document.getElementById('mg-contact-results');
  const selectedEl = document.getElementById('mg-contact-selected');
  let searchTimeout;

  function selectContact(c) {
    selectedContact = c;
    searchInput.classList.add('d-none');
    resultsEl.innerHTML = '';
    selectedEl.innerHTML = `
      <span class="contact-chip">
        <span class="contact-chip-avatar">
          ${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${(c.first_name[0] || '') + (c.last_name?.[0] || '')}</span>`}
        </span>
        ${c.first_name} ${c.last_name || ''}
        <button class="contact-chip-remove" type="button"><i class="bi bi-x"></i></button>
      </span>`;
    selectedEl.querySelector('.contact-chip-remove').addEventListener('click', () => {
      selectedContact = null;
      selectedEl.innerHTML = '';
      searchInput.classList.remove('d-none');
      searchInput.value = '';
      searchInput.focus();
      updateButtons();
    });
    updateButtons();
    loadSyncStatus();
  }

  attachContactSearch(searchInput, {
    limit: 5,
    onSelect: (c) => {
      selectContact({ uuid: c.uuid, first_name: c.first_name, last_name: c.last_name, avatar: c.avatar });
    },
  });

  function updateButtons() {
    document.getElementById('mg-import-btn').disabled = !selectedContact || !document.getElementById('mg-zip-input').files[0];
    document.getElementById('mg-discover-btn').disabled = !selectedContact || !document.getElementById('mg-cookie').value.trim();
  }

  // ── ZIP preview ──
  let zipFile = null;
  document.getElementById('mg-zip-input').addEventListener('change', async (e) => {
    zipFile = e.target.files[0];
    if (!zipFile) return;
    updateButtons();

    const previewEl = document.getElementById('mg-preview');
    const previewContent = document.getElementById('mg-preview-content');

    try {
      const zip = await loadJSZip();
      const archive = await zip.loadAsync(zipFile);
      const captionsFile = Object.keys(archive.files).find(n => n.endsWith('captions.txt'));

      if (captionsFile) {
        const captionsText = await archive.files[captionsFile].async('string');
        const entries = captionsText.trim().split('\n').filter(l => l.trim()).map(line => {
          const parts = line.split(' : ');
          return parts.length >= 3 ? { date: parts[0].trim(), filename: parts[1].trim(), caption: parts.slice(2).join(' : ').trim() } : null;
        }).filter(Boolean);

        const images = entries.filter(e => /\.(jpe?g|png|gif|webp)$/i.test(e.filename));
        const videos = entries.filter(e => /\.(mp4|mov|avi|webm)$/i.test(e.filename));

        previewContent.innerHTML = `
          <p><strong>${entries.length}</strong> ${t('integrations.entries')} (${images.length} ${t('integrations.images')}, ${videos.length} ${t('integrations.videos')})</p>
          <div style="max-height:150px;overflow-y:auto">
            ${entries.slice(0, 15).map(e => `<div class="mb-1"><span class="text-muted">${e.date}</span> ${e.caption}</div>`).join('')}
            ${entries.length > 15 ? `<div class="text-muted">... +${entries.length - 15} ${t('integrations.more')}</div>` : ''}
          </div>
        `;
        previewEl.classList.remove('d-none');
      } else {
        previewContent.innerHTML = `<div class="text-warning">${t('integrations.noCaptions')}</div>`;
        previewEl.classList.remove('d-none');
      }
    } catch (err) {
      previewContent.innerHTML = `<div class="text-danger">${err.message}</div>`;
      previewEl.classList.remove('d-none');
    }
  });

  // ── Import ZIP ──
  document.getElementById('mg-import-btn').addEventListener('click', async () => {
    if (!selectedContact || !zipFile) return;
    const progressEl = document.getElementById('mg-progress');
    const progressBar = document.getElementById('mg-progress-bar');
    const progressText = document.getElementById('mg-progress-text');
    const resultEl = document.getElementById('mg-result');

    progressEl.classList.remove('d-none');
    resultEl.classList.add('d-none');
    document.getElementById('mg-import-btn').disabled = true;

    try {
      const formData = new FormData();
      formData.append('zip', zipFile);
      formData.append('contact_uuid', selectedContact.uuid);

      const result = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/import/momentgarden');
        xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = pct + '%';
            progressText.textContent = `${t('integrations.uploading')} ${pct}%`;
          }
        });
        xhr.upload.addEventListener('load', () => {
          // Upload complete, server is now processing
          progressBar.style.width = '100%';
          progressBar.classList.add('progress-bar-striped', 'progress-bar-animated');
          progressText.textContent = t('integrations.processing');
        });
        xhr.addEventListener('load', () => {
          progressBar.classList.remove('progress-bar-striped', 'progress-bar-animated');
          if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
          else { try { reject(new Error(JSON.parse(xhr.responseText).error)); } catch { reject(new Error(`HTTP ${xhr.status}`)); } }
        });
        xhr.addEventListener('error', () => reject(new Error('Upload failed')));
        xhr.send(formData);
      });

      progressBar.style.width = '100%';
      progressText.textContent = '';
      const lines = [];
      if (result.posts_created) lines.push(`<strong>${result.posts_created}</strong> ${t('integrations.newPostsCreated')}`);
      if (result.duplicates) lines.push(`${result.duplicates} ${t('integrations.alreadyImported')}`);
      if (result.skipped) lines.push(`${result.skipped} ${t('integrations.unsupported')}`);
      resultEl.innerHTML = `<div class="alert ${result.posts_created ? 'alert-success' : 'alert-info'}">
        ${lines.length ? lines.join('<br>') : t('integrations.nothingNew')}
      </div>`;
      resultEl.classList.remove('d-none');
    } catch (err) {
      resultEl.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
      resultEl.classList.remove('d-none');
    }
    document.getElementById('mg-import-btn').disabled = false;
  });

  // ── Cookie input → enable discover ──
  const cookieEl = document.getElementById('mg-cookie');
  cookieEl.addEventListener('input', () => { updateButtons(); loadSyncStatus(); });
  cookieEl.addEventListener('paste', () => setTimeout(() => { updateButtons(); loadSyncStatus(); }, 50));

  async function loadSyncStatus() {
    if (!selectedContact) return;
    const statusEl = document.getElementById('mg-sync-status');
    try {
      const data = await api.get(`/import/momentgarden/sync-ids?contact_uuid=${selectedContact.uuid}`);
      if (data.total) {
        statusEl.innerHTML = `<span class="small"><strong>${data.synced}</strong> / ${data.total} ${t('integrations.momentsSynced')} — <strong>${data.unsynced}</strong> ${t('integrations.remaining')}</span>`;
        statusEl.classList.remove('d-none');
      } else {
        statusEl.classList.add('d-none');
      }
    } catch { statusEl.classList.add('d-none'); }
  }

  // ── Discover users ──
  discoveredData = null;

  document.getElementById('mg-discover-btn').addEventListener('click', async () => {
    if (!selectedContact) return;
    const cookie = document.getElementById('mg-cookie').value.trim();
    if (!cookie) return;

    const btn = document.getElementById('mg-discover-btn');
    const mapEl = document.getElementById('mg-user-map');
    const resultEl = document.getElementById('mg-sync-result');
    btn.disabled = true;
    resultEl.classList.add('d-none');
    mapEl.classList.add('d-none');
    document.getElementById('mg-sync-btn').classList.add('d-none');

    try {
      // Get moment IDs with batch/filter
      const batchSize = parseInt(document.getElementById('mg-batch-size').value) || 20;
      const resyncAll = document.getElementById('mg-resync-all').checked;
      const params = `contact_uuid=${selectedContact.uuid}&only_unsynced=${!resyncAll}&limit=${batchSize}`;
      const { moments, total, synced, unsynced } = await api.get(`/import/momentgarden/sync-ids?${params}`);
      if (!moments.length) {
        mapEl.innerHTML = `<div class="alert alert-info">${t('integrations.noMoments')}</div>`;
        mapEl.classList.remove('d-none');
        btn.disabled = false;
        return;
      }

      // Fetch loves + comments for each moment, collect data locally
      const allData = [];
      const usersMap = new Map();

      for (let i = 0; i < moments.length; i++) {
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${t('integrations.scanning')} ${i + 1} / ${moments.length}`;

        try {
          const result = await api.post('/import/momentgarden/sync-one?dry_run=true', {
            cookie, moment_id: moments[i].moment_id, post_id: moments[i].post_id,
          });

          allData.push({ ...moments[i], loves: result.loves_data || [], comments: result.comments_data || [] });

          // Collect unique users from loves
          for (const love of (result.loves_data || [])) {
            if (!usersMap.has(love.nickname)) {
              usersMap.set(love.nickname, { nickname: love.nickname, alias: love.alias || '', mg_user_id: love.user_id });
            }
          }
          // Collect unique users from comments
          for (const comment of (result.comments_data || [])) {
            if (!usersMap.has(comment.nickname)) {
              usersMap.set(comment.nickname, { nickname: comment.nickname, alias: '', mg_user_id: null });
            }
          }
        } catch {}
      }

      discoveredData = { moments, allData, users: [...usersMap.values()] };

      // Do server-side user matching
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${t('integrations.matchingUsers')}`;
      try {
        const { users: matchedUsers } = await api.post('/import/momentgarden/discover-users', {
          cookie, contact_uuid: selectedContact.uuid,
        });

        // Merge: server matches + local-only users
        for (const mu of matchedUsers) {
          const local = discoveredData.users.find(u => u.nickname === mu.nickname);
          if (local) {
            if (mu.suggested_contact) local.matched_contact = mu.suggested_contact;
            if (mu.alias && !local.alias) local.alias = mu.alias;
          }
        }

        // For users not matched by server, try to find them in server response
        for (const local of discoveredData.users) {
          if (local.matched_contact) continue;
          const serverUser = matchedUsers.find(u =>
            (u.alias && u.alias === local.alias) || u.nickname === local.nickname
          );
          if (serverUser?.suggested_contact) {
            local.matched_contact = serverUser.suggested_contact;
          }
        }
      } catch {}

      const totalLoves = allData.reduce((sum, d) => sum + d.loves.length, 0);
      const totalComments = allData.reduce((sum, d) => sum + d.comments.length, 0);

      mapEl.innerHTML = `
        <p class="small text-muted">${moments.length} ${t('integrations.postsChecked')}, ${totalLoves} ${t('integrations.lovesFound')}, ${totalComments} ${t('integrations.commentsFound')}</p>
        <h5>${t('integrations.userMapping')}</h5>
        <p class="small text-muted">${t('integrations.userMappingDesc')}</p>
        <div class="mg-user-list">
          ${discoveredData.users.map(u => `
            <div class="mg-user-row d-flex align-items-center gap-2 mb-2" data-nickname="${u.nickname}">
              <div style="min-width:180px">
                <strong>${u.nickname}</strong>
                ${u.alias ? `<span class="text-muted small d-block">${u.alias}</span>` : ''}
              </div>
              <span class="text-muted">→</span>
              <div class="mg-user-match" style="min-width:220px">
                ${u.matched_contact
                  ? `<span class="contact-chip" data-uuid="${u.matched_contact.uuid}">
                      <span class="contact-chip-avatar">
                        ${u.matched_contact.avatar ? `<img src="${authUrl(u.matched_contact.avatar)}" alt="">` : `<span>${(u.matched_contact.first_name[0] || '') + (u.matched_contact.last_name?.[0] || '')}</span>`}
                      </span>
                      ${u.matched_contact.first_name} ${u.matched_contact.last_name || ''}
                      <button class="contact-chip-remove mg-clear-match" type="button"><i class="bi bi-x"></i></button>
                    </span>`
                  : `<div class="mg-user-search-wrap">
                      <input type="text" class="form-control form-control-sm mg-user-search" placeholder="${t('common.search')}" value="${u.alias || ''}">
                      <div class="mg-user-search-results" style="position:absolute;z-index:10;max-height:150px;overflow-y:auto;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-sm);display:none"></div>
                    </div>`
                }
              </div>
            </div>
          `).join('')}
        </div>
      `;
      mapEl.classList.remove('d-none');

      // Bind search + clear handlers
      bindUserMapHandlers(mapEl);

      // Show sync button
      document.getElementById('mg-sync-btn').classList.remove('d-none');

    } catch (err) {
      mapEl.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
      mapEl.classList.remove('d-none');
    }

    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-search me-1"></i>${t('integrations.discoverUsers')}`;
  });

  // ── Sync with mapping ──
  document.getElementById('mg-sync-btn').addEventListener('click', async () => {
    if (!discoveredData) return;
    const cookie = document.getElementById('mg-cookie').value.trim();

    const resultEl = document.getElementById('mg-sync-result');
    const btn = document.getElementById('mg-sync-btn');
    btn.disabled = true;
    resultEl.classList.add('d-none');

    // Build nickname → contact_uuid mapping from chips
    const userMap = {};
    document.querySelectorAll('.mg-user-row').forEach(row => {
      const chip = row.querySelector('.contact-chip[data-uuid]');
      if (chip?.dataset.uuid) userMap[row.dataset.nickname] = chip.dataset.uuid;
    });

    try {
      let totalLoves = 0, totalComments = 0, errors = 0;

      for (let i = 0; i < discoveredData.moments.length; i++) {
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${i + 1} / ${discoveredData.moments.length}`;

        try {
          const result = await api.post('/import/momentgarden/sync-one', {
            cookie,
            moment_id: discoveredData.moments[i].moment_id,
            post_id: discoveredData.moments[i].post_id,
            user_map: userMap,
          });
          totalLoves += result.loves;
          totalComments += result.comments;
        } catch { errors++; }
      }

      resultEl.innerHTML = `<div class="alert alert-success">
        <strong>${t('integrations.syncComplete')}</strong><br>
        ${discoveredData.moments.length} ${t('integrations.postsChecked')},
        ${totalComments} ${t('integrations.commentsImported')},
        ${totalLoves} ${t('integrations.lovesFound')}
        ${errors ? `, ${errors} ${t('integrations.errors')}` : ''}
      </div>`;
      resultEl.classList.remove('d-none');
    } catch (err) {
      resultEl.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
      resultEl.classList.remove('d-none');
    }

    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-arrow-repeat me-1"></i>${t('integrations.syncLovesComments')}`;
    loadSyncStatus();
  });

  // ── Cleanup old data ──
  document.getElementById('mg-cleanup-btn').addEventListener('click', async () => {
    const btn = document.getElementById('mg-cleanup-btn');
    const resultEl = document.getElementById('mg-cleanup-result');
    if (!confirm(t('integrations.cleanupConfirm'))) return;

    btn.disabled = true;
    resultEl.classList.add('d-none');

    try {
      const data = await api.post('/import/momentgarden/cleanup');
      resultEl.innerHTML = `<div class="alert alert-success small">
        ${t('integrations.cleanupDone', { reactions: data.deleted_reactions, comments: data.deleted_comments })}
      </div>`;
      resultEl.classList.remove('d-none');
    } catch (err) {
      resultEl.innerHTML = `<div class="alert alert-danger small">${err.message}</div>`;
      resultEl.classList.remove('d-none');
    }
    btn.disabled = false;
  });
}

function bindUserMapHandlers(mapEl) {
  // Clear matched contact → show search
  mapEl.querySelectorAll('.mg-clear-match').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.mg-user-row');
      const matchDiv = row.querySelector('.mg-user-match');
      const nickname = row.dataset.nickname;
      const user = discoveredData?.users?.find(u => u.nickname === nickname);
      matchDiv.innerHTML = `
        <div class="mg-user-search-wrap">
          <input type="text" class="form-control form-control-sm mg-user-search" placeholder="${t('common.search')}" value="${user?.alias || ''}">
          <div class="mg-user-search-results" style="position:absolute;z-index:10;max-height:150px;overflow-y:auto;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-sm);display:none"></div>
        </div>`;
      bindSearchInRow(row);
    });
  });

  // Bind search on rows without a match
  mapEl.querySelectorAll('.mg-user-row').forEach(row => {
    if (!row.querySelector('.contact-chip')) bindSearchInRow(row);
  });
}

let _searchDebounce;
function bindSearchInRow(row) {
  const input = row.querySelector('.mg-user-search');
  const resultsDiv = row.querySelector('.mg-user-search-results');
  if (!input || !resultsDiv) return;

  input.addEventListener('input', () => {
    clearTimeout(_searchDebounce);
    const q = input.value.trim();
    if (q.length < 2) { resultsDiv.style.display = 'none'; return; }
    _searchDebounce = setTimeout(async () => {
      const data = await api.get(`/contacts?search=${encodeURIComponent(q)}&limit=5`);
      resultsDiv.innerHTML = data.contacts.map(c => contactRowHtml(c, { tag: 'div' })).join('');
      resultsDiv.style.display = data.contacts.length ? 'block' : 'none';
      resultsDiv.querySelectorAll('.contact-row').forEach(r => {
        r.style.cursor = 'pointer';
        r.addEventListener('click', () => {
          const c = data.contacts.find(cc => cc.uuid === r.dataset.uuid);
          if (!c) return;
          const matchDiv = row.querySelector('.mg-user-match');
          matchDiv.innerHTML = `
            <span class="contact-chip" data-uuid="${c.uuid}">
              <span class="contact-chip-avatar">
                ${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : `<span>${(c.first_name[0] || '') + (c.last_name?.[0] || '')}</span>`}
              </span>
              ${c.first_name} ${c.last_name || ''}
              <button class="contact-chip-remove mg-clear-match" type="button"><i class="bi bi-x"></i></button>
            </span>`;
          bindUserMapHandlers(row.closest('.mg-user-list') || row.parentElement);
        });
      });
    }, 200);
  });

  input.addEventListener('blur', () => setTimeout(() => { resultsDiv.style.display = 'none'; }, 200));

  // Auto-search on load if alias is pre-filled
  if (input.value.trim().length >= 2) {
    input.dispatchEvent(new Event('input'));
  }
}

let discoveredData = null;

async function loadJSZip() {
  if (window.JSZip) return window.JSZip;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => resolve(window.JSZip);
    script.onerror = () => reject(new Error('Failed to load JSZip'));
    document.head.appendChild(script);
  });
}
