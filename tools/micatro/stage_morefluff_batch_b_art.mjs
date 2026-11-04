// More Fluff 1.9.9999 batch B: stage (and, where upstream ships no usable sprite, compose) the art the batch-B content
// draws. Reproducible: same inputs -> byte-identical PNGs. Dependency-free (zlib PNG codec, nearest-neighbour only).
// Every output is a NEW file under micatro/mods/morefluff/assets/2x/1.9.9999/ (gitignored; deploy with
// `npm run deploy-micatro-mods`); an existing file is never overwritten unless --force.
//
//   node tools/micatro/stage_morefluff_batch_b_art.mjs --src <MoreFluff checkout at tag 1.9.9999> [--out <dir>] [--force]
//        [--only name,name] [--preview <dir>]
//   (the source: `git -C MoreFluff archive 1.9.9999 | tar -x -C <dir>`; --out defaults to the MAIN checkout's
//    micatro/mods/morefluff/assets/2x/1.9.9999 — MICATRO_MAIN, else this checkout)
//
// Jobs (each writes one file):
//   mf_loyalty.png          1.9.9999 assets/1x/mf_loyalty.png at 2x (the Planeswalkers' loyalty counter)
//   mf_letterjokers_b.png   1.9.9999 mf_letterjokers.png (71 x 78 tiles, display_size h = 78) at 2x, each tile centred
//                           in a 71 x 95 card cell (Micatro's card frame is fixed: the tile is drawn at its own size,
//                           as upstream's shorter card, not stretched)
//   mf_purple.png           1.9.9999 mf_purple.png at 2x (the 3 Purple jokers)
//   lettergem_destroy_b.png the Lettergem D / Z tooltip picture (lettergem_destroy.png: 5 frames of 259 x 79) at 2x
//   lettergem_g_b.png       the Lettergem G tooltip picture (lettergem_g.png: 5 frames of 76 x 92) at 2x
//   mf_rot_jokers_b.png     the 7 rot legendaries (mf_jokers 0..6,10 + their soul cells) turned 45 degrees clockwise
//                           (upstream's mf_rotate_by = pi / 4, which Micatro's renderer doesn't do), nearest-neighbour,
//                           in 112 x 112 cells (the 1.5.6 pre-turned Cartomancer's size): row 0 the cards, row 1 the souls
//   mf_rot_soul_b.png       The Soul! (c_mf_rot_soul: the base game's The Soul, Tarots.png 2,2, + its floating gem,
//                           Enhancers.png 0,1) turned the same way: cell 0 the card, cell 1 the gem
//   mf_rot_spectrals_b.png  the 7 rot legendaries' Spectral cards. Upstream's mf_rot_legendary_consumables.png is 7
//                           "Placeholder!" sketches; each card here is composed (compose_spectrals) from upstream's
//                           own pixels in the style of More Fluff's own Spectral card, Gold: Gold's card and label
//                           strip, the legendary's swirl and figure on the swatch, the name in More Fluff's label font.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const SRC = opt('--src');
if (!SRC) { console.error('usage: node tools/micatro/stage_morefluff_batch_b_art.mjs --src <MoreFluff 1.9.9999 tree> [--out <dir>] [--force] [--only a,b] [--preview <dir>]'); process.exit(1); }
const MAIN = process.env.MICATRO_MAIN || REPO;
const OUT = opt('--out') || path.join(MAIN, 'micatro/mods/morefluff/assets/2x/1.9.9999');
const FORCE = argv.includes('--force');
const ONLY = opt('--only') ? opt('--only').split(',') : null;
const PREVIEW = opt('--preview');
const VANILLA = path.join(REPO, 'micatro/assets/textures'); // (the base game's 2x sheets)

// ------------------------------------------------------------------ PNG codec (8-bit palette / RGB / RGBA)
function decode(file) {
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
  if (depth !== 8 || inter !== 0 || ![2, 3, 6].includes(ctype)) throw new Error(`${file}: unsupported PNG (depth ${depth}, type ${ctype}, interlace ${inter})`);
  const bpp = ctype === 6 ? 4 : ctype === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp, px = Buffer.alloc(stride * h);
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
  for (let i = 0; i < w * h; i++) {
    if (ctype === 6) px.copy(rgba, i * 4, i * 4, i * 4 + 4);
    else if (ctype === 2) { px.copy(rgba, i * 4, i * 3, i * 3 + 3); rgba[i * 4 + 3] = 255; }
    else { const k = px[i]; rgba[i * 4] = pal[k * 3]; rgba[i * 4 + 1] = pal[k * 3 + 1]; rgba[i * 4 + 2] = pal[k * 3 + 2]; rgba[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255; }
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
function encode(img) {
  const { w, h, rgba } = img;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ------------------------------------------------------------------ image helpers (all nearest-neighbour)
const blank = (w, h) => ({ w, h, rgba: Buffer.alloc(w * h * 4) });
const get = (im, x, y) => { const i = (y * im.w + x) * 4; return [im.rgba[i], im.rgba[i + 1], im.rgba[i + 2], im.rgba[i + 3]]; };
const set = (im, x, y, p) => { if (x < 0 || y < 0 || x >= im.w || y >= im.h) return; const i = (y * im.w + x) * 4; im.rgba[i] = p[0]; im.rgba[i + 1] = p[1]; im.rgba[i + 2] = p[2]; im.rgba[i + 3] = p[3]; };
function crop(im, x0, y0, w, h) { const o = blank(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(o, x, y, get(im, x0 + x, y0 + y)); return o; }
/** Paste src at (dx, dy): opaque pixels replace, transparent ones are skipped (alpha >= 128 counts as opaque). */
function paste(dst, src, dx, dy, mask) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const p = get(src, x, y);
    if (p[3] < 128 || (mask && !mask(x, y, p))) continue;
    set(dst, dx + x, dy + y, [p[0], p[1], p[2], 255]);
  }
}
function scale2(im) { const o = blank(im.w * 2, im.h * 2); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) set(o, x, y, get(im, x >> 1, y >> 1)); return o; }
function half(im) { const o = blank(im.w >> 1, im.h >> 1); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) set(o, x, y, get(im, x * 2, y * 2)); return o; }
/** Turn `im` by 45 degrees clockwise about its centre into a size x size canvas (inverse-mapped, nearest-neighbour). */
function turn45(im, size) {
  const o = blank(size, size), c = Math.SQRT1_2, cx = im.w / 2, cy = im.h / 2, ox = size / 2, oy = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - ox, dy = y + 0.5 - oy;
    // clockwise on screen (y down) by +45 deg: source = rotate(-45) of the destination offset
    const sx = Math.floor(cx + c * dx + c * dy), sy = Math.floor(cy - c * dx + c * dy);
    if (sx >= 0 && sy >= 0 && sx < im.w && sy < im.h) set(o, x, y, get(im, sx, sy));
  }
  return o;
}

const src1x = (name) => decode(path.join(SRC, 'assets/1x', name));
const JOBS = {};

JOBS['mf_loyalty.png'] = () => scale2(src1x('mf_loyalty.png'));

JOBS['mf_letterjokers_b.png'] = () => {
  const s = src1x('mf_letterjokers.png'); // 9 x 3 tiles of 71 x 78
  const o = blank(9 * 71, 3 * 95);
  for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 9; tx++) paste(o, crop(s, tx * 71, ty * 78, 71, 78), tx * 71, ty * 95 + Math.floor((95 - 78) / 2));
  return scale2(o);
};

JOBS['mf_purple.png'] = () => scale2(src1x('mf_purple.png'));

JOBS['lettergem_destroy_b.png'] = () => scale2(src1x('lettergem_destroy.png')); // (5 frames of 259 x 79)
JOBS['lettergem_g_b.png'] = () => scale2(src1x('lettergem_g.png')); // (5 frames of 76 x 92)

JOBS['mf_rot_jokers_b.png'] = () => {
  const J = src1x('mf_jokers.png');
  // (card pos, soul_pos) per rot legendary, src/jokers/rot_*.lua: Canio, Triboulet, Yorick, Chicot, Perkeo, Triangle, Marigold
  const R = [[0, 10, 0, 11], [1, 10, 1, 11], [2, 10, 2, 11], [3, 10, 3, 11], [4, 10, 4, 11], [5, 10, 9, 5], [6, 10, 0, 5]];
  const o = blank(7 * 112, 2 * 112);
  R.forEach(([x, y, sx, sy], i) => {
    paste(o, turn45(crop(J, x * 71, y * 95, 71, 95), 112), i * 112, 0);
    paste(o, turn45(crop(J, sx * 71, sy * 95, 71, 95), 112), i * 112, 112);
  });
  return scale2(o);
};

JOBS['mf_rot_soul_b.png'] = () => {
  const T = half(decode(path.join(VANILLA, 'Tarots.png'))), E = half(decode(path.join(VANILLA, 'Enhancers.png')));
  const o = blank(2 * 112, 112);
  paste(o, turn45(crop(T, 2 * 71, 2 * 95, 71, 95), 112), 0, 0);
  paste(o, turn45(crop(E, 0 * 71, 1 * 95, 71, 95), 112), 112, 0);
  return scale2(o);
};

JOBS['mf_rot_spectrals_b.png'] = () => compose_spectrals();

/**
 * The 7 Spectral cards, composed in the style of More Fluff's own Spectral card, Gold (c_mf_new_gold: a Colour-type card
 * — a rounded swatch over a light blue label strip that reads "#???" and the card's name). Per card (71 x 95 at 1x,
 * doubled at the end), from upstream pixels only:
 *   1. the card: Gold's (mf_colours.png 1,6);
 *   2. the swatch: Gold's flat gold fill gives way to the matching rot legendary's own art (its upright mf_jokers card,
 *      x,10: the swirl in its colour), its frame trimmed, centred on the swatch; Gold's dark-gold outline is recoloured
 *      to the swirl's own darkest colour;
 *   3. the figure: the legendary's soul cell (its face / figure), trimmed to its opaque pixels and centred on the swatch;
 *   4. the name: Gold's "GOLD" line is wiped to the strip colour and the Spectral's name (its loc name, upper case) is
 *      written in More Fluff's label font, the glyphs read off its own Colour cards' labels (BLACK, DEEP BLUE, CRIMSON,
 *      GREY, WHITE, #00FF00, PEACH, ROYAL BLUE: the label line's text colour, columns split at the blank columns).
 */
const SPECTRALS = [ // [loc name, rot legendary card x (mf_jokers x,10), soul cell x, y]
  ['DOOM BLADE', 0, 0, 11], ['ROYAL DECREE', 1, 1, 11], ['WINDFALL', 2, 2, 11], ['NEGATE', 3, 3, 11],
  ['MIRRORFORM', 4, 4, 11], ['MANAMORPHOSE', 5, 9, 5], ['LOTUS BLOOM', 6, 0, 5],
];
const LABEL_TEXT = [58, 80, 85], STRIP = [226, 235, 249];
const same = (p, q) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2] && p[3] >= 128;
/** More Fluff's label font: glyph -> {w, rows: [strings]}, from the Colour cards' name line (rows 77..82). */
function label_font(C) {
  const SRC = [[0, 1, 'BLACK'], [1, 1, 'DEEP BLUE'], [2, 1, 'CRIMSON'], [1, 2, 'GREY'], [3, 2, 'WHITE'], [3, 5, '#00FF00'], [3, 4, 'PEACH'], [3, 6, 'ROYAL BLUE']];
  const font = {};
  let space = 0;
  for (const [cx, cy, name] of SRC) {
    const cell = crop(C, cx * 71, cy * 95, 71, 95);
    const ink = (x, y) => same(get(cell, x, y), LABEL_TEXT);
    const runs = [];
    let st = -1;
    for (let x = 2; x <= 69; x++) {
      let on = false;
      for (let y = 77; y <= 82; y++) if (x <= 68 && ink(x, y)) on = true;
      if (on && st < 0) st = x;
      if (!on && st >= 0) { runs.push([st, x - 1]); st = -1; }
    }
    const letters = name.replace(/ /g, '');
    if (runs.length !== letters.length) throw new Error(`label font: "${name}" split into ${runs.length} glyphs`);
    runs.forEach(([a, b], k) => {
      const ch = letters[k];
      const rows = [];
      for (let y = 77; y <= 82; y++) { let r = ''; for (let x = a; x <= b; x++) r += ink(x, y) ? '#' : '.'; rows.push(r); }
      if (!font[ch]) font[ch] = { w: b - a + 1, rows };
    });
    const sp = name.indexOf(' ');
    if (sp > 0) { const k = sp; space = Math.max(space, runs[k][0] - runs[k - 1][1] - 1); }
  }
  font[' '] = { w: Math.max(1, space - 2), rows: ['', '', '', '', '', ''] };
  return font;
}
function write_label(card, font, text, x0, y0) {
  let x = x0;
  for (const ch of text) {
    const g = font[ch];
    if (!g) throw new Error(`label font: no glyph "${ch}"`);
    g.rows.forEach((r, dy) => { for (let dx = 0; dx < r.length; dx++) if (r[dx] === '#') set(card, x + dx, y0 + dy, [...LABEL_TEXT, 255]); });
    x += g.w + 1;
  }
  return x - 1 - x0;
}
function compose_spectrals() {
  const C = src1x('mf_colours.png'), J = src1x('mf_jokers.png');
  const font = label_font(C);
  const gold = crop(C, 1 * 71, 6 * 95, 71, 95);
  const GOLD_FILL = (p) => p[3] >= 128 && p[0] > 150 && p[1] > 120 && p[2] < 110; // (Gold's swatch: fill + outline)
  const OUTLINE = [176, 147, 46];
  const o = blank(7 * 71, 95);
  SPECTRALS.forEach(([name, jx, sx, sy], i) => {
    const card = crop(gold, 0, 0, 71, 95);
    // the swatch window: every Gold fill / outline pixel above the label strip (y <= 67: its top edge too)
    let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
    for (let y = 0; y <= 67; y++) for (let x = 0; x < 71; x++) if (GOLD_FILL(get(card, x, y))) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const ww = x1 - x0 + 1, wh = y1 - y0 + 1;
    const pic = crop(J, jx * 71, 10 * 95, 71, 95);
    // the legendary's art inside its 3px frame, centred on the swatch window (a little above centre: its banner stays out)
    const inner = crop(pic, 3, 3, 65, 89);
    const ox = Math.floor((inner.w - ww) / 2), oy = Math.floor((inner.h - wh) / 2) - 6;
    // the swirl's darkest colour (by luma) for Gold's outline
    let dark = null, dl = 1e9;
    for (let y = 0; y < inner.h; y++) for (let x = 0; x < inner.w; x++) { const p = get(inner, x, y); if (p[3] < 128) continue; const l = p[0] * 3 + p[1] * 6 + p[2]; if (l < dl) { dl = l; dark = p; } }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const p = get(card, x, y);
      if (!GOLD_FILL(p)) continue;
      if (same(p, OUTLINE)) { set(card, x, y, [dark[0], dark[1], dark[2], 255]); continue; }
      const q = get(inner, Math.max(0, Math.min(inner.w - 1, x - x0 + ox)), Math.max(0, Math.min(inner.h - 1, y - y0 + oy)));
      if (q[3] >= 128) set(card, x, y, [q[0], q[1], q[2], 255]);
    }
    // the figure
    const fig = trim(crop(J, sx * 71, sy * 95, 71, 95));
    const fw = Math.min(fig.w, ww - 4), fh = Math.min(fig.h, wh - 4);
    const f = crop(fig, Math.floor((fig.w - fw) / 2), 0, fw, fh);
    const fx = x0 + Math.floor((ww - f.w) / 2), fy = y0 + Math.floor((wh - f.h) / 2) + 1;
    paste(card, f, fx, fy, (x, y) => GOLD_FILL(get(gold, fx + x, fy + y)) && !same(get(gold, fx + x, fy + y), OUTLINE));
    // the name line
    for (let y = 76; y <= 83; y++) for (let x = 2; x <= 68; x++) if (same(get(card, x, y), LABEL_TEXT)) set(card, x, y, [...STRIP, 255]);
    const width = write_label(card, font, name, 3, 77);
    if (width > 65) throw new Error(`"${name}" is ${width}px: wider than the label`);
    paste(o, card, i * 71, 0);
  });
  return scale2(o);
}

function trim(im) {
  let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (get(im, x, y)[3] >= 128) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return x1 < 0 ? blank(1, 1) : crop(im, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

fs.mkdirSync(OUT, { recursive: true });
let wrote = 0;
for (const [name, job] of Object.entries(JOBS)) {
  if (ONLY && !ONLY.includes(name)) continue;
  const file = path.join(OUT, name);
  const img = job();
  const png = encode(img);
  if (PREVIEW) { fs.mkdirSync(PREVIEW, { recursive: true }); fs.writeFileSync(path.join(PREVIEW, name), png); }
  if (fs.existsSync(file) && !FORCE) {
    const same = Buffer.compare(fs.readFileSync(file), png) === 0;
    console.log(`  ${name}: exists${same ? ' (identical)' : ' (DIFFERENT — not overwritten; --force to replace)'}`);
    continue;
  }
  fs.writeFileSync(file, png);
  wrote++;
  console.log(`  wrote ${name} (${img.w} x ${img.h})`);
}
console.log(`More Fluff batch B art: ${wrote} written -> ${OUT}`);
