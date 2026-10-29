import * as THREE from 'three';
import { TILE } from './config.js';

// Severed limbs and flesh chunks as cheap rigid bodies: gravity, floor bounce, wall collision,
// then they settle and fade. Chunks live in InstancedMeshes (three draw calls for all of them);
// severed limbs are real subtrees handed over by the enemy that lost them.

const GRAVITY = -20;
const REST_SPEED = 0.6;
const UP = new THREE.Vector3(0, 1, 0);
const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const tmpN = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

// One instanced pool per chunk shape.
class ChunkPool {
  constructor(scene, geo, capacity) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.75 }), capacity);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, tmpC.set(0xffffff)); // allocates instanceColor
    this.free = [];
    this.clear();
    scene.add(this.mesh);
  }

  alloc(color) {
    const i = this.free.pop();
    if (i === undefined) return -1;
    this.mesh.setColorAt(i, tmpC.set(color));
    this.mesh.instanceColor.needsUpdate = true;
    return i;
  }

  write(i, pos, quat, scale) {
    tmpS.setScalar(scale);
    tmpM.compose(pos, quat, tmpS);
    this.mesh.setMatrixAt(i, tmpM);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  release(i) {
    this.mesh.setMatrixAt(i, HIDDEN);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.free.push(i);
  }

  clear() {
    this.free.length = 0;
    for (let i = this.capacity - 1; i >= 0; i--) {
      this.free.push(i);
      this.mesh.setMatrixAt(i, HIDDEN);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Wounds and stumps: small marks stuck to a limb pivot. They are instanced and follow their
// pivot every frame, so they keep working after that limb has been severed and thrown.
export class Marks {
  constructor(scene, capacity = 96) {
    this.scene = scene;
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshStandardMaterial({ roughness: 0.3 }),
      capacity,
    );
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, tmpC.set(0xffffff));
    this.list = [];
    this.free = [];
    for (let i = capacity - 1; i >= 0; i--) {
      this.free.push(i);
      this.mesh.setMatrixAt(i, HIDDEN);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
  }

  // local: a Matrix4 in the pivot's space (position/orientation/scale of the mark)
  add(pivot, local, color) {
    let idx = this.free.pop();
    if (idx === undefined) {
      const oldest = this.list.shift(); // recycle the oldest mark in the world
      if (!oldest) return null;
      idx = oldest.idx;
    }
    const mark = { pivot, local, idx };
    this.mesh.setColorAt(idx, tmpC.set(color));
    this.mesh.instanceColor.needsUpdate = true;
    // place it now: a recycled slot still holds the previous mark's matrix
    pivot.updateWorldMatrix(true, false);
    tmpM.multiplyMatrices(pivot.matrixWorld, local);
    this.mesh.setMatrixAt(idx, tmpM);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.list.push(mark);
    return mark;
  }

  update() {
    let dirty = false;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      let root = m.pivot;
      while (root.parent) root = root.parent;
      if (root !== this.scene) {
        // whatever it was stuck to has left the scene (corpse cleaned up, gib faded out)
        this.mesh.setMatrixAt(m.idx, HIDDEN);
        this.free.push(m.idx);
        this.list.splice(i, 1);
        dirty = true;
        continue;
      }
      tmpM.multiplyMatrices(m.pivot.matrixWorld, m.local);
      this.mesh.setMatrixAt(m.idx, tmpM);
      dirty = true;
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.list.length = 0;
    this.free.length = 0;
    for (let i = this.capacity - 1; i >= 0; i--) {
      this.free.push(i);
      this.mesh.setMatrixAt(i, HIDDEN);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get count() {
    return this.list.length;
  }
}

export class Gibs {
  constructor(scene, level, hooks = {}) {
    this.scene = scene;
    this.level = level;
    this.hooks = hooks; // { bleed(pos, color), land(pos, normal, color, force) }
    this.items = [];
    this.spare = []; // recycled chunk records
    this.maxLimbs = 26;
    this.viewer = null; // player position, for distance gating
    this.pools = [
      new ChunkPool(scene, new THREE.TetrahedronGeometry(0.11), 34),
      new ChunkPool(scene, new THREE.BoxGeometry(0.13, 0.1, 0.12), 34),
      new ChunkPool(scene, new THREE.DodecahedronGeometry(0.1), 34),
    ];
  }

  setLevel(level) {
    this.level = level;
  }

  near(pos, range = 38) {
    const v = this.viewer;
    if (!v) return false; // no viewer set: skip the work rather than do it blind
    return Math.abs(pos.x - v.x) + Math.abs(pos.z - v.z) < range;
  }

  // Take ownership of an object already placed in world space (a severed limb subtree).
  addLimb(object, { vel, color, bleed = true, life = 16, radius = 0.22 }) {
    this.scene.add(object);
    this.escapeWall(object.position);
    const item = {
      limb: true,
      object,
      pos: object.position,
      vel: vel.clone(),
      spin: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
      radius,
      color,
      bleed,
      bleedT: 0,
      life,
      rest: 0,
    };
    this.items.push(item);
    this.trimLimbs();
    return item;
  }

  // Small flesh chunks knocked off by a hit. Item records are recycled, not reallocated.
  addChunk(pos, vel, color, scale = 1) {
    let pool = this.pools[Math.floor(Math.random() * this.pools.length)];
    let idx = pool.alloc(color);
    if (idx < 0) {
      // that shape is full: try the others before giving up
      for (const p of this.pools) {
        idx = p.alloc(color);
        if (idx >= 0) {
          pool = p;
          break;
        }
      }
    }
    if (idx < 0) {
      // everything is full: recycle the oldest chunk rather than refuse the newest
      const oldest = this.items.findIndex((it) => !it.limb);
      if (oldest < 0) return null;
      pool = this.items[oldest].pool;
      this.remove(oldest);
      idx = pool.alloc(color);
      if (idx < 0) return null;
    }
    const item = this.spare.pop() ?? {
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      euler: new THREE.Euler(),
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
    };
    item.limb = false;
    item.pool = pool;
    item.idx = idx;
    item.pos.copy(pos);
    item.euler.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    item.scale = scale * (0.6 + Math.random() * 0.7);
    item.vel.copy(vel);
    item.spin.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
    item.radius = 0.09;
    item.color = color;
    item.bleed = true;
    item.bleedFor = 0.7; // chunks only trail blood briefly
    item.bleedT = 0;
    item.life = 9 + Math.random() * 4;
    item.rest = 0;
    this.escapeWall(item.pos);
    item.quat.setFromEuler(item.euler);
    pool.write(idx, item.pos, item.quat, item.scale);
    this.items.push(item);
    return item;
  }

  trimLimbs() {
    let n = 0;
    for (const it of this.items) if (it.limb) n++;
    for (let i = 0; i < this.items.length && n > this.maxLimbs; i++) {
      if (this.items[i].limb) {
        this.remove(i);
        i--;
        n--;
      }
    }
  }

  remove(i) {
    const it = this.items[i];
    // Limb materials belong to the enemy that shed them; EnemyManager disposes those.
    if (it.limb) {
      this.scene.remove(it.object);
    } else {
      it.pool.release(it.idx);
      it.pool = null;
      if (this.spare.length < 120) this.spare.push(it);
    }
    this.items.splice(i, 1);
  }

  // A gib born inside a wall gets pushed out over the nearest tile edge.
  escapeWall(pos) {
    const level = this.level;
    if (!level?.isWallAt(pos.x, pos.z)) return;
    const tx = Math.floor(pos.x / TILE);
    const tz = Math.floor(pos.z / TILE);
    const fx = pos.x - tx * TILE;
    const fz = pos.z - tz * TILE;
    const outs = [
      [fx, -1, 0],
      [TILE - fx, 1, 0],
      [fz, 0, -1],
      [TILE - fz, 0, 1],
    ].sort((a, b) => a[0] - b[0]);
    for (const [depth, dx, dz] of outs) {
      const nx = pos.x + dx * (depth + 0.12);
      const nz = pos.z + dz * (depth + 0.12);
      if (!level.isWallAt(nx, nz)) {
        pos.x = nx;
        pos.z = nz;
        return;
      }
    }
  }

  update(dt) {
    const level = this.level;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        // shrink away rather than popping out of existence (frame-rate independent)
        if (it.limb) it.object.scale.multiplyScalar(Math.max(0, 1 - dt * 4));
        else {
          it.scale *= Math.max(0, 1 - dt * 4);
          it.pool.write(it.idx, it.pos, it.quat, it.scale);
        }
        if (it.life < -0.6) this.remove(i);
        continue;
      }
      if (it.rest > 0) continue;

      it.vel.y += GRAVITY * dt;
      const nx = it.pos.x + it.vel.x * dt;
      const nz = it.pos.z + it.vel.z * dt;
      // Walls: bounce, and leave the mark on the wall it hit.
      if (level?.isWallAt(nx, it.pos.z)) {
        this.splat(it, it.vel.x > 0 ? -1 : 1, 0, 0, Math.abs(it.vel.x));
        it.vel.x *= -0.35;
      } else {
        it.pos.x = nx;
      }
      if (level?.isWallAt(it.pos.x, nz)) {
        this.splat(it, 0, 0, it.vel.z > 0 ? -1 : 1, Math.abs(it.vel.z));
        it.vel.z *= -0.35;
      } else {
        it.pos.z = nz;
      }
      it.pos.y += it.vel.y * dt;

      const floor = it.radius;
      if (it.pos.y <= floor) {
        it.pos.y = floor;
        const impact = Math.abs(it.vel.y);
        if (impact > 1.2) this.splat(it, 0, 1, 0, impact);
        it.vel.y *= -0.32;
        it.vel.x *= 0.68;
        it.vel.z *= 0.68;
        it.spin.multiplyScalar(0.6);
        if (it.vel.lengthSq() < REST_SPEED * REST_SPEED) {
          it.rest = 1;
          it.vel.set(0, 0, 0);
          if (this.near(it.pos)) this.hooks.land?.(it.pos, UP, it.color, 1);
          if (it.limb) it.object.rotation.x = Math.round(it.object.rotation.x / Math.PI) * Math.PI;
        }
      }

      if (it.limb) {
        it.object.rotation.x += it.spin.x * dt;
        it.object.rotation.y += it.spin.y * dt;
        it.object.rotation.z += it.spin.z * dt;
      } else {
        it.euler.x += it.spin.x * dt;
        it.euler.y += it.spin.y * dt;
        it.euler.z += it.spin.z * dt;
        it.quat.setFromEuler(it.euler);
        it.pool.write(it.idx, it.pos, it.quat, it.scale);
      }

      // Drip while airborne: rate limited, and only near the player.
      if (it.bleed) {
        if (it.bleedFor !== undefined) {
          it.bleedFor -= dt;
          if (it.bleedFor <= 0) it.bleed = false;
        }
        it.bleedT -= dt;
        if (it.bleedT <= 0) {
          it.bleedT = 0.14 + Math.random() * 0.12;
          if (this.near(it.pos, 30)) this.hooks.bleed?.(it.pos, it.color);
        }
      }
    }
  }

  splat(it, nx, ny, nz, force) {
    if (force < 1.2 || !this.near(it.pos)) return;
    this.hooks.land?.(it.pos, tmpN.set(nx, ny, nz), it.color, force);
  }

  clear() {
    for (let i = this.items.length - 1; i >= 0; i--) this.remove(i);
    for (const p of this.pools) p.clear();
  }

  get count() {
    return this.items.length;
  }
}
