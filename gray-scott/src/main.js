import { PEARSON, PRESETS } from './grayscott.js';
import { GridSim } from './grid.js';
import { SurfaceSim, SHAPES } from './surface.js';
import { PlaneView } from './plane-view.js';
import { PhaseMap, DispersionPlot, REGION_STYLE, stabilitySummary } from './analysis-view.js';
import { PALETTES, setPalette, paletteGradient } from './colormap.js';

const $ = sel => document.querySelector(sel);

const params = { F: 0.0367, k: 0.0649, Du: PEARSON.Du, Dv: PEARSON.Dv, dt: PEARSON.dt, spf: 40 };
const ui = { mode: 'plane', running: true, species: 'v', shape: 'sphere', relief: 0.06, paintMode: false };

const grid = new GridSim();
const planeView = new PlaneView($('#plane-canvas'));
let surfaceSim = null, surfaceView = null;

// ---------------------------------------------------------------- sliders

const SLIDERS = {
  F: { label: '<i>F</i> · feed', min: 0, max: 0.08, step: 0.0001, fmt: x => x.toFixed(4) },
  k: { label: '<i>k</i> · kill', min: 0.03, max: 0.075, step: 0.0001, fmt: x => x.toFixed(4) },
  Du: { label: '<i>D<sub>u</sub></i>', min: 0.2e-5, max: 4e-5, step: 0.01e-5, fmt: x => x.toExponential(2) },
  Dv: { label: '<i>D<sub>v</sub></i>', min: 0.2e-5, max: 4e-5, step: 0.01e-5, fmt: x => x.toExponential(2) },
  dt: { label: '<i>Δt</i>', min: 0.05, max: 2, step: 0.05, fmt: x => x.toFixed(2) },
  spf: { label: 'steps/frame', min: 1, max: 200, step: 1, fmt: x => String(x) },
};

const sliderEls = {};
for (const [name, s] of Object.entries(SLIDERS)) {
  const row = document.createElement('label');
  row.className = 'row';
  row.innerHTML = `<span>${s.label}</span><input type="range" min="${s.min}" max="${s.max}" step="${s.step}"><output></output>`;
  $('#sliders').append(row);
  const input = row.querySelector('input'), output = row.querySelector('output');
  input.addEventListener('input', () => setParam(name, Number(input.value)));
  sliderEls[name] = { input, output };
}

let analysisDirty = true;

// Paint the filled part of a range input's track.
function showFill(input) {
  const pct = (input.value - input.min) / (input.max - input.min) * 100;
  input.style.setProperty('--fill', `${pct}%`);
}

function setParam(name, value) {
  params[name] = value;
  sliderEls[name].input.value = value;
  showFill(sliderEls[name].input);
  sliderEls[name].output.textContent = SLIDERS[name].fmt(value);
  if (name === 'Du' || name === 'Dv') phaseMap.setDiffusion(params.Du, params.Dv);
  if (['F', 'k', 'Du', 'Dv'].includes(name)) analysisDirty = true;
  if (name === 'F' || name === 'k') syncPreset();
}

// ---------------------------------------------------------------- presets

const presetSelect = $('#preset');
presetSelect.innerHTML = PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('') +
  '<option value="custom">Custom</option>';
presetSelect.addEventListener('change', () => {
  const p = PRESETS[presetSelect.value];
  if (!p) return;
  setParam('F', p.F);
  setParam('k', p.k);
});

function syncPreset() {
  const i = PRESETS.findIndex(p => Math.abs(p.F - params.F) < 1e-6 && Math.abs(p.k - params.k) < 1e-6);
  presetSelect.value = i >= 0 ? String(i) : 'custom';
}

// ---------------------------------------------------------------- analysis

const phaseMap = new PhaseMap($('#phase-map'), (F, k) => {
  setParam('F', Number(F.toFixed(4)));
  setParam('k', Number(k.toFixed(4)));
});
const dispersion = new DispersionPlot($('#dispersion'));
$('#legend').innerHTML = Object.values(REGION_STYLE)
  .map(s => `<li><i style="background: rgb(${s.color})"></i>${s.label}</li>`).join('');

function drawAnalysis() {
  const qMax = Math.PI / grid.dx;
  phaseMap.draw(params.F, params.k);
  dispersion.draw(params.F, params.k, params.Du, params.Dv, qMax);
  $('#summary').innerHTML = stabilitySummary(params.F, params.k, params.Du, params.Dv, qMax, grid.dx);
}

// ---------------------------------------------------------------- simulation controls

const activeSim = () => (ui.mode === 'plane' ? grid : surfaceView && surfaceSim);

function setRunning(running) {
  ui.running = running;
  $('#play').textContent = running ? 'Pause' : 'Play';
  if (running) $('#alert').hidden = true;
}

$('#play').addEventListener('click', () => setRunning(!ui.running));
$('#reset').addEventListener('click', () => {
  if (ui.mode === 'plane') grid.reset();
  else if (surfaceSim) { surfaceSim.clear(); surfaceSim.seedRandom(); }
  setRunning(true);
});
$('#seed').addEventListener('click', () => activeSim()?.seedRandom());
$('#clear').addEventListener('click', () => activeSim()?.clear());
window.addEventListener('keydown', e => {
  if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); setRunning(!ui.running); }
});

for (const b of document.querySelectorAll('#species button')) {
  b.addEventListener('click', () => {
    ui.species = b.dataset.species;
    for (const other of document.querySelectorAll('#species button')) other.classList.toggle('active', other === b);
  });
}

for (const name of Object.keys(PALETTES)) {
  const b = document.createElement('button');
  b.title = PALETTES[name].label;
  b.style.background = paletteGradient(name);
  b.classList.toggle('active', name === 'ocean');
  b.addEventListener('click', () => {
    setPalette(name);
    for (const other of $('#palettes').children) other.classList.toggle('active', other === b);
  });
  $('#palettes').append(b);
}

$('#resolution').addEventListener('change', e => {
  grid.resize(Number(e.target.value));
  analysisDirty = true;
});

$('#shape').innerHTML = Object.entries(SHAPES).map(([key, s]) => `<option value="${key}">${s.label}</option>`).join('');
$('#shape').addEventListener('change', e => { ui.shape = e.target.value; ensureSurface(); });

const scaleInput = $('#scale'), reliefInput = $('#relief');
const showScale = () => { showFill(scaleInput); $('#scale-out').textContent = Number(scaleInput.value).toFixed(2); };
const showRelief = () => { showFill(reliefInput); $('#relief-out').textContent = Number(reliefInput.value).toFixed(3); };
scaleInput.addEventListener('input', () => { showScale(); surfaceSim?.setScale(Number(scaleInput.value)); });
reliefInput.addEventListener('input', () => { showRelief(); ui.relief = Number(reliefInput.value); });
$('#paint-mode').addEventListener('change', e => { ui.paintMode = e.target.checked; });
showScale();
showRelief();

// ---------------------------------------------------------------- painting

let planePainting = false;
const planeCanvas = $('#plane-canvas');
const paintPlane = e => {
  const { x, y } = planeView.toGrid(e, grid.N);
  grid.paint(x, y, 6 * grid.N / 256);
};
planeCanvas.addEventListener('pointerdown', e => { planePainting = true; planeCanvas.setPointerCapture(e.pointerId); paintPlane(e); });
planeCanvas.addEventListener('pointermove', e => planePainting && paintPlane(e));
planeCanvas.addEventListener('pointerup', () => { planePainting = false; });

// Listen in the capture phase on the container so we can switch off orbit
// controls before they see the event.
let surfacePainting = false;
const surfaceEl = $('#surface-view');
const paintSurface = e => {
  const vertex = surfaceView.pick(e.clientX, e.clientY);
  if (vertex !== null) surfaceSim.paintAt(vertex, 0.07);
};
surfaceEl.addEventListener('pointerdown', e => {
  if (!surfaceView || !(e.shiftKey || ui.paintMode)) return;
  surfacePainting = true;
  surfaceView.controls.enabled = false;
  paintSurface(e);
}, { capture: true });
surfaceEl.addEventListener('pointermove', e => surfacePainting && paintSurface(e), { capture: true });
window.addEventListener('pointerup', () => {
  if (!surfacePainting) return;
  surfacePainting = false;
  surfaceView.controls.enabled = true;
});

// ---------------------------------------------------------------- modes

const HINTS = {
  plane: 'Click and drag to drop chemical v. Space pauses.',
  surface: 'Drag to rotate · scroll to zoom · Shift + drag to drop chemical v.',
};

async function setMode(mode) {
  ui.mode = mode;
  document.body.dataset.mode = mode;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.mode === mode);
  $('#plane-view').hidden = mode !== 'plane';
  surfaceEl.hidden = mode !== 'surface';
  $('#hint').textContent = HINTS[mode];
  $('#alert').hidden = true;
  if (mode === 'surface') await ensureSurface();
}

async function ensureSurface() {
  if (!surfaceView) {
    try {
      const { SurfaceView } = await import('./surface-view.js');
      surfaceView = new SurfaceView(surfaceEl);
    } catch (err) {
      showAlert(`Could not load three.js (${err.message}). The 3D view needs an internet connection.`);
      return;
    }
  }
  if (!surfaceSim || surfaceSim.shape !== ui.shape) {
    const mesh = SHAPES[ui.shape].build();
    surfaceSim = new SurfaceSim(mesh, Number(scaleInput.value));
    surfaceSim.shape = ui.shape;
    surfaceView.setMesh(mesh);
  }
}

for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => setMode(b.dataset.mode));

function showAlert(html) {
  $('#alert').innerHTML = html;
  $('#alert').hidden = false;
}

// ---------------------------------------------------------------- main loop

let stepsDone = 0, lastHud = 0;

function updateHud(now) {
  const sim = activeSim();
  if (!sim) return;
  const rate = stepsDone * 1000 / (now - lastHud);
  const sigma = sim.stabilityNumber(params.Du, params.Dv, params.dt);
  const parts = [`t = ${Math.round(sim.t).toLocaleString()}`, `${Math.round(rate).toLocaleString()} steps/s`];
  if (ui.mode === 'plane') {
    // Near (u, v) = (1, 0) the checkerboard mode of u grows by 2σ − 1 + FΔt per step, so the
    // reaction term makes the true limit σ ≤ 1 − FΔt/2, slightly below the pure-diffusion σ ≤ 1.
    const unstable = 2 * sigma - 1 + params.F * params.dt > 1;
    parts.push(`<span class="${unstable ? 'bad' : ''}">σ = ${sigma.toFixed(2)}${unstable ? ` > ${(1 - params.F * params.dt / 2).toFixed(3)} unstable!` : ''}</span>`);
  } else {
    parts.push(`σ = ${sigma.toFixed(2)}${sim.substeps > 1 ? ` → ${sim.substeps} substeps` : ''}`);
    parts.push(`${sim.n.toLocaleString()} vertices · area ${sim.area.toFixed(2)}`);
  }
  $('#hud').innerHTML = parts.map(p => (p.startsWith('<span') ? p : `<span>${p}</span>`)).join('');
  stepsDone = 0;
  lastHud = now;
}

function frame(now) {
  const sim = activeSim();
  if (sim && ui.running) {
    const start = performance.now();
    let done = 0;
    while (done < params.spf && performance.now() - start < 14) {
      const n = Math.min(4, params.spf - done);
      sim.step(n, params);
      done += n;
    }
    stepsDone += done;
  }

  let blownUp = false;
  if (ui.mode === 'plane') {
    blownUp = planeView.draw(grid, ui.species);
  } else if (surfaceView && surfaceSim) {
    blownUp = surfaceView.update(surfaceSim, ui.species, ui.relief);
    surfaceView.render();
  }
  if (blownUp && ui.running) {
    setRunning(false);
    const sigma = sim.stabilityNumber(params.Du, params.Dv, params.dt);
    showAlert(`<b>Numerical blow-up at t = ${Math.round(sim.t)}.</b> Forward Euler is unstable here: σ = 4·Dᵤ·Δt/Δx² = ${sigma.toFixed(2)},
      but the checkerboard mode needs σ ≤ 1 − FΔt/2 = ${(1 - params.F * params.dt / 2).toFixed(3)}.
      Lower Δt (or use a coarser grid), then press Reset.`);
  }

  if (analysisDirty) {
    drawAnalysis();
    analysisDirty = false;
  }
  if (now - lastHud > 300) updateHud(now);
  requestAnimationFrame(frame);
}

// Typeset the model with KaTeX once it has loaded (the plain-text fallback stays otherwise).
window.addEventListener('load', () => {
  if (!window.katex) return;
  katex.render(String.raw`\frac{\partial u}{\partial t} = D_u \nabla^2 u - uv^2 + F(1-u), \qquad
    \frac{\partial v}{\partial t} = D_v \nabla^2 v + uv^2 - (F+k)\,v`, $('#equation'), { displayMode: true });
});

for (const name of Object.keys(SLIDERS)) setParam(name, params[name]);
phaseMap.setDiffusion(params.Du, params.Dv);
setMode('plane');
requestAnimationFrame(frame);
