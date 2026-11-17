// Gray–Scott on a triangulated closed surface. The flat Laplacian is replaced
// by the Laplace–Beltrami operator, discretized with the cotangent formula:
//
//   (Δf)_i = (1 / A_i) Σ_j ½ (cot α_ij + cot β_ij) (f_j − f_i)
//
// where α_ij, β_ij are the angles opposite edge ij and A_i is the mixed
// Voronoi area of vertex i.

// ---------------------------------------------------------------- meshes

function toMesh(verts, faces) {
  return { positions: new Float32Array(verts.flat()), indices: new Uint32Array(faces.flat()) };
}

// Flip triangles whose normal points against outward(position).
function orient(mesh, outward) {
  const p = mesh.positions, idx = mesh.indices;
  for (let f = 0; f < idx.length; f += 3) {
    const a = 3 * idx[f], b = 3 * idx[f + 1], c = 3 * idx[f + 2];
    const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const o = outward(p[a], p[a + 1], p[a + 2]);
    if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0) [idx[f + 1], idx[f + 2]] = [idx[f + 2], idx[f + 1]];
  }
  return mesh;
}

// Unit sphere by repeated midpoint subdivision of an icosahedron.
export function icosphere(level) {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
    [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => { const r = Math.hypot(x, y, z); return [x / r, y / r, z / r]; });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4],
    [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8],
    [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let l = 0; l < level; l++) {
    const cache = new Map();
    const midpoint = (a, b) => {
      const key = a < b ? a * 1e6 + b : b * 1e6 + a;
      let m = cache.get(key);
      if (m === undefined) {
        const p = verts[a], q = verts[b];
        const x = p[0] + q[0], y = p[1] + q[1], z = p[2] + q[2], r = Math.hypot(x, y, z);
        m = verts.push([x / r, y / r, z / r]) - 1;
        cache.set(key, m);
      }
      return m;
    };
    faces = faces.flatMap(([a, b, c]) => {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    });
  }
  return orient(toMesh(verts, faces), (x, y, z) => [x, y, z]);
}

// Apply a map to every vertex of an (already outward-oriented) sphere.
function deformSphere(level, map) {
  const mesh = icosphere(level), p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    const [x, y, z] = map(p[i], p[i + 1], p[i + 2]);
    p[i] = x; p[i + 1] = y; p[i + 2] = z;
  }
  return mesh;
}

export function torus(R = 1, r = 0.42, nu = 256, nv = 100) {
  const verts = [], faces = [];
  for (let i = 0; i < nu; i++) {
    const theta = 2 * Math.PI * i / nu;
    for (let j = 0; j < nv; j++) {
      const phi = 2 * Math.PI * j / nv;
      verts.push([(R + r * Math.cos(phi)) * Math.cos(theta), r * Math.sin(phi), (R + r * Math.cos(phi)) * Math.sin(theta)]);
    }
  }
  const id = (i, j) => (i % nu) * nv + (j % nv);
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      faces.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
  }
  return orient(toMesh(verts, faces), (x, y, z) => {
    const s = R / Math.hypot(x, z);
    return [x - s * x, y, z - s * z];
  });
}

export const SHAPES = {
  sphere: { label: 'Sphere (constant curvature)', build: () => icosphere(6) },
  ellipsoid: { label: 'Ellipsoid', build: () => deformSphere(6, (x, y, z) => [1.45 * x, 0.8 * y, z]) },
  cube: {
    label: 'Rounded cube (curvature at edges)',
    // Radially project the sphere onto the superellipsoid x⁴ + y⁴ + z⁴ = 1.
    build: () => deformSphere(6, (x, y, z) => {
      const s = Math.pow(x ** 4 + y ** 4 + z ** 4, -0.25);
      return [s * x, s * y, s * z];
    }),
  },
  torus: { label: 'Torus (positive & negative curvature)', build: () => torus() },
};

// ---------------------------------------------------------------- operator

// Cotangent Laplacian in compressed-row form:
//   (Δf)_i = Σ_p coef[p] f[col[p]] − diag[i] f[i]   for p in rowPtr[i]..rowPtr[i+1].
export function cotanLaplacian(pos, idx) {
  const n = pos.length / 3;
  const area = new Float64Array(n);
  const weight = new Map();
  const add = (i, j, w) => {
    const key = i < j ? i * n + j : j * n + i;
    weight.set(key, (weight.get(key) ?? 0) + w);
  };
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    const ab = [pos[3 * b] - pos[3 * a], pos[3 * b + 1] - pos[3 * a + 1], pos[3 * b + 2] - pos[3 * a + 2]];
    const ac = [pos[3 * c] - pos[3 * a], pos[3 * c + 1] - pos[3 * a + 1], pos[3 * c + 2] - pos[3 * a + 2]];
    const bc = [ac[0] - ab[0], ac[1] - ab[1], ac[2] - ab[2]];
    const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    // |ab × ac| = twice the triangle area; cot θ = (e1 · e2) / |e1 × e2|.
    const A2 = Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]);
    if (A2 < 1e-14) continue;
    const cotA = dot(ab, ac) / A2, cotB = -dot(ab, bc) / A2, cotC = dot(ac, bc) / A2;
    add(b, c, 0.5 * cotA);
    add(a, c, 0.5 * cotB);
    add(a, b, 0.5 * cotC);
    // Mixed Voronoi area (Meyer et al. 2003). It converges much better than
    // the barycentric area A/3; see the paper's convergence table.
    const T = A2 / 2;
    if (cotA >= 0 && cotB >= 0 && cotC >= 0) {
      const la = dot(bc, bc), lb = dot(ac, ac), lc = dot(ab, ab);
      area[a] += (lb * cotB + lc * cotC) / 8;
      area[b] += (la * cotA + lc * cotC) / 8;
      area[c] += (la * cotA + lb * cotB) / 8;
    } else {
      area[a] += cotA < 0 ? T / 2 : T / 4;
      area[b] += cotB < 0 ? T / 2 : T / 4;
      area[c] += cotC < 0 ? T / 2 : T / 4;
    }
  }

  const degree = new Int32Array(n);
  for (const key of weight.keys()) {
    const i = Math.floor(key / n);
    degree[i]++;
    degree[key - i * n]++;
  }
  const rowPtr = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) rowPtr[i + 1] = rowPtr[i] + degree[i];
  const col = new Int32Array(rowPtr[n]), w = new Float64Array(rowPtr[n]), next = rowPtr.slice(0, n);
  for (const [key, wij] of weight) {
    const i = Math.floor(key / n), j = key - i * n;
    col[next[i]] = j; w[next[i]++] = wij;
    col[next[j]] = i; w[next[j]++] = wij;
  }
  const coef = new Float32Array(rowPtr[n]), diag = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    for (let p = rowPtr[i]; p < rowPtr[i + 1]; p++) {
      coef[p] = w[p] / area[i];
      diag[i] += coef[p];
    }
  }
  let totalArea = 0;
  for (let i = 0; i < n; i++) totalArea += area[i];
  return { n, rowPtr, col, coef, diag, totalArea };
}

// ---------------------------------------------------------------- simulation

export class SurfaceSim {
  // scale: physical length of one mesh unit, in Pearson's units (his square
  // has side 2.5).
  constructor(mesh, scale = 0.5) {
    this.mesh = mesh;
    this.lap = cotanLaplacian(mesh.positions, mesh.indices);
    const { n } = this.lap;
    this.n = n;
    this.u = new Float32Array(n);
    this.v = new Float32Array(n);
    this.u2 = new Float32Array(n);
    this.v2 = new Float32Array(n);
    this.coef = new Float32Array(this.lap.coef.length);
    this.diag = new Float32Array(n);
    this.substeps = 1;
    this.setScale(scale);
    this.clear();
    this.seedRandom();
  }

  // Scaling lengths by s scales the Laplacian by 1 / s².
  setScale(s) {
    this.scale = s;
    const factor = 1 / (s * s);
    for (let p = 0; p < this.coef.length; p++) this.coef[p] = this.lap.coef[p] * factor;
    this.maxDiag = 0;
    for (let i = 0; i < this.n; i++) {
      this.diag[i] = this.lap.diag[i] * factor;
      this.maxDiag = Math.max(this.maxDiag, this.diag[i]);
    }
  }

  get area() {
    return this.lap.totalArea * this.scale * this.scale;
  }

  // By Gershgorin, the eigenvalues of the operator lie in [−2 max diag, 0], so
  // forward Euler on diffusion is stable when D·Δt·max diag ≤ 1.
  stabilityNumber(Du, Dv, dt) {
    return Math.max(Du, Dv) * dt * this.maxDiag;
  }

  clear() {
    this.u.fill(1);
    this.v.fill(0);
    this.t = 0;
  }

  seedRandom(count = 24) {
    for (let s = 0; s < count; s++) this.paintAt(Math.floor(Math.random() * this.n), 0.1);
  }

  // Perturb every vertex within distance r (mesh units) of vertex `center`.
  paintAt(center, r) {
    const p = this.mesh.positions;
    const cx = p[3 * center], cy = p[3 * center + 1], cz = p[3 * center + 2];
    for (let i = 0; i < this.n; i++) {
      const dx = p[3 * i] - cx, dy = p[3 * i + 1] - cy, dz = p[3 * i + 2] - cz;
      if (dx * dx + dy * dy + dz * dz > r * r) continue;
      this.u[i] = 0.5 * (1 + 0.02 * (Math.random() - 0.5));
      this.v[i] = 0.25 * (1 + 0.02 * (Math.random() - 0.5));
    }
  }

  // Irregular triangles can be stiffer than the user's Δt allows, so each
  // step is split into enough substeps to keep the stability number ≤ 0.9.
  step(n, { F, k, Du, Dv, dt }) {
    const sub = Math.max(1, Math.ceil(this.stabilityNumber(Du, Dv, dt) / 0.9));
    const h = dt / sub, Fk = F + k;
    const { rowPtr, col } = this.lap, { coef, diag } = this;
    this.substeps = sub;
    for (let s = 0; s < n * sub; s++) {
      const { u, v, u2, v2 } = this;
      for (let i = 0; i < this.n; i++) {
        let lapU = 0, lapV = 0;
        for (let p = rowPtr[i]; p < rowPtr[i + 1]; p++) {
          lapU += coef[p] * u[col[p]];
          lapV += coef[p] * v[col[p]];
        }
        const uc = u[i], vc = v[i], uvv = uc * vc * vc;
        lapU -= diag[i] * uc;
        lapV -= diag[i] * vc;
        u2[i] = uc + h * (Du * lapU + F * (1 - uc) - uvv);
        v2[i] = vc + h * (Dv * lapV + uvv - Fk * vc);
      }
      [this.u, this.u2] = [u2, u];
      [this.v, this.v2] = [v2, v];
    }
    this.t += n * dt;
  }
}
