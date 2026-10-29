import { Net } from './net.js';
import { Voice } from './voice.js';
import { RemotePlayer } from './remotes.js';
import { WEAPON_ORDER } from './weapons.js';

const r2 = (v) => Math.round(v * 100) / 100;

// Co-op session. The host's browser runs the enemies and arbitrates pickups; everyone owns
// their own player (movement, health, hitscan). Game messages carry the level "generation"
// so stragglers from a previous maze are ignored.
//
// Messages (d.t):
//   p      player state, everyone -> everyone, 20 Hz
//   shot   shot fx (tracers/sound) for teammates
//   hit    client -> host: I hit enemy #id for dmg
//   snap   host -> all: changed enemies, 15 Hz (full every second)
//   kill   host -> all: enemy died (+ credit, + optional drop)
//   proj   host -> all: enemy projectile spawned (each client tests it against itself)
//   dmg    host -> one: melee damage
//   take / taken   pickup request (client -> host) / grant (host -> all)
//   revive teammate -> downed player
//   exit   client -> host: I reached the exit
//   win / wipe     host -> all: level over
//   rtc    WebRTC voice signalling
export class Coop {
  constructor(game) {
    this.game = game;
    this.net = new Net();
    this.voice = new Voice(this.net, game.sound);
    this.remotes = new Map();
    this.sendT = 0;
    this.snapT = 0;
    this.fullT = 0;
    this.dropN = 0;
    const n = this.net;
    n.on('room', (room) => this.onRoom(room));
    n.on('msg', (from, d) => this.onMsg(from, d));
    n.on('start', (m) => game.beginCoopLevel(m));
    n.on('lobby', () => game.showLobby());
    n.on('left', (m) => this.onLeft(m.id));
    n.on('host', (id) => this.onHostChange(id));
    n.on('error', (m) => game.coopStatus(m.msg, true));
    n.on('disconnect', () => this.onDisconnect());
  }

  get active() {
    return this.net.inRoom;
  }

  get isHost() {
    return this.net.isHost;
  }

  get id() {
    return this.net.id;
  }

  get room() {
    return this.net.room;
  }

  nameOf(id) {
    if (id === this.id) return 'You';
    return this.remotes.get(id)?.name ?? 'Someone';
  }

  async enter(action, name, code) {
    this.game.sound.init();
    await this.net.connect();
    this.voice.iceServers = this.net.iceServers;
    await this.voice.initMic();
    if (action === 'create') this.net.create(name);
    else this.net.join(code, name);
  }

  leave() {
    this.net.leave();
    this.cleanup();
  }

  cleanup() {
    this.voice.closeAll();
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
  }

  onRoom(room) {
    if (!room) return;
    const ids = room.players.map((p) => p.id);
    for (const [id, r] of this.remotes) {
      if (!ids.includes(id)) {
        r.dispose();
        this.remotes.delete(id);
      }
    }
    for (const p of room.players) {
      if (p.id !== this.id && !this.remotes.has(p.id)) {
        this.remotes.set(p.id, new RemotePlayer(this.game.scene, p, this.game.textures));
      }
    }
    this.voice.syncPeers(ids.filter((id) => id !== this.id));
    this.game.onRoomUpdate(room);
  }

  onLeft(id) {
    const r = this.remotes.get(id);
    if (r) this.game.hud.toast(`${r.name} LEFT`, '#8d877c');
    this.voice.closePeer(id);
  }

  onHostChange(id) {
    if (id === this.id) {
      this.game.enemies.simulate = true;
      // We never received per-part health; scale what is left by the enemy's overall health so
      // a badly chewed limb stays chewed instead of healing on migration.
      for (const e of this.game.enemies.list) {
        if (!e.alive) continue;
        const frac = Math.max(0.15, e.hp / e.maxHp);
        for (const p of e.parts.values()) if (!p.severed && p.maxHp) p.hp = Math.max(1, p.maxHp * frac);
      }
      this.game.hud.toast('YOU ARE NOW THE HOST', '#ff7a3d');
    } else {
      this.game.hud.toast(`${this.nameOf(id).toUpperCase()} IS NOW THE HOST`, '#8d877c');
    }
  }

  onDisconnect() {
    this.cleanup();
    this.game.onDisconnected();
  }

  // ---- host commands
  start(seed, level, retry = false) {
    this.net.send({ t: 'start', seed, level, retry });
  }

  toLobby() {
    this.net.send({ t: 'lobby' });
  }

  // ---- outgoing
  broadcast(d) {
    d.g = this.game.gen;
    this.net.relay(d);
  }

  sendTo(id, d) {
    d.g = this.game.gen;
    this.net.relay(d, id);
  }

  sendToHost(d) {
    this.sendTo(this.room.hostId, d);
  }

  sendState() {
    const p = this.game.player;
    const a = this.game.arsenal;
    let ow = 0;
    WEAPON_ORDER.forEach((id, i) => {
      if (a.owned.has(id)) ow |= 1 << i;
    });
    this.broadcast({
      t: 'p',
      x: r2(p.pos.x),
      z: r2(p.pos.z),
      y: r2(p.yaw),
      pi: r2(p.pitch),
      hp: Math.max(0, Math.ceil(p.hp)),
      dn: p.down ? 1 : 0,
      mv: p.moving ? 1 : 0,
      w: WEAPON_ORDER.indexOf(a.current),
      ow,
    });
  }

  nextDropId() {
    return `d${this.id}_${this.dropN++}`;
  }

  update(dt) {
    for (const r of this.remotes.values()) r.update(dt, this.voice.speaking(r.id));
    this.voice.update(this.game);
    const g = this.game;
    if (!g.inCoopLevel || (g.state !== 'playing' && g.state !== 'paused')) return;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.05;
      this.sendState();
    }
    if (this.isHost) {
      this.snapT -= dt;
      this.fullT -= dt;
      if (this.snapT <= 0) {
        this.snapT = 1 / 15;
        const full = this.fullT <= 0;
        if (full) this.fullT = 1;
        const e = g.enemies.snapshot(full);
        if (e.length) this.broadcast({ t: 'snap', e });
      }
    }
  }

  // ---- incoming
  onMsg(from, d) {
    if (d.t === 'rtc') {
      this.voice.onSignal(from, d);
      return;
    }
    const g = this.game;
    if (!g.inCoopLevel || d.g !== g.gen) return;
    const r = this.remotes.get(from);
    const enemies = g.enemies;
    switch (d.t) {
      case 'p': {
        if (!r) break;
        const wasDown = r.hasState && r.down;
        r.applyState(d);
        if (!wasDown && r.down) g.onTeammateDown(r);
        break;
      }
      case 'f':
        g.payRespects(from);
        break;
      case 'shot':
        if (r) g.remoteShot(r, d);
        break;
      case 'hit': {
        const e = enemies.list[d.id];
        if (this.isHost && e?.alive) enemies.damage(e, d.dmg, { x: d.dx, z: d.dz }, from, e.partList[d.pt] ?? null);
        break;
      }
      case 'snap':
        if (!this.isHost) enemies.applySnapshot(d.e);
        break;
      case 'kill': {
        const e = enemies.list[d.id];
        if (!e) break;
        if (d.mask && d.mask !== e.limbMask) {
          e.limbMask = d.mask;
          for (const p of e.partList) if (d.mask & (1 << p.index) && !p.severed) enemies.severVisual(e, p, null);
          enemies.recalcBody(e);
        }
        if (e.alive) {
          enemies.kill(e);
          g.enemyDied(e, d.by, d.drop);
        }
        break;
      }
      case 'proj':
        if (!this.isHost) {
          enemies.spawnProjectile(d.o, d.v, d.dmg, d.k);
          g.sfx('enemyShoot', { x: d.o[0], z: d.o[2] }, 0.9);
        }
        break;
      case 'dmg':
        g.playerHit(d.dmg, { x: d.x, z: d.z }, d.kb ?? 0);
        break;
      case 'take': {
        const item = g.pickups.get(d.id);
        if (this.isHost && item) {
          g.pickups.remove(d.id);
          this.broadcast({ t: 'taken', id: d.id, by: from, type: item.type });
        }
        break;
      }
      case 'taken':
        g.pickups.remove(d.id);
        if (d.by === this.id) g.applyPickup(d.type);
        break;
      case 'revive':
        g.revivedBy(from);
        break;
      case 'exit':
        if (this.isHost && g.state !== 'won') g.coopWin(from);
        break;
      case 'win':
        if (g.state !== 'won') g.showWin(d.by);
        break;
      case 'wipe':
        if (g.state !== 'dead') g.showWipe();
        break;
    }
  }
}
