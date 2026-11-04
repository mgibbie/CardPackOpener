// Pack Mika's Mod Collection's per-card PNGs (assets/2x/<key>.png, 142x190 each, Dagonet/Cicero
// 284x190 with their soul layer) into ONE atlas sheet micatro/mods/mikas/assets/2x/mikas.png,
// laid out by micatro/mods/mikas/layout.js. Also copies the two vanilla deck-back cells the mod's
// decks use (Enhancers {5,2} / {6,0}). Tiny dependency-free PNG decode/encode (zlib only):
// 8-bit palette (+tRNS) and 8-bit RGB/RGBA, non-interlaced — what these files are.
//   node tools/micatro/pack_mikas_atlas.mjs ["C:/Users/guide/Desktop/mods off/MikasBalatro-main"]
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { JOKERS, CONSUMABLES, WIDE, BACK_CELLS, COLS, layout } from '../../micatro/mods/mikas/layout.js';

const SRC = process.argv[2] || 'C:/Users/guide/Desktop/mods off/MikasBalatro-main';
const OUT = 'micatro/mods/mikas/assets/2x/mikas.png';
const ENH = 'micatro/assets/textures/Enhancers.png';
const CW = 142, CH = 190;

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
function encode(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function blit(dst, dw, src, sx, sy, sw, sh, dx, dy) {
  for (let y = 0; y < sh; y++) src.rgba.copy(dst, ((dy + y) * dw + dx) * 4, ((sy + y) * src.w + sx) * 4, ((sy + y) * src.w + sx + sw) * 4);
}

const L = layout();
const W = COLS * CW, H = L.rows * CH;
const sheet = Buffer.alloc(W * H * 4);
let n = 0;
for (const [, slug] of JOKERS) {
  const img = decode(path.join(SRC, 'assets/2x', `j_mmc_${slug}.png`));
  const cells = WIDE.has(slug) ? 2 : 1;
  if (img.w !== CW * cells || img.h !== CH) throw new Error(`j_mmc_${slug}.png is ${img.w}x${img.h}`);
  const { pos } = L.jokers[slug];
  blit(sheet, W, img, 0, 0, img.w, CH, pos.x * CW, pos.y * CH);
  n++;
}
for (const [, slug] of CONSUMABLES) {
  const img = decode(path.join(SRC, 'assets/2x', `c_mmc_${slug}.png`));
  const { pos } = L.consumables[slug];
  blit(sheet, W, img, 0, 0, CW, CH, pos.x * CW, pos.y * CH);
  n++;
}
const enh = decode(ENH);
BACK_CELLS.forEach((c, i) => { blit(sheet, W, enh, c.x * CW, c.y * CH, CW, CH, L.backs[i].x * CW, L.backs[i].y * CH); n++; });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, encode(W, H, sheet));
console.log(`packed ${n} cards into ${OUT} (${W}x${H}, ${L.rows} rows)`);
