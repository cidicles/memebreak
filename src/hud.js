import { TILE, MAX_HP } from './config.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { PICKUP_COLORS } from './pickups.js';

const $ = (id) => document.getElementById(id);
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class Hud {
  constructor() {
    this.el = $('hud');
    this.healthFill = $('health-fill');
    this.healthNum = $('health-num');
    this.weaponName = $('weapon-name');
    this.ammoMag = $('ammo-mag');
    this.ammoRes = $('ammo-reserve');
    this.slots = $('weapon-slots');
    this.levelEl = $('hud-level');
    this.killsEl = $('hud-kills');
    this.timeEl = $('hud-time');
    this.vignette = $('vignette');
    this.hitEl = $('hitmarker');
    this.dmgDir = $('dmg-dir');
    this.toasts = $('toasts');
    this.reloadHint = $('reload-hint');
    this.crosshair = $('crosshair');
    this.announceEl = $('announce');
    this.team = $('team');
    this.revive = $('revive');
    this.reviveText = $('revive-text');
    this.reviveFill = $('revive-fill');
    this.downed = $('downed');
    this.voiceInd = $('voice-ind');
    this.mini = $('minimap');
    this.mctx = this.mini.getContext('2d');
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = this.mini.width;
    this.bctx = this.base.getContext('2d');
    this.dmg = 0;
    this.hit = 0;
    this.dirT = 0;
    this.cache = {};
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  show(v) {
    this.el.classList.toggle('hidden', !v);
  }

  damage(amount, rel) {
    this.dmg = Math.min(1, this.dmg + amount / 30);
    this.dirT = 1;
    this.dmgDir.style.transform = `translate(-50%, -50%) rotate(${-rel}rad)`;
  }

  hitmarker(kill, head) {
    this.hit = 1;
    this.hitEl.className = kill ? 'kill' : head ? 'head' : '';
  }

  // Big centre-screen MLG callout (killstreaks, headshots).
  announce(text, small = false) {
    const el = this.announceEl;
    el.textContent = text;
    el.className = small ? 'small' : '';
    el.style.animation = 'none';
    void el.offsetWidth; // restart the CSS animation
    el.style.animation = '';
  }

  toast(text, color = '#e9e4da') {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = text;
    d.style.color = color;
    this.toasts.appendChild(d);
    setTimeout(() => d.remove(), 2200);
  }

  update(dt, game) {
    const { player, arsenal } = game;

    this.dmg = Math.max(0, this.dmg - dt * 1.2);
    const low = player.hp < 35 ? 0.3 + 0.15 * Math.sin(game.time * 5) : 0;
    this.vignette.style.opacity = Math.max(this.dmg, low).toFixed(3);
    this.hit = Math.max(0, this.hit - dt * 5);
    this.hitEl.style.opacity = this.hit.toFixed(3);
    this.dirT = Math.max(0, this.dirT - dt * 1.2);
    this.dmgDir.style.opacity = this.dirT.toFixed(3);

    const hp = Math.max(0, Math.ceil(player.hp));
    this.set('hp', this.healthNum, String(hp));
    this.set('hpw', this.healthFill.style, `${(hp / MAX_HP) * 100}%`, 'width');
    this.set('hpc', this.healthFill, hp < 30 ? 'low' : hp < 60 ? 'mid' : '', 'className');

    const def = arsenal.def;
    const mag = arsenal.mag[arsenal.current];
    const res = arsenal.reserveFor(arsenal.current);
    this.set('wn', this.weaponName, def.name);
    this.set('mag', this.ammoMag, String(mag));
    this.set('magc', this.ammoMag, mag === 0 ? 'empty' : '', 'className');
    this.set('res', this.ammoRes, `/ ${res === Infinity ? '∞' : res}`);
    const hint = arsenal.reloadT > 0 ? 'RELOADING' : mag === 0 ? (res > 0 ? 'R — RELOAD' : 'NO AMMO') : '';
    this.set('hint', this.reloadHint, hint);
    const slots = WEAPON_ORDER.map((id) => {
      const cls = [arsenal.owned.has(id) ? 'owned' : '', id === arsenal.current ? 'active' : ''].join(' ');
      return `<span class="${cls}">${WEAPONS[id].slot}</span>`;
    }).join('');
    this.set('slots', this.slots, slots, 'innerHTML');

    this.set('lvl', this.levelEl, `LEVEL ${game.levelNum}`);
    this.set('kills', this.killsEl, `MEMES DELETED ${game.kills} / ${game.enemies.total}`);
    const s = Math.floor(game.time);
    this.set('time', this.timeEl, `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);

    const gap = 5 + def.spread * 300 * (player.moving ? 1.4 : 1) + arsenal.kickT * 8;
    this.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);

    this.updateCoop(game);
    this.drawMinimap(game);
  }

  updateCoop(game) {
    const mp = game.mp;
    this.set('down', this.downed, !(mp && game.player.down), 'hidden');
    if (!mp) {
      this.set('team', this.team, '', 'innerHTML');
      this.set('rev', this.revive, true, 'hidden');
      this.set('vi', this.voiceInd, '', 'innerHTML');
      return;
    }
    const rows = [...mp.remotes.values()].map((r) => {
      const hp = r.hasState ? Math.max(0, r.hp) : 100;
      const spk = mp.voice.speaking(r.id) ? ' on' : '';
      return (
        `<div class="mate${r.down ? ' down' : ''}"><i style="background:${r.color}"></i>` +
        `<span class="nm">${escapeHtml(r.name)}</span><span class="spk${spk}"></span>` +
        `<span class="st">${r.down ? 'DOWN' : ''}</span>` +
        `<div class="bar"><div style="width:${hp}%;background:${r.color}"></div></div></div>`
      );
    });
    this.set('team', this.team, rows.join(''), 'innerHTML');

    const t = game.reviveTarget;
    this.set('rev', this.revive, !t, 'hidden');
    if (t) {
      this.set('revt', this.reviveText, `HOLD E — REVIVE ${t.name.toUpperCase()}`);
      this.reviveFill.style.width = `${Math.min(100, (game.reviveT / game.reviveTime) * 100)}%`;
    }

    const v = mp.voice;
    let vi = '';
    if (v.micError || !v.track) vi = '<span class="off">MIC OFF</span>';
    else if (v.transmitting) vi = '<span class="live">● LIVE</span>';
    else if (v.ptt) vi = '<kbd>V</kbd> TALK';
    this.set('vi', this.voiceInd, vi, 'innerHTML');
  }

  drawMinimap(game) {
    const { level, player } = game;
    const W = this.mini.width;
    const n = level.size;
    const sc = W / n;
    if (level.revealDirty) {
      level.revealDirty = false;
      const b = this.bctx;
      b.clearRect(0, 0, W, W);
      const ex = level.maze.exit;
      for (let z = 0; z < n; z++) {
        for (let x = 0; x < n; x++) {
          const k = z * n + x;
          if (!level.revealed[k]) continue;
          if (x === ex.x && z === ex.y) b.fillStyle = '#4dff9a';
          else b.fillStyle = level.grid[k] ? 'rgba(20,22,26,0.9)' : 'rgba(150,160,175,0.55)';
          b.fillRect(x * sc, z * sc, Math.ceil(sc), Math.ceil(sc));
        }
      }
    }
    const c = this.mctx;
    c.clearRect(0, 0, W, W);
    c.drawImage(this.base, 0, 0);
    const s = sc / TILE;

    for (const it of game.pickups.items) {
      const k = Math.floor(it.z / TILE) * n + Math.floor(it.x / TILE);
      if (!level.revealed[k]) continue;
      c.fillStyle = `#${PICKUP_COLORS[it.type].toString(16).padStart(6, '0')}`;
      c.fillRect(it.x * s - 1.5, it.z * s - 1.5, 3, 3);
    }
    c.fillStyle = '#ff3b3b';
    for (const e of game.enemies.list) {
      if (!e.alive || !e.los) continue;
      c.beginPath();
      c.arc(e.pos.x * s, e.pos.z * s, Math.max(2, sc * 0.3), 0, Math.PI * 2);
      c.fill();
    }

    if (game.mp) {
      const blink = Math.sin(performance.now() / 120) > 0;
      for (const r of game.mp.remotes.values()) {
        if (!r.hasState || (r.down && !blink)) continue;
        c.fillStyle = r.color;
        c.beginPath();
        c.arc(r.pos.x * s, r.pos.z * s, 3.5, 0, Math.PI * 2);
        c.fill();
      }
    }

    const px = player.pos.x * s;
    const pz = player.pos.z * s;
    const a = Math.atan2(-Math.cos(player.yaw), -Math.sin(player.yaw));
    c.save();
    c.translate(px, pz);
    c.rotate(a);
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(6, 0);
    c.lineTo(-4, -4);
    c.lineTo(-2, 0);
    c.lineTo(-4, 4);
    c.closePath();
    c.fill();
    c.restore();
  }
}
