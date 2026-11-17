import { LUT, normalize } from './colormap.js';

// Draws a GridSim onto a canvas.
export class PlaneView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.offscreen = document.createElement('canvas');
  }

  // Returns true if the field has blown up (NaN or huge values).
  draw(sim, species) {
    const { N } = sim;
    if (this.offscreen.width !== N) {
      this.offscreen.width = this.offscreen.height = N;
      this.image = this.offscreen.getContext('2d').createImageData(N, N);
    }
    const data = this.image.data, field = species === 'u' ? sim.u : sim.v;
    let blownUp = false;
    for (let i = 0; i < field.length; i++) {
      const value = field[i];
      if (!(Math.abs(value) < 1e3)) blownUp = true;
      const c = 3 * ((normalize(value, species) * 255) | 0);
      data[4 * i] = LUT[c];
      data[4 * i + 1] = LUT[c + 1];
      data[4 * i + 2] = LUT[c + 2];
      data[4 * i + 3] = 255;
    }
    this.offscreen.getContext('2d').putImageData(this.image, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(this.offscreen, 0, 0, this.canvas.width, this.canvas.height);
    return blownUp;
  }

  // Pointer position in grid coordinates.
  toGrid(event, N) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * N,
      y: (event.clientY - rect.top) / rect.height * N,
    };
  }
}
