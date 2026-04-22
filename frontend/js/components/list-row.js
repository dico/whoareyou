/**
 * Standardized list row — icon/thumb + title/meta + optional actions.
 * Used by any list where each row shows a visual identifier, text info,
 * and inline actions (buttons, dropdown, custom picker).
 *
 * See design-guidelines.md rule 34 and .list-row / .list-row-* CSS in base.css.
 *
 * @param {object} opts
 * @param {string} [opts.icon]       Bootstrap icon name (e.g. 'bi-tv') rendered inside .list-row-icon
 * @param {string} [opts.iconHtml]   Custom HTML for the icon slot (overrides icon). E.g. <img>.
 * @param {string} [opts.iconClass]  Extra class on .list-row-icon (e.g. 'is-inactive')
 * @param {string} [opts.iconColor]  Foreground color for the default icon palette
 * @param {string} [opts.iconBg]     Background color for the default icon palette
 * @param {string} opts.title        Title text — MUST already be escaped if user-supplied
 * @param {string} [opts.meta]       Meta HTML under the title — MUST already be escaped if user-supplied
 * @param {string} [opts.actions]    HTML for the actions slot (buttons, dropdown, etc.)
 * @param {string} [opts.href]       If set, the info block is wrapped in <a href=...>
 * @param {object} [opts.data]       Data attributes to set on the root (e.g. { bookUuid: '...' })
 * @param {string} [opts.extraClass] Extra classes on the root (e.g. 'glass-card mg-author-row')
 * @param {boolean} [opts.clickable] Adds cursor:pointer — caller wires the click handler
 * @returns {string} HTML string
 */
export function listRowHtml(opts = {}) {
  const {
    icon,
    iconHtml,
    iconClass = '',
    iconColor,
    iconBg,
    title = '',
    meta = '',
    actions = '',
    href,
    data = {},
    extraClass = '',
    clickable = false,
  } = opts;

  const iconSlot = iconHtml
    ? iconHtml
    : icon ? `<i class="bi ${icon}"></i>` : '';

  const iconStyleParts = [];
  if (iconBg) iconStyleParts.push(`--list-row-icon-bg:${iconBg}`);
  if (iconColor) iconStyleParts.push(`--list-row-icon-color:${iconColor}`);
  const iconStyle = iconStyleParts.length ? ` style="${iconStyleParts.join(';')}"` : '';

  const dataAttrs = Object.entries(data)
    .map(([k, v]) => ` data-${kebab(k)}="${escapeAttr(v)}"`)
    .join('');

  const rootClass = `list-row ${extraClass}`.trim();
  const rootStyle = clickable ? ' style="cursor:pointer"' : '';

  const infoInner = `
    ${title ? `<p class="list-row-title">${title}</p>` : ''}
    ${meta ? `<p class="list-row-meta">${meta}</p>` : ''}
  `;
  const infoBlock = href
    ? `<a href="${escapeAttr(href)}" data-link class="list-row-info">${infoInner}</a>`
    : `<div class="list-row-info">${infoInner}</div>`;

  return `
    <div class="${rootClass}"${rootStyle}${dataAttrs}>
      ${iconSlot ? `<div class="list-row-icon ${iconClass}"${iconStyle}>${iconSlot}</div>` : ''}
      ${infoBlock}
      ${actions ? `<div class="list-row-actions">${actions}</div>` : ''}
    </div>
  `;
}

function escapeAttr(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function kebab(s) {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase();
}
