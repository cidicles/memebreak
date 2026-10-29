import * as THREE from 'three';
import { EYE_H, PLAYER_R, TILE, WALL_H } from './config.js';
import { DOGE_COLORS, faceTexture, stonksArrowTexture } from './memes.js';
import { buildBody, descendants, hitPart, HEAD_FWD } from './body.js';
import { Marks } from './gore.js';

// Internal type keys stay generic (grunt/shooter/brute/feels); the memes are the skins.
export const ENEMY_TYPES = {
  grunt: {
    name: 'DOGE', blurb: 'such bite. very chase.',
    hp: 45, speed: 5.2, radius: 0.45, scale: 1, color: 0xdc9a4c, limb: 0xb86f2a, blood: 0xf0b563,
    head: { y: 1.9, size: 1.25 }, alertSound: 'woof',
    melee: { dmg: 10, range: 1.7, cooldown: 0.8 },
    chatter: ['wow', 'such chase', 'very bite', 'much hungry', 'so scare', 'amaze', 'many teeth', 'bork'],
    chatterStyle: 'doge',
    deathLines: ['much dead', 'such rip', 'very oof', 'wow', 'no more bork'],
  },
  shooter: {
    name: 'STONKS', blurb: 'invests in your demise.',
    hp: 35, speed: 3.6, radius: 0.45, scale: 0.95, color: 0x1f2a44, limb: 0x141b2e, blood: 0x35d05a,
    head: { y: 1.9, size: 1.15 }, alertSound: 'kaching',
    ranged: { dmg: 9, speed: 15, cooldown: 1.7, range: 26, keep: 7 },
    chatter: ['STONKS', 'BUY HIGH', 'TO THE MOON', 'HODL', 'LINE GO UP'],
    chatterStyle: 'impact',
    deathLines: ['NOT STONKS', 'SELL SELL SELL', 'PORTFOLIO: REKT', 'MARGIN CALLED', 'LINE GO DOWN'],
  },
  brute: {
    name: 'RAGE', blurb: 'FFFFUUUUUUUUU-',
    hp: 240, speed: 3.1, radius: 0.7, scale: 1.45, color: 0xefe9df, limb: 0x2a2a2a, blood: 0xd01a1a,
    head: { y: 1.95, size: 1.3 }, alertSound: 'rage',
    melee: { dmg: 26, range: 2.5, cooldown: 1.3 },
    chatter: ['FFFUUUU', 'RAAAGH', 'Y U NO DIE'],
    chatterStyle: 'impact',
    deathLines: ['RAGE QUIT', 'CALM DOWN', 'FFFFUUUUU-', 'SALT: MAXIMUM'],
  },
  feels: {
    name: 'FEELS', blurb: 'runs at you crying. explodes.',
    hp: 18, speed: 7.2, radius: 0.4, scale: 0.9, color: 0x6f7f96, limb: 0x3b4452, blood: 0x4aa8ff,
    head: { y: 1.85, size: 1.1 }, alertSound: 'whimper',
    explode: { radius: 4.2, dmg: 34, fuse: 0.6, trigger: 2.4 },
    chatter: ['why', 'nooo', 'pls', 'it hurts'],
    chatterStyle: 'doge',
    deathLines: ['FEELS BAD MAN', 'BIG SAD', 'SADNESS INTENSIFIES', 'EMOTIONAL DAMAGE'],
  },
  cheems: {
    name: 'CHEEMS', blurb: 'bonk. sends you flying.',
    hp: 80, speed: 4.4, radius: 0.5, scale: 1.1, color: 0xe8b77a, limb: 0xc98f4a, blood: 0xf7cf8d,
    head: { y: 1.9, size: 1.35 }, alertSound: 'bonk',
    melee: { dmg: 14, range: 2.0, cooldown: 1.1, knock: 15 },
    chatter: ['bonk', 'am cheems', 'go to jail', 'much bonk', 'bonk incoming'],
    chatterStyle: 'doge',
    deathLines: ['BONKED', 'NO MORE BONK', 'SELF-BONK', 'CHEEMS.EXE STOPPED'],
  },
  brain: {
    name: 'GALAXY BRAIN', blurb: 'teleports. thinks in 4D.',
    hp: 55, speed: 3.2, radius: 0.45, scale: 1, color: 0x2a2f6e, limb: 0x1a1d45, blood: 0xc77dff,
    head: { y: 1.95, size: 1.4 }, alertSound: 'blink',
    ranged: { dmg: 7, speed: 11, cooldown: 2.2, range: 24, keep: 9, spread: 3, bolt: 'brain' },
    blink: { cooldown: 6, chanceOnHit: 0.4 },
    chatter: ['BIG BRAIN', '200 IQ', 'ASCENDED', '5D CHESS', 'CALCULATED'],
    chatterStyle: 'impact',
    deathLines: ['SMOOTH BRAIN NOW', 'BIG BRAIN: DELETED', 'NOT SO GALAXY', 'BRAIN.EXE CRASHED'],
  },
  crab: {
    name: 'CRAB RAVE', blurb: 'travels in packs. vibes.',
    hp: 12, speed: 6.2, radius: 0.35, scale: 1, color: 0xf08a72, limb: 0xb4533d, blood: 0xff6f59,
    head: { y: 0.62, size: 1.2 }, bodyless: true, rave: true, alertSound: 'rave',
    melee: { dmg: 5, range: 1.2, cooldown: 0.55 },
    chatter: ['CRAB RAVE', 'clack clack', 'rave time', 'crab', 'the vibes'],
    chatterStyle: 'doge',
    deathLines: ['CRAB IS GONE', 'RAVE OVER', 'NO MORE VIBES'],
  },
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const wA = new THREE.Vector3();
const wB = new THREE.Vector3();
const wAB = new THREE.Vector3();
const wLocal = new THREE.Vector3();
const wRadial = new THREE.Vector3();
const wAxis = new THREE.Vector3();
const wTmp = new THREE.Vector3();
const wPos = new THREE.Vector3();
const wScale = new THREE.Vector3();
const wQuat = new THREE.Quaternion();
const IDENT_Q = new THREE.Quaternion();
const FORWARD = new THREE.Vector3(0, 0, 1);

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// "Targets" are players: the local Player plus any RemotePlayers. Each has pos, vel, down,
// and `local` (true only for this machine's player).
//
// simulate = true  -> run the AI (solo, or co-op host)
// simulate = false -> mirror the host's snapshots (co-op client)
export class EnemyManager {
  constructor(scene, game, textures) {
    this.scene = scene;
    this.game = game;
    this.list = [];
    this.projectiles = [];
    this.lastAlertSound = 0;
    this.hpScale = 1;
    this.simulate = true;
    this.geo = { bolt: new THREE.SphereGeometry(0.1, 10, 8) };
    this.batMat = new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.6 });
    this.brainGlowMat = new THREE.SpriteMaterial({
      map: textures.flare,
      color: 0xc77dff,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.shirtMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    this.tieMat = new THREE.MeshStandardMaterial({ color: 0xd11f2f, roughness: 0.5 });
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0xd8ffe0 });
    this.darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1414, roughness: 0.8 });
    this.limbMats = {};
    this.glowMat = new THREE.SpriteMaterial({
      map: textures.flare,
      color: 0x35d05a,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.arrowMat = new THREE.SpriteMaterial({
      map: stonksArrowTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.targets = [];
    this.marks = new Marks(scene); // instanced wounds + stumps: one draw call for all of them
    this.tmp = new THREE.Vector3();
  }

  get total() {
    return this.list.length;
  }

  clear() {
    for (const e of this.list) {
      this.scene.remove(e.group);
      e.mat.dispose();
      e.limbMat.dispose();
      e.headMat.dispose();
    }
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.marks.clear();
    this.list = [];
    this.projectiles = [];
  }

  // A jointed body (see body.js) with a big billboard meme face that always stares at you.
  buildMesh(def, type) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.6, metalness: 0.05 });
    const baseEmissive = new THREE.Color(def.color).multiplyScalar(0.12);
    mat.emissive.copy(baseEmissive);
    const limbMat = new THREE.MeshStandardMaterial({ color: def.limb, roughness: 0.7 });
    const body = buildBody(type, def, {
      body: mat,
      limb: limbMat,
      dark: this.darkMat,
      wood: this.batMat,
      shirt: this.shirtMat,
      tie: this.tieMat,
    });
    group.add(body.inner);
    return { group, mat, limbMat, baseEmissive, ...body };
  }

  // Share out health across the limbs. Hitting a limb hurts the whole enemy less than a body
  // shot, but limbs come off once their own health runs out.
  initParts(e) {
    e.partList = [...e.parts.values()];
    e.limbMask = 0;
    e.stumps = [];
    e.partList.forEach((p, i) => (p.index = i));
    for (const part of e.parts.values()) {
      part.maxHp = part.desc.share ? Math.max(5, Math.round(e.maxHp * part.desc.share)) : 0;
      part.hp = part.maxHp;
      part.severed = false;
      part.wounds = 0;
    }
  }

  spawn(type, x, z) {
    const def = ENEMY_TYPES[type];
    const parts = this.buildMesh(def, type);
    parts.group.position.set(x, 0, z);
    this.scene.add(parts.group);
    const face = Math.random() * Math.PI * 2;
    const e = {
      id: this.list.length,
      type,
      def,
      ...parts,
      pos: new THREE.Vector3(x, 0, z),
      vel: new THREE.Vector3(),
      hp: Math.round(def.hp * this.hpScale),
      maxHp: Math.round(def.hp * this.hpScale),
      speedMul: 1,
      bleed: 0,
      lostLegs: 0,
      lostArms: 0,
      alive: true,
      alerted: false,
      alertDelay: 0,
      target: null,
      los: false,
      losT: Math.random() * 0.2,
      cd: 0,
      face,
      flash: 0,
      lunge: 0,
      attacked: false,
      anim: Math.random() * 10,
      strafeDir: 1,
      strafeT: 0,
      deathT: 0,
      fuse: 0,
      chatterT: 1 + Math.random() * 3,
      netX: x,
      netZ: z,
      netFace: face,
      lastSent: '',
    };
    this.initParts(e);
    this.list.push(e);
  }

  alert(e, propagate = true) {
    if (e.alerted || !e.alive) return;
    e.alerted = true;
    e.cd = 0.4 + Math.random() * 0.8;
    const now = performance.now();
    if (now - this.lastAlertSound > 400) {
      this.lastAlertSound = now;
      this.game.sfx(e.def.alertSound, e.pos, e.type === 'brute' ? 1.2 : 0.9);
      if (e.type === 'grunt' && Math.random() < 0.2) this.game.sound.say('wow', { pitch: 1.6, rate: 0.9 });
      if (e.type === 'brute') this.game.popups.add('FFFUUUUUU', this.headPos(e), { size: 0.9, rise: 0.6, life: 1.6 });
    }
    if (!propagate) return;
    const level = this.game.level;
    for (const o of this.list) {
      if (!o.alive || o.alerted || o.alertDelay > 0) continue;
      const dx = o.pos.x - e.pos.x;
      const dz = o.pos.z - e.pos.z;
      if (dx * dx + dz * dz < 100 && level.hasLOS(e.pos.x, e.pos.z, o.pos.x, o.pos.z)) {
        o.alertDelay = 0.3 + Math.random() * 0.5;
      }
    }
  }

  // Gunfire wakes anything within roughly `radius` tiles.
  hearNoise(x, z, radius) {
    const r = radius * TILE * 0.8;
    for (const e of this.list) {
      if (!e.alive || e.alerted || e.alertDelay > 0) continue;
      const dx = e.pos.x - x;
      const dz = e.pos.z - z;
      if (dx * dx + dz * dz < r * r) e.alertDelay = 0.15 + Math.random() * 0.5;
    }
  }

  // Per-limb hit detection: a cheap bounding sphere first, then the part capsules.
  raycast(o, d, maxT) {
    let best = maxT;
    let hit = null;
    for (const e of this.list) {
      if (!e.alive) continue;
      const s = e.def.scale;
      const ox = e.pos.x - o.x;
      const oy = 1.1 * s - o.y;
      const oz = e.pos.z - o.z;
      const along = ox * d.x + oy * d.y + oz * d.z;
      const radius = (1.6 + e.def.head.size * 0.5) * s;
      if (along < -radius || along > best + radius) continue;
      if (ox * ox + oy * oy + oz * oz - along * along > radius * radius) continue;
      // Visible enemies were posed by the last render; culled ones need posing once per frame.
      if (!e.group.visible && e.poseStamp !== this.stamp) {
        e.poseStamp = this.stamp;
        this.poseMesh(e);
        e.group.updateMatrixWorld(true);
      }
      const p = hitPart(e, o, d, best);
      if (p) {
        best = p.t;
        const rec = (this.hitRec ??= { t: 0, enemy: null, part: null, head: false });
        rec.t = p.t;
        rec.enemy = e;
        rec.part = p.part;
        rec.head = p.part.desc.role === 'head';
        hit = rec;
      }
    }
    return hit;
  }

  // Authoritative damage (solo / host). Returns true if this killed it.
  damage(e, amount, dir, by, part = null) {
    if (!e.alive) return false;
    // Limb hits hurt the whole enemy less, but chew through that limb.
    const role = part?.desc.role;
    const limb = role === 'arm' || role === 'leg' || role === 'claw' || role === 'tail';
    e.hp -= limb ? amount * 0.6 : amount;
    e.flash = 0.09;
    if (part && part.maxHp > 0 && !part.severed) {
      part.hp -= amount;
      part.wounds++;
      if (part.hp <= 0 && part.desc.sever) this.sever(e, part, dir, by);
      else if (part.desc.role === 'leg') this.recalcBody(e);
    }
    this.alert(e);
    if (by) e.lastHitBy = by;
    if (e.def.blink && Math.random() < e.def.blink.chanceOnHit) e.wantBlink = true;
    const push = (amount * 0.12) / e.def.scale ** 2;
    e.vel.x += dir.x * push;
    e.vel.z += dir.z * push;
    if (!e.alive) return true; // a fatal sever (decapitation) already finished it
    if (e.hp <= 0) {
      if (e.def.explode) this.explode(e, by);
      else {
        this.kill(e);
        this.game.onEnemyKilled(e, by);
      }
      return true;
    }
    this.game.sfx('enemyHurt', e.pos, 0.7);
    return false;
  }

  // ---- dismemberment ------------------------------------------------------

  // Authoritative sever (solo / host): do the visuals, then the consequences.
  sever(e, part, dir, by) {
    if (part.severed || !e.alive) return;
    this.severVisual(e, part, dir);
    e.limbMask |= 1 << part.index;
    this.recalcBody(e);
    e.stagger = 0.35;
    if (part.desc.fatal) {
      // No head, no meme.
      if (e.def.explode) this.explode(e, by);
      else {
        this.kill(e);
        this.game.onEnemyKilled(e, by, { decapitated: true });
      }
    }
  }

  // The visual half, run on every machine.
  severVisual(e, part, dir) {
    if (part.severed) return;
    part.severed = true;
    const kids = descendants(e.parts, part.key);
    for (const kid of kids) kid.gone = true;
    // Everything leaving with this limb stops being animated or bled from.
    const leaving = new Set([part.key, ...kids.map((k) => k.key)]);
    e.arms = e.arms.filter((a) => !leaving.has(a.key));
    e.legs = e.legs.filter((l) => !leaving.has(l.key));
    e.stumps = e.stumps.filter((st) => !leaving.has(st.part.desc.parent) && !leaving.has(st.part.key));
    const pivot = part.pivot;
    pivot.updateWorldMatrix(true, false);
    const holder = new THREE.Group();
    pivot.matrixWorld.decompose(holder.position, holder.quaternion, holder.scale);
    pivot.removeFromParent();
    pivot.position.set(0, 0, 0);
    pivot.rotation.set(0, 0, 0);
    pivot.scale.set(1, 1, 1);
    holder.add(pivot);

    const away = dir ?? { x: Math.random() - 0.5, z: Math.random() - 0.5 };
    const vel = new THREE.Vector3(
      away.x * 3.5 + (Math.random() - 0.5) * 2.5,
      3.2 + Math.random() * 2.6,
      away.z * 3.5 + (Math.random() - 0.5) * 2.5,
    );
    const r = (part.desc.hit?.r ?? 0.14) * e.def.scale;
    this.game.gibs.addLimb(holder, { vel, color: e.def.blood, radius: Math.max(0.08, r) });
    this.addStump(e, part);
    this.game.bloodBurst(holder.position, e.def.blood, part.desc.fatal ? 'big' : 'sever');
    if (dir) this.game.sprayWall(holder.position, dir, e.def.blood, 1.1, true);
    this.game.sfx(part.desc.fatal ? 'decap' : 'sever', e.pos, 1);
  }

  // A wet cap over the joint that keeps bleeding.
  addStump(e, part) {
    const parent = part.desc.parent ? e.parts.get(part.desc.parent) : null;
    if (!parent || parent.severed) return;
    const r = (part.desc.hit?.surf ?? part.desc.hit?.r ?? 0.14) * 1.15;
    wPos.set(part.desc.pivot[0], part.desc.pivot[1], part.desc.pivot[2]);
    wScale.set(r, r, r);
    const local = new THREE.Matrix4().compose(wPos, IDENT_Q, wScale);
    const color = new THREE.Color(e.def.blood).multiplyScalar(0.34).getHex();
    this.marks.add(parent.pivot, local, color);
    e.stumps.push({ part, pivot: parent.pivot, offset: part.desc.pivot });
  }

  // A bullet hole on the surface of the part that was hit (capped per enemy, oldest reused).
  addWound(e, part, worldPoint) {
    if (part.severed || !part.pivot.parent || !this.near(e, 22)) return; // wounds only read close up
    const hit = part.desc.hit;
    const r = Math.max(0.035, (hit?.surf ?? hit?.r ?? 0.14) * 0.42);
    part.pivot.worldToLocal(wLocal.copy(worldPoint));
    if (hit) {
      // nearest point on the limb axis, then out to its surface, facing outward
      wA.set(hit.a[0], hit.a[1], hit.a[2]);
      wB.set(hit.b[0], hit.b[1], hit.b[2]);
      wAB.subVectors(wB, wA);
      const len2 = wAB.lengthSq();
      const t = len2 > 1e-8 ? THREE.MathUtils.clamp(wTmp.copy(wLocal).sub(wA).dot(wAB) / len2, 0, 1) : 0;
      wAxis.copy(wA).addScaledVector(wAB, t);
      wRadial.subVectors(wLocal, wAxis);
      if (wRadial.lengthSq() < 1e-6) wRadial.set(0, 0, 1);
      wRadial.normalize();
      wPos.copy(wAxis).addScaledVector(wRadial, (hit.surf ?? hit.r * 0.8) * 0.96);
      // squash the mark against the surface: scale flat along the outward direction
      wQuat.setFromUnitVectors(FORWARD, wRadial);
    } else {
      wPos.copy(wLocal);
      wQuat.identity();
    }
    const s = r * (0.9 + Math.random() * 0.5);
    wScale.set(s, s, r * 0.45);
    const local = new THREE.Matrix4().compose(wPos, wQuat, wScale);
    const color = new THREE.Color(e.def.blood).multiplyScalar(0.45).getHex();
    this.marks.add(part.pivot, local, color);
  }

  near(e, range = 45) {
    const p = this.game.player.pos;
    return Math.abs(e.pos.x - p.x) + Math.abs(e.pos.z - p.z) < range;
  }

  ancestorSevered(e, part) {
    let key = part.desc.parent;
    while (key) {
      const p = e.parts.get(key);
      if (!p) return false;
      if (p.severed) return true;
      key = p.desc.parent;
    }
    return false;
  }

  dripStumps(e) {
    if (!e.group.visible) return;
    const p = this.game.player.pos;
    if (Math.abs(e.pos.x - p.x) + Math.abs(e.pos.z - p.z) > 40) return;
    if (!e.stumps.length) {
      // no severed limbs: bleed from the body itself
      this.game.bloodDrip(wTmp.set(e.pos.x, 0.5 * e.def.scale, e.pos.z), e.def.blood);
      return;
    }
    const s = e.stumps[Math.floor(Math.random() * e.stumps.length)];
    if (!s.pivot.parent) return;
    wTmp.set(s.offset[0], s.offset[1], s.offset[2]).applyMatrix4(s.pivot.matrixWorld);
    this.game.bloodDrip(wTmp, e.def.blood);
  }

  // Losing limbs slows an enemy down and takes its weapons with it.
  recalcBody(e) {
    let slow = 0;
    let legs = 0;
    let arms = 0;
    e.noRanged = false;
    e.noKnock = false;
    for (const p of e.parts.values()) {
      if (!p.severed) continue;
      const d = p.desc;
      if (d.slow) slow += d.slow;
      if (d.role === 'leg') legs++;
      if (d.role === 'arm' || d.role === 'claw') arms++;
      for (const k of [p, ...descendants(e.parts, p.key)]) {
        if (k.desc.disables === 'ranged') e.noRanged = true;
        if (k.desc.disables === 'knock') e.noKnock = true;
      }
    }
    // Mangled (not yet severed) legs already hurt mobility.
    for (const p of e.parts.values()) {
      if (p.severed || p.desc.role !== 'leg' || !p.maxHp) continue;
      if (p.hp < p.maxHp * 0.5) slow += (p.desc.slow ?? 0.2) * 0.3;
    }
    e.lostLegs = legs;
    e.lostArms = arms;
    e.speedMul = Math.max(0.15, 1 - slow);
    // Both legs gone (or most of a crab's): down to a crawl.
    e.crawl = e.def.bodyless ? legs >= 4 : e.parts.get('legUpperL').severed && e.parts.get('legUpperR').severed;
    if (e.crawl) e.speedMul = Math.min(e.speedMul, 0.25); // dragging itself
    e.bleed = 0;
    for (const p of e.parts.values()) {
      if (!p.severed || p.desc.role === 'prop' || p.desc.fatal) continue;
      if (this.ancestorSevered(e, p)) continue; // its stump went with the parent limb
      e.bleed += 1.6;
    }
  }

  // FEELS goes off: hurts players (host decides) and other monsters - chain reactions are
  // credited to whoever set off the first one.
  explode(e, by) {
    if (!e.alive) return;
    this.kill(e);
    this.game.onEnemyKilled(e, by);
    const ex = e.def.explode;
    const level = this.game.level;
    for (const t of this.targets) {
      if (t.down) continue;
      const d = Math.hypot(t.pos.x - e.pos.x, t.pos.z - e.pos.z);
      if (d < ex.radius && level.hasLOS(e.pos.x, e.pos.z, t.pos.x, t.pos.z)) {
        this.game.meleeHit(t, Math.round(ex.dmg * (1 - (0.6 * d) / ex.radius)), e.pos, 8);
      }
    }
    for (const o of this.list) {
      if (o === e || !o.alive) continue;
      const dx = o.pos.x - e.pos.x;
      const dz = o.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < ex.radius) this.damage(o, ex.dmg * 1.5 * (1 - (0.5 * d) / ex.radius), { x: dx / (d || 1), z: dz / (d || 1) }, by);
    }
  }

  // GALAXY BRAIN: vanish and reappear somewhere with a clear shot at its target.
  blink(e, target, level) {
    const tx = Math.floor(target.pos.x / TILE);
    const tz = Math.floor(target.pos.z / TILE);
    for (let i = 0; i < 20; i++) {
      const x = tx + Math.floor(Math.random() * 7) - 3;
      const z = tz + Math.floor(Math.random() * 7) - 3;
      if (level.isWall(x, z)) continue;
      const px = (x + 0.5) * TILE;
      const pz = (z + 0.5) * TILE;
      const d = Math.hypot(px - target.pos.x, pz - target.pos.z);
      if (d < 6 || d > 14 || !level.hasLOS(px, pz, target.pos.x, target.pos.z)) continue;
      this.blinkFx(e.pos);
      e.pos.set(px, 0, pz);
      e.vel.set(0, 0, 0);
      this.blinkFx(e.pos);
      return;
    }
  }

  blinkFx(pos) {
    this.game.sparks.burst(new THREE.Vector3(pos.x, 1.3, pos.z), 0xc77dff, 26, 5, null, { gravity: 0, life: 0.5 });
    this.game.sfx('blink', pos, 0.9);
  }

  headPos(e) {
    const s = e.def.scale;
    const f = HEAD_FWD * s;
    return new THREE.Vector3(
      e.pos.x + Math.sin(e.face) * f,
      (e.def.head.y + 0.1 + e.def.head.size * 0.6) * s,
      e.pos.z + Math.cos(e.face) * f,
    );
  }

  // Client-side prediction: instant feedback, the host confirms the kill.
  predictHit(e, amount, part = null) {
    if (!e.alive) return false;
    e.flash = 0.09;
    const role = part?.desc.role;
    const limb = role === 'arm' || role === 'leg' || role === 'claw' || role === 'tail';
    e.hp -= limb ? amount * 0.6 : amount; // matches damage()
    if (part && part.maxHp > 0 && !part.severed) {
      part.hp -= amount;
      part.wounds++;
    }
    this.game.sfx('enemyHurt', e.pos, 0.7);
    return e.hp <= 0;
  }

  kill(e) {
    if (!e.alive) return;
    if (this.near(e)) {
      // even a clean kill leaves a mess
      this.game.bloodBurst(wTmp.set(e.pos.x, 0.7 * e.def.scale, e.pos.z), e.def.blood, 'death');
      e.bleed = Math.max(e.bleed ?? 0, 2.2);
    }
    e.alive = false;
    e.hp = 0;
    e.deathT = 0;
    e.mat.emissive.copy(e.baseEmissive);
  }

  update(dt, targets, level) {
    this.stamp = (this.stamp ?? 0) + 1;
    const living = targets.filter((t) => !t.down);
    this.targets = targets;
    if (this.simulate) level.updateFlow(living);
    const alive = [];
    for (const e of this.list) {
      if (!e.alive) {
        this.updateDying(e, dt);
        if (e.bleed > 0 && e.deathT < 3) {
          e.bleedFx = (e.bleedFx ?? 0) - dt;
          if (e.bleedFx <= 0) {
            e.bleedFx = 0.12 + Math.random() * 0.1;
            this.dripStumps(e);
          }
        }
        continue;
      }
      if (this.simulate) {
        if (e.bleed > 0) {
          e.hp -= e.bleed * dt;
          e.bleedFx = (e.bleedFx ?? 0) - dt;
          if (e.bleedFx <= 0) {
            e.bleedFx = 0.09 + Math.random() * 0.08;
            this.dripStumps(e);
          }
          if (e.hp <= 0) {
            this.kill(e);
            this.game.onEnemyKilled(e, e.lastHitBy ?? 'env', { bledOut: true });
            continue;
          }
        }
        alive.push(e);
        this.think(e, dt, living, level);
      } else {
        alive.push(e);
        if (e.bleed > 0) {
          e.bleedFx = (e.bleedFx ?? 0) - dt;
          if (e.bleedFx <= 0) {
            e.bleedFx = 0.09 + Math.random() * 0.08;
            this.dripStumps(e);
          }
        }
        this.follow(e, dt, level);
      }
    }
    if (this.simulate) this.separate(alive, living, level);

    const view = this.game.player.pos;
    for (const e of alive) {
      // Anything past this range is lost in the fog anyway; skip drawing it.
      e.group.visible = Math.abs(e.pos.x - view.x) + Math.abs(e.pos.z - view.z) < 48;
      if (e.group.visible) this.syncMesh(e, dt);
    }
    this.updateProjectiles(dt, targets, level);
    this.marks.update();
  }

  separate(alive, players, level) {
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = a.def.radius + b.def.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          level.moveCircle(a.pos, (-dx / d) * push, (-dz / d) * push, a.def.radius);
          level.moveCircle(b.pos, (dx / d) * push, (dz / d) * push, b.def.radius);
        }
      }
      for (const p of players) {
        const dx = a.pos.x - p.pos.x;
        const dz = a.pos.z - p.pos.z;
        const min = a.def.radius + PLAYER_R + 0.05;
        const d = Math.hypot(dx, dz);
        if (d < min && d > 1e-4) level.moveCircle(a.pos, (dx / d) * (min - d), (dz / d) * (min - d), a.def.radius);
      }
    }
  }

  nextStep(e, level) {
    const size = level.size;
    const tx = Math.floor(e.pos.x / TILE);
    const tz = Math.floor(e.pos.z / TILE);
    const f = level.flow;
    const d = f[tz * size + tx];
    if (d === 0) return e.target?.pos ?? null;
    if (d < 0) return null;
    let best = -1;
    let bd = d;
    for (const [dx, dz] of DIRS) {
      const nx = tx + dx;
      const nz = tz + dz;
      if (level.isWall(nx, nz)) continue;
      const n = nz * size + nx;
      if (f[n] >= 0 && f[n] < bd) {
        bd = f[n];
        best = n;
      }
    }
    if (best < 0) return null;
    return this.tmp.set(((best % size) + 0.5) * TILE, 0, (((best / size) | 0) + 0.5) * TILE);
  }

  think(e, dt, targets, level) {
    const def = e.def;
    e.flash = Math.max(0, e.flash - dt);

    e.losT -= dt;
    if (e.losT <= 0 || !e.target || e.target.down || !targets.includes(e.target)) {
      e.losT = 0.1 + Math.random() * 0.1;
      let best = null;
      let bd = Infinity;
      for (const t of targets) {
        const d = Math.hypot(t.pos.x - e.pos.x, t.pos.z - e.pos.z);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      e.target = best;
      e.los = !!best && bd < 34 && level.hasLOS(e.pos.x, e.pos.z, best.pos.x, best.pos.z);
    }
    const target = e.target;

    if (e.alertDelay > 0) {
      e.alertDelay -= dt;
      if (e.alertDelay <= 0) this.alert(e, false);
    }

    const dx = target ? target.pos.x - e.pos.x : 0;
    const dz = target ? target.pos.z - e.pos.z : 0;
    const dist = Math.hypot(dx, dz) || 1e-4;

    if (!e.alerted || !target) {
      if (target && ((e.los && dist < 20) || dist < 3.5)) this.alert(e);
      e.vel.multiplyScalar(Math.exp(-dt * 8));
      level.moveCircle(e.pos, e.vel.x * dt, e.vel.z * dt, def.radius);
      e.anim += dt;
      return;
    }

    // --- Steering ---
    let mx = 0;
    let mz = 0;
    let speed = def.speed * (e.speedMul ?? 1);
    if (e.stagger > 0) {
      e.stagger -= dt;
      speed *= 0.25; // reeling from losing a limb
    }
    if (e.los && dist < 14) {
      mx = dx / dist;
      mz = dz / dist;
    } else {
      const t = this.nextStep(e, level);
      if (t) {
        mx = t.x - e.pos.x;
        mz = t.z - e.pos.z;
        const l = Math.hypot(mx, mz) || 1;
        mx /= l;
        mz /= l;
      }
    }
    if (def.ranged && e.los) {
      e.strafeT -= dt;
      if (e.strafeT <= 0) {
        e.strafeT = 0.7 + Math.random() * 1.4;
        e.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      const px = (-dz / dist) * e.strafeDir;
      const pz = (dx / dist) * e.strafeDir;
      if (dist < def.ranged.keep) {
        mx = (-dx / dist) * 0.7 + px * 0.7;
        mz = (-dz / dist) * 0.7 + pz * 0.7;
      } else if (dist < def.ranged.range * 0.6) {
        mx = px;
        mz = pz;
        speed *= 0.7;
      }
    }
    if (def.melee && e.los && dist < def.melee.range * 0.75) {
      mx = 0;
      mz = 0;
    }

    const k = 1 - Math.exp(-dt * 7);
    e.vel.x += (mx * speed - e.vel.x) * k;
    e.vel.z += (mz * speed - e.vel.z) * k;
    level.moveCircle(e.pos, e.vel.x * dt, e.vel.z * dt, def.radius);

    const hs = Math.hypot(e.vel.x, e.vel.z);
    const want = e.los ? Math.atan2(dx, dz) : hs > 0.3 ? Math.atan2(e.vel.x, e.vel.z) : e.face;
    e.face = lerpAngle(e.face, want, 1 - Math.exp(-dt * 10));
    e.anim += dt * (1 + hs * 1.6);

    // --- Attacks ---
    if (def.explode) {
      if (!(e.fuse > 0) && e.los && dist < def.explode.trigger) {
        e.fuse = def.explode.fuse;
        this.game.sfx('fuse', e.pos, 1);
        this.game.popups.add('NOOOO', this.headPos(e), { style: 'doge', color: '#4aa8ff', size: 0.6 });
      }
      if (e.fuse > 0) {
        e.fuse -= dt;
        if (e.fuse <= 0) {
          e.fuse = 0.001; // keep the "lit" flag for the last snapshot
          this.explode(e, 'env');
        }
      }
      return;
    }
    if (def.blink) {
      e.blinkT = (e.blinkT ?? Math.random() * def.blink.cooldown) - dt;
      if (e.blinkT <= 0 || e.wantBlink) {
        e.wantBlink = false;
        e.blinkT = def.blink.cooldown * (0.7 + Math.random() * 0.6);
        this.blink(e, target, level);
      }
    }
    e.cd -= dt;
    if (def.melee && e.los && dist < def.melee.range && e.cd <= 0) {
      e.cd = def.melee.cooldown;
      e.lunge = 1;
      e.attacked = true;
      const knock = e.noKnock ? 0 : def.melee.knock ?? 0; // no bat, no bonk
      const armed = Math.max(0.35, 1 - 0.35 * (e.lostArms ?? 0)); // fewer arms, weaker swing
      this.game.sfx(knock ? 'bonk' : 'melee', e.pos, 1);
      if (knock) this.game.popups.add('BONK', this.headPos(e), { size: 0.8, life: 1 });
      this.game.meleeHit(target, Math.round(def.melee.dmg * armed), e.pos, knock);
    }
    if (def.ranged && e.los && dist < def.ranged.range && e.cd <= 0 && !e.noRanged) {
      e.cd = def.ranged.cooldown * (0.75 + Math.random() * 0.5);
      e.lunge = 0.5;
      e.attacked = true;
      this.fireProjectile(e, target, dist);
    }
  }

  // Co-op client: glide toward the host's latest snapshot.
  follow(e, dt, level) {
    e.flash = Math.max(0, e.flash - dt);
    const k = 1 - Math.exp(-dt * 12);
    const dx = e.netX - e.pos.x;
    const dz = e.netZ - e.pos.z;
    if (dx * dx + dz * dz > 16) {
      if (e.def.blink) {
        // a big jump from the host means it teleported
        this.blinkFx(e.pos);
        this.blinkFx({ x: e.netX, z: e.netZ });
      }
      e.pos.x = e.netX;
      e.pos.z = e.netZ;
    } else {
      e.pos.x += dx * k;
      e.pos.z += dz * k;
    }
    if (dt > 0) {
      e.vel.x += ((dx * k) / dt - e.vel.x) * 0.3;
      e.vel.z += ((dz * k) / dt - e.vel.z) * 0.3;
    }
    e.face = lerpAngle(e.face, e.netFace, k);
    e.anim += dt * (1 + Math.hypot(e.vel.x, e.vel.z) * 1.6);
    e.losT -= dt;
    if (e.losT <= 0) {
      e.losT = 0.15 + Math.random() * 0.1;
      const p = this.game.player.pos;
      e.los = e.alerted && Math.hypot(p.x - e.pos.x, p.z - e.pos.z) < 34 && level.hasLOS(e.pos.x, e.pos.z, p.x, p.z);
    }
  }

  snapshot(full) {
    const out = [];
    for (const e of this.list) {
      const x = Math.round(e.pos.x * 100);
      const z = Math.round(e.pos.z * 100);
      const f = Math.round(e.face * 100);
      const hp = Math.max(0, Math.round(e.hp));
      const flags = (e.alive ? 1 : 0) | (e.alerted ? 2 : 0) | (e.attacked ? 4 : 0) | (e.fuse > 0 ? 8 : 0);
      const mask = e.limbMask;
      const key = `${x},${z},${f},${hp},${flags},${mask}`;
      if (!full && key === e.lastSent) continue;
      e.lastSent = key;
      e.attacked = false;
      out.push([e.id, x, z, f, hp, flags, mask]);
    }
    return out;
  }

  applySnapshot(rows) {
    for (const [id, x, z, f, hp, flags, mask = 0] of rows) {
      const e = this.list[id];
      if (!e) continue;
      // Limbs the host has cut off but we still have: take them off here too. This runs before
      // the alive check so a limb lost on the killing blow still comes off on every client.
      if (mask !== e.limbMask) {
        e.limbMask = mask;
        for (const p of e.partList) {
          if (mask & (1 << p.index) && !p.severed) this.severVisual(e, p, null);
        }
        this.recalcBody(e);
      }
      if (!(flags & 1) && e.alive) this.kill(e); // a corpse we never saw die (late join)
      if (!e.alive) continue;
      e.netX = x / 100;
      e.netZ = z / 100;
      e.netFace = f / 100;
      e.hp = hp;
      if (flags & 2) this.alert(e, false);
      if (flags & 4) e.lunge = 1;
      if (flags & 8 && !(e.fuse > 0)) {
        e.fuse = e.def.explode?.fuse ?? 0.6;
        this.game.sfx('fuse', e.pos, 1);
      }
    }
  }

  // Transforms only - safe to call from a raycast. syncMesh() adds the rest.
  poseMesh(e) {
    const def = e.def;
    const s = def.scale;
    const moving = Math.min(1, Math.hypot(e.vel.x, e.vel.z) / def.speed);
    e.group.position.set(e.pos.x, Math.abs(Math.sin(e.anim * 5)) * 0.06 * moving, e.pos.z);
    e.group.rotation.y = e.face;
    e.inner.position.z = e.lunge * 0.18 * s;
    e.inner.position.y = e.crawl ? -0.42 * s : 0;
    e.inner.rotation.x = e.lunge * 0.25 + (e.alerted ? 0.12 : 0);
    for (const a of e.arms) a.pivot.rotation.x = a.rest + Math.sin(e.anim * 5 + a.phase) * 0.6 * moving - e.lunge * 1.4;
    for (const l of e.legs) l.pivot.rotation.x = l.rest + Math.sin(e.anim * 5 + l.phase) * 0.55 * moving;
    let size = def.head.size * (1 + Math.sin(e.anim * 5) * 0.04 * moving);
    if (e.fuse > 0) size *= 1.15 + Math.sin(performance.now() / 40) * 0.12;
    e.head.scale.setScalar(size);
    e.head.position.x = e.type === 'brute' && e.alerted ? (Math.random() - 0.5) * 0.08 : 0; // rage shake
  }

  syncMesh(e, dt) {
    const def = e.def;
    const moving = Math.min(1, Math.hypot(e.vel.x, e.vel.z) / def.speed);
    e.lunge *= 0.9;
    this.poseMesh(e);
    if (e.fuse > 0 && !this.simulate) e.fuse = Math.max(0.001, e.fuse - dt);
    const hurt = e.flash > 0 || (e.fuse > 0 && Math.sin(performance.now() / 50) > 0);
    e.headMat.color.setRGB(hurt ? 1 : 0.87, hurt ? 0.45 : 0.87, hurt ? 0.45 : 0.87);
    if (def.rave && e.alerted && !hurt) {
      // CRAB RAVE: strobe through the rainbow and dance
      const t = performance.now() / 1000;
      e.headMat.color.setHSL((t * 1.7 + e.id * 0.17) % 1, 1, 0.72);
      e.headMat.rotation = Math.sin(t * 12 + e.id) * 0.25;
      e.head.position.y = def.head.y + Math.abs(Math.sin(t * 12 + e.id)) * 0.18;
    }
    if (e.flash > 0) e.mat.emissive.setRGB(1, 0.85, 0.8);
    else e.mat.emissive.copy(e.baseEmissive);

    // Ambient meme chatter from alerted monsters near you.
    e.chatterT -= dt;
    if (e.alerted && e.chatterT <= 0) {
      e.chatterT = 2.5 + Math.random() * 4;
      const p = this.game.player.pos;
      if (Math.hypot(p.x - e.pos.x, p.z - e.pos.z) < 22 && (e.type !== 'shooter' || Math.random() < 0.4)) {
        const color = def.chatterStyle === 'doge' ? pick(DOGE_COLORS) : '#ffffff';
        const at = this.headPos(e).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2));
        this.game.popups.add(pick(def.chatter), at, { style: def.chatterStyle, color, size: 0.45, life: 1.6, rise: 0.5 });
      }
    }
  }

  updateDying(e, dt) {
    if (!e.group.parent) return;
    e.group.visible = true;
    e.deathT += dt;
    const t = Math.min(1, e.deathT / 0.5);
    e.inner.rotation.x = -t * t * 1.45;
    e.inner.position.z = 0;
    e.headMat.rotation = t * Math.PI * 0.5; // the face keels over too
    e.headMat.color.setRGB(0.6, 0.6, 0.6);
    e.group.position.y = -Math.max(0, e.deathT - 2) * 0.6;
    if (e.deathT > 4) this.scene.remove(e.group);
  }

  fireProjectile(e, target, dist) {
    const r = e.def.ranged;
    const s = e.def.scale;
    const o = new THREE.Vector3(e.pos.x + Math.sin(e.face) * 0.75 * s, 1.35 * s, e.pos.z + Math.cos(e.face) * 0.75 * s);
    const lead = (dist / r.speed) * 0.5;
    const aim = new THREE.Vector3(target.pos.x + target.vel.x * lead, EYE_H - 0.35, target.pos.z + target.vel.z * lead);
    const dir = aim.sub(o).normalize();
    dir.x += (Math.random() - 0.5) * 0.06;
    dir.y += (Math.random() - 0.5) * 0.04;
    dir.z += (Math.random() - 0.5) * 0.06;
    dir.normalize().multiplyScalar(r.speed);
    const oa = [o.x, o.y, o.z];
    const shots = r.spread ?? 1;
    for (let i = 0; i < shots; i++) {
      // fan the shots out around the aim direction
      const a = (i - (shots - 1) / 2) * 0.2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const va = [dir.x * c + dir.z * sn, dir.y, -dir.x * sn + dir.z * c];
      this.spawnProjectile(oa, va, r.dmg, r.bolt);
      this.game.onProjectile(oa, va, r.dmg, r.bolt);
    }
    this.game.sfx(r.bolt === 'brain' ? 'blink' : 'enemyShoot', o, 0.9);
    if (Math.random() < 0.25) this.game.popups.add(pick(e.def.chatter), this.headPos(e), { size: 0.45, life: 1.2 });
  }

  // Stonks bolts are spinning green line-go-up arrows; galaxy-brain bolts are purple thought orbs.
  spawnProjectile(o, v, dmg, kind = 'stonks') {
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(this.geo.bolt, this.boltMat);
    if (kind === 'brain') {
      const glow = new THREE.Sprite(this.brainGlowMat);
      glow.scale.setScalar(1.2);
      mesh.add(core, glow);
      mesh.userData.arrow = null;
    } else {
      const glow = new THREE.Sprite(this.glowMat);
      glow.scale.setScalar(0.9);
      const arrow = new THREE.Sprite(this.arrowMat.clone());
      arrow.scale.setScalar(0.7);
      mesh.add(core, glow, arrow);
      mesh.userData.arrow = arrow;
    }
    mesh.position.set(o[0], o[1], o[2]);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, vel: new THREE.Vector3(v[0], v[1], v[2]), life: 4, dmg });
  }

  // Every machine simulates every bolt, but only applies damage to its own player.
  updateProjectiles(dt, targets, level) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const pos = p.mesh.position;
      pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.mesh.userData.arrow) p.mesh.userData.arrow.material.rotation += dt * 9;
      let dead = p.life <= 0;
      if (!dead && (level.isWallAt(pos.x, pos.z) || pos.y < 0.05 || pos.y > WALL_H)) {
        this.game.sparks.burst(pos, 0x35d05a, 10, 4, null, { gravity: 4, life: 0.35 });
        dead = true;
      }
      if (!dead && pos.y < EYE_H + 0.3) {
        for (const t of targets) {
          if (t.down || Math.hypot(pos.x - t.pos.x, pos.z - t.pos.z) >= PLAYER_R + 0.3) continue;
          if (t.local) this.game.playerHit(p.dmg, pos);
          dead = true;
          break;
        }
      }
      if (dead) {
        p.mesh.userData.arrow?.material.dispose();
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
}
