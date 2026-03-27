/**
 * Image cropper modal.
 * Shows image with a fixed circular viewport. User drags to pan, scrolls to zoom.
 * Returns a cropped blob via callback.
 *
 * @param {File|Blob|string} source - File, Blob, or image URL
 * @param {object} options - { aspectRatio, viewportSize }
 * @returns {Promise<Blob|null>} - Cropped image blob, or null if cancelled
 */
export function showCropper(source, options = {}) {
  const {
    viewportSize = 250,
  } = options;

  return new Promise((resolve) => {
    const id = 'cropper-' + Date.now();

    const html = `
      <div class="modal fade" id="${id}" tabindex="-1" data-bs-backdrop="static">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content" style="background:var(--color-surface);border-radius:var(--radius-lg);overflow:hidden">
            <div class="modal-header">
              <h5 class="modal-title">Crop photo</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-0">
              <div class="cropper-area" id="${id}-area">
                <canvas id="${id}-canvas"></canvas>
                <div class="cropper-viewport" id="${id}-viewport" style="width:${viewportSize}px;height:${viewportSize}px"></div>
              </div>
              <div class="cropper-controls">
                <i class="bi bi-dash"></i>
                <input type="range" id="${id}-zoom" min="1" max="5" step="0.05" value="1" class="cropper-zoom">
                <i class="bi bi-plus"></i>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="edit-action" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="edit-action edit-action-primary" id="${id}-save">Save</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const modalEl = document.getElementById(id);
    const modal = new bootstrap.Modal(modalEl);

    const canvas = document.getElementById(`${id}-canvas`);
    const ctx = canvas.getContext('2d');
    const area = document.getElementById(`${id}-area`);
    const zoomSlider = document.getElementById(`${id}-zoom`);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let startOffsetX = 0;
    let startOffsetY = 0;

    // Load image
    if (source instanceof File || source instanceof Blob) {
      img.src = URL.createObjectURL(source);
    } else {
      img.src = source;
    }

    img.onload = () => {
      const areaWidth = area.clientWidth || 400;
      const areaHeight = 350;

      canvas.width = areaWidth;
      canvas.height = areaHeight;

      // Fit image to canvas initially
      const fitScale = Math.max(viewportSize / img.width, viewportSize / img.height);
      scale = fitScale;
      zoomSlider.min = fitScale;
      zoomSlider.max = fitScale * 5;
      zoomSlider.step = fitScale * 0.02;
      zoomSlider.value = fitScale;

      // Center image
      offsetX = (areaWidth - img.width * scale) / 2;
      offsetY = (areaHeight - img.height * scale) / 2;

      draw();
    };

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, offsetX, offsetY, img.width * scale, img.height * scale);
    }

    // Zoom
    zoomSlider.addEventListener('input', () => {
      const oldScale = scale;
      scale = parseFloat(zoomSlider.value);

      // Zoom toward center
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      offsetX = cx - (cx - offsetX) * (scale / oldScale);
      offsetY = cy - (cy - offsetY) * (scale / oldScale);

      draw();
    });

    // Mouse wheel zoom
    area.addEventListener('wheel', (e) => {
      e.preventDefault();
      const oldScale = scale;
      const delta = e.deltaY > 0 ? -parseFloat(zoomSlider.step) * 3 : parseFloat(zoomSlider.step) * 3;
      scale = Math.max(parseFloat(zoomSlider.min), Math.min(parseFloat(zoomSlider.max), scale + delta));
      zoomSlider.value = scale;

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      offsetX = cx - (cx - offsetX) * (scale / oldScale);
      offsetY = cy - (cy - offsetY) * (scale / oldScale);

      draw();
    });

    // Pan (mouse)
    canvas.addEventListener('mousedown', (e) => {
      dragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      startOffsetX = offsetX;
      startOffsetY = offsetY;
      canvas.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    function onMouseMove(e) {
      if (!dragging) return;
      offsetX = startOffsetX + (e.clientX - dragStartX);
      offsetY = startOffsetY + (e.clientY - dragStartY);
      draw();
    }

    function onMouseUp() {
      dragging = false;
      canvas.style.cursor = 'grab';
    }

    // Pan (touch)
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        dragging = true;
        dragStartX = e.touches[0].clientX;
        dragStartY = e.touches[0].clientY;
        startOffsetX = offsetX;
        startOffsetY = offsetY;
      }
    });

    canvas.addEventListener('touchmove', (e) => {
      if (!dragging || e.touches.length !== 1) return;
      e.preventDefault();
      offsetX = startOffsetX + (e.touches[0].clientX - dragStartX);
      offsetY = startOffsetY + (e.touches[0].clientY - dragStartY);
      draw();
    });

    canvas.addEventListener('touchend', () => { dragging = false; });

    // Save — crop and return blob
    document.getElementById(`${id}-save`).addEventListener('click', () => {
      // Calculate crop area (viewport position relative to canvas)
      const vpRect = document.getElementById(`${id}-viewport`).getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();

      const cropX = (vpRect.left - canvasRect.left) / canvasRect.width * canvas.width;
      const cropY = (vpRect.top - canvasRect.top) / canvasRect.height * canvas.height;
      const cropSize = vpRect.width / canvasRect.width * canvas.width;

      // Draw cropped area to a temp canvas
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = 600; // Output size
      cropCanvas.height = 600;
      const cropCtx = cropCanvas.getContext('2d');

      // Source: from the visible canvas area within viewport
      const sx = (cropX - offsetX) / scale;
      const sy = (cropY - offsetY) / scale;
      const sSize = cropSize / scale;

      cropCtx.drawImage(img, sx, sy, sSize, sSize, 0, 0, 600, 600);

      cropCanvas.toBlob((blob) => {
        modal.hide();
        resolve(blob);
      }, 'image/jpeg', 0.9);
    });

    // Cleanup
    let resolved = false;
    modalEl.addEventListener('hidden.bs.modal', () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (source instanceof File || source instanceof Blob) {
        URL.revokeObjectURL(img.src);
      }
      modalEl.remove();
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, { once: true });

    const origResolve = resolve;
    resolve = (val) => { resolved = true; origResolve(val); };

    modal.show();
    canvas.style.cursor = 'grab';
  });
}
