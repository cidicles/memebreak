// Tile grid maze. A maze of `cells` x `cells` rooms becomes a (2*cells+1)^2 tile grid:
// odd/odd tiles are cells, odd/even tiles are the walls between them, even/even are posts.
// 1 = wall, 0 = floor.

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function generateMaze(cells, rng) {
  const size = cells * 2 + 1;
  const grid = new Uint8Array(size * size).fill(1);
  const I = (x, y) => y * size + x;
  const ri = (n) => Math.floor(rng() * n);
  const c0 = (cells - 1) >> 1;

  // 1. Recursive backtracker grown outward from the centre cell.
  const seen = new Uint8Array(cells * cells);
  const stack = [[c0, c0]];
  seen[c0 * cells + c0] = 1;
  grid[I(2 * c0 + 1, 2 * c0 + 1)] = 0;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const open = [];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < cells && ny < cells && !seen[ny * cells + nx]) open.push([dx, dy]);
    }
    if (!open.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = open[ri(open.length)];
    const nx = cx + dx;
    const ny = cy + dy;
    seen[ny * cells + nx] = 1;
    grid[I(2 * cx + 1 + dx, 2 * cy + 1 + dy)] = 0;
    grid[I(2 * nx + 1, 2 * ny + 1)] = 0;
    stack.push([nx, ny]);
  }

  // 2. Braid: knock out some interior walls so there are loops and flanking routes.
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      if ((x + y) % 2 === 1 && grid[I(x, y)] && rng() < 0.1) grid[I(x, y)] = 0;
    }
  }

  // 3. Rooms: open arenas with pillars for cover. The start room is always clear.
  const rooms = [];
  const carve = (cx, cy, w, h, pillars, start = false) => {
    const x0 = 2 * cx + 1;
    const y0 = 2 * cy + 1;
    const x1 = 2 * (cx + w - 1) + 1;
    const y1 = 2 * (cy + h - 1) + 1;
    const mx = (x0 + x1) >> 1;
    const my = (y0 + y1) >> 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const post = x % 2 === 0 && y % 2 === 0 && !(Math.abs(x - mx) <= 1 && Math.abs(y - my) <= 1);
        grid[I(x, y)] = pillars && post && rng() < 0.55 ? 1 : 0;
      }
    }
    rooms.push({ cx, cy, w, h, x: (x0 + x1 + 1) / 2, z: (y0 + y1 + 1) / 2, start });
  };

  carve(c0 - 1, c0 - 1, 3, 3, false, true);
  const wanted = Math.max(2, Math.round((cells * cells) / 40));
  for (let tries = 0; tries < 200 && rooms.length <= wanted; tries++) {
    const w = 2 + ri(2);
    const h = 2 + ri(2);
    const cx = ri(cells - w + 1);
    const cy = ri(cells - h + 1);
    const overlaps = rooms.some(
      (r) => cx < r.cx + r.w + 1 && r.cx < cx + w + 1 && cy < r.cy + r.h + 1 && r.cy < cy + h + 1,
    );
    if (!overlaps) carve(cx, cy, w, h, true);
  }

  // 4. Path distance from the start to every floor tile.
  const start = { x: 2 * c0 + 1, y: 2 * c0 + 1 };
  const dist = bfs(grid, size, I(start.x, start.y));

  // 5. Exit: the border cell furthest (by path) from the start gets a hole in the outer wall.
  let exit = null;
  for (let c = 0; c < cells; c++) {
    const sides = [
      [c, 0, 0, -1],
      [c, cells - 1, 0, 1],
      [0, c, -1, 0],
      [cells - 1, c, 1, 0],
    ];
    for (const [cx, cy, nx, ny] of sides) {
      const tx = 2 * cx + 1;
      const ty = 2 * cy + 1;
      const d = dist[I(tx, ty)] + rng() * 0.9; // jitter only breaks ties
      if (!exit || d > exit.d) exit = { d, x: tx + nx, y: ty + ny, nx, ny };
    }
  }
  grid[I(exit.x, exit.y)] = 0;
  dist[I(exit.x, exit.y)] = Math.floor(exit.d) + 1;

  let maxDist = 0;
  for (const d of dist) if (d > maxDist) maxDist = d;

  return { size, cells, grid, start, exit, dist, maxDist, rooms };
}

function bfs(grid, size, from) {
  const dist = new Int32Array(size * size).fill(-1);
  const q = [from];
  dist[from] = 0;
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    const x = k % size;
    const y = (k / size) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (grid[n] || dist[n] >= 0) continue;
      dist[n] = dist[k] + 1;
      q.push(n);
    }
  }
  return dist;
}
