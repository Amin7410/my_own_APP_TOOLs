import { setupDropZone } from '../../core/js/file.js';

const input = document.getElementById('input');
const name = document.getElementById('name');
const zoom = document.getElementById('zoom');
const page = document.getElementById('page');
const dropZone = document.getElementById('dropZone');
const viewport = document.getElementById('viewport');
const btnIn = document.getElementById('btnIn');
const btnOut = document.getElementById('btnOut');

let currentZoom = 100;

function openPdf(file) {
  if (!file) return;
  name.textContent = file.name;
  page.textContent = `Đang mở file: ${file.name}`;
  dropZone.style.display = 'none';
  viewport.style.display = 'flex';
}

function updateZoom() {
  zoom.textContent = `${currentZoom}%`;
  page.style.maxWidth = `${800 * (currentZoom / 100)}px`;
}

input.addEventListener('change', e => {
  if (e.target.files && e.target.files[0]) {
    openPdf(e.target.files[0]);
  }
});

setupDropZone(dropZone, files => {
  if (files && files[0]) {
    openPdf(files[0]);
  }
});

btnIn.addEventListener('click', () => {
  if (currentZoom < 250) {
    currentZoom += 20;
    updateZoom();
  }
});

btnOut.addEventListener('click', () => {
  if (currentZoom > 40) {
    currentZoom -= 20;
    updateZoom();
  }
});
