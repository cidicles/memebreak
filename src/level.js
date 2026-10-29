import * as THREE from 'three';
import { TILE, WALL_H } from './config.js';
import { generateMaze } from './maze.js';
import { GRAFFITI, graffitiTexture, textTexture } from './memes.js';

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export class Level {
  constructor(scene, cells, rng, textures) {
    this.scene = scene;
    this.maze = generateMaze(cells, rng);
    this.size = this.maze.size;
    this.grid = this.maze.grid;
    const n = this.size * this.size;
    // Flow field: path distance from the player's tile, used by every enemy to navigate.
    this.flow = new Int16Array(n).fill(-1);
    this.flowQueue = new Int32Array(n);
    this.flowKey = null;
    this.revealed = new Uint8Array(n);
    this.revealDirty = true;
    this.group = new THREE.Group();
    this.lamps = [];
    this.time = 0;
    scene.add(this.group);
    this.build(textures, rng);
  }

  isWall(tx, tz) {
    if (tx < 0 || tz < 0 || tx >= this.size || tz >= this.size) return true;
    return this.grid[tz * this.size + tx] === 1;
  }

  isWallAt(x, z) {
    return this.isWall(Math.floor(x / TILE), Math.floor(z / TILE));
  }

  build(tex, rng) {
    const { size } = this;
    const span = size * TILE;

    // Walls: one instanced box per wall tile that actually borders a floor tile.
    const visible = [];
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        if (!this.isWall(x, z)) continue;
        if (!this.isWall(x + 1, z) || !this.isWall(x - 1, z) || !this.isWall(x, z + 1) || !this.isWall(x, z - 1)) {
          visible.push(x, z);
        }
      }
    }
    const walls = new THREE.InstancedMesh(
      new THREE.BoxGeometry(TILE, WALL_H, TILE),
      new THREE.MeshStandardMaterial({ map: tex.wall, roughness: 0.92, metalness: 0.02 }),
      visible.length / 2,
    );
    const m = new THREE.Matrix4();
    for (let i = 0; i < visible.length; i += 2) {
      m.makeTranslation((visible[i] + 0.5) * TILE, WALL_H / 2, (visible[i + 1] + 0.5) * TILE);
      walls.setMatrixAt(i / 2, m);
    }
    this.group.add(walls);

    tex.floor.repeat.set(size, size);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(span, span),
      new THREE.MeshStandardMaterial({ map: tex.floor, roughness: 0.8, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(span / 2, 0, span / 2);
    this.group.add(floor);

    tex.ceiling.repeat.set(size, size);
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(span, span),
      new THREE.MeshStandardMaterial({ map: tex.ceiling, roughness: 0.9 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(span / 2, WALL_H, span / 2);
    this.group.add(ceiling);

    // Hanging lamps in rooms (capped so the light count stays small).
    const lampGeo = new THREE.CylinderGeometry(0.3, 0.45, 0.12, 12);
    this.maze.rooms.slice(0, 7).forEach((r) => {
      const color = r.start ? 0x9fc4ff : 0xffa15a;
      const light = new THREE.PointLight(color, r.start ? 30 : 36, 18, 1.6);
      light.position.set(r.x * TILE, WALL_H - 0.5, r.z * TILE);
      const lamp = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color }));
      lamp.position.set(r.x * TILE, WALL_H - 0.06, r.z * TILE);
      this.group.add(light, lamp);
      this.lamps.push({ light, lamp, base: light.intensity, flicker: !r.start && rng() < 0.5, phase: rng() * 100 });
    });

    // Exit: a glowing doorway set into the outer wall, plus a pulsing green light.
    const ex = this.maze.exit;
    this.exitPos = new THREE.Vector3((ex.x + 0.5) * TILE, 0, (ex.y + 0.5) * TILE);
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(TILE, WALL_H),
      new THREE.MeshBasicMaterial({
        map: tex.portal,
        color: 0x5dffa0,
        transparent: true,
        fog: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    door.position.set(this.exitPos.x + ex.nx * TILE * 0.5, WALL_H / 2, this.exitPos.z + ex.ny * TILE * 0.5);
    if (ex.nx !== 0) door.rotation.y = Math.PI / 2;
    this.exitDoor = door;
    this.exitLight = new THREE.PointLight(0x4dff9a, 40, 24, 1.5);
    this.exitLight.position.set(this.exitPos.x, WALL_H * 0.6, this.exitPos.z);
    const sign = textTexture('EXIT (real) (not clickbait)', 'sign', '#4dff9a');
    this.exitSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: sign.texture, transparent: true, fog: false, depthWrite: false }));
    this.exitSign.scale.set(0.55 * sign.aspect, 0.55, 1);
    this.exitSign.position.set(this.exitPos.x - ex.nx * TILE * 0.3, WALL_H - 0.7, this.exitPos.z - ex.ny * TILE * 0.3);
    this.group.add(door, this.exitLight, this.exitSign);

    this.sprayGraffiti(rng);
  }

  // Meme graffiti on random corridor walls. Some of the "EXIT" arrows are lies.
  sprayGraffiti(rng) {
    const { size } = this;
    const ex = this.maze.exit;
    const faces = [];
    for (let z = 1; z < size - 1; z++) {
      for (let x = 1; x < size - 1; x++) {
        if (this.isWall(x, z) || Math.abs(x - ex.x) + Math.abs(z - ex.y) < 3) continue;
        for (const [dx, dz] of DIRS) if (this.isWall(x + dx, z + dz)) faces.push([x, z, dx, dz]);
      }
    }
    const count = Math.round(size * 1.1);
    const geo = new THREE.PlaneGeometry(1, 0.5);
    for (let i = 0; i < count && faces.length; i++) {
      const [x, z, dx, dz] = faces.splice(Math.floor(rng() * faces.length), 1)[0];
      const phrase = GRAFFITI[Math.floor(rng() * GRAFFITI.length)];
      const map = graffitiTexture(phrase, rng);
      // Plain lit paint (no emissive): dark in the dark, lit by flashlight, lamps, muzzle flash and the exit glow.
      const mat = new THREE.MeshStandardMaterial({
        map,
        transparent: true,
        depthWrite: false,
        roughness: 0.75,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      const decal = new THREE.Mesh(geo, mat);
      const w = 2.2 + rng() * 1.2;
      decal.scale.set(w, w, 1);
      decal.position.set((x + 0.5) * TILE + dx * (TILE / 2 - 0.02), 1.5 + rng() * 1.5, (z + 0.5) * TILE + dz * (TILE / 2 - 0.02));
      decal.rotation.set(0, Math.atan2(-dx, -dz), (rng() - 0.5) * 0.3);
      this.group.add(decal);
    }
  }

  animate(dt) {
    this.time += dt;
    const t = this.time;
    for (const l of this.lamps) {
      if (!l.flicker) continue;
      const n = Math.sin(t * 13 + l.phase) * Math.sin(t * 7.3 + l.phase * 2);
      const out = n > 0.82 ? 0.15 : 1;
      l.light.intensity = l.base * out;
      l.lamp.visible = out > 0.5;
    }
    this.exitLight.intensity = 34 + Math.sin(t * 3) * 10;
    this.exitDoor.material.opacity = 0.75 + Math.sin(t * 5) * 0.15;
  }

  // 2D DDA through the tile grid. Direction does not need to be normalised: the returned
  // `t` is in units of (dx, dz), so a normalised 3D direction gives true 3D distance.
  raycast(ox, oz, dx, dz, maxT) {
    let tx = Math.floor(ox / TILE);
    let tz = Math.floor(oz / TILE);
    if (this.isWall(tx, tz)) return { t: 0, side: 0 };
    if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return null;
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(TILE / dz) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? (tx + 1) * TILE - ox : ox - tx * TILE) / Math.abs(dx) : Infinity;
    let tMaxZ = dz !== 0 ? (dz > 0 ? (tz + 1) * TILE - oz : oz - tz * TILE) / Math.abs(dz) : Infinity;
    for (;;) {
      let t;
      let side;
      if (tMaxX < tMaxZ) {
        tx += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        side = 0;
      } else {
        tz += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        side = 1;
      }
      if (t > maxT) return null;
      if (this.isWall(tx, tz)) return { t, side };
    }
  }

  hasLOS(ax, az, bx, bz) {
    return this.raycast(ax, az, bx - ax, bz - az, 1) === null;
  }

  // Axis-separated box-vs-grid collision; slides along walls. Moves `pos` in place.
  moveCircle(pos, dx, dz, r) {
    const e = 1e-4;
    if (dx !== 0) {
      pos.x += dx;
      const z0 = Math.floor((pos.z - r) / TILE);
      const z1 = Math.floor((pos.z + r) / TILE);
      const tx = Math.floor((dx > 0 ? pos.x + r : pos.x - r) / TILE);
      for (let tz = z0; tz <= z1; tz++) {
        if (this.isWall(tx, tz)) {
          pos.x = dx > 0 ? tx * TILE - r - e : (tx + 1) * TILE + r + e;
          break;
        }
      }
    }
    if (dz !== 0) {
      pos.z += dz;
      const x0 = Math.floor((pos.x - r) / TILE);
      const x1 = Math.floor((pos.x + r) / TILE);
      const tz = Math.floor((dz > 0 ? pos.z + r : pos.z - r) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        if (this.isWall(tx, tz)) {
          pos.z = dz > 0 ? tz * TILE - r - e : (tz + 1) * TILE + r + e;
          break;
        }
      }
    }
  }

  // Multi-source BFS: every tile gets its walking distance to the *nearest* player.
  updateFlow(targets) {
    const { size, flow, flowQueue: q } = this;
    const sources = [];
    for (const t of targets) {
      const tx = Math.floor(t.pos.x / TILE);
      const tz = Math.floor(t.pos.z / TILE);
      if (!this.isWall(tx, tz)) sources.push(tz * size + tx);
    }
    sources.sort((a, b) => a - b);
    const key = sources.join(',');
    if (key === this.flowKey) return;
    this.flowKey = key;
    flow.fill(-1);
    let head = 0;
    let tail = 0;
    for (const s of sources) {
      if (flow[s] < 0) {
        flow[s] = 0;
        q[tail++] = s;
      }
    }
    while (head < tail) {
      const k = q[head++];
      const kx = k % size;
      const kz = (k / size) | 0;
      const d = flow[k] + 1;
      for (const [ddx, ddz] of DIRS) {
        const nx = kx + ddx;
        const nz = kz + ddz;
        if (this.isWall(nx, nz)) continue;
        const n = nz * size + nx;
        if (flow[n] >= 0) continue;
        flow[n] = d;
        q[tail++] = n;
      }
    }
  }

  flowAt(x, z) {
    const tx = Math.floor(x / TILE);
    const tz = Math.floor(z / TILE);
    if (tx < 0 || tz < 0 || tx >= this.size || tz >= this.size) return -1;
    return this.flow[tz * this.size + tx];
  }

  // Fog-of-war for the minimap: reveal floor tiles we can see, plus the walls around them.
  reveal(px, pz, radius = 6) {
    const { size, revealed } = this;
    const ptx = Math.floor(px / TILE);
    const ptz = Math.floor(pz / TILE);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        const tx = ptx + dx;
        const tz = ptz + dz;
        if (tx < 0 || tz < 0 || tx >= size || tz >= size) continue;
        const k = tz * size + tx;
        if (revealed[k] || this.grid[k]) continue;
        if (!this.hasLOS(px, pz, (tx + 0.5) * TILE, (tz + 0.5) * TILE)) continue;
        revealed[k] = 1;
        this.revealDirty = true;
        for (let oz = -1; oz <= 1; oz++) {
          for (let ox = -1; ox <= 1; ox++) {
            const nx = tx + ox;
            const nz = tz + oz;
            if (nx >= 0 && nz >= 0 && nx < size && nz < size) revealed[nz * size + nx] = 1;
          }
        }
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isSprite) return o.material.dispose(); // sprites share one global geometry
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
      if (o.isLight) o.dispose?.();
    });
  }
}
