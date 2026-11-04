// Pack the BETMMA bundle's per-card 2x PNGs (142x190: 82 vouchers, 11 jokers, 3 voucher packs) into
// ONE atlas sheet micatro/mods/betmma/assets/2x/betmma.png, laid out by micatro/mods/betmma/layout.js
// (96 files -> 1). Dependency-free PNG decode/encode (zlib only; adapted from pack_mikas_atlas.mjs,
// plus sub-byte palette depths — one of the voucher PNGs is a 2-bit palette image).
//   node tools/micatro/pack_betmma_atlas.mjs ["C:/Users/guide/Desktop/mods off/BETMMA-main"]
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { VOUCHERS, JOKERS, PACKS, COLS, layout } from '../../micatro/mods/betmma/layout.js';

const SRC = process.argv[2] || 'C:/Users/guide/Desktop/mods off/BETMMA-main';
const OUT = 'micatro/mods/betmma/assets/2x/betmma.png';
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
  const okDepth = ctype === 3 ? [1, 2, 4, 8].includes(depth) : depth === 8;
  if (!okDepth || inter !== 0 || ![2, 3, 6].includes(ctype)) throw new Error(`${file}: unsupported PNG (depth ${depth}, type ${ctype}, interlace ${inter})`);
  const chans = ctype === 6 ? 4 : ctype === 2 ? 3 : 1;
  const bpp = Math.max(1, (chans * depth) >> 3);           // filter byte distance
  const stride = Math.ceil((w * chans * depth) / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h);
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
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (ctype === 6) px.copy(rgba, i * 4, y * stride + x * 4, y * stride + x * 4 + 4);
      else if (ctype === 2) { px.copy(rgba, i * 4, y * stride + x * 3, y * stride + x * 3 + 3); rgba[i * 4 + 3] = 255; }
      else {
        const bit = x * depth, byte = px[y * stride + (bit >> 3)];
        const k = depth === 8 ? byte : (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        rgba[i * 4] = pal[k * 3]; rgba[i * 4 + 1] = pal[k * 3 + 1]; rgba[i * 4 + 2] = pal[k * 3 + 2];
        rgba[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255;
      }
    }
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
function blit(dst, dw, src, dx, dy) {
  for (let y = 0; y < CH; y++) src.rgba.copy(dst, ((dy + y) * dw + dx) * 4, (y * src.w) * 4, (y * src.w + CW) * 4);
}

const L = layout();
const W = COLS * CW, H = L.rows * CH;
const sheet = Buffer.alloc(W * H * 4);
let n = 0;
const put = (file, pos) => {
  const img = decode(file);
  if (img.w !== CW || img.h !== CH) throw new Error(`${file} is ${img.w}x${img.h}`);
  blit(sheet, W, img, pos.x * CW, pos.y * CH);
  n++;
};
for (const v of VOUCHERS) put(path.join(SRC, 'Betmma_Vouchers/assets/2x', `v_${v}.png`), L.vouchers[v]);
for (const j of JOKERS) put(path.join(SRC, 'Betmma_Jokers/assets/2x', `j_${j}.png`), L.jokers[j]);
for (const p of PACKS) put(path.join(SRC, 'Betmma_Voucher_Pack/assets/2x', `p_${p}.png`), L.packs[p]);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, encode(W, H, sheet));
console.log(`packed ${n} cards into ${OUT} (${W}x${H}, ${L.rows} rows)`);
