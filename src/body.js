import * as THREE from 'three';
import { faceTexture } from './memes.js';

// Jointed enemy bodies: every limb is a pivot + mesh with its own health and hit capsule, so
// shots can be traced to a specific part and that part can be severed (see gore.js).
//
// A part descriptor:
//   key      unique name
//   role     head | torso | arm | leg | claw | tail | prop
//   parent   key of the parent part (its pivot), or null for the body root
//   pivot    [x,y,z] joint position relative to the parent pivot
//   mesh     { geo, mat, pos, rot } visual attached to the pivot
//   hit      { a, b, r } capsule in pivot space; omitted = not shootable
//   share    part health as a fraction of the enemy max health
//   sever    can it be cut off
//   slow     movement penalty when lost (legs)
//   fatal    losing it kills outright (head)

export const HEAD_FWD = 0.5; // billboard face offset, so the body never hides the chin

const G = {};
const geo = (key, make) => (G[key] ??= make());

const BOX = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const CYL = (rt, rb, h) => geo(`c${rt},${rb},${h}`, () => new THREE.CylinderGeometry(rt, rb, h, 8));
const SPH = (r) => geo(`s${r}`, () => new THREE.SphereGeometry(r, 10, 8));
const CAP = (r, h) => geo(`k${r},${h}`, () => new THREE.CapsuleGeometry(r, h, 4, 12));
const CONE = (r, h) => geo(`n${r},${h}`, () => new THREE.ConeGeometry(r, h, 8));

// ---------------------------------------------------------------- skeletons

function humanoid(def, type) {
  const armMat = type === 'grunt' || type === 'cheems' ? 'limb' : 'body';
  // STONKS holds its launcher out in front: that arm is posed, not swung.
  const aiming = type === 'shooter';
  const parts = [
    {
      key: 'torso', role: 'torso', parent: null, pivot: [0, 0, 0],
      mesh: { geo: CAP(0.34, 0.55), mat: 'body', pos: [0, 1.12, 0] },
      hit: { a: [0, 0.98, 0], b: [0, 1.32, 0], r: 0.37, surf: 0.34 },
      share: 1, sever: false,
    },
    {
      key: 'head', role: 'head', parent: 'torso', pivot: [0, def.head.y + 0.1, HEAD_FWD],
      sprite: { map: faceTexture(type), size: def.head.size },
      hit: { a: [0, -0.16, 0], b: [0, 0.16, 0], r: def.head.size * 0.42, surf: def.head.size * 0.34 },
      share: 0.5, sever: true, fatal: true,
    },
  ];
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    parts.push(
      {
        key: `armUpper${side}`, role: 'arm', parent: 'torso', pivot: [s * 0.46, 1.34, 0], side: s,
        mesh: { geo: BOX(0.15, 0.36, 0.15), mat: armMat, pos: [0, -0.18, 0] },
        hit: { a: [0, -0.02, 0], b: [0, -0.36, 0], r: 0.14, surf: 0.08 },
        rest: aiming && s > 0 ? [-Math.PI / 2 + 0.15, 0, 0] : null,
        share: 0.3, sever: true, swing: aiming && s > 0 ? null : 'arm',
      },
      {
        key: `armLower${side}`, role: 'arm', parent: `armUpper${side}`, pivot: [0, -0.36, 0], side: s,
        mesh: { geo: BOX(0.14, 0.34, 0.14), mat: armMat, pos: [0, -0.17, 0] },
        hit: { a: [0, -0.02, 0], b: [0, -0.34, 0], r: 0.13, surf: 0.075 },
        share: 0.22, sever: true,
      },
      {
        key: `legUpper${side}`, role: 'leg', parent: 'torso', pivot: [s * 0.2, 0.66, 0], side: s,
        mesh: { geo: BOX(0.17, 0.34, 0.17), mat: 'limb', pos: [0, -0.17, 0] },
        hit: { a: [0, -0.02, 0], b: [0, -0.34, 0], r: 0.15, surf: 0.09 },
        share: 0.35, sever: true, slow: 0.45, swing: 'leg',
      },
      {
        key: `legLower${side}`, role: 'leg', parent: `legUpper${side}`, pivot: [0, -0.34, 0], side: s,
        mesh: { geo: BOX(0.16, 0.32, 0.16), mat: 'limb', pos: [0, -0.16, 0] },
        hit: { a: [0, -0.02, 0], b: [0, -0.34, 0], r: 0.14, surf: 0.085 },
        share: 0.28, sever: true, slow: 0.25,
      },
    );
  }
  return parts;
}

function crab(def) {
  // All shell and limbs: the drawn shell is the billboard, the claws and legs are real parts.
  const parts = [
    {
      key: 'torso', role: 'torso', parent: null, pivot: [0, 0, 0],
      sprite: { map: faceTexture('crab'), size: def.head.size, y: def.head.y },
      hit: { a: [-0.3, 0.42, 0], b: [0.3, 0.42, 0], r: 0.3 },
      share: 1, sever: false,
    },
  ];
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    parts.push({
      key: `claw${side}`, role: 'claw', parent: 'torso', pivot: [s * 0.5, 0.72, 0.18], side: s,
      mesh: { geo: SPH(0.17), mat: 'body', pos: [0, 0.06, 0] },
      extra: [{ geo: BOX(0.2, 0.08, 0.14), mat: 'limb', pos: [s * 0.08, 0.18, 0.02], rot: [0, 0, s * 0.4] }],
      hit: { a: [0, 0, 0], b: [0, 0.2, 0], r: 0.2, surf: 0.17 },
      share: 0.45, sever: true, swing: 'arm',
    });
    for (let i = 0; i < 3; i++) {
      parts.push({
        key: `leg${side}${i}`, role: 'leg', parent: 'torso', pivot: [s * 0.36, 0.44, 0.22 - i * 0.22], side: s,
        mesh: { geo: CYL(0.04, 0.03, 0.5), mat: 'limb', pos: [s * 0.2, -0.16, 0], rot: [0, 0, s * 1.0] },
        hit: { a: [0, 0.02, 0], b: [s * 0.42, -0.3, 0], r: 0.1, surf: 0.05 },
        share: 0.3, sever: true, slow: 0.12, swing: 'leg',
      });
    }
  }
  return parts;
}

// Props ride on a limb: sever that limb and the weapon goes with it.
function props(type) {
  switch (type) {
    case 'shooter':
      return [{
        key: 'gun', role: 'prop', parent: 'armLowerR', pivot: [0, -0.34, 0],
        mesh: { geo: BOX(0.13, 0.13, 0.5), mat: 'dark', pos: [0, -0.06, 0.2] },
        share: 0, sever: false, disables: 'ranged',
      }];
    case 'cheems':
      return [{
        key: 'bat', role: 'prop', parent: 'armLowerR', pivot: [0, -0.34, 0],
        mesh: { geo: CYL(0.07, 0.04, 0.85), mat: 'wood', pos: [0, -0.4, 0.08] },
        share: 0, sever: false, disables: 'knock',
      }];
    case 'brute':
      return [-1, 1].map((s) => ({
        key: `fist${s < 0 ? 'L' : 'R'}`, role: 'prop', parent: `armLower${s < 0 ? 'L' : 'R'}`, pivot: [0, -0.34, 0],
        mesh: { geo: BOX(0.3, 0.3, 0.3), mat: 'limb', pos: [0, -0.12, 0] },
        share: 0, sever: false,
      }));
    case 'grunt':
      return [{
        key: 'tail', role: 'tail', parent: 'torso', pivot: [0, 0.8, -0.4],
        mesh: { geo: CONE(0.1, 0.45), mat: 'limb', pos: [0, 0.1, -0.05], rot: [-0.9, 0, 0] },
        hit: { a: [0, 0, 0], b: [0, 0.2, -0.28], r: 0.13, surf: 0.1 },
        share: 0.18, sever: true,
      }];
    default:
      return [];
  }
}

export function skeleton(type, def) {
  const parts = def.bodyless ? crab(def) : humanoid(def, type);
  return parts.concat(props(type));
}

// ---------------------------------------------------------------- building

export function buildBody(type, def, mats) {
  const inner = new THREE.Group();
  const parts = new Map();
  const swings = { arm: [], leg: [] };
  let head = null;
  let headMat = null;

  for (const d of skeleton(type, def)) {
    const pivot = new THREE.Group();
    pivot.position.set(...d.pivot);
    if (d.rest) pivot.rotation.set(...d.rest);
    (d.parent ? parts.get(d.parent).pivot : inner).add(pivot);
    const part = { key: d.key, desc: d, pivot, meshes: [], severed: false, hp: 0, maxHp: 0, wounds: 0 };

    if (d.sprite) {
      headMat = new THREE.SpriteMaterial({ map: d.sprite.map, color: 0xdddddd, alphaTest: 0.1 });
      const sprite = new THREE.Sprite(headMat);
      sprite.scale.setScalar(d.sprite.size);
      if (d.sprite.y !== undefined) sprite.position.y = d.sprite.y;
      pivot.add(sprite);
      part.meshes.push(sprite);
      part.sprite = sprite;
      if (d.role === 'head' || d.parent === null) head = sprite; // the face, not some later sprite
    }
    for (const m of [d.mesh, ...(d.extra ?? [])].filter(Boolean)) {
      const mesh = new THREE.Mesh(m.geo, mats[m.mat]);
      if (m.pos) mesh.position.set(...m.pos);
      if (m.rot) mesh.rotation.set(...m.rot);
      pivot.add(mesh);
      part.meshes.push(mesh);
    }
    if (d.swing) {
      // phase is fixed per limb so the survivors do not re-phase when one is cut off
      const phase = swings[d.swing].length * Math.PI;
      swings[d.swing].push({ pivot, rest: d.rest ? d.rest[0] : 0, key: d.key, phase });
    }
    parts.set(d.key, part);
  }

  // Cosmetic extras that are not parts in their own right.
  if (type === 'shooter') {
    const torso = parts.get('torso');
    const shirt = new THREE.Mesh(BOX(0.26, 0.4, 0.05), mats.shirt);
    shirt.position.set(0, 1.28, 0.36);
    const tie = new THREE.Mesh(BOX(0.08, 0.36, 0.04), mats.tie);
    tie.position.set(0, 1.2, 0.41);
    torso.pivot.add(shirt, tie);
    torso.meshes.push(shirt, tie);
  }

  inner.scale.setScalar(def.scale);
  return { inner, parts, head, headMat, arms: swings.arm, legs: swings.leg };
}

// Children of a part, so severing an upper arm takes the forearm (and anything it holds) with it.
export function descendants(parts, key, out = []) {
  for (const p of parts.values()) {
    if (p.desc.parent === key) {
      out.push(p);
      descendants(parts, p.key, out);
    }
  }
  return out;
}

// ---------------------------------------------------------------- hit tests

const A = new THREE.Vector3();
const B = new THREE.Vector3();
const AB = new THREE.Vector3();
const AO = new THREE.Vector3();

// Ray vs capsule (segment a-b with radius r). Returns distance along `d`, or null.
export function rayCapsule(o, d, a, b, r) {
  AB.subVectors(b, a);
  AO.subVectors(o, a);
  const abab = AB.dot(AB);
  if (abab < 1e-8) {
    // Degenerate capsule: plain sphere.
    const bq = AO.dot(d);
    const c = AO.dot(AO) - r * r;
    const h = bq * bq - c;
    if (h < 0) return null;
    const t0 = -bq - Math.sqrt(h);
    if (t0 >= 0) return t0;
    const t1 = -bq + Math.sqrt(h);
    return t1 >= 0 ? 0 : null;
  }
  // Origin already inside the capsule (point blank): hit at zero distance.
  const u = Math.max(0, Math.min(1, AO.dot(AB) / abab));
  const cx = AO.x - AB.x * u;
  const cy = AO.y - AB.y * u;
  const cz = AO.z - AB.z * u;
  if (cx * cx + cy * cy + cz * cz < r * r) return 0;
  const abd = AB.dot(d);
  const abao = AB.dot(AO);
  const qa = abab - abd * abd;
  const qb = abab * AO.dot(d) - abd * abao;
  const qc = abab * AO.dot(AO) - abao * abao - r * r * abab;
  if (Math.abs(qa) > 1e-8) {
    const h = qb * qb - qa * qc;
    if (h >= 0) {
      const t = (-qb - Math.sqrt(h)) / qa;
      const y = abao + t * abd; // position along the segment
      if (t >= 0 && y >= 0 && y <= abab) return t;
    }
  }
  // Otherwise it may still clip one of the rounded ends.
  let best = null;
  for (let i = 0; i < 2; i++) {
    const c = i === 0 ? a : b;
    AO.subVectors(o, c);
    const bq = AO.dot(d);
    const cc = AO.dot(AO) - r * r;
    const h = bq * bq - cc;
    if (h < 0) continue;
    let t = -bq - Math.sqrt(h);
    if (t < 0) t = -bq + Math.sqrt(h);
    if (t >= 0 && (best === null || t < best)) best = t;
  }
  return best;
}

// Nearest shootable part hit by the ray, in world space.
export function hitPart(e, o, d, maxT) {
  let best = null;
  const s = e.def.scale;
  for (const part of e.parts.values()) {
    const hit = part.desc.hit;
    if (!hit || part.severed || part.gone) continue;
    A.set(hit.a[0], hit.a[1], hit.a[2]).applyMatrix4(part.pivot.matrixWorld);
    B.set(hit.b[0], hit.b[1], hit.b[2]).applyMatrix4(part.pivot.matrixWorld);
    const t = rayCapsule(o, d, A, B, hit.r * s);
    if (t !== null && t < maxT && (best === null || t < best.t)) best = { t, part };
  }
  return best;
}
