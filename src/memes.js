import * as THREE from 'three';

// Everything meme-flavoured that gets drawn: monster faces, meme text, wall graffiti.
// The faces are original cartoon homages drawn with canvas paths - no copied artwork.

const IMPACT = 'Impact, "Anton", "Arial Black", "Haettenschweiler", sans-serif';
const COMIC = '"Comic Sans MS", "Comic Sans", "Chalkboard SE", "Comic Neue", cursive';

export const DOGE_COLORS = ['#ff4fd8', '#39ff14', '#00e5ff', '#ffe600', '#ff8c00', '#b388ff', '#ff3b3b'];

export const GRAFFITI = [
  'wow', 'such maze', 'much lost', 'very walls', 'stonks', 'not stonks', 'git gud', 'press F', "it's over 9000",
  'all your base', '404: exit not found', 'u mad bro?', 'yeet', 'big if true', 'no u', 'this is fine', 'sus',
  'rekt', "it's a trap", 'the cake is a lie', 'y u no exit', '1v1 me', 'gg ez', 'ctrl+z', 'brb', 'AFK', 'lag',
  'why r u running', 'feels bad man', 'kthxbye', 'do a barrel roll', 'LEEROY', 'HODL', 'to the moon',
  'EXIT →', '← EXIT', 'EXIT ↑', 'not the exit', 'turn back', 'skill issue', 'touch grass',
  'ratio', 'L + ratio', 'NPC', 'main character', 'bruh', 'certified hood classic', 'we live in a society',
  'bonk', 'go to jail', 'big brain time', '200 IQ', 'crab rave', 'clack clack', 'ascend',
];
const SPRAY = ['#ff4fd8', '#39ff14', '#00e5ff', '#ffe600', '#ff8c00', '#ffffff', '#ff3b3b', '#b388ff'];

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function ellipse(g, x, y, rx, ry, fill, stroke, lw = 3) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.stroke();
  }
}

function poly(g, pts, fill, stroke, lw = 3) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
  g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.stroke();
  }
}

// ---------------------------------------------------------------- faces (256x256)

function drawDoge(g) {
  // ears
  for (const s of [-1, 1]) {
    poly(g, [[128 + s * 70, 100], [128 + s * 82, 16], [128 + s * 18, 64]], '#d4852f', '#7a4516', 4);
    poly(g, [[128 + s * 64, 88], [128 + s * 74, 36], [128 + s * 34, 66]], '#f6dcae');
  }
  // head
  const grad = g.createRadialGradient(118, 120, 20, 128, 140, 110);
  grad.addColorStop(0, '#f0b563');
  grad.addColorStop(1, '#c0752a');
  ellipse(g, 128, 142, 96, 86, grad, '#7a4516', 4);
  // cream cheeks + muzzle
  ellipse(g, 82, 168, 34, 30, '#f8e6c4');
  ellipse(g, 174, 168, 34, 30, '#f8e6c4');
  ellipse(g, 128, 182, 58, 42, '#fbeed6');
  // shiba eyebrow spots
  ellipse(g, 96, 100, 11, 7, '#f8e6c4');
  ellipse(g, 160, 100, 11, 7, '#f8e6c4');
  // side-eye: whites on the right, pupils shoved left
  for (const x of [98, 158]) {
    ellipse(g, x, 128, 17, 12, '#fffdf5', '#3a2210', 3);
    ellipse(g, x - 7, 129, 10, 10, '#1a0f07');
    ellipse(g, x - 10, 125, 3, 3, '#ffffff');
  }
  // nose + mouth
  ellipse(g, 128, 164, 17, 12, '#1a0f07');
  ellipse(g, 123, 160, 5, 3, '#6b5a50');
  g.strokeStyle = '#3a2210';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(128, 176);
  g.lineTo(128, 188);
  g.moveTo(104, 186);
  g.quadraticCurveTo(116, 200, 128, 188);
  g.quadraticCurveTo(140, 200, 152, 186);
  g.stroke();
}

function drawStonks(g) {
  // the chart, going up
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const pts = [[14, 236], [70, 190], [104, 214], [160, 130], [196, 150], [236, 52]];
  for (const [w, c] of [[24, '#0b3d18'], [14, '#35d05a']]) {
    g.strokeStyle = c;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
    g.stroke();
  }
  poly(g, [[250, 22], [250, 84], [196, 44]], '#35d05a', '#0b3d18', 5);
  // smooth mannequin head
  const grad = g.createRadialGradient(108, 92, 10, 124, 120, 110);
  grad.addColorStop(0, '#fff3ea');
  grad.addColorStop(0.6, '#e9cdbb');
  grad.addColorStop(1, '#b58f7a');
  ellipse(g, 54, 124, 12, 20, '#d9b9a5');
  ellipse(g, 194, 124, 12, 20, '#d9b9a5');
  ellipse(g, 124, 118, 72, 92, grad);
  // blank stare
  ellipse(g, 100, 112, 9, 6, '#2b2320');
  ellipse(g, 148, 112, 9, 6, '#2b2320');
  g.strokeStyle = 'rgba(90,60,50,0.55)';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(86, 96);
  g.lineTo(112, 94);
  g.moveTo(136, 94);
  g.lineTo(162, 96);
  g.moveTo(124, 118);
  g.quadraticCurveTo(116, 146, 126, 150);
  g.moveTo(104, 172);
  g.quadraticCurveTo(128, 180, 150, 168);
  g.stroke();
}

function drawRage(g) {
  // face, flushed red toward the middle
  ellipse(g, 128, 132, 104, 112, '#ffffff', '#111', 7);
  const flush = g.createRadialGradient(128, 150, 10, 128, 140, 110);
  flush.addColorStop(0, 'rgba(255,30,30,0.75)');
  flush.addColorStop(1, 'rgba(255,30,30,0.05)');
  ellipse(g, 128, 132, 100, 108, flush);
  // anger veins
  g.strokeStyle = '#c40000';
  g.lineWidth = 6;
  g.lineCap = 'round';
  for (const [x, y] of [[70, 58], [186, 58]]) {
    g.beginPath();
    g.arc(x - 9, y - 9, 8, 0, Math.PI / 2);
    g.moveTo(x + 9 + 8, y - 9);
    g.arc(x + 9, y - 9, 8, 0, Math.PI / 2 + 0.2, false);
    g.moveTo(x - 9, y + 17);
    g.arc(x - 9, y + 9, 8, -Math.PI / 2, 0);
    g.moveTo(x + 9, y + 1);
    g.arc(x + 9, y + 9, 8, Math.PI, Math.PI * 1.5);
    g.stroke();
  }
  // furious brows
  g.strokeStyle = '#111';
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(52, 70);
  g.lineTo(116, 98);
  g.moveTo(204, 70);
  g.lineTo(140, 98);
  g.stroke();
  // bulging bloodshot eyes
  for (const x of [88, 168]) {
    ellipse(g, x, 116, 24, 20, '#fff', '#111', 5);
    g.strokeStyle = '#e00';
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * 22, 116 + Math.sin(a) * 18);
      g.lineTo(x + Math.cos(a) * 12, 116 + Math.sin(a) * 9);
      g.stroke();
    }
    ellipse(g, x, 118, 5, 5, '#111');
  }
  // screaming mouth
  poly(g, [[62, 150], [194, 150], [178, 226], [78, 226]], '#1a0000', '#111', 6);
  ellipse(g, 128, 214, 40, 12, '#c0303a');
  g.fillStyle = '#fff';
  for (let i = 0; i < 7; i++) g.fillRect(70 + i * 17.5, 154, 14, 16);
  for (let i = 0; i < 5; i++) g.fillRect(86 + i * 17.5, 206, 13, 14);
}

function drawFeels(g) {
  ellipse(g, 196, 136, 16, 26, '#ecebe4', '#111', 3);
  ellipse(g, 124, 124, 80, 102, '#f3f1ea', '#111', 4);
  g.strokeStyle = '#111';
  g.lineCap = 'round';
  g.lineWidth = 3;
  g.beginPath();
  // sad brows: inner ends up
  g.moveTo(74, 94);
  g.lineTo(108, 84);
  g.moveTo(140, 84);
  g.lineTo(174, 94);
  // droopy lids + bags
  g.moveTo(80, 110);
  g.quadraticCurveTo(96, 102, 110, 112);
  g.moveTo(138, 112);
  g.quadraticCurveTo(152, 102, 168, 110);
  g.moveTo(84, 128);
  g.quadraticCurveTo(96, 134, 108, 128);
  g.moveTo(140, 128);
  g.quadraticCurveTo(152, 134, 164, 128);
  // nose, frown
  g.moveTo(124, 116);
  g.quadraticCurveTo(114, 150, 128, 152);
  g.moveTo(102, 186);
  g.quadraticCurveTo(124, 172, 148, 186);
  g.stroke();
  ellipse(g, 96, 116, 5, 5, '#111');
  ellipse(g, 152, 116, 5, 5, '#111');
  // tears
  g.strokeStyle = 'rgba(74,168,255,0.9)';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(92, 124);
  g.quadraticCurveTo(84, 170, 90, 214);
  g.moveTo(156, 124);
  g.quadraticCurveTo(164, 170, 158, 214);
  g.stroke();
  for (const [x, y] of [[88, 230], [160, 232]]) poly(g, [[x, y - 14], [x + 7, y], [x - 7, y]], '#4aa8ff');
  ellipse(g, 88, 232, 7, 7, '#4aa8ff');
  ellipse(g, 160, 234, 7, 7, '#4aa8ff');
}

function drawCheems(g) {
  // pudgier, paler shiba: wide round head, huge cheeks, tiny worried eyes
  for (const s of [-1, 1]) {
    poly(g, [[128 + s * 80, 108], [128 + s * 86, 34], [128 + s * 30, 76]], '#e0a860', '#7a4f22', 4);
    poly(g, [[128 + s * 74, 98], [128 + s * 78, 52], [128 + s * 44, 80]], '#fbe7c6');
  }
  const grad = g.createRadialGradient(120, 130, 20, 128, 150, 120);
  grad.addColorStop(0, '#f7cf8d');
  grad.addColorStop(1, '#d69a52');
  ellipse(g, 128, 152, 110, 86, grad, '#7a4f22', 4);
  ellipse(g, 70, 178, 44, 36, '#fdf1dc');
  ellipse(g, 186, 178, 44, 36, '#fdf1dc');
  ellipse(g, 128, 190, 50, 36, '#fff8ea');
  // worried little brows + beady eyes
  g.strokeStyle = '#5a3a1a';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(94, 116);
  g.lineTo(110, 110);
  g.moveTo(162, 116);
  g.lineTo(146, 110);
  g.stroke();
  ellipse(g, 106, 132, 7, 8, '#1a0f07');
  ellipse(g, 150, 132, 7, 8, '#1a0f07');
  ellipse(g, 104, 129, 2, 2, '#fff');
  ellipse(g, 148, 129, 2, 2, '#fff');
  // button nose, small "o" mouth
  ellipse(g, 128, 164, 13, 9, '#1a0f07');
  ellipse(g, 128, 190, 9, 11, '#6b2a2a', '#3a2210', 3);
  g.fillStyle = '#ff9aa8';
  g.beginPath();
  g.ellipse(128, 196, 6, 4, 0, 0, Math.PI * 2);
  g.fill();
}

function drawBrain(g) {
  // cosmic aura
  const aura = g.createRadialGradient(128, 118, 10, 128, 128, 128);
  aura.addColorStop(0, 'rgba(255,255,255,0.95)');
  aura.addColorStop(0.25, 'rgba(190,140,255,0.8)');
  aura.addColorStop(0.6, 'rgba(90,60,255,0.35)');
  aura.addColorStop(1, 'rgba(40,20,120,0)');
  g.fillStyle = aura;
  g.fillRect(0, 0, 256, 256);
  // head silhouette
  ellipse(g, 128, 150, 70, 88, 'rgba(20,24,70,0.75)', 'rgba(160,200,255,0.9)', 3);
  // the brain: two glowing lobes with folds
  g.save();
  g.shadowColor = '#e0b0ff';
  g.shadowBlur = 24;
  ellipse(g, 106, 112, 42, 34, '#f2c9ff');
  ellipse(g, 150, 112, 42, 34, '#f2c9ff');
  g.restore();
  g.strokeStyle = '#a45fd6';
  g.lineWidth = 3;
  g.lineCap = 'round';
  const folds = [
    [70, 108, 90, 96, 104, 112], [84, 128, 98, 116, 118, 130], [120, 90, 112, 106, 124, 118],
    [136, 90, 146, 106, 134, 120], [150, 128, 162, 114, 180, 126], [164, 98, 178, 104, 184, 118],
  ];
  for (const [x0, y0, cx, cy, x1, y1] of folds) {
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(cx, cy, x1, y1);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(128, 82);
  g.lineTo(128, 142);
  g.stroke();
  // stars
  g.fillStyle = '#ffffff';
  for (const [x, y, r] of [[40, 50, 3], [214, 64, 4], [30, 190, 2], [226, 200, 3], [196, 30, 2], [60, 230, 2], [128, 30, 3]]) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
}

function drawCrab(g) {
  // Shell and face only: the claws and legs are real, severable 3D parts (see body.js).
  g.strokeStyle = '#8a2c1e';
  g.lineCap = 'round';
  // eye stalks
  g.lineWidth = 7;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(128 + s * 26, 150);
    g.lineTo(128 + s * 34, 92);
    g.stroke();
    ellipse(g, 128 + s * 34, 84, 18, 18, '#fff', '#222', 4);
    ellipse(g, 128 + s * 31, 87, 7, 8, '#111');
    ellipse(g, 128 + s * 28, 80, 3, 3, '#fff');
  }
  // shell, drawn pale so the rave lights can tint it
  const grad = g.createRadialGradient(112, 150, 12, 128, 172, 104);
  grad.addColorStop(0, '#ffd2c6');
  grad.addColorStop(1, '#ea7c63');
  ellipse(g, 128, 172, 104, 62, grad, '#8a2c1e', 6);
  // shell markings
  g.strokeStyle = 'rgba(138,44,30,0.55)';
  g.lineWidth = 4;
  for (const dx of [-54, 0, 54]) {
    g.beginPath();
    g.moveTo(128 + dx, 128);
    g.quadraticCurveTo(128 + dx * 1.2, 150, 128 + dx, 168);
    g.stroke();
  }
  // grin
  g.strokeStyle = '#5a1a10';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(128, 176, 26, 0.25, Math.PI - 0.25);
  g.stroke();
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(128 + s * 26, 176);
    g.lineTo(128 + s * 34, 168);
    g.stroke();
  }
}

const FACE_DRAW = {
  grunt: drawDoge,
  shooter: drawStonks,
  brute: drawRage,
  feels: drawFeels,
  cheems: drawCheems,
  brain: drawBrain,
  crab: drawCrab,
};
const faceCanvases = {};
const faceTextures = {};

export function faceCanvas(type) {
  if (!faceCanvases[type]) {
    const [c, g] = canvas(256);
    FACE_DRAW[type](g);
    faceCanvases[type] = c;
  }
  return faceCanvases[type];
}

export function faceTexture(type) {
  if (!faceTextures[type]) {
    const t = new THREE.CanvasTexture(faceCanvas(type));
    t.colorSpace = THREE.SRGBColorSpace;
    faceTextures[type] = t;
  }
  return faceTextures[type];
}

// ---------------------------------------------------------------- meme text

const textCache = new Map();

// style: 'impact' (classic white-with-black-outline meme text), 'doge' (Comic Sans), 'sign' (glowing)
export function textTexture(text, style = 'impact', color = '#ffffff') {
  const key = `${style}|${color}|${text}`;
  let entry = textCache.get(key);
  if (entry) return entry;
  const size = 72;
  const font = style === 'doge' ? `bold ${size}px ${COMIC}` : `${size}px ${IMPACT}`;
  const label = style === 'impact' || style === 'sign' ? text.toUpperCase() : text;
  const [, probe] = canvas(4);
  probe.font = font;
  const w = Math.ceil(probe.measureText(label).width) + 40;
  const [c, g] = canvas(w, size + 36);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const x = w / 2;
  const y = (size + 36) / 2 + 2;
  if (style === 'impact') {
    g.lineJoin = 'round';
    g.lineWidth = 12;
    g.strokeStyle = '#000';
    g.strokeText(label, x, y);
    g.fillStyle = color;
    g.fillText(label, x, y);
  } else if (style === 'sign') {
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.fillStyle = color;
    g.fillText(label, x, y);
    g.shadowBlur = 0;
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.6;
    g.fillText(label, x, y);
  } else {
    g.shadowColor = 'rgba(0,0,0,0.8)';
    g.shadowBlur = 6;
    g.fillStyle = color;
    g.fillText(label, x, y);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  entry = { texture, aspect: w / (size + 36) };
  if (textCache.size > 120) {
    for (const old of textCache.values()) old.texture.dispose(); // free the GPU copies too
    textCache.clear();
  }
  textCache.set(key, entry);
  return entry;
}

// ---------------------------------------------------------------- graffiti

const decalCache = new Map();

export function graffitiTexture(phrase, rng) {
  const color = SPRAY[Math.floor(rng() * SPRAY.length)];
  const key = `${phrase}|${color}`;
  if (decalCache.has(key)) return decalCache.get(key);
  const [c, g] = canvas(512, 256);
  let size = 120;
  g.font = `${size}px ${IMPACT}`;
  while (g.measureText(phrase).width > 470 && size > 40) {
    size -= 6;
    g.font = `${size}px ${IMPACT}`;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const w = g.measureText(phrase).width;
  // overspray haze
  g.shadowColor = color;
  g.shadowBlur = 22;
  g.fillStyle = color;
  g.globalAlpha = 0.9;
  g.fillText(phrase, 256, 118);
  g.shadowBlur = 0;
  // drips
  g.strokeStyle = color;
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const x = 256 - w / 2 + Math.random() * w;
    const y0 = 118 + size * 0.3;
    g.lineWidth = 2 + Math.random() * 4;
    g.globalAlpha = 0.75;
    g.beginPath();
    g.moveTo(x, y0);
    g.lineTo(x, y0 + 10 + Math.random() * 70);
    g.stroke();
  }
  // speckle
  g.fillStyle = color;
  for (let i = 0; i < 160; i++) {
    g.globalAlpha = Math.random() * 0.6;
    g.fillRect(256 - w / 2 - 20 + Math.random() * (w + 40), 118 - size / 2 - 20 + Math.random() * (size + 40), 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  decalCache.set(key, t);
  return t;
}

// ---------------------------------------------------------------- misc

let arrowTex;
export function stonksArrowTexture() {
  if (arrowTex) return arrowTex;
  const [c, g] = canvas(64);
  g.translate(32, 32);
  g.rotate(-Math.PI / 4);
  g.shadowColor = '#35d05a';
  g.shadowBlur = 10;
  poly(g, [[0, -26], [16, -6], [6, -6], [6, 24], [-6, 24], [-6, -6], [-16, -6]], '#7dffa0');
  arrowTex = new THREE.CanvasTexture(c);
  return arrowTex;
}
