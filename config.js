/**
 * config.js - Single Source of Truth cho toàn bộ Web Tools Hub
 * Nguyên tắc ETC: Khi muốn thêm/xóa/sửa tool, chỉ cần chỉnh sửa ở mảng này!
 */
export const TOOL_REGISTRY = [
  {
    id: "doc-scanner",
    name: "Quét tài liệu",
    subtitle: "Chụp & tối ưu hóa tài liệu scan sang PDF",
    iconColor: "#0ea5e9",
    bgColor: "rgba(14, 165, 233, 0.15)",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V4a2 2 0 0 1 2-2h4"/><path d="M4 16v4a2 2 0 0 0 2 2h4"/><path d="M16 2h4a2 2 0 0 1 2 2v4"/><path d="M16 22h4a2 2 0 0 0 2-2v-4"/><rect x="8" y="7" width="8" height="10" rx="1"/></svg>`,
    path: "./tools/doc-scanner/index.html"
  },
  {
    id: "pdf-viewer",
    name: "Đọc file PDF",
    subtitle: "Xem trước và thu phóng file PDF mượt mà",
    iconColor: "#f43f5e",
    bgColor: "rgba(244, 63, 94, 0.15)",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>`,
    path: "./tools/pdf-viewer/index.html"
  },
  {
    id: "excel-viewer",
    name: "Đọc bảng tính Excel",
    subtitle: "Mở nhanh file .xlsx, .xls, .csv không cần Office",
    iconColor: "#10b981",
    bgColor: "rgba(16, 185, 129, 0.15)",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M10 9h1"/></svg>`,
    path: "./tools/excel-viewer/index.html"
  }
];
