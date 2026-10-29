import * as THREE from 'three';
import { EYE_H, MAX_HP, PLAYER_R, PLAYER_SPEED, SPRINT_MULT } from './config.js';

export class Player {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3(); // knockback impulse (BONK), decays on its own
    this.local = true;
    this.eye = EYE_H;
    this.reset(0, 0, 0);
  }

  reset(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.knock.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.eye = EYE_H;
    this.hp = MAX_HP;
    this.down = false;
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.recoil = 0;
    this.shake = 0;
    this.moving = false;
    this.sprinting = false;
    this.stepped = false;
  }

  kick(amount) {
    this.recoil += amount;
    this.pitch = Math.min(1.5, this.pitch + amount * 0.15);
  }

  update(dt, input, level) {
    this.yaw -= input.dx * input.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - input.dy * input.sensitivity, -1.5, 1.5);

    let f = 0;
    let s = 0;
    if (!this.down) {
      if (input.down('KeyW') || input.down('ArrowUp')) f += 1;
      if (input.down('KeyS') || input.down('ArrowDown')) f -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) s += 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) s -= 1;
    }
    const sprint = (input.down('ShiftLeft') || input.down('ShiftRight')) && f > 0;
    const speed = PLAYER_SPEED * (sprint ? SPRINT_MULT : 1);

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * f + cos * s;
    let wz = -cos * f - sin * s;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx = (wx / len) * speed;
      wz = (wz / len) * speed;
    }
    const k = 1 - Math.exp(-dt * 14);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;
    level.moveCircle(this.pos, (this.vel.x + this.knock.x) * dt, (this.vel.z + this.knock.z) * dt, PLAYER_R);
    this.knock.multiplyScalar(Math.exp(-dt * 5));

    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.moving = hs > 0.6;
    this.sprinting = sprint && this.moving;
    const prev = this.bobPhase;
    this.bobPhase += dt * hs * 1.3;
    if (this.moving && Math.floor(prev / Math.PI) !== Math.floor(this.bobPhase / Math.PI)) this.stepped = true;
    this.bobAmt += ((this.moving ? 1 : 0) - this.bobAmt) * Math.min(1, dt * 8);
    this.recoil *= Math.exp(-dt * 12);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.eye += ((this.down ? 0.45 : EYE_H) - this.eye) * Math.min(1, dt * 6);
  }

  applyCamera(cam) {
    const sh = this.shake * this.shake * 0.12;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.07 * this.bobAmt;
    cam.position.set(
      this.pos.x + (Math.random() - 0.5) * sh,
      this.eye + bobY + (Math.random() - 0.5) * sh,
      this.pos.z + (Math.random() - 0.5) * sh,
    );
    const roll = this.down ? 0.25 : Math.sin(this.bobPhase) * 0.006 * this.bobAmt;
    cam.rotation.set(this.pitch + this.recoil, this.yaw, roll);
  }
}
