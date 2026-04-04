import { api } from '../api/client.js';
import { confirmDialog } from './dialogs.js';
import { showCropper } from './image-cropper.js';
import { authUrl } from '../utils/auth-url.js';

/**
 * Show a photo viewer/manager modal for a contact or company/group.
 * Features: browse photos, set primary, delete, upload, drag-and-drop, crop.
 *
 * @param {string} contactUuid - entity UUID
 * @param {Array} photos - photos array
 * @param {number} startIndex - which photo to show first
 * @param {function} onChanged - callback when photos change
 * @param {object} [opts] - options
 * @param {string} [opts.apiBase] - API base path (default: `/contacts/${contactUuid}`)
 */
export function showPhotoViewer(contactUuid, photos, startIndex = 0, onChanged, opts = {}) {
  const apiBase = opts.apiBase || `/contacts/${contactUuid}`;
  const skipCrop = !!opts.skipCrop;
  let currentIndex = startIndex;
  const id = 'photo-viewer-' + Date.now();

  const html = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content" style="background:#000;border:none;overflow:hidden;border-radius:var(--radius-lg)">
          <!-- Viewer -->
          <div id="${id}-viewer" class="photo-viewer">
            ${photos.length ? `
              <img id="${id}-img" src="${authUrl(photos[currentIndex].file_path)}" alt="">
              ${photos.length > 1 ? `
                <button class="photo-viewer-nav photo-viewer-prev" id="${id}-prev"><i class="bi bi-chevron-left"></i></button>
                <button class="photo-viewer-nav photo-viewer-next" id="${id}-next"><i class="bi bi-chevron-right"></i></button>
              ` : ''}
            ` : `
              <div class="text-center text-white p-5">
                <i class="bi bi-camera" style="font-size:3rem;opacity:0.3"></i>
                <p class="mt-2">No photos yet</p>
              </div>
            `}
          </div>
          <!-- Footer -->
          <div class="photo-viewer-footer" style="background:var(--color-surface)">
            <div>
              <span id="${id}-caption" class="photo-viewer-caption">
                ${photos.length ? `${currentIndex + 1} of ${photos.length}` : ''}
              </span>
            </div>
            <div class="d-flex gap-1">
              <label class="edit-action" title="Upload photo" style="cursor:pointer">
                <i class="bi bi-upload"></i>
                <input type="file" id="${id}-upload" accept="image/*" hidden>
              </label>
              ${photos.length ? `
                <button class="edit-action" id="${id}-set-primary" title="Set as profile photo">
                  <i class="bi bi-star"></i>
                </button>
                <button class="edit-action" id="${id}-delete" title="Delete photo" style="color:var(--color-danger)">
                  <i class="bi bi-trash"></i>
                </button>
              ` : ''}
            </div>
          </div>
          <!-- Drop zone overlay -->
          <div id="${id}-dropzone" class="d-none" style="position:absolute;inset:0;z-index:10">
            <div class="drop-zone drag-over" style="height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column">
              <i class="bi bi-cloud-arrow-up" style="font-size:3rem"></i>
              <p>Drop image here</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  const modalEl = document.getElementById(id);
  const modal = new bootstrap.Modal(modalEl);

  function updateView() {
    const img = document.getElementById(`${id}-img`);
    const caption = document.getElementById(`${id}-caption`);
    const primaryBtn = document.getElementById(`${id}-set-primary`);
    if (img && photos[currentIndex]) {
      img.src = authUrl(photos[currentIndex].file_path);
      const photo = photos[currentIndex];
      const isPrimary = photo.is_primary;
      caption.textContent = `${currentIndex + 1} of ${photos.length}${isPrimary ? '  ·  Profile photo' : ''}`;
      if (primaryBtn) {
        primaryBtn.innerHTML = isPrimary
          ? '<i class="bi bi-star-fill" style="color:var(--color-warning)"></i>'
          : '<i class="bi bi-star"></i>';
        primaryBtn.title = isPrimary ? 'Current profile photo' : 'Set as profile photo';
      }
    }
  }

  // Navigation
  document.getElementById(`${id}-prev`)?.addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + photos.length) % photos.length;
    updateView();
  });

  document.getElementById(`${id}-next`)?.addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % photos.length;
    updateView();
  });

  // Keyboard navigation
  const onKey = (e) => {
    if (e.key === 'ArrowLeft') {
      currentIndex = (currentIndex - 1 + photos.length) % photos.length;
      updateView();
    } else if (e.key === 'ArrowRight') {
      currentIndex = (currentIndex + 1) % photos.length;
      updateView();
    }
  };
  modalEl.addEventListener('shown.bs.modal', () => document.addEventListener('keydown', onKey));

  // Set primary
  document.getElementById(`${id}-set-primary`)?.addEventListener('click', async () => {
    const photo = photos[currentIndex];
    if (!photo) return;
    await api.put(`${apiBase}/photos/${photo.id}/primary`);
    modal.hide();
    onChanged?.();
  });

  // Delete
  document.getElementById(`${id}-delete`)?.addEventListener('click', async () => {
    const photo = photos[currentIndex];
    if (!photo) return;
    if (await confirmDialog('Delete this photo?', { title: 'Delete photo', confirmText: 'Delete' })) {
      await api.delete(`${apiBase}/photos/${photo.id}`);
      modal.hide();
      onChanged?.();
    }
  });

  // Upload via button
  document.getElementById(`${id}-upload`)?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await uploadFile(file);
  });

  // Drag and drop
  const viewer = modalEl.querySelector('.modal-content');
  const dropzone = document.getElementById(`${id}-dropzone`);

  viewer.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.remove('d-none');
  });

  dropzone.addEventListener('dragleave', (e) => {
    if (!dropzone.contains(e.relatedTarget)) {
      dropzone.classList.add('d-none');
    }
  });

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.add('d-none');

    // Handle dropped files
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await uploadFile(file);
      return;
    }

    // Handle dropped image URL (e.g. dragged from Facebook)
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        if (blob.type.startsWith('image/')) {
          const file = new File([blob], 'dragged-image.jpg', { type: blob.type });
          await uploadFile(file);
        }
      } catch {}
    }
  });

  async function uploadFile(source) {
    modal.hide();
    let fileData;
    if (skipCrop) {
      fileData = source instanceof File ? source : new File([source], 'photo.jpg', { type: 'image/jpeg' });
    } else {
      const cropped = await showCropper(source);
      if (!cropped) { modal.show(); return; }
      fileData = new File([cropped], 'cropped.jpg', { type: 'image/jpeg' });
    }

    const formData = new FormData();
    formData.append('photo', fileData);
    try {
      await api.upload(`${apiBase}/photos`, formData);
      onChanged?.();
    } catch (err) {
      confirmDialog(err.message, { title: 'Upload failed', confirmText: 'OK', confirmClass: 'btn-primary' });
    }
  }

  // Cleanup
  modalEl.addEventListener('hidden.bs.modal', () => {
    document.removeEventListener('keydown', onKey);
    modalEl.remove();
  }, { once: true });

  modal.show();
  updateView();
}
