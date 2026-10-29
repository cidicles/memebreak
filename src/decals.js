import * as THREE from 'three';

// Blood that sticks to the world. Every splat is one instance in a small set of InstancedMeshes
// (one per splat shape), so hundreds of them cost a handful of draw calls. Each instance carries
// its own colour (the victim's theme colour) and its own alpha, which fades as it dries.

const UP = new THREE.Vector3(0, 0, 1);
const tmpQ = new THREE.Quaternion();
const tmpN = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const rollQ = new THREE.Quaternion();
const WET = 0.95;
const DRY = 0.68;
const DRY_TIME = 6;

function splatTexture(seed) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; // opaque black base, so the alpha mask has true 0-1 coverage
  g.fillRect(0, 0, S, S);
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = '#fff';
  // main blob: a wobbly polygon
  const lobes = 7 + Math.floor(rnd() * 5);
  g.beginPath();
  for (let i = 0; i <= lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const rad = S * (0.22 + rnd() * 0.17);
    const x = S / 2 + Math.cos(a) * rad;
    const y = S / 2 + Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y);
    else g.quadraticCurveTo(S / 2 + Math.cos(a - 0.3) * rad * 1.25, S / 2 + Math.sin(a - 0.3) * rad * 1.25, x, y);
  }
  g.closePath();
  g.fill();
  // satellite droplets and a couple of runs
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const d = S * (0.28 + rnd() * 0.2);
    const rr = S * (0.015 + rnd() * 0.045);
    g.beginPath();
    g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, rr, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2;
    g.lineWidth = S * (0.02 + rnd() * 0.03);
    g.lineCap = 'round';
    g.strokeStyle = '#fff';
    g.beginPath();
    g.moveTo(S / 2 + Math.cos(a) * S * 0.2, S / 2 + Math.sin(a) * S * 0.2);
    g.lineTo(S / 2 + Math.cos(a) * S * (0.38 + rnd() * 0.1), S / 2 + Math.sin(a) * S * (0.38 + rnd() * 0.1));
    g.stroke();
  }
  return new THREE.CanvasTexture(c); // alpha mask only, so leave it in linear space
}

class SplatPool {
  constructor(scene, texture, capacity) {
    this.capacity = capacity;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    geo.setAttribute('aAlpha', this.alpha);
    const mat = new THREE.MeshStandardMaterial({
      alphaMap: texture, // colour comes from the per-instance colour, alpha from the mask
      transparent: true,
      depthWrite: false,
      roughness: 0.55,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    // per-instance alpha, so decals can dry out and fade without extra draw calls
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = `attribute float aAlpha;\nvarying float vAlpha;\n${shader.vertexShader}`.replace(
        'void main() {',
        'void main() {\n  vAlpha = aAlpha;',
      );
      shader.fragmentShader = `varying float vAlpha;\n${shader.fragmentShader}`.replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n  gl_FragColor.a *= vAlpha;',
      );
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1; // under the mist and tracers
    this.mesh.count = capacity;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.slots = new Array(capacity).fill(null);
    this.cursor = 0;
    // park every instance out of sight until used
    tmpM.makeScale(0, 0, 0);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, tmpM);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  oldestSlot() {
    let best = -1;
    let bestAge = -1;
    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      if (!s) return i; // free slot
      if (s.age > bestAge) {
        bestAge = s.age; // sacrifice the oldest splat, never a fresh one
        best = i;
      }
    }
    return best;
  }

  place(pos, normal, color, size, life) {
    const i = this.oldestSlot();
    tmpN.copy(normal).normalize();
    tmpQ.setFromUnitVectors(UP, tmpN);
    rollQ.setFromAxisAngle(tmpN, Math.random() * Math.PI * 2);
    tmpQ.premultiply(rollQ);
    tmpS.set(size, size, size);
    tmpM.compose(pos, tmpQ, tmpS);
    this.mesh.setMatrixAt(i, tmpM);
    this.mesh.setColorAt(i, tmpC.set(color));
    this.alpha.setX(i, WET);
    this.slots[i] = { life, max: life, age: 0 };
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }

  update(dt) {
    let dirty = false;
    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      if (!s) continue;
      s.life -= dt;
      s.age += dt;
      if (s.life <= 0) {
        this.slots[i] = null;
        this.alpha.setX(i, 0);
        tmpM.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, tmpM);
        this.mesh.instanceMatrix.needsUpdate = true;
        dirty = true;
      } else if (s.life < 2) {
        this.alpha.setX(i, (s.life / 2) * DRY); // finally fades away
        dirty = true;
      } else if (s.age < DRY_TIME) {
        // wet and glossy at first, then it dries darker and flatter
        this.alpha.setX(i, WET + (DRY - WET) * (s.age / DRY_TIME));
        dirty = true;
      }
    }
    if (dirty) this.alpha.needsUpdate = true;
  }

  clear() {
    tmpM.makeScale(0, 0, 0);
    for (let i = 0; i < this.capacity; i++) {
      this.slots[i] = null;
      this.alpha.setX(i, 0);
      this.mesh.setMatrixAt(i, tmpM);
    }
    this.cursor = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }
}

export class BloodDecals {
  constructor(scene, { variants = 4, capacity = 64, life = 240 } = {}) {
    this.pools = [];
    for (let i = 0; i < variants; i++) this.pools.push(new SplatPool(scene, splatTexture(i + 1), capacity));
    this.life = life;
    this.budget = 0;
    this.recent = [];
    this.perFrame = 3;
    this.now = 0;
    this.dark = new Map();
  }

  // Splats are rate-limited by the caller's cooldowns, this per-frame budget, and a minimum
  // spacing so a skidding gib cannot stamp a dozen decals on the same spot.
  add(pos, normal, color, size = 0.7, important = false) {
    if (this.perFrame === 0 && !important) return; // gore turned down
    if (this.budget <= 0 && !important) return;
    for (const r of this.recent) {
      if (this.now - r.t > 0.6) continue;
      const dx = r.x - pos.x;
      const dy = r.y - pos.y;
      const dz = r.z - pos.z;
      if (dx * dx + dy * dy + dz * dz < 0.09) return; // do not stack splats on one spot
    }
    if (!important) this.budget--;
    this.recent.push({ x: pos.x, y: pos.y, z: pos.z, t: this.now });
    while (this.recent.length && this.now - this.recent[0].t > 0.6) this.recent.shift();
    // Blood reads as blood when it is darker than the creature it came from.
    const key = color & 0xf0f0f0; // quantised: per-particle jitter would never hit the cache
    let dark = this.dark.get(key);
    if (dark === undefined) {
      dark = tmpC.set(color).multiplyScalar(0.42).getHex();
      this.dark.set(key, dark);
    }
    const pool = this.pools[Math.floor(Math.random() * this.pools.length)];
    pool.place(pos, normal, dark, size * (0.7 + Math.random() * 0.6), this.life * (0.7 + Math.random() * 0.6));
  }

  update(dt) {
    this.budget = this.perFrame; // quality-controlled: how many ordinary splats per frame
    this.now += dt;
    for (const p of this.pools) p.update(dt);
  }

  clear() {
    for (const p of this.pools) p.clear();
    this.recent.length = 0;
  }

  dispose() {
    for (const p of this.pools) {
      p.mesh.geometry.dispose();
      p.mesh.material.alphaMap?.dispose();
      p.mesh.material.dispose();
      p.mesh.removeFromParent();
    }
    this.pools.length = 0;
  }

  get count() {
    let n = 0;
    for (const p of this.pools) for (const s of p.slots) if (s) n++;
    return n;
  }
}
