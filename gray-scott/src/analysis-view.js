import { PRESETS, REGION, classify, saddleNodeK, growthRate, det, trace } from './grayscott.js';

export const REGION_STYLE = {
  [REGION.TRIVIAL_ONLY]: { color: [26, 29, 44], label: 'Only (u, v) = (1, 0) exists' },
  [REGION.STABLE]: { color: [32, 56, 84], label: 'Linearly stable' },
  [REGION.HOPF]: { color: [92, 42, 66], label: 'Hopf (oscillatory) unstable' },
  [REGION.TURING]: { color: [40, 104, 68], label: 'Turing unstable' },
};

const K_RANGE = [0.03, 0.075], F_RANGE = [0, 0.08];
const INK = '#c9cfe6', MUTED = '#7d84a3';

function setupCanvas(canvas, W, H) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.aspectRatio = `${W} / ${H}`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, dpr };
}

function drawFrame(ctx, m, W, H) {
  ctx.strokeStyle = MUTED;
  ctx.lineWidth = 1;
  ctx.strokeRect(m.l + 0.5, m.t + 0.5, W - m.l - m.r - 1, H - m.t - m.b - 1);
  ctx.font = '11px Inter, ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = INK;
}

// The (k, F) plane, shaded by the linear stability of the non-saddle steady
// state — the same axes as Pearson's Figure 1. Click or drag to pick (k, F).
export class PhaseMap {
  constructor(canvas, onPick) {
    this.W = 320;
    this.H = 270;
    this.m = { l: 46, r: 10, t: 10, b: 36 };
    Object.assign(this, setupCanvas(canvas, this.W, this.H));
    this.canvas = canvas;
    this.raster = null;

    let dragging = false;
    const pick = e => {
      const r = canvas.getBoundingClientRect();
      const k = this.xToK((e.clientX - r.left) * this.W / r.width);
      const F = this.yToF((e.clientY - r.top) * this.H / r.height);
      const clamp = (x, [a, b]) => Math.min(b, Math.max(a, x));
      onPick(clamp(F, F_RANGE), clamp(k, K_RANGE));
    };
    canvas.addEventListener('pointerdown', e => { dragging = true; canvas.setPointerCapture(e.pointerId); pick(e); });
    canvas.addEventListener('pointermove', e => dragging && pick(e));
    canvas.addEventListener('pointerup', () => { dragging = false; });
  }

  get pw() { return this.W - this.m.l - this.m.r; }
  get ph() { return this.H - this.m.t - this.m.b; }
  kToX(k) { return this.m.l + (k - K_RANGE[0]) / (K_RANGE[1] - K_RANGE[0]) * this.pw; }
  fToY(F) { return this.m.t + (1 - (F - F_RANGE[0]) / (F_RANGE[1] - F_RANGE[0])) * this.ph; }
  xToK(x) { return K_RANGE[0] + (x - this.m.l) / this.pw * (K_RANGE[1] - K_RANGE[0]); }
  yToF(y) { return F_RANGE[0] + (1 - (y - this.m.t) / this.ph) * (F_RANGE[1] - F_RANGE[0]); }

  setDiffusion(Du, Dv) {
    if (Du === this.Du && Dv === this.Dv) return;
    this.Du = Du;
    this.Dv = Dv;
    this.raster = null;
  }

  buildRaster() {
    const w = Math.round(this.pw * this.dpr), h = Math.round(this.ph * this.dpr);
    const img = this.ctx.createImageData(w, h);
    for (let py = 0; py < h; py++) {
      const F = F_RANGE[1] - (py + 0.5) / h * (F_RANGE[1] - F_RANGE[0]);
      for (let px = 0; px < w; px++) {
        const k = K_RANGE[0] + (px + 0.5) / w * (K_RANGE[1] - K_RANGE[0]);
        const c = REGION_STYLE[classify(F, k, this.Du, this.Dv).region].color, o = 4 * (py * w + px);
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    this.raster = img;
  }

  draw(F, k) {
    const { ctx, m, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    if (!this.raster) this.buildRaster();
    ctx.putImageData(this.raster, Math.round(m.l * this.dpr), Math.round(m.t * this.dpr));

    ctx.save();
    ctx.beginPath();
    ctx.rect(m.l, m.t, this.pw, this.ph);
    ctx.clip();
    // Saddle-node curve k = √F/2 − F.
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const f = F_RANGE[1] * i / 200, x = this.kToX(saddleNodeK(f)), y = this.fToY(f);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'italic 12px Newsreader, serif';
    ctx.fillText('saddle-node', this.kToX(0.0638) - 64, this.fToY(0.074));

    for (const p of PRESETS) {
      ctx.beginPath();
      ctx.arc(this.kToX(p.k), this.fToY(p.F), 2, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
    }
    const x = this.kToX(k), y = this.fToY(F);
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    drawFrame(ctx, m, W, H);
    ctx.textAlign = 'center';
    for (let kk = 0.03; kk <= 0.0751; kk += 0.01) ctx.fillText(kk.toFixed(2), this.kToX(kk), H - m.b + 14);
    ctx.fillText('k  (kill rate)', m.l + this.pw / 2, H - 6);
    ctx.textAlign = 'right';
    for (let ff = 0; ff <= 0.0801; ff += 0.02) ctx.fillText(ff.toFixed(2), m.l - 5, this.fToY(ff) + 4);
    ctx.save();
    ctx.translate(12, m.t + this.ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('F  (feed rate)', 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
  }
}

// Growth rate max Re λ(q) of a perturbation e^{iq·x} around the non-saddle
// steady state: the dispersion relation.
export class DispersionPlot {
  constructor(canvas) {
    this.W = 320;
    this.H = 170;
    this.m = { l: 54, r: 10, t: 10, b: 34 };
    Object.assign(this, setupCanvas(canvas, this.W, this.H));
  }

  draw(F, k, Du, Dv, qMax) {
    const { ctx, m, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    const { state } = classify(F, k, Du, Dv);
    drawFrame(ctx, m, W, H);
    if (!state) {
      ctx.textAlign = 'center';
      ctx.fillStyle = MUTED;
      ctx.fillText('No non-trivial steady state here.', W / 2 + 20, H / 2);
      ctx.textAlign = 'left';
      return;
    }
    // Zoom in on the interesting wavenumbers: a few times the scale where
    // diffusion (D q²) becomes comparable to the reaction rates.
    const { J } = state;
    const qRef = Math.sqrt(Math.max(Math.abs(J.fu), Math.abs(J.gv), 1e-6) / Math.min(Du, Dv));
    qMax = Math.min(qMax, 2.5 * qRef);
    const n = 240, qs = [], gs = [];
    for (let i = 0; i <= n; i++) {
      const q = qMax * i / n;
      qs.push(q);
      gs.push(growthRate(J, q * q, Du, Dv));
    }
    let hi = Math.max(0, ...gs);
    const scale = Math.max(hi, Math.abs(gs[0]), 1e-4);
    let lo = Math.max(Math.min(0, ...gs), -2 * scale);
    const pad = 0.1 * (hi - lo);
    lo -= pad;
    hi += pad;
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const X = q => m.l + q / qMax * pw, Y = g => m.t + (hi - g) / (hi - lo) * ph;

    ctx.strokeStyle = MUTED;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(m.l, Y(0));
    ctx.lineTo(W - m.r, Y(0));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.beginPath();
    ctx.rect(m.l, m.t, pw, ph);
    ctx.clip();
    // Shade the unstable band.
    ctx.fillStyle = 'rgba(255, 209, 102, 0.25)';
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    qs.forEach((q, i) => ctx.lineTo(X(q), Y(Math.max(0, gs[i]))));
    ctx.lineTo(X(qMax), Y(0));
    ctx.fill();

    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    qs.forEach((q, i) => (i ? ctx.lineTo(X(q), Y(gs[i])) : ctx.moveTo(X(q), Y(gs[i]))));
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 1;

    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    for (const g of [hi - pad, 0, lo + pad]) ctx.fillText(g === 0 ? '0' : g.toExponential(1), m.l - 5, Y(g) + 4);
    ctx.textAlign = 'center';
    ctx.fillText('0', X(0), H - m.b + 14);
    ctx.fillText(qMax.toFixed(0), X(qMax) - 8, H - m.b + 14);
    ctx.fillText('wavenumber q', m.l + pw / 2, H - 6);
    ctx.save();
    ctx.translate(12, m.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('max Re λ(q)', 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
  }
}

const fmt = x => (Math.abs(x) < 1e-3 && x !== 0 ? x.toExponential(2) : x.toFixed(4));

export function stabilitySummary(F, k, Du, Dv, qMax, dx) {
  const { region, state } = classify(F, k, Du, Dv);
  if (!state) {
    return `<p>Below the saddle-node curve: only the trivial state <b>(u, v) = (1, 0)</b> exists, and it is always stable.
      Any pattern you see here dies out or must be sustained by nonlinear effects.</p>`;
  }
  const { u, v, J } = state;
  const lines = [
    `<p>Non-saddle steady state <b>(u*, v*) = (${u.toFixed(3)}, ${v.toFixed(3)})</b></p>`,
    `<p>Reaction only: tr J = ${fmt(trace(J))}, det J = ${fmt(det(J))}</p>`,
    `<p>Region: <b>${REGION_STYLE[region].label}</b></p>`,
  ];
  if (region === REGION.TURING) {
    let best = 0, bestG = -Infinity;
    for (let i = 1; i <= 2000; i++) {
      const q = qMax * i / 2000, g = growthRate(J, q * q, Du, Dv);
      if (g > bestG) [best, bestG] = [q, g];
    }
    const lambda = 2 * Math.PI / best;
    lines.push(`<p>Fastest-growing wavelength 2π/q* ≈ <b>${lambda.toFixed(3)}</b> (≈ ${(lambda / dx).toFixed(1)} grid cells).
      Compare it with the spacing of the pattern!</p>`);
  } else if (region === REGION.STABLE) {
    lines.push(`<p>No linear (Turing) instability. If a pattern still forms here, it is a finite-amplitude,
      nonlinear effect — exactly the kind Pearson discovered.</p>`);
  }
  return lines.join('');
}
