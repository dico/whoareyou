import { api } from '../api/client.js';
import { authUrl } from '../utils/auth-url.js';

// Markup format: @[uuid:DisplayName]
// DOM representation: <span class="mention-token" contenteditable="false" data-uuid data-name>Name</span>
const MENTION_RE = /@\[([0-9a-fA-F-]{8,}):([^\]]+)\]/g;

export function parseMentionMarkup(str) {
  // Returns an array of { type: 'text', value } | { type: 'mention', uuid, name }
  const parts = [];
  let last = 0;
  if (!str) return parts;
  str.replace(MENTION_RE, (match, uuid, name, offset) => {
    if (offset > last) parts.push({ type: 'text', value: str.slice(last, offset) });
    parts.push({ type: 'mention', uuid, name });
    last = offset + match.length;
    return match;
  });
  if (last < str.length) parts.push({ type: 'text', value: str.slice(last) });
  return parts;
}

export function extractMentionUuids(str) {
  const uuids = new Set();
  if (!str) return [];
  str.replace(MENTION_RE, (_m, uuid) => { uuids.add(uuid); return ''; });
  return [...uuids];
}

function makeToken(contact) {
  const span = document.createElement('span');
  span.className = 'mention-token';
  span.setAttribute('contenteditable', 'false');
  span.dataset.uuid = contact.uuid;
  span.dataset.name = contact.name || contact.first_name || '';
  span.textContent = span.dataset.name;
  return span;
}

export function createMentionInput({ el, value = '', placeholder = '', onChange, onTag } = {}) {
  el.setAttribute('contenteditable', 'plaintext-only');
  el.classList.add('mention-input');
  if (placeholder) el.dataset.placeholder = placeholder;

  let dropdown = null;
  let dropdownContacts = [];
  let searchTimeout = null;
  let savedRange = null;

  function setValue(markup) {
    el.innerHTML = '';
    for (const part of parseMentionMarkup(markup || '')) {
      if (part.type === 'text') {
        el.appendChild(document.createTextNode(part.value));
      } else {
        el.appendChild(makeToken({ uuid: part.uuid, name: part.name }));
      }
    }
  }

  function getValue() {
    let out = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.nodeValue;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.classList?.contains('mention-token')) {
          out += `@[${node.dataset.uuid}:${node.dataset.name}]`;
        } else if (node.tagName === 'BR') {
          out += '\n';
        } else {
          // Other elements (paste-fallout) — flatten to text
          out += node.textContent || '';
        }
      }
    }
    return out;
  }

  function focus() {
    el.focus();
    placeCaretAtEnd();
  }

  function clear() {
    el.innerHTML = '';
  }

  function placeCaretAtEnd() {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function getMentionQuery() {
    // Look at the text node immediately before the caret for "@..."
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer)) return null;
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    const text = range.startContainer.nodeValue || '';
    const caret = range.startOffset;
    const before = text.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at === -1) return null;
    // @ must be at start, or preceded by whitespace
    if (at > 0 && !/\s/.test(before[at - 1])) return null;
    const query = before.slice(at + 1);
    if (/\s/.test(query)) return null;
    return { node: range.startContainer, atOffset: at, caretOffset: caret, query };
  }

  function closeDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
    dropdownContacts = [];
  }

  function positionDropdown() {
    if (!dropdown) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    let rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) rect = el.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 4}px`;
  }

  function showDropdown(contacts) {
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'mention-dropdown glass-card';
      dropdown.style.position = 'fixed';
      dropdown.style.zIndex = '2000';
      document.body.appendChild(dropdown);
    }
    dropdownContacts = contacts;
    dropdown.innerHTML = contacts.map((c, i) => `
      <div class="mention-item ${i === 0 ? 'active' : ''}" data-index="${i}">
        <span class="mention-avatar">${c.avatar ? `<img src="${authUrl(c.avatar)}" alt="">` : (c.first_name?.[0] || '') + (c.last_name?.[0] || '')}</span>
        <span>${escape(c.first_name)} ${escape(c.last_name || '')}</span>
      </div>
    `).join('');
    dropdown.querySelectorAll('.mention-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectFromDropdown(parseInt(item.dataset.index));
      });
    });
    positionDropdown();
  }

  function escape(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  async function searchContacts(query) {
    try {
      const params = new URLSearchParams({ limit: '6' });
      if (query) params.set('q', query);
      const data = await api.get(`/contacts/mention-suggestions?${params}`);
      if (!data.contacts?.length) { closeDropdown(); return; }
      showDropdown(data.contacts);
    } catch {
      closeDropdown();
    }
  }

  function selectFromDropdown(index) {
    const c = dropdownContacts[index];
    if (!c) return;
    insertMention(c);
  }

  function insertMention(contact) {
    // Replace the active @query (if any) with a token + trailing space
    const ctx = getMentionQuery();
    const sel = window.getSelection();

    if (ctx) {
      const { node, atOffset, caretOffset } = ctx;
      const before = node.nodeValue.slice(0, atOffset);
      const after = node.nodeValue.slice(caretOffset);
      const beforeNode = document.createTextNode(before);
      const afterNode = document.createTextNode(after || ' ');
      const token = makeToken({
        uuid: contact.uuid,
        name: contact.first_name || contact.name || '',
      });
      const parent = node.parentNode;
      parent.replaceChild(beforeNode, node);
      beforeNode.after(token);
      // Insert a regular space after token so caret has a place to land
      const space = document.createTextNode(' ');
      token.after(space);
      if (after) space.after(afterNode);
      // Place caret right after the space
      const range = document.createRange();
      range.setStartAfter(space);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      // No active @query — append token at caret
      const token = makeToken({
        uuid: contact.uuid,
        name: contact.first_name || contact.name || '',
      });
      const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
      if (range && el.contains(range.startContainer)) {
        range.insertNode(token);
        const space = document.createTextNode(' ');
        token.after(space);
        const r2 = document.createRange();
        r2.setStartAfter(space);
        r2.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r2);
      } else {
        el.appendChild(token);
        el.appendChild(document.createTextNode(' '));
        placeCaretAtEnd();
      }
    }

    closeDropdown();
    onChange?.();
    onTag?.({
      uuid: contact.uuid,
      first_name: contact.first_name,
      last_name: contact.last_name,
      avatar: contact.avatar || null,
    });
  }

  // Input handling — trigger search on @
  el.addEventListener('input', () => {
    onChange?.();
    const ctx = getMentionQuery();
    if (!ctx) { closeDropdown(); return; }
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchContacts(ctx.query), 200);
  });

  el.addEventListener('keydown', (e) => {
    if (dropdown) {
      const items = dropdown.querySelectorAll('.mention-item');
      const active = dropdown.querySelector('.mention-item.active');
      let idx = [...items].indexOf(active);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        idx = Math.min(idx + 1, items.length - 1);
        items.forEach(i => i.classList.remove('active'));
        items[idx]?.classList.add('active');
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
        items.forEach(i => i.classList.remove('active'));
        items[idx]?.classList.add('active');
        return;
      }
      if (e.key === 'Enter' && active) {
        e.preventDefault();
        selectFromDropdown(parseInt(active.dataset.index));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDropdown();
        return;
      }
    }

    // Backspace immediately after a token → remove the whole token
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (!range.collapsed) return;
      const { startContainer, startOffset } = range;
      let prev = null;
      if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
        prev = startContainer.previousSibling;
      } else if (startContainer === el && startOffset > 0) {
        prev = el.childNodes[startOffset - 1];
      }
      // Skip over an immediately-preceding non-breaking space we inserted
      if (prev?.nodeType === Node.TEXT_NODE && prev.nodeValue === ' ') {
        const prior = prev.previousSibling;
        if (prior?.classList?.contains('mention-token')) {
          e.preventDefault();
          prev.remove();
          prior.remove();
          onChange?.();
          return;
        }
      }
      if (prev?.classList?.contains('mention-token')) {
        e.preventDefault();
        prev.remove();
        onChange?.();
        return;
      }
    }
  });

  el.addEventListener('blur', () => {
    // Delay so a mousedown on the dropdown is processed first
    setTimeout(closeDropdown, 200);
  });

  // Paste — strip formatting, keep text only
  el.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  });

  window.addEventListener('scroll', () => { if (dropdown) positionDropdown(); }, true);
  window.addEventListener('resize', () => { if (dropdown) positionDropdown(); });

  if (value) setValue(value);

  return {
    el,
    getValue,
    setValue,
    focus,
    clear,
    insertMention,
    destroy() {
      closeDropdown();
    },
  };
}
