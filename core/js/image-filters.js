/**
 * core/js/image-filters.js
 * Module xử lý ảnh tài liệu client-side qua HTML5 Canvas.
 * Tuân thủ ETC: Hàm thuần túy (pure functions), không phụ thuộc UI.
 */

/**
 * Tải ảnh từ DataURL hoặc URL thành HTMLImageElement
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Không thể tải ảnh: ' + e));
    img.src = src;
  });
}

/**
 * Xoay ảnh theo góc quay (0, 90, 180, 270)
 * @param {HTMLImageElement|HTMLCanvasElement} source
 * @param {number} rotationDegrees
 * @returns {HTMLCanvasElement}
 */
export function rotateCanvas(source, rotationDegrees = 0) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const rad = (rotationDegrees % 360) * (Math.PI / 180);

  if (rotationDegrees % 180 !== 0) {
    canvas.width = source.height;
    canvas.height = source.width;
  } else {
    canvas.width = source.width;
    canvas.height = source.height;
  }

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

/**
 * Áp dụng bộ lọc tài liệu lên ảnh:
 * - 'original': Giữ nguyên ảnh gốc kèm chỉnh sáng/tương phản
 * - 'magic': Tự động làm sáng nền giấy, khử bóng mờ, làm đậm nét chữ và giữ màu con dấu/bút mực
 * - 'bw': Trắng đen tài liệu (Adaptive B&W Photocopy)
 * - 'grayscale': Thang độ xám tương phản cao
 *
 * @param {HTMLImageElement|HTMLCanvasElement} source
 * @param {Object} options
 * @param {string} options.filterType - 'original' | 'magic' | 'bw' | 'grayscale'
 * @param {number} options.brightness - -100 đến 100 (mặc định 0)
 * @param {number} options.contrast - -100 đến 100 (mặc định 0)
 * @param {number} options.threshold - 0 đến 255 (cho chế độ B&W, mặc định 135)
 * @param {number} options.rotation - Góc xoay 0, 90, 180, 270
 * @returns {HTMLCanvasElement}
 */
export function processDocumentImage(source, options = {}) {
  const {
    filterType = 'magic',
    brightness = 0,
    contrast = 0,
    threshold = 135,
    rotation = 0
  } = options;

  // 1. Xoay ảnh trước nếu có
  const rotatedCanvas = rotation !== 0 ? rotateCanvas(source, rotation) : source;

  // 2. Chuẩn bị Canvas xử lý điểm ảnh
  const canvas = document.createElement('canvas');
  canvas.width = rotatedCanvas.width;
  canvas.height = rotatedCanvas.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(rotatedCanvas, 0, 0);

  // 3. Lấy dữ liệu điểm ảnh (ImageData)
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const len = data.length;

  // Tính toán hệ số contrast: C factor
  // công thức: factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
  const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Tính độ chói chuẩn (Luminance)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (filterType === 'bw') {
      // Thuật toán Trắng Đen Photocopy:
      // Áp dụng chỉnh brightness vào ngưỡng
      const effectiveThreshold = Math.min(255, Math.max(0, threshold - brightness));
      const val = lum >= effectiveThreshold ? 255 : 0;
      r = val;
      g = val;
      b = val;
    } else if (filterType === 'grayscale') {
      // Thang độ xám tăng độ sâu nét chữ
      let gray = lum;
      // Áp dụng contrast và brightness
      gray = cFactor * (gray - 128) + 128 + brightness;
      gray = Math.min(255, Math.max(0, gray));
      r = gray;
      g = gray;
      b = gray;
    } else if (filterType === 'magic') {
      // Thuật toán Magic Document:
      // Tự động làm sáng nền giấy (nếu lum cao > 130 đẩy về trắng)
      // Làm sẫm màu mực (nếu lum thấp làm đậm)
      // Đồng thời giữ nguyên màu sắc bút ký/con dấu
      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);
      const isColorInk = (maxChannel - minChannel) > 25; // Có màu (mực xanh, dấu đỏ)

      if (isColorInk) {
        // Tăng độ bão hòa màu mực và sáng nền xung quanh
        r = Math.min(255, Math.max(0, r + brightness * 0.8));
        g = Math.min(255, Math.max(0, g + brightness * 0.8));
        b = Math.min(255, Math.max(0, b + brightness * 0.8));
      } else {
        // Vùng chữ đen hoặc giấy trắng
        if (lum > 140) {
          // Nền giấy -> Đẩy sáng để khử bóng và vàng ố
          const boost = (lum - 140) * 0.95 + 140 + brightness;
          r = Math.min(255, boost);
          g = Math.min(255, boost);
          b = Math.min(255, boost);
        } else {
          // Chữ đen -> Làm đậm
          const darken = (lum * 0.85) + brightness * 0.5;
          r = Math.max(0, Math.min(255, darken));
          g = Math.max(0, Math.min(255, darken));
          b = Math.max(0, Math.min(255, darken));
        }
      }

      // Kéo thêm tương phản nếu có
      if (contrast !== 0) {
        r = Math.min(255, Math.max(0, cFactor * (r - 128) + 128));
        g = Math.min(255, Math.max(0, cFactor * (g - 128) + 128));
        b = Math.min(255, Math.max(0, cFactor * (b - 128) + 128));
      }
    } else {
      // 'original': Chỉ áp dụng chỉnh brightness & contrast thủ công
      if (brightness !== 0) {
        r += brightness;
        g += brightness;
        b += brightness;
      }
      if (contrast !== 0) {
        r = cFactor * (r - 128) + 128;
        g = cFactor * (g - 128) + 128;
        b = cFactor * (b - 128) + 128;
      }
      r = Math.min(255, Math.max(0, r));
      g = Math.min(255, Math.max(0, g));
      b = Math.min(255, Math.max(0, b));
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
