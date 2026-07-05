import { parseSVGToGrid } from './geometry.js';

const GRID_SIZE = 200;

const svgUpload = document.getElementById('svgUpload');
const simCanvas = document.getElementById('simCanvas');
const btnStart  = document.getElementById('btnStart');
const ctx       = simCanvas.getContext('2d');

let grid = null;

function drawGrid(grid) {
  const imageData = ctx.createImageData(GRID_SIZE, GRID_SIZE);
  for (let i = 0; i < grid.length; i++) {
    const shade = grid[i] === 1 ? 0 : 255;
    imageData.data[i * 4]     = shade;
    imageData.data[i * 4 + 1] = shade;
    imageData.data[i * 4 + 2] = shade;
    imageData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

svgUpload.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  grid = await parseSVGToGrid(file);
  drawGrid(grid);
  btnStart.disabled = false;
});
