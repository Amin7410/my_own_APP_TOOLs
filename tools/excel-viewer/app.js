import { setupDropZone } from '../../core/js/file.js';

const input = document.getElementById('input');
const name = document.getElementById('name');
const dropZone = document.getElementById('dropZone');
const tableBox = document.getElementById('tableBox');

function openExcel(file) {
  if (!file) return;
  name.textContent = `Tệp: ${file.name}`;
  dropZone.style.display = 'none';
  tableBox.style.display = 'block';
}

input.addEventListener('change', e => {
  if (e.target.files && e.target.files[0]) {
    openExcel(e.target.files[0]);
  }
});

setupDropZone(dropZone, files => {
  if (files && files[0]) {
    openExcel(files[0]);
  }
});
