// Compose Pokermon joker card art for a joker that has no upstream sprite (owner rule: build the card, never ship a
// placeholder). Standalone tool: it is NOT wired into the game and never writes into an asset folder.
//
// Method (all nearest-neighbour, no smoothing; every 3.9.1 joker sheet cell is an exact 2x doubling of a 71 x 95 card,
// so the work happens on that logical grid and is doubled back to 142 x 190 at the end):
//   1. Frame + scenic background: per-pixel MODE of the sibling cards (same sheet, same type colour, same stage ball,
//      same background template). Their Pokemon and names differ, so the most common value is the empty card. The
//      siblings' names (glyph grey 75,82,77 + white outline) are ignored in the banner; a banner pixel that every
//      sibling's name covers is taken from the pool of every card on the sheet whose frame ring matches. Optional --bg
//      cells (same background template, any frame colour) add votes inside the art window only; by default the siblings'
//      sheets are also scanned for every card with the same background (and the same dither phase) to add votes.
//   2. Name: drawn in the upstream name font (FONT below, harvested from the sheets' own banners: cap height 6, x-height
//      4, descender 2, 1px letter gap, glyph grey with a white 8-neighbour outline, first glyph at x 17, cap top row 7).
//   3. Pokemon: the site's battle sprite (overworld/data/pokemon/<species_index.json sprite>, the file battle.js draws),
//      trimmed to its alpha >= threshold bounding box, given ONE integer nearest-neighbour scale (x1..x4, or keep every
//      2nd..6th pixel for oversized sprites) that best fits upstream's typical Pokemon box, then centred and bottom-
//      anchored like upstream (PLACE, measured on real cards) and clipped to the art window (behind the ball / type icon).
//      Partially transparent edge pixels are thresholded (no blended edges), so the result stays crisp pixel art, and
//      a 1px selective dark outline is added outside the sprite to match upstream's outlined sprites (--no-outline).
//   4. Shiny: the same steps on the matching *Shiny-391 sheet cells (upstream Shiny cards keep the layout but have the
//      grey shiny border and sparkle), and the Pokemon gets battle.js's shiny filter `hue-rotate(150deg) saturate(1.3)`
//      using the CSS Filter Effects matrices on un-premultiplied sRGB, each step clamped, alpha unchanged.
//
// Usage:
//   node tools/micatro/compose_pokermon_joker_art.mjs --name lotad --species lotad \
//     --siblings Natdex:16,3,Natdex:28,3,Natdex:12,0,Natdex:14,10 [--bg auto|none|Sheet:x,y,...] [--exclude Sheet:x,y,...] [--label "Lotad"] \
//     [--out <dir>] [--force] [--no-outline] [--scale 1|2|-2...] [--alpha-threshold 128] [--assets <Basic Series dir>] [--data <overworld/data dir>]
//   --name       output base name: writes <out>/<name>.png and <out>/<name>Shiny.png (142 x 190 RGBA)
//   --species    key in overworld/data/species_index.json (default: --name)
//   --siblings   3+ cells "Sheet:x,y" (Sheet = the part of AtlasJokersBasic<Sheet>-391.png, e.g. Natdex, Gen03); the
//                shiny card uses the same cells of <Sheet>Shiny. Pick cards with the same frame colour, stage and background.
//   --bg         extra cells voting only inside the art window (same scenic background, any frame colour); by default
//                ('auto') every card on the siblings' sheets whose art window matches the siblings' empty background
//                is added too; '--bg none' turns that off, '--bg auto,Gen03:1,2' combines both
//   --exclude    cells the auto background scan must never use (e.g. the real card, when testing against it)
//   --label      text for the name banner (default: --name with a capital first letter); --label "" draws none (the Others sheet's
//                white JOKER cards have no banner)
//   --base Sheet:x,y --clear x0,y0,x1,y1   instead of --siblings: the frame is that one card with the box (logical pixels) cleared
//                to its most common colour (an Others-sheet white JOKER card minus its picture; batch 17)
//   --key-corner the sprite's corner colour is transparent (an icon saved without alpha, e.g. rage_candy_bar.png)
//   --sprite     a sprite PNG to use instead of --species' battle sprite (batch 17: Rage Candy Bar / Repel from overworld/item_icons;
//                1 / 2 / 4 / 8-bit palette PNGs are read too)
//   --out        output dir (default: <os tmpdir>/pokermon_joker_art); refuses asset / data folders
//   --force      overwrite existing outputs (default: refuse)
//   --no-outline leave out the 1px selective dark outline (each edge pixel's colour x 0.3) drawn round the sprite;
//                upstream's card sprites are outlined, the battle sprites are not. Without it the Pokemon's pixels
//                are exactly the battle sprite's.
//   --scale      force the sprite scale (k >= 1 enlarge, k <= -2 keep every |k|-th pixel)
// Defaults for --assets / --data: this checkout's micatro/mods/pokermon/assets/2x/Basic Series and overworld/data, then
// $MICATRO_MAIN's, then the main checkout above a .worktrees/<name> folder. It prints a short report: the sprite scale and
// position, the auto background cells used, `artGuessed` (art-window pixels no card offered a background colour for,
// filled by continuing the dither; high = pick more / better siblings), `fromPool` / `unresolved` (banner pixels every
// sibling's name covered / that every pooled card's name covered too, the latter filled by continuing the dither).
// Always look at the result: a background template with few matching cards, or a frame colour with few cards, shows.
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

// ---- card template (logical 1x pixels) --------------------------------------------------------------------------------
export const CELL_W = 142, CELL_H = 190, PX = 2, LW = CELL_W / PX, LH = CELL_H / PX;
/** Name banner: left x of the first glyph, glyph cap-top row, and the zone an old name (with its outline) can cover. */
export const NAME = { x: 17, top: 7, zone: { x0: 15, y0: 5, x1: 66, y1: 15 } };
export const GLYPH_RGBA = [75, 82, 77, 255], OUTLINE_RGBA = [255, 255, 255, 255];
/** Art window interior (inclusive), minus the frame furniture that overlaps it (stage ball top-left, type icon bottom-left). */
export const ART = { x0: 8, y0: 16, x1: 61, y1: 76 };
const inFurniture = (x, y) => (y <= 17 && x <= 14) || (y >= 74 && x <= 21);
export const inArt = (x, y) => x >= ART.x0 && x <= ART.x1 && y >= ART.y0 && y <= ART.y1 && !inFurniture(x, y);
/**
 * Where upstream puts the Pokemon, measured on 65 real Natdex cards (two background templates, bbox of the pixels that
 * differ from the reconstructed empty card): median bbox centre x 35, median bottom row 69 (spread 63-76), median
 * larger side 52 px (a third of them fill the window's 54 px width). `overflow`: columns the window may clip.
 */
export const PLACE = { cx: 35, bottom: 69, target: 52, overflow: 4 };

// ---- upstream Pokermon name font (harvested from the 3.9.1 name banners; 8 rows = cap top .. descender; '2' and "'"
// are drawn to match, every other glyph is upstream's) -------------------------------------------------------------------
export const FONT = {
  "'": "#/#/./././././.", "-": "..../..../..../####/..../..../..../....", ".": "./././././#/./.",
  "2": ".###./#...#/...#./..#../.#.../#####/...../.....", ":": "././#/././#/./.", "A": ".###./#...#/#...#/#####/#...#/#...#/...../.....",
  "B": "####./#...#/####./#...#/#...#/####./...../.....", "C": ".###./#...#/#..../#..../#...#/.###./...../.....",
  "D": "####./#...#/#...#/#...#/#...#/####./...../.....", "E": "#####/#..../####./#..../#..../#####/...../.....",
  "F": "#####/#..../####./#..../#..../#..../...../.....", "G": ".###./#...#/#..../#..##/#...#/.###./...../.....",
  "H": "#...#/#...#/#####/#...#/#...#/#...#/...../.....", "I": "###/.#./.#./.#./.#./###/.../...",
  "J": "..###/...#./...#./...#./#..#./.##../...../.....", "K": "#...#/#..#./#.#../###../#..#./#...#/...../.....",
  "L": "#..../#..../#..../#..../#..../#####/...../.....", "M": "#...#/##.##/#.#.#/#...#/#...#/#...#/...../.....",
  "N": "#...#/##..#/#.#.#/#..##/#...#/#...#/...../.....", "O": ".###./#...#/#...#/#...#/#...#/.###./...../.....",
  "P": "####./#...#/#...#/####./#..../#..../...../.....", "Q": ".###./#...#/#...#/#.#.#/#..#./.##.#/...../.....",
  "R": "####./#...#/#...#/####./#..#./#...#/...../.....", "S": ".###./#...#/.##../...#./#...#/.###./...../.....",
  "T": "#####/..#../..#../..#../..#../..#../...../.....", "U": "#...#/#...#/#...#/#...#/#...#/.###./...../.....",
  "V": "#...#/#...#/.#.#./.#.#./..#../..#../...../.....", "W": "#...#/#...#/#.#.#/#.#.#/.#.#./.#.#./...../.....",
  "X": "#...#/.#.#./..#../..#../.#.#./#...#/...../.....", "Y": "#...#/#...#/.#.#./..#../..#../..#../...../.....",
  "Z": "#####/...#./..#../.#.../#..../#####/...../.....", "a": "..../..../.##./#..#/#..#/.###/..../....",
  "b": "#.../#.../###./#..#/#..#/###./..../....", "c": ".../.../.##/#../#../.##/.../...", "d": "...#/...#/.###/#..#/#..#/.###/..../....",
  "e": "..../..../.##./#..#/###./.###/..../....", "f": "..#./.#.#/.#../###./.#../.#../..../....",
  "g": "..../..../.##./#..#/#..#/.##./...#/.##.", "h": "#.../#.../###./#..#/#..#/#..#/..../....", "i": ".#/../##/.#/.#/.#/../..",
  "j": ".#/../##/.#/.#/.#/#./..", "k": "#.../#.../#..#/#.#./###./#..#/..../....", "l": "##/.#/.#/.#/.#/.#/../..",
  "m": "...../...../##.#./#.#.#/#.#.#/#.#.#/...../.....", "n": "..../..../###./#..#/#..#/#..#/..../....",
  "o": "..../..../.##./#..#/#..#/.##./..../....", "p": "..../..../###./#..#/#..#/###./#.../#...",
  "q": "..../..../.###/#..#/#..#/.###/...#/...#", "r": ".../.../#.#/##./#../#../.../...", "s": "..../..../.###/##../..##/###./..../....",
  "t": ".../.#./###/.#./.#./..#/.../...", "u": "..../..../#..#/#..#/#..#/.###/..../....", "v": "..../..../#..#/#..#/#.#./.#../..../....",
  "w": "...../...../#...#/#.#.#/#.#.#/.#.#./...../.....", "x": "..../..../#..#/.##./.##./#..#/..../....",
  "y": "..../..../#..#/#..#/#..#/.##./...#/.##.", "z": "..../..../####/..#./.#../####/..../....",
};
const SPACE_ADVANCE = 2, LETTER_GAP = 1;

// ---- PNG (zlib only; the same decoder / encoder as split_pokermon_unown_swarm.mjs) ---------------------------------------
export function decode(file) {
  const buf = fs.readFileSync(file);
  let p = 8, w, h, depth, ctype, inter, pal = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ctype = d[9]; inter = d[12]; }
    else if (type === 'PLTE') pal = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  // (8-bit RGB / RGBA / palette, and 1 / 2 / 4-bit palette: the overworld's GBA item icons are 4-bit)
  const okDepth = depth === 8 || (ctype === 3 && [1, 2, 4].includes(depth));
  if (!okDepth || inter !== 0 || ![2, 3, 6].includes(ctype)) throw new Error(`${file}: unsupported PNG (depth ${depth}, type ${ctype}, interlace ${inter})`);
  const bpp = ctype === 6 ? 4 : ctype === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = depth === 8 ? w * bpp : Math.ceil(w * depth / 8), px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  const rgba = Buffer.alloc(w * h * 4);
  const index = (i) => {
    if (depth === 8) return px[i];
    const y = Math.floor(i / w), x = i % w, per = 8 / depth, byte = px[y * stride + Math.floor(x / per)];
    return (byte >> (8 - depth * (x % per + 1))) & ((1 << depth) - 1);
  };
  for (let i = 0; i < w * h; i++) {
    if (ctype === 6) px.copy(rgba, i * 4, i * 4, i * 4 + 4);
    else if (ctype === 2) { px.copy(rgba, i * 4, i * 3, i * 3 + 3); rgba[i * 4 + 3] = 255; }
    else { const k = index(i); rgba[i * 4] = pal[k * 3]; rgba[i * 4 + 1] = pal[k * 3 + 1]; rgba[i * 4 + 2] = pal[k * 3 + 2]; rgba[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255; }
  }
  return { w, h, rgba };
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** 8-bit RGBA PNG; each row takes the filter (0-4) with the smallest sum of |bytes| (libpng's heuristic). */
export function encode(w, h, rgba) {
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h), cand = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    let best = -1, bestSum = Infinity;
    for (let f = 0; f <= 4; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const v = rgba[y * stride + x], a = x >= 4 ? rgba[y * stride + x - 4] : 0, b = y ? rgba[(y - 1) * stride + x] : 0, c = x >= 4 && y ? rgba[(y - 1) * stride + x - 4] : 0;
        let p = 0;
        if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
        else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const o = (v - p) & 255;
        cand[x] = o;
        sum += o < 128 ? o : 256 - o;
      }
      if (sum < bestSum) { bestSum = sum; best = f; cand.copy(raw, y * (stride + 1) + 1); }
    }
    raw[y * (stride + 1)] = best;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- frame reconstruction ---------------------------------------------------------------------------------------------
const pack = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const unpack = (v, o, i) => { o[i] = v & 255; o[i + 1] = (v >>> 8) & 255; o[i + 2] = (v >>> 16) & 255; o[i + 3] = v >>> 24; };
const GLYPH = pack(GLYPH_RGBA, 0), OUTLINE = pack(OUTLINE_RGBA, 0);
const isText = (v) => v === GLYPH || v === OUTLINE;
const inNameZone = (x, y) => x >= NAME.zone.x0 && x <= NAME.zone.x1 && y >= NAME.zone.y0 && y <= NAME.zone.y1;

const sheetCache = new Map();
export function loadSheet(dir, name) {
  const file = path.join(dir, `AtlasJokersBasic${name}-391.png`);
  if (!sheetCache.has(file)) sheetCache.set(file, { ...decode(file), name });
  return sheetCache.get(file);
}
/** One card as a logical 71 x 95 packed-RGBA Uint32Array (null if the cell is empty); throws if it is not 2x-doubled. */
export function cellOf(sheet, cx, cy) {
  if ((cx + 1) * CELL_W > sheet.w || (cy + 1) * CELL_H > sheet.h) throw new Error(`cell ${cx},${cy} is outside the sheet`);
  const out = new Uint32Array(LW * LH);
  let any = false, undoubled = 0;
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const i = ((cy * CELL_H + y * PX) * sheet.w + cx * CELL_W + x * PX) * 4, v = pack(sheet.rgba, i);
    if (v !== pack(sheet.rgba, i + 4) || v !== pack(sheet.rgba, i + sheet.w * 4)) undoubled++;
    out[y * LW + x] = v;
    if (v >>> 24) any = true;
  }
  if (undoubled > 20) throw new Error(`cell ${cx},${cy} is not a 2x-doubled card (${undoubled} mismatched 2x2 blocks)`);
  return any ? out : null;
}
/** Most common value and its count (ties: the first seen). */
function mode(vals) {
  const m = new Map();
  let best = vals[0], bc = 0;
  for (const v of vals) { const c = (m.get(v) || 0) + 1; m.set(v, c); if (c > bc) { bc = c; best = v; } }
  return [best, bc];
}
/** The empty card: see the header, step 1. */
export function buildFrame(sibs, bg = [], pool = []) {
  const out = new Uint32Array(LW * LH);
  const stats = { artGuessed: 0, fromPool: 0, unresolved: 0 };
  // colours the siblings' banners show outside their names: the pool may only fill a pixel with one of these
  const bannerPal = new Set();
  for (const s of sibs) for (let p = 0; p < out.length; p++) if (inNameZone(p % LW, (p / LW) | 0) && !isText(s[p])) bannerPal.add(s[p]);
  const todo = [], voters = [...sibs, ...bg], weak = [];
  const rowPal = Array.from({ length: LH }, () => new Set());
  for (let p = 0; p < out.length; p++) {
    const x = p % LW, y = (p / LW) | 0;
    if (inArt(x, y)) {
      const [v, c] = mode(voters.map((s) => s[p]));
      out[p] = v;
      if (c >= Math.max(2, voters.length / 2)) rowPal[y].add(v); else weak.push(p);
    } else if (inNameZone(x, y)) {
      let vals = sibs.map((s) => s[p]).filter((v) => !isText(v));
      if (!vals.length) { vals = pool.map((s) => s[p]).filter((v) => !isText(v) && bannerPal.has(v)); stats.fromPool++; }
      if (vals.length) out[p] = mode(vals)[0]; else todo.push(p);
    } else out[p] = mode(sibs.map((s) => s[p]))[0];
  }
  // Art-window pixels without a clear majority (the middle, where most cards have their Pokemon): Pokemon share colours
  // (black outlines, whites), so a plurality there can be a Pokemon. Only colours the clear background shows on the
  // same or adjacent rows may win; when no card offers one, the row's dither is continued (period 4, then 2).
  const weakSet = new Set(weak);
  for (const p of weak) {
    const y = (p / LW) | 0, x = p % LW, ok = new Set();
    for (let r = 1; r <= 4 && !ok.size; r++) for (let yy = y - r; yy <= y + r; yy++) for (const v of rowPal[yy] || []) ok.add(v);
    const vals = voters.map((s) => s[p]).filter((v) => ok.has(v));
    if (vals.length) { out[p] = mode(vals)[0]; weakSet.delete(p); continue; }
    stats.artGuessed++;
    const cands = [];
    for (let k = 1; k <= 8; k++) cands.push([4 * k, 0], [-4 * k, 0], [2 * k, 0], [-2 * k, 0], [0, 2 * k], [0, -2 * k]);
    const src = cands.map(([dx, dy]) => (y + dy) * LW + x + dx).find((q, i) => inArt(x + cands[i][0], y + cands[i][1]) && !weakSet.has(q));
    if (src !== undefined) { out[p] = out[src]; weakSet.delete(p); }
  }
  // Pixels every card's name covers (the first letter always starts at x 17): continue the banner's dither, which
  // repeats every 4 pixels along a row.
  for (const p of todo) {
    stats.unresolved++;
    const x = p % LW, y = (p / LW) | 0;
    const src = [4, -4, 8, -8, 12, -12].map((d) => x + d).find((sx) => sx >= NAME.zone.x0 && sx <= NAME.zone.x1 && !todo.includes(y * LW + sx));
    out[p] = src !== undefined ? out[y * LW + src] : sibs[0][p];
  }
  return { frame: out, stats };
}
// Frame ring used to match frames (skips the outermost pixel, which carries per-card edge bleed).
const RING = (x, y) => x >= 1 && x <= 69 && y >= 1 && y <= 93 && (x <= 2 || x >= 68 || y <= 2 || y >= 91 || ((x <= 6 || x >= 63) && y >= 20 && y <= 70));
/** Every cell on `sheets` whose frame ring matches `ref` on >= 97% of its pixels (same frame colour and shiny-ness). */
export function framePool(sheets, ref) {
  const ring = [];
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) if (RING(x, y)) ring.push(y * LW + x);
  const pool = [];
  for (const sh of sheets) for (let cy = 0; cy < Math.floor(sh.h / CELL_H); cy++) for (let cx = 0; cx < Math.floor(sh.w / CELL_W); cx++) {
    let c; try { c = cellOf(sh, cx, cy); } catch { continue; }
    if (!c) continue;
    let same = 0; for (const p of ring) if (c[p] === ref[p]) same++;
    if (same >= ring.length * 0.97) pool.push(c);
  }
  return pool;
}

/**
 * Cells on `sheets` (other than `skip`) that show the same scenic background as the siblings: on the art-window pixels
 * where 3+ siblings agree (no Pokemon there), they match the siblings' value on >= `min` of them. Any frame colour.
 */
export function findBackgroundCells(sheets, sibs, skip = new Set(), min = 0.5) {
  const cons = new Array(LW * LH), idx = [];
  for (let p = 0; p < LW * LH; p++) {
    if (!inArt(p % LW, (p / LW) | 0)) continue;
    const [v, c] = mode(sibs.map((s) => s[p]));
    if (c >= Math.min(3, sibs.length)) { cons[p] = v; idx.push(p); }
  }
  const found = [];
  if (idx.length < 200) return found;
  // Dither-phase check: consensus pixels whose value differs from the consensus one pixel over. A card with the same
  // scene but the other dither phase (some artists' cards) matches those shifted rather than in place; it is left out
  // because mixing phases would scramble the dither.
  const SH = [1, -1, LW, -LW], sens = idx.filter((p) => SH.some((d) => cons[p + d] !== undefined && cons[p + d] !== cons[p]));
  for (const sh of sheets) for (let cy = 0; cy < Math.floor(sh.h / CELL_H); cy++) for (let cx = 0; cx < Math.floor(sh.w / CELL_W); cx++) {
    if (skip.has(`${sh.name}:${cx},${cy}`)) continue;
    let c; try { c = cellOf(sh, cx, cy); } catch { continue; }
    if (!c) continue;
    let same = 0; for (const p of idx) if (c[p] === cons[p]) same++;
    if (same < idx.length * min) continue;
    if (sens.length >= 100) {
      let s0 = 0, s1 = 0;
      for (const p of sens) { if (c[p] === cons[p]) s0++; if (SH.some((d) => c[p + d] === cons[p] && cons[p + d] !== cons[p])) s1++; }
      if (s0 < s1) continue;
    }
    found.push({ cell: c, at: `${sh.name}:${cx},${cy}` });
  }
  return found;
}

// ---- name, sprite, compositing ----------------------------------------------------------------------------------------
/**
 * Draw `text` in the upstream name font: glyph grey with a white 8-neighbour outline. `opts.x`: the first glyph's left x
 * (default NAME.x; a Legendary card's name starts after its L / M mark); `opts.gap`: the letter gap (default 1; 0 squeezes
 * a long name into the banner, as compose_missing_pokermon_jokers.mjs does).
 */
export function drawName(img, text, opts = {}) {
  if (!text) return; // (an Others-sheet card has no name banner: --label "")
  const glyph = new Uint8Array(LW * LH);
  const gap = opts.gap ?? LETTER_GAP;
  let x = opts.x ?? NAME.x;
  for (const ch of text) {
    if (ch === ' ') { x += SPACE_ADVANCE; continue; }
    const g = FONT[ch];
    if (!g) throw new Error(`no glyph for ${JSON.stringify(ch)} in the name font (has: space ${Object.keys(FONT).join('')})`);
    const rows = g.split('/');
    rows.forEach((r, dy) => { for (let dx = 0; dx < r.length; dx++) if (r[dx] === '#') glyph[(NAME.top + dy) * LW + x + dx] = 1; });
    x += rows[0].length + gap;
  }
  if (x - gap > NAME.zone.x1) throw new Error(`name "${text}" is too wide for the banner`);
  for (let y = 1; y < LH - 1; y++) for (let x2 = 1; x2 < LW - 1; x2++) {
    const p = y * LW + x2;
    if (glyph[p]) { img[p] = GLYPH; continue; }
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (glyph[p + dy * LW + dx]) { near = true; break; }
    if (near) img[p] = OUTLINE;
  }
}

/** CSS Filter Effects `hue-rotate(deg) saturate(s)` on un-premultiplied sRGB bytes; alpha unchanged. */
export function hueRotateSaturate(rgba, deg = 150, sat = 1.3) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const H = [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
  const S = [0.213 + 0.787 * sat, 0.715 - 0.715 * sat, 0.072 - 0.072 * sat,
    0.213 - 0.213 * sat, 0.715 + 0.285 * sat, 0.072 - 0.072 * sat,
    0.213 - 0.213 * sat, 0.715 - 0.715 * sat, 0.072 + 0.928 * sat];
  const mul = (M, v) => [0, 1, 2].map((r) => Math.min(1, Math.max(0, M[r * 3] * v[0] + M[r * 3 + 1] * v[1] + M[r * 3 + 2] * v[2])));
  const out = Buffer.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    const v = mul(S, mul(H, [out[i] / 255, out[i + 1] / 255, out[i + 2] / 255]));
    out[i] = Math.round(v[0] * 255); out[i + 1] = Math.round(v[1] * 255); out[i + 2] = Math.round(v[2] * 255);
  }
  return out;
}

/** Battle sprite trimmed to the bounding box of its pixels with alpha >= threshold. */
export function loadSprite(file, threshold = 128, key_corner = false) {
  const s = key_corner ? keyCorner(decode(file)) : decode(file);
  let x0 = s.w, y0 = s.h, x1 = -1, y1 = -1;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.rgba[(y * s.w + x) * 4 + 3] >= threshold) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) throw new Error(`${file}: no opaque pixels`);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) s.rgba.copy(rgba, y * w * 4, ((y0 + y) * s.w + x0) * 4, ((y0 + y) * s.w + x1 + 1) * 4);
  return { w, h, rgba };
}
const scaledSize = (k, v) => (k > 0 ? v * k : Math.ceil(v / -k));
/** The integer scale (x1..x4, or every 2nd..6th pixel) whose larger side best matches upstream's typical size and fits. */
export function pickScale(w, h) {
  const maxW = ART.x1 - ART.x0 + 1, maxH = PLACE.bottom - ART.y0 + 1;
  let best = null, bs = Infinity;
  for (const k of [4, 3, 2, 1, -2, -3, -4, -5, -6]) {
    const sw = scaledSize(k, w), sh = scaledSize(k, h);
    if (sw > maxW + PLACE.overflow || sh > maxH) continue; // a few columns may be clipped by the window, as upstream's are
    const score = Math.abs(Math.log(Math.max(sw, sh) / PLACE.target));
    if (score < bs) { bs = score; best = k; }
  }
  if (best === null) throw new Error('sprite is too large for every allowed scale');
  return best;
}
export function scaleNearest(spr, k) {
  const w = scaledSize(k, spr.w), h = scaledSize(k, spr.h), out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = k > 0 ? Math.floor(x / k) : x * -k, sy = k > 0 ? Math.floor(y / k) : y * -k;
    spr.rgba.copy(out, (y * w + x) * 4, (sy * spr.w + sx) * 4, (sy * spr.w + sx) * 4 + 4);
  }
  return { w, h, rgba: out };
}
/** Paste (alpha-thresholded) centred on PLACE.cx with its bottom row on PLACE.bottom, clipped to the art window. */
export function placeSprite(img, spr, threshold = 128, outline = false) {
  const left = Math.floor(PLACE.cx + 0.5 - spr.w / 2), top = PLACE.bottom - spr.h + 1;
  const t = new Uint8Array(4), on = (x, y) => x >= 0 && y >= 0 && x < spr.w && y < spr.h && spr.rgba[(y * spr.w + x) * 4 + 3] >= threshold;
  for (let y = -1; y <= spr.h; y++) for (let x = -1; x <= spr.w; x++) {
    const X = left + x, Y = top + y;
    if (!inArt(X, Y)) continue;
    let i;
    if (on(x, y)) { i = (y * spr.w + x) * 4; t[0] = spr.rgba[i]; t[1] = spr.rgba[i + 1]; t[2] = spr.rgba[i + 2]; }
    else {
      // outline: a 1px selective outline (the touching sprite pixel, darkened), like upstream's outlined sprites
      if (!outline) continue;
      const n = [[0, 1], [0, -1], [1, 0], [-1, 0]].find(([dx, dy]) => on(x + dx, y + dy));
      if (!n) continue;
      i = ((y + n[1]) * spr.w + x + n[0]) * 4;
      t[0] = spr.rgba[i] * 0.3; t[1] = spr.rgba[i + 1] * 0.3; t[2] = spr.rgba[i + 2] * 0.3;
    }
    t[3] = 255;
    img[Y * LW + X] = pack(t, 0);
  }
  return { left, top };
}
/** Logical image -> 142 x 190 RGBA buffer (every pixel doubled). */
export function toPhysical(img) {
  const out = Buffer.alloc(CELL_W * CELL_H * 4);
  for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) unpack(img[((y / PX) | 0) * LW + ((x / PX) | 0)], out, (y * CELL_W + x) * 4);
  return out;
}

/** Parse "Natdex:0,18,Gen03:4,2" (commas or spaces between cells). */
export function parseCells(s) {
  const out = [], re = /([A-Za-z0-9]+):(\d+),(\d+)/g;
  let m; while ((m = re.exec(s || ''))) out.push({ sheet: m[1], x: +m[2], y: +m[3] });
  return out;
}

/**
 * A frame from ONE card with a box of it cleared to the box's most common colour (batch 17: the Others sheet's plain white JOKER
 * cards have no name banner and too few siblings for the per-pixel mode: Rage Candy Bar / Repel take the Everstone-like rock card,
 * Others {8,0}, minus its rock). `box` = [x0, y0, x1, y1] in logical (71 x 95) pixels, inclusive.
 */
export function clearedFrame(cell, box) {
  const [x0, y0, x1, y1] = box;
  const counts = new Map();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = cell[y * LW + x]; counts.set(v, (counts.get(v) || 0) + 1); }
  let bgv = 0, n = -1;
  for (const [v, c] of counts) if (c > n) { n = c; bgv = v; }
  const out = cell.slice();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out[y * LW + x] = bgv;
  return out;
}
/** A sprite without an alpha channel (a GBA icon): its corner colour becomes transparent (--key-corner). */
export function keyCorner(spr) {
  const c = spr.rgba.readUInt32LE(0);
  for (let i = 0; i < spr.w * spr.h; i++) if (spr.rgba.readUInt32LE(i * 4) === c) spr.rgba[i * 4 + 3] = 0;
  return spr;
}

/** Compose one joker: returns { normal, shiny } as 142 x 190 RGBA buffers plus a report. */
export function compose({ label, spriteFile, siblings, bg = [], autoBg = true, exclude = [], assets, scale = null, threshold = 128, outline = true, base = null, clear = null, key_corner = false }) {
  const report = {};
  const spr0 = key_corner ? loadSprite(spriteFile, threshold, true) : loadSprite(spriteFile, threshold);
  const k = scale ?? pickScale(spr0.w, spr0.h);
  report.sprite = `${path.basename(spriteFile)} trimmed ${spr0.w}x${spr0.h}, scale ${k > 0 ? 'x' + k : '1/' + -k}`;
  const out = {};
  for (const variant of ['normal', 'shiny']) {
    const suf = variant === 'shiny' ? 'Shiny' : '';
    const cells = (list) => list.map((c) => {
      const cell = cellOf(loadSheet(assets, c.sheet + suf), c.x, c.y);
      if (!cell) throw new Error(`${c.sheet}${suf}:${c.x},${c.y} is an empty cell`);
      return cell;
    });
    if (base) {
      // (--base / --clear: one card, its art box cleared — no sibling mode)
      const [bc] = cells([base]);
      const frame = clearedFrame(bc, clear);
      drawName(frame, label);
      let spr = scaleNearest(spr0, k);
      if (variant === 'shiny') spr = { ...spr, rgba: hueRotateSaturate(spr.rgba) };
      const at = placeSprite(frame, spr, threshold, outline);
      report[variant] = { base: `${base.sheet}${suf}:${base.x},${base.y}`, cleared: clear.join(','), spriteAt: `${at.left},${at.top} ${spr.w}x${spr.h}` };
      out[variant] = toPhysical(frame);
      continue;
    }
    const sibs = cells(siblings), bgs = cells(bg);
    const sheets = [...new Set(siblings.map((c) => c.sheet + suf))].map((n) => loadSheet(assets, n));
    if (autoBg) {
      const skip = new Set([...siblings, ...bg, ...exclude].map((c) => `${c.sheet}${suf}:${c.x},${c.y}`));
      const more = findBackgroundCells(sheets, sibs, skip);
      bgs.push(...more.map((m) => m.cell));
      report[variant + 'Bg'] = more.map((m) => m.at).join(' ');
    }
    const first = buildFrame(sibs, bgs, []);
    const pool = first.stats.unresolved ? framePool(sheets, first.frame) : [];
    const { frame, stats } = pool.length ? buildFrame(sibs, bgs, pool) : first;
    drawName(frame, label);
    let spr = scaleNearest(spr0, k);
    if (variant === 'shiny') spr = { ...spr, rgba: hueRotateSaturate(spr.rgba) };
    const at = placeSprite(frame, spr, threshold, outline);
    report[variant] = { ...stats, pool: pool.length, spriteAt: `${at.left},${at.top} ${spr.w}x${spr.h}` };
    out[variant] = toPhysical(frame);
  }
  return { ...out, report };
}

// ---- CLI ---------------------------------------------------------------------------------------------------------------
function findDir(rel) {
  const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..');
  const cands = [path.join(process.cwd(), rel), path.join(repo, rel)];
  if (process.env.MICATRO_MAIN) cands.push(path.join(process.env.MICATRO_MAIN, rel));
  const wt = repo.split(path.sep).lastIndexOf('.worktrees');
  if (wt > 0) cands.push(path.join(repo.split(path.sep).slice(0, wt).join(path.sep), rel));
  return cands.find((d) => fs.existsSync(d)) || cands[0];
}
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([\w-]+)(?:=(.*))?$/);
    if (!m) throw new Error(`unexpected argument ${argv[i]}`);
    if (m[2] !== undefined) a[m[1]] = m[2];
    else if (['force', 'no-outline', 'key-corner'].includes(m[1])) a[m[1]] = true;
    else a[m[1]] = argv[++i];
  }
  return a;
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.name || (!a.siblings && !a.base)) {
    console.error('usage: node tools/micatro/compose_pokermon_joker_art.mjs --name <joker> --siblings Sheet:x,y,Sheet:x,y,Sheet:x,y [--species key] [--bg auto|none|cells] [--exclude cells] [--label text] [--out dir] [--force] [--no-outline] [--scale k] [--alpha-threshold n] [--assets dir] [--data dir]');
    process.exit(2);
  }
  const assets = a.assets || findDir('micatro/mods/pokermon/assets/2x/Basic Series');
  const data = a.data || findDir('overworld/data');
  const outDir = path.resolve(a.out || path.join(os.tmpdir(), 'pokermon_joker_art'));
  const norm = outDir.replace(/\\/g, '/').toLowerCase();
  if (/\/mods\/[^/]+\/assets(\/|$)/.test(norm) || /\/overworld\/data(\/|$)/.test(norm) || /\/micatro\/(assets|resources)(\/|$)/.test(norm)) {
    throw new Error(`refusing to write into a game asset folder: ${outDir}`);
  }
  const siblings = parseCells(a.siblings), bg = parseCells(a.bg), exclude = parseCells(a.exclude), autoBg = a.bg == null || /(^|,)\s*auto\s*(,|$)/.test(a.bg);
  const base = a.base ? parseCells(a.base)[0] : null;
  const clear = a.clear ? a.clear.split(',').map(Number) : null;
  if (base && !(clear && clear.length === 4 && clear.every(Number.isInteger))) throw new Error('--base needs --clear x0,y0,x1,y1 (logical pixels)');
  if (!base && siblings.length < 3) throw new Error('need 3 or more --siblings cells (Sheet:x,y)');
  // --sprite <png>: any sprite file instead of a species' battle sprite (a non-Pokemon joker: an overworld item icon, overworld/item_icons)
  let spriteFile;
  if (a.sprite) spriteFile = path.resolve(a.sprite);
  else {
    const species = (a.species || a.name).toLowerCase();
    const idx = JSON.parse(fs.readFileSync(path.join(data, 'species_index.json'), 'utf8'));
    const entry = idx[species];
    if (!entry?.sprite) throw new Error(`species "${species}" has no sprite in ${path.join(data, 'species_index.json')}`);
    spriteFile = path.join(data, 'pokemon', entry.sprite);
  }
  const label = a.label !== undefined ? a.label : a.name.charAt(0).toUpperCase() + a.name.slice(1);
  const files = { normal: path.join(outDir, `${a.name}.png`), shiny: path.join(outDir, `${a.name}Shiny.png`) };
  for (const f of Object.values(files)) if (fs.existsSync(f) && !a.force) throw new Error(`${f} exists (pass --force to overwrite)`);
  const res = compose({
    label, spriteFile, siblings, bg, autoBg, exclude, assets,
    scale: a.scale != null ? parseInt(a.scale, 10) : null, threshold: a['alpha-threshold'] != null ? +a['alpha-threshold'] : 128, outline: !a['no-outline'],
    base, clear, key_corner: !!a['key-corner'],
  });
  fs.mkdirSync(outDir, { recursive: true });
  for (const v of ['normal', 'shiny']) { fs.writeFileSync(files[v], encode(CELL_W, CELL_H, res[v])); console.log('wrote', files[v]); }
  console.log(JSON.stringify(res.report, null, 1));
}
if (isMain) {
  try { main(); } catch (e) { console.error('compose_pokermon_joker_art:', e.message); process.exit(1); }
}
