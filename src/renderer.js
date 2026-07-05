const GRID_SIZE = 200;
const FLUID = 0, WALL = 1, INLET = 2, OUTLET = 3;

const PARTICLE_COUNT   = 500;
const ADVECTION_SCALE  = 15;   /* matches the 10-15 solver substeps per frame */
const V_MAX            = 0.1;  /* lattice speed that maps to the top of the ramp */

/* Viridis: perceptually-uniform, colorblind-safe sequential colormap —
   the standard accessible replacement for a classic blue-to-red "jet"
   scale in scientific visualization. Dark purple = slow, yellow = fast. */
const VIRIDIS_STOPS = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
];

function viridis(t) {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const scaled  = clamped * (VIRIDIS_STOPS.length - 1);
  const i       = Math.min(VIRIDIS_STOPS.length - 2, Math.floor(scaled));
  const frac    = scaled - i;
  const [r1, g1, b1] = VIRIDIS_STOPS[i];
  const [r2, g2, b2] = VIRIDIS_STOPS[i + 1];
  return [
    r1 + (r2 - r1) * frac,
    g1 + (g2 - g1) * frac,
    b1 + (b2 - b1) * frac,
  ];
}

export class Renderer {
  constructor(canvas, grid) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.grid   = grid;
    this.size   = GRID_SIZE;

    this.heatmapImage = this.ctx.createImageData(GRID_SIZE, GRID_SIZE);

    this.inletCells = [];
    for (let idx = 0; idx < grid.length; idx++) {
      if (grid[idx] === INLET) this.inletCells.push(idx);
    }

    this.particles = Array.from({ length: PARTICLE_COUNT }, () => this._spawnParticle());
  }

  _randomInletPosition() {
    if (this.inletCells.length === 0) {
      return { x: Math.random() * this.size, y: Math.random() * this.size };
    }
    const idx = this.inletCells[(Math.random() * this.inletCells.length) | 0];
    return { x: idx % this.size, y: Math.floor(idx / this.size) };
  }

  _spawnParticle() {
    const { x, y } = this._randomInletPosition();
    return { x, y, px: x, py: y };
  }

  drawHeatmap(ux, uy) {
    const { grid, heatmapImage } = this;
    const data = heatmapImage.data;

    for (let idx = 0; idx < grid.length; idx++) {
      const o = idx * 4;
      if (grid[idx] === WALL) {
        data[o] = 0; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 255;
        continue;
      }

      const speed = Math.sqrt(ux[idx] * ux[idx] + uy[idx] * uy[idx]);
      const [r, g, b] = viridis(speed / V_MAX);
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }

    this.ctx.putImageData(heatmapImage, 0, 0);
  }

  drawStreamlines(ux, uy) {
    const { ctx, grid, size, particles } = this;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth   = 1;
    ctx.beginPath();

    for (const p of particles) {
      const idx = (p.y | 0) * size + (p.x | 0);

      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);

      p.px = p.x;
      p.py = p.y;
      p.x += ux[idx] * ADVECTION_SCALE;
      p.y += uy[idx] * ADVECTION_SCALE;

      const nx = p.x | 0;
      const ny = p.y | 0;
      const outOfBounds = nx < 0 || nx >= size || ny < 0 || ny >= size;
      const cell = outOfBounds ? WALL : grid[ny * size + nx];

      if (outOfBounds || cell === WALL || cell === OUTLET) {
        const spawn = this._randomInletPosition();
        p.x = p.px = spawn.x;
        p.y = p.py = spawn.y;
      }
    }

    ctx.stroke();
  }
}
