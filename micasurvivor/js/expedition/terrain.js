'use strict';
/* ============ expedition/terrain.js — the Expedition's terrain layers (MicaSurvivor DLC D1, not upstream) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load(), js/systems/expedition.js); a base page never runs it.
 * An Expedition zone is a BOUNDED map (W × H tiles, centred on the world origin; outside it is rock) with a height per
 * tile, 0..3, the GBA look of Pokémon's ledges and stairs (Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 5.2):
 *
 *   generate({seed, map, zone})  the zone, from the run's world seed + the map + the zone number, with its own seeded
 *                                stream (G.DLC.rng, mulberry32): never Math.random, so a co-op guest, a replay and a
 *                                spectator rebuild the SAME zone from {seed, map, zone} (the `x` block, v1) and terrain
 *                                is never streamed. Steps: value-noise heights cut into 4 levels (per map profile), a
 *                                flat clearing at the spawn, smoothing (no 1-tile ridges / trenches, neighbours differ by
 *                                at most 1, no plateau under MIN_AREA tiles), rock outcrops, ponds on low flat ground,
 *                                then RAMPS until a flood-fill from the spawn reaches every walkable tile (and extra ramps
 *                                along long cliffs), then props (trees, rocks, tall grass) that can never cut a path.
 *   custom(spec)                 a zone from explicit heights / ramps / kinds (tests; later a hand-made shrine)
 *   zone.mask(tx, ty)            the layers a tile joins, as bits: a plain tile at height h is 1<<h, a ramp at h is
 *                                (1<<h)|(1<<(h+1)), a wall (or outside the zone) is 0. Two tiles connect if their masks
 *                                share a bit: walking across a cliff edge is blocked, a ramp joins its two levels.
 *                                js/world/world.js (collision: each entity keeps the mask of its last good tile, zMask)
 *                                and js/systems/pathing.js (the BFS) read only this.
 *   zone.layer(tx, ty)           the height an entity standing there is at (a ramp: h + 0.5): the per-entity z / layer
 *                                field D2's verbs (hop, slide, glide, climb, surf, bounce) build on (entity.layer)
 *   zone.paint(canvas, ...)      the code tile painter: over the base chunk image (world/tiles.js), height tint, cliff
 *                                faces on the south edge of a higher tile, ledge lips, side edges, drop shadows and
 *                                stairs, in the biome's own palette (no image assets)
 *   zone.mini(rgb, tx, ty)       the minimap shading by height (js/ui/minimap.js)
 *   zone.hash                    FNV-1a of the whole zone (heights, kinds, ramps, props; D2: bounce pads): what the `x`
 *                                block carries so a viewer can check that its rebuild matches the host's
 *   zone.deep(tx, ty)            DLC D2: deep liquid (a liquid tile with liquid on all 4 sides): only a surfer (a Water type,
 *                                js/expedition/verbs.js) or something airborne goes over it; the shallow rim only slows
 *   zone.pads / padAt(tx, ty)    DLC D2: bounce pads [tx, ty, dir] at the foot of a cliff (a mushroom, painted in code):
 *                                stepping on one throws you 2 tiles that way, onto the plateau above (verbs.js)
 * Flying and ghost (hovering) enemies and bosses ignore all of this, as they ignore walls today (they never collide).
 */
G.DLC = G.DLC || {};
/** The Expedition's seeded stream (mulberry32): rng(seed) -> () => [0, 1). Base code never calls it. */
G.DLC.rng = G.DLC.rng || function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

G.ExpTerrain = (() => {
  const XV = 2;                 // the `x` block's schema: {xv, m, z, th} (D2: + `a`, the airborne state; v1 still read)
  const W = 120, H = 120;       // tiles per zone (5.1: "e.g. 120×120 tiles")
  const X0 = -W / 2, Y0 = -H / 2;
  const FLOOR = 0, WALL = 1, LIQUID = 2;
  const MAXH = 3, MIN_AREA = 14, SPAWN_R = 7;
  const NONE = 0, TREE = 1, ROCK = 2, GRASS = 3;
  const PROP_NAME = [null, 'tree', 'rock', 'grass'];
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // ramp up-directions: 1 N, 2 E, 3 S, 4 W (0 = not a ramp)
  // per map: where the noise is cut into levels 1..3, rock outcrops, ponds (noise thresholds), trees, grass, ramps
  const PROFILES = {
    viridian: { cuts: [0.44, 0.58, 0.72], walls: 0.83, ponds: 0.73, trees: 0.045, grove: 0.62, grass: 0.62, rampEvery: 34 },
    mtmoon:   { cuts: [0.36, 0.5, 0.63], walls: 0.74, ponds: 0.9, trees: 0.008, grove: 0.8, grass: 0.8, rampEvery: 44 },
    cerulean: { cuts: [0.5, 0.64, 0.78], walls: 0.9, ponds: 0.6, trees: 0.025, grove: 0.7, grass: 0.66, rampEvery: 30 }
  };
  const MAPS = ['viridian', 'mtmoon', 'cerulean'];

  // ---------------- seeds and noise ----------------
  function mix(...vals) {
    let h = 0x9E3779B9 | 0;
    for (const v of vals) {
      h ^= v | 0;
      h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
      h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
      h ^= h >>> 16;
    }
    return h >>> 0;
  }
  /** The zone's seed: the run's world seed, the map and the zone number. */
  const zoneSeed = (seed, map, zone) => mix(seed | 0, MAPS.indexOf(map) + 1, zone | 0, 0xD1);

  /** Value noise on a lattice of `step` tiles, filled from the stream (smooth, bilinear with smoothstep). */
  function lattice(rng, step) {
    const gw = Math.ceil(W / step) + 2, gh = Math.ceil(H / step) + 2;
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    return (x, y) => {
      const fx = x / step, fy = y / step, xi = Math.floor(fx), yi = Math.floor(fy);
      let u = fx - xi, v = fy - yi;
      u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
      const a = g[yi * gw + xi], b = g[yi * gw + xi + 1], c = g[(yi + 1) * gw + xi], d = g[(yi + 1) * gw + xi + 1];
      return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
    };
  }

  // ---------------- the zone object ----------------
  /** Wraps the grids (local index i = y * w + x) in the queries the world, pathing, painter and minimap use. */
  function makeZone(o) {
    const { w, h, x0, y0, hgt, kind, ramp, prop } = o;
    const idx = (tx, ty) => { const x = tx - x0, y = ty - y0; return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x; };
    const maskI = i => kind[i] === WALL ? 0 : ramp[i] ? (1 << hgt[i]) | (1 << Math.min(MAXH, hgt[i] + 1)) : 1 << hgt[i];
    // DLC D2: the bounce pads, by tile ("tx,ty" -> [tx, ty, dir])
    const pads = (o.pads || []).map(p => [p[0] | 0, p[1] | 0, p[2] | 0]), padMap = new Map(pads.map(p => [p[0] + ',' + p[1], p]));
    const liq = (tx, ty) => { const i = idx(tx, ty); return i >= 0 && kind[i] === LIQUID; };
    const z = {
      xv: XV, seed: o.seed, map: o.map, zone: o.zone, w, h, x0, y0, hgt, kind, ramp, prop, spawn: o.spawn, pads,
      stats: o.stats || {}, painted: 0,
      deep: (tx, ty) => liq(tx, ty) && liq(tx + 1, ty) && liq(tx - 1, ty) && liq(tx, ty + 1) && liq(tx, ty - 1),
      padAt: (tx, ty) => padMap.get(tx + ',' + ty) || null,
      inside: (tx, ty) => idx(tx, ty) >= 0,
      terr(tx, ty) { const i = idx(tx, ty); return i < 0 ? WALL : kind[i]; },
      height(tx, ty) { const i = idx(tx, ty); return i < 0 ? 0 : hgt[i]; },
      mask(tx, ty) { const i = idx(tx, ty); return i < 0 ? 0 : maskI(i); },
      rampDir(tx, ty) { const i = idx(tx, ty); return i < 0 ? 0 : ramp[i]; },
      layer(tx, ty) { const i = idx(tx, ty); return i < 0 ? 0 : hgt[i] + (ramp[i] ? 0.5 : 0); },
      propAt(tx, ty) { const i = idx(tx, ty); return i < 0 ? null : PROP_NAME[prop[i]]; },
      /** The `x` block (v1) that rebuilds this zone anywhere: {xv, m, z, th}. */
      xblock() { return { xv: XV, m: z.map, z: z.zone, th: z.hash }; }
    };
    z.hash = hashOf(z);
    z.paint = (cv, tx0, ty0, n, bi) => paint(z, cv, tx0, ty0, n, bi);
    z.mini = (c, tx, ty) => mini(z, c, tx, ty);
    return z;
  }
  function hashOf(z) {
    let hh = 0x811c9dc5;
    const add = v => { hh ^= v & 255; hh = Math.imul(hh, 0x01000193); };
    for (const a of [z.hgt, z.kind, z.ramp, z.prop]) for (let i = 0; i < a.length; i++) add(a[i]);
    add(z.w); add(z.h); add(z.x0); add(z.y0);
    for (const p of z.pads) { add(p[0]); add(p[0] >> 8); add(p[1]); add(p[1] >> 8); add(p[2]); }   // (DLC D2; no pads: as D1)
    return (hh >>> 0).toString(16).padStart(8, '0');
  }

  // ---------------- grid helpers ----------------
  const N4 = (i, w, h, fn) => {
    const x = i % w, y = (i / w) | 0;
    if (y > 0) fn(i - w, 1); if (x < w - 1) fn(i + 1, 2); if (y < h - 1) fn(i + w, 3); if (x > 0) fn(i - 1, 4);
  };
  /** 4-connected components of equal height over land (not walls, not liquid). -> {lab: Int32Array, sizes: []} */
  function components(w, h, hgt, kind) {
    const lab = new Int32Array(w * h).fill(-1), sizes = [], q = new Int32Array(w * h);
    for (let s = 0; s < w * h; s++) {
      if (lab[s] >= 0 || kind[s] !== FLOOR) continue;
      const id = sizes.length;
      let head = 0, tail = 0, n = 0;
      lab[s] = id; q[tail++] = s;
      while (head < tail) {
        const c = q[head++]; n++;
        N4(c, w, h, nb => { if (lab[nb] < 0 && kind[nb] === FLOOR && hgt[nb] === hgt[c]) { lab[nb] = id; q[tail++] = nb; } });
      }
      sizes.push(n);
    }
    return { lab, sizes };
  }
  /** Tiles reachable from `start` walking: neighbours whose layer masks share a bit (the game's own rule). */
  function reachable(z, start, landOnly) {
    const { w, h, kind } = z, seen = new Uint8Array(w * h), q = new Int32Array(w * h);
    const m = i => { const x = i % w, y = (i / w) | 0; return z.mask(x + z.x0, y + z.y0); };
    let head = 0, tail = 0;
    seen[start] = 1; q[tail++] = start;
    while (head < tail) {
      const c = q[head++], mc = m(c);
      N4(c, w, h, nb => {
        if (seen[nb] || (landOnly && kind[nb] !== FLOOR)) return;
        if (m(nb) & mc) { seen[nb] = 1; q[tail++] = nb; }
      });
    }
    return seen;
  }

  // ---------------- the generator ----------------
  function generate(opt) {
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    const map = MAPS.includes(opt.map) ? opt.map : MAPS[0], zn = opt.zone | 0 || 1;
    const P = PROFILES[map];
    const rng = G.DLC.rng(zoneSeed(opt.seed, map, zn));
    const w = W, h = H, n = w * h, cx = -X0, cy = -Y0;
    const hgt = new Uint8Array(n), kind = new Uint8Array(n), ramp = new Uint8Array(n), prop = new Uint8Array(n);
    const d2c = i => { const x = i % w - cx, y = ((i / w) | 0) - cy; return Math.sqrt(x * x + y * y); };

    // 1) heights: three octaves, cut into 0..3
    const o1 = lattice(rng, 17), o2 = lattice(rng, 8), o3 = lattice(rng, 4);
    for (let i = 0; i < n; i++) {
      const x = i % w, y = (i / w) | 0;
      const v = o1(x, y) * 0.62 + o2(x, y) * 0.28 + o3(x, y) * 0.1;
      let lv = 0;
      for (const c of P.cuts) if (v > c) lv++;
      hgt[i] = lv;
    }
    // 2) a flat clearing where the run starts
    const spawnH = hgt[cy * w + cx];
    const clearing = () => { for (let i = 0; i < n; i++) if (d2c(i) <= SPAWN_R) hgt[i] = spawnH; };
    clearing();
    // 3) smoothing: no 1-wide ridges / trenches, neighbours at most 1 apart, no tiny plateaus
    for (let it = 0; it < 6; it++) {
      let changed = 0;
      for (let i = 0; i < n; i++) {
        const x = i % w, y = (i / w) | 0, v = hgt[i];
        const N = y > 0 ? hgt[i - w] : v, S = y < h - 1 ? hgt[i + w] : v, E = x < w - 1 ? hgt[i + 1] : v, Wv = x > 0 ? hgt[i - 1] : v;
        let nv = v;
        if (nv > N && nv > S) nv = Math.max(N, S); else if (nv < N && nv < S) nv = Math.min(N, S);
        if (nv > E && nv > Wv) nv = Math.max(E, Wv); else if (nv < E && nv < Wv) nv = Math.min(E, Wv);
        if (nv !== v) { hgt[i] = nv; changed++; }
      }
      for (let pass = 0; pass < MAXH + 1; pass++) {
        for (let i = 0; i < n; i++) {
          let lo = hgt[i];
          N4(i, w, h, nb => { if (hgt[nb] < lo) lo = hgt[nb]; });
          if (hgt[i] > lo + 1) { hgt[i] = lo + 1; changed++; }
        }
      }
      const { lab, sizes } = components(w, h, hgt, kind);
      for (let i = 0; i < n; i++) {
        if (sizes[lab[i]] >= MIN_AREA) continue;
        const votes = [0, 0, 0, 0];
        N4(i, w, h, nb => { if (lab[nb] !== lab[i]) votes[hgt[nb]]++; });
        let best = hgt[i], bv = 0;
        for (let k = 0; k <= MAXH; k++) if (votes[k] > bv) { bv = votes[k]; best = k; }
        if (best !== hgt[i]) { hgt[i] = best; changed++; }
      }
      clearing();
      if (!changed) break;
    }
    // (a last |dh| <= 1 pass: the clearing may have re-made a step of 2)
    for (let pass = 0; pass < MAXH + 1; pass++) for (let i = 0; i < n; i++) {
      if (d2c(i) <= SPAWN_R) continue;
      let lo = 9, hi = -1;
      N4(i, w, h, nb => { if (hgt[nb] < lo) lo = hgt[nb]; if (hgt[nb] > hi) hi = hgt[nb]; });
      if (hgt[i] > lo + 1) hgt[i] = lo + 1;
      if (hgt[i] < hi - 1) hgt[i] = hi - 1;
    }
    const flat8 = i => {
      const x = i % w, y = (i / w) | 0;
      if (x < 1 || y < 1 || x > w - 2 || y > h - 2) return false;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const j = i + b * w + a; if (hgt[j] !== hgt[i] || kind[j] !== FLOOR || ramp[j]) return false; }
      return true;
    };
    // 4) rock outcrops (walls) on flat ground, away from the clearing
    const wn = lattice(rng, 5), pn = lattice(rng, 7), gn = lattice(rng, 9), grn = lattice(rng, 6);
    const wallAt = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (d2c(i) > SPAWN_R + 4 && wn(i % w, (i / w) | 0) > P.walls && flat8(i)) wallAt[i] = 1;
    for (let i = 0; i < n; i++) if (wallAt[i]) kind[i] = WALL;
    // 5) ponds on low, flat ground
    const pondAt = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (hgt[i] === 0 && d2c(i) > SPAWN_R + 3 && pn(i % w, (i / w) | 0) > P.ponds && flat8(i)) pondAt[i] = 1;
    for (let i = 0; i < n; i++) if (pondAt[i]) kind[i] = LIQUID;
    const start = cy * w + cx;
    // 6) land cut off by rock or water (whatever the heights): rock. Water out of reach: rock too.
    {
      const seen = new Uint8Array(n), q = new Int32Array(n);
      let head = 0, tail = 0;
      seen[start] = 1; q[tail++] = start;
      while (head < tail) { const c = q[head++]; N4(c, w, h, nb => { if (!seen[nb] && kind[nb] === FLOOR) { seen[nb] = 1; q[tail++] = nb; } }); }
      for (let i = 0; i < n; i++) if (kind[i] === FLOOR && !seen[i]) kind[i] = WALL;
      // the water you can reach: through the ponds from that land
      head = 0; tail = 0;
      for (let i = 0; i < n; i++) if (seen[i]) q[tail++] = i;
      while (head < tail) { const c = q[head++]; N4(c, w, h, nb => { if (!seen[nb] && kind[nb] === LIQUID) { seen[nb] = 1; q[tail++] = nb; } }); }
      for (let i = 0; i < n; i++) if (kind[i] === LIQUID && !seen[i]) kind[i] = WALL;
    }
    const z = { w, h, x0: X0, y0: Y0, hgt, kind, ramp, prop };
    const tmp = () => makeZoneLite(z);
    // 7) ramps until every land tile is reachable from the spawn
    let ramps = 0, guard = 0;
    const isLand = i => kind[i] === FLOOR;
    const weightOf = (L, dir) => {
      // stairs up to the north read best (the cliff face is on the south side of a plateau); a ramp wants flat
      // ground of its own level behind it and isn't put next to another ramp
      let wgt = dir === 1 ? 4 : dir === 3 ? 1.5 : 2;
      const [dx, dy] = DIRS[dir - 1], x = L % w, y = (L / w) | 0, bx = x - dx, by = y - dy;
      if (bx < 0 || by < 0 || bx >= w || by >= h || !isLand(by * w + bx) || hgt[by * w + bx] !== hgt[L]) wgt *= 0.2;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const xx = x + a, yy = y + b; if (xx >= 0 && yy >= 0 && xx < w && yy < h && ramp[yy * w + xx]) wgt *= 0.1; }
      return wgt;
    };
    for (;;) {
      if (++guard > 400) break;
      const seen = reachable(tmp(), start, true);
      const cand = [];
      let missing = 0;
      for (let i = 0; i < n; i++) {
        if (!isLand(i) || seen[i]) continue;
        missing++;
        N4(i, w, h, (nb, d) => {
          if (!seen[nb] || !isLand(nb)) return;
          const dh = hgt[nb] - hgt[i];
          if (dh === 1 && !ramp[i]) cand.push([i, d]);                   // the unreached tile is the lower one: its ramp goes up to nb
          else if (dh === -1 && !ramp[nb]) cand.push([nb, ((d + 1) % 4) + 1]);   // the reached one is lower: up the opposite way
        });
      }
      if (!missing || !cand.length) break;
      let tot = 0;
      const wts = cand.map(([L, d]) => (tot += weightOf(L, d)));
      const r = rng() * tot;
      let k = 0;
      while (k < wts.length - 1 && wts[k] < r) k++;
      ramp[cand[k][0]] = cand[k][1];
      ramps++;
    }
    // 8) extra ramps along long cliffs (between the same two plateaus), spaced out
    let extra = 0;
    {
      const { lab } = components(w, h, hgt, kind);
      const pairs = new Map();
      for (let i = 0; i < n; i++) {
        if (!isLand(i)) continue;
        N4(i, w, h, (nb, d) => {
          if (!isLand(nb) || hgt[nb] !== hgt[i] + 1) return;
          const key = lab[i] + ':' + lab[nb];
          let p = pairs.get(key);
          if (!p) pairs.set(key, p = { cand: [], have: [] });
          if (ramp[i]) p.have.push(i); else p.cand.push([i, d]);
        });
      }
      for (const p of pairs.values()) {
        const want = 1 + Math.floor((p.cand.length + p.have.length) / P.rampEvery);
        const list = p.cand.slice();
        for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = list[i]; list[i] = list[j]; list[j] = t; }
        for (const [L, d] of list) {
          if (p.have.length >= want) break;
          const x = L % w, y = (L / w) | 0;
          if (ramp[L] || weightOf(L, d) < 0.5) continue;
          if (p.have.some(o => Math.max(Math.abs(o % w - x), Math.abs(((o / w) | 0) - y)) < 12)) continue;
          ramp[L] = d; p.have.push(L); extra++;
        }
      }
    }
    // 9) props: solid ones (trees, rocks) only on flat 3×3 ground with no other solid prop around, so none can ever
    //    cut a path; tall grass (not solid) anywhere flat
    let trees = 0, rocks = 0, grass = 0;
    for (let i = 0; i < n; i++) {
      if (!isLand(i) || ramp[i] || d2c(i) <= SPAWN_R - 1) continue;
      const x = i % w, y = (i / w) | 0;
      const r = rng();
      if (flat8(i)) {
        let crowd = false;
        for (let b = -1; b <= 1 && !crowd; b++) for (let a = -1; a <= 1; a++) { const p = prop[i + b * w + a]; if (p === TREE || p === ROCK) { crowd = true; break; } }
        if (!crowd) {
          const grove = gn(x, y) > P.grove;
          if (r < P.trees * (grove ? 5 : 0.35)) { prop[i] = TREE; trees++; continue; }
          if (r > 0.994) { prop[i] = ROCK; rocks++; continue; }
        }
      }
      if (grn(x, y) > P.grass && r > 0.3) { prop[i] = GRASS; grass++; }
    }
    // 10) DLC D2: bounce pads at the foot of cliffs, from their own stream (so the grids above are exactly D1's)
    const pads = placePads({ w, h, hgt, kind, ramp, prop, d2c }, G.DLC.rng(mix(zoneSeed(opt.seed, map, zn), 0xB0)), P.pads || 8);
    const zone = makeZone({ seed: opt.seed | 0, map, zone: zn, w, h, x0: X0, y0: Y0, hgt, kind, ramp, prop, spawn: [0, 0], pads,
      stats: { ramps, extra, trees, rocks, grass, pads: pads.length, ms: 0 } });
    zone.stats.ms = Math.round(((typeof performance !== 'undefined' ? performance : Date).now() - t0) * 10) / 10;
    return zone;
  }
  /**
   * DLC D2: bounce pads. A pad sits on flat ground at height h (no ramp, no prop) at the foot of a cliff: the next tile
   * its way is at h + 1, and so is the one after it (where it throws you), both land with no ramp and no solid prop; the
   * tile behind the pad is at h (you walk onto it). At most `max`, 14 tiles apart, none near the spawn clearing; pads
   * facing north are preferred, like the ramps. -> [[tx, ty, dir]] in world tiles (dir: 1 N, 2 E, 3 S, 4 W)
   */
  function placePads(g, rng, max) {
    const { w, h, hgt, kind, ramp, prop, d2c } = g;
    const ok = i => kind[i] === FLOOR && !ramp[i] && prop[i] !== TREE && prop[i] !== ROCK;
    const cand = [];
    for (let i = 0; i < w * h; i++) {
      if (!ok(i) || prop[i] || hgt[i] >= MAXH || d2c(i) <= SPAWN_R + 2) continue;
      const x = i % w, y = (i / w) | 0;
      for (let d = 1; d <= 4; d++) {
        const [dx, dy] = DIRS[d - 1];
        const at = k => { const xx = x + dx * k, yy = y + dy * k; return xx < 0 || yy < 0 || xx >= w || yy >= h ? -1 : yy * w + xx; };
        const a = at(1), b = at(2), back = at(-1);
        if (a < 0 || b < 0 || back < 0) continue;
        if (!ok(a) || !ok(b) || hgt[a] !== hgt[i] + 1 || hgt[b] !== hgt[i] + 1) continue;
        if (!ok(back) || hgt[back] !== hgt[i]) continue;
        cand.push([i, d, d === 1 ? 3 : 1]);
      }
    }
    // a weighted shuffle (north first), then spaced out
    const keyed = cand.map(c => [rng() / c[2], c]).sort((p, q) => p[0] - q[0]);
    const out = [];
    for (const [, [i, d]] of keyed) {
      if (out.length >= max) break;
      const x = i % w, y = (i / w) | 0;
      if (out.some(o => Math.max(Math.abs(o[0] - x), Math.abs(o[1] - y)) < 14)) continue;
      out.push([x, y, d]);
    }
    return out.map(([x, y, d]) => [x + X0, y + Y0, d]);
  }

  /** The mask queries alone (the generator's flood-fills run on the grids as they change). */
  function makeZoneLite(o) {
    const { w, h, x0, y0, hgt, kind, ramp } = o;
    return { w, h, x0, y0, kind, mask(tx, ty) {
      const x = tx - x0, y = ty - y0;
      if (x < 0 || y < 0 || x >= w || y >= h) return 0;
      const i = y * w + x;
      return kind[i] === WALL ? 0 : ramp[i] ? (1 << hgt[i]) | (1 << Math.min(MAXH, hgt[i] + 1)) : 1 << hgt[i];
    } };
  }

  /**
   * A zone from explicit grids (tests, hand-made zones): {w, h, x0?, y0?, hgt: [..] | (x, y) => h, ramp?: same (0 / 1-4),
   * kind?: same (0 floor, 1 wall, 2 liquid), prop?: same (0 / 1 tree / 2 rock / 3 grass), pads?: [[tx, ty, dir]] (D2)}
   */
  function custom(spec) {
    const w = spec.w | 0, h = spec.h | 0, n = w * h;
    const grid = (src, max) => {
      const a = new Uint8Array(n);
      if (src) for (let i = 0; i < n; i++) a[i] = Math.max(0, Math.min(max, (typeof src === 'function' ? src(i % w, (i / w) | 0) : src[i]) | 0));
      return a;
    };
    return makeZone({ seed: spec.seed | 0, map: spec.map || 'custom', zone: spec.zone | 0, w, h,
      x0: spec.x0 != null ? spec.x0 | 0 : -(w >> 1), y0: spec.y0 != null ? spec.y0 | 0 : -(h >> 1),
      hgt: grid(spec.hgt, MAXH), kind: grid(spec.kind, 2), ramp: grid(spec.ramp, 4), prop: grid(spec.prop, 3), spawn: [0, 0],
      pads: spec.pads || [] });
  }

  /** Every walkable tile of a zone, and how many of them a flood-fill from the spawn reaches (the guarantee). */
  function audit(z) {
    const start = (z.spawn[1] / G.World.TS - z.y0 | 0) * z.w + (z.spawn[0] / G.World.TS - z.x0 | 0);
    const solid = i => z.prop[i] === TREE || z.prop[i] === ROCK;
    const seenLand = reachable(z, start, true), seenAll = reachable(z, start, false);
    let walk = 0, reached = 0, liquid = 0, liquidReached = 0, solidOnPath = 0;
    for (let i = 0; i < z.w * z.h; i++) {
      if (z.kind[i] === FLOOR) { walk++; if (seenLand[i]) reached++; }
      else if (z.kind[i] === LIQUID) { liquid++; if (seenAll[i]) liquidReached++; }
    }
    // the same flood-fill with solid props as walls: still everything (props never cut a path)
    const zz = Object.assign({}, z, { mask: (tx, ty) => { const x = tx - z.x0, y = ty - z.y0; return x < 0 || y < 0 || x >= z.w || y >= z.h || solid(y * z.w + x) ? 0 : z.mask(tx, ty); } });
    const seenP = reachable(zz, start, true);
    let walkP = 0, reachedP = 0;
    for (let i = 0; i < z.w * z.h; i++) if (z.kind[i] === FLOOR && !solid(i)) { walkP++; if (seenP[i]) reachedP++; }
    for (let i = 0; i < z.w * z.h; i++) if (solid(i) && z.ramp[i]) solidOnPath++;
    const levels = [0, 0, 0, 0];
    for (let i = 0; i < z.w * z.h; i++) if (z.kind[i] !== WALL) levels[z.hgt[i]]++;
    return { walk, reached, liquid, liquidReached, walkP, reachedP, solidOnPath, levels };
  }

  // ---------------- the code tile painter ----------------
  const T = () => G.Tiles.T;
  function rgbOf(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  const packRGB = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  const pk = hex => { const c = rgbOf(hex); return packRGB(c[0], c[1], c[2]); };
  function scalePx(v, k) {
    const r = Math.min(255, Math.round((v & 255) * k)), g = Math.min(255, Math.round(((v >>> 8) & 255) * k)), b = Math.min(255, Math.round(((v >>> 16) & 255) * k));
    return packRGB(r, g, b);
  }
  /** The height tint: low ground a little darker, plateaus a little lighter. */
  const TINT = [0.9, 1, 1.09, 1.17];
  const tintOf = lv => lv <= 0 ? TINT[0] : lv >= MAXH ? TINT[MAXH] : TINT[Math.floor(lv)] + (TINT[Math.ceil(lv)] - TINT[Math.floor(lv)]) * (lv - Math.floor(lv));

  /**
   * Paints the terrain layers over a baked chunk image (art resolution: G.Tiles.T px per tile). Called by
   * js/world/world.js chunkImage, once per chunk and biome. Pixel art only: no smoothing, no image assets.
   */
  function paint(z, cv, tx0, ty0, n, bi) {
    const B = G.Tiles.BIOMES[bi] || G.Tiles.BIOMES[0], TT = T();
    const ctx = cv.getContext('2d');
    const img = ctx.getImageData(0, 0, cv.width, cv.height);
    const buf = new Uint32Array(img.data.buffer), CW = cv.width;
    const C = {
      edge: pk(B.wallEdge), light: pk(B.wallLight), dark: pk(B.wallFaceDark),
      face: B.wallFace.map(pk), top: B.wallTop.map(pk), speck: pk(B.speck)
    };
    const H_ = (tx, ty) => z.height(tx, ty), K = (tx, ty) => z.terr(tx, ty), R = (tx, ty) => z.rampDir(tx, ty);
    const land = (tx, ty) => z.inside(tx, ty) && K(tx, ty) !== WALL;
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < CW && y < cv.height) buf[y * CW + x] = c; };
    const get = (x, y) => buf[y * CW + x];
    const hs = (x, y, s) => G.U.hash(x, y, s);
    const rampFacesZ = (a, b, dx, dy) => rampFaces(z, a, b, dx, dy);
    let tiles = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const tx = tx0 + i, ty = ty0 + j;
      if (!land(tx, ty)) continue;
      tiles++;
      const ox = i * TT, oy = j * TT, lv = H_(tx, ty), rd = R(tx, ty);
      // 1) height tint
      const k = tintOf(lv + (rd ? 0.5 : 0));
      if (k !== 1) for (let y = 0; y < TT; y++) for (let x = 0; x < TT; x++) buf[(oy + y) * CW + ox + x] = scalePx(get(ox + x, oy + y), k);
      const lower = (dx, dy) => land(tx + dx, ty + dy) && H_(tx + dx, ty + dy) < lv && !(R(tx + dx, ty + dy) && H_(tx + dx, ty + dy) + 1 >= lv && rampFacesZ(tx + dx, ty + dy, -dx, -dy));
      const higher = (dx, dy) => land(tx + dx, ty + dy) && H_(tx + dx, ty + dy) > lv && !(rd && lv + 1 >= H_(tx + dx, ty + dy) && rampFacesZ(tx, ty, dx, dy));
      // 2) stairs on a ramp tile (the steps run across the way up)
      if (rd) {
        const vert = rd === 1 || rd === 3;
        for (let y = 0; y < TT; y++) for (let x = 0; x < TT; x++) {
          const a = vert ? y : x, b = vert ? x : y;
          const s = (rd === 1 || rd === 4) ? a : TT - 1 - a;     // 0 at the top of the stairs
          let c = C.top[(Math.floor(s / 4) + (hs(tx, ty, 41) < 0.5 ? 0 : 1)) % C.top.length];
          if (s % 4 === 0) c = C.light; else if (s % 4 === 3) c = C.edge;
          if (b <= 1 || b >= TT - 2) c = b === 0 || b === TT - 1 ? C.edge : C.face[0];   // the side rails
          buf[(oy + y) * CW + ox + x] = scalePx(c, k);
        }
      }
      // 3) the cliff face on the south edge of a higher tile (or the stairs going on into it)
      if (lower(0, 1)) {
        const F = 6;
        for (let y = TT - F; y < TT; y++) for (let x = 0; x < TT; x++) {
          const fy = y - (TT - F), gx = tx * TT + x, gy = ty * TT + y;
          let c = C.face[(x + (hs(gx, 0, 43) < 0.5 ? 0 : 1)) % 3 === 0 ? 1 : 0];
          if (fy === 0) c = C.edge; else if (y === TT - 1) c = C.dark; else if (hs(gx, gy, 44) < 0.07) c = C.dark;
          set(ox + x, oy + y, c);
        }
      } else if (R(tx, ty + 1) === 1 && land(tx, ty + 1) && H_(tx, ty + 1) + 1 === lv) {
        // a ramp below climbs into this tile: its top steps
        for (let y = TT - 4; y < TT; y++) for (let x = 2; x < TT - 2; x++) set(ox + x, oy + y, (y - (TT - 4)) % 4 === 0 ? C.light : scalePx(C.top[0], k));
      }
      // 4) the lip of a ledge on the north edge, the outline on the sides
      if (lower(0, -1)) for (let x = 0; x < TT; x++) { set(ox + x, oy, C.edge); set(ox + x, oy + 1, C.light); }
      if (lower(-1, 0)) for (let y = 0; y < TT; y++) { set(ox, oy + y, C.edge); if (y > 0 && y < TT - 1) set(ox + 1, oy + y, C.light); }
      if (lower(1, 0)) for (let y = 0; y < TT; y++) { set(ox + TT - 1, oy + y, C.edge); if (y > 0 && y < TT - 1) set(ox + TT - 2, oy + y, scalePx(get(ox + TT - 2, oy + y), 0.8)); }
      // 5) drop shadows on the low side of a cliff
      if (higher(0, -1)) for (let y = 0; y < 3; y++) for (let x = 0; x < TT; x++) set(ox + x, oy + y, scalePx(get(ox + x, oy + y), y === 0 ? 0.55 : y === 1 ? 0.68 : 0.82));
      if (higher(-1, 0)) for (let y = 0; y < TT; y++) for (let x = 0; x < 2; x++) set(ox + x, oy + y, scalePx(get(ox + x, oy + y), x === 0 ? 0.68 : 0.82));
      if (higher(1, 0)) for (let y = 0; y < TT; y++) for (let x = TT - 2; x < TT; x++) set(ox + x, oy + y, scalePx(get(ox + x, oy + y), x === TT - 1 ? 0.72 : 0.86));
    }
    // 6) DLC D2: the bounce pads in this chunk: a mushroom (a spring where the liquid is lava), with an arrow its way
    for (const p of z.pads) {
      const i = p[0] - tx0, j = p[1] - ty0;
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      paintPad(set, i * TT, j * TT, TT, p[2], B.liquid === 'lava', C);
    }
    ctx.putImageData(img, 0, 0);
    z.painted += tiles;
    return tiles;
  }
  /** DLC D2: a bounce pad, pixel by pixel (art px, a 16 x 16 tile): a red cap with white spots, or a coiled spring. */
  const PAD_RED = packRGB(214, 54, 64), PAD_DARK = packRGB(120, 24, 40), PAD_WHITE = packRGB(250, 246, 236), PAD_STEM = packRGB(236, 214, 170);
  const PAD_STEEL = packRGB(180, 190, 204), PAD_STEEL2 = packRGB(96, 104, 124), PAD_ARROW = packRGB(255, 226, 92);
  function paintPad(set, ox, oy, TT, dir, spring, C) {
    const cx = TT / 2 - 0.5;
    for (let y = 0; y < TT; y++) for (let x = 0; x < TT; x++) {
      const dx = (x - cx) / 6.5, dy = (y - 7) / 4.2, d = dx * dx + dy * dy;
      if (spring) {
        if (d <= 1 && y <= 9) set(ox + x, oy + y, d > 0.7 ? PAD_STEEL2 : y < 6 ? PAD_STEEL : packRGB(206, 214, 226));
        else if (y > 9 && y < 14 && Math.abs(x - cx) < 4.5) set(ox + x, oy + y, (y % 2) ? PAD_STEEL2 : PAD_STEEL);
      } else if (d <= 1 && y <= 8) {
        const spot = (Math.abs(x - 5) <= 1 && Math.abs(y - 5) <= 1) || (Math.abs(x - 10) <= 1 && Math.abs(y - 4) <= 1) || (x === 8 && y === 7);
        set(ox + x, oy + y, d > 0.72 ? PAD_DARK : spot ? PAD_WHITE : PAD_RED);
      } else if (y > 8 && y < 14 && Math.abs(x - cx) < 3) set(ox + x, oy + y, Math.abs(x - cx) > 2 ? C.edge : PAD_STEM);
    }
    // a chevron on the side it throws you
    const [ax, ay] = DIRS[dir - 1];
    for (let k = -2; k <= 2; k++) {
      const bx = Math.round(cx + ax * (6 - Math.abs(k)) - ay * k), by = Math.round(7 + ay * (6 - Math.abs(k)) - ax * k);
      set(ox + bx, oy + by, PAD_ARROW);
    }
  }

  /** Does the ramp at (tx, ty) go up towards (dx, dy)? (no cliff edge is drawn where a ramp meets its top) */
  function rampFaces(z, tx, ty, dx, dy) {
    const d = z.rampDir(tx, ty);
    return !!d && DIRS[d - 1][0] === dx && DIRS[d - 1][1] === dy;
  }

  // ---------------- the minimap ----------------
  const RAMP_COL = [232, 208, 138];
  /** A minimap pixel by height: low ground darker, plateaus lighter, cliff faces dark, ramps sandy. */
  function mini(z, c, tx, ty) {
    if (!z.inside(tx, ty) || z.terr(tx, ty) === WALL) return c;
    const lv = z.height(tx, ty), k = 0.8 + lv * 0.13;
    let out = c.map(v => Math.min(255, v * k));
    if (z.rampDir(tx, ty)) out = out.map((v, i) => v + (RAMP_COL[i] - v) * 0.5);
    else if (z.inside(tx, ty + 1) && z.terr(tx, ty + 1) !== WALL && z.height(tx, ty + 1) < lv) out = out.map(v => v * 0.55);
    return out;
  }

  return { XV, W, H, X0, Y0, MAXH, FLOOR, WALL, LIQUID, MAPS, PROFILES, zoneSeed, generate, custom, audit, tintOf };
})();
