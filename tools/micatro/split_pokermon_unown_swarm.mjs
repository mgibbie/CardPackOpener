// Split Pokermon 3.9.1's Unown Swarm animation strips into tiles a GPU can hold (Pokermon 3.9.1 upgrade, batch 10b).
//
// 3.9.1 (pokesprites.lua) re-laid the swarm's 36 frames (290 x 285 cells, 2x: 580 x 570) into ONE row: each strip is
// 20880 x 570 px, past the 16384 px texture limit of many GPUs (and close to some browsers' canvas limits). This cuts every
// strip into tiles of TILE_COLS frames (14 x 580 = 8120 px <= 8192): '<strip>-391-t0.png' (frames 0-13), '-t1' (14-27),
// '-t2' (28-35). micatro/mods/pokermon/index.js registers them ('poke_<strip>_t<n>') under the strip's atlas `tiles`, and
// js/ui/assets.js modCellRect picks the tile for a frame. Pixels are copied unchanged (8-bit RGBA in, 8-bit RGBA out).
//
// The strips are the batch-5 vendored copies '<strip>-391.png' in the gitignored assets/2x of the mod (deployed with
// `npm run deploy-micatro-mods`). It never overwrites a tile that differs: delete it first to re-make it.
//   node tools/micatro/split_pokermon_unown_swarm.mjs [<pokermon assets/2x dir>]
//   (default: $MICATRO_MAIN/micatro/mods/pokermon/assets/2x, else this checkout's)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export const STRIPS = ['j_poke_unown_swarm', 'j_poke_unown_swarm_shiny', 'j_poke_unown_swarm_soul', 'j_poke_unown_swarm_shiny_soul'];
export const FRAMES = 36, CELL_W = 580, CELL_H = 570, TILE_COLS = 14, MAX_W = 8192;

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

/** Tile n of a strip: frames [n * TILE_COLS, ...), as {w, h, rgba}. */
export function tileOf(strip, n) {
  const first = n * TILE_COLS, cols = Math.min(TILE_COLS, FRAMES - first), w = cols * CELL_W, h = CELL_H;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) strip.rgba.copy(rgba, y * w * 4, (y * strip.w + first * CELL_W) * 4, (y * strip.w + first * CELL_W + w) * 4);
  return { w, h, rgba };
}
export const tileCount = () => Math.ceil(FRAMES / TILE_COLS);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  const DIR = process.argv[2] || path.join(process.env.MICATRO_MAIN || '.', 'micatro/mods/pokermon/assets/2x');
  if (TILE_COLS * CELL_W > MAX_W) throw new Error('tiles too wide');
  let made = 0, same = 0;
  for (const name of STRIPS) {
    const src = path.join(DIR, name + '-391.png');
    const strip = decode(src);
    if (strip.w !== FRAMES * CELL_W || strip.h !== CELL_H) throw new Error(`${src}: expected ${FRAMES * CELL_W}x${CELL_H}, got ${strip.w}x${strip.h}`);
    for (let n = 0; n < tileCount(); n++) {
      const t = tileOf(strip, n), out = path.join(DIR, `${name}-391-t${n}.png`);
      if (fs.existsSync(out)) {
        const have = decode(out);
        if (have.w === t.w && have.h === t.h && have.rgba.equals(t.rgba)) { same++; continue; }
        throw new Error(`${out} exists with other pixels: not overwritten (delete it to re-make it)`);
      }
      fs.writeFileSync(out, encode(t.w, t.h, t.rgba));
      made++;
      console.log('wrote', out, `${t.w}x${t.h}`);
    }
  }
  console.log(`${made} tiles written, ${same} already up to date (${DIR})`);
}
