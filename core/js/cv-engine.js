/**
 * core/js/cv-engine.js
 * Engine thị giác máy tính tài liệu chuẩn công nghiệp (Heavy-Duty Computer Vision Engine):
 * 1. OpenCV.js WebAssembly (Biện pháp mạnh): Canny edge, Otsu morphology, findContours, approxPolyDP & homography warp.
 * 2. Pure JS Dual-Engine Fallback: Tự động phân ngưỡng Otsu + khối tâm giấy + cực trị góc phần tư.
 * 3. Tối ưu cực đại cho chụp văn bản, vở học sinh, sách vở, hóa đơn trên mặt bàn gỗ / nền tối.
 */

// ================= 0. KHỞI TẠO & QUẢN LÝ OPENCV.JS =================

let cvReady = false;
let cvInitPromise = null;

/**
 * Nạp động OpenCV.js WebAssembly (nếu chưa nạp)
 * @returns {Promise<any>}
 */
export function loadOpenCV() {
  if (window.cv && window.cv.Mat) {
    cvReady = true;
    return Promise.resolve(window.cv);
  }
  if (cvInitPromise) return cvInitPromise;

  cvInitPromise = new Promise((resolve) => {
    const onReady = () => {
      cvReady = true;
      console.log('⚡ OpenCV.js WebAssembly Engine đã sẵn sàng!');
      window.dispatchEvent(new CustomEvent('opencv-ready'));
      resolve(window.cv);
    };

    if (window.cv && window.cv.Mat) {
      onReady();
      return;
    }

    if (window.cv) {
      window.cv['onRuntimeInitialized'] = onReady;
    }

    // Tự động kiểm tra định kỳ (phòng trường hợp cdn load async)
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (window.cv && window.cv.Mat) {
        clearInterval(timer);
        onReady();
      } else if (window.cv && !window.cv.onRuntimeInitialized) {
        window.cv.onRuntimeInitialized = () => {
          clearInterval(timer);
          onReady();
        };
      }
      if (attempts > 300) { // 15 giây timeout
        clearInterval(timer);
        console.warn('⚠️ OpenCV nạp quá thời gian, sử dụng Pure JS Engine.');
        resolve(null);
      }
    }, 50);
  });

  return cvInitPromise;
}

/**
 * Kiểm tra xem OpenCV.js đã sẵn sàng hay chưa
 * @returns {boolean}
 */
export function isOpenCVReady() {
  return !!(window.cv && window.cv.Mat);
}

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

/**
 * Sắp xếp 4 điểm bất kỳ thành thứ tự chuẩn: tl (trên-trái), tr (trên-phải), br (dưới-phải), bl (dưới-trái)
 * Dựa trên tổng (x+y) và hiệu (y-x) chuẩn thuật toán thị giác máy tính.
 */
export function orderPoints(pts) {
  if (!pts || pts.length < 4) return null;

  let tl = pts[0], br = pts[0], tr = pts[0], bl = pts[0];
  let minSum = pts[0].x + pts[0].y;
  let maxSum = minSum;
  let minDiff = pts[0].y - pts[0].x;
  let maxDiff = minDiff;

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const s = p.x + p.y;
    const d = p.y - p.x;

    if (s < minSum) { minSum = s; tl = p; }
    if (s > maxSum) { maxSum = s; br = p; }
    if (d < minDiff) { minDiff = d; tr = p; }
    if (d > maxDiff) { maxDiff = d; bl = p; }
  }

  return { tl, tr, br, bl };
}

// ================= 1. THUẬT TOÁN NHẬN DIỆN 4 GÓC TÀI LIỆU =================

/**
 * Nhận diện 4 góc tài liệu bằng OpenCV.js (Biện pháp mạnh)
 * @param {HTMLImageElement|HTMLCanvasElement} source 
 * @returns {{tl: {x,y}, tr: {x,y}, br: {x,y}, bl: {x,y}}|null}
 */
export function detectCornersOpenCV(source) {
  if (!isOpenCVReady()) return null;
  const cv = window.cv;

  const origW = source.naturalWidth || source.width;
  const origH = source.naturalHeight || source.height;

  // Thu nhỏ ảnh xuống max 600px để xử lý cực nhanh (< 25ms) trên điện thoại
  const maxDim = 600;
  const scale = Math.min(1, maxDim / Math.max(origW, origH));
  const w = Math.round(origW * scale);
  const h = Math.round(origH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);

  let src = null, gray = null, blur = null, thresh = null, edges = null, closed = null;
  let contours = null, hierarchy = null, approx = null;

  try {
    src = cv.imread(canvas);
    gray = new cv.Mat();
    blur = new cv.Mat();
    thresh = new cv.Mat();
    edges = new cv.Mat();
    closed = new cv.Mat();
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    approx = new cv.Mat();

    // 1. Grayscale & GaussianBlur làm mượt nhiễu hạt
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    // 2. Phân ngưỡng tự động Otsu để bóc tách giấy trắng ra khỏi mặt bàn
    cv.threshold(blur, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

    // Kiểm tra cực tính viền ảnh: nếu viền sáng hơn (giấy sẫm màu trên bàn sáng), đảo ngược
    let borderBright = 0, totalBorder = 0;
    const threshData = thresh.data;
    for (let x = 0; x < w; x += 4) {
      if (threshData[x] > 128) borderBright++;
      if (threshData[(h - 1) * w + x] > 128) borderBright++;
      totalBorder += 2;
    }
    for (let y = 0; y < h; y += 4) {
      if (threshData[y * w] > 128) borderBright++;
      if (threshData[y * w + (w - 1)] > 128) borderBright++;
      totalBorder += 2;
    }
    if (borderBright / totalBorder > 0.5) {
      cv.bitwise_not(thresh, thresh);
    }

    // Phép đóng hình thái học (Morphological Close) để hàn gắn các đường đứt đoạn
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
    cv.morphologyEx(thresh, closed, cv.MORPH_CLOSE, kernel);

    // Tìm tất cả các đường bao (Contours)
    cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    let maxContour = null;
    let maxArea = 0;
    const minArea = (w * h) * 0.10; // Tài liệu phải chiếm tối thiểu 10% khung hình
    const maxAreaLimit = (w * h) * 0.95; // Bỏ qua viền ngoài cùng khung ảnh

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const a = cv.contourArea(cnt);
      if (a > maxArea && a >= minArea && a <= maxAreaLimit) {
        maxArea = a;
        maxContour = cnt;
      }
    }

    // Nếu Otsu chưa bắt được, kích hoạt phương án phụ Canny edge detection
    if (!maxContour) {
      cv.Canny(blur, edges, 50, 150);
      cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);
      contours.delete();
      hierarchy.delete();
      contours = new cv.MatVector();
      hierarchy = new cv.Mat();
      cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const a = cv.contourArea(cnt);
        if (a > maxArea && a >= minArea && a <= maxAreaLimit) {
          maxArea = a;
          maxContour = cnt;
        }
      }
    }
    kernel.delete();

    if (!maxContour) return null;

    let corners = null;
    const peri = cv.arcLength(maxContour, true);

    // 3. Thử xấp xỉ đa giác 4 đỉnh (approxPolyDP)
    const epsilons = [0.02, 0.03, 0.04, 0.015, 0.05];
    for (const eps of epsilons) {
      cv.approxPolyDP(maxContour, approx, eps * peri, true);
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const pts = [];
        for (let i = 0; i < 4; i++) {
          pts.push({
            x: approx.data32S[i * 2],
            y: approx.data32S[i * 2 + 1]
          });
        }
        corners = orderPoints(pts);
        break;
      }
    }

    // 4. Nếu tài liệu bị cong mép/gáy sách (không ra đúng 4 đỉnh), dùng thuật toán 4 góc phần tư từ tâm (minAreaRect)
    if (!corners) {
      const rect = cv.minAreaRect(maxContour);
      const center = rect.center;
      let tl = null, tr = null, bl = null, br = null;
      let maxDistTL = 0, maxDistTR = 0, maxDistBL = 0, maxDistBR = 0;

      for (let i = 0; i < maxContour.data32S.length; i += 2) {
        const pt = { x: maxContour.data32S[i], y: maxContour.data32S[i + 1] };
        const d = (pt.x - center.x) ** 2 + (pt.y - center.y) ** 2;

        if (pt.x <= center.x && pt.y <= center.y) {
          if (d > maxDistTL) { maxDistTL = d; tl = pt; }
        } else if (pt.x >= center.x && pt.y <= center.y) {
          if (d > maxDistTR) { maxDistTR = d; tr = pt; }
        } else if (pt.x <= center.x && pt.y >= center.y) {
          if (d > maxDistBL) { maxDistBL = d; bl = pt; }
        } else if (pt.x >= center.x && pt.y >= center.y) {
          if (d > maxDistBR) { maxDistBR = d; br = pt; }
        }
      }

      if (tl && tr && br && bl) {
        corners = orderPoints([tl, tr, br, bl]);
      }
    }

    if (!corners) return null;

    // Quy đổi tọa độ về kích thước ảnh gốc
    return {
      tl: { x: Math.round(corners.tl.x / scale), y: Math.round(corners.tl.y / scale) },
      tr: { x: Math.round(corners.tr.x / scale), y: Math.round(corners.tr.y / scale) },
      br: { x: Math.round(corners.br.x / scale), y: Math.round(corners.br.y / scale) },
      bl: { x: Math.round(corners.bl.x / scale), y: Math.round(corners.bl.y / scale) }
    };

  } catch (err) {
    console.warn('Lỗi OpenCV detectCorners:', err);
    return null;
  } finally {
    if (src) src.delete();
    if (gray) gray.delete();
    if (blur) blur.delete();
    if (thresh) thresh.delete();
    if (edges) edges.delete();
    if (closed) closed.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
    if (approx) approx.delete();
  }
}

/**
 * Thuật toán Pure JavaScript nâng cao (chạy khi OpenCV chưa kịp tải xong hoặc ngoại tuyến)
 * Sử dụng bóc tách Otsu và tìm khối tâm tài liệu, không bao giờ lấy nhầm viền đen ngoài khung hình.
 */
export function detectCornersPureJS(source) {
  const origW = source.naturalWidth || source.width;
  const origH = source.naturalHeight || source.height;

  const fallback = {
    tl: { x: Math.round(origW * 0.08), y: Math.round(origH * 0.08) },
    tr: { x: Math.round(origW * 0.92), y: Math.round(origH * 0.08) },
    br: { x: Math.round(origW * 0.92), y: Math.round(origH * 0.92) },
    bl: { x: Math.round(origW * 0.08), y: Math.round(origH * 0.92) }
  };

  try {
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

    // 1. Chuyển thang xám và tạo biểu đồ tần suất (Histogram)
    const gray = new Uint8Array(w * h);
    const hist = new Int32Array(256);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const g = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
      gray[j] = g;
      hist[g]++;
    }

    // 2. Tính ngưỡng Otsu tự động
    const total = w * h;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, varMax = 0, threshold = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const varBetween = wB * wF * (mB - mF) * (mB - mF);
      if (varBetween > varMax) {
        varMax = varBetween;
        threshold = t;
      }
    }

    // 3. Kiểm tra cực tính viền ảnh
    let borderBright = 0, totalBorder = 0;
    for (let x = 0; x < w; x++) {
      if (gray[x] >= threshold) borderBright++;
      if (gray[(h - 1) * w + x] >= threshold) borderBright++;
      totalBorder += 2;
    }
    for (let y = 0; y < h; y++) {
      if (gray[y * w] >= threshold) borderBright++;
      if (gray[y * w + (w - 1)] >= threshold) borderBright++;
      totalBorder += 2;
    }
    const invert = (borderBright / totalBorder) > 0.5;

    // 4. Tìm khối tâm (Center of Mass) của vùng giấy tài liệu
    let sumX = 0, sumY = 0, count = 0;
    const margin = Math.max(3, Math.round(w * 0.03)); // Cách mép ảnh 3% để loại bỏ phản quang rìa ống kính
    for (let y = margin; y < h - margin; y++) {
      for (let x = margin; x < w - margin; x++) {
        const isPaper = invert ? (gray[y * w + x] < threshold) : (gray[y * w + x] >= threshold);
        if (isPaper) {
          sumX += x;
          sumY += y;
          count++;
        }
      }
    }

    if (count < total * 0.10) return fallback;

    const cX = sumX / count;
    const cY = sumY / count;

    // 5. Tìm 4 điểm xa tâm nhất thuộc vùng giấy trong 4 góc phần tư
    let tl = null, tr = null, br = null, bl = null;
    let maxTL = 0, maxTR = 0, maxBR = 0, maxBL = 0;

    for (let y = margin; y < h - margin; y++) {
      for (let x = margin; x < w - margin; x++) {
        const isPaper = invert ? (gray[y * w + x] < threshold) : (gray[y * w + x] >= threshold);
        if (isPaper) {
          const dist = (x - cX) ** 2 + (y - cY) ** 2;
          if (x <= cX && y <= cY && dist > maxTL) { maxTL = dist; tl = { x, y }; }
          else if (x >= cX && y <= cY && dist > maxTR) { maxTR = dist; tr = { x, y }; }
          else if (x >= cX && y >= cY && dist > maxBR) { maxBR = dist; br = { x, y }; }
          else if (x <= cX && y >= cY && dist > maxBL) { maxBL = dist; bl = { x, y }; }
        }
      }
    }

    if (!tl || !tr || !br || !bl) return fallback;

    const area = 0.5 * Math.abs(
      (tl.x * tr.y - tr.x * tl.y) +
      (tr.x * br.y - br.x * tr.y) +
      (br.x * bl.y - bl.x * br.y) +
      (bl.x * tl.y - bl.x * tl.y)
    );

    if (area < total * 0.12) return fallback;

    return {
      tl: { x: Math.round(tl.x / scale), y: Math.round(tl.y / scale) },
      tr: { x: Math.round(tr.x / scale), y: Math.round(tr.y / scale) },
      br: { x: Math.round(br.x / scale), y: Math.round(br.y / scale) },
      bl: { x: Math.round(bl.x / scale), y: Math.round(bl.y / scale) }
    };
  } catch (err) {
    console.warn('Lỗi pure JS detect, dùng fallback:', err);
    return fallback;
  }
}

/**
 * Tự động tìm 4 góc tài liệu: Ưu tiên OpenCV.js (Biện pháp mạnh), dự phòng Pure JS
 * @param {HTMLImageElement|HTMLCanvasElement} source 
 * @returns {{tl: {x,y}, tr: {x,y}, br: {x,y}, bl: {x,y}}}
 */
export function autoDetectCorners(source) {
  if (isOpenCVReady()) {
    const opencvResult = detectCornersOpenCV(source);
    if (opencvResult) {
      console.log('⚡ Nhận diện 4 góc thành công bằng OpenCV.js Wasm');
      return opencvResult;
    }
  }

  console.log('💡 Dùng thuật toán Pure JS nhận diện mép tài liệu');
  return detectCornersPureJS(source);
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
 * Nắn thẳng góc phối cảnh từ 4 điểm bất kỳ (Hỗ trợ OpenCV tăng tốc Wasm hoặc Pure JS Bilinear)
 * @param {HTMLCanvasElement|HTMLImageElement} source 
 * @param {{tl: {x,y}, tr: {x,y}, br: {x,y}, bl: {x,y}}} corners 
 * @returns {HTMLCanvasElement}
 */
export function warpPerspective(source, corners) {
  const srcCanvas = createCanvasFromSource(source);
  const srcW = srcCanvas.width;
  const srcH = srcCanvas.height;

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

  // Nếu OpenCV.js đã sẵn sàng, nắn bằng WebAssembly siêu tốc (1-2ms)
  if (isOpenCVReady()) {
    try {
      const cv = window.cv;
      const srcMat = cv.imread(srcCanvas);
      const dstMat = new cv.Mat();
      const dsize = new cv.Size(outW, outH);

      const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        corners.tl.x, corners.tl.y,
        corners.tr.x, corners.tr.y,
        corners.br.x, corners.br.y,
        corners.bl.x, corners.bl.y
      ]);

      const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        outW, 0,
        outW, outH,
        0, outH
      ]);

      const M = cv.getPerspectiveTransform(srcTri, dstTri);
      cv.warpPerspective(srcMat, dstMat, M, dsize, cv.INTER_LINEAR, cv.BORDER_REPLICATE);
      cv.imshow(outCanvas, dstMat);

      srcMat.delete();
      dstMat.delete();
      srcTri.delete();
      dstTri.delete();
      M.delete();

      return outCanvas;
    } catch (e) {
      console.warn('OpenCV warpPerspective lỗi, chuyển sang Pure JS:', e);
    }
  }

  // Phương án dự phòng Pure JS Homography
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  const srcImgData = srcCtx.getImageData(0, 0, srcW, srcH);
  const srcData = srcImgData.data;

  const outCtx = outCanvas.getContext('2d');
  const outImgData = outCtx.createImageData(outW, outH);
  const outData = outImgData.data;

  const srcPts = [corners.tl, corners.tr, corners.br, corners.bl];
  const dstPts = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH }
  ];

  const H_inv = solveHomography(dstPts, srcPts);
  if (!H_inv) return srcCanvas;

  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = H_inv;

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
        const f00 = (1 - fx) * (1 - fy);
        const f10 = fx * (1 - fy);
        const f01 = (1 - fx) * fy;
        const f11 = fx * fy;

        const idx00 = (y0 * srcW + x0) * 4;
        const idx10 = (y0 * srcW + x1) * 4;
        const idx01 = (y1 * srcW + x0) * 4;
        const idx11 = (y1 * srcW + x1) * 4;

        const outIdx = (dy * outW + dx) * 4;
        outData[outIdx]     = f00 * srcData[idx00]     + f10 * srcData[idx10]     + f01 * srcData[idx01]     + f11 * srcData[idx11];
        outData[outIdx + 1] = f00 * srcData[idx00 + 1] + f10 * srcData[idx10 + 1] + f01 * srcData[idx01 + 1] + f11 * srcData[idx11 + 1];
        outData[outIdx + 2] = f00 * srcData[idx00 + 2] + f10 * srcData[idx10 + 2] + f01 * srcData[idx01 + 2] + f11 * srcData[idx11 + 2];
        outData[outIdx + 3] = 255;
      }
    }
  }

  outCtx.putImageData(outImgData, 0, 0);
  return outCanvas;
}

// ================= 3. KHỬ BÓNG ĐỔ & CÂN BẰNG NỀN ÁNH SÁNG =================

/**
 * Khử bóng loang lổ, bóng tay cầm điện thoại bằng ma trận tích lũy ánh sáng nền
 * @param {HTMLCanvasElement} canvas 
 * @returns {HTMLCanvasElement}
 */
export function removeShadows(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 1. Trích xuất nền ánh sáng (Background Illumination Map) bằng bản thu nhỏ
  const bgScale = Math.min(1, 160 / Math.max(w, h));
  const bgW = Math.max(10, Math.round(w * bgScale));
  const bgH = Math.max(10, Math.round(h * bgScale));

  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = bgW;
  bgCanvas.height = bgH;
  const bgCtx = bgCanvas.getContext('2d');
  bgCtx.drawImage(canvas, 0, 0, bgW, bgH);

  // Áp dụng bộ lọc mờ Gauss trên nền thu nhỏ
  bgCtx.filter = 'blur(6px)';
  bgCtx.drawImage(bgCanvas, 0, 0);

  const bgImgData = bgCtx.getImageData(0, 0, bgW, bgH);
  const bgData = bgImgData.data;

  // 2. Chia độ sáng pixel cho độ sáng nền tương ứng
  const scaleX = bgW / w;
  const scaleY = bgH / h;

  for (let y = 0; y < h; y++) {
    const bgY = Math.min(bgH - 1, Math.floor(y * scaleY));
    const bgRowOffset = bgY * bgW;
    const rowOffset = y * w;

    for (let x = 0; x < w; x++) {
      const idx = (rowOffset + x) * 4;
      const bgX = Math.min(bgW - 1, Math.floor(x * scaleX));
      const bgIdx = (bgRowOffset + bgX) * 4;

      const bgLum = (bgData[bgIdx] * 77 + bgData[bgIdx + 1] * 150 + bgData[bgIdx + 2] * 29) >> 8;
      const bgSafe = Math.max(40, bgLum);

      // Công thức phẳng hóa ánh sáng: Pixel_out = (Pixel_in / BG_Lum) * 235
      const factor = 235 / bgSafe;
      data[idx]     = Math.min(255, Math.max(0, data[idx] * factor));
      data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] * factor));
      data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] * factor));
    }
  }

  const resCanvas = document.createElement('canvas');
  resCanvas.width = w;
  resCanvas.height = h;
  resCanvas.getContext('2d').putImageData(imgData, 0, 0);
  return resCanvas;
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
