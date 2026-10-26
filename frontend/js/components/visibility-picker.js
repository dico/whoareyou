import { api } from '../api/client.js';
import { t } from '../utils/i18n.js';

/**
 * Post visibility picker — a compact dropdown replacing the old three-way
 * pill. Options: Alle (shared), Familie (family), one entry per visibility
 * circle the user belongs to (e.g. "Foreldre"), and Bare meg (private).
 *
 * Usage:
 *   container.innerHTML = visibilityPickerHtml('post-visibility');
 *   const picker = attachVisibilityPicker(document.getElementById('post-visibility'));
 *   api.post('/posts', { ...picker.value() });   // { visibility, circle_uuid }
 *   picker.reset();
 *
 * The same option list is used by the post "…" menu via
 * visibilityMenuItemsHtml() so both stay in sync.
 */

const BASE_OPTIONS = [
  { vis: 'shared', icon: 'bi-globe2', label: () => t('visibility.shared'), hint: () => t('visibility.sharedHint') },
  { vis: 'family', icon: 'bi-people-fill', label: () => t('visibility.family'), hint: () => t('visibility.familyHint') },
];
const PRIVATE_OPTION = { vis: 'private', icon: 'bi-lock-fill', label: () => t('visibility.private'), hint: () => t('visibility.privateHint') };
export const CIRCLE_ICON = 'bi-person-heart';

let circlesPromise = null;
let circlesSession = null;

/**
 * Circles the current user belongs to — cached per login session (keyed by
 * the refresh token) so a logout + login as someone else in the same tab
 * never reuses the previous user's list.
 */
export function loadMyCircles() {
  const session = localStorage.getItem('refreshToken');
  if (session !== circlesSession) { circlesSession = session; circlesPromise = null; }
  if (!circlesPromise) {
    circlesPromise = api.get('/circles/mine').then(r => r.circles || []).catch(() => {
      circlesPromise = null;
      return [];
    });
  }
  return circlesPromise;
}

/** Call after admin changes to circles so pickers reload. */
export function invalidateCircles() {
  circlesPromise = null;
}

function allOptions(circles) {
  return [
    ...BASE_OPTIONS,
    ...circles.map(c => ({
      vis: 'circle', circleUuid: c.uuid, icon: CIRCLE_ICON,
      label: () => c.name, hint: () => t('visibility.circleHint', { name: c.name }),
    })),
    PRIVATE_OPTION,
  ];
}

function isSelected(opt, vis, circleUuid) {
  return opt.vis === vis && (vis !== 'circle' || opt.circleUuid === circleUuid);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/** Icon + title for a post's current visibility (used in post headers). */
export function visibilityIconHtml(post) {
  if (post.visibility === 'private') return `<i class="bi bi-lock-fill text-muted post-visibility-icon" title="${t('visibility.private')}"></i>`;
  if (post.visibility === 'family') return `<i class="bi bi-people-fill text-muted post-visibility-icon" title="${t('visibility.family')}"></i>`;
  if (post.visibility === 'circle') {
    const name = post.circle?.name || t('visibility.circle');
    return `<span class="post-visibility-icon post-circle-badge" title="${escapeHtml(t('visibility.circleHint', { name }))}"><i class="bi ${CIRCLE_ICON}"></i> ${escapeHtml(name)}</span>`;
  }
  return '';
}

/**
 * <li> items for a dropdown menu (post "…" menu). Each item carries
 * data-vis and data-circle-uuid; the caller wires the click handler.
 */
export function visibilityMenuItemsHtml(circles, current, { itemClass, dataAttrs = '' }) {
  return allOptions(circles).map(o => `
    <li><a class="dropdown-item ${itemClass}" href="#" ${dataAttrs} data-vis="${o.vis}" data-circle-uuid="${o.circleUuid || ''}">
      <i class="bi ${o.icon} me-2"></i>${escapeHtml(o.label())} ${isSelected(o, current.visibility, current.circle_uuid) ? '<i class="bi bi-check"></i>' : ''}
    </a></li>`).join('');
}

/** Markup for the picker button + (initially base-only) menu. */
export function visibilityPickerHtml(id, { visibility = 'shared', circleUuid = null } = {}) {
  return `
    <div class="dropdown visibility-picker" id="${id}" data-visibility="${visibility}" data-circle-uuid="${circleUuid || ''}">
      <button type="button" class="visibility-picker-btn" data-bs-toggle="dropdown" aria-expanded="false" title="${t('visibility.title')}">
        <i class="bi bi-globe2"></i><span class="visibility-picker-label">${t('visibility.shared')}</span><i class="bi bi-chevron-down visibility-picker-caret"></i>
      </button>
      <ul class="dropdown-menu glass-dropdown visibility-picker-menu"></ul>
    </div>`;
}

/**
 * Wire up a picker rendered by visibilityPickerHtml(). Loads the user's
 * circles asynchronously and rebuilds the menu when they arrive.
 * @returns {{ value: () => { visibility: string, circle_uuid?: string }, reset: () => void }}
 */
export function attachVisibilityPicker(root) {
  const btn = root.querySelector('.visibility-picker-btn');
  const menu = root.querySelector('.visibility-picker-menu');
  let circles = [];
  const initial = { visibility: root.dataset.visibility || 'shared', circleUuid: root.dataset.circleUuid || null };

  function current() {
    return { visibility: root.dataset.visibility, circleUuid: root.dataset.circleUuid || null };
  }

  function render() {
    const cur = current();
    const opts = allOptions(circles);
    // A saved circle the user is no longer in falls back to a generic label
    const selected = opts.find(o => isSelected(o, cur.visibility, cur.circleUuid))
      || { icon: CIRCLE_ICON, label: () => t('visibility.circle') };
    btn.innerHTML = `<i class="bi ${selected.icon}"></i><span class="visibility-picker-label">${escapeHtml(selected.label())}</span><i class="bi bi-chevron-down visibility-picker-caret"></i>`;
    btn.classList.toggle('is-restricted', cur.visibility !== 'shared');

    menu.innerHTML = opts.map((o, i) => `
      ${o.vis === 'circle' && opts[i - 1]?.vis !== 'circle' ? `<li><h6 class="dropdown-header">${t('visibility.circles')}</h6></li>` : ''}
      <li><a class="dropdown-item visibility-picker-item ${isSelected(o, cur.visibility, cur.circleUuid) ? 'active' : ''}" href="#" data-index="${i}">
        <i class="bi ${o.icon}"></i>
        <span><span class="visibility-picker-item-label">${escapeHtml(o.label())}</span><span class="visibility-picker-item-hint">${escapeHtml(o.hint())}</span></span>
      </a></li>`).join('');
    menu.querySelectorAll('.visibility-picker-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const o = opts[Number(item.dataset.index)];
        root.dataset.visibility = o.vis;
        root.dataset.circleUuid = o.circleUuid || '';
        render();
      });
    });
  }

  render();
  loadMyCircles().then(list => { circles = list; render(); });

  return {
    value() {
      const cur = current();
      return cur.visibility === 'circle'
        ? { visibility: 'circle', circle_uuid: cur.circleUuid }
        : { visibility: cur.visibility };
    },
    reset() {
      root.dataset.visibility = initial.visibility;
      root.dataset.circleUuid = initial.circleUuid || '';
      render();
    },
  };
}
