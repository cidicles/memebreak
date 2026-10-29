import * as THREE from 'three';
import { TILE, WALL_H, MAX_HP } from './config.js';
import { mulberry32, hashString, randomSeed } from './rng.js';
import { Level } from './level.js';
import { makeTextures } from './textures.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Arsenal, WEAPONS, WEAPON_ORDER } from './weapons.js';
import { EnemyManager } from './enemies.js';
import { Pickups } from './pickups.js';
import { Particles, Popups, Tracers } from './effects.js';
import { Gibs } from './gore.js';
import { BloodDecals } from './decals.js';
import { ENEMY_TYPES } from './enemies.js';
import { faceCanvas } from './memes.js';
import { Sound } from './audio.js';
import { Hud, escapeHtml } from './hud.js';
import { populate } from './spawner.js';
import { Coop } from './coop.js';

const params = new URLSearchParams(location.search);
const NO_LOCK = params.has('nolock'); // play without pointer lock (for automated testing)
const $ = (id) => document.getElementById(id);
const SCREENS = { menu: 'menu', coop: 'coop', lobby: 'lobby', paused: 'pause', dead: 'dead', won: 'won' };
const SPAWN_OFFSETS = [
  [-0.9, -0.9],
  [0.9, -0.9],
  [-0.9, 0.9],
  [0.9, 0.9],
];
const REVIVE_TIME = 2.5;
const r2 = (v) => Math.round(v * 100) / 100;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const UP_NORMAL = new THREE.Vector3(0, 1, 0);
const STREAKS = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'MULTI KILL', 5: 'MEGA KILL', 6: 'ULTRA KILL' };
const WEAPON_KEYS = Object.entries(WEAPONS).map(([id, w]) => [id, `Digit${w.slot}`]);

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {}
  return null;
}

class Game {
  constructor() {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.35;
    r.autoClear = false;
    r.info.autoReset = false; // we render twice a frame; reset once so the stats cover both passes
    $('app').appendChild(r.domElement);
    this.canvas = r.domElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040507);
    this.scene.fog = new THREE.FogExp2(0x040507, 0.042);
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 150);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0x8391b0, 0x2a2018, 0.55));

    const flashlight = new THREE.SpotLight(0xfff0d8, 28, 45, 0.55, 0.6, 1.5);
    flashlight.position.set(0.15, -0.15, 0.1);
    flashlight.target.position.set(0, 0, -5);
    this.camera.add(flashlight, flashlight.target);
    this.muzzleLight = new THREE.PointLight(0xffb45a, 0, 14, 1.8);
    this.muzzleLight.position.set(0.2, -0.1, -0.9);
    this.camera.add(this.muzzleLight);

    // The viewmodel lives in its own scene so it never clips into walls.
    this.weaponScene = new THREE.Scene();
    this.weaponCamera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.01, 10);
    this.weaponScene.add(this.weaponCamera);
    this.weaponScene.add(new THREE.HemisphereLight(0xbfc8e0, 0x2a2420, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(-1, 2, 1);
    this.weaponScene.add(key);
    this.weaponMuzzleLight = new THREE.PointLight(0xffb45a, 0, 3, 1);
    this.weaponMuzzleLight.position.set(0.2, -0.05, -0.8);
    this.weaponScene.add(this.weaponMuzzleLight);

    this.textures = makeTextures(r);
    this.input = new Input();
    this.sound = new Sound();
    this.hud = new Hud();
    this.player = new Player();
    this.arsenal = new Arsenal(this.weaponCamera, this.textures);
    this.gore = new Particles(this.scene, this.textures.droplet, { max: 800, size: 0.13 });
    this.gore.onLand = (x, z, r, g2, b) => {
      if (Math.random() < 0.18 && !this.level?.isWallAt(x, z)) {
        this.decals.add(this.v.decal.set(x, 0.02, z), UP_NORMAL, this.v.col.setRGB(r, g2, b).getHex(), 0.34);
      }
    };
    this.sparks = new Particles(this.scene, this.textures.flare, { max: 400, additive: true, size: 0.12 });
    // Drips are frequent and low value; keeping them separate stops them evicting impact sprays.
    this.drips = new Particles(this.scene, this.textures.droplet, { max: 260, size: 0.11 });
    this.drips.onLand = (x, z, r, g2, b) => {
      if (Math.random() < 0.18 && !this.level?.isWallAt(x, z)) {
        this.decals.add(this.v.decal.set(x, 0.02, z), UP_NORMAL, this.v.col.setRGB(r, g2, b).getHex(), 0.34);
      }
    };
    this.tracers = new Tracers(this.scene);
    this.popups = new Popups(this.scene);
    this.decals = new BloodDecals(this.scene);
    this.gibs = new Gibs(this.scene, null, {
      bleed: (pos, color) => this.bloodDrip(pos, color),
      land: (pos, normal, color, force) => this.bloodLand(pos, normal, color, force),
    });
    this.enemies = new EnemyManager(this.scene, this, this.textures);
    this.pickups = new Pickups(this.scene, this.textures);

    this.v = {
      fwd: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      p: new THREE.Vector3(),
      decal: new THREE.Vector3(), // decal helpers must not clobber v.p (the live hit point)
      col: new THREE.Color(),
      wallN: new THREE.Vector3(), // sprayWall needs its own normal; v.n belongs to the caller
      hitN: new THREE.Vector3(), // reused by hitscan so shooting allocates nothing
      chunkV: new THREE.Vector3(),
      n: new THREE.Vector3(),
      muzzle: new THREE.Vector3(),
    };
    this.coop = null;
    this.mode = 'solo'; // 'solo' | 'coop' - what the current level was started as
    this.gen = 0; // co-op level generation from the server
    this.level = null;
    this.levelNum = 1;
    this.kills = 0;
    this.killsBy = {};
    this.totalKills = 0;
    this.time = 0;
    this.revealTimer = 0;
    this.reviveT = 0;
    this.reviveTime = REVIVE_TIME;
    this.reviveTarget = null;
    this.exitSent = false;
    this.streak = 0;
    this.lastKillAt = 0;
    this.lastRespects = 0;
    this.lastFrame = performance.now();

    this.buildBestiary();
    this.bindUI();
    addEventListener('resize', () => this.resize());
    this.seed = (params.get('seed') || randomSeed()).toUpperCase();
    $('seed-input').value = this.seed;
    this.startLevel(); // the maze idles behind the menu
    this.setState('menu');
    if (params.has('room')) this.openCoop();
    else if (params.has('autostart')) {
      this.newRun(this.seed);
      this.play();
    }
    r.setAnimationLoop(() => this.frame());
    window.__game = this;
  }

  // ------------------------------------------------------------------ helpers

  get mp() {
    return this.mode === 'coop' && this.coop?.active ? this.coop : null;
  }

  get myId() {
    return this.mp ? this.coop.id : 'local';
  }

  get inCoopLevel() {
    return this.mode === 'coop' && ['playing', 'paused', 'dead', 'won'].includes(this.state);
  }

  get simulating() {
    return this.state === 'playing' || (this.mode === 'coop' && this.state === 'paused');
  }

  nameOf(id) {
    return this.mp ? this.coop.nameOf(id) : 'You';
  }

  targets() {
    const list = [this.player];
    if (this.mp) for (const r of this.coop.remotes.values()) if (r.hasState) list.push(r);
    return list;
  }

  fmtTime() {
    const s = Math.floor(this.time);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // ------------------------------------------------------------------ UI

  // Gore quality. Limbs always come off; this scales how much mess they make.
  setGore(level) {
    this.goreLevel = level;
    const q = { high: { chunks: 2, spray: 1, decals: 3, limbs: 26 }, medium: { chunks: 1, spray: 0.6, decals: 2, limbs: 14 }, low: { chunks: 0, spray: 0.35, decals: 0, limbs: 6 } };
    this.gq = q[level] ?? q.high;
    this.gibs.maxLimbs = this.gq.limbs;
    this.gibs.trimLimbs();
    this.decals.perFrame = this.gq.decals;
  }

  buildBestiary() {
    $('bestiary').innerHTML = Object.entries(ENEMY_TYPES)
      .map(
        ([type, d]) =>
          `<div class="beast"><img alt="${d.name}" src="${faceCanvas(type).toDataURL()}" />` +
          `<b>${d.name}</b><span>${escapeHtml(d.blurb)}</span></div>`,
      )
      .join('');
  }

  bindUI() {
    this.setGore(store('memebreak.gore') ?? 'high');
    $('gore-input').value = this.goreLevel;
    $('gore-input').onchange = (e) => {
      this.setGore(e.target.value);
      store('memebreak.gore', e.target.value);
    };
    this.sound.voiceOn = store('memebreak.voice') !== '0';
    $('voice-input').checked = this.sound.voiceOn;
    $('voice-input').onchange = (e) => {
      this.sound.voiceOn = e.target.checked;
      store('memebreak.voice', e.target.checked ? '1' : '0');
    };
    const sens = parseFloat(store('memebreak.sens')) || 1;
    $('sens-input').value = sens;
    this.input.sensitivity = 0.0022 * sens;
    $('sens-input').oninput = (e) => {
      this.input.sensitivity = 0.0022 * e.target.value;
      store('memebreak.sens', e.target.value);
    };
    $('btn-random').onclick = () => ($('seed-input').value = randomSeed());
    $('btn-start').onclick = () => {
      this.newRun(($('seed-input').value.trim() || randomSeed()).toUpperCase());
      this.play();
    };
    $('btn-resume').onclick = () => this.play();
    $('btn-quit').onclick = () => this.setState('menu');
    $('btn-retry').onclick = () => {
      if (this.mp) this.coop.start(this.seed, this.levelNum, true);
      else {
        this.retryLevel();
        this.play();
      }
    };
    $('btn-new').onclick = () => {
      this.newRun(randomSeed());
      this.play();
    };
    $('btn-next').onclick = () => {
      if (this.mp) this.coop.start(this.seed, this.levelNum + 1);
      else {
        this.levelNum++;
        this.startLevel();
        this.play();
      }
    };
    $('btn-menu').onclick = () => {
      $('seed-input').value = randomSeed();
      this.setState('menu');
    };

    // Co-op
    $('btn-coop').onclick = () => this.openCoop();
    $('btn-coop-back').onclick = () => this.setState('menu');
    $('btn-create').onclick = () => this.coopEnter('create');
    $('btn-join').onclick = () => this.coopEnter('join');
    // Not `onkeydown = e => cond && ...`: an on-handler returning false cancels the keystroke.
    $('code-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.coopEnter('join');
    });
    $('btn-lobby-start').onclick = () => {
      this.sound.init();
      this.coop.start(($('lobby-seed').value.trim() || randomSeed()).toUpperCase(), 1);
    };
    $('btn-to-lobby').onclick = () => this.coop?.toLobby();
    for (const b of document.querySelectorAll('.btn-leave')) b.onclick = () => this.leaveCoop();
    $('ptt-input').onchange = (e) => this.coop?.voice.setPtt(e.target.checked);
    $('lobby-code').onclick = async () => {
      const url = `${location.origin}${location.pathname}?room=${this.coop.room.code}`;
      try {
        await navigator.clipboard.writeText(url);
        $('invite-status').textContent = 'Invite link copied!';
      } catch {
        $('invite-status').textContent = url;
      }
    };

    document.addEventListener('pointerlockchange', () => {
      if (!this.locked() && this.state === 'playing') this.setState('paused');
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.state === 'playing') this.setState('paused', 'READY?');
    });
  }

  locked() {
    return document.pointerLockElement === this.canvas;
  }

  play() {
    this.sound.init();
    this.setState('playing');
    this.lastFrame = performance.now();
    if (NO_LOCK) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => this.state === 'playing' && this.setState('paused', 'READY?'));
    } catch {
      this.setState('paused', 'READY?');
    }
  }

  setState(s, title) {
    this.state = s;
    for (const id of Object.values(SCREENS)) $(id).classList.toggle('hidden', id !== SCREENS[s]);
    this.hud.show(s === 'playing' || s === 'paused');
    this.input.enabled = s === 'playing';
    this.canvas.style.filter = s === 'dead' ? 'grayscale(1) contrast(1.2) brightness(0.8)' : ''; // WASTED
    if (s !== 'playing' && this.locked()) document.exitPointerLock();
    if (s === 'paused') {
      $('pause-title').textContent = title ?? 'PAUSED';
      $('pause-seed').textContent = `Seed ${this.seed} · Level ${this.levelNum}`;
    }
    this.updateMode();
  }

  updateMode() {
    document.body.dataset.mode = this.coop?.active ? (this.coop.isHost ? 'host' : 'client') : 'solo';
  }

  // ------------------------------------------------------------------ co-op lobby

  openCoop() {
    this.coop ??= new Coop(this);
    $('name-input').value = store('memebreak.name') ?? '';
    if (params.get('room')) $('code-input').value = params.get('room').toUpperCase();
    $('ptt-input').checked = this.coop.voice.ptt;
    this.coopStatus('');
    this.setState('coop');
  }

  coopStatus(msg, error = false) {
    const el = $('coop-status');
    el.textContent = msg;
    el.classList.toggle('err', error);
    if (error && this.state === 'lobby') this.hud.toast(msg, '#ff3b3b');
  }

  async coopEnter(action) {
    const name = $('name-input').value.trim() || `Player${Math.floor(Math.random() * 90 + 10)}`;
    store('memebreak.name', name);
    const code = $('code-input').value.trim().toUpperCase();
    if (action === 'join' && !/^[A-Z]{4}$/.test(code)) return this.coopStatus('Enter the 4-letter room code', true);
    this.coopStatus('Connecting… (allow microphone access for voice)');
    try {
      await this.coop.enter(action, name, code);
    } catch (e) {
      this.coopStatus(e.message, true);
    }
  }

  onRoomUpdate(room) {
    this.updateMode();
    if (this.state === 'coop' || this.state === 'lobby') {
      if (this.state === 'coop') {
        $('lobby-seed').value = randomSeed();
        $('invite-status').textContent = 'Click the code to copy an invite link';
      }
      this.renderLobby(room);
      if (this.state !== 'lobby') this.setState('lobby');
    }
  }

  renderLobby(room = this.coop?.room) {
    if (!room) return;
    $('lobby-code').textContent = room.code;
    const rows = room.players.map((p) => {
      const tags = [p.id === room.hostId ? 'HOST' : '', p.id === this.coop.id ? 'YOU' : ''].filter(Boolean).join(' · ');
      return (
        `<div class="lp"><i style="background:${p.color}"></i>` +
        `<span>${escapeHtml(p.name)}<span class="tagline">${tags}</span></span>` +
        `<div class="meter"><div data-id="${p.id}"></div></div></div>`
      );
    });
    for (let i = room.players.length; i < 4; i++) rows.push('<div class="lp empty"><i></i><span>Open slot</span><span></span></div>');
    $('lobby-players').innerHTML = rows.join('');
    const v = this.coop.voice;
    $('ptt-input').checked = v.ptt;
    $('mic-status').textContent = v.micError ?? (v.ptt ? 'Hold V to talk' : 'Open mic: you are always transmitting');
    $('mic-status').classList.toggle('err', !!v.micError);
  }

  updateLobbyMeters() {
    const v = this.coop?.voice;
    if (!v) return;
    for (const el of document.querySelectorAll('#lobby-players .meter div')) {
      el.style.width = `${Math.min(100, v.level(el.dataset.id) * 600)}%`;
    }
    if (!v.micError) $('mic-status').textContent = v.ptt ? (v.transmitting ? 'Transmitting…' : 'Hold V to talk') : 'Open mic: you are always transmitting';
  }

  showLobby() {
    this.setState('lobby');
    this.renderLobby();
  }

  leaveCoop() {
    this.coop?.leave();
    this.mode = 'solo';
    this.newRun(randomSeed());
    $('seed-input').value = this.seed;
    this.setState('menu');
  }

  onDisconnected() {
    const inCoop = this.mode === 'coop' || this.state === 'lobby' || this.state === 'coop';
    if (!inCoop) return;
    this.mode = 'solo';
    this.newRun(randomSeed());
    this.openCoop();
    this.coopStatus('Lost connection to the server', true);
  }

  beginCoopLevel({ gen, seed, level, retry, players }) {
    this.mode = 'coop';
    this.gen = gen;
    if (retry) this.arsenal.restore(this.snapshot);
    else if (level === 1) {
      this.arsenal.reset();
      this.totalKills = 0;
    }
    this.seed = seed;
    this.levelNum = level;
    this.startLevel(players);
    this.play();
  }

  // ------------------------------------------------------------------ levels

  newRun(seed) {
    this.seed = seed;
    this.levelNum = 1;
    this.totalKills = 0;
    this.mode = 'solo';
    this.arsenal.reset();
    try {
      history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}`);
    } catch {}
    this.startLevel();
  }

  startLevel(playerIds = [this.myId]) {
    if (this.level) this.level.dispose();
    this.gibs.clear(); // before enemies.clear(), which disposes materials the gibs borrow
    this.decals.clear();
    this.enemies.clear();
    this.pickups.clear();
    this.gore.clear();
    this.sparks.clear();
    this.drips.clear();
    this.tracers.clear();
    this.popups.clear();
    this.streak = 0;
    const n = playerIds.length;
    this.enemies.hpScale = 1 + 0.4 * (n - 1);
    this.enemies.simulate = !this.mp || this.coop.isHost;
    const rng = mulberry32(hashString(`${this.seed}/${this.levelNum}`));
    const cells = Math.min(9 + this.levelNum * 2, 29);
    this.level = new Level(this.scene, cells, rng, this.textures);
    this.gibs.setLevel(this.level);
    this.gibs.viewer = this.player.pos;
    const s = this.level.maze.start;
    const cx = (s.x + 0.5) * TILE;
    const cz = (s.y + 0.5) * TILE;
    const yaw = rng() * Math.PI * 2;
    const off = (id) => SPAWN_OFFSETS[Math.max(0, playerIds.indexOf(id)) % 4];
    const [ox, oz] = n > 1 ? off(this.myId) : [0, 0];
    this.player.reset(cx + ox, cz + oz, yaw);
    if (this.mp) {
      for (const r of this.coop.remotes.values()) {
        const [rx, rz] = off(r.id);
        r.resetAt(cx + rx, cz + rz);
      }
    }
    populate(this.level, rng, this.levelNum, this.enemies, this.pickups, n);
    this.snapshot = this.arsenal.snapshot();
    this.kills = 0;
    this.killsBy = {};
    this.time = 0;
    this.exitSent = false;
    this.reviveT = 0;
    this.reviveTarget = null;
    this.level.reveal(this.player.pos.x, this.player.pos.z);
    this.player.applyCamera(this.camera);
  }

  retryLevel() {
    this.arsenal.restore(this.snapshot);
    this.startLevel();
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h);
    for (const cam of [this.camera, this.weaponCamera]) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------------ loop

  frame() {
    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    if (this.simulating) {
      this.update(dt);
    } else if (this.state === 'menu' || this.state === 'coop' || this.state === 'lobby') {
      this.player.yaw += dt * 0.12;
      this.player.applyCamera(this.camera);
    }
    this.coop?.update(dt);
    if (this.state === 'lobby') this.updateLobbyMeters();
    this.level.animate(dt);
    if (this.state !== 'paused' || this.mode === 'coop') {
      this.gore.update(dt);
      this.sparks.update(dt);
      this.drips.update(dt);
      this.tracers.update(dt);
      this.popups.update(dt);
      this.gibs.update(dt);
      this.decals.update(dt);
    }
    this.render();
    this.input.endFrame();
  }

  update(dt) {
    const { input, player, arsenal, level } = this;
    const mp = this.mp;
    this.time += dt;

    if ((NO_LOCK && input.pressed('Escape')) || input.pressed('KeyP')) {
      this.setState('paused');
      if (!mp) return;
    }

    player.update(dt, input, level);
    player.applyCamera(this.camera);
    if (player.stepped) {
      player.stepped = false;
      this.sound.play('step', player.sprinting ? 0.35 : 0.22);
    }

    if (!player.down) {
      for (const [id, key] of WEAPON_KEYS) if (input.pressed(key)) arsenal.equip(id);
      if (input.wheel) arsenal.cycle(Math.sign(input.wheel));
      if (input.pressed('KeyR') && arsenal.reload()) this.sound.play('reload');
      const def = arsenal.def;
      const trigger = def.auto ? input.mouseDown : input.mousePressed;
      if (trigger && arsenal.ready()) {
        if (arsenal.mag[arsenal.current] > 0) {
          arsenal.fire();
          this.shoot(def);
          if (arsenal.mag[arsenal.current] === 0 && arsenal.reload()) this.sound.play('reload', 0.8);
        } else if (arsenal.reload()) {
          this.sound.play('reload');
        } else if (input.mousePressed) {
          this.sound.play('empty');
        }
      }
    }
    arsenal.root.visible = !player.down;
    arsenal.update(dt, player, input);

    this.enemies.update(dt, this.targets(), level);
    if (!this.simulating) return; // died this frame
    this.pickups.update(dt, player, (item) => this.tryCollect(item));

    this.revealTimer -= dt;
    if (this.revealTimer <= 0) {
      this.revealTimer = 0.15;
      level.reveal(player.pos.x, player.pos.z);
      // Shared map knowledge: whatever teammates can see shows up on your minimap too.
      if (mp) for (const r of this.coop.remotes.values()) if (r.hasState) level.reveal(r.pos.x, r.pos.z, 5);
    }

    const fade = Math.exp(-dt * 30);
    this.muzzleLight.intensity *= fade;
    this.weaponMuzzleLight.intensity *= fade;

    const ex = level.maze.exit;
    if (!player.down && Math.floor(player.pos.x / TILE) === ex.x && Math.floor(player.pos.z / TILE) === ex.y) {
      if (!mp) return this.showWin(this.myId);
      if (mp.isHost) return this.coopWin(this.myId);
      if (!this.exitSent) {
        this.exitSent = true;
        mp.sendToHost({ t: 'exit' });
      }
    }

    if (input.pressed('KeyF')) this.payRespects();

    if (mp) {
      this.updateRevive(dt);
      if (mp.isHost && this.targets().every((t) => t.down)) return this.coopWipe();
    }

    this.hud.update(dt, this);
  }

  updateRevive(dt) {
    const p = this.player;
    let target = null;
    if (!p.down) {
      for (const r of this.coop.remotes.values()) {
        if (r.hasState && r.down && Math.hypot(r.pos.x - p.pos.x, r.pos.z - p.pos.z) < 2.2) {
          target = r;
          break;
        }
      }
    }
    if (target && this.input.down('KeyE')) {
      this.reviveT += dt;
      if (this.reviveT >= REVIVE_TIME) {
        this.reviveT = 0;
        target.down = false;
        this.mp.sendTo(target.id, { t: 'revive' });
        this.hud.toast(`REVIVED ${target.name.toUpperCase()}`, '#4dff9a');
        this.sound.play('pickup');
      }
    } else {
      this.reviveT = 0;
    }
    this.reviveTarget = target;
  }

  // ------------------------------------------------------------------ combat

  shoot(def) {
    const { player, camera, v } = this;
    const mp = this.mp;
    this.sound.play(def.sound);
    const origin = camera.position;
    v.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    v.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    v.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    v.muzzle.copy(origin).addScaledVector(v.right, 0.2).addScaledVector(v.up, -0.16).addScaledVector(v.fwd, 0.7);
    let hitAny = false;
    let killed = false;
    let head = false;
    const ends = [];
    const spread = def.spread * (player.moving ? 1.4 : 1);
    for (let i = 0; i < def.pellets; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = spread * Math.sqrt(Math.random());
      const dir = v.dir.copy(v.fwd).addScaledVector(v.right, Math.cos(a) * r).addScaledVector(v.up, Math.sin(a) * r).normalize();
      const hit = this.hitscan(origin, dir, 100);
      const p = v.p.copy(origin).addScaledVector(dir, hit ? hit.t : 60);
      this.tracers.add(v.muzzle, p);
      if (!hit) continue;
      if (hit.enemy) {
        const e = hit.enemy;
        let dmg = def.dmg * (hit.head ? 2 : 1);
        if (def.falloff) dmg *= THREE.MathUtils.clamp(1.25 - hit.t / def.falloff, 0.25, 1);
        let k;
        if (!mp || mp.isHost) {
          k = this.enemies.damage(e, dmg, dir, this.myId, hit.part);
        } else {
          k = this.enemies.predictHit(e, dmg, hit.part);
          mp.sendToHost({ t: 'hit', id: e.id, dmg: r2(dmg), dx: r2(dir.x), dz: r2(dir.z), pt: hit.part.index });
        }
        killed = killed || k;
        hitAny = true;
        head = head || hit.head;
        this.bloodHit(p, e.def.blood, dir, hit.part);
        this.enemies.addWound(e, hit.part, p);
        ends.push([r2(p.x), r2(p.y), r2(p.z), 1, e.def.blood, e.id, hit.part.index]);
      } else {
        p.addScaledVector(hit.normal, 0.04);
        this.sparks.burst(p, 0xffc070, 6, 5, hit.normal, { gravity: 12, life: 0.3, spread: 0.7 });
        this.gore.burst(p, 0x6b6258, 5, 1.2, hit.normal, { gravity: 2, life: 0.6 });
        ends.push([r2(p.x), r2(p.y), r2(p.z), 0]);
      }
    }
    if (hitAny) {
      this.hud.hitmarker(killed, head);
      this.sound.play(killed ? 'kill' : head ? 'headshot' : 'hit');
      if (killed && head) this.hud.announce('HEADSHOT', true);
    }
    player.kick(def.kick);
    this.muzzleLight.intensity = 30;
    this.weaponMuzzleLight.intensity = 8;
    if (mp) mp.broadcast({ t: 'shot', w: this.arsenal.current, e: ends });
    if (!mp || mp.isHost) this.enemies.hearNoise(player.pos.x, player.pos.z, def.noise);
  }

  remoteShot(r, d) {
    const def = WEAPONS[d.w] ?? WEAPONS.pistol;
    const o = r.muzzleWorld(this.v.muzzle);
    r.flashT = 0.05;
    for (const [x, y, z, k, color, eid, pt] of d.e ?? []) {
      const end = this.v.p.set(x, y, z);
      this.tracers.add(o, end);
      if (k) {
        // use the part the shooter resolved rather than re-tracing against interpolated bodies
        const dir = this.v.dir.copy(end).sub(o).normalize();
        if (this.gibs.near(end, 34)) {
          // only spend gore on teammates' shots we could actually see
          const victim = this.enemies.list[eid];
          const part = victim?.partList?.[pt] ?? null;
          this.bloodHit(end, color ?? 0x7a0c0c, dir, part);
          if (victim && part) this.enemies.addWound(victim, part, end);
        }
      }
      else this.sparks.burst(end, 0xffc070, 4, 4, null, { gravity: 12, life: 0.25 });
    }
    this.sfx(def.sound, r.pos, 0.9);
    if (this.mp?.isHost) this.enemies.hearNoise(r.pos.x, r.pos.z, def.noise);
  }

  hitscan(o, d, maxT) {
    let best = maxT;
    let hit = null;
    const scratch = (this.hitScratch ??= { t: 0, normal: this.v.hitN });
    const w = this.level.raycast(o.x, o.z, d.x, d.z, best);
    if (w) {
      best = w.t;
      scratch.t = w.t;
      if (w.side === 0) scratch.normal.set(-Math.sign(d.x), 0, 0);
      else scratch.normal.set(0, 0, -Math.sign(d.z));
      hit = scratch;
    }
    const ty = d.y < -1e-4 ? -o.y / d.y : d.y > 1e-4 ? (WALL_H - o.y) / d.y : Infinity;
    if (ty < best) {
      best = ty;
      scratch.t = ty;
      scratch.normal.set(0, d.y < 0 ? 1 : -1, 0);
      hit = scratch;
    }
    return this.enemies.raycast(o, d, best) ?? hit;
  }

  meleeHit(target, dmg, from, knock = 0) {
    if (target.local) this.playerHit(dmg, from, knock);
    else this.mp?.sendTo(target.id, { t: 'dmg', dmg, x: r2(from.x), z: r2(from.z), kb: knock });
  }

  onProjectile(o, v, dmg, kind) {
    this.mp?.broadcast({ t: 'proj', o: o.map(r2), v: v.map(r2), dmg, k: kind });
  }

  playerHit(dmg, from, knock = 0) {
    if (!this.simulating) return;
    const p = this.player;
    if (p.down) return;
    p.hp -= dmg;
    p.shake = Math.min(1, p.shake + dmg / 25);
    if (knock) {
      // BONK: shove the player away from the hit
      const dx = p.pos.x - from.x;
      const dz = p.pos.z - from.z;
      const l = Math.hypot(dx, dz) || 1;
      p.knock.x += (dx / l) * knock;
      p.knock.z += (dz / l) * knock;
      if (knock >= 10) {
        this.hud.announce('BONK', true);
        this.sound.play('bonk');
      }
    }
    const rel = Math.atan2(from.x - p.pos.x, from.z - p.pos.z) - (p.yaw + Math.PI);
    this.hud.damage(dmg, rel);
    this.sound.play('hurt', Math.min(1, 0.5 + dmg / 30));
    if (p.hp > 0) return;
    if (this.mp) this.goDown();
    else this.die();
  }

  goDown() {
    const p = this.player;
    p.hp = 0;
    p.down = true;
    this.arsenal.reloadT = 0;
    this.sound.play('die', 0.6);
    this.coop.sendState();
  }

  revivedBy(from) {
    const p = this.player;
    if (!p.down) return;
    p.down = false;
    p.hp = 35;
    this.hud.toast(`REVIVED BY ${this.nameOf(from).toUpperCase()}`, '#4dff9a');
    this.sound.play('weapon');
    this.coop.sendState();
  }

  // Authoritative kill (solo / host).
  onEnemyKilled(e, by) {
    const drop = this.rollDrop(e, by);
    this.enemyDied(e, by, drop);
    this.mp?.broadcast({ t: 'kill', id: e.id, by, drop, mask: e.limbMask });
  }

  rollDrop(e, by) {
    if (Math.random() >= (e.type === 'brute' ? 1 : 0.28)) return null;
    let hp = this.player.hp;
    let owned = this.arsenal.owned;
    const r = this.mp?.remotes.get(by);
    if (r) {
      hp = r.hp;
      owned = new Set(WEAPON_ORDER.filter((_, i) => r.owned & (1 << i)));
    }
    const options = [];
    if (hp < MAX_HP * 0.6 || e.type === 'brute') options.push('health');
    if (owned.has('shotgun')) options.push('shells');
    if (owned.has('rifle')) options.push('bullets');
    if (!options.length) options.push('health');
    const type = options[Math.floor(Math.random() * options.length)];
    return { type, id: this.mp ? this.coop.nextDropId() : undefined };
  }

  enemyDied(e, by, drop) {
    this.kills++;
    this.killsBy[by] = (this.killsBy[by] ?? 0) + 1;
    const center = new THREE.Vector3(e.pos.x, 1.1 * e.def.scale, e.pos.z);
    this.gore.burst(center, e.def.blood, 30, 5, null, { life: 0.9 });
    this.popups.add(pick(e.def.deathLines), this.enemies.headPos(e), { size: 0.6, life: 1.4 });
    if (e.def.explode) {
      // FEELS goes pop: a burst of tears.
      this.sfx('explode', e.pos, 1.2);
      this.gore.burst(center, 0x4aa8ff, 70, 9, null, { life: 1.1, gravity: 7 });
      this.sparks.burst(center, 0xbfe4ff, 40, 12, null, { life: 0.5, gravity: 3 });
      const d = Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z);
      if (d < 10) this.player.shake = Math.min(1, this.player.shake + (10 - d) / 12);
    } else {
      this.sfx('enemyDie', e.pos, e.type === 'brute' ? 1.3 : 1);
    }
    if (drop) this.pickups.spawn(drop.type, e.pos.x, e.pos.z, drop.id);
    if (by === this.myId) this.countStreak();
  }

  countStreak() {
    const now = performance.now();
    this.streak = now - this.lastKillAt < 3000 ? this.streak + 1 : 1;
    this.lastKillAt = now;
    const text = this.streak >= 7 ? 'M-M-M-MONSTER KILL' : STREAKS[this.streak];
    if (!text) return;
    this.hud.announce(text);
    this.sound.play('airhorn');
    this.sound.say(this.streak >= 7 ? 'monster kill' : text.toLowerCase(), { pitch: 0.6, rate: 0.95, priority: true });
  }

  // Press F to pay respects. Works anywhere; teammates see it too.
  payRespects(from = null) {
    const now = performance.now();
    if (!from && now - this.lastRespects < 1000) return;
    let at;
    if (from) {
      const r = this.coop?.remotes.get(from);
      if (!r?.hasState) return;
      at = r.pos.clone().setY(2.6);
      this.hud.toast(`${r.name.toUpperCase()} PAID RESPECTS`, '#c8c8c8');
    } else {
      this.lastRespects = now;
      const fwd = this.v.fwd.set(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
      at = this.player.pos.clone().addScaledVector(fwd, 2.5).setY(1.8);
      this.mp?.broadcast({ t: 'f' });
    }
    this.popups.add('F', at, { size: 1.1, life: 2, rise: 0.4 });
    this.sound.play('respects', from ? 0.5 : 0.8);
  }

  onTeammateDown(r) {
    this.hud.toast(`${r.name.toUpperCase()} IS DOWN — PRESS F TO PAY RESPECTS`, '#ff5a5a');
  }

  // ------------------------------------------------------------------ pickups

  tryCollect(item) {
    const { type } = item;
    if (this.player.down) return false;
    // Weapons are per-player: everyone can grab their own copy.
    if (type === 'shotgun' || type === 'rifle') {
      this.applyPickup(type);
      return true;
    }
    if (type === 'health' && this.player.hp >= MAX_HP) return false;
    const mp = this.mp;
    if (!mp || mp.isHost) {
      this.applyPickup(type);
      mp?.broadcast({ t: 'taken', id: item.id, by: this.myId, type });
      return true;
    }
    if (performance.now() - item.pending > 1000) {
      item.pending = performance.now();
      mp.sendToHost({ t: 'take', id: item.id });
    }
    return false;
  }

  applyPickup(type) {
    const { player, arsenal, hud } = this;
    switch (type) {
      case 'health':
        player.hp = Math.min(MAX_HP, player.hp + 30);
        hud.toast('+30 HEALTH', '#4dff9a');
        break;
      case 'shells':
        arsenal.reserve.shells += 8;
        hud.toast('+8 SHELLS', '#ff8a3d');
        break;
      case 'bullets':
        arsenal.reserve.bullets += 30;
        hud.toast('+30 ROUNDS', '#ffd23d');
        break;
      case 'shotgun':
      case 'rifle': {
        const d = WEAPONS[type];
        const isNew = arsenal.give(type);
        hud.toast(isNew ? `${d.name} ACQUIRED  [${d.slot}]` : `+${d.mag} ${d.ammo.toUpperCase()}`, '#4dc3ff');
        this.sound.play(isNew ? 'weapon' : 'pickup');
        return;
      }
    }
    this.sound.play('pickup');
  }

  // A single bullet wound: spray, a couple of flesh chunks knocked loose, and a mist puff.
  bloodHit(point, color, dir, part) {
    const q = this.gq;
    const back = this.v.n.copy(dir).negate();
    this.gore.burst(point, color, Math.round(10 * q.spray), 4, back, { life: 0.8, gravity: 14 });
    this.sparks.burst(point, color, Math.round(4 * q.spray), 2.5, back, { life: 0.25, gravity: 6 });
    this.sprayWall(point, dir, color, 0.5);
    const chunks = q.chunks && Math.random() < 0.75 ? Math.ceil(Math.random() * q.chunks) : 0;
    for (let i = 0; i < chunks; i++) {
      this.v.chunkV.set(dir.x * 2 + (Math.random() - 0.5) * 4, 2 + Math.random() * 2.5, dir.z * 2 + (Math.random() - 0.5) * 4);
      this.gibs.addChunk(point, this.v.chunkV, color, part?.desc.role === 'head' ? 0.8 : 0.6);
    }
  }

  // Arterial spray: find the surface behind the victim and stain it.
  sprayWall(point, dir, color, size = 0.9, important = false) {
    if (!this.level || (dir.x === 0 && dir.z === 0)) return;
    const w = this.level.raycast(point.x, point.z, dir.x, dir.z, 7);
    if (!w || w.t < 0.1) return; // already inside a wall: no floating splat
    const y = point.y + dir.y * w.t;
    if (y < 0.05 || y > WALL_H - 0.05) return;
    const n = w.side === 0 ? this.v.wallN.set(-Math.sign(dir.x), 0, 0) : this.v.wallN.set(0, 0, -Math.sign(dir.z));
    this.decals.add(this.v.decal.set(point.x + dir.x * w.t, y, point.z + dir.z * w.t).addScaledVector(n, 0.03), n, color, size, important);
  }

  // A bigger burst when a limb comes off.
  bloodBurst(pos, color, kind = 'sever') {
    const big = kind === 'big';
    const q = this.gq;
    this.gore.burst(pos, color, Math.round((big ? 44 : 26) * q.spray), big ? 6 : 4.5, null, { life: 1.1, gravity: 16 });
    this.sparks.burst(pos, color, Math.round((big ? 14 : 8) * q.spray), 3, null, { life: 0.3 });
    this.decals.add(this.v.decal.set(pos.x, 0.02, pos.z), UP_NORMAL, color, big ? 1.1 : 0.8, true);
  }

  // Drips from an airborne limb or an open stump.
  bloodDrip(pos, color) {
    this.drips.burst(pos, color, 1, 0.6, null, { life: 1.2, gravity: 18 });
  }

  // Blood hitting something solid.
  bloodLand(pos, normal, color, force) {
    this.gore.burst(pos, color, Math.min(6, 2 + force), 1.2, null, { life: 0.5, gravity: 10 });
    // a limb smacking a wall marks that wall; landing on the floor marks the floor
    if (normal.y < 0.5) {
      // snap onto the tile face the gib bounced off, then lift it a hair
      this.v.decal.copy(pos);
      if (normal.x) this.v.decal.x = Math.round(pos.x / TILE) * TILE + normal.x * 0.02;
      if (normal.z) this.v.decal.z = Math.round(pos.z / TILE) * TILE + normal.z * 0.02;
      this.decals.add(this.v.decal, normal, color, 0.5 + Math.min(0.6, force * 0.12));
    } else {
      this.decals.add(this.v.decal.set(pos.x, 0.02, pos.z), UP_NORMAL, color, 0.4 + Math.min(0.4, force * 0.12));
    }
    if (force > 2 && performance.now() - (this.lastSplat ?? 0) > 120) {
      this.lastSplat = performance.now();
      this.sfx('splat', pos, 0.5);
    }
  }

  sfx(name, pos, vol = 1) {
    const p = this.player;
    const dx = pos.x - p.pos.x;
    const dz = pos.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    const pan = dist > 0.01 ? ((dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / dist) * 0.8 : 0;
    this.sound.play(name, vol / (1 + dist * 0.15), pan);
  }

  // ------------------------------------------------------------------ outcomes

  die() {
    this.player.hp = 0;
    this.sound.play('die');
    this.hud.update(0, this);
    $('dead-title').textContent = 'WASTED';
    $('dead-stats').innerHTML = `Level ${this.levelNum} · ${this.kills} kills · ${this.fmtTime()}<br>Seed ${this.seed}`;
    this.setState('dead');
  }

  coopWipe() {
    this.mp.broadcast({ t: 'wipe' });
    this.showWipe();
  }

  showWipe() {
    this.sound.play('die');
    $('dead-title').textContent = 'SQUAD WASTED';
    $('dead-stats').innerHTML = `Level ${this.levelNum} · ${this.fmtTime()}<br>${this.scoreboard()}<br>Seed ${escapeHtml(this.seed)}`;
    this.setState('dead');
  }

  coopWin(by) {
    this.mp.broadcast({ t: 'win', by });
    this.showWin(by);
  }

  showWin(by) {
    this.totalKills += this.kills;
    this.sound.play('win');
    this.sound.play('airhorn', 0.8);
    this.sound.say('G G E Z', { rate: 0.8, pitch: 0.8, priority: true });
    const who = this.mp ? `${escapeHtml(this.nameOf(by))} reached the exit.<br>` : '';
    const board = this.mp ? `${this.scoreboard()}<br>` : '';
    $('won-stats').innerHTML =
      `${who}Level ${this.levelNum} cleared in ${this.fmtTime()} · ${this.kills} / ${this.enemies.total} kills<br>${board}` +
      `Run total: ${this.totalKills} memes deleted · Seed ${escapeHtml(this.seed)}<br><br>The next maze is bigger. The memes are evolving.`;
    this.setState('won');
  }

  scoreboard() {
    if (!this.mp) return `${this.kills} kills`;
    const ids = [this.myId, ...this.coop.remotes.keys()];
    return ids.map((id) => `${escapeHtml(this.nameOf(id))}: ${this.killsBy[id] ?? 0}`).join(' · ');
  }

  render() {
    const r = this.renderer;
    r.info.reset();
    r.clear();
    r.render(this.scene, this.camera);
    if (this.state === 'playing' || this.state === 'paused') {
      r.clearDepth();
      r.render(this.weaponScene, this.weaponCamera);
    }
  }
}

new Game();
