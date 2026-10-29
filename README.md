# MEMEBREAK

A procedurally generated browser FPS. You wake in the centre of a maze, the memes have become sentient, and you have to fight your way out to a glowing exit on the outer wall. You can play solo or in co-op with up to 4 players and proximity voice chat.

**The memes** are original cartoon homages drawn in code (`src/memes.js`), not copied meme art:

| Meme | Role |
| --- | --- |
| **DOGE** | Fast melee rusher. Side-eyes you and spews Comic Sans ("such bite", "very chase"). |
| **STONKS** | Suited mannequin who strafes and fires spinning line-go-up arrows. |
| **RAGE** | FFFUUU tank with huge fists. Shakes with fury. Guards the exit. |
| **FEELS** | Crying kamikaze. Lights a fuse, runs at you, explodes into tears, and chain-reacts through nearby memes. |
| **CHEEMS** | Pudgy shiba with a bat. Its hits BONK you backwards with real knockback. |
| **GALAXY BRAIN** | Cosmic caster. Fires 3-shot spreads of thought orbs and teleports when hurt (or whenever it feels like it). |
| **CRAB RAVE** | Tiny crabs in packs of four. Fast, fragile, and strobing rave colours. |

**Dismemberment.** Every monster is a jointed body (see `src/body.js`): head, torso, two-segment arms and legs, plus crab claws and DOGE tail, each with its own hit capsule and health. Shoot a limb enough and it comes off — with the weapon it was holding — leaving a bleeding stump, a tumbling gib, theme-coloured blood on the floor and walls, and a monster that limps, crawls, swings weaker or cannot shoot at all. Decapitation kills instantly; bleed-out kills on its own. Individual shots punch wound marks and knock small chunks loose. Gore quality (High/Medium/Low) is in the menu for weaker machines.

Also included: Impact-font kill pop-ups, MLG airhorn killstreaks with a text-to-speech announcer (you can turn it off in the menu), meme graffiti on the walls (some of the EXIT arrows are lies), a sad-trombone WASTED screen, and <kbd>F</kbd> to pay respects.

```
npm install
npm run dev          # http://localhost:5173  (game + co-op server, hot reload)

npm run build
npm start            # production: serves ./dist and the co-op server on $PORT (default 5173)
```

Share a solo maze with `?seed=ANYTHING`. The same seed and level always build the same maze.

## Co-op

1. One player clicks **Co-op → Create room** and shares the 4-letter code, or clicks the code to copy an invite link (`?room=CODE`).
2. Friends join, and the host picks a seed and presses **Start**.
3. Stick together. Enemies go after the nearest player. When your health runs out you go down, and a teammate can revive you by holding <kbd>E</kbd> next to you. If everyone is down, the squad wipes. When anyone reaches the exit, the whole squad escapes.

Voice is **proximity** based. Teammates sound like they're where their character is: quieter with distance, panned left and right, and muffled through walls. Push-to-talk (<kbd>V</kbd>) is on by default and can be switched to open mic in the lobby. Headphones are recommended.

### Playing over the internet

- **The mic needs HTTPS.** Browsers only allow microphone access on `https://` or `localhost`. For friends on other machines, put the server behind HTTPS: deploy it to any Node host (Render, Fly.io, Railway, a VPS with Caddy), or run a quick tunnel such as `cloudflared tunnel --url http://localhost:5173`. Without HTTPS, the game still works but voice is disabled.
- **TURN (optional).** Voice goes peer-to-peer using public STUN servers, which works on most home networks. Players behind strict corporate or mobile NATs may need a TURN relay. Set `TURN_URL` (comma-separated), `TURN_USERNAME` and `TURN_CREDENTIAL` and the server hands them to clients.

### Live deployment

Live at **https://aislop.cloud/memebreak/**, one of the projects on the aislop.cloud droplet (see `C:\sites\aislop\README.md`). The old `/mazebreak` path and the pre-domain addresses (`https://167-172-198-106.sslip.io/memebreak/`, `http://167.172.198.106/memebreak`) redirect there.

To ship an update, run this from this folder:

```
node C:\sites\aislop\deploy.js
```

It runs `npm run build`, uploads the files listed in `aislop.json`, rebuilds the `aislop-memebreak` container and swaps it in. `aislop.json` also holds the landing-page card (name, tagline, tags, `aislop-thumb.jpg`). `deploy/Caddyfile` is the pre-aislop proxy config and is no longer used.

A redeploy restarts the server, which drops any co-op rooms in progress.

### How the networking works

- `server/index.js` is a thin WebSocket relay with rooms (4 max). It doesn't simulate anything.
- The **host's browser** runs the enemy AI and settles pickup races. It streams enemy snapshots at 15 Hz (only enemies that changed, plus a full snapshot every second). If the host leaves, the oldest remaining player becomes host and carries on from their copy of the world.
- **Everyone owns their own player.** Movement is streamed at 20 Hz. Each client runs its own hitscan and reports hits, which the host applies and confirms with kill messages. Enemy projectiles are simulated on every client, and each client checks hits against itself only.
- Levels are rebuilt from the seed on every client, and the result depends on player count, so enemy and pickup ids match without sending the map.
- Voice uses a full WebRTC mesh with "perfect negotiation". Each remote stream is routed through a WebAudio `PannerNode` on that player's avatar.

## Layout

| File | What it does |
| --- | --- |
| `src/maze.js` | Maze generation: recursive backtracker grown from the centre, braided loops, pillared rooms, exit chosen as the furthest point on the border |
| `src/level.js` | Builds the 3D world, handles grid collision, DDA raycasts and line of sight, the pathfinding flow field toward the nearest player, and minimap fog-of-war |
| `src/spawner.js` | Seeded placement of enemies, weapons and supplies, scaled by distance and player count |
| `src/enemies.js` | Meme stats and AI (host), limb damage and severing, bleed-out, FEELS explosions, snapshot mirroring (clients) |
| `src/body.js` | Jointed skeletons: per-limb meshes, hit capsules, ray-capsule tests |
| `src/gore.js` | Severed limbs and instanced chunk gibs with gravity, bouncing and wall collision |
| `src/decals.js` | Instanced blood splats on floors and walls (per-instance colour and alpha, wet-to-dry fade) |
| `src/memes.js` | Draws the meme faces, meme text, and wall graffiti on canvases |
| `src/weapons.js` | PEW PEW / BOOMSTICK / BRRRT, viewmodels, reload and switching |
| `src/main.js` | Game loop, shooting, damage, pickups, down/revive, screens |
| `src/coop.js` | Co-op session: message protocol, host/client roles, migration |
| `src/net.js` | WebSocket client |
| `src/voice.js` | WebRTC mesh plus proximity audio (panning, distance falloff, wall muffling) |
| `src/remotes.js` | Teammate avatars, name tags, speaking indicator |
| `server/index.js` | Static and dev server, rooms, relay, WebRTC signalling |
| `src/textures.js`, `src/audio.js` | All textures and sound effects (including the airhorn and sad trombone) are generated in code, so there are no asset files |

## Built with

Written with [Claude Code](https://claude.com/claude-code). Model: Claude, 2026-09-11 to 2026-09-14. The session transcripts from this build no longer exist, so the exact model is not recorded.

Play it at https://aislop.cloud/memebreak/. Part of the [aislop.cloud](https://aislop.cloud) portfolio.
