import { api } from '../api/client.js';
import { renderPostList } from '../components/post-list.js';
import { t } from '../utils/i18n.js';

export async function renderMemories() {
  const content = document.getElementById('app-content');

  const today = new Date();
  const monthName = today.toLocaleDateString(document.documentElement.lang || 'nb', { month: 'long', day: 'numeric' });

  content.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h2><i class="bi bi-clock-history"></i> ${t('memories.title')}</h2>
      </div>
      <p class="text-muted mb-4">${t('memories.subtitle', { date: monthName })}</p>
      <div id="memories-list" class="timeline">
        <div class="loading">${t('app.loading')}</div>
      </div>
    </div>
  `;

  const reload = () => renderPostList('memories-list', null, reload, { endpoint: '/posts/memories' });
  await reload();

  // Inject year-group headers between post cards whose years differ
  const listEl = document.getElementById('memories-list');
  if (!listEl) return;
  const currentYear = today.getFullYear();
  let lastYear = null;
  for (const card of [...listEl.querySelectorAll('.timeline-post')]) {
    const dateEl = card.querySelector('.post-date');
    if (!dateEl) continue;
    const year = parseDateYear(dateEl.textContent);
    if (year && year !== lastYear) {
      const yearsAgo = currentYear - year;
      const label = yearsAgo === 1
        ? t('memories.oneYearAgo', { year })
        : t('memories.yearsAgo', { n: yearsAgo, year });
      const header = document.createElement('div');
      header.className = 'memories-year-header';
      header.innerHTML = `<span>${label}</span>`;
      card.before(header);
      lastYear = year;
    }
  }
}

function parseDateYear(text) {
  const m = text.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}
