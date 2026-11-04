// Compose the art of Micatro's 12 Pokermon Type Sleeves (micatro/mods/pokermon/typesleeves.js; owner rule: no placeholders)
// from Pokermon 3.9.1's own sheets. One row of 12 sleeve cells (142 x 190 each, the 2x size every Pokermon sheet uses), in
// systems/types.js POKETYPES order: Grass, Fire, Water, Lightning, Psychic, Fighting, Colorless, Dark, Metal, Fairy, Dragon, Earth.
//
// Method (on the 71 x 95 logical grid — every 3.9.1 cell is an exact 2x doubling — and doubled back at the end; nearest only):
//   1. The pocket: the Trainer Sleeve (AtlasDecksBasic-391 {0,1}). Its grey pocket and its two inner tones (the 3px inner
//      border and the dark lip / tab lines: the Trainer Deck's navy) are kept; the navy tones are recoloured to the type's
//      colour (pokesprites.lua's type colours, systems/types.js TYPE_COLOURS) at the Trainer tones' own lightness.
//   2. The card in the pocket: every other pixel inside the pocket (what the Trainer Sleeve shows of its deck) is that type's
//      Energy card (AtlasConsumablesBasic-391, the card the sleeve starts with), shifted so its Energy orb sits low in the
//      pocket under the tab, as the Trainer Sleeve's Poké Ball does.
//   3. The tab: the Trainer Sleeve's tab, its inner border thinned to 1px so the type's Tera sticker icon (AtlasStickersBasic-391,
//      16 x 16: the type icon the game draws on a joker) fits in it, on the Energy card's background.
//
// Usage: node tools/micatro/compose_pokermon_type_sleeves.mjs [--assets <Basic Series dir>] [--out <file>] [--check]
//   --assets  default: this checkout's micatro/mods/pokermon/assets/2x/Basic Series, then $MICATRO_MAIN's, then the main
//             checkout above a .worktrees/<name> folder
//   --out     default: micatro/mods/pokermon/assets/2x/type_sleeves.png next to --assets (the gitignored mod art: deploy it with
//             `npm run deploy-micatro-mods`)
//   --check   compose and compare with the existing --out byte for byte (exit 1 when different); writes nothing
// The output is deterministic: the same sheets give the same file.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decode, encode } from './compose_pokermon_joker_art.mjs';

const W = 71, H = 95, PX = 2;
export const TYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Colorless', 'Dark', 'Metal', 'Fairy', 'Dragon', 'Earth'];
// systems/types.js TYPE_COLOURS (pokesprites.lua loc_colour)
const TYPE_COLOURS = {
  dark: '#0086a5', lightning: '#f8f800', fire: '#f81020', water: '#38b8f8', earth: '#e97333', fairy: '#ff3db6',
  fighting: '#b85838', colorless: '#c8c0f8', psychic: '#c135ff', metal: '#888080', grass: '#289830', dragon: '#c8a800',
};
// Each type's Energy card on AtlasConsumablesBasic-391 (the consumables' 3.9.1 pos) and Tera sticker on AtlasStickersBasic-391.
const ENERGY_POS = {
  Grass: [0, 0], Fire: [1, 0], Water: [2, 0], Lightning: [3, 0], Psychic: [4, 0], Fighting: [5, 0], Colorless: [6, 0],
  Dark: [7, 0], Metal: [8, 0], Fairy: [9, 0], Dragon: [0, 1], Earth: [1, 1],
};
const STICKER_POS = {
  Grass: [1, 0], Fire: [2, 0], Water: [3, 0], Lightning: [4, 0], Psychic: [5, 0], Fighting: [6, 0], Colorless: [7, 0],
  Dark: [8, 0], Metal: [9, 0], Fairy: [0, 1], Dragon: [1, 1], Earth: [2, 1],
};
// The Trainer Sleeve's geometry (logical pixels, measured on AtlasDecksBasic-391 {0,1}).
const POCKET = { x0: 6, x1: 64, y0: 21, y1: 74 };          // what shows of the deck (inside the 3px inner border)
const TAB = { x0: 25, x1: 45, y0: 30, y1: 52 };            // the tab: dark outline on its edges, inner border, picture
const ICON_BOX = { x0: 27, x1: 43, y0: 31, y1: 49 };       // the tab's picture once its inner border is 1px (17 x 19)
const ENERGY_DY = -2;                                        // pocket row y shows Energy card row y - ENERGY_DY... (y + ENERGY_DY)
const ENERGY_X = [7, 63];                                    // the Energy card's art columns (inside its gold border)
const BORDER = [66, 56, 148], LINE = [42, 36, 96];          // the Trainer Sleeve's two navy tones (inner border, lines)

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hsl2rgb([h, s, l]) {
  if (!s) return [l, l, l].map((v) => Math.round(v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255));
}
/** The type colour at the lightness of a Trainer tone (saturation capped, so the darks stay rich but not neon). */
const tone = (typeHex, trainerRgb) => { const [h, s] = rgb2hsl(hex(typeHex)); return hsl2rgb([h, Math.min(s, 0.62), rgb2hsl(trainerRgb)[2] * 1.15]); };

/** A logical cell (71 x 95, [r,g,b,a] per pixel) of a 2x sheet. */
function cell(sheet, cx, cy) {
  const out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = ((cy * H * PX + y * PX) * sheet.w + cx * W * PX + x * PX) * 4;
    out.push([sheet.rgba[i], sheet.rgba[i + 1], sheet.rgba[i + 2], sheet.rgba[i + 3]]);
  }
  return out;
}
const sameRgb = (p, rgb) => p[3] === 255 && p[0] === rgb[0] && p[1] === rgb[1] && p[2] === rgb[2];
const at = (c, x, y) => c[y * W + x];

/** One Type Sleeve (logical cell). */
export function composeSleeve(type, { decks, cons, stickers }) {
  const trainer = cell(decks, 0, 1), energy = cell(cons, ...ENERGY_POS[type]), sticker = cell(stickers, ...STICKER_POS[type]);
  const typeHex = TYPE_COLOURS[type.toLowerCase()];
  const border = [...tone(typeHex, BORDER), 255], line = [...tone(typeHex, LINE), 255];
  const out = trainer.map((p) => p.slice());
  const ex = (x) => Math.max(ENERGY_X[0], Math.min(ENERGY_X[1], x));
  const inTab = (x, y) => x >= TAB.x0 && x <= TAB.x1 && y >= TAB.y0 && y <= TAB.y1;
  for (let y = POCKET.y0; y <= POCKET.y1; y++) for (let x = POCKET.x0; x <= POCKET.x1; x++) {
    const p = at(trainer, x, y);
    if (!p[3]) continue; // (the transparent notch above the lips)
    if (sameRgb(p, BORDER) || sameRgb(p, LINE)) continue; // the pocket's own lines: recoloured below
    if (inTab(x, y)) continue;
    out[y * W + x] = at(energy, ex(x), y + ENERGY_DY).slice();
  }
  // the tab: its outline stays, its inner border is 1px, its picture is the Energy card's background + the type's icon
  for (let y = TAB.y0 + 1; y < TAB.y1; y++) for (let x = TAB.x0 + 1; x < TAB.x1; x++) {
    const ring = x === TAB.x0 + 1 || x === TAB.x1 - 1 || y > ICON_BOX.y1;
    out[y * W + x] = ring ? BORDER.concat(255) : at(energy, 10, y + ENERGY_DY).slice();
  }
  const ib = { x0: 6, y0: 75 }; // the icon's box on its sticker cell (16 x 16)
  const ox = ICON_BOX.x0 + Math.floor((ICON_BOX.x1 - ICON_BOX.x0 + 1 - 16) / 2), oy = ICON_BOX.y0 + Math.floor((ICON_BOX.y1 - ICON_BOX.y0 + 1 - 16) / 2);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const p = at(sticker, ib.x0 + x, ib.y0 + y);
    if (p[3] >= 128) out[(oy + y) * W + ox + x] = [p[0], p[1], p[2], 255];
  }
  // the navy tones -> the type's
  for (let i = 0; i < out.length; i++) {
    if (sameRgb(out[i], BORDER)) out[i] = border.slice();
    else if (sameRgb(out[i], LINE)) out[i] = line.slice();
  }
  return out;
}

/** The sheet: 12 cells in a row, 2x (142 x 190 each). -> {w, h, rgba} */
export function composeSheet(assets) {
  const decks = decode(path.join(assets, 'AtlasDecksBasic-391.png'));
  const cons = decode(path.join(assets, 'AtlasConsumablesBasic-391.png'));
  const stickers = decode(path.join(assets, 'AtlasStickersBasic-391.png'));
  const w = TYPES.length * W * PX, h = H * PX, rgba = Buffer.alloc(w * h * 4);
  TYPES.forEach((t, n) => {
    const c = composeSleeve(t, { decks, cons, stickers });
    for (let y = 0; y < h; y++) for (let x = 0; x < W * PX; x++) {
      const p = c[Math.floor(y / PX) * W + Math.floor(x / PX)], i = (y * w + n * W * PX + x) * 4;
      rgba[i] = p[0]; rgba[i + 1] = p[1]; rgba[i + 2] = p[2]; rgba[i + 3] = p[3];
    }
  });
  return { w, h, rgba };
}

function findDir(rel) {
  const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..');
  const cands = [path.join(process.cwd(), rel), path.join(repo, rel)];
  if (process.env.MICATRO_MAIN) cands.push(path.join(process.env.MICATRO_MAIN, rel));
  const wt = repo.split(path.sep).lastIndexOf('.worktrees');
  if (wt > 0) cands.push(path.join(repo.split(path.sep).slice(0, wt).join(path.sep), rel));
  return cands.find((d) => fs.existsSync(d)) || cands[0];
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const assets = arg('--assets') || findDir('micatro/mods/pokermon/assets/2x/Basic Series');
  const out = path.resolve(arg('--out') || path.join(assets, '..', 'type_sleeves.png'));
  const { w, h, rgba } = composeSheet(assets);
  const png = encode(w, h, rgba);
  if (argv.includes('--check')) {
    const okSame = fs.existsSync(out) && Buffer.compare(fs.readFileSync(out), png) === 0;
    console.log(okSame ? `${out}: up to date` : `${out}: DIFFERS from a fresh compose`);
    process.exit(okSame ? 0 : 1);
  }
  fs.writeFileSync(out, png);
  console.log(`wrote ${out} (${w} x ${h}, ${png.length} bytes; ${TYPES.join(', ')})`);
}
