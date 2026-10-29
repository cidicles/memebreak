import * as THREE from 'three';

export const WEAPONS = {
  pistol: {
    name: 'PEW PEW', slot: 1, dmg: 26, pellets: 1, spread: 0.008, rate: 0.2, auto: false,
    mag: 12, ammo: null, reload: 1.0, kick: 0.05, sound: 'pistol', noise: 6, vm: [0.19, -0.19, -0.48],
  },
  shotgun: {
    name: 'BOOMSTICK', slot: 2, dmg: 14, pellets: 9, spread: 0.075, rate: 0.8, auto: false, falloff: 16,
    mag: 6, ammo: 'shells', reload: 1.6, kick: 0.14, sound: 'shotgun', noise: 9, vm: [0.22, -0.22, -0.36],
  },
  rifle: {
    name: 'BRRRT', slot: 3, dmg: 18, pellets: 1, spread: 0.02, rate: 0.085, auto: true,
    mag: 30, ammo: 'bullets', reload: 1.5, kick: 0.03, sound: 'rifle', noise: 7, vm: [0.2, -0.22, -0.42],
  },
};
export const WEAPON_ORDER = ['pistol', 'shotgun', 'rifle'];

let mats;
function materials() {
  mats ??= {
    metal: new THREE.MeshStandardMaterial({ color: 0x6a6f78, metalness: 0.35, roughness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2e3036, metalness: 0.2, roughness: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5c3a22, roughness: 0.65 }),
    glowGreen: new THREE.MeshStandardMaterial({ color: 0x55ff99, emissive: 0x55ff99, emissiveIntensity: 2 }),
    glowOrange: new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0xff8a3d, emissiveIntensity: 2 }),
  };
  return mats;
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function tube(r, len, mat, x, y, z) {
  const g = new THREE.CylinderGeometry(r, r, len, 14);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  return m;
}

// Viewmodels are built from primitives; also reused (scaled up) as floor pickups.
export function buildWeaponModel(id) {
  const M = materials();
  const g = new THREE.Group();
  if (id === 'pistol') {
    g.add(box(0.075, 0.085, 0.32, M.metal, 0, 0, -0.08));
    g.add(box(0.065, 0.05, 0.26, M.dark, 0, -0.06, -0.06));
    const grip = box(0.065, 0.2, 0.1, M.dark, 0, -0.15, 0.04);
    grip.rotation.x = 0.28;
    g.add(grip);
    g.add(box(0.008, 0.008, 0.008, M.glowGreen, -0.012, 0.047, 0.07));
    g.add(box(0.008, 0.008, 0.008, M.glowGreen, 0.012, 0.047, 0.07));
    g.add(box(0.008, 0.012, 0.008, M.glowGreen, 0, 0.049, -0.22));
    g.userData.muzzle = new THREE.Vector3(0, 0, -0.27);
  } else if (id === 'shotgun') {
    g.add(tube(0.036, 0.7, M.metal, 0, 0.03, -0.38));
    g.add(tube(0.03, 0.52, M.dark, 0, -0.04, -0.32));
    g.add(box(0.09, 0.075, 0.18, M.wood, 0, -0.045, -0.36));
    g.add(box(0.1, 0.13, 0.3, M.dark, 0, 0, 0.02));
    const stock = box(0.08, 0.13, 0.32, M.wood, 0, -0.07, 0.3);
    stock.rotation.x = -0.12;
    g.add(stock);
    g.add(box(0.02, 0.02, 0.02, M.glowOrange, 0, 0.06, -0.7));
    g.userData.muzzle = new THREE.Vector3(0, 0.03, -0.75);
  } else {
    g.add(box(0.085, 0.12, 0.46, M.dark, 0, 0, -0.08));
    g.add(tube(0.022, 0.36, M.metal, 0, 0.02, -0.48));
    g.add(box(0.1, 0.07, 0.24, M.metal, 0, 0.0, -0.38));
    const mag = box(0.06, 0.2, 0.09, M.metal, 0, -0.15, -0.08);
    mag.rotation.x = 0.2;
    g.add(mag);
    g.add(box(0.05, 0.06, 0.12, M.dark, 0, 0.09, -0.06));
    g.add(box(0.03, 0.03, 0.005, M.glowOrange, 0, 0.1, -0.12));
    g.add(box(0.087, 0.012, 0.3, M.glowOrange, 0, -0.035, -0.1));
    g.add(box(0.07, 0.12, 0.26, M.dark, 0, -0.04, 0.24));
    g.userData.muzzle = new THREE.Vector3(0, 0.02, -0.67);
  }
  return g;
}

export class Arsenal {
  constructor(weaponCamera, textures) {
    this.root = new THREE.Group();
    weaponCamera.add(this.root);
    this.models = {};
    for (const id of WEAPON_ORDER) {
      const m = buildWeaponModel(id);
      m.visible = false;
      this.root.add(m);
      this.models[id] = m;
    }
    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textures.flare,
        color: 0xffc36b,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.flash.visible = false;
    this.swayX = 0;
    this.swayY = 0;
    this.reset();
  }

  reset() {
    this.restore({ owned: ['pistol'], mag: { pistol: 12, shotgun: 6, rifle: 30 }, reserve: { shells: 0, bullets: 0 }, current: 'pistol' });
  }

  snapshot() {
    return { owned: [...this.owned], mag: { ...this.mag }, reserve: { ...this.reserve }, current: this.current };
  }

  restore(s) {
    this.owned = new Set(s.owned);
    this.mag = { ...s.mag };
    this.reserve = { ...s.reserve };
    this.cooldown = 0;
    this.reloadT = 0;
    this.switchT = 0;
    this.kickT = 0;
    this.flashT = 0;
    this.pending = null;
    this.setModel(s.current);
  }

  setModel(id) {
    if (this.current) this.models[this.current].visible = false;
    this.current = id;
    const m = this.models[id];
    m.visible = true;
    m.add(this.flash);
    this.flash.position.copy(m.userData.muzzle);
  }

  get def() {
    return WEAPONS[this.current];
  }

  reserveFor(id) {
    const a = WEAPONS[id].ammo;
    return a ? this.reserve[a] : Infinity;
  }

  equip(id) {
    if (!this.owned.has(id) || id === (this.pending ?? this.current)) return;
    this.pending = id;
    this.reloadT = 0;
    this.switchT = 0.36;
  }

  cycle(dir) {
    const owned = WEAPON_ORDER.filter((id) => this.owned.has(id));
    const i = owned.indexOf(this.pending ?? this.current);
    this.equip(owned[(i + dir + owned.length) % owned.length]);
  }

  ready() {
    return this.switchT <= 0 && this.reloadT <= 0 && this.cooldown <= 0;
  }

  fire() {
    this.mag[this.current]--;
    this.cooldown = this.def.rate;
    this.kickT = 1;
    this.flashT = 0.05;
    this.flash.material.rotation = Math.random() * Math.PI;
    const s = this.current === 'shotgun' ? 0.5 : 0.32;
    this.flash.scale.setScalar(s * (0.8 + Math.random() * 0.4));
  }

  reload() {
    if (this.reloadT > 0 || this.switchT > 0) return false;
    if (this.mag[this.current] >= this.def.mag || this.reserveFor(this.current) <= 0) return false;
    this.reloadT = this.def.reload;
    return true;
  }

  finishReload() {
    const d = this.def;
    const take = Math.min(d.mag - this.mag[this.current], this.reserveFor(this.current));
    this.mag[this.current] += take;
    if (d.ammo) this.reserve[d.ammo] -= take;
  }

  // Returns true if this was a new weapon.
  give(id) {
    const d = WEAPONS[id];
    if (this.owned.has(id)) {
      this.reserve[d.ammo] += d.mag;
      return false;
    }
    this.owned.add(id);
    this.mag[id] = d.mag;
    this.reserve[d.ammo] += d.mag;
    this.equip(id);
    return true;
  }

  update(dt, player, input) {
    this.cooldown -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        this.finishReload();
      }
    }
    let lower = 0;
    if (this.switchT > 0) {
      const before = this.switchT;
      this.switchT = Math.max(0, this.switchT - dt);
      if (before > 0.18 && this.switchT <= 0.18 && this.pending) {
        this.setModel(this.pending);
        this.pending = null;
      }
      lower = 1 - Math.abs(this.switchT - 0.18) / 0.18;
    }

    this.kickT *= Math.exp(-dt * 16);
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;

    const k = 1 - Math.exp(-dt * 10);
    this.swayX += (THREE.MathUtils.clamp(-input.dx * 0.0004, -0.04, 0.04) - this.swayX) * k;
    this.swayY += (THREE.MathUtils.clamp(input.dy * 0.0004, -0.04, 0.04) - this.swayY) * k;

    const d = this.def;
    const [x, y, z] = d.vm;
    const b = player.bobPhase;
    const a = player.bobAmt * (player.sprinting ? 1.8 : 1);
    let px = x + Math.sin(b) * 0.014 * a + this.swayX;
    let py = y - Math.abs(Math.cos(b)) * 0.014 * a + this.swayY - lower * 0.4;
    const pz = z + this.kickT * 0.07 * (d.kick / 0.05);
    let rx = this.kickT * d.kick * 2.2;
    let rz = 0;
    if (this.reloadT > 0) {
      const p = 1 - this.reloadT / d.reload;
      const s = Math.sin(Math.PI * p);
      py -= 0.16 * s;
      rx -= 0.5 * s;
      rz += 0.6 * s;
    }
    if (player.sprinting) {
      rz += 0.2;
      py -= 0.03;
      px -= 0.02;
    }
    this.root.position.set(px, py, pz);
    this.root.rotation.set(rx, -0.06, rz);
  }
}
