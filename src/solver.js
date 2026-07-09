const GRID_SIZE = 200;
const N = GRID_SIZE * GRID_SIZE;
const Q = 9;

/* D2Q9 lattice: 0=rest, 1=E, 2=N, 3=W, 4=S, 5=NE, 6=NW, 7=SW, 8=SE */
const CX  = [0, 1, 0, -1, 0, 1, -1, -1, 1];
const CY  = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const W   = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];

const FLUID = 0, WALL = 1, INLET_1 = 2, OUTLET = 3, INLET_2 = 4;

const TAU           = 1.0;   /* relaxation time -> water-like viscosity */
const REFERENCE_RHO = 1.0;

/* Small density assist at the inlets (vs. REFERENCE_RHO at the outlet):
   forcing velocity alone gives the channel no sustained driving force
   past the point of injection, so momentum injected at the inlet
   decays via wall friction over the channel's length with nothing to
   replenish it. That's barely noticeable for a short, direct, wide
   channel, but for a longer or narrower one - e.g. a left inlet that
   runs horizontally or diagonally toward the right before turning
   down to the outlet, which travels a good deal further than a direct
   diagonal path - the injected flow can decay to a barely-visible
   trickle well before reaching the outlet, reading as "the flow stops
   there and never reaches the pipe." A real pressure difference (not
   just the forced boundary velocity) keeps driving flow through that
   resistance the whole way down the channel. 1.2 was picked as the
   largest value that still exactly matches the forced boundary
   velocity on a straight/wide reference channel (checked up to the
   slider's 0.1 max) - anything higher starts overshooting past the
   requested velocity instead of just helping it propagate. */
const INLET_RHO = 1.2;

export class LBMSolver {
  /* inlet1Dir/inlet2Dir: {x, y} unit vectors giving each inlet's local
     flow direction (see applyDesignMarkers in main.js), so the forced
     inlet velocity follows the channel's actual orientation instead of
     assuming a fixed +x direction - that assumption broke down on
     diagonal or branching channels, where the forced flow crashed into
     the wall and never developed past the inlet. */
  constructor(grid, inlet1Dir = { x: 1, y: 0 }, inlet2Dir = { x: 1, y: 0 }) {
    this.grid = grid;
    this.size = GRID_SIZE;
    this.inlet1Dir = inlet1Dir;
    this.inlet2Dir = inlet2Dir;

    this.f    = new Float32Array(N * Q);
    this.fNew = new Float32Array(N * Q);
    this.rho  = new Float32Array(N);
    this.ux   = new Float32Array(N);
    this.uy   = new Float32Array(N);

    this.rho.fill(1.0);
    for (let idx = 0; idx < N; idx++) this._setEquilibrium(idx, 1.0, 0, 0);
  }

  _setEquilibrium(idx, rho, ux, uy) {
    const usq  = ux * ux + uy * uy;
    const base = idx * Q;
    for (let i = 0; i < Q; i++) {
      const cu = CX[i] * ux + CY[i] * uy;
      this.f[base + i] = W[i] * rho * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * usq);
    }
  }

  /* u1, u2: velocity magnitude (lattice units/step) for INLET_1 and
     INLET_2, independently controllable and capped at 0.1 by the UI
     sliders to stay well below the LBM Mach-number stability limit. */
  step(u1 = 0.05, u2 = 0.05) {
    const { grid, f, fNew, rho, ux, uy, size, inlet1Dir, inlet2Dir } = this;

    /* Pass 1: macroscopic moments, boundary forcing, BGK collision (in place on f) */
    for (let idx = 0; idx < N; idx++) {
      if (grid[idx] === WALL) continue;

      const base = idx * Q;
      let r = 0, u = 0, v = 0;
      for (let i = 0; i < Q; i++) {
        const fi = f[base + i];
        r += fi;
        u += fi * CX[i];
        v += fi * CY[i];
      }
      u /= r;
      v /= r;

      if (grid[idx] === INLET_1) {
        r = INLET_RHO;
        u = inlet1Dir.x * u1;
        v = inlet1Dir.y * u1;
      } else if (grid[idx] === INLET_2) {
        r = INLET_RHO;
        u = inlet2Dir.x * u2;
        v = inlet2Dir.y * u2;
      } else if (grid[idx] === OUTLET) {
        r = REFERENCE_RHO;
      }

      rho[idx] = r;
      ux[idx]  = u;
      uy[idx]  = v;

      const usq = u * u + v * v;
      for (let i = 0; i < Q; i++) {
        const cu  = CX[i] * u + CY[i] * v;
        const feq = W[i] * r * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * usq);
        f[base + i] += (feq - f[base + i]) / TAU;
      }
    }

    /* Pass 2: streaming, with bounce-back off walls and domain edges */
    fNew.fill(0);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        if (grid[idx] === WALL) continue;

        const base = idx * Q;
        for (let i = 0; i < Q; i++) {
          const fi = f[base + i];
          const nx = x + CX[i];
          const ny = y + CY[i];

          if (nx < 0 || nx >= size || ny < 0 || ny >= size || grid[ny * size + nx] === WALL) {
            fNew[base + OPP[i]] += fi;
          } else {
            fNew[(ny * size + nx) * Q + i] += fi;
          }
        }
      }
    }

    [this.f, this.fNew] = [this.fNew, this.f];
  }

  get velocity() {
    return { ux: this.ux, uy: this.uy };
  }
}
