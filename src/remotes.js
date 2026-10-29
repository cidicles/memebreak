import * as THREE from 'three';
import { buildWeaponModel, WEAPON_ORDER } from './weapons.js';

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function labelTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px Bahnschrift, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(text, 128, 32);
  g.fillStyle = color;
  g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speakerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(32, 32, 7, 0, Math.PI * 2);
  g.fill();
  for (const r of [16, 25]) {
    g.beginPath();
    g.arc(32, 32, r, -0.7, 0.7);
    g.stroke();
    g.beginPath();
    g.arc(32, 32, r, Math.PI - 0.7, Math.PI + 0.7);
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}

let speakerTex;

// A teammate's avatar: interpolated toward the latest network state.
export class RemotePlayer {
  constructor(scene, info, textures) {
    this.scene = scene;
    this.id = info.id;
    this.name = info.name;
    this.color = info.color;
    this.local = false;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.yaw = 0;
    this.targetYaw = 0;
    this.pitch = 0;
    this.hp = 100;
    this.down = false;
    this.moving = false;
    this.owned = 1;
    this.weapon = null;
    this.hasState = false;
    this.anim = 0;
    this.flashT = 0;
    this.shownDown = null;
    this.build(textures);
  }

  build(textures) {
    const g = (this.group = new THREE.Group());
    this.inner = new THREE.Group(); // yaw
    this.body = new THREE.Group(); // tilt when downed
    g.add(this.inner);
    this.inner.add(this.body);
    const suit = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.6, emissive: this.color, emissiveIntensity: 0.15 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.7 });
    const visor = new THREE.MeshBasicMaterial({ color: 0xc8f6ff });
    this.materials = [suit, dark, visor];
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      this.body.add(m);
      return m;
    };
    add(new THREE.CapsuleGeometry(0.27, 0.45, 4, 12), suit, 0, 1.08, 0);
    add(new THREE.SphereGeometry(0.2, 14, 10), dark, 0, 1.62, 0);
    add(new THREE.BoxGeometry(0.26, 0.08, 0.1), visor, 0, 1.64, 0.15);
    add(new THREE.BoxGeometry(0.34, 0.42, 0.18), dark, 0, 1.12, -0.26);
    this.legs = [-1, 1].map((sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.13, 0.66, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.64, 0.17), dark);
      leg.position.y = -0.32;
      pivot.add(leg);
      this.body.add(pivot);
      return pivot;
    });
    this.aim = new THREE.Group();
    this.aim.position.set(0, 1.34, 0.08);
    this.body.add(this.aim);
    this.gunHolder = new THREE.Group();
    this.gunHolder.position.set(0.2, -0.08, 0.2);
    this.aim.add(this.gunHolder);

    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: textures.flare, color: 0xffc36b, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.flash.scale.setScalar(0.5);
    this.flash.visible = false;
    this.setWeapon('pistol');

    // Fixed on-screen size (sizeAttenuation off) and drawn through walls, so you can always find your squad.
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true, fog: false, sizeAttenuation: false }));
    this.tag.scale.set(0.2, 0.05, 1);
    this.tag.position.y = 2.15;
    this.tag.renderOrder = 10;
    g.add(this.tag);
    this.refreshTag();

    speakerTex ??= speakerTexture();
    this.speaker = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: speakerTex, color: this.color, depthTest: false, transparent: true, fog: false, sizeAttenuation: false }),
    );
    this.speaker.scale.setScalar(0.04);
    this.speaker.position.y = 2.5;
    this.speaker.renderOrder = 10;
    this.speaker.visible = false;
    g.add(this.speaker);

    this.ring = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: textures.ring, color: 0xff3b3b, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.ring.position.y = 0.04;
    this.ring.visible = false;
    g.add(this.ring);

    g.visible = false;
    this.scene.add(g);
  }

  refreshTag() {
    const down = this.down;
    if (this.shownDown === down) return;
    this.shownDown = down;
    this.tag.material.map?.dispose();
    this.tag.material.map = labelTexture(down ? `${this.name} - DOWN` : this.name, down ? '#ff5a5a' : this.color);
    this.tag.material.needsUpdate = true;
  }

  setWeapon(id) {
    if (id === this.weapon) return;
    if (this.gun) this.gunHolder.remove(this.gun);
    this.weapon = id;
    this.gun = buildWeaponModel(id);
    this.gun.scale.setScalar(1.3);
    this.gun.rotation.y = Math.PI;
    this.gun.add(this.flash);
    this.flash.position.copy(this.gun.userData.muzzle);
    this.gunHolder.add(this.gun);
  }

  resetAt(x, z) {
    this.pos.set(x, 0, z);
    this.target.copy(this.pos);
    this.hasState = false;
    this.down = false;
    this.hp = 100;
    this.group.visible = false;
  }

  applyState(s) {
    this.target.set(s.x, 0, s.z);
    this.targetYaw = s.y;
    this.pitch = s.pi;
    this.hp = s.hp;
    this.down = !!s.dn;
    this.moving = !!s.mv;
    this.owned = s.ow;
    this.setWeapon(WEAPON_ORDER[s.w] ?? 'pistol');
    if (!this.hasState) {
      this.pos.copy(this.target);
      this.yaw = this.targetYaw;
      this.hasState = true;
    }
    this.group.visible = true;
  }

  muzzleWorld(out) {
    this.group.updateMatrixWorld(true);
    return this.gun.localToWorld(out.copy(this.gun.userData.muzzle));
  }

  update(dt, speaking) {
    if (!this.hasState) return;
    const k = 1 - Math.exp(-dt * 14);
    const px = this.pos.x;
    const pz = this.pos.z;
    if (this.pos.distanceToSquared(this.target) > 36) this.pos.copy(this.target);
    else this.pos.lerp(this.target, k);
    if (dt > 0) {
      this.vel.x += ((this.pos.x - px) / dt - this.vel.x) * 0.3;
      this.vel.z += ((this.pos.z - pz) / dt - this.vel.z) * 0.3;
    }
    this.yaw = lerpAngle(this.yaw, this.targetYaw, k);

    this.group.position.copy(this.pos);
    this.inner.rotation.y = this.yaw + Math.PI;
    this.aim.rotation.x = -this.pitch;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.anim += dt * speed * 1.4;
    const swing = Math.sin(this.anim) * Math.min(1, speed / 4) * 0.6;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    const tilt = this.down ? -1.35 : 0;
    this.body.rotation.x += (tilt - this.body.rotation.x) * Math.min(1, dt * 8);
    this.body.position.y = this.down ? 0.25 : Math.abs(Math.sin(this.anim)) * 0.04;

    this.refreshTag();
    this.tag.position.y = this.down ? 0.9 : 2.15;
    this.speaker.visible = speaking;
    this.speaker.position.y = this.tag.position.y + 0.35;
    this.ring.visible = this.down;
    if (this.down) this.ring.material.opacity = 0.5 + Math.sin(performance.now() / 150) * 0.3;
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
  }

  dispose() {
    this.scene.remove(this.group);
    this.tag.material.map?.dispose();
    this.group.traverse((o) => o.geometry?.dispose());
    for (const m of this.materials) m.dispose();
  }
}
