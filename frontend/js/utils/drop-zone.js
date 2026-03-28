const DOC_TYPES = ['application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv'];

function isAllowed(file, acceptDocs) {
  if (file.type.startsWith('image/')) return true;
  if (acceptDocs && DOC_TYPES.includes(file.type)) return true;
  return false;
}

/**
 * Make an element accept drag-and-drop files (images + optionally documents).
 * @param {HTMLElement} el - The drop target element
 * @param {function} onFiles - Callback with array of File objects
 * @param {{ acceptDocuments?: boolean }} opts
 */
export function enableDropZone(el, onFiles, opts = {}) {
  const acceptDocs = opts.acceptDocuments || false;

  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.classList.add('drop-active');
  });

  el.addEventListener('dragleave', (e) => {
    if (!el.contains(e.relatedTarget)) {
      el.classList.remove('drop-active');
    }
  });

  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.classList.remove('drop-active');

    const files = [];

    // 1. Dropped files from filesystem
    if (e.dataTransfer.files?.length) {
      for (const file of e.dataTransfer.files) {
        if (isAllowed(file, acceptDocs)) files.push(file);
      }
    }

    // 2. Dropped image URL (e.g. dragged from Facebook, browser, etc.)
    if (!files.length) {
      const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          if (blob.type.startsWith('image/')) {
            files.push(new File([blob], 'dropped-image.jpg', { type: blob.type }));
          }
        } catch {}
      }
    }

    // 3. Dropped HTML with img src (some browsers send HTML instead of URL)
    if (!files.length) {
      const html = e.dataTransfer.getData('text/html');
      if (html) {
        const match = html.match(/src="(https?:\/\/[^"]+)"/);
        if (match) {
          try {
            const response = await fetch(match[1]);
            const blob = await response.blob();
            if (blob.type.startsWith('image/')) {
              files.push(new File([blob], 'dropped-image.jpg', { type: blob.type }));
            }
          } catch {}
        }
      }
    }

    if (files.length) onFiles(files);
  });

  // Also support paste (Ctrl+V) for images
  el.addEventListener('paste', (e) => {
    const files = [];
    for (const item of (e.clipboardData?.items || [])) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length) {
      e.preventDefault();
      onFiles(files);
    }
  });
}
