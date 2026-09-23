/**
 * tools/doc-scanner/app.js
 * Quản lý trạng thái, xử lý ảnh tài liệu, Editor Full-screen Mobile, Batch Camera & Web Share API.
 * Tối ưu hóa đặc biệt cho iPhone 12 & Redmi Note 9S.
 */
import { readFileAsDataURL, setupDropZone } from '../../core/js/file.js';
import { loadImage, processDocumentImage } from '../../core/js/image-filters.js';

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
let currentEditorImage = null;
let currentEditorSettings = null;
let cameraMediaStream = null;
let batchCapturedCount = 0;

// Khởi tạo tên file mặc định dạng Scan_YYYYMMDD_HHMM
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

// Rung phản hồi nhẹ khi chạm (Haptic feedback trên Android & thiết bị hỗ trợ)
function triggerHaptic() {
  if (navigator.vibrate) {
    navigator.vibrate(35);
  }
}

// ================= XỬ LÝ NẠP VÀ TỰ ĐỘNG LỌC ẢNH =================
async function addImages(fileList) {
  if (!fileList || fileList.length === 0) return;

  for (const file of Array.from(fileList)) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const dataUrl = await readFileAsDataURL(file);
      await createPageFromDataUrl(dataUrl);
    } catch (err) {
      console.error('Lỗi khi nạp ảnh:', err);
    }
  }
  renderGrid();
}

/**
 * Tạo một trang tài liệu mới, tự động chạy bộ lọc 'magic' (màu nét)
 */
async function createPageFromDataUrl(dataUrl) {
  const img = await loadImage(dataUrl);
  const defaultSettings = {
    filterType: 'magic',
    brightness: 0,
    contrast: 0,
    threshold: 135,
    rotation: 0
  };

  const processedCanvas = processDocumentImage(img, defaultSettings);
  const processedDataUrl = processedCanvas.toDataURL('image/jpeg', 0.90);

  pages.push({
    id: 'page_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    originalDataUrl: dataUrl,
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
      magic: 'Màu nét',
      bw: 'Trắng đen',
      grayscale: 'Xám',
      original: 'Gốc'
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

    // Click vào ảnh để mở Editor toàn màn hình
    card.querySelector('[data-action="edit"]').onclick = () => {
      triggerHaptic();
      openEditorModal(index);
    };

    // Đổi thứ tự trang
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

    // Xóa trang
    card.querySelector('[data-action="delete"]').onclick = (e) => {
      e.stopPropagation();
      triggerHaptic();
      pages.splice(index, 1);
      renderGrid();
    };

    grid.appendChild(card);
  });
}

// ================= MODAL CHỈNH SỬA TRANG (MOBILE SHEET) =================
async function openEditorModal(index) {
  editingPageIndex = index;
  const page = pages[index];
  editorModalTitle.textContent = `Sửa trang ${index + 1}`;

  currentEditorSettings = { ...page.settings };
  currentEditorImage = await loadImage(page.originalDataUrl);

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

  updateEditorCanvas();
  editorModal.classList.add('active');
}

function updateEditorCanvas() {
  if (!currentEditorImage) return;
  const canvas = processDocumentImage(currentEditorImage, currentEditorSettings);

  editorCanvas.width = canvas.width;
  editorCanvas.height = canvas.height;
  const ctx = editorCanvas.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
}

// Bấm chuyển bộ lọc
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

// Xoay trang
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

// Sliders
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

// Đóng Editor
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

// ================= MODAL CHỤP CAMERA LIÊN TỤC =================
btnBatchCam.onclick = async () => {
  triggerHaptic();
  try {
    batchCapturedCount = 0;
    cameraBatchCount.textContent = batchCapturedCount;

    // Hỗ trợ chọn camera sau trên iPhone và Android
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
    alert('Không thể mở camera web: ' + err.message + '\nBạn hãy dùng nút "Chụp tài liệu mới" của máy nhé.');
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
  await createPageFromDataUrl(dataUrl);

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

btnClear.onclick = () => {
  if (confirm('Xóa toàn bộ các trang đã quét?')) {
    pages = [];
    renderGrid();
  }
};

// ================= POPUP TÙY CHỌN PHỤ =================
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

// 1. Xuất PDF kèm hỗ trợ Web Share API trên iPhone & Redmi
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

    // Kiểm tra khả năng mở bảng chia sẻ native trên điện thoại (Zalo, AirDrop, Files, Messenger)
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

    // Fallback: Tự động tải về máy
    pdf.save(fileName);
  } catch (err) {
    alert('Lỗi xuất PDF: ' + err.message);
  }
};

// 2. Xuất file ZIP
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

// 3. Tải về từng ảnh đơn lẻ
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
