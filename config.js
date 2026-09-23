/**
 * config.js - Single Source of Truth cho toàn bộ Web Tools Hub
 * Nguyên tắc ETC: Khi muốn thêm/xóa/sửa tool, chỉ cần chỉnh sửa ở mảng này!
 */
export const TOOL_REGISTRY = [
  {
    id: "doc-scanner",
    name: "Document Scanner",
    path: "./tools/doc-scanner/index.html"
  },
  {
    id: "pdf-viewer",
    name: "PDF Viewer",
    path: "./tools/pdf-viewer/index.html"
  },
  {
    id: "excel-viewer",
    name: "Excel Viewer",
    path: "./tools/excel-viewer/index.html"
  }
];
