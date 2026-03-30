import { api } from '../api/client.js';
import { state, navigate } from '../app.js';
import { t } from '../utils/i18n.js';
import { confirmDialog } from '../components/dialogs.js';

export async function renderRelationshipSuggestions() {
  const content = document.getElementById('app-content');

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <button class="btn btn-link btn-back" id="btn-back"><i class="bi bi-arrow-left"></i></button>
        <h2><i class="bi bi-diagram-3"></i> ${t('relationships.suggestions')}</h2>
        <div></div>
      </div>
      <p class="text-muted small mb-3">${t('relationships.suggestionsDesc')}</p>
      <div id="suggestions-list">
        <div class="loading">${t('app.loading')}</div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => window.history.back());
  await loadSuggestions();
}

async function loadSuggestions() {
  const el = document.getElementById('suggestions-list');
  if (!el) return;

  try {
    const { suggestions } = await api.get('/relationships/suggestions');

    if (!suggestions.length) {
      el.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-check-circle"></i>
          <p>${t('relationships.noSuggestions')}</p>
        </div>
      `;
      return;
    }

    const reasonLabels = {
      siblings: t('relationships.reason.siblings'),
      partner_children: t('relationships.reason.partnerChildren'),
      grandparent: t('relationships.reason.grandparent'),
      uncle_aunt: t('relationships.reason.uncleAunt'),
    };

    // Filter out dismissed suggestions
    const dismissed = JSON.parse(localStorage.getItem('dismissedSuggestions') || '[]');
    const filtered = suggestions.filter(s => {
      const key = `${s.contact1.uuid}_${s.contact2.uuid}_${s.suggested_type}`;
      return !dismissed.includes(key);
    });

    el.innerHTML = `
      <p class="text-muted small mb-2">${t('relationships.suggestionsCount', { count: filtered.length })}</p>
      ${filtered.map((s, i) => {
        const key = `${s.contact1.uuid}_${s.contact2.uuid}_${s.suggested_type}`;
        return `
        <div class="settings-section glass-card mb-2 suggestion-card" data-index="${i}" data-key="${key}">
          <div class="d-flex align-items-center gap-3">
            <div class="flex-fill">
              <strong>${s.contact1.first_name} ${s.contact1.last_name || ''}</strong>
              <span class="text-muted mx-1">↔</span>
              <strong>${s.contact2.first_name} ${s.contact2.last_name || ''}</strong>
              <div class="text-muted small mt-1">
                <span class="badge bg-primary badge-sm">${t('relationships.types.' + s.suggested_type)}</span>
                <span class="ms-1">${reasonLabels[s.reason] || s.reason}</span>
              </div>
            </div>
            <div class="d-flex gap-1">
              <button class="btn btn-primary btn-sm btn-accept" data-index="${i}" title="${t('relationships.accept')}">
                <i class="bi bi-check-lg"></i>
              </button>
              <button class="btn btn-outline-secondary btn-sm btn-dismiss" data-index="${i}" title="${t('relationships.dismiss')}">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
        </div>`; }).join('')}
    `;

    const suggestionsData = filtered;

    // Accept
    el.querySelectorAll('.btn-accept').forEach(btn => {
      btn.addEventListener('click', async () => {
        const s = suggestionsData[parseInt(btn.dataset.index)];
        if (!s || !s.type_id) return;
        try {
          await api.post('/relationships', {
            contact_uuid: s.contact1.uuid,
            related_contact_uuid: s.contact2.uuid,
            relationship_type_id: s.type_id,
          });
          btn.closest('.suggestion-card').remove();
          // Update count
          const remaining = el.querySelectorAll('.suggestion-card').length;
          if (!remaining) loadSuggestions();
        } catch (err) {
          confirmDialog(err.message, { title: t('common.error'), confirmText: t('common.ok'), confirmClass: 'btn-primary' });
        }
      });
    });

    // Dismiss (remove from UI + remember in localStorage)
    el.querySelectorAll('.btn-dismiss').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.suggestion-card');
        const key = card?.dataset.key;
        if (key) {
          const dismissed = JSON.parse(localStorage.getItem('dismissedSuggestions') || '[]');
          if (!dismissed.includes(key)) { dismissed.push(key); localStorage.setItem('dismissedSuggestions', JSON.stringify(dismissed)); }
        }
        card.remove();
        const remaining = el.querySelectorAll('.suggestion-card').length;
        if (!remaining) loadSuggestions();
      });
    });

  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}
