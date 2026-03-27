import { api } from '../api/client.js';

/**
 * Attach @-mention support to a textarea.
 * When user types @, shows a dropdown with contact search.
 * Selected contact is added via the onTag callback.
 *
 * @param {HTMLTextAreaElement} textarea
 * @param {function} onTag - Called with { uuid, first_name, last_name }
 */
export function attachMention(textarea, onTag) {
  let dropdown = null;
  let searchTimeout = null;
  let mentionStart = -1;

  textarea.addEventListener('input', () => {
    const text = textarea.value;
    const cursor = textarea.selectionStart;

    // Find @ before cursor
    const before = text.substring(0, cursor);
    const atIndex = before.lastIndexOf('@');

    if (atIndex === -1 || (atIndex > 0 && before[atIndex - 1] !== ' ' && before[atIndex - 1] !== '\n')) {
      closeMention();
      return;
    }

    const query = before.substring(atIndex + 1);

    // Close if space after query (mention ended)
    if (query.includes('\n')) {
      closeMention();
      return;
    }

    mentionStart = atIndex;

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchContacts(query), 200);
  });

  textarea.addEventListener('keydown', (e) => {
    if (!dropdown) return;

    const items = dropdown.querySelectorAll('.mention-item');
    const active = dropdown.querySelector('.mention-item.active');
    let index = [...items].indexOf(active);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      index = Math.min(index + 1, items.length - 1);
      items.forEach((i) => i.classList.remove('active'));
      items[index]?.classList.add('active');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      index = Math.max(index - 1, 0);
      items.forEach((i) => i.classList.remove('active'));
      items[index]?.classList.add('active');
    } else if (e.key === 'Enter' && active) {
      e.preventDefault();
      selectContact(active);
    } else if (e.key === 'Escape') {
      closeMention();
    }
  });

  textarea.addEventListener('blur', () => {
    // Delay to allow click on dropdown
    setTimeout(closeMention, 200);
  });

  async function searchContacts(query) {
    try {
      const params = new URLSearchParams({ limit: '6' });
      if (query) params.set('search', query);
      const data = await api.get(`/contacts?${params}`);

      if (data.contacts.length === 0) {
        closeMention();
        return;
      }

      showDropdown(data.contacts);
    } catch {
      closeMention();
    }
  }

  function showDropdown(contacts) {
    closeMention();

    dropdown = document.createElement('div');
    dropdown.className = 'mention-dropdown glass-card';

    // Position below textarea
    const rect = textarea.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.width = `${Math.min(rect.width, 300)}px`;
    dropdown.style.zIndex = '2000';

    dropdown.innerHTML = contacts.map((c, i) => `
      <div class="mention-item ${i === 0 ? 'active' : ''}" data-uuid="${c.uuid}" data-first="${c.first_name}" data-last="${c.last_name || ''}">
        <span class="mention-avatar">${(c.first_name[0] || '') + (c.last_name?.[0] || '')}</span>
        <span>${c.first_name} ${c.last_name || ''}</span>
      </div>
    `).join('');

    dropdown.querySelectorAll('.mention-item').forEach((item) => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectContact(item);
      });
    });

    document.body.appendChild(dropdown);
  }

  function selectContact(item) {
    const contact = {
      uuid: item.dataset.uuid,
      first_name: item.dataset.first,
      last_name: item.dataset.last,
    };

    // Replace @query with name in textarea
    const name = `${contact.first_name} ${contact.last_name || ''}`.trim();
    const before = textarea.value.substring(0, mentionStart);
    const after = textarea.value.substring(textarea.selectionStart);
    textarea.value = `${before}${name} ${after}`;
    textarea.selectionStart = textarea.selectionEnd = mentionStart + name.length + 1;
    textarea.focus();

    onTag(contact);
    closeMention();
  }

  function closeMention() {
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
    }
  }
}
