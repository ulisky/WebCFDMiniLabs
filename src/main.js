import { parseSVGToGrid } from './geometry.js';
import { LBMSolver } from './solver.js';
import { Renderer } from './renderer.js';

const GRID_SIZE = 200;
const FLUID = 0, WALL = 1, INLET_1 = 2, OUTLET = 3, INLET_2 = 4;
const STEPS_PER_FRAME = 12;

const COLORS = {
  [FLUID]:  [255, 255, 255],
  [WALL]:   [0, 0, 0],
  [INLET_1]: [220, 40, 40],
  [INLET_2]: [220, 40, 40],
  [OUTLET]: [40, 90, 220],
};

const svgUpload         = document.getElementById('svgUpload');
const simCanvas         = document.getElementById('simCanvas');
const btnStart          = document.getElementById('btnStart');
const btnStop           = document.getElementById('btnStop');
const btnReset          = document.getElementById('btnReset');
const sliderInlet1      = document.getElementById('sliderInlet1');
const sliderInlet2      = document.getElementById('sliderInlet2');
const sliderInlet1Value = document.getElementById('sliderInlet1Value');
const sliderInlet2Value = document.getElementById('sliderInlet2Value');
const ctx               = simCanvas.getContext('2d');

let grid = null;
let painting = false;
let paintValue = null;
let simulationRunning = false;
let animationFrameId = null;
let inlet1Dir = { x: 1, y: 0 };
let inlet2Dir = { x: 1, y: 0 };
let inlet1Speed = parseFloat(sliderInlet1.value);
let inlet2Speed = parseFloat(sliderInlet2.value);

/* Vector Studio's background template (see BG_SNAP_POINTS in
   vector_studio_v5_2.html) fixes two small indicator dots near the top
   and one near the bottom of its 141.7x141.7 canvas as permanent snap
   targets — every student's channel walls snap their endpoints to
   these exact points. That template is stripped before export, so the
   uploaded SVG carries no visual trace of the dots; their positions
   are hardcoded here to match, so the two top dots are always the
   inlets and the bottom dot is always the outlet, with no manual
   painting required to go from design to simulation. */
const CANVAS_UNITS      = 141.7;
const MARKER_SEARCH_R   = 5;   /* grid cells: how far to hunt for open fluid if a marker lands on a wall pixel */
const MARKER_FLOOD_R    = 12;  /* grid cells: how far the inlet/outlet region can spread from each marker */
const INLET_MARKERS_SVG  = [[43.8, 21.7], [101.4, 21.7]];
const OUTLET_MARKERS_SVG = [[71, 127.7]];

function svgToGrid(x, y) {
  return {
    x: Math.round(x * GRID_SIZE / CANVAS_UNITS),
    y: Math.round(y * GRID_SIZE / CANVAS_UNITS),
  };
}

function findNearestFluidCell(grid, x, y) {
  if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE && grid[y * GRID_SIZE + x] !== WALL) {
    return { x, y };
  }

  for (let r = 1; r <= MARKER_SEARCH_R; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;

        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
        if (grid[ny * GRID_SIZE + nx] !== WALL) return { x: nx, y: ny };
      }
    }
  }

  return null;
}

/* Flood-fills the connected fluid region from (originX, originY) with
   `value`, and returns a unit vector pointing from the origin toward
   the region's centroid - the local direction the channel runs in.
   The solver forces each inlet's velocity along this vector (scaled by
   its slider) instead of a fixed +x direction, since a hardcoded
   direction breaks on diagonal or branching channels: the forced flow
   crashes into the wall and never develops past the inlet. */
function floodFillBoundary(grid, originX, originY, value) {
  const seed = findNearestFluidCell(grid, originX, originY);
  if (!seed) return null;

  const visited = new Set([seed.y * GRID_SIZE + seed.x]);
  const queue = [seed];
  let sumX = 0, sumY = 0, count = 0;

  while (queue.length > 0) {
    const { x, y } = queue.shift();
    grid[y * GRID_SIZE + x] = value;
    sumX += x; sumY += y; count++;

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
      if (Math.max(Math.abs(nx - originX), Math.abs(ny - originY)) > MARKER_FLOOD_R) continue;

      const nIdx = ny * GRID_SIZE + nx;
      if (visited.has(nIdx) || grid[nIdx] === WALL) continue;

      visited.add(nIdx);
      queue.push({ x: nx, y: ny });
    }
  }

  const dx = sumX / count - originX;
  const dy = sumY / count - originY;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function applyDesignMarkers(grid) {
  const [m1, m2] = INLET_MARKERS_SVG;
  const p1 = svgToGrid(m1[0], m1[1]);
  const p2 = svgToGrid(m2[0], m2[1]);

  inlet1Dir = floodFillBoundary(grid, p1.x, p1.y, INLET_1) || { x: 1, y: 0 };
  inlet2Dir = floodFillBoundary(grid, p2.x, p2.y, INLET_2) || { x: 1, y: 0 };

  for (const [svgX, svgY] of OUTLET_MARKERS_SVG) {
    const { x, y } = svgToGrid(svgX, svgY);
    floodFillBoundary(grid, x, y, OUTLET);
  }
}

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
  if (!grid || paintValue === null || simulationRunning) return;

  const { x, y } = canvasToGrid(event);
  if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return;

  const idx = y * GRID_SIZE + x;
  if (grid[idx] === WALL) return;

  grid[idx] = paintValue;
  drawCell(x, y, paintValue);
}

function stopSimulation() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  simulationRunning = false;
  svgUpload.disabled = false;
  btnStart.disabled = !grid;
  btnStop.disabled = true;
}

function resetSimulation() {
  stopSimulation();

  grid = null;
  painting = false;
  paintValue = null;

  svgUpload.value = '';
  svgUpload.disabled = false;
  btnStart.disabled = true;
  btnStop.disabled = true;
  btnReset.disabled = true;

  ctx.clearRect(0, 0, simCanvas.width, simCanvas.height);
}

svgUpload.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  grid = await parseSVGToGrid(file);
  applyDesignMarkers(grid);
  drawGrid(grid);
  btnStart.disabled = false;
  btnReset.disabled = false;
});

sliderInlet1.addEventListener('input', () => {
  inlet1Speed = parseFloat(sliderInlet1.value);
  sliderInlet1Value.textContent = sliderInlet1.value;
});

sliderInlet2.addEventListener('input', () => {
  inlet2Speed = parseFloat(sliderInlet2.value);
  sliderInlet2Value.textContent = sliderInlet2.value;
});

simCanvas.addEventListener('contextmenu', (event) => event.preventDefault());

simCanvas.addEventListener('mousedown', (event) => {
  if (simulationRunning) return;

  if (event.button === 0)      paintValue = INLET_1;
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

btnStart.addEventListener('click', () => {
  if (!grid || simulationRunning) return;

  simulationRunning = true;
  svgUpload.disabled = true;
  btnStart.disabled = true;
  btnStop.disabled = false;

  const solver = new LBMSolver(grid, inlet1Dir, inlet2Dir);
  const renderer = new Renderer(simCanvas, grid);

  function frame() {
    for (let i = 0; i < STEPS_PER_FRAME; i++) solver.step(inlet1Speed, inlet2Speed);
    renderer.drawHeatmap(solver.ux, solver.uy);
    renderer.drawStreamlines(solver.ux, solver.uy);
    animationFrameId = requestAnimationFrame(frame);
  }

  animationFrameId = requestAnimationFrame(frame);
});

btnStop.addEventListener('click', () => {
  if (!simulationRunning) return;
  stopSimulation();
});

btnReset.addEventListener('click', () => {
  if (!grid && !simulationRunning) return;
  resetSimulation();
});
