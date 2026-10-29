import { TILE } from './config.js';

// Places weapons, supplies and enemies. Danger scales with path distance from the centre,
// and the exit always has a guard waiting. Must stay deterministic for a given seed and
// player count: every co-op client runs it and relies on matching ids.
export function populate(level, rng, levelNum, enemies, pickups, players = 1) {
  const crowd = 1 + 0.35 * (players - 1);
  const { size, grid, dist, maxDist, exit, cells } = level.maze;
  const exitK = exit.y * size + exit.x;
  const tiles = [];
  for (let k = 0; k < grid.length; k++) if (!grid[k] && dist[k] >= 7 && k !== exitK) tiles.push(k);

  const used = new Uint8Array(grid.length);
  const isClear = (k, r) => {
    const x = k % size;
    const y = (k / size) | 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && used[ny * size + nx]) return false;
      }
    }
    return true;
  };
  // Weighted random pick of an unused tile; weight(t, k) with t = 0 (centre) .. 1 (furthest).
  const pick = (weight, spacing = 1) => {
    const ks = [];
    const ws = [];
    let total = 0;
    for (const k of tiles) {
      if (!isClear(k, spacing)) continue;
      const w = weight(dist[k] / maxDist, k);
      if (w <= 0) continue;
      ks.push(k);
      ws.push(w);
      total += w;
    }
    if (!ks.length) return -1;
    let r = rng() * total;
    let i = 0;
    while (i < ks.length - 1 && (r -= ws[i]) > 0) i++;
    used[ks[i]] = 1;
    return ks[i];
  };
  const at = (k, jitter = 0) => [
    ((k % size) + 0.5 + (rng() - 0.5) * jitter) * TILE,
    (((k / size) | 0) + 0.5 + (rng() - 0.5) * jitter) * TILE,
  ];
  const place = (type, weight, spacing = 1) => {
    const k = pick(weight, spacing);
    if (k >= 0) pickups.spawn(type, ...at(k));
  };
  const spawnEnemy = (type, weight, spacing = 1) => {
    const k = pick(weight, spacing);
    if (k >= 0) enemies.spawn(type, ...at(k, 0.3));
    return k;
  };

  // Weapons and supplies.
  place('shotgun', (t) => (t > 0.15 && t < 0.4 ? 1 : 0));
  place('rifle', (t) => (t > 0.45 && t < 0.72 ? 1 : 0));
  const nHealth = Math.round((2 + cells * 0.35) * crowd);
  const nAmmo = Math.round((3 + cells * 0.45) * crowd);
  for (let i = 0; i < nHealth; i++) place('health', (t) => 0.4 + t);
  for (let i = 0; i < nAmmo; i++) place(rng() < 0.5 ? 'shells' : 'bullets', (t) => 0.4 + t);

  // Exit guards.
  const nearExit = (_t, k) => {
    const d = Math.max(Math.abs((k % size) - exit.x), Math.abs(((k / size) | 0) - exit.y));
    return d <= 5 ? 1 : 0;
  };
  spawnEnemy('brute', nearExit, 0);
  for (let i = 0; i < 1 + levelNum; i++) spawnEnemy(rng() < 0.5 ? 'shooter' : 'grunt', nearExit, 0);

  // Every maze gets at least a couple of FEELS, because explosions are fun.
  for (let i = 0; i < 2; i++) spawnEnemy('feels', (t) => (t > 0.3 ? 1 : 0));

  // CRAB RAVE packs: four crabs sharing one tile.
  const packs = 1 + Math.floor(levelNum / 2) + (players > 2 ? 1 : 0);
  for (let i = 0; i < packs; i++) {
    const k = pick((t) => (t > 0.2 ? 1 : 0));
    if (k < 0) break;
    for (let c = 0; c < 4; c++) enemies.spawn('crab', ...at(k, 0.55));
  }

  // Everything else, denser and nastier toward the edge.
  const count = Math.min(80 + 15 * (players - 1), Math.round(cells * cells * (0.16 + 0.025 * levelNum) * crowd));
  for (let i = 0; i < count; i++) {
    const k = pick((t) => 0.2 + t * t * 1.5);
    if (k < 0) break;
    const t = dist[k] / maxDist;
    let type = 'grunt';
    if (t > 0.65 && rng() < 0.08 + 0.04 * levelNum) type = 'brute';
    else if (rng() < 0.1 + 0.4 * t) type = 'shooter';
    else if (t > 0.25 && rng() < 0.16 + 0.02 * levelNum) type = 'feels';
    else if (t > 0.45 && rng() < 0.14 + 0.02 * levelNum) type = 'brain';
    else if (t > 0.2 && rng() < 0.28) type = 'cheems';
    enemies.spawn(type, ...at(k, 0.3));
  }
}
