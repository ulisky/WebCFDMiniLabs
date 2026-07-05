const GRID_SIZE = 200;
const N = GRID_SIZE * GRID_SIZE;
const Q = 9;

/* D2Q9 lattice: 0=rest, 1=E, 2=N, 3=W, 4=S, 5=NE, 6=NW, 7=SW, 8=SE */
const CX  = [0, 1, 0, -1, 0, 1, -1, -1, 1];
const CY  = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const W   = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];

const FLUID = 0, WALL = 1, INLET = 2, OUTLET = 3;

const TAU        = 1.0;   /* relaxation time -> water-like viscosity */
const INLET_RHO  = 1.5;   /* fixed density that drives the pressure gradient */
const OUTLET_RHO = 1.0;

export class LBMSolver {
  constructor(grid) {
    this.grid = grid;
    this.size = GRID_SIZE;

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

  step() {
    const { grid, f, fNew, rho, ux, uy, size } = this;

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

      if (grid[idx] === INLET) {
        /* Pressure (fixed-density) boundary: only rho is forced, velocity
           is left as whatever the local extrapolated sum gives, so flow
           direction follows the channel geometry instead of a hardcoded
           vector. Forcing a fixed velocity here (e.g. ux=0.05 regardless
           of the wall orientation) broke down on diagonal or branching
           channels - a Y-shaped design, say - where that direction
           doesn't match the channel's actual orientation, so the forced
           flow crashed into the wall and never developed past the inlet. */
        r = INLET_RHO;
      } else if (grid[idx] === OUTLET) {
        r = OUTLET_RHO;
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
