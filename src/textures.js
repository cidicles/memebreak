import * as THREE from 'three';
import { mulberry32 } from './rng.js';

// All textures are painted onto canvases at startup - no image assets needed.

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function grain(g, size, amount, rng) {
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function blotches(g, size, count, rng, rgb, maxAlpha, maxR) {
  for (let i = 0; i < count; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 8 + rng() * maxR;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${rgb},${rng() * maxAlpha})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function wallCanvas(rng) {
  const S = 512;
  const [c, g] = canvas(S);
  g.fillStyle = '#231e1a';
  g.fillRect(0, 0, S, S);
  const rows = 10;
  const cols = 4;
  const bh = S / rows;
  const bw = S / cols;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (bw / 2);
    for (let k = -1; k < cols; k++) {
      const x = k * bw + off;
      const y = r * bh;
      const l = 24 + rng() * 12;
      g.fillStyle = `hsl(${18 + rng() * 16} ${14 + rng() * 12}% ${l}%)`;
      g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(x + 3, y + 3, bw - 6, 3);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x + 3, y + bh - 7, bw - 6, 4);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = `rgba(0,0,0,${rng() * 0.3})`;
        g.beginPath();
        g.arc(x + rng() * bw, y + rng() * bh, 1 + rng() * 4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  blotches(g, S, 26, rng, '20,30,12', 0.35, 60); // damp moss
  blotches(g, S, 14, rng, '0,0,0', 0.4, 50);
  const grad = g.createLinearGradient(0, S * 0.55, 0, S);
  grad.addColorStop(0, 'rgba(8,6,4,0)');
  grad.addColorStop(1, 'rgba(8,6,4,0.6)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  grain(g, S, 26, rng);
  return c;
}

function floorCanvas(rng) {
  const S = 512;
  const [c, g] = canvas(S);
  g.fillStyle = '#0e0d0c';
  g.fillRect(0, 0, S, S);
  const n = 4;
  const s = S / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const l = 14 + rng() * 8;
      g.fillStyle = `hsl(30 6% ${l}%)`;
      g.fillRect(x * s + 3, y * s + 3, s - 6, s - 6);
      // cracks
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = 1.5;
      for (let k = 0; k < 2; k++) {
        if (rng() < 0.5) continue;
        g.beginPath();
        let px = x * s + rng() * s;
        let py = y * s + rng() * s;
        g.moveTo(px, py);
        for (let j = 0; j < 4; j++) {
          px += (rng() - 0.5) * 50;
          py += (rng() - 0.5) * 50;
          g.lineTo(px, py);
        }
        g.stroke();
      }
    }
  }
  blotches(g, S, 30, rng, '0,0,0', 0.5, 70);
  blotches(g, S, 6, rng, '60,8,6', 0.35, 30); // old stains
  grain(g, S, 30, rng);
  return c;
}

function ceilingCanvas(rng) {
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#0b0c0e';
  g.fillRect(0, 0, S, S);
  const s = S / 2;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      g.fillStyle = `hsl(215 8% ${10 + rng() * 5}%)`;
      g.fillRect(x * s + 4, y * s + 4, s - 8, s - 8);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      for (const [rx, ry] of [
        [10, 10],
        [s - 14, 10],
        [10, s - 14],
        [s - 14, s - 14],
      ]) {
        g.fillRect(x * s + rx, y * s + ry, 4, 4);
      }
    }
  }
  blotches(g, S, 10, rng, '0,0,0', 0.5, 40);
  grain(g, S, 22, rng);
  return c;
}

function portalCanvas() {
  const S = 128;
  const [c, g] = canvas(S);
  const grad = g.createLinearGradient(0, 0, S, 0);
  grad.addColorStop(0, 'rgba(60,255,160,0.15)');
  grad.addColorStop(0.5, 'rgba(210,255,230,1)');
  grad.addColorStop(1, 'rgba(60,255,160,0.15)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * S, 0, 1, S);
  return c;
}

function flareCanvas() {
  const S = 64;
  const [c, g] = canvas(S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return c;
}

function dropletCanvas() {
  const S = 64;
  const [c, g] = canvas(S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0.97)');
  grad.addColorStop(0.85, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return c;
}

function ringCanvas() {
  const S = 128;
  const [c, g] = canvas(S);
  const grad = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.65, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return c;
}

export function makeTextures(renderer) {
  const rng = mulberry32(1337);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (c, repeat = true, srgb = true) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    return t;
  };
  return {
    wall: tex(wallCanvas(rng)),
    floor: tex(floorCanvas(rng)),
    ceiling: tex(ceilingCanvas(rng)),
    portal: tex(portalCanvas(), false),
    flare: tex(flareCanvas(), false),
    droplet: tex(dropletCanvas(), false),
    ring: tex(ringCanvas(), false),
  };
}
