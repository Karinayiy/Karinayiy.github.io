// Colormaps, stored as 256-entry lookup tables that are refilled in place
// when the palette changes.
export const PALETTES = {
  ocean: {
    label: 'Ocean',
    stops: [[0, [8, 10, 28]], [0.25, [34, 48, 112]], [0.5, [28, 138, 160]], [0.75, [152, 220, 168]], [1, [255, 250, 226]]],
  },
  magma: {
    label: 'Magma',
    stops: [[0, [6, 4, 22]], [0.25, [80, 18, 123]], [0.5, [182, 54, 121]], [0.75, [251, 136, 97]], [1, [252, 253, 191]]],
  },
  viridis: {
    label: 'Viridis',
    stops: [[0, [68, 1, 84]], [0.25, [59, 82, 139]], [0.5, [33, 145, 140]], [0.75, [94, 201, 98]], [1, [253, 231, 37]]],
  },
  ink: {
    label: 'Ink on paper',
    stops: [[0, [244, 239, 228]], [0.35, [214, 196, 170]], [0.65, [112, 84, 96]], [1, [28, 24, 44]]],
  },
};

export const LUT = new Uint8ClampedArray(256 * 3);
// Same table in linear RGB, for three.js vertex colors.
export const LUT_LINEAR = new Float32Array(256 * 3);

export function setPalette(name) {
  const { stops } = PALETTES[name];
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s = 0;
    while (s < stops.length - 2 && t > stops[s + 1][0]) s++;
    const [t0, c0] = stops[s], [t1, c1] = stops[s + 1];
    const a = (t - t0) / (t1 - t0);
    for (let c = 0; c < 3; c++) {
      const value = c0[c] + a * (c1[c] - c0[c]);
      LUT[3 * i + c] = value;
      LUT_LINEAR[3 * i + c] = Math.pow(value / 255, 2.2);
    }
  }
}

// CSS gradient for a palette swatch.
export function paletteGradient(name) {
  return `linear-gradient(90deg, ${PALETTES[name].stops.map(([t, c]) => `rgb(${c}) ${t * 100}%`).join(', ')})`;
}

setPalette('ocean');

// Map a concentration to [0, 1]. Patterns show up as low u / high v.
export function normalize(value, species) {
  const t = species === 'u' ? (1 - value) / 0.75 : value / 0.45;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
