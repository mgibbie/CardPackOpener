// Shared by the Pokermon 3.9.1 art checks (not a suite itself): where the gitignored Pokermon art is (this checkout, MICATRO_MAIN,
// or the main checkout of this worktree) and a streaming PNG crop reader.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const roots = [ROOT];
if (process.env.MICATRO_MAIN) roots.push(path.resolve(process.env.MICATRO_MAIN));
try {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  roots.push(path.dirname(common));
} catch { /* not a git checkout */ }
export const ART = roots.map((r) => path.join(r, 'micatro/mods/pokermon/assets/2x')).find((d) => fs.existsSync(path.join(d, 'Basic Series/AtlasJokersBasicGen01-391.png')));

/** Stream a PNG (8-bit RGBA / RGB / palette, non-interlaced) and cut these rects out of it: {id: [x, y, w, h]} -> {id: RGBA}. */
export async function crops(file, rects) {
  const buf = fs.readFileSync(file);
  let p = 8, w, h, ctype, pal = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ctype = d[9]; if (d[8] !== 8 || d[12] !== 0 || ![2, 3, 6].includes(ctype)) throw new Error(file + ': unsupported PNG'); }
    else if (type === 'PLTE') pal = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ctype === 6 ? 4 : ctype === 2 ? 3 : 1, stride = w * bpp;
  const out = {};
  for (const [id, [x, y, cw, ch]] of Object.entries(rects)) out[id] = { x, y, cw, ch, px: new Uint8Array(cw * ch * 4), inside: x + cw <= w && y + ch <= h };
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride), row = 0, fill = -1, ftype = 0;
  const pending = [];
  const onRow = () => {
    for (const r of Object.values(out)) {
      if (!r.inside || row < r.y || row >= r.y + r.ch) continue;
      const o = (row - r.y) * r.cw * 4;
      for (let i = 0; i < r.cw; i++) {
        const s = (r.x + i) * bpp;
        let R, Gc, B, A;
        if (bpp === 1) { const k = cur[s]; R = pal[k * 3]; Gc = pal[k * 3 + 1]; B = pal[k * 3 + 2]; A = trns && k < trns.length ? trns[k] : 255; }
        else { R = cur[s]; Gc = cur[s + 1]; B = cur[s + 2]; A = bpp === 4 ? cur[s + 3] : 255; }
        r.px.set([R, Gc, B, A], o + i * 4);
      }
    }
  };
  await new Promise((resolve, reject) => {
    const inf = zlib.createInflate();
    inf.on('data', (chunk) => {
      for (let i = 0; i < chunk.length && row < h; i++) {
        const v = chunk[i];
        if (fill < 0) { ftype = v; fill = 0; continue; }
        const a = fill >= bpp ? cur[fill - bpp] : 0, b = prev[fill], c = fill >= bpp ? prev[fill - bpp] : 0;
        let val;
        switch (ftype) {
          case 0: val = v; break;
          case 1: val = v + a; break;
          case 2: val = v + b; break;
          case 3: val = v + ((a + b) >> 1); break;
          default: { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); val = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
        }
        cur[fill++] = val & 255;
        if (fill === stride) { onRow(); const t = prev; prev = cur; cur = t; fill = -1; row++; }
      }
    });
    inf.on('end', resolve); inf.on('error', reject);
    for (const d of idat) inf.write(d);
    inf.end();
    void pending;
  });
  return out;
}
