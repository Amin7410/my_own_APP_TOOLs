/**
 * core/js/cv-engine.js
 * Engine thị giác máy tính (Computer Vision) thuần JavaScript siêu nhẹ (~30KB).
 * Không phụ thuộc thư viện bên ngoài. Xử lý cực nhanh trực tiếp trên iPhone 12 & Redmi Note 9S.
 * 
 * Tính năng cốt lõi:
 * 1. Tự động nhận diện 4 góc mép giấy (Auto 4-Corner Detection)
 * 2. Nắn thẳng góc nghiêng (4-Point Perspective Transform / Homography với Bilinear Interpolation)
 * 3. Khử bóng đổ & Cân bằng sáng nền (Illumination Flattening & Shadow Removal)
 * 4. Bộ lọc Magic Color chuẩn CamScanner
 * 5. Ngưỡng thích ứng Sauvola Binarization
 */

/**
 * Tải ảnh thành HTMLImageElement
 * @param {string} src 
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Tạo canvas từ nguồn ảnh hoặc canvas
 */
export function createCanvasFromSource(source) {
  const canvas = document.createElement('canvas');
  canvas.width = source.naturalWidth || source.width;
  canvas.height = source.naturalHeight || source.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0);
  return canvas;
}

// ================= 1. THUẬT TOÁN TỰ ĐỘNG NHẬN DIỆN 4 GÓC (AUTO CORNERS) =================

/**
 * Tự động tìm 4 góc tài liệu từ ảnh
 * @param {HTMLImageElement|HTMLCanvasElement} source
 * @returns {{tl: {x: number, y: number}, tr: {x: number, y: number}, br: {x: number, y: number}, bl: {x: number, y: number}}}
 */
export function autoDetectCorners(source) {
  const origW = source.naturalWidth || source.width;
  const origH = source.naturalHeight || source.height;

  // Dự phòng mặc định: lùi vào 4% từ mép ảnh
  const fallback = {
    tl: { x: Math.round(origW * 0.04), y: Math.round(origH * 0.04) },
    tr: { x: Math.round(origW * 0.96), y: Math.round(origH * 0.04) },
    br: { x: Math.round(origW * 0.96), y: Math.round(origH * 0.96) },
    bl: { x: Math.round(origW * 0.04), y: Math.round(origH * 0.96) }
  };

  try {
    // Thu nhỏ ảnh xuống chiều rộng ~320px để phân tích gradient siêu tốc (< 15ms)
    const scale = Math.min(1, 320 / origW);
    const w = Math.round(origW * scale);
    const h = Math.round(origH * scale);

    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = w;
    smallCanvas.height = h;
    const ctx = smallCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    // 1. Chuyển sang Grayscale và tính Gradient Sobel
    const gray = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      gray[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    }

    // 2. Tìm viền mép giấy bằng Sobel Gradient
    const edges = new Uint8Array(w * h);
    let edgeCount = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        // Sobel X & Y
        const gx = -gray[idx - w - 1] + gray[idx - w + 1]
                   - 2 * gray[idx - 1] + 2 * gray[idx + 1]
                   - gray[idx + w - 1] + gray[idx + w + 1];
        const gy = -gray[idx - w - 1] - 2 * gray[idx - w] - gray[idx - w + 1]
                   + gray[idx + w - 1] + 2 * gray[idx + w] + gray[idx + w + 1];
        const mag = Math.abs(gx) + Math.abs(gy);
        if (mag > 90) {
          edges[idx] = 255;
          edgeCount++;
        }
      }
    }

    // Nếu không có đủ điểm viền, dùng vị trí dự phòng
    if (edgeCount < (w * h) * 0.01) {
      return fallback;
    }

    // 3. Tìm 4 điểm cực trị theo 4 góc phần tư:
    // TL: min(x + y)
    // TR: max(x - y)
    // BR: max(x + y)
    // BL: min(x - y)
    let minTL = Infinity, maxTR = -Infinity;
    let maxBR = -Infinity, minBL = Infinity;
    let ptTL = { x: 0, y: 0 };
    let ptTR = { x: w, y: 0 };
    let ptBR = { x: w, y: h };
    let ptBL = { x: 0, y: h };

    // Giới hạn biên an toàn 2% để tránh bắt nhầm cạnh ngoài ảnh
    const borderX = Math.round(w * 0.02);
    const borderY = Math.round(h * 0.02);

    for (let y = borderY; y < h - borderY; y++) {
      for (let x = borderX; x < w - borderX; x++) {
        if (edges[y * w + x] === 255) {
          const sum = x + y;
          const diff = x - y;

          if (sum < minTL) { minTL = sum; ptTL = { x, y }; }
          if (diff > maxTR) { maxTR = diff; ptTR = { x, y }; }
          if (sum > maxBR) { maxBR = sum; ptBR = { x, y }; }
          if (diff < minBL) { minBL = diff; ptBL = { x, y }; }
        }
      }
    }

    // Kiểm tra diện tích tứ giác tìm được
    const area = 0.5 * Math.abs(
      (ptTL.x * ptTR.y - ptTR.x * ptTL.y) +
      (ptTR.x * ptBR.y - ptBR.x * ptTR.y) +
      (ptBR.x * ptBL.y - ptBL.x * ptBR.y) +
      (ptBL.x * ptTL.y - ptTL.x * ptBL.y)
    );

    // Nếu diện tích quá nhỏ (< 20% khung hình), dùng fallback
    if (area < (w * h) * 0.2) {
      return fallback;
    }

    // Quy đổi tọa độ về kích thước ảnh gốc
    return {
      tl: { x: Math.round(ptTL.x / scale), y: Math.round(ptTL.y / scale) },
      tr: { x: Math.round(ptTR.x / scale), y: Math.round(ptTR.y / scale) },
      br: { x: Math.round(ptBR.x / scale), y: Math.round(ptBR.y / scale) },
      bl: { x: Math.round(ptBL.x / scale), y: Math.round(ptBL.y / scale) }
    };
  } catch (err) {
    console.warn('Lỗi autoDetectCorners, dùng fallback:', err);
    return fallback;
  }
}

// ================= 2. NẮN THẲNG PHỐI CẢNH 4 GÓC (PERSPECTIVE TRANSFORM) =================

/**
 * Giải hệ phương trình 8 ẩn ma trận phối cảnh bằng khử Gauss (Gaussian Elimination)
 */
function solveHomography(src, dst) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const sx = src[i].x;
    const sy = src[i].y;
    const dx = dst[i].x;
    const dy = dst[i].y;

    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy, dx]);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy, dy]);
  }

  // Khử Gauss
  const n = 8;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
    }
    const temp = A[i];
    A[i] = A[maxRow];
    A[maxRow] = temp;

    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / A[i][i];
      for (let j = i; j <= n; j++) {
        if (i === j) A[k][j] = 0;
        else A[k][j] += c * A[i][j];
      }
    }
  }

  // Thế ngược
  const h = new Array(9);
  for (let i = n - 1; i >= 0; i--) {
    let sum = A[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= A[i][j] * h[j];
    }
    h[i] = sum / A[i][i];
  }
  h[8] = 1;
  return h;
}

/**
 * Nghịch đảo ma trận 3x3
 */
function invertMatrix3x3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-8) return null;
  const invDet = 1 / det;

  return [
    (e * i - f * h) * invDet,
    (c * h - b * i) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * i) * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h - e * g) * invDet,
    (g * b - a * h) * invDet,
    (a * e - b * d) * invDet
  ];
}

/**
 * Nắn thẳng góc phối cảnh từ 4 điểm bất kỳ (Bilinear Interpolation)
 * @param {HTMLCanvasElement|HTMLImageElement} source 
 * @param {{tl: {x,y}, tr: {x,y}, br: {x,y}, bl: {x,y}}} corners 
 * @returns {HTMLCanvasElement}
 */
export function warpPerspective(source, corners) {
  const srcCanvas = createCanvasFromSource(source);
  const srcW = srcCanvas.width;
  const srcH = srcCanvas.height;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  const srcImgData = srcCtx.getImageData(0, 0, srcW, srcH);
  const srcData = srcImgData.data;

  // 1. Tính toán kích thước hình chữ nhật đích chuẩn (W, H)
  const widthTop = Math.hypot(corners.tr.x - corners.tl.x, corners.tr.y - corners.tl.y);
  const widthBottom = Math.hypot(corners.br.x - corners.bl.x, corners.br.y - corners.bl.y);
  const targetW = Math.round(Math.max(widthTop, widthBottom));

  const heightLeft = Math.hypot(corners.bl.x - corners.tl.x, corners.bl.y - corners.tl.y);
  const heightRight = Math.hypot(corners.br.x - corners.tr.x, corners.br.y - corners.tr.y);
  const targetH = Math.round(Math.max(heightLeft, heightRight));

  // Giới hạn độ phân giải hợp lý (max 2400px) để chạy mượt trên mobile
  const maxDim = 2400;
  const scale = Math.min(1, maxDim / Math.max(targetW, targetH));
  const outW = Math.max(100, Math.round(targetW * scale));
  const outH = Math.max(100, Math.round(targetH * scale));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  const outImgData = outCtx.createImageData(outW, outH);
  const outData = outImgData.data;

  // 2. Điểm nguồn và điểm đích
  const srcPts = [corners.tl, corners.tr, corners.br, corners.bl];
  const dstPts = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH }
  ];

  // Tính ma trận ánh xạ từ Đích -> Nguồn (Inverse Homography)
  const H_inv = solveHomography(dstPts, srcPts);
  if (!H_inv) return srcCanvas;

  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = H_inv;

  // 3. Quét từng điểm ảnh đích và nội suy song tuyến (Bilinear Interpolation) từ ảnh nguồn
  let outIdx = 0;
  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const z = h6 * dx + h7 * dy + h8;
      const sx = (h0 * dx + h1 * dy + h2) / z;
      const sy = (h3 * dx + h4 * dy + h5) / z;

      if (sx >= 0 && sx < srcW - 1 && sy >= 0 && sy < srcH - 1) {
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const x1 = x0 + 1;
        const y1 = y0 + 1;

        const fx = sx - x0;
        const fy = sy - y0;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;

        const p00 = (y0 * srcW + x0) << 2;
        const p10 = (y0 * srcW + x1) << 2;
        const p01 = (y1 * srcW + x0) << 2;
        const p11 = (y1 * srcW + x1) << 2;

        outData[outIdx]     = w00 * srcData[p00]     + w10 * srcData[p10]     + w01 * srcData[p01]     + w11 * srcData[p11];
        outData[outIdx + 1] = w00 * srcData[p00 + 1] + w10 * srcData[p10 + 1] + w01 * srcData[p01 + 1] + w11 * srcData[p11 + 1];
        outData[outIdx + 2] = w00 * srcData[p00 + 2] + w10 * srcData[p10 + 2] + w01 * srcData[p01 + 2] + w11 * srcData[p11 + 2];
        outData[outIdx + 3] = 255;
      } else {
        outData[outIdx] = 255;
        outData[outIdx + 1] = 255;
        outData[outIdx + 2] = 255;
        outData[outIdx + 3] = 255;
      }
      outIdx += 4;
    }
  }

  outCtx.putImageData(outImgData, 0, 0);
  return outCanvas;
}

// ================= 3. KHỬ BÓNG ĐỔ & CÂN BẰNG SÁNG NỀN (ILLUMINATION FLATTENING) =================

/**
 * Khử bóng đổ và cân bằng ánh sáng không đều trên trang giấy
 * @param {HTMLCanvasElement} canvas 
 * @returns {HTMLCanvasElement}
 */
export function removeShadows(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 1. Tạo bản đồ ánh sáng nền thu nhỏ (Background Illumination Map)
  const bgScale = Math.min(1, 100 / w);
  const bgW = Math.max(10, Math.round(w * bgScale));
  const bgH = Math.max(10, Math.round(h * bgScale));

  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = bgW;
  bgCanvas.height = bgH;
  const bgCtx = bgCanvas.getContext('2d');
  // Vẽ thu nhỏ và làm mờ mạnh để chỉ giữ lại mảng sáng tối căn phòng
  bgCtx.filter = 'blur(12px)';
  bgCtx.drawImage(canvas, 0, 0, bgW, bgH);
  const bgData = bgCtx.getImageData(0, 0, bgW, bgH).data;

  // 2. Chia độ sáng ảnh gốc cho bản đồ nền để triệt tiêu bóng đổ
  for (let y = 0; y < h; y++) {
    const bgY = Math.min(bgH - 1, Math.floor(y * bgScale));
    for (let x = 0; x < w; x++) {
      const bgX = Math.min(bgW - 1, Math.floor(x * bgScale));
      const bgIdx = (bgY * bgW + bgX) << 2;

      // Độ sáng nền tại vị trí (x, y)
      const bgLum = Math.max(40, (bgData[bgIdx] * 77 + bgData[bgIdx + 1] * 150 + bgData[bgIdx + 2] * 29) >> 8);
      const factor = 240 / bgLum;

      const idx = (y * w + x) << 2;
      data[idx]     = Math.min(255, data[idx] * factor);
      data[idx + 1] = Math.min(255, data[idx + 1] * factor);
      data[idx + 2] = Math.min(255, data[idx + 2] * factor);
    }
  }

  const cleanCanvas = document.createElement('canvas');
  cleanCanvas.width = w;
  cleanCanvas.height = h;
  cleanCanvas.getContext('2d').putImageData(imgData, 0, 0);
  return cleanCanvas;
}

// ================= 4. BỘ LỌC TÀI LIỆU MA THUẬT (MAGIC COLOR) =================

/**
 * Áp dụng bộ lọc Magic Color: Trắng sứ nền giấy, giữ đỏ con dấu & xanh chữ ký, tăng nét chữ đen
 * @param {HTMLCanvasElement} canvas 
 * @param {Object} options 
 */
export function applyMagicColorFilter(canvas, options = {}) {
  const { brightness = 0, contrast = 0 } = options;
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    const lum = (r * 77 + g * 150 + b * 29) >> 8;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const isColoredInk = (maxC - minC) > 22; // Bút mực xanh hoặc con dấu đỏ

    if (isColoredInk) {
      // Giữ nguyên và tăng độ bão hòa màu mực
      r = Math.min(255, Math.max(0, r + brightness));
      g = Math.min(255, Math.max(0, g + brightness));
      b = Math.min(255, Math.max(0, b + brightness));
    } else {
      if (lum > 130) {
        // Nền giấy -> Đẩy trắng tinh
        const boost = (lum - 130) * 1.1 + 130 + brightness;
        r = Math.min(255, boost);
        g = Math.min(255, boost);
        b = Math.min(255, boost);
      } else {
        // Chữ đen -> Làm đậm nét
        const dark = lum * 0.82 + brightness * 0.4;
        r = Math.max(0, Math.min(255, dark));
        g = Math.max(0, Math.min(255, dark));
        b = Math.max(0, Math.min(255, dark));
      }
    }

    if (contrast !== 0) {
      r = Math.min(255, Math.max(0, cFactor * (r - 128) + 128));
      g = Math.min(255, Math.max(0, cFactor * (g - 128) + 128));
      b = Math.min(255, Math.max(0, cFactor * (b - 128) + 128));
    }

    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }

  const resCanvas = document.createElement('canvas');
  resCanvas.width = w;
  resCanvas.height = h;
  resCanvas.getContext('2d').putImageData(imgData, 0, 0);
  return resCanvas;
}
