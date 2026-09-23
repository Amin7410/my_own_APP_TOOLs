/**
 * core/js/file.js - Module thuần khiết xử lý I/O tệp tin (Pure utility functions)
 * Ngăn ngừa trùng lặp mã nguồn FileReader / Drag & Drop trên các tool.
 */

/**
 * Đọc file dưới dạng Data URL (chuỗi base64 cho hình ảnh)
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Đọc file dưới dạng ArrayBuffer (cho PDF.js, SheetJS Excel)
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Đọc file dưới dạng Text (cho CSV, JSON, TXT)
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Thiết lập vùng kéo thả (Dropzone) chuẩn chỉ, tự quản lý class dragover
 * @param {HTMLElement} element - Phần tử dropzone
 * @param {Function} onDropCallback - Hàm callback nhận vào danh sách Files
 */
export function setupDropZone(element, onDropCallback) {
  if (!element) return;

  element.addEventListener('dragover', (e) => {
    e.preventDefault();
    element.classList.add('dragover');
  });

  element.addEventListener('dragleave', (e) => {
    e.preventDefault();
    element.classList.remove('dragover');
  });

  element.addEventListener('drop', (e) => {
    e.preventDefault();
    element.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onDropCallback(e.dataTransfer.files);
    }
  });
}
