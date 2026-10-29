// MEMEBREAK server: serves the game (Vite middleware in dev, ./dist in production) and runs
// co-op rooms over a WebSocket at /ws. The server is a thin relay - the host's browser runs
// the simulation, and voice goes peer-to-peer over WebRTC (the server only passes signalling).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.PORT) || 5173;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const MAX_PLAYERS = 4;
const COLORS = ['#ff7a3d', '#4dc3ff', '#c77dff', '#4dff9a'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

// STUN is enough for most home networks. For players behind strict NATs, set TURN_URL
// (comma-separated), TURN_USERNAME and TURN_CREDENTIAL.
const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
if (process.env.TURN_URL) {
  iceServers.push({
    urls: process.env.TURN_URL.split(','),
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL,
  });
}

const server = http.createServer();

if (DEV) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: ROOT,
    appType: 'spa',
    server: { middlewareMode: true, hmr: { server } },
  });
  server.on('request', (req, res) => vite.middlewares(req, res));
} else {
  server.on('request', serveStatic);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = path.normalize(path.join(DIST, pathname));
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || st.isDirectory()) file = path.join(DIST, 'index.html');
    fs.readFile(file, (err2, data) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found. Run `npm run build` first.');
        return;
      }
      const immutable = file.includes(`${path.sep}assets${path.sep}`);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      res.end(data);
    });
  });
}

// ---------------------------------------------------------------- rooms

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://x').pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else if (!DEV) {
    socket.destroy(); // in dev, Vite's HMR socket handles its own upgrades
  }
});

const rooms = new Map();
let nextId = 1;

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

const cleanName = (n) =>
  String(n ?? '')
    .replace(/[^\w \-.]/g, '')
    .trim()
    .slice(0, 16) || 'Player';

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  const s = JSON.stringify(msg);
  for (const p of room.players) if (p.readyState === 1) p.send(s);
}

function roomInfo(room) {
  return {
    t: 'room',
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    players: room.players.map((p) => ({ id: p.id, name: p.name, color: p.color })),
  };
}

function join(ws, room, name) {
  leave(ws);
  const used = new Set(room.players.map((p) => p.color));
  ws.color = COLORS.find((c) => !used.has(c)) ?? COLORS[0];
  ws.name = cleanName(name);
  ws.room = room;
  room.players.push(ws);
  broadcast(room, roomInfo(room));
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  room.players = room.players.filter((p) => p !== ws);
  if (!room.players.length) {
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === ws.id) room.hostId = room.players[0].id; // host migration: oldest player
  broadcast(room, { t: 'left', id: ws.id });
  broadcast(room, roomInfo(room));
}

wss.on('connection', (ws) => {
  ws.id = (nextId++).toString(36);
  ws.alive = true;
  ws.room = null;
  ws.on('pong', () => (ws.alive = true));
  send(ws, { t: 'welcome', id: ws.id, iceServers });

  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const room = ws.room;
    switch (m.t) {
      case 'create': {
        const r = { code: makeCode(), players: [], hostId: ws.id, state: 'lobby', gen: 0 };
        rooms.set(r.code, r);
        join(ws, r, m.name);
        break;
      }
      case 'join': {
        const r = rooms.get(String(m.code ?? '').toUpperCase());
        if (!r) return send(ws, { t: 'error', msg: 'Room not found' });
        if (r.players.includes(ws)) return;
        if (r.players.length >= MAX_PLAYERS) return send(ws, { t: 'error', msg: 'Room is full (4 players max)' });
        if (r.state !== 'lobby') return send(ws, { t: 'error', msg: 'That game is already in progress' });
        join(ws, r, m.name);
        break;
      }
      case 'leave':
        leave(ws);
        send(ws, { t: 'room', code: null });
        break;
      case 'start':
        if (room && room.hostId === ws.id) {
          room.state = 'playing';
          room.gen++;
          broadcast(room, {
            t: 'start',
            gen: room.gen,
            seed: String(m.seed ?? '').slice(0, 24) || 'MAZE',
            level: Math.max(1, Math.min(50, m.level | 0)),
            retry: !!m.retry,
            players: room.players.map((p) => p.id),
          });
          broadcast(room, roomInfo(room));
        }
        break;
      case 'lobby':
        if (room && room.hostId === ws.id) {
          room.state = 'lobby';
          broadcast(room, { t: 'lobby' });
          broadcast(room, roomInfo(room));
        }
        break;
      case 'relay': {
        if (!room) return;
        const out = JSON.stringify({ t: 'msg', from: ws.id, d: m.d });
        if (m.to) {
          const p = room.players.find((q) => q.id === m.to);
          if (p && p.readyState === 1) p.send(out);
        } else {
          for (const p of room.players) if (p !== ws && p.readyState === 1) p.send(out);
        }
        break;
      }
    }
  });

  ws.on('close', () => leave(ws));
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => {
  console.log(`MEMEBREAK ${DEV ? 'dev ' : ''}server on http://localhost:${PORT}`);
});
