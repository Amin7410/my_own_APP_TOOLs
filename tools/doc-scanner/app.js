/**
 * tools/doc-scanner/app.js
 * Engine xử lý tài liệu lai (Hybrid Document Scanner Engine):
 * 1. Computer Vision thuần JS: Auto Corner Detection, 4-Point Homography Warp, Shadow Removal & Magic Color.
 * 2. Giao diện 4 chốt nam châm tương tác kèm Kính Lúp (Magnifier Lens 2.5x) chuẩn CamScanner.
 * 3. Tối ưu toàn diện cho iPhone 12 & Redmi Note 9S.
 */
import { readFileAsDataURL, setupDropZone } from '../../core/js/file.js';
import {
  loadImage,
  createCanvasFromSource,
  autoDetectCorners,
  warpPerspective,
  removeShadows,
  applyMagicColorFilter
} from '../../core/js/cv-engine.js';
import { processDocumentImage } from '../../core/js/image-filters.js';

// ================= CÁC PHẦN TỬ GIAO DIỆN CHÍNH =================
const camInput = document.getElementById('camInput');
const fileInput = document.getElementById('fileInput');
const btnBatchCam = document.getElementById('btnBatchCam');
const dropZone = document.getElementById('dropZone');
const grid = document.getElementById('grid');
const btnClear = document.getElementById('btnClear');
const bottomBar = document.getElementById('bottomBar');
const fileNameInput = document.getElementById('fileNameInput');
const btnExportPdf = document.getElementById('btnExportPdf');
const btnMoreOptions = document.getElementById('btnMoreOptions');
const exportCountEls = document.querySelectorAll('.export-count');

// ================= POPUP TÙY CHỌN XUẤT =================
const optionsModal = document.getElementById('optionsModal');
const btnCloseOptions = document.getElementById('btnCloseOptions');
const btnExportZip = document.getElementById('btnExportZip');
const btnExportImages = document.getElementById('btnExportImages');

// ================= PHẦN TỬ MODAL CHỈNH SỬA (MOBILE SHEET) =================
const editorModal = document.getElementById('editorModal');
const editorModalTitle = document.getElementById('editorModalTitle');
const editorCanvas = document.getElementById('editorCanvas');
const btnEditorCancel = document.getElementById('btnEditorCancel');
const btnEditorSave = document.getElementById('btnEditorSave');
const btnOpenCrop = document.getElementById('btnOpenCrop');
const filterButtons = document.querySelectorAll('.segmented-filter-btn');
const btnRotateLeft = document.getElementById('btnRotateLeft');
const btnRotateRight = document.getElementById('btnRotateRight');
const sliderBrightness = document.getElementById('sliderBrightness');
const sliderContrast = document.getElementById('sliderContrast');
const sliderThreshold = document.getElementById('sliderThreshold');
const valBrightness = document.getElementById('valBrightness');
const valContrast = document.getElementById('valContrast');
const valThreshold = document.getElementById('valThreshold');
const thresholdGroup = document.getElementById('thresholdGroup');

// ================= PHẦN TỬ MODAL CĂN GÓC (CROP & PERSPECTIVE) =================
const cropModal = document.getElementById('cropModal');
const cropCanvas = document.getElementById('cropCanvas');
const cropOverlay = document.getElementById('cropOverlay');
const magnifierLens = document.getElementById('magnifierLens');
const magnifierCanvas = document.getElementById('magnifierCanvas');
const btnCropCancel = document.getElementById('btnCropCancel');
const btnCropApply = document.getElementById('btnCropApply');
const btnCropAuto = document.getElementById('btnCropAuto');
const btnCropFull = document.getElementById('btnCropFull');
const btnCropRotate = document.getElementById('btnCropRotate');

// ================= PHẦN TỬ BATCH CAMERA TOÀN MÀN HÌNH =================
const cameraModal = document.getElementById('cameraModal');
const cameraVideo = document.getElementById('cameraVideo');
const btnShutter = document.getElementById('btnShutter');
const btnCameraClose = document.getElementById('btnCameraClose');
const btnCameraFinish = document.getElementById('btnCameraFinish');
const cameraBatchCount = document.getElementById('cameraBatchCount');

// ================= TRẠNG THÁI ỨNG DỤNG =================
let pages = [];
let editingPageIndex = -1;
let currentEditorSettings = null;
let cameraMediaStream = null;
let batchCapturedCount = 0;

// Trạng thái cho Modal Căn góc phối cảnh
let cropActiveImage = null; // HTMLImageElement ảnh gốc đang căn
let cropCorners = null; // { tl, tr, br, bl }
let cropRotation = 0;
let activeDragHandle = null; // 'tl' | 'tr' | 'br' | 'bl' | null
let cropPageCallback = null;

// Khởi tạo tên file mặc định
function initDefaultFileName() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  fileNameInput.value = `Scan_${y}${m}${d}_${h}${min}`;
}
initDefaultFileName();

function triggerHaptic() {
  if (navigator.vibrate) {
    navigator.vibrate(35);
  }
}

// ================= XỬ LÝ NẠP VÀ TỰ ĐỘNG LỌC TÀI LIỆU =================
async function addImages(fileList) {
  if (!fileList || fileList.length === 0) return;

  for (const file of Array.from(fileList)) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const dataUrl = await readFileAsDataURL(file);
      await processAndAddPage(dataUrl);
    } catch (err) {
      console.error('Lỗi khi nạp ảnh:', err);
    }
  }
  renderGrid();
}

/**
 * Tự động tìm 4 góc, nắn thẳng phối cảnh và áp dụng Magic Color cho trang mới
 */
async function processAndAddPage(dataUrl) {
  const rawImg = await loadImage(dataUrl);

  // 1. Tự động nhận diện 4 góc mép giấy
  const detectedCorners = autoDetectCorners(rawImg);

  // 2. Nắn thẳng góc phối cảnh (Homography Warp)
  const warpedCanvas = warpPerspective(rawImg, detectedCorners);

  // 3. Khử bóng đổ & Cân bằng sáng nền (Illumination Flattening)
  const shadowFreeCanvas = removeShadows(warpedCanvas);

  // 4. Áp dụng Magic Color
  const enhancedCanvas = applyMagicColorFilter(shadowFreeCanvas, { brightness: 0, contrast: 10 });
  const processedDataUrl = enhancedCanvas.toDataURL('image/jpeg', 0.90);
  const warpedDataUrl = warpedCanvas.toDataURL('image/jpeg', 0.92);

  const defaultSettings = {
    filterType: 'magic',
    brightness: 0,
    contrast: 10,
    threshold: 135,
    rotation: 0
  };

  pages.push({
    id: 'page_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    rawPhotoDataUrl: dataUrl,
    corners: detectedCorners,
    warpedDataUrl: warpedDataUrl,
    processedDataUrl: processedDataUrl,
    settings: defaultSettings
  });
}

// ================= RENDER DANH SÁCH TRANG TRÊN GIAO DIỆN =================
function renderGrid() {
  const total = pages.length;
  exportCountEls.forEach(el => el.textContent = total);

  if (total > 0) {
    dropZone.style.display = 'none';
    bottomBar.style.display = 'flex';
    btnClear.style.display = 'inline-block';
  } else {
    dropZone.style.display = 'flex';
    bottomBar.style.display = 'none';
    btnClear.style.display = 'none';
  }

  grid.innerHTML = '';
  pages.forEach((page, index) => {
    const card = document.createElement('div');
    card.className = 'page-card';

    const filterNameMap = {
      magic: '✨ Màu nét',
      bw: '⚪ Trắng đen',
      grayscale: '🩶 Xám',
      original: '📷 Gốc'
    };

    card.innerHTML = `
      <div class="page-preview-box" data-action="edit">
        <span class="page-number-pill">Trang ${index + 1}</span>
        <span class="page-filter-pill">${filterNameMap[page.settings.filterType] || 'Màu nét'}</span>
        <img src="${page.processedDataUrl}" alt="Trang ${index + 1}">
      </div>
      <div class="page-card-footer">
        <span class="page-edit-tap-text">Chạm để sửa</span>
        <div class="page-actions-inline">
          <button class="icon-action-btn" data-action="move-up" title="Lên" ${index === 0 ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button class="icon-action-btn" data-action="move-down" title="Xuống" ${index === total - 1 ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button class="icon-action-btn btn-delete" data-action="delete" title="Xóa">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    `;

    card.querySelector('[data-action="edit"]').onclick = () => {
      triggerHaptic();
      openEditorModal(index);
    };

    const btnUp = card.querySelector('[data-action="move-up"]');
    if (btnUp) {
      btnUp.onclick = (e) => {
        e.stopPropagation();
        triggerHaptic();
        if (index > 0) {
          const temp = pages[index];
          pages[index] = pages[index - 1];
          pages[index - 1] = temp;
          renderGrid();
        }
      };
    }

    const btnDown = card.querySelector('[data-action="move-down"]');
    if (btnDown) {
      btnDown.onclick = (e) => {
        e.stopPropagation();
        triggerHaptic();
        if (index < pages.length - 1) {
          const temp = pages[index];
          pages[index] = pages[index + 1];
          pages[index + 1] = temp;
          renderGrid();
        }
      };
    }

    card.querySelector('[data-action="delete"]').onclick = (e) => {
      e.stopPropagation();
      triggerHaptic();
      pages.splice(index, 1);
      renderGrid();
    };

    grid.appendChild(card);
  });
}

// ================= MODAL CHỈNH SỬA TRANG (PAGE EDITOR) =================
async function openEditorModal(index) {
  editingPageIndex = index;
  const page = pages[index];
  editorModalTitle.textContent = `Sửa trang ${index + 1}`;

  currentEditorSettings = { ...page.settings };

  sliderBrightness.value = currentEditorSettings.brightness;
  sliderContrast.value = currentEditorSettings.contrast;
  sliderThreshold.value = currentEditorSettings.threshold;
  valBrightness.textContent = currentEditorSettings.brightness;
  valContrast.textContent = currentEditorSettings.contrast;
  valThreshold.textContent = currentEditorSettings.threshold;

  thresholdGroup.style.display = currentEditorSettings.filterType === 'bw' ? 'flex' : 'none';

  filterButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === currentEditorSettings.filterType);
  });

  await updateEditorCanvas();
  editorModal.classList.add('active');
}

async function updateEditorCanvas() {
  if (editingPageIndex < 0 || editingPageIndex >= pages.length) return;
  const page = pages[editingPageIndex];

  // Đọc từ warpedDataUrl (ảnh đã nắn phẳng)
  const warpedImg = await loadImage(page.warpedDataUrl);
  const canvas = processDocumentImage(warpedImg, currentEditorSettings);

  editorCanvas.width = canvas.width;
  editorCanvas.height = canvas.height;
  const ctx = editorCanvas.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
}

// Bấm nút Căn góc & Cắt phối cảnh từ trong Editor
btnOpenCrop.onclick = async () => {
  triggerHaptic();
  if (editingPageIndex < 0 || editingPageIndex >= pages.length) return;
  const page = pages[editingPageIndex];

  const rawImg = await loadImage(page.rawPhotoDataUrl);
  openCropModal(rawImg, page.corners, async (newCorners) => {
    // Lưu góc mới và nắn thẳng lại
    page.corners = newCorners;
    const warpedCanvas = warpPerspective(rawImg, newCorners);
    page.warpedDataUrl = warpedCanvas.toDataURL('image/jpeg', 0.92);

    // Áp dụng lại bộ lọc hiện tại
    await updateEditorCanvas();
    page.processedDataUrl = editorCanvas.toDataURL('image/jpeg', 0.90);
    renderGrid();
  });
};

filterButtons.forEach(btn => {
  btn.onclick = () => {
    triggerHaptic();
    filterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentEditorSettings.filterType = btn.dataset.filter;
    thresholdGroup.style.display = currentEditorSettings.filterType === 'bw' ? 'flex' : 'none';
    updateEditorCanvas();
  };
});

btnRotateLeft.onclick = () => {
  triggerHaptic();
  currentEditorSettings.rotation = (currentEditorSettings.rotation - 90 + 360) % 360;
  updateEditorCanvas();
};

btnRotateRight.onclick = () => {
  triggerHaptic();
  currentEditorSettings.rotation = (currentEditorSettings.rotation + 90) % 360;
  updateEditorCanvas();
};

sliderBrightness.oninput = (e) => {
  currentEditorSettings.brightness = parseInt(e.target.value, 10);
  valBrightness.textContent = currentEditorSettings.brightness;
  updateEditorCanvas();
};

sliderContrast.oninput = (e) => {
  currentEditorSettings.contrast = parseInt(e.target.value, 10);
  valContrast.textContent = currentEditorSettings.contrast;
  updateEditorCanvas();
};

sliderThreshold.oninput = (e) => {
  currentEditorSettings.threshold = parseInt(e.target.value, 10);
  valThreshold.textContent = currentEditorSettings.threshold;
  updateEditorCanvas();
};

btnEditorCancel.onclick = () => {
  editorModal.classList.remove('active');
};

btnEditorSave.onclick = () => {
  triggerHaptic();
  if (editingPageIndex >= 0 && editingPageIndex < pages.length) {
    const page = pages[editingPageIndex];
    page.settings = { ...currentEditorSettings };
    page.processedDataUrl = editorCanvas.toDataURL('image/jpeg', 0.90);
    renderGrid();
  }
  editorModal.classList.remove('active');
};

// ================= 4 CHỐT NAM CHÂM & KÍNH LÚP (CROP & PERSPECTIVE MODAL) =================

function openCropModal(imageSource, initialCorners, onApplyCallback) {
  cropActiveImage = imageSource;
  cropPageCallback = onApplyCallback;
  cropRotation = 0;

  // Bản sao tọa độ 4 góc
  cropCorners = initialCorners ? JSON.parse(JSON.stringify(initialCorners)) : autoDetectCorners(imageSource);

  // Thiết lập kích thước canvas
  const imgW = imageSource.naturalWidth || imageSource.width;
  const imgH = imageSource.naturalHeight || imageSource.height;
  cropCanvas.width = imgW;
  cropCanvas.height = imgH;
  const ctx = cropCanvas.getContext('2d');
  ctx.drawImage(imageSource, 0, 0);

  cropModal.classList.add('active');

  // Đợi DOM render để đồng bộ kích thước Overlay
  requestAnimationFrame(() => {
    resizeCropOverlay();
    drawCropOverlay();
  });
}

function resizeCropOverlay() {
  const rect = cropCanvas.getBoundingClientRect();
  cropOverlay.width = rect.width;
  cropOverlay.height = rect.height;
}

window.addEventListener('resize', () => {
  if (cropModal.classList.contains('active')) {
    resizeCropOverlay();
    drawCropOverlay();
  }
});

// Chuyển đổi tọa độ từ ảnh gốc sang tọa độ hiển thị trên màn hình
function imgToScreen(pt) {
  const rect = cropCanvas.getBoundingClientRect();
  const scaleX = rect.width / cropCanvas.width;
  const scaleY = rect.height / cropCanvas.height;
  return {
    x: pt.x * scaleX,
    y: pt.y * scaleY
  };
}

// Chuyển đổi tọa độ từ màn hình về ảnh gốc
function screenToImg(x, y) {
  const rect = cropCanvas.getBoundingClientRect();
  const scaleX = cropCanvas.width / rect.width;
  const scaleY = cropCanvas.height / rect.height;
  return {
    x: Math.max(0, Math.min(cropCanvas.width, x * scaleX)),
    y: Math.max(0, Math.min(cropCanvas.height, y * scaleY))
  };
}

// Vẽ lớp phủ tương tác: 4 đường biên neon, lớp tối bên ngoài, và 4 chốt nam châm
function drawCropOverlay() {
  if (!cropCorners) return;
  const ctx = cropOverlay.getContext('2d');
  const w = cropOverlay.width;
  const h = cropOverlay.height;
  ctx.clearRect(0, 0, w, h);

  const sTL = imgToScreen(cropCorners.tl);
  const sTR = imgToScreen(cropCorners.tr);
  const sBR = imgToScreen(cropCorners.br);
  const sBL = imgToScreen(cropCorners.bl);

  // 1. Phủ mờ vùng ngoài tứ giác
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(sTL.x, sTL.y);
  ctx.lineTo(sTR.x, sTR.y);
  ctx.lineTo(sBR.x, sBR.y);
  ctx.lineTo(sBL.x, sBL.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 2. Vẽ 4 đường viền neon màu xanh cyan
  ctx.beginPath();
  ctx.moveTo(sTL.x, sTL.y);
  ctx.lineTo(sTR.x, sTR.y);
  ctx.lineTo(sBR.x, sBR.y);
  ctx.lineTo(sBL.x, sBL.y);
  ctx.closePath();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#38bdf8';
  ctx.shadowColor = 'rgba(56, 189, 248, 0.8)';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 3. Vẽ 4 chốt tròn nam châm ở 4 góc
  drawCornerHandle(ctx, sTL.x, sTL.y);
  drawCornerHandle(ctx, sTR.x, sTR.y);
  drawCornerHandle(ctx, sBR.x, sBR.y);
  drawCornerHandle(ctx, sBL.x, sBL.y);
}

function drawCornerHandle(ctx, x, y) {
  // Vòng ngoài phát sáng
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(14, 165, 233, 0.4)';
  ctx.fill();

  // Vòng tròn trắng viền xanh
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 2.5;
  ctx.fill();
  ctx.stroke();
}

// Cập nhật Kính lúp (Magnifier Lens phóng to 2.5x)
function updateMagnifier(screenX, screenY, cornerImgPt) {
  magnifierLens.style.display = 'flex';

  // Định vị kính lúp lơ lửng phía trên ngón tay 70px (nếu sát mép trên thì đưa xuống dưới)
  let lensY = screenY - 70;
  if (lensY < 60) lensY = screenY + 70;
  magnifierLens.style.left = screenX + 'px';
  magnifierLens.style.top = lensY + 'px';

  // Render ảnh phóng đại 2.5x
  const mCanvas = magnifierCanvas;
  mCanvas.width = 100;
  mCanvas.height = 100;
  const mCtx = mCanvas.getContext('2d');
  mCtx.clearRect(0, 0, 100, 100);

  const zoom = 2.5;
  const cropW = 100 / zoom;
  const cropH = 100 / zoom;
  const sx = cornerImgPt.x - cropW / 2;
  const sy = cornerImgPt.y - cropH / 2;

  mCtx.drawImage(cropActiveImage, sx, sy, cropW, cropH, 0, 0, 100, 100);
}

// Bắt sự kiện chạm / kéo chốt góc (Touch & Mouse)
function handlePointerDown(clientX, clientY) {
  const rect = cropOverlay.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;

  const sTL = imgToScreen(cropCorners.tl);
  const sTR = imgToScreen(cropCorners.tr);
  const sBR = imgToScreen(cropCorners.br);
  const sBL = imgToScreen(cropCorners.bl);

  const hitRadius = 38; // Bán kính bắt chạm ngón tay 38px
  const distTL = Math.hypot(px - sTL.x, py - sTL.y);
  const distTR = Math.hypot(px - sTR.x, py - sTR.y);
  const distBR = Math.hypot(px - sBR.x, py - sBR.y);
  const distBL = Math.hypot(px - sBL.x, py - sBL.y);

  const minDist = Math.min(distTL, distTR, distBR, distBL);
  if (minDist <= hitRadius) {
    triggerHaptic();
    if (minDist === distTL) activeDragHandle = 'tl';
    else if (minDist === distTR) activeDragHandle = 'tr';
    else if (minDist === distBR) activeDragHandle = 'br';
    else if (minDist === distBL) activeDragHandle = 'bl';

    updateMagnifier(px, py, cropCorners[activeDragHandle]);
  }
}

function handlePointerMove(clientX, clientY) {
  if (!activeDragHandle) return;
  const rect = cropOverlay.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;

  const newImgPt = screenToImg(px, py);
  cropCorners[activeDragHandle] = newImgPt;

  drawCropOverlay();
  updateMagnifier(px, py, newImgPt);
}

function handlePointerUp() {
  if (activeDragHandle) {
    triggerHaptic();
    activeDragHandle = null;
    magnifierLens.style.display = 'none';
    drawCropOverlay();
  }
}

// Touch Events cho điện thoại
cropOverlay.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
  }
}, { passive: false });

cropOverlay.addEventListener('touchmove', (e) => {
  if (activeDragHandle && e.touches.length === 1) {
    e.preventDefault(); // Chặn cuộn trang
    handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }
}, { passive: false });

cropOverlay.addEventListener('touchend', handlePointerUp);
cropOverlay.addEventListener('touchcancel', handlePointerUp);

// Mouse Events cho máy tính
cropOverlay.addEventListener('mousedown', (e) => handlePointerDown(e.clientX, e.clientY));
window.addEventListener('mousemove', (e) => {
  if (activeDragHandle) handlePointerMove(e.clientX, e.clientY);
});
window.addEventListener('mouseup', handlePointerUp);

// Các nút trong Modal Căn góc
btnCropAuto.onclick = () => {
  triggerHaptic();
  cropCorners = autoDetectCorners(cropActiveImage);
  drawCropOverlay();
};

btnCropFull.onclick = () => {
  triggerHaptic();
  const w = cropCanvas.width;
  const h = cropCanvas.height;
  cropCorners = {
    tl: { x: 0, y: 0 },
    tr: { x: w, y: 0 },
    br: { x: w, y: h },
    bl: { x: 0, y: h }
  };
  drawCropOverlay();
};

btnCropRotate.onclick = () => {
  triggerHaptic();
  // Xoay ảnh 90 độ
  const rotated = document.createElement('canvas');
  rotated.width = cropCanvas.height;
  rotated.height = cropCanvas.width;
  const rCtx = rotated.getContext('2d');
  rCtx.translate(rotated.width / 2, rotated.height / 2);
  rCtx.rotate(Math.PI / 2);
  rCtx.drawImage(cropCanvas, -cropCanvas.width / 2, -cropCanvas.height / 2);

  cropActiveImage = rotated;
  cropCanvas.width = rotated.width;
  cropCanvas.height = rotated.height;
  cropCanvas.getContext('2d').drawImage(rotated, 0, 0);

  cropCorners = autoDetectCorners(rotated);
  resizeCropOverlay();
  drawCropOverlay();
};

btnCropCancel.onclick = () => {
  cropModal.classList.remove('active');
  magnifierLens.style.display = 'none';
};

btnCropApply.onclick = () => {
  triggerHaptic();
  cropModal.classList.remove('active');
  magnifierLens.style.display = 'none';
  if (cropPageCallback) {
    cropPageCallback(cropCorners);
  }
};

// ================= MODAL CHỤP CAMERA LIÊN TỤC =================
btnBatchCam.onclick = async () => {
  triggerHaptic();
  try {
    batchCapturedCount = 0;
    cameraBatchCount.textContent = batchCapturedCount;

    cameraMediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });
    cameraVideo.srcObject = cameraMediaStream;
    cameraModal.classList.add('active');
  } catch (err) {
    console.warn('getUserMedia không mở được, chuyển sang camera native của điện thoại:', err);
    camInput.click();
  }
};

function closeCameraModal() {
  if (cameraMediaStream) {
    cameraMediaStream.getTracks().forEach(track => track.stop());
    cameraMediaStream = null;
  }
  cameraModal.classList.remove('active');
}

btnCameraClose.onclick = btnCameraFinish.onclick = () => {
  triggerHaptic();
  closeCameraModal();
};

btnShutter.onclick = async () => {
  triggerHaptic();
  if (!cameraVideo.videoWidth) return;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = cameraVideo.videoWidth;
  tempCanvas.height = cameraVideo.videoHeight;
  const ctx = tempCanvas.getContext('2d');
  ctx.drawImage(cameraVideo, 0, 0);

  const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.92);
  await processAndAddPage(dataUrl);

  batchCapturedCount++;
  cameraBatchCount.textContent = batchCapturedCount;
  renderGrid();
};

// ================= SỰ KIỆN NẠP FILE & KÉO THẢ =================
camInput.addEventListener('change', e => {
  addImages(e.target.files);
  e.target.value = '';
});

fileInput.addEventListener('change', e => {
  addImages(e.target.files);
  e.target.value = '';
});

setupDropZone(dropZone, addImages);
dropZone.addEventListener('click', () => {
  btnBatchCam.click();
});

btnClear.onclick = () => {
  if (confirm('Xóa toàn bộ các trang đã quét?')) {
    pages = [];
    renderGrid();
  }
};

btnMoreOptions.onclick = () => {
  triggerHaptic();
  optionsModal.classList.add('active');
};
btnCloseOptions.onclick = () => {
  optionsModal.classList.remove('active');
};

// ================= XUẤT ĐA ĐỊNH DẠNG & WEB SHARE API (IPHONE / ANDROID) =================
function getCleanFileName() {
  const raw = fileNameInput.value.trim();
  return raw.replace(/[/\\?%*:|"<>]/g, '_') || 'Tai_Lieu_Scan';
}

btnExportPdf.onclick = async () => {
  if (pages.length === 0) return;
  triggerHaptic();
  const fileName = getCleanFileName() + '.pdf';

  try {
    const { jsPDF } = window.jspdf;
    let pdf = null;

    for (let i = 0; i < pages.length; i++) {
      const img = await loadImage(pages[i].processedDataUrl);
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      const orientation = width > height ? 'l' : 'p';

      if (i === 0) {
        pdf = new jsPDF({
          orientation: orientation,
          unit: 'px',
          format: [width, height]
        });
      } else {
        pdf.addPage([width, height], orientation);
      }

      pdf.addImage(pages[i].processedDataUrl, 'JPEG', 0, 0, width, height);
    }

    const pdfBlob = pdf.output('blob');
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: fileName,
          text: 'Tài liệu scan từ Web Tools',
          files: [file]
        });
        return;
      } catch (shareErr) {
        if (shareErr.name === 'AbortError') return;
      }
    }

    pdf.save(fileName);
  } catch (err) {
    alert('Lỗi xuất PDF: ' + err.message);
  }
};

btnExportZip.onclick = async () => {
  if (pages.length === 0) return;
  triggerHaptic();
  optionsModal.classList.remove('active');
  const baseName = getCleanFileName();

  try {
    const zip = new window.JSZip();
    const folder = zip.folder(baseName);

    pages.forEach((page, idx) => {
      const base64Data = page.processedDataUrl.split(',')[1];
      const pageNum = String(idx + 1).padStart(3, '0');
      folder.file(`${baseName}_trang_${pageNum}.jpg`, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${baseName}.zip`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    alert('Lỗi xuất ZIP: ' + err.message);
  }
};

btnExportImages.onclick = () => {
  if (pages.length === 0) return;
  triggerHaptic();
  optionsModal.classList.remove('active');
  const baseName = getCleanFileName();

  pages.forEach((page, idx) => {
    const link = document.createElement('a');
    link.href = page.processedDataUrl;
    const pageNum = String(idx + 1).padStart(2, '0');
    link.download = `${baseName}_trang_${pageNum}.jpg`;
    link.click();
  });
};

// Khởi tạo ban đầu
renderGrid();
