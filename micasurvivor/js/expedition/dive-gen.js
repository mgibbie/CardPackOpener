'use strict';
/* ============ expedition/dive-gen.js — Dive's floor generator (MicaSurvivor Dive V1, not upstream) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load()); a base page never runs it.
 * Plans/MICASURVIVOR_DIVE_MODE_PLAN.md 2.3: PokéDive's floors (read from its shipped client, 2026-11-02), rebuilt here.
 *
 *   layout({seed, route, floor})  a floor, PURE: the same {seed, route, floor} always gives the same floor (a co-op guest,
 *                       a replay and a spectator rebuild it; it is never streamed). A fixed 56 x 40 tile grid, carved by a
 *                       CELLULAR AUTOMATON (not rooms and corridors):
 *                         shape   caves 50 %, clearing 20 % (a carved central ellipse), islands 15 % (the crater gets a
 *                                 clearing instead), maze 15 %. An arena floor (every 5th: the alpha) is always a clearing;
 *                                 a guardian floor (every 25th) is the hand-shaped oval arena (guardian()).
 *                         carve   random walls (maze .47, islands .34, forest / marsh / fungal .37, the rest .40), 6
 *                                 smoothing passes (a wall with >= 5 wall neighbours; in the first 3 passes also an empty
 *                                 spot), then 1-tile pillars go and diagonal leaks are closed; only the largest region
 *                                 stays. Up to 12 seeds until >= 45 % of the inner grid is open (30 % for a maze), else the best.
 *                         spawn   the most open tile (farthest from a wall); the stairs at >= 90 % of the longest walk,
 *                                 out of the spawn's line of sight when possible; the walk between them is the PATH.
 *                         rescue  the lost Pokémon: a tile 35-80 % of the stairs' walk from the spawn, >= 12 tiles from the stairs
 *                         water   the route's lakes (blobs that never cover the path: where one crosses it, the path is a
 *                                 bridge, i.e. it stays floor) and its tall grass tufts (wildfire's fuel)
 *                         groups  one foe group per 62 open tiles, >= 16 steps from the spawn; the first two GUARD the path
 *                                 (at 55 % and 85 % of it)
 *                         chests  1, + 1 at 60 %, + 1 at 25 %; wall-hugging spots, >= 10 tiles apart
 *                         landmark  40 % of the plain floors: the route's own (LANDMARK)
 *                         pockets 1-2 secret pockets (3-40 tiles) behind a plug (plugs: {at, kind boulder / thicket, size, chest});
 *                                 the plug is a WALL in the grid until dive.js opens it
 *                       -> {w, h, kind, prop, spawn, stairs, stairsSteps, farSteps (the carved longest walk), rescue, groups, chests, landmark, path, shape, open, tries, ...}
 *                       kind: 0 floor, 1 wall, 2 liquid (G.ExpTerrain's FLOOR / WALL / LIQUID); prop: 3 = tall grass.
 *                       Every point is [tx, ty] in the grid (0..w-1, 0..h-1).
 *   zone(L, seed)       the layout as an Expedition zone (G.ExpTerrain.custom: walls, collision, pathing, painter, minimap,
 *                       hash), all at height 0, moved so the spawn tile is the world origin. zone.dive = L.
 *   cadence(floor)      {arena, guardian, rope}: PokéDive's rhythm (alpha every 5th, guardian every 25th, the Escape Rope on
 *                       10, 20 and every 25th)
 *   ROUTES              the 8 routes: biome, types, lakes, grass, landmark
 * Its random stream is G.DLC.rng (mulberry32) seeded from {seed, route, floor}; never Math.random.
 */
G.DiveGen = (() => {
  const W = 56, H = 40;
  const FLOOR = 0, WALL = 1, LIQUID = 2, GRASS = 3;
  const K = {
    TRIES: 12, OPEN: 0.45, OPEN_MAZE: 0.3, PASSES: 6,
    FILL: { maze: 0.47, islands: 0.34, lush: 0.37, rest: 0.4 },
    SHAPES: [['caves', 0.5], ['clearing', 0.2], ['islands', 0.15], ['maze', 0.15]],
    STAIRS_AT: 0.9, RESCUE: [0.35, 0.8], RESCUE_FAR: 12,
    GROUP_TILES: 62, GROUP_FAR: 16, GUARDS: [0.55, 0.85],
    CHEST: [0.6, 0.25], CHEST_GAP: 10, LANDMARK: 0.4,
    POCKET: [3, 40], POCKET2: 0.45, POCKET_TRIES: 60,   // secret pockets: 3-40 tiles behind a plug; 2 of them 45 % of the time
    ARENA_R: 10
  };
  // The 8 routes (PokéDive's Mossy Woods ... Fungal Grove). types: the foes' bias; lakes / grass: blob counts;
  // landmark: the route's own (shrine full heal, obelisk +30 % dmg for 60 s, altar 30 % HP for an item, shipwreck coins,
  // frost spire freezes foes nearby, totem reveals the map, monolith XP, fairy ring revives and heals).
  const ROUTES = {
    forest: { types: ['grass', 'bug', 'normal', 'flying'], lakes: 3, grass: 7, lush: true, landmark: 'shrine', biome: 'viridian' },
    canyon: { types: ['ground', 'rock', 'fighting', 'normal'], lakes: 1, grass: 0, landmark: 'obelisk', biome: 'mtmoon' },
    crater: { types: ['fire', 'rock', 'dragon', 'steel'], lakes: 3, grass: 0, noIslands: true, landmark: 'altar', biome: 'mtmoon' },
    reef:   { types: ['water', 'ice', 'flying', 'electric'], lakes: 3, grass: 0, landmark: 'shipwreck', biome: 'cerulean' },
    grotto: { types: ['ice', 'water', 'steel', 'psychic'], lakes: 2, grass: 0, landmark: 'spire', biome: 'cerulean' },
    marsh:  { types: ['poison', 'water', 'grass', 'dark'], lakes: 6, grass: 5, lush: true, landmark: 'totem', biome: 'viridian' },
    ruins:  { types: ['psychic', 'ghost', 'rock', 'steel'], lakes: 1, grass: 0, landmark: 'monolith', biome: 'mtmoon' },
    fungal: { types: ['grass', 'fairy', 'poison', 'bug'], lakes: 3, grass: 5, lush: true, landmark: 'fairy', biome: 'viridian' },
    // (V7: the Route of Origin, opened by the 8 Seals; Arceus guards it)
    origin: { types: ['normal', 'dragon', 'psychic', 'fairy'], lakes: 2, grass: 2, landmark: 'monolith', biome: 'mtmoon' }
  };
  const ROUTE_IDS = Object.keys(ROUTES);

  // ---------------- the stream ----------------
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rngOf = s => ((G.DLC && G.DLC.rng) || mulberry)(s);
  function seedOf(seed, route, floor, k) {
    let h = 0x811c9dc5 ^ (seed | 0);
    const s = route + ':' + floor + ':' + (k | 0);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  // ---------------- grid helpers ----------------
  const N = W * H;
  const at = (x, y) => y * W + x;
  const inner = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function walls8(g, x, y) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || g[at(xx, yy)] === WALL) n++;
    }
    return n;
  }
  /** BFS steps over non-wall tiles from `start` (index); -1 = unreachable. */
  function bfs(g, start, pass) {
    const d = new Int32Array(N).fill(-1), q = new Int32Array(N);
    let h = 0, t = 0;
    d[start] = 0; q[t++] = start;
    while (h < t) {
      const i = q[h++], x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of D4) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = at(xx, yy);
        if (d[j] >= 0 || !(pass ? pass(j) : g[j] !== WALL)) continue;
        d[j] = d[i] + 1; q[t++] = j;
      }
    }
    return d;
  }

  // ---------------- carving ----------------
  function shapeOf(r, route, floor) {
    const c = cadence(floor);
    if (c.guardian) return 'guardian';
    if (c.arena) return 'clearing';
    let v = r(), s = 'caves';
    for (const [k, p] of K.SHAPES) { if (v < p) { s = k; break; } v -= p; }
    if (s === 'islands' && ROUTES[route].noIslands) s = 'clearing';
    return s;
  }
  function carve(r, shape, route) {
    const R = ROUTES[route];
    const fill = shape === 'maze' ? K.FILL.maze : shape === 'islands' ? K.FILL.islands : R.lush ? K.FILL.lush : K.FILL.rest;
    let g = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[at(x, y)] = !inner(x, y) || r() < fill ? WALL : FLOOR;
    for (let p = 0; p < K.PASSES; p++) {
      const n = new Uint8Array(N);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!inner(x, y)) { n[at(x, y)] = WALL; continue; }
        const c = walls8(g, x, y);
        n[at(x, y)] = c >= 5 || (p < 3 && c === 0) ? WALL : c === 4 ? g[at(x, y)] : FLOOR;   // (4 neighbours: unchanged)
      }
      g = n;
    }
    if (shape === 'clearing') {   // a carved ellipse in the middle (and a ring of floor round it, joined to the caves)
      const cx = W / 2, cy = H / 2, rx = W * 0.26, ry = H * 0.28;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) g[at(x, y)] = FLOOR;
    }
    // 1-tile pillars go; diagonal leaks (two walls touching only at a corner) close
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = at(x, y);
      if (g[i] === WALL && D4.every(([dx, dy]) => g[at(x + dx, y + dy)] !== WALL)) g[i] = FLOOR;
    }
    for (let y = 1; y < H - 2; y++) for (let x = 1; x < W - 2; x++) {
      const a = g[at(x, y)] === WALL, b = g[at(x + 1, y)] === WALL, c = g[at(x, y + 1)] === WALL, d = g[at(x + 1, y + 1)] === WALL;
      if (a && d && !b && !c) g[at(x + 1, y)] = WALL;
      else if (b && c && !a && !d) g[at(x, y)] = WALL;
    }
    // the largest region stays
    const lab = new Int32Array(N).fill(-1);
    let best = -1, bestN = 0, id = 0;
    for (let i = 0; i < N; i++) {
      if (g[i] === WALL || lab[i] >= 0) continue;
      const d = bfs(g, i);
      let n = 0;
      for (let j = 0; j < N; j++) if (d[j] >= 0) { lab[j] = id; n++; }
      if (n > bestN) { bestN = n; best = id; }
      id++;
    }
    for (let i = 0; i < N; i++) if (g[i] !== WALL && lab[i] !== best) g[i] = WALL;
    return { g, open: bestN / ((W - 2) * (H - 2)) };
  }
  /** The guardian floor: a fixed oval arena (radius ARENA_R) at the far end, a corridor to it, a camp room at the start. */
  function guardian() {
    const g = new Uint8Array(N).fill(WALL);
    const ell = (cx, cy, rx, ry) => { for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) g[at(x, y)] = FLOOR; };
    ell(10, H / 2, 6, 6);                      // the camp
    for (let x = 10; x <= 40; x++) for (let y = H / 2 - 1; y <= H / 2 + 1; y++) g[at(x, y)] = FLOOR;   // the corridor (the gate: x = 26)
    ell(40, H / 2, K.ARENA_R + 2, K.ARENA_R);  // the arena
    return { g, open: 0 };
  }

  // ---------------- placing ----------------
  function wallDist(g) {   // steps to the nearest wall, for "the most open tile"
    const d = new Int32Array(N).fill(-1), q = new Int32Array(N);
    let h = 0, t = 0;
    for (let i = 0; i < N; i++) if (g[i] === WALL) { d[i] = 0; q[t++] = i; }
    while (h < t) {
      const i = q[h++], x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of D4) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = at(xx, yy);
        if (d[j] < 0) { d[j] = d[i] + 1; q[t++] = j; }
      }
    }
    return d;
  }
  function los(g, a, b) {   // Bresenham over the tiles: no wall between a and b
    let x0 = a % W, y0 = (a / W) | 0;
    const x1 = b % W, y1 = (b / W) | 0, dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      if (g[at(x0, y0)] === WALL) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  const pt = i => [i % W, (i / W) | 0];
  const pick = (r, a) => a[Math.floor(r() * a.length)];

  function layout(opt) {
    const seed = opt.seed | 0, route = ROUTES[opt.route] ? opt.route : 'forest', floor = Math.max(1, opt.floor | 0), R = ROUTES[route];
    const r0 = rngOf(seedOf(seed, route, floor, 0));
    const shape = shapeOf(r0, route, floor), c = cadence(floor);
    let g, open = 0, tries = 0;
    if (shape === 'guardian') ({ g, open } = guardian());
    else {
      const need = shape === 'maze' ? K.OPEN_MAZE : K.OPEN;
      let best = null;
      for (tries = 1; tries <= K.TRIES; tries++) {
        const t = carve(rngOf(seedOf(seed, route, floor, tries)), shape, route);
        if (!best || t.open > best.open) best = t;
        if (t.open >= need) break;
      }
      tries = Math.min(tries, K.TRIES);
      g = best.g; open = best.open;
    }
    const r = rngOf(seedOf(seed, route, floor, 99));
    const kind = g, prop = new Uint8Array(N);
    // spawn: the most open tile (on a guardian floor: the camp's centre)
    let spawn;
    if (shape === 'guardian') spawn = at(10, H / 2);
    else {
      const wd = wallDist(g);
      let m = -1;
      for (let i = 0; i < N; i++) if (g[i] !== WALL && wd[i] > m) { m = wd[i]; spawn = i; }
    }
    // stairs: >= 90 % of the longest walk, out of sight when possible (guardian: behind the arena)
    let d = bfs(g, spawn), stairs, far = 0;
    for (let i = 0; i < N; i++) if (d[i] > far) far = d[i];
    if (shape === 'guardian') stairs = at(40 + K.ARENA_R - 1, H / 2);
    else {
      const cand = [];
      for (let i = 0; i < N; i++) if (d[i] >= far * K.STAIRS_AT) cand.push(i);
      const hid = cand.filter(i => !los(g, spawn, i));
      stairs = pick(r, hid.length ? hid : cand);
    }
    // the path: back from the stairs down the BFS
    const path = [stairs];
    for (let i = stairs; i !== spawn;) {
      const x = i % W, y = (i / W) | 0;
      let nx = -1;
      for (const [dx, dy] of D4) { const j = at(x + dx, y + dy); if (d[j] === d[i] - 1) { nx = j; break; } }
      if (nx < 0) break;
      path.push(nx); i = nx;
    }
    path.reverse();
    const onPath = new Uint8Array(N);
    for (const i of path) onPath[i] = 1;
    const near = (i, j, k) => Math.abs(i % W - j % W) + Math.abs(((i / W) | 0) - ((j / W) | 0)) < k;
    // water: the route's lakes (never on the path: there it is a bridge; never by the spawn or stairs); then grass tufts
    const blob = (put, ok) => {
      const cand = [];
      for (let i = 0; i < N; i++) if (g[i] === FLOOR && !onPath[i] && ok(i)) cand.push(i);
      if (!cand.length) return;
      const c0 = pick(r, cand), rx = 2 + r() * 3, ry = 2 + r() * 2.5, cx = c0 % W, cy = (c0 / W) | 0;
      for (let y = Math.max(1, cy - 6); y <= Math.min(H - 2, cy + 6); y++) for (let x = Math.max(1, cx - 6); x <= Math.min(W - 2, cx + 6); x++) {
        const i = at(x, y);
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 + (r() - 0.5) * 0.3 && ok(i)) put(i);
      }
    };
    const clear = i => !near(i, spawn, 6) && !near(i, stairs, 4);
    if (shape !== 'guardian') {
      const lakes = shape === 'islands' ? 8 : R.lakes;
      for (let k = 0; k < lakes; k++) blob(i => { if (g[i] === FLOOR && !onPath[i]) kind[i] = LIQUID; }, clear);
      for (let k = 0; k < (R.grass || 0); k++) blob(i => { if (kind[i] === FLOOR) prop[i] = GRASS; }, i => !near(i, spawn, 4));
    }
    // liquid never cuts the floor in two: anything the spawn can't reach on foot (path excepted) goes back to floor
    {
      const dl = bfs(kind, spawn, j => kind[j] === FLOOR);
      for (let i = 0; i < N; i++) if (kind[i] === FLOOR && dl[i] < 0) kind[i] = LIQUID;
      if (dl[stairs] < 0) for (const i of path) kind[i] = FLOOR;
    }
    // secret pockets (PokéDive's): a corridor tile off the path whose plugging seals 3-40 tiles from the rest becomes a BOULDER
    // (a Rock / Ground / Fighting / Steel Pokémon breaks it) or a THICKET (a Fire type burns it); a chest waits at the far end.
    // Placed before the rescue, the groups and the chests, which then only ever use what the spawn reaches.
    const plugs = [];
    if (shape !== 'guardian') {
      const want = r() < K.POCKET2 ? 2 : 1, cand = [], sealed = new Set();   // (sealed: the tiles of the pockets made so far)
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = at(x, y);
        if (kind[i] !== FLOOR || onPath[i] || near(i, spawn, 6) || near(i, stairs, 4)) continue;
        if (D4.filter(([dx, dy]) => kind[at(x + dx, y + dy)] === FLOOR).length === 2) cand.push(i);
      }
      for (let k = cand.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [cand[k], cand[j]] = [cand[j], cand[k]]; }
      for (let t = 0; t < Math.min(cand.length, K.POCKET_TRIES) && plugs.length < want; t++) {
        const i = cand[t];
        if (kind[i] !== FLOOR || plugs.some(pg => near(i, at(pg.at[0], pg.at[1]), 6))) continue;
        kind[i] = WALL;
        const dd = bfs(kind, spawn, j => kind[j] === FLOOR), pocket = [];
        let bad = dd[stairs] < 0;
        for (let j = 0; j < N && !bad; j++) if (kind[j] === FLOOR && dd[j] < 0 && !sealed.has(j)) { pocket.push(j); if (onPath[j] || pocket.length > K.POCKET[1]) bad = true; }
        if (bad || pocket.length < K.POCKET[0]) { kind[i] = FLOOR; continue; }
        for (const j of pocket) sealed.add(j);
        // the chest: the pocket tile farthest from the plug
        let far = pocket[0], fd = -1;
        for (const j of pocket) { const v = Math.abs(j % W - i % W) + Math.abs(((j / W) | 0) - ((i / W) | 0)); if (v > fd) { fd = v; far = j; } }
        plugs.push({ at: pt(i), kind: route === 'crater' || r() < 0.5 ? 'boulder' : 'thicket', size: pocket.length, chest: pt(far) });
      }
      // too few natural ones: carve one into the rock: a floor tile at the cave's edge, a 2-tile tunnel straight into solid
      // wall (its mouth is the plug), then a 3 x 3 room, all of it solid rock with a wall all round before
      const solid = (x, y) => x > 1 && y > 1 && x < W - 2 && y < H - 2 && kind[at(x, y)] === WALL;
      const edge = [], reach0 = bfs(kind, spawn, j => kind[j] === FLOOR);   // (only off the floor you can walk: never inside another pocket)
      for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const i = at(x, y); if (kind[i] === FLOOR && reach0[i] >= 0 && !onPath[i] && !near(i, spawn, 6) && !near(i, stairs, 5)) edge.push(i); }
      for (let t = 0; t < 400 && plugs.length < want && edge.length; t++) {
        const i = edge[Math.floor(r() * edge.length)], x = i % W, y = (i / W) | 0, [dx, dy] = D4[Math.floor(r() * 4)];
        const tun = [[x + dx, y + dy], [x + 2 * dx, y + 2 * dy]], cx = x + 4 * dx, cy = y + 4 * dy, room = [];
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) room.push([cx + ox, cy + oy]);
        // every carved tile and its whole ring must be rock (but the mouth, which touches the cave)
        const carve = tun.concat(room), ring = new Set();
        for (const [tx, ty] of carve) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) ring.add(at(tx + ox, ty + oy));
        for (const [tx, ty] of carve) ring.delete(at(tx, ty));
        ring.delete(i);
        const mouth = at(tun[0][0], tun[0][1]);
        let ok = carve.every(([tx, ty]) => solid(tx, ty));
        if (ok) for (const j of ring) { if (kind[j] !== WALL && !(Math.abs(j % W - x) + Math.abs(((j / W) | 0) - y) <= 1)) { ok = false; break; } }
        if (!ok || plugs.some(pg => near(mouth, at(pg.at[0], pg.at[1]), 6))) continue;
        for (const [tx, ty] of carve) kind[at(tx, ty)] = FLOOR;
        kind[mouth] = WALL;   // (the plug)
        plugs.push({ at: [tun[0][0], tun[0][1]], kind: route === 'crater' || r() < 0.5 ? 'boulder' : 'thicket', size: carve.length - 1, chest: [cx + dx, cy + dy], carved: true });
      }
    }
    d = bfs(kind, spawn, j => kind[j] === FLOOR);
    const sd = d[stairs];
    // the lost Pokémon
    let rescue = null;
    if (shape !== 'guardian') {
      const cand = [];
      for (let i = 0; i < N; i++) if (kind[i] === FLOOR && d[i] >= sd * K.RESCUE[0] && d[i] <= sd * K.RESCUE[1] && !near(i, stairs, K.RESCUE_FAR)) cand.push(i);
      if (!cand.length) for (let i = 0; i < N; i++) if (kind[i] === FLOOR && d[i] >= sd * K.RESCUE[0] && d[i] <= sd * K.RESCUE[1]) cand.push(i);
      rescue = cand.length ? pick(r, cand) : path[path.length >> 1];
    }
    // foe groups: the guards on the path first, then the rest spread out
    let floorN = 0;
    for (let i = 0; i < N; i++) if (kind[i] === FLOOR) floorN++;
    const groups = [];
    if (shape !== 'guardian') {
      const want = Math.max(2, Math.round(floorN / K.GROUP_TILES));
      for (const f of K.GUARDS) { const i = path[Math.floor(path.length * f)]; if (i != null && d[i] >= K.GROUP_FAR) groups.push({ at: pt(i), guard: true }); }
      const cand = [];
      for (let i = 0; i < N; i++) if (kind[i] === FLOOR && d[i] >= K.GROUP_FAR) cand.push(i);
      for (let k = 0; groups.length < want && k < want * 8 && cand.length; k++) {
        const i = pick(r, cand), [x, y] = pt(i);
        if (groups.some(o => Math.abs(o.at[0] - x) + Math.abs(o.at[1] - y) < 8)) continue;
        groups.push({ at: [x, y], guard: false });
      }
    }
    // chests: wall-hugging, apart
    const chests = [];
    if (shape !== 'guardian') {
      const want = 1 + (r() < K.CHEST[0] ? 1 : 0) + (r() < K.CHEST[1] ? 1 : 0);
      const cand = [];
      for (let i = 0; i < N; i++) {
        if (kind[i] !== FLOOR || onPath[i] || near(i, spawn, 8)) continue;
        const x = i % W, y = (i / W) | 0;
        if (D4.filter(([dx, dy]) => kind[at(x + dx, y + dy)] === WALL).length >= 2) cand.push(i);
      }
      for (let k = 0; chests.length < want && k < 60 && cand.length; k++) {
        const i = pick(r, cand), [x, y] = pt(i);
        if (chests.some(o => Math.abs(o[0] - x) + Math.abs(o[1] - y) < K.CHEST_GAP)) continue;
        chests.push([x, y]);
      }
    }
    // a landmark on 40 % of the plain floors
    let landmark = null;
    if (!c.arena && !c.guardian && r() < K.LANDMARK) {
      const cand = [];
      for (let i = 0; i < N; i++) if (kind[i] === FLOOR && !onPath[i] && d[i] > 10 && !near(i, stairs, 6)) cand.push(i);
      if (cand.length) landmark = { kind: R.landmark, at: pt(pick(r, cand)) };
    }
    return { seed, route, floor, w: W, h: H, kind, prop, shape, open: Math.round(open * 1000) / 1000, tries,
             spawn: pt(spawn), stairs: pt(stairs), stairsSteps: sd, farSteps: far, path: path.map(pt), rescue: rescue != null ? pt(rescue) : null,
             groups, chests, landmark, plugs, cadence: c, floorTiles: floorN };
  }

  /** PokéDive's rhythm: the alpha every 5th floor, the guardian every 25th, the Escape Rope on the 10s and every 25th. */
  function cadence(floor) {
    floor |= 0;
    return { arena: floor % 5 === 0, guardian: floor % 25 === 0, rope: floor % 10 === 0 || floor % 25 === 0 };
  }

  /** The layout as an Expedition zone (G.ExpTerrain.custom), spawn tile at the world origin. */
  function zone(L, seed) {
    const T = G.ExpTerrain;
    const z = T.custom({ seed: seed | 0, map: 'dive:' + L.route, zone: L.floor, w: L.w, h: L.h, x0: -L.spawn[0], y0: -L.spawn[1],
                         kind: L.kind, prop: L.prop });
    z.dive = L;
    return z;
  }

  return { W, H, K, ROUTES, ROUTE_IDS, FLOOR, WALL, LIQUID, GRASS, layout, cadence, zone, seedOf };
})();
