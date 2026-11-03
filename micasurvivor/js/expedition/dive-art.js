'use strict';
/* ============ expedition/dive-art.js — Dive's floor art (MicaSurvivor Dive visuals DV1 + DV2, not upstream) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load()); a base page never runs it, and only a Dive floor
 * (a zone with zone.dive, js/expedition/dive-gen.js) is drawn by it. Plans/MICASURVIVOR_DIVE_VISUALS_PLAN.md.
 * Owner 2026-11-03: the floors are PAINTED IN CODE (our own painter, in the style of PokéDive's floors); no image assets.
 *
 * VISUAL ONLY. It reads the floor's layout L (zone.dive) and never writes it: the floor, its hash, collision and the
 * gameplay random streams are untouched. Its noise is integer hashing of {L.seed, L.route, L.floor} (dive-gen.js seedOf
 * with the ART key), never Math.random, so a co-op guest, a spectator and a replay paint the same floor pixel for pixel.
 *
 *   build(L, opt)  bakes a floor: {canvas (the floor + a MG-tile margin, 16 art px a tile), top (the wall top as a seamless
 *                  PW x PH tile, which fills the view beyond the floor), ox, oy (the canvas's art-px origin in the world:
 *                  the spawn tile is the world origin), route, ms (the bake time), bytes, counts
 *                  (pixels: face / top / liquid / ground); opt.keepMask: also mask, the wall / liquid mask)}. Per art pixel:
 *                    masks   the wall and liquid grids blown up with a smoothstep blend + a little noise: rounded, organic
 *                            outlines on the 16 px grid instead of tile stairs; chamfer distance fields into the walls, the
 *                            water, from the walls and to the spawn -> stairs path; per column, the wall runs up / down
 *                    walls   the TOP: overlapping round crowns on a staggered 21 x 12 grid (lush routes: trees; the grove adds
 *                            giant mushroom caps), else the route's rock, mottled; a rim (a dark outline and a light lip; the
 *                            lush routes a grass verge). The SOUTH FACE: FACE px over any open ground below it, light lip,
 *                            a body in the route's style (dirt with roots and trunks, sandstone bands, striations, bricks),
 *                            dark base, bevels where it turns a corner
 *                    ground  a 7-shade ramp with soft two-tone patches, the route's details (slabs, wind lines, cracked
 *                            plates, ice, caustics, moss), a dirt trail along L.path (wider at both ends), grass blades,
 *                            flowers, fallen leaves, pebbles at the foot of the cliffs, darker ground by the walls, a contact
 *                            shadow under the faces, a wet line on the shore
 *                    water   light rim -> shallow -> deep by the distance to the shore, ripples
 *                    light   the route's tint over everything but the emissive pixels (embers, glowing spots, lava)
 *                  Every ramp is 7 shades, dark -> light, blended with a 4 x 4 ordered dither.
 *   draw(ctx, cam, zone)  G.World.drawGround's Dive branch: the top pattern over the view (only where it reaches past the
 *                  floor), then the visible crop of the baked canvas. Bakes on first use (the floor change's flash); keeps
 *                  the last 2 floors (a replay seeking back).
 *   hashOf(art)    FNV-1a of the canvas pixels (tests: two pages, golden pixels)
 *   mini(z, rgb, tx, ty)  the minimap colour of a Dive tile in the route's palette (dive-gen.js zone() sets it as zone.mini)
 * Memory: a floor is 928 x 672 px (2.5 MB) + the 252 x 168 pattern (0.17 MB); the masks are dropped after the bake.
 */
G.DiveArt = (() => {
  const TP = 16;                 // art px per tile (G.Tiles.T)
  const MG = 2;                  // margin tiles baked round the floor (all wall)
  const FACE = 16;               // the south face, art px
  const CX = 21, CY = 12;        // the crowns' staggered grid
  const PW = 252, PH = 168;      // the seamless wall-top pattern (12 x 14 crown cells)
  const NCX = PW / CX, NCY = PH / CY;
  const ART = 0xA27;             // the seedOf key of the art stream
  const WALL = 1, LIQ = 2;

  // ---------------- colours ----------------
  const pk = (r, g, b) => ((255 << 24) | (Math.max(0, Math.min(255, b | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, r | 0))) >>> 0;
  const hx = h => { const v = parseInt(h.slice(1), 16); return pk((v >> 16) & 255, (v >> 8) & 255, v & 255); };
  const R_ = c => c & 255, G_ = c => (c >>> 8) & 255, B_ = c => (c >>> 16) & 255;
  const mul = (c, k) => pk(R_(c) * k, G_(c) * k, B_(c) * k);
  /** c darkened by k <= 1 (no clamping needed). */
  const dim = (c, k) => (0xFF000000 | (((c >>> 16 & 255) * k) << 16) | (((c >>> 8 & 255) * k) << 8) | ((c & 255) * k)) >>> 0;
  const mul3 = (c, t) => pk(R_(c) * t[0], G_(c) * t[1], B_(c) * t[2]);
  const mix = (a, b, t) => pk(R_(a) + (R_(b) - R_(a)) * t, G_(a) + (G_(b) - G_(a)) * t, B_(a) + (B_(b) - B_(a)) * t);
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
  /** A 7-shade ramp (dark -> light) at t 0..1, ordered-dithered between its shades. */
  function ramp(a, t, x, y) {
    const f = (t <= 0 ? 0 : t >= 1 ? 0.9999 : t) * (a.length - 1), i = f | 0;
    return a[f - i > bay(x, y) ? i + 1 : i];
  }
  const H = a => a.map(hx);
  const ICE = hx('#dceaf8');

  // ---------------- noise: integer hashes, never Math.random ----------------
  function hh(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const wrap = (v, p) => ((v % p) + p) % p;
  /** Value noise 0..1 at lattice step `st`; with pw / ph (multiples of st) it tiles seamlessly. */
  function vn(x, y, st, s, pw, ph) {
    const fx = x / st, fy = y / st, x0 = Math.floor(fx), y0 = Math.floor(fy);
    let u = fx - x0, v = fy - y0;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    const wx = pw ? pw / st : 0, wy = ph ? ph / st : 0;
    const X = i => (wx ? wrap(i, wx) : i), Y = j => (wy ? wrap(j, wy) : j);
    const a = hh(X(x0), Y(y0), s), b = hh(X(x0 + 1), Y(y0), s), c = hh(X(x0), Y(y0 + 1), s), d = hh(X(x0 + 1), Y(y0 + 1), s);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  /** vn() over one bake's area with its lattice hashed once (the same values, far cheaper per pixel). */
  function nf(st, s, ox, oy, w, h) {
    const ix0 = Math.floor(ox / st) - 1, iy0 = Math.floor(oy / st) - 1, nw = Math.ceil(w / st) + 4, nh = Math.ceil(h / st) + 4;
    const g = new Float32Array(nw * nh);
    for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) g[j * nw + i] = hh(ix0 + i, iy0 + j, s);
    return (x, y) => {
      const fx = x / st, fy = y / st, x0 = Math.floor(fx), y0 = Math.floor(fy);
      let u = fx - x0, v = fy - y0;
      u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
      const k = (y0 - iy0) * nw + (x0 - ix0), a = g[k], b = g[k + 1], c = g[k + nw], d = g[k + nw + 1];
      return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
    };
  }

  // ---------------- the routes ----------------
  // Every ramp is 7 shades, dark -> light. lush: the walls are canopy ('trees' / 'shrooms'; verge: the grass between the
  // rim and the crowns); else top: the rock. face: its ramp and style. light: a multiply over the whole floor (the route's
  // light; DV4 adds the light map). Tuned side by side against PokéDive's 8 routes (scratchpad dive-style/pd_*.png).
  const ROUTES = {
    forest: {   // Mossy Woods
      lush: 'trees', light: null,
      ground: H(['#3a6a30', '#487c37', '#578e3f', '#659d47', '#73aa50', '#83b65a', '#98c46a']), patch: 0.18,
      blades: H(['#4a7e38', '#9ccb6e', '#b4da86']), bladeP: 0.5, flowers: H(['#f4e27a', '#f6f6ff', '#a8b4f4', '#f2a0c0']), flowerP: 0.08, leaves: H(['#d88a2c', '#e8b23a']), leafP: 0.05,
      trail: H(['#6e4526', '#82532e', '#965f34', '#a96e3c', '#b67b46', '#c48c56', '#d4a068']),
      crown: H(['#1f4a26', '#2b602e', '#3a7836', '#4d8f3e', '#64a54a', '#7fba58', '#9ccd6c']), gap: hx('#163a1c'),
      verge: H(['#2e622c', '#386f32', '#437e38']), lip: H(['#a0cc70', '#78b056']),
      face: { style: 'dirt', ramp: H(['#2a1810', '#3e2416', '#53311d', '#663f25', '#7a4d2e', '#8d5c37', '#9e6b42']) },
      pebble: H(['#5c6268', '#868c92', '#b4b8bc']),
      water: H(['#1f4e8c', '#24609e', '#2c74b2', '#3a88c4', '#4e9ed2', '#78bce0', '#c4e8f6']), wet: hx('#2a4c2a')
    },
    marsh: {   // Gloom Marsh
      lush: 'trees', light: null,
      ground: H(['#1f2c1a', '#283821', '#324428', '#3c5030', '#475c37', '#546a40', '#62784a']), patch: 0.2,
      blades: H(['#2a3a22', '#6a7c48', '#869a5a']), bladeP: 0.55, flowers: H(['#d84a5a', '#e8d878', '#b8a8e0']), flowerP: 0.03, leaves: H(['#7a6a3a', '#8a5a3a']), leafP: 0.04,
      trail: H(['#2c2618', '#383020', '#443a28', '#504430', '#5c4e38', '#6a5a42', '#78684c']),
      crown: H(['#141f14', '#1c2b1b', '#253823', '#30462c', '#3c5535', '#4b6540', '#5d774c']), gap: hx('#0f170f'),
      verge: H(['#1f2c1a', '#263521', '#2e3f27']), lip: H(['#62784a', '#4f633c']),
      face: { style: 'dirt', ramp: H(['#140f0a', '#1e1710', '#2a2016', '#352a1d', '#413424', '#4d3f2c', '#5a4a35']) },
      pebble: H(['#3a3e36', '#565c50', '#7a8070']),
      water: H(['#16261c', '#1c3022', '#233b29', '#2c4832', '#38583e', '#4c6c50', '#7e9a78']), wet: hx('#18221a')
    },
    fungal: {   // Fungal Grove
      lush: 'shrooms', light: null,
      ground: H(['#1c1430', '#241a3a', '#2c2146', '#352852', '#3f305e', '#4a396a', '#584478']), patch: 0.24,
      blades: H(['#241a3a', '#6a5a92', '#8a78b4']), bladeP: 0.35, flowers: H(['#f08ad0', '#7ae0e8', '#f4e4ff']), flowerP: 0.06, glow: H(['#7af0e8', '#f2a0e8']), glowP: 0.012,
      trail: H(['#2a2038', '#33283f', '#3c304a', '#463855', '#504260', '#5c4c6c', '#6a5878']),
      crown: H(['#170d24', '#21132f', '#2c1a3c', '#38224a', '#462c5a', '#56386c', '#6a4680']), gap: hx('#100918'),
      berry: H(['#a8263a', '#e04a5a']),
      cap: H(['#4e1c46', '#6e2862', '#8e367c', '#ac4a94', '#c460a8', '#da7cbc', '#ee9ed2']), spot: hx('#f4e8f6'),
      verge: H(['#1c1430', '#22193a', '#2a2044']), lip: H(['#584478', '#46365f']),
      face: { style: 'stalks', ramp: H(['#140c1e', '#1e132a', '#2a1c38', '#5a4e66', '#76687e', '#928498', '#ada0b2']) },
      pebble: H(['#3a3248', '#5a5068', '#7e7490']),
      water: H(['#2a1a52', '#34226a', '#402c80', '#503a96', '#644ea8', '#8670c0', '#c4b0e8']), wet: hx('#1a1228')
    },
    canyon: {   // Golden Canyon
      light: null,
      ground: H(['#a8683a', '#c07e4a', '#d09258', '#dca468', '#e6b478', '#eec488', '#f4d49c']), patch: 0.16, wind: true,
      top: H(['#7a4228', '#8c4e2e', '#a05c36', '#b06a3e', '#bd7646', '#c98450', '#d5925c']), topPatch: 0.12,
      rim: [hx('#4a2414'), hx('#f2c88c')],
      face: { style: 'bands', ramp: H(['#4e2616', '#6a341e', '#844428', '#9c5432', '#b0643c', '#c27646', '#e0a066']) },
      pebble: H(['#8a5634', '#b07040', '#d89a62']), pebbleP: 0.03,
      trail: H(['#b0703c', '#bc7c44', '#c8884e', '#d29458', '#dca062', '#e4ac6e', '#ecb87a']),
      water: H(['#1e5c8a', '#24709e', '#2c86b0', '#3a9cc0', '#52b2cc', '#7cc8d8', '#c8ecee']), wet: hx('#8e5a34')
    },
    crater: {   // Ember Crater
      light: null,
      ground: H(['#1e1016', '#28151c', '#321b21', '#3c2127', '#47282d', '#523034', '#5e3a3c']), patch: 0.22, cracks: true,
      top: H(['#120a0e', '#180d12', '#1f1116', '#27161b', '#301b20', '#3a2126', '#45282c']), topPatch: 0.25,
      rim: [hx('#08040a'), hx('#6a3e36')],
      face: { style: 'bands', ramp: H(['#0a0508', '#130a0e', '#1c1014', '#26161a', '#311d20', '#3e2528', '#7a4a3a']) },
      ember: H(['#ff6a1a', '#ffa83a', '#ffe08a']), emberP: 0.004,
      pebble: H(['#1a1014', '#3a2a2c', '#5e4642']), pebbleP: 0.03,
      trail: H(['#3a2224', '#44282a', '#4e2e30', '#583436', '#623c3c', '#6c4442', '#784c48']),
      water: H(['#3a0c06', '#5a1608', '#7e220a', '#a8340c', '#d04e12', '#f07a22', '#ffc060']), wet: hx('#1a0a0a'), lavaGlow: true
    },
    reef: {   // Sunken Reef
      light: null,
      ground: H(['#123e4e', '#18505e', '#1f606c', '#287078', '#338084', '#42908e', '#5aa49c']), patch: 0.14, caustic: true,
      top: H(['#14203a', '#1a2a48', '#223454', '#2a3e60', '#34496a', '#3e5474', '#4a6080']), topPatch: 0.12, seagrass: H(['#183a3a', '#1e4642', '#26524a']),
      rim: [hx('#0a1222'), hx('#6a8cb8')],
      face: { style: 'stripes', ramp: H(['#0c1428', '#121c34', '#1a2640', '#22304c', '#2c3c58', '#384866', '#5a76a0']) },
      blades: H(['#1a4a3a', '#3a8a62', '#5aac7a']), bladeP: 0.18, flowers: H(['#f07a8a', '#f4c8a0', '#e85a6a']), flowerP: 0.04,
      pebble: H(['#2a4a5a', '#4a7a88', '#8ab8bc']), pebbleP: 0.02,
      trail: H(['#3a8a8a', '#44948f', '#4e9e94', '#5aa89a', '#66b2a0', '#74bca8', '#84c6b0']),
      water: H(['#0a1a36', '#0e2244', '#142c54', '#1a3864', '#244876', '#3a6490', '#7aa8c8']), wet: hx('#123c4a')
    },
    grotto: {   // Frost Grotto
      light: null,
      ground: H(['#7088ac', '#8a9ebc', '#a0b2cc', '#b2c2d8', '#c2d0e2', '#d2deec', '#e6eef8']), patch: 0.2, ice: true,
      top: H(['#1e2c4a', '#26385a', '#304468', '#3a5076', '#465e84', '#546c92', '#647ca0']), topPatch: 0.2,
      snow: H(['#8a9cbc', '#a4b4d0', '#bccae0', '#d0dcec', '#e2eaf6', '#eff4fb', '#fafcff']),
      rim: [hx('#101a30'), hx('#c8d8ee')],
      face: { style: 'stripes', ramp: H(['#121c34', '#1a2642', '#223050', '#2c3c5e', '#38496c', '#46587c', '#7a92ba']) },
      pebble: H(['#4a5a7a', '#7a8cac', '#c0cce0']), pebbleP: 0.02,
      trail: H(['#90a2c0', '#98aac6', '#a0b2cc', '#a8bad2', '#b0c2d8', '#b8cade', '#c2d2e4']),
      water: H(['#1a3a6a', '#204a7e', '#285c92', '#3270a6', '#4486b8', '#64a2cc', '#b4daf0']), wet: hx('#6a80a4')
    },
    ruins: {   // Forgotten Ruins
      light: null,
      ground: H(['#4a5446', '#566050', '#626c5a', '#6e7866', '#7a8470', '#88907c', '#969e8a']), patch: 0.22, slabs: true,
      moss: H(['#2e4228', '#384e2e', '#425a34', '#4c663a', '#587242']),
      top: H(['#24361e', '#2c4224', '#344e2a', '#3e5a30', '#486636', '#54723e', '#628048']), topPatch: 0.32,
      rim: [hx('#1c201a'), hx('#7a8070')], rocky: H(['#3a3e36', '#525a4c', '#6c7464', '#868c7c']),
      face: { style: 'bricks', ramp: H(['#1e221c', '#2a2f27', '#383e33', '#464d40', '#545c4d', '#626a5a', '#4e7a3a']) },
      blades: H(['#2e4228', '#587242', '#7a9458']), bladeP: 0.06, pebble: H(['#3c4038', '#5e6458', '#8a9080']), pebbleP: 0.03,
      trail: H(['#6a7262', '#727a6a', '#7a8272', '#828a7a', '#8a9282', '#929a8a', '#9aa292']),
      water: H(['#1a3a4e', '#204a60', '#285a72', '#326c84', '#407e94', '#5a96a8', '#a0ccd6']), wet: hx('#3a4236')
    },
    origin: {   // the Route of Origin (no PokéDive twin: Sky Pillar marble and gold)
      light: null,
      ground: H(['#8a8478', '#9c9688', '#aea898', '#beb8a8', '#ccc6b6', '#dad4c6', '#e8e4d8']), patch: 0.18, slabs: 'marble', gold: hx('#d8b45a'),
      top: H(['#4a463e', '#56524a', '#625e56', '#6e6a60', '#7a766c', '#888478', '#969286']), topPatch: 0.24,
      rim: [hx('#2a2620'), hx('#f0e8d0')],
      face: { style: 'bricks', ramp: H(['#3a352c', '#4a453a', '#5c564a', '#6e685a', '#807a6a', '#928c7c', '#d8c890']) },
      pebble: H(['#8a8274', '#b0a898', '#dcd4c4']), pebbleP: 0.02,
      trail: H(['#b8a882', '#c0b08a', '#c8b892', '#d0c09a', '#d8c8a2', '#e0d0aa', '#e8d8b2']),
      water: H(['#1e4a8a', '#24589e', '#2c6ab0', '#3a80c2', '#4e98d2', '#78b6e2', '#c8e6f8']), wet: hx('#7a7468')
    }
  };
  const routeOf = r => (ROUTES[r] ? r : 'forest');

  // ---------------- the wall top: a seamless pattern ----------------
  /** Lush routes: the crown (tree top, or a giant mushroom cap in the grove) at pattern pixel x, y; the gap colour if none. */
  function crownAt(R, x, y, s) {
    const rr = Math.floor(y / CY), shrooms = R.lush === 'shrooms';
    for (let pass = shrooms ? 0 : 1; pass < 2; pass++) for (let r = rr + 3; r >= rr - 3; r--) {   // the lowest crown is drawn last: found first
      const odd = wrap(r, 2), cc = Math.floor((x - odd * CX / 2) / CX);
      for (let c = cc - 2; c <= cc + 2; c++) {
        const wc = wrap(c, NCX), wr = wrap(r, NCY);
        const big = shrooms && hh(wc, wr, s + 9) < 0.16;
        if (big !== (pass === 0)) continue;
        const cx = c * CX + odd * CX / 2 + (hh(wc, wr, s + 1) - 0.5) * 7, cy = r * CY + (hh(wc, wr, s + 2) - 0.5) * 5;
        const rad = big ? 17 + hh(wc, wr, s + 3) * 6 : 11 + hh(wc, wr, s + 3) * 6, ry = rad * (big ? 0.66 : 0.88);
        const dx = x - cx, dy = y - cy, e = (dx / rad) ** 2 + (dy / ry) ** 2;
        if (e > 1) continue;
        const nx = dx / rad, ny = dy / ry, nz = Math.sqrt(1 - e);
        if (big) {   // a dome: light from the top left, a dark rolled rim, pale diamond spots
          let t = 0.5 - nx * 0.25 - ny * 0.42 + nz * 0.2;
          if (ny > 0.25 && e > 0.6) t -= 0.4;
          const sx = Math.round((x - cx) / 7), sy = Math.round((y - cy) / 6);
          const ddx = Math.abs(x - cx - sx * 7), ddy = Math.abs(y - cy - sy * 6);
          if (ny < 0.2 && e < 0.72 && hh(sx, sy + c * 13, s + 5) < 0.45 && ddx + ddy <= 1.6) return R.spot;
          return ramp(R.cap, t, x, y);
        }
        let t = 0.5 - nx * 0.32 - ny * 0.5 + nz * 0.2 + (hh(wc, wr, s + 10) - 0.5) * 0.16;
        const lobe = vn(x, y, 6, s + 7, PW, PH), fine = vn(x, y, 3, s + 20, PW, PH);   // leaf clumps: bumps, each lit from the top left
        t += (lobe - 0.5) * 0.4 + (fine - 0.5) * 0.16 + (hh(x >> 1, y >> 1, s + 8) - 0.5) * 0.06;
        if (lobe < 0.28) t -= 0.1;
        if (e > 0.6 && ny > -0.3) t -= 0.26 + (e - 0.6) * 1.3;                                      // shade where the crown below tucks in
        if (R.berry && e < 0.6 && hh(x >> 1, y >> 1, s + 6) < 0.025 && ny < 0.3) return R.berry[(x + y) & 1];
        return ramp(R.crown, t, x, y);
      }
    }
    return R.gap;
  }
  /** The wall top as a seamless PW x PH tile (crowns, or the route's rock: mottled, with snow / seagrass / cracks). */
  function topPattern(R, s) {
    const out = new Uint32Array(PW * PH);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      let c;
      if (R.lush) c = crownAt(R, x, y, s);
      else {
        const n = vn(x, y, 28, s + 11, PW, PH), m = vn(x, y, 12, s + 12, PW, PH);
        let t = 0.42 + (n - 0.5) * 0.5 + (m - 0.5) * 0.35 + (vn(x, y, 4, s + 13, PW, PH) - 0.5) * 0.25;
        if (n + (m - 0.5) * 0.4 > 0.56) t += R.topPatch;   // two-tone patches
        c = ramp(R.top, t, x, y);
        if (R.snow) {
          const sn = vn(x, y, 28, s + 14, PW, PH) + (vn(x, y, 12, s + 15, PW, PH) - 0.5) * 0.5 + (vn(x, y, 4, s + 16, PW, PH) - 0.5) * 0.18;
          if (sn > 0.55) c = ramp(R.snow, 0.35 + (sn - 0.55) * 2.6, x, y);
          else if (sn > 0.52) c = R.snow[0];
        }
        if (R.seagrass) {
          const sg = vn(x, y, 28, s + 17, PW, PH) + (vn(x, y, 4, s + 18, PW, PH) - 0.5) * 0.3;
          if (sg > 0.64) c = ramp(R.seagrass, (sg - 0.64) * 4, x, y);
        }
        if (R.cracks && Math.abs(vn(x, y, 28, s + 19, PW, PH) - 0.5) < 0.012) c = R.top[0];
      }
      out[y * PW + x] = c;
    }
    return out;
  }

  // ---------------- distance fields ----------------
  /** Chamfer (3-4) distance to the nearest source pixel, in thirds of a px, capped at 255. */
  function chamfer(src, w, h) {
    const d = new Uint8Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = src[i] ? 0 : 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i];
      if (!v) continue;
      if (x > 0 && d[i - 1] + 3 < v) v = d[i - 1] + 3;
      if (y > 0) {
        if (d[i - w] + 3 < v) v = d[i - w] + 3;
        if (x > 0 && d[i - w - 1] + 4 < v) v = d[i - w - 1] + 4;
        if (x < w - 1 && d[i - w + 1] + 4 < v) v = d[i - w + 1] + 4;
      }
      d[i] = v;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (!v) continue;
      if (x < w - 1 && d[i + 1] + 3 < v) v = d[i + 1] + 3;
      if (y < h - 1) {
        if (d[i + w] + 3 < v) v = d[i + w] + 3;
        if (x < w - 1 && d[i + w + 1] + 4 < v) v = d[i + w + 1] + 4;
        if (x > 0 && d[i + w - 1] + 4 < v) v = d[i + w - 1] + 4;
      }
      d[i] = v;
    }
    return d;
  }
  /** Worley cell edges (the crater's cracked plates): 2nd-nearest minus nearest seed distance, px. */
  function plates(gx, gy, st, s) {
    const cx = Math.floor(gx / st), cy = Math.floor(gy / st);
    let d1 = 1e9, d2 = 1e9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const px = (cx + i + 0.15 + hh(cx + i, cy + j, s) * 0.7) * st, py = (cy + j + 0.15 + hh(cx + i, cy + j, s + 1) * 0.7) * st;
      const d = (gx - px) ** 2 + (gy - py) ** 2;
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return Math.sqrt(d2) - Math.sqrt(d1);
  }

  // ---------------- the bake ----------------
  const seedOf = L => (G.DiveGen && G.DiveGen.seedOf ? G.DiveGen.seedOf(L.seed | 0, L.route, L.floor | 0, ART) : ((L.seed | 0) ^ ART) >>> 0);
  const stats = { last: null, bakes: 0 };
  function build(L, opt) {
    const t0 = performance.now();
    const route = routeOf(L.route), R = ROUTES[route], s = seedOf(L) | 0, lush = !!R.lush, F = R.face;
    const tw = L.w + 2 * MG, th = L.h + 2 * MG, W = tw * TP, Hh = th * TP, N = W * Hh;
    // the tile grid (a plug is painted as open ground: its boulder / thicket stands in the gap, nothing re-bakes when it opens)
    const kt = new Uint8Array(tw * th).fill(WALL);
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) { const k = L.kind[y * L.w + x]; kt[(y + MG) * tw + x + MG] = k === WALL ? WALL : k === LIQ ? LIQ : 0; }
    for (const pg of L.plugs || []) for (const p of [pg.at, pg.at2]) if (p) kt[(p[1] + MG) * tw + p[0] + MG] = 0;
    const T = (x, y, k) => (x < 0 || y < 0 || x >= tw || y >= th ? (k === WALL ? 1 : 0) : kt[y * tw + x] === k ? 1 : 0);
    const ox = (-(L.spawn ? L.spawn[0] : 0) - MG) * TP, oy = (-(L.spawn ? L.spawn[1] : 0) - MG) * TP;
    const Z = {   // this bake's value-noise fields
      m8: nf(8, s + 30, ox, oy, W, Hh), m3: nf(3, s + 31, ox, oy, W, Hh),
      g28: nf(28, s + 40, ox, oy, W, Hh), g9: nf(9, s + 41, ox, oy, W, Hh), g4: nf(4, s + 42, ox, oy, W, Hh),
      t10: nf(10, s + 50, ox, oy, W, Hh), t5: nf(5, s + 51, ox, oy, W, Hh),
      v6: nf(6, s + 52, ox, oy, W, Hh), b20: nf(20, s + 53, ox, oy, W, Hh), x36: nf(36, s + 54, ox, oy, W, Hh)
    };
    // 1) masks: per cell between tile centres, a smoothstep blend of its 4 corners (+ noise where they differ)
    const M = new Uint8Array(N), SS = new Float32Array(TP);
    for (let k = 0; k < TP; k++) { const f = (k + 0.5) / TP; SS[k] = f * f * (3 - 2 * f); }
    for (let j0 = -1; j0 < th; j0++) for (let i0 = -1; i0 < tw; i0++) {
      const a = T(i0, j0, WALL), b = T(i0 + 1, j0, WALL), c = T(i0, j0 + 1, WALL), d = T(i0 + 1, j0 + 1, WALL);
      const la = T(i0, j0, LIQ), lb = T(i0 + 1, j0, LIQ), lc = T(i0, j0 + 1, LIQ), ld = T(i0 + 1, j0 + 1, LIQ);
      const yb = j0 * TP + TP / 2, xb = i0 * TP + TP / 2;
      const y0 = Math.max(0, yb), y1 = Math.min(Hh, yb + TP), x0 = Math.max(0, xb), x1 = Math.min(W, xb + TP);
      const allW = a & b & c & d, noW = !(a | b | c | d), allL = la & lb & lc & ld, noL = !(la | lb | lc | ld);
      if (allW || (noW && (allL || noL))) {
        const m = allW ? WALL : allL ? LIQ : 0;
        if (m) for (let py = y0; py < y1; py++) M.fill(m, py * W + x0, py * W + x1);
        continue;
      }
      for (let py = y0; py < y1; py++) {
        const sy = SS[py - yb];
        for (let px = x0; px < x1; px++) {
          const sx = SS[px - xb], gx = px + ox, gy = py + oy;
          const fw = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy, fl = (la + (lb - la) * sx) * (1 - sy) + (lc + (ld - lc) * sx) * sy;
          const n = (Z.m8(gx, gy) - 0.5) * 0.24 + (Z.m3(gx, gy) - 0.5) * 0.08;
          M[py * W + px] = fw + n > 0.5 ? WALL : fl - n * 0.8 > 0.5 ? LIQ : 0;
        }
      }
    }
    const t1 = performance.now();
    // 2) distance fields and the vertical runs
    const isWall = new Uint8Array(N), notWall = new Uint8Array(N), isLiq = new Uint8Array(N), notLiq = new Uint8Array(N);
    let anyLiq = false;
    for (let i = 0; i < N; i++) { const m = M[i]; isWall[i] = m === WALL ? 1 : 0; notWall[i] = 1 - isWall[i]; isLiq[i] = m === LIQ ? 1 : 0; notLiq[i] = 1 - isLiq[i]; if (m === LIQ) anyLiq = true; }
    const dIn = chamfer(notWall, W, Hh);                       // a wall px: how deep in the wall
    const dToWall = chamfer(isWall, W, Hh);                    // an open px: how far from a wall
    const dShore = anyLiq ? chamfer(notLiq, W, Hh) : null;     // a liquid px: how far from the shore
    const dToLiq = anyLiq ? chamfer(isLiq, W, Hh) : null;
    const pathSrc = new Uint8Array(N), P2 = (L.path || []).map(([x, y]) => [(x + MG) * TP + 8, (y + MG) * TP + 8]);
    for (let k = 0; k + 1 < P2.length; k++) {
      const [x1, y1] = P2[k], [x2, y2] = P2[k + 1], n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
      for (let q = 0; q <= n; q++) { const x = Math.round(x1 + (x2 - x1) * q / n), y = Math.round(y1 + (y2 - y1) * q / n); pathSrc[y * W + x] = 1; }
    }
    const dPath = chamfer(pathSrc, W, Hh);
    const upW = new Uint8Array(N), dnW = new Uint8Array(N);   // a wall px: its run up / down to the open (px); an open px: up = px below a wall
    for (let x = 0; x < W; x++) {
      let a = 0, b = 255;
      for (let y = 0; y < Hh; y++) { const i = y * W + x; if (isWall[i]) { a = a < 255 ? a + 1 : 255; upW[i] = a; b = 0; } else { a = 0; b = b < 255 ? b + 1 : 255; upW[i] = b; } }
      let c = 255;
      for (let y = Hh - 1; y >= 0; y--) { const i = y * W + x; if (isWall[i]) { c = c < 255 ? c + 1 : 255; dnW[i] = c; } else c = 0; }
    }
    const ends = [L.spawn, L.stairs].filter(Boolean).map(([x, y]) => [(x + MG) * TP + 8, (y + MG) * TP + 8]);
    const t2 = performance.now();
    // 3) the pixels
    const pat = topPattern(R, s);
    const t3 = performance.now();
    const buf = new Uint32Array(N), emis = new Uint8Array(N);
    const top = (gx, gy) => pat[wrap(gy, PH) * PW + wrap(gx, PW)];
    const counts = { face: 0, top: 0, liquid: 0, ground: 0 };
    function ground(gx, gy, px, py, i) {
      const n = Z.g28(gx, gy), m = Z.g9(gx, gy);
      let t = 0.46 + (n - 0.5) * 0.35 + (m - 0.5) * 0.3 + (Z.g4(gx, gy) - 0.5) * 0.18;
      if (n + (m - 0.5) * 0.5 > 0.55) t += R.patch;                         // soft two-tone patches
      let c = ramp(R.ground, t, gx, gy);
      if (R.slabs) c = slab(R, c, gx, gy);
      if (R.wind) { const w = (gy * 0.7 + gx * 0.18 + Z.x36(gx, gy) * 10) / 4.5; if (w - Math.floor(w) < 0.11 && Z.b20(gx, gy) > 0.45) c = mix(c, R.ground[6], 0.45); }
      if (R.caustic) { const a = Math.sin(gx * 0.09 + gy * 0.05 + Z.x36(gx, gy) * 6) + Math.sin(gx * 0.04 - gy * 0.11 + Z.b20(gx, gy) * 5); if (a > 1.62) c = mix(c, R.ground[6], 0.5); }
      if (R.ice && Z.x36(gx, gy) > 0.66) c = mix(c, ICE, 0.55 + bay(gx, gy) * 0.2);
      if (R.cracks) { const e = plates(gx + (Z.g9(gx, gy) - 0.5) * 6, gy + (Z.t10(gx, gy) - 0.5) * 6, 34, s + 62); if (e < 0.9) c = mul(c, 0.7); else if (e < 1.7) c = mul(c, 0.88); }
      // the trail (spawn -> stairs), wider at both ends
      const dp = dPath[i] / 3;
      let onTrail = false;
      if (dp < 20) {
        let rr = 6.5 + Z.t10(gx, gy) * 3.5;
        for (const [ex, ey] of ends) { const dd = Math.hypot(px - ex, py - ey); if (dd < 26) rr = Math.max(rr, 15 - dd * 0.35); }
        if (dp < rr && !(dp > rr - 1.6 && bay(gx, gy) < 0.5)) {
          onTrail = true;
          c = ramp(R.trail, 0.52 + (Z.t5(gx, gy) - 0.5) * 0.7 + (hh(gx, gy, s + 63) - 0.5) * 0.28 - (dp > rr - 2.5 ? 0.25 : 0), gx, gy);
          const sp = hh(gx, gy, s + 64);
          if (sp < 0.018) c = R.trail[6]; else if (sp > 0.985) c = R.trail[0];
        }
      }
      const dw = dToWall[i] / 3;
      if (!onTrail && !(dToLiq && dToLiq[i] <= 18)) c = decor(R, c, gx, gy, s, upW[i], dw, emis, i);
      // the ground darkens by the walls; a contact shadow under the faces; the wet line on the shore
      if (dw < 7) c = dim(c, 0.8 + dw * 0.0285);
      if (upW[i] <= 3) c = dim(c, upW[i] === 1 ? 0.6 : upW[i] === 2 ? 0.72 : 0.86);
      if (dToLiq && dToLiq[i] <= 4) c = R.wet;
      return c;
    }
    for (let py = 0; py < Hh; py++) for (let px = 0; px < W; px++) {
      const i = py * W + px, gx = px + ox, gy = py + oy, m = M[i];
      let c;
      if (m === WALL) {
        const d = dnW[i], run = d + upW[i] - 1, fh = Math.min(FACE, Math.max(0, run - 4));
        if (d <= fh) {
          c = face(R, F, gx, gy, d, fh, s, top); counts.face++;
          if (!lush) {   // bevels where the face turns a corner: a dark edge, lit on the left, shaded on the right
            if ((px > 0 && !isWall[i - 1]) || (px < W - 1 && !isWall[i + 1])) c = F.ramp[0];
            else if ((px > 1 && !isWall[i - 2]) || (px > 2 && !isWall[i - 3])) c = mix(c, F.ramp[6], 0.3);
            else if ((px < W - 2 && !isWall[i + 2]) || (px < W - 3 && !isWall[i + 3])) c = dim(c, 0.72);
          }
        }
        else {
          counts.top++;
          const di = dIn[i] / 3;
          c = top(gx, gy);
          if (lush) {
            const vw = 1.5 + Z.v6(gx, gy) * 5;   // the verge: grass between the rim and the crowns
            if (di < 1.4) c = R.lip[0];
            else if (di < 2.4) c = R.lip[1];
            else if (di < vw) c = ramp(R.verge, 0.3 + (Z.g4(gx, gy) - 0.5) * 0.8, gx, gy);
            else if (di < vw + 1.2) c = R.gap;
          } else {
            if (di < 1.4) c = R.rim[0];
            else if (di < 2.4) c = R.rim[1];
            else if (R.rocky && di < 4 + Z.v6(gx, gy) * 4) c = ramp(R.rocky, Z.g4(gx, gy) + (hh(gx >> 1, gy >> 1, s + 60) - 0.5) * 0.5, gx, gy);
            else if (di < 4.5) c = mix(c, R.rim[1], 0.22);
          }
        }
      } else if (m === LIQ) {
        counts.liquid++;
        const ds = dShore[i] / 3, A = R.water;
        c = ds < 1.4 ? A[6] : ds < 2.6 ? A[5] : ramp(A, 0.8 - Math.min(1, (ds - 2.6) / 18) * 0.8 + (Z.g9(gx, gy) - 0.5) * 0.12, gx, gy);
        if (ds > 3.5 && hh(gx >> 3, gy, s + 61) < 0.03 && (gx & 7) < 5) c = mix(c, A[6], R.lavaGlow ? 0.6 : 0.35);   // ripples
        if (R.lavaGlow) emis[i] = 1;
        if (upW[i] <= 3) c = mul(c, upW[i] === 1 ? 0.55 : 0.75);
      } else { c = ground(gx, gy, px, py, i); counts.ground++; }
      buf[i] = c;
    }
    const t4 = performance.now();
    // 4) the route's light, then the canvases
    if (R.light) for (let i = 0; i < N; i++) if (!emis[i]) buf[i] = mul3(buf[i], R.light);
    const cv = canvas(W, Hh), g = cv.getContext('2d'), img = g.createImageData(W, Hh);
    new Uint32Array(img.data.buffer).set(buf);
    g.putImageData(img, 0, 0);
    const pc = canvas(PW, PH), pg = pc.getContext('2d'), pimg = pg.createImageData(PW, PH), pbuf = new Uint32Array(pimg.data.buffer);
    pbuf.set(pat);
    if (R.light) for (let i = 0; i < pbuf.length; i++) pbuf[i] = mul3(pbuf[i], R.light);
    pg.putImageData(pimg, 0, 0);
    const ms = Math.round((performance.now() - t0) * 10) / 10;
    const art = { canvas: cv, top: pc, pattern: null, ox, oy, w: W, h: Hh, route, ms, bytes: (W * Hh + PW * PH) * 4, counts };
    if (opt && opt.keepMask) art.mask = M;   // (tests: the wall / liquid mask)
    stats.last = { ms, route, bytes: art.bytes, parts: [t1 - t0, t2 - t1, t3 - t2, t4 - t3, performance.now() - t4].map(v => Math.round(v)) };
    stats.bakes++;
    return art;
  }
  /** One pixel of a south face; t: 1 at its foot .. fh at its top. */
  function face(R, F, gx, gy, t, fh, s, top) {
    const A = F.ramp, k = fh - t;   // k: 0 at the top
    if (F.style === 'dirt' || F.style === 'stalks') {
      // the lush routes: the crowns' edge hangs over a dirt bank with roots and trunks (Mossy Woods, Gloom Marsh) or over
      // pale mushroom stalks in the dark (the grove)
      const ov = 1 + vn(gx, 0, 7, s + 70) * 5;
      if (k < ov) return k >= ov - 1.2 ? R.gap : top(gx, gy);
      if (k < ov + 1.5) return R.lip[k < ov + 0.7 ? 0 : 1];   // the grass lip over the bank
      if (F.style === 'stalks') {
        const sw = 15, q = Math.floor((gx + 4) / sw), sc = q * sw + 4 + Math.floor(hh(q, 3, s + 71) * (sw - 8)), dx = gx - sc;
        if (Math.abs(dx + 0.5) <= 2.5 && hh(q, 4, s + 72) < 0.5) return A[dx < -1 ? 5 : dx < 1 ? 4 : 3];
        return ramp(A, 0.05 + (fh - k) / fh * 0.25 + (hh(gx, gy, s + 73) - 0.5) * 0.15, gx, gy);
      }
      let tt = 0.62 - (k / fh) * 0.25 + (vn(gx, gy, 3, s + 74) - 0.5) * 0.35;
      if (hh(gx, 5, s + 75) < 0.22 && k < ov + 2 + hh(gx, 6, s + 76) * 9) tt -= 0.3;   // roots hanging down the bank
      const tq = Math.floor((gx + 2) / 13), tc = tq * 13 + 2 + Math.floor(hh(tq, 7, s + 77) * 6);   // trunks rising into the canopy
      if (gx >= tc && gx < tc + 4 && hh(tq, 8, s + 78) < 0.6) tt = [0.75, 0.62, 0.48, 0.32][gx - tc] + (hh(gx, gy >> 1, s + 79) - 0.5) * 0.1;
      if (t <= 2) tt = t === 1 ? 0 : 0.12;
      return ramp(A, tt, gx, gy);
    }
    if (k === 0) return A[6];
    if (k === 1) return A[5];
    if (t <= 2) return A[t === 1 ? 0 : 1];
    if (F.style === 'bricks') {
      const row = Math.floor((k - 2) / 4), bx = Math.floor((gx + (row & 1) * 5) / 10);
      let c;
      if ((k - 2) % 4 === 3 || wrap(gx + (row & 1) * 5, 10) === 0) c = A[1];
      else c = ramp(A, 0.38 + hh(bx, row * 31 + gy - k, s + 80) * 0.3 + (hh(gx, gy, s + 81) - 0.5) * 0.12, gx, gy);
      if (R.moss && k < 2 + hh(gx, 1, s + 82) * 6 && hh(gx >> 1, 2, s + 83) < 0.45) c = A[6];   // moss dripping off the top
      return c;
    }
    if (F.style === 'bands') {
      const b = (k + vn(gx, 0, 9, s + 84) * 3) / 3.2, band = Math.floor(b);
      let tt = 0.45 + (hh(band, 9, s + 85) - 0.5) * 0.28 + (b - band < 0.25 ? -0.12 : 0) - (k / fh) * 0.15 + (hh(gx, gy, s + 86) - 0.5) * 0.12;
      if (hh(gx >> 1, gy >> 1, s + 87) < 0.04) tt -= 0.25;
      return ramp(A, tt, gx, gy);
    }
    // stripes (reef, grotto): vertical striations
    const st = vn(gx, 0, 3, s + 88) * 0.6 + vn(gx, gy, 6, s + 89) * 0.4;
    return ramp(A, 0.18 + st * 0.5 - (k / fh) * 0.12, gx, gy);
  }
  /** Flagstones (ruins: 16 x 8, staggered; origin: 32 x 16 marble with gold seams). */
  function slab(R, c, gx, gy) {
    const big = R.slabs === 'marble', sw = big ? 32 : 16, sh = big ? 16 : 8;
    const row = Math.floor(gy / sh), sx = gx + (row & 1) * (sw >> 1), ly = wrap(gy, sh), lx = wrap(sx, sw), id = hh(Math.floor(sx / sw), row, 91);
    if (ly === 0 || lx === 0) return big && (lx + ly) % 7 === 0 ? R.gold : mul(c, 0.7);
    if (ly === 1 || lx === 1) c = mul(c, 1.08);
    else c = mul(c, 0.92 + id * 0.14);
    if (R.moss && id < 0.12) c = mix(c, R.moss[2], 0.4);
    return c;
  }
  /** Small details on open ground: grass blades, flowers, fallen leaves, glowing spots, embers, pebbles (more at a cliff's foot). */
  function decor(R, c, gx, gy, s, up, dw, emis, i) {
    const cx = Math.floor(gx / 6), cy = Math.floor(gy / 5), lx = gx - cx * 6, ly = gy - cy * 5, h = hh(cx, cy, s + 100);
    if ((up >= 2 && up <= 9 && h < 0.2) || h > 1 - (R.pebbleP || 0.006)) {
      const P = R.pebble || [mul(R.ground[0], 0.8), R.ground[3], R.ground[6]], x = lx - 1 - Math.floor(hh(cx, cy, s + 101) * 3), y = ly - 1;
      if (x === 0 && y === 0) return P[2];
      if ((x === 1 && y === 0) || (x === 0 && y === 1)) return P[1];
      if (x === 1 && y === 1) return P[0];
      if (y === 2 && (x === 0 || x === 1)) return mul(c, 0.7);
      return c;
    }
    // grass blades: 2-4 thin strokes, in drifts
    const bp = R.bladeP || 0;
    if (bp && h < bp * (0.4 + hh(cx >> 2, cy >> 2, s + 102) * 0.9)) {
      const B = R.blades, bits = (hh(cx, cy, s + 103) * 4294967296) >>> 0, n = 2 + (bits & 3) % 3;
      for (let k = 0; k < n; k++) {
        const bx = ((bits >>> (2 + k * 3)) & 7) % 5, hgt = 2 + ((bits >>> (20 + k)) & 1);
        if (lx !== bx) continue;
        if (ly === 4) return B[0];
        if (ly >= 4 - hgt) return ly === 4 - hgt ? B[2] : B[1];
      }
      return c;
    }
    // flowers: a cluster of specks on an 8 x 8 cell
    const fx = Math.floor(gx / 8), fy = Math.floor(gy / 8);
    if (R.flowerP && hh(fx, fy, s + 106) < R.flowerP) {
      const col = R.flowers[Math.floor(hh(fx, fy, s + 107) * R.flowers.length)], ax = gx - fx * 8, ay = gy - fy * 8;
      for (const [a, b] of [[2, 2], [5, 3], [3, 5], [6, 6]]) { if (ax === a && ay === b) return col; if (ax === a && ay === b + 1) return mul(c, 0.72); }
    }
    if (R.leaves && dw < 26 && hh(gx, gy, s + 108) < R.leafP * (1 - dw / 26)) return R.leaves[(gx ^ gy) & 1];
    if (R.glow && hh(gx >> 1, gy >> 1, s + 109) < R.glowP && ((gx | gy) & 1) === 0) { emis[i] = 1; return R.glow[(gx >> 1) & 1]; }
    if (R.ember && hh(gx, gy, s + 110) < R.emberP) { emis[i] = 1; return R.ember[hh(gx, gy, s + 111) < 0.3 ? 1 : 0]; }
    return c;
  }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // ---------------- caching and drawing ----------------
  const cache = new Map();   // the floor's key -> art (the last 2)
  const keyOf = L => [L.seed | 0, L.route, L.floor | 0, L.w, L.h, (L.spawn || []).join(',')].join('|');
  function forZone(z) {
    const L = z && z.dive;
    if (!L) return null;
    const k = keyOf(L);
    let art = cache.get(k);
    if (!art) {
      art = build(L);
      cache.set(k, art);
      while (cache.size > 2) cache.delete(cache.keys().next().value);
    }
    return art;
  }
  /** G.World.drawGround's Dive branch (world coordinates, the camera's transform already on ctx). -> true when it drew. */
  function draw(ctx, cam, z) {
    const art = forZone(z);
    if (!art) return false;
    const PX = G.Sprites.PX;
    ctx.imageSmoothingEnabled = false;
    const l = cam.left(), t = cam.top(), r = l + cam.w, b = t + cam.h;
    const bx = art.ox * PX, by = art.oy * PX, br = bx + art.w * PX, bb = by + art.h * PX;
    if (l < bx || t < by || r > br || b > bb) {   // beyond the floor: the wall top, seamless
      if (!art.pattern) {
        art.pattern = ctx.createPattern(art.top, 'repeat');
        if (art.pattern && art.pattern.setTransform && typeof DOMMatrix === 'function') art.pattern.setTransform(new DOMMatrix([PX, 0, 0, PX, 0, 0]));
      }
      ctx.fillStyle = art.pattern || '#000';
      ctx.fillRect(Math.floor(l) - 2, Math.floor(t) - 2, Math.ceil(cam.w) + 4, Math.ceil(cam.h) + 4);
    }
    const ax0 = Math.max(0, Math.floor((l - bx) / PX) - 1), ay0 = Math.max(0, Math.floor((t - by) / PX) - 1);
    const ax1 = Math.min(art.w, Math.ceil((r - bx) / PX) + 1), ay1 = Math.min(art.h, Math.ceil((b - by) / PX) + 1);
    if (ax1 > ax0 && ay1 > ay0) ctx.drawImage(art.canvas, ax0, ay0, ax1 - ax0, ay1 - ay0, bx + ax0 * PX, by + ay0 * PX, (ax1 - ax0) * PX, (ay1 - ay0) * PX);
    return true;
  }
  /** FNV-1a of an art's pixels, read back from its canvas. */
  function hashOf(art) {
    const d = art.canvas.getContext('2d').getImageData(0, 0, art.w, art.h).data;
    let h = 0x811c9dc5;
    for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
  function clear() { cache.clear(); }
  /** The minimap's colour of a Dive tile (zone.mini, set by dive-gen.js zone()): the route's own wall / water / ground. */
  function mini(z, c, tx, ty) {
    const R = ROUTES[routeOf(z.dive && z.dive.route)], t = z.terr(tx, ty), rgb = v => [R_(v), G_(v), B_(v)];
    if (!z.inside(tx, ty) || t === WALL) return rgb(R.lush ? R.crown[2] : R.top[2]);
    if (t === LIQ) return rgb(R.water[z.terr(tx, ty - 1) === LIQ && z.terr(tx, ty + 1) === LIQ ? 2 : 4]);
    const out = rgb(R.ground[hh(tx, ty, 31) < 0.5 ? 3 : 4]);
    return z.terr(tx, ty + 1) === WALL ? out.map(v => v * 0.75) : out;
  }
  return { ROUTES, TP, MG, FACE, PW, PH, build, draw, forZone, hashOf, clear, mini, stats, get cached() { return cache.size; } };
})();
