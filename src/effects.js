import * as THREE from 'three';
import { textTexture } from './memes.js';

// Floating meme text in the world: kill lines, doge chatter, "F".
export class Popups {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  add(text, pos, { style = 'impact', color = '#ffffff', size = 0.55, life = 1.3, rise = 0.9 } = {}) {
    const { texture, aspect } = textTexture(text, style, color);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false }),
    );
    // Scatter a little so simultaneous pop-ups don't stack into one unreadable blob.
    sprite.position.set(pos.x + (Math.random() - 0.5) * 0.9, pos.y + Math.random() * 0.5, pos.z + (Math.random() - 0.5) * 0.9);
    sprite.renderOrder = 20;
    this.scene.add(sprite);
    this.items.push({ sprite, size, aspect, life, max: life, rise, spin: (Math.random() - 0.5) * 0.3 });
    if (this.items.length > 40) this.remove(0);
  }

  remove(i) {
    const it = this.items[i];
    this.scene.remove(it.sprite);
    it.sprite.material.dispose();
    this.items.splice(i, 1);
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        this.remove(i);
        continue;
      }
      const age = it.max - it.life;
      const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.6 : 1.2 - Math.min(0.2, (age - 0.12) * 1.5);
      it.sprite.scale.set(it.size * it.aspect * pop, it.size * pop, 1);
      it.sprite.position.y += it.rise * dt;
      it.sprite.material.rotation = it.spin;
      it.sprite.material.opacity = Math.min(1, it.life / 0.35);
    }
  }

  clear() {
    while (this.items.length) this.remove(0);
  }
}

// Short-lived bullet tracers, pooled in one LineSegments buffer.
export class Tracers {
  constructor(scene, max = 64) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 6);
    this.col = new Float32Array(max * 6);
    this.base = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.color = new THREE.Color();
  }

  add(a, b, color = 0xffd9a0) {
    const i = this.cursor++ % this.max;
    this.pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    this.color.set(color);
    this.base.set([this.color.r, this.color.g, this.color.b], i * 3);
    this.life[i] = 0.09;
    this.posAttr.needsUpdate = true;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0 && this.col[i * 6] === 0) continue;
      this.life[i] = Math.max(0, this.life[i] - dt);
      const f = this.life[i] / 0.09;
      for (let c = 0; c < 3; c++) {
        this.col[i * 6 + c] = this.base[i * 3 + c] * f * 0.25; // tail
        this.col[i * 6 + 3 + c] = this.base[i * 3 + c] * f; // head
      }
    }
    this.colAttr.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.col.fill(0);
    this.colAttr.needsUpdate = true;
  }
}

// Pooled point-sprite particles (blood, sparks, dust).
export class Particles {
  constructor(scene, map, { max = 700, additive = false, size = 0.14 } = {}) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.grav = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size,
        map,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.tmpColor = new THREE.Color();
    this.clear();
  }

  clear() {
    this.life.fill(0);
    for (let i = 0; i < this.max; i++) this.pos[i * 3 + 1] = -999;
    this.posAttr.needsUpdate = true;
  }

  burst(p, color, count, speed, normal = null, { gravity = 9, life = 0.6, spread = 0.9 } = {}) {
    const c = this.tmpColor.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor++ % this.max;
      const j = i * 3;
      let dx = Math.random() * 2 - 1;
      let dy = Math.random() * 2 - 1;
      let dz = Math.random() * 2 - 1;
      if (normal) {
        dx = normal.x + dx * spread;
        dy = normal.y + dy * spread;
        dz = normal.z + dz * spread;
      }
      const l = Math.hypot(dx, dy, dz) || 1;
      const s = (speed * (0.3 + Math.random() * 0.7)) / l;
      this.pos[j] = p.x;
      this.pos[j + 1] = p.y;
      this.pos[j + 2] = p.z;
      this.vel[j] = dx * s;
      this.vel[j + 1] = dy * s;
      this.vel[j + 2] = dz * s;
      const b = 0.7 + Math.random() * 0.5;
      this.col[j] = c.r * b;
      this.col[j + 1] = c.g * b;
      this.col[j + 2] = c.b * b;
      this.life[i] = life * (0.5 + Math.random());
      this.grav[i] = gravity;
    }
    this.colAttr.needsUpdate = true;
  }

  update(dt) {
    const { pos, vel, life, grav } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      const j = i * 3;
      life[i] -= dt;
      if (life[i] <= 0) {
        pos[j + 1] = -999;
        continue;
      }
      vel[j + 1] -= grav[i] * dt;
      pos[j] += vel[j] * dt;
      pos[j + 1] += vel[j + 1] * dt;
      pos[j + 2] += vel[j + 2] * dt;
      if (pos[j + 1] < 0.02) {
        if (vel[j + 1] < -1.5) this.onLand?.(pos[j], pos[j + 2], this.col[j], this.col[j + 1], this.col[j + 2]);
        pos[j + 1] = 0.02;
        vel[j] *= 0.3;
        vel[j + 2] *= 0.3;
        vel[j + 1] = 0;
      }
    }
    this.posAttr.needsUpdate = true;
  }
}
