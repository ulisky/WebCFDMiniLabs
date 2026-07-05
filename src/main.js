import { parseSVGToGrid } from './geometry.js';

const GRID_SIZE = 200;
const FLUID = 0, WALL = 1, INLET = 2, OUTLET = 3;

const COLORS = {
  [FLUID]:  [255, 255, 255],
  [WALL]:   [0, 0, 0],
  [INLET]:  [220, 40, 40],
  [OUTLET]: [40, 90, 220],
};

const svgUpload = document.getElementById('svgUpload');
const simCanvas = document.getElementById('simCanvas');
const btnStart  = document.getElementById('btnStart');
const ctx       = simCanvas.getContext('2d');

let grid = null;
let painting = false;
let paintValue = null;

function drawGrid(grid) {
  const imageData = ctx.createImageData(GRID_SIZE, GRID_SIZE);
  for (let i = 0; i < grid.length; i++) {
    const [r, g, b] = COLORS[grid[i]];
    imageData.data[i * 4]     = r;
    imageData.data[i * 4 + 1] = g;
    imageData.data[i * 4 + 2] = b;
    imageData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

function drawCell(x, y, value) {
  const [r, g, b] = COLORS[value];
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(x, y, 1, 1);
}

function canvasToGrid(event) {
  const rect = simCanvas.getBoundingClientRect();
  return {
    x: Math.floor((event.clientX - rect.left) / rect.width  * GRID_SIZE),
    y: Math.floor((event.clientY - rect.top)  / rect.height * GRID_SIZE),
  };
}

function paintAt(event) {
  if (!grid || paintValue === null) return;

  const { x, y } = canvasToGrid(event);
  if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return;

  const idx = y * GRID_SIZE + x;
  if (grid[idx] === WALL) return;

  grid[idx] = paintValue;
  drawCell(x, y, paintValue);
}

svgUpload.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  grid = await parseSVGToGrid(file);
  drawGrid(grid);
  btnStart.disabled = false;
});

simCanvas.addEventListener('contextmenu', (event) => event.preventDefault());

simCanvas.addEventListener('mousedown', (event) => {
  if (event.button === 0)      paintValue = INLET;
  else if (event.button === 2) paintValue = OUTLET;
  else return;

  painting = true;
  paintAt(event);
});

simCanvas.addEventListener('mousemove', (event) => {
  if (painting) paintAt(event);
});

window.addEventListener('mouseup', () => {
  painting = false;
  paintValue = null;
});
