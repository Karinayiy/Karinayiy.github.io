import { PEARSON } from './grayscott.js';

// Gray–Scott on a periodic N × N grid of side L, discretized as in Pearson
// (1993): 5-point Laplacian in space, forward Euler in time.
export class GridSim {
  constructor(N = PEARSON.N, L = PEARSON.L) {
    this.L = L;
    this.resize(N);
  }

  resize(N) {
    this.N = N;
    const n = N * N;
    this.u = new Float32Array(n);
    this.v = new Float32Array(n);
    this.u2 = new Float32Array(n);
    this.v2 = new Float32Array(n);
    this.reset();
  }

  get dx() {
    return this.L / this.N;
  }

  // D·Δt times the largest diagonal entry of the discrete Laplacian (4/dx²).
  // Forward Euler on the diffusion part is stable iff this is ≤ 1.
  stabilityNumber(Du, Dv, dt) {
    return 4 * Math.max(Du, Dv) * dt / (this.dx * this.dx);
  }

  // Pearson's initial condition: (u, v) = (1, 0) everywhere, except a central
  // 20 × 20 square set to (1/2, 1/4), then ±1% noise to break the symmetry.
  reset() {
    const { N, u, v } = this;
    u.fill(1);
    v.fill(0);
    const h = Math.round(10 * N / 256), c = N / 2;
    for (let j = c - h; j < c + h; j++) {
      for (let i = c - h; i < c + h; i++) {
        u[j * N + i] = 0.5;
        v[j * N + i] = 0.25;
      }
    }
    for (let i = 0; i < u.length; i++) {
      u[i] *= 1 + 0.02 * (Math.random() - 0.5);
      v[i] *= 1 + 0.02 * (Math.random() - 0.5);
    }
    this.t = 0;
  }

  clear() {
    this.u.fill(1);
    this.v.fill(0);
    this.t = 0;
  }

  seedRandom(count = 12) {
    const r = 8 * this.N / 256;
    for (let s = 0; s < count; s++) this.paint(Math.random() * this.N, Math.random() * this.N, r);
  }

  // Set a disk of radius r (in grid cells) to Pearson's perturbed state.
  paint(cx, cy, r) {
    const { N, u, v } = this;
    const x0 = Math.round(cx), y0 = Math.round(cy), R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const i = ((x0 + dx) % N + N) % N, j = ((y0 + dy) % N + N) % N;
        u[j * N + i] = 0.5;
        v[j * N + i] = 0.25;
      }
    }
  }

  step(n, { F, k, Du, Dv, dt }) {
    const { N } = this;
    const ru = Du * dt / (this.dx * this.dx), rv = Dv * dt / (this.dx * this.dx);
    const Fk = F + k;
    for (let s = 0; s < n; s++) {
      const { u, v, u2, v2 } = this;
      for (let j = 0; j < N; j++) {
        const row = j * N, up = ((j + N - 1) % N) * N, down = ((j + 1) % N) * N;
        for (let i = 0; i < N; i++) {
          const left = i === 0 ? N - 1 : i - 1, right = i === N - 1 ? 0 : i + 1;
          const c = row + i, uc = u[c], vc = v[c];
          const lapU = u[row + left] + u[row + right] + u[up + i] + u[down + i] - 4 * uc;
          const lapV = v[row + left] + v[row + right] + v[up + i] + v[down + i] - 4 * vc;
          const uvv = uc * vc * vc;
          u2[c] = uc + ru * lapU + dt * (F * (1 - uc) - uvv);
          v2[c] = vc + rv * lapV + dt * (uvv - Fk * vc);
        }
      }
      [this.u, this.u2] = [u2, u];
      [this.v, this.v2] = [v2, v];
      this.t += dt;
    }
  }
}
