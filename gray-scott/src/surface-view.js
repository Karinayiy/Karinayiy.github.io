import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LUT_LINEAR, normalize } from './colormap.js';

// Renders a SurfaceSim with three.js. Optionally pushes the surface outward
// along its normal in proportion to the concentration ("relief").
export class SurfaceView {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04050b);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 1.4, 4.6);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(3, 4, 5);
    this.scene.add(key);

    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
    this.raycaster = new THREE.Raycaster();
    this.reliefShown = 0;

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setMesh(mesh) {
    if (this.object) {
      this.scene.remove(this.object);
      this.object.geometry.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions.slice(), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(mesh.positions.length), 3));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geometry.computeVertexNormals();
    this.basePositions = mesh.positions;
    this.baseNormals = geometry.attributes.normal.array.slice();
    this.object = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.object);
    this.reliefShown = 0;
  }

  // Returns true if the field has blown up.
  update(sim, species, relief) {
    const geometry = this.object.geometry;
    const color = geometry.attributes.color.array, pos = geometry.attributes.position.array;
    const base = this.basePositions, normal = this.baseNormals;
    const field = species === 'u' ? sim.u : sim.v;
    let blownUp = false;
    for (let i = 0; i < field.length; i++) {
      const value = field[i];
      if (!(Math.abs(value) < 1e3)) blownUp = true;
      const t = normalize(value, species), c = 3 * ((t * 255) | 0);
      color[3 * i] = LUT_LINEAR[c];
      color[3 * i + 1] = LUT_LINEAR[c + 1];
      color[3 * i + 2] = LUT_LINEAR[c + 2];
      if (relief || this.reliefShown) {
        const h = relief * t;
        pos[3 * i] = base[3 * i] + normal[3 * i] * h;
        pos[3 * i + 1] = base[3 * i + 1] + normal[3 * i + 1] * h;
        pos[3 * i + 2] = base[3 * i + 2] + normal[3 * i + 2] * h;
      }
    }
    geometry.attributes.color.needsUpdate = true;
    if (relief || this.reliefShown) {
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.boundingSphere = null;
    }
    this.reliefShown = relief;
    return blownUp;
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // Index of a vertex on the surface under the pointer, or null.
  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.object)[0];
    return hit ? hit.face.a : null;
  }
}
