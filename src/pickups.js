import * as THREE from 'three';
import { buildWeaponModel } from './weapons.js';

export const PICKUP_COLORS = {
  health: 0x3dff7a,
  shells: 0xff8a3d,
  bullets: 0xffd23d,
  shotgun: 0x4dc3ff,
  rifle: 0x4dc3ff,
};

export class Pickups {
  constructor(scene, textures) {
    this.scene = scene;
    this.items = [];
    this.seq = 0;
    this.ringGeo = new THREE.PlaneGeometry(1.7, 1.7).rotateX(-Math.PI / 2);
    this.ringMats = {};
    for (const [type, color] of Object.entries(PICKUP_COLORS)) {
      this.ringMats[type] = new THREE.MeshBasicMaterial({
        map: textures.ring,
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    }
    const std = (color, emissive = 0.25) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: emissive });
    this.mats = {
      white: std(0xe8e8e8, 0.15),
      red: std(0xff2222, 1.2),
      shell: std(0x8a1c12),
      brass: std(0xd4a53c, 0.4),
      olive: std(0x4a5530),
      yellow: std(0xffd23d, 0.8),
    };
    this.box = (w, h, d, mat, y = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.y = y;
      return m;
    };
  }

  buildModel(type) {
    const g = new THREE.Group();
    const { mats: M, box } = this;
    if (type === 'health') {
      g.add(box(0.55, 0.3, 0.42, M.white));
      g.add(box(0.3, 0.02, 0.09, M.red, 0.16), box(0.09, 0.02, 0.3, M.red, 0.16));
    } else if (type === 'shells') {
      g.add(box(0.44, 0.22, 0.3, M.shell));
      g.add(box(0.44, 0.04, 0.3, M.brass, 0.13));
    } else if (type === 'bullets') {
      g.add(box(0.5, 0.26, 0.28, M.olive));
      g.add(box(0.51, 0.05, 0.29, M.yellow, 0.02));
    } else {
      const w = buildWeaponModel(type);
      w.scale.setScalar(1.7);
      w.rotation.y = Math.PI / 2;
      g.add(w);
    }
    return g;
  }

  // Seeded pickups get sequential ids, so they match on every co-op client.
  spawn(type, x, z, id = `p${this.seq++}`) {
    const group = new THREE.Group();
    const model = this.buildModel(type);
    const ring = new THREE.Mesh(this.ringGeo, this.ringMats[type]);
    ring.position.y = 0.03;
    group.add(model, ring);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.items.push({ id, type, group, model, ring, x, z, t: Math.random() * 10, pending: 0 });
  }

  get(id) {
    return this.items.find((it) => it.id === id);
  }

  remove(id) {
    const i = this.items.findIndex((it) => it.id === id);
    if (i < 0) return;
    this.scene.remove(this.items[i].group);
    this.items.splice(i, 1);
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.group);
    this.items = [];
    this.seq = 0;
  }

  update(dt, player, collect) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.model.position.y = 0.6 + Math.sin(it.t * 2.5) * 0.08;
      it.model.rotation.y += dt * 1.4;
      it.ring.material.opacity = 0.55 + Math.sin(it.t * 4) * 0.25;
      if (Math.hypot(it.x - player.pos.x, it.z - player.pos.z) < 1.1 && collect(it)) {
        this.scene.remove(it.group);
        this.items.splice(i, 1);
      }
    }
  }
}
