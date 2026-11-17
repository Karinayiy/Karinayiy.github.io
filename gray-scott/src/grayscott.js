// Gray–Scott reaction–diffusion model, in the form used by Pearson (1993):
//
//   ∂u/∂t = Du ∇²u − u v² + F (1 − u)
//   ∂v/∂t = Dv ∇²v + u v² − (F + k) v
//
// u is the "substrate", v the autocatalytic "activator". F is the feed rate,
// k the kill rate.

// Pearson's numerical setup: a 2.5 × 2.5 periodic square on a 256 × 256 grid,
// Du = 2e-5, Dv = 1e-5, time step 1.
export const PEARSON = { L: 2.5, N: 256, Du: 2e-5, Dv: 1e-5, dt: 1 };

// Well-known parameter pairs (F, k) that produce distinct pattern types with
// Pearson's diffusion constants.
export const PRESETS = [
  { name: 'Mitosis (self-replicating spots)', F: 0.0367, k: 0.0649 },
  { name: 'Coral growth', F: 0.0545, k: 0.062 },
  { name: 'Mazes', F: 0.029, k: 0.057 },
  { name: 'Worms', F: 0.078, k: 0.061 },
  { name: 'Holes', F: 0.039, k: 0.058 },
  { name: 'Solitons', F: 0.03, k: 0.062 },
  { name: 'U-skate', F: 0.062, k: 0.0609 },
  { name: 'Chaos', F: 0.026, k: 0.051 },
  { name: 'Spots & loops', F: 0.018, k: 0.051 },
  { name: 'Moving spots', F: 0.014, k: 0.054 },
  { name: 'Waves', F: 0.014, k: 0.045 },
];

// Saddle-node curve: non-trivial homogeneous steady states exist iff
// F ≥ 4 (F + k)², i.e. k ≤ √F / 2 − F.
export function saddleNodeK(F) {
  return Math.sqrt(F) / 2 - F;
}

// Jacobian of the reaction terms (f, g) at (u, v).
export function jacobian(u, v, F, k) {
  return { fu: -v * v - F, fv: -2 * u * v, gu: v * v, gv: 2 * u * v - (F + k) };
}

// All spatially homogeneous steady states. Setting the reaction terms to zero
// with v ≠ 0 gives u v = F + k and (F + k) v² − F v + F (F + k) = 0.
export function steadyStates(F, k) {
  const states = [{ u: 1, v: 0 }];
  const disc = F * F - 4 * F * (F + k) ** 2;
  if (F > 0 && disc >= 0) {
    const s = Math.sqrt(disc);
    for (const v of [(F + s) / (2 * (F + k)), (F - s) / (2 * (F + k))]) {
      states.push({ u: 1 - (F + k) * v / F, v });
    }
  }
  return states.map(st => ({ ...st, J: jacobian(st.u, st.v, F, k) }));
}

const det = J => J.fu * J.gv - J.fv * J.gu;
const trace = J => J.fu + J.gv;

// Of the two non-trivial states one is always a saddle (det J < 0). The other
// one is where Turing and Hopf instabilities happen.
export function nonSaddleState(F, k) {
  return steadyStates(F, k).slice(1).find(st => det(st.J) > 0) ?? null;
}

// Largest real part of the eigenvalues of J − q² diag(Du, Dv): the growth
// rate of a perturbation with wavenumber q.
export function growthRate(J, q2, Du, Dv) {
  const a = J.fu - Du * q2, d = J.gv - Dv * q2;
  const tr = a + d, dt = a * d - J.fv * J.gu;
  const disc = tr * tr / 4 - dt;
  return disc >= 0 ? tr / 2 + Math.sqrt(disc) : tr / 2;
}

export const REGION = { TRIVIAL_ONLY: 0, STABLE: 1, HOPF: 2, TURING: 3 };

// Linear stability of the non-saddle state.
//   HOPF:   unstable to uniform perturbations (tr J > 0).
//   TURING: stable without diffusion, but det(J − q² D) < 0 for some q > 0.
// det(J − q² D) = Du Dv q⁴ − b q² + det J with b = Du gv + Dv fu, so a Turing
// band exists iff b > 0 and det J < b² / (4 Du Dv).
export function classify(F, k, Du, Dv) {
  const state = nonSaddleState(F, k);
  if (!state) return { region: REGION.TRIVIAL_ONLY, state: null };
  const { J } = state;
  if (trace(J) > 0) return { region: REGION.HOPF, state };
  const b = Du * J.gv + Dv * J.fu;
  if (b > 0 && det(J) < b * b / (4 * Du * Dv)) return { region: REGION.TURING, state };
  return { region: REGION.STABLE, state };
}

export { det, trace };
