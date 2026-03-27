import { t } from './i18n.js';

/**
 * Toggle a visibility button between shared and private.
 * @param {HTMLElement} btn - The button element with data-visibility attribute
 */
export function toggleVisibilityBtn(btn) {
  const current = btn.dataset.visibility;
  if (current === 'shared') {
    btn.dataset.visibility = 'private';
    btn.innerHTML = `<i class="bi bi-lock-fill"></i> ${t('visibility.private')}`;
    btn.nextElementSibling.textContent = t('visibility.privateHint');
  } else {
    btn.dataset.visibility = 'shared';
    btn.innerHTML = `<i class="bi bi-people-fill"></i> ${t('visibility.shared')}`;
    btn.nextElementSibling.textContent = t('visibility.sharedHint');
  }
}

/**
 * Create visibility toggle HTML.
 * @param {string} idPrefix - Prefix for element IDs
 * @param {string} currentVisibility - 'shared' or 'private'
 * @returns {string} HTML string
 */
export function visibilityToggleHtml(idPrefix, currentVisibility = 'shared') {
  const isPrivate = currentVisibility === 'private';
  return `
    <div class="visibility-toggle">
      <button type="button" class="btn btn-sm visibility-btn" id="${idPrefix}-visibility-btn" data-visibility="${currentVisibility}">
        <i class="bi bi-${isPrivate ? 'lock-fill' : 'people-fill'}"></i> ${isPrivate ? t('visibility.private') : t('visibility.shared')}
      </button>
      <span class="visibility-hint text-muted small">${isPrivate ? t('visibility.privateHint') : t('visibility.sharedHint')}</span>
    </div>
  `;
}
