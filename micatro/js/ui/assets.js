// Texture atlases + sprite lookup. Balatro's own atlas table (game.lua
// asset_atli / animation_atli) at 2x: every cell is twice the 1x px/py.
import DATA from '../../data/balatro_data.js';
import { SPLIT_SHEETS } from '../mods/split_sheets.js';

export const D = DATA;
const BASE = new URL('../../assets/', import.meta.url).href;
export const assetUrl = (p) => BASE + p;

export const ATLAS = {
  cards_1: { file: '8BitDeck.png', px: 71, py: 95 },
  cards_2: { file: '8BitDeck_opt2.png', px: 71, py: 95 },
  centers: { file: 'Enhancers.png', px: 71, py: 95 },
  Joker: { file: 'Jokers.png', px: 71, py: 95 },
  Tarot: { file: 'Tarots.png', px: 71, py: 95 },
  Voucher: { file: 'Vouchers.png', px: 71, py: 95 },
  Booster: { file: 'boosters.png', px: 71, py: 95 },
  stickers: { file: 'stickers.png', px: 71, py: 95 },
  tags: { file: 'tags.png', px: 34, py: 34 },
  chips: { file: 'chips.png', px: 29, py: 29 },
  icons: { file: 'icons.png', px: 66, py: 66 },
  ui_1: { file: 'ui_assets.png', px: 18, py: 18 },
  blind_chips: { file: 'BlindChips.png', px: 34, py: 34, frames: 21 },
  shop_sign: { file: 'ShopSignAnimation.png', px: 113, py: 57, frames: 4 },
};
const S = 2; // texture scale of the shipped atlases

const images = {};
export function loadImages() {
  return Promise.all(Object.entries(ATLAS).map(([name, a]) => new Promise((res) => {
    const img = new Image();
    img.onload = () => { images[name] = img; res(); };
    img.onerror = () => { console.warn('micatro: missing texture ' + a.file); res(); };
    img.src = assetUrl('textures/' + a.file);
  })));
}
export const img = (name) => images[name];

/** The UI font, versioned: ?v=2 = the gender signs (tools/micatro/add_gender_glyphs.py). Bump it with every change to the
 *  file, in all three places that load it (this, css/micatro.css @font-face, index.html's preload: one URL, one download). */
export const FONT_FILE = 'fonts/m6x11plus.ttf?v=2';
export function loadFont() {
  try {
    const f = new FontFace('m6x11', `url(${assetUrl(FONT_FILE)})`);
    document.fonts.add(f);
    return f.load().catch(() => {});
  } catch (e) { return Promise.resolve(); }
}

/** Draw one atlas cell (pos in cells) into ctx at dx,dy,dw,dh. */
export function drawCell(ctx, atlas, pos, dx, dy, dw, dh, frame = 0) {
  const a = ATLAS[atlas], im = images[atlas];
  if (!a || !im || !pos) return false;
  const sw = a.px * S, sh = a.py * S;
  ctx.drawImage(im, ((pos.x || 0) + frame) * sw, (pos.y || 0) * sh, sw, sh, dx, dy, dw ?? sw, dh ?? sh);
  return true;
}

/** A detached canvas holding one atlas cell (cached) — for <img>-like DOM use. */
const cellCache = new Map();
export function cellCanvas(atlas, pos, frame = 0) {
  const k = atlas + ':' + pos.x + ',' + pos.y + ':' + frame;
  let c = cellCache.get(k);
  if (c) return c;
  const a = ATLAS[atlas];
  c = document.createElement('canvas');
  c.width = a.px * S; c.height = a.py * S;
  drawCell(c.getContext('2d'), atlas, pos, 0, 0, c.width, c.height, frame);
  if (images[atlas]) cellCache.set(k, c);
  return c;
}
/** An element showing an atlas cell (as a scaled canvas copy). */
export function cellEl(atlas, pos, cls, frame = 0) {
  const a = ATLAS[atlas];
  const c = document.createElement('canvas');
  c.width = a.px * S; c.height = a.py * S;
  drawCell(c.getContext('2d'), atlas, pos, 0, 0, c.width, c.height, frame);
  if (cls) c.className = cls;
  return c;
}

export function centerAtlas(center) {
  if (!center) return 'centers';
  switch (center.set) {
    case 'Joker': return 'Joker';
    case 'Tarot': case 'Planet': case 'Spectral': return 'Tarot';
    case 'Voucher': return 'Voucher';
    case 'Booster': return 'Booster';
    default: return 'centers';
  }
}

export const CENTERS = DATA.centers;
export const CARDS = DATA.cards;
export const BLINDS = DATA.blinds;
export const TAGS = DATA.tags;
export const STAKES = DATA.stakes;
export const LOC = DATA.loc;
export const SEAL_POS = { Gold: { x: 2, y: 0 }, Purple: { x: 4, y: 4 }, Red: { x: 5, y: 4 }, Blue: { x: 6, y: 4 } };
export const STICKER_POS = { eternal: { x: 0, y: 0 }, perishable: { x: 0, y: 2 }, rental: { x: 1, y: 2 } };
export const SOUL_POS = CENTERS.soul && CENTERS.soul.pos || { x: 0, y: 1 };
export const STAKE_LIST = Object.entries(DATA.stakes).map(([k, v]) => ({ key: k, ...v })).sort((a, b) => a.stake_level - b.stake_level);
export const BACK_LIST = Object.entries(DATA.centers).filter(([k, v]) => v.set === 'Back' && k !== 'b_challenge').map(([k, v]) => ({ key: k, ...v })).sort((a, b) => a.order - b.order);

// ------------------------------------------------------------- mod art
// Mod atlases live in the mods registry (ATLASES: name -> {src, px, py, frames?, mod};
// px/py are the 1x cell, the files are 2x). The registry is bound once a mod module
// has loaded (bindModRegistry); images load lazily the first time a card asks for
// them. Mod art is served cross-origin in production (a separate Pages project),
// so images are requested with CORS — the card canvases feed WebGL and must not taint.
export const MODREG = { atlases: {}, types: {}, rarities: {}, mods: {}, loc: { descriptions: {}, misc: {} }, loc_colours: {}, center: () => null, seal: () => null };
export function bindModRegistry(m) {
  if (!m) return;
  MODREG.atlases = m.ATLASES || MODREG.atlases;
  MODREG.loc_colours = m.LOC_COLOURS || MODREG.loc_colours; // (a mod's {C:name} text colours: markup.js)
  MODREG.types = m.CONSUMABLE_TYPES || MODREG.types;
  MODREG.rarities = m.RARITIES || MODREG.rarities;
  MODREG.mods = m.MODS || MODREG.mods;
  MODREG.loc = m.MOD_LOC || MODREG.loc;
  if (m.sealByKey) MODREG.seal = m.sealByKey;
  if (m.centerByKey) MODREG.center = m.centerByKey;
}
const modImgs = new Map();          // atlas name -> {img, state: 'loading'|'ok'|'error'}
const modListeners = new Set();
/** cb(atlasName) whenever a mod atlas finishes loading (or fails). Returns an unsubscribe. */
export function onModAtlas(cb) { modListeners.add(cb); return () => modListeners.delete(cb); }
/**
 * A TILED mod atlas ({tiles: [atlas names], tile_cols, px, py, crop?}, no src): one long row of cells split over several
 * images, each `tile_cols` cells wide — Pokermon's Unown Swarm, whose 3.9.1 strip (36 frames, 20880 px) is past the
 * 16384 px texture limit of many GPUs. Its state is its tiles' (all loaded = 'ok'), and listeners hear its name whenever
 * one of its tiles finishes loading.
 */
const tileParents = new Map();      // tile atlas name -> [tiled atlas names]
function tiledState(name, a) {
  let any = 'ok';
  for (const t of a.tiles) {
    if (!tileParents.has(t)) tileParents.set(t, []);
    if (!tileParents.get(t).includes(name)) tileParents.get(t).push(name);
    const st = modAtlasState(t);
    if (st === 'missing') any = 'missing';
    else if (st === 'loading' && any === 'ok') any = 'loading';
  }
  return any;
}
/** 'ok' | 'loading' | 'missing' — kicks off the load on first ask. */
export function modAtlasState(name) {
  const a = MODREG.atlases[name] || blockAtlases.get(name);
  if (a && a.tiles) return tiledState(name, a);
  if (!a || !a.src) return 'missing';
  let e = modImgs.get(name);
  if (!e) {
    e = { img: new Image(), state: 'loading' };
    modImgs.set(name, e);
    if (cropping) cropSheets.add(name);   // (crop mode: let go of it once its cells are cropped)
    e.img.crossOrigin = 'anonymous';
    const done = (st) => {
      e.state = st;
      // (a block of a split sheet: its sheet hears it too, and a tiled atlas over that sheet)
      const up = tileParents.get(name) || [];
      const names = [name, ...up, ...up.flatMap((n) => tileParents.get(n) || [])];
      if (st === 'error' && blockAtlases.has(name)) splitBroken.add(blockAtlases.get(name).sheet);   // (not deployed: the whole sheet)
      for (const cb of modListeners) for (const n of names) { try { cb(n); } catch (err) { /* ignore */ } }
    };
    e.img.onload = () => done('ok');
    e.img.onerror = () => { if (!blockAtlases.has(name)) console.warn('micatro: mod atlas failed to load: ' + name); done('error'); };
    e.img.src = a.src;
  }
  return e.state === 'ok' ? 'ok' : e.state === 'error' ? 'missing' : 'loading';
}
/** Is a mod atlas's art still on its way (its sheet, a tile of it, or a block of it)? Never starts a load. */
export function modArtLoading(name) {
  const a = MODREG.atlases[name];
  if (a && a.tiles) return a.tiles.some(modArtLoading);
  const e = modImgs.get(name);
  if (e) return e.state === 'loading';
  for (const [b, x] of blockAtlases) if (x.sheet === name) { const be = modImgs.get(b); if (be && be.state === 'loading') return true; }
  return false;
}
/**
 * Where a mod atlas cell is: {atlas (the image's atlas: a tile of a tiled atlas), sx, sy, sw, sh} in that image's pixels
 * (2x), or null. `frame` is added to pos.x (an animated row). A tiled atlas maps cell x to tile floor(x / tile_cols),
 * column x % tile_cols; an atlas `crop` {x, y, w, h} (1x px inside the cell) takes only that part of the cell.
 */
export function modCellRect(atlas, pos, frame = 0) {
  const a = MODREG.atlases[atlas];
  if (!a || !pos) return null;
  let x = (pos.x || 0) + frame, y = pos.y || 0, img = atlas;
  if (a.tiles) {
    const t = Math.floor(x / a.tile_cols);
    if (t < 0 || t >= a.tiles.length) return null;
    img = a.tiles[t];
    x -= t * a.tile_cols;
  }
  const cw = a.px * S, ch = a.py * S, c = a.crop;
  if (c) return { atlas: img, sx: x * cw + c.x * S, sy: y * ch + c.y * S, sw: c.w * S, sh: c.h * S };
  return { atlas: img, sx: x * cw, sy: y * ch, sw: cw, sh: ch };
}
let misses = 0;
/** How many mod cells couldn't draw yet (art still loading): a redraw that raised it is still waiting for art. */
export const modDrawMisses = () => misses;
/** Draw one cell of a mod atlas; false when the art isn't (yet) available. */
export function drawModCell(ctx, atlas, pos, dx, dy, dw, dh, frame = 0) {
  if (!pos) return false;
  let r = modCellRect(atlas, pos, frame);
  if (!r) return false;
  // a pre-split sheet's cell comes from its small block (tools/micatro/split_mod_atlases.mjs), never the whole sheet —
  // in a run as in the deck editor; it's cropped into the LRU below and the block let go (keepBlock)
  const b = blocksOn ? blockOf(r, atlas) : null;
  if (b && b.empty) return true;   // (no pixels there)
  const key = cropping || b ? r.atlas + '|' + r.sx + ',' + r.sy + ',' + r.sw + ',' + r.sh : null;
  let src = key && crops.get(key);
  if (src) { crops.delete(key); crops.set(key, src); }   // (LRU: most recent last)
  else {
    const from = b || r;
    if (modAtlasState(from.atlas) !== 'ok') { misses++; if (!b && r.atlas !== atlas) modAtlasState(atlas); return false; }   // (a tiled atlas: not ALL its tiles for one block)
    src = modImgs.get(from.atlas).img;
    if (b) { r = { ...r, sx: b.sx, sy: b.sy }; keepBlock(b.atlas); }
    if (key) {
      // keep this cell as its own small canvas, so its block (crop mode: or whole sheet) can be let go
      try {
        const c = document.createElement('canvas');
        c.width = r.sw; c.height = r.sh;
        const cx = c.getContext('2d');
        cx.drawImage(src, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
        // a crop that came out empty isn't kept: the image may not have been drawable just then (an iPhone under memory
        // pressure draws nothing), and a cached empty crop would leave the card blank for good — the next draw (the
        // face's blank retry, cardsprite.js) crops it again, as the whole-sheet path redraws from the sheet
        if (!cropEmpty(cx, r.sw, r.sh)) {
          crops.set(key, c);
          while (crops.size > cropCap) crops.delete(crops.keys().next().value);
        }
        src = c;
      } catch (e) { /* draw from the sheet */ }
    }
  }
  try {
    if (src.tagName === 'CANVAS') ctx.drawImage(src, 0, 0, r.sw, r.sh, dx, dy, dw ?? r.sw, dh ?? r.sh);
    else ctx.drawImage(src, r.sx, r.sy, r.sw, r.sh, dx, dy, dw ?? r.sw, dh ?? r.sh);
  } catch (e) { return false; }
  return true;
}
/** Did a crop draw no pixels at all? (false when it can't be read: kept as drawn) */
function cropEmpty(cx, w, h) {
  try {
    const d = cx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]) return false;
    return true;
  } catch (e) { return false; }
}
/*
 * Cell crops. Every cell of a pre-split sheet (below: Pokermon's Natdex joker sheet is 4260 x 13110 px = 213 MB decoded,
 * 582 jokers share it) is read from its small BLOCK, copied into its own small canvas (an LRU of `cropCap` cells) and
 * drawn from there; the block is then let go (keepBlock). That's the whole game — a run's shop, jokers, packs, tooltips,
 * Run Info, replays, spectating — so a phone never decodes a whole split sheet. A crop is the cell at its own 2x size, so
 * one serves every size it's drawn at. Sheets that aren't split (under 4 MB decoded) draw straight from the sheet.
 * Crop mode (beginCellCrops .. endCellCrops) is for screens that show hundreds of mod cards at once (the deck editor and
 * its picker: Pokermon + Nacho + Pokermon+ = 850 jokers over ~20 sheets): every cell is cropped, unsplit sheets too, and
 * releaseModSheets() lets go of the blocks / sheets loaded meanwhile. One that's needed again reloads (HTTP cache) on
 * its next draw and fires onModAtlas as usual.
 */
const GAME_CROPS = 256;             // a run's crops: its visible cards (+ souls, animation frames) with headroom, ~108 KB each
let cropping = 0, cropCap = GAME_CROPS;
let blocksOn = true;
/** Tests: false draws every cell from its whole sheet again (the reference the blocks are checked against). */
export function setModBlocks(on) { blocksOn = !!on; crops.clear(); }
/** Tests: forget every crop (as when a phone drops its canvases): the next draws crop again from the blocks / sheets. */
export function dropModCrops() { crops.clear(); }
/*
 * Blocks in a run: a block (~1.5 MB decoded) is only needed while its cells are cropped. The last few used stay decoded
 * (the cards of one shop / pack / collection page and an animation's next frames often share one), the rest are let
 * go, and all of them once no block has been used for a moment — so a run keeps only crops, never a whole sheet.
 */
const KEEP_BLOCKS = 6, BLOCK_IDLE_MS = 1500;
const keptBlocks = new Map();       // block name -> true, least recently used first
let blockIdleT = 0;
function keepBlock(name) {
  keptBlocks.delete(name); keptBlocks.set(name, true);
  while (keptBlocks.size > KEEP_BLOCKS) { const n = keptBlocks.keys().next().value; keptBlocks.delete(n); releaseImage(n); }
  clearTimeout(blockIdleT);
  blockIdleT = setTimeout(() => { for (const n of [...keptBlocks.keys()]) { keptBlocks.delete(n); releaseImage(n); } }, BLOCK_IDLE_MS);
}
/** Free one loaded mod image's decoded bitmap (it reloads from the HTTP cache on its next draw). */
function releaseImage(name) {
  const e = modImgs.get(name);
  if (!e || e.state !== 'ok') return false;   // (still loading: its listeners draw first)
  e.img.onload = e.img.onerror = null;
  e.img.removeAttribute('src');
  modImgs.delete(name);
  return true;
}
// Pre-split sheets (js/mods/split_sheets.js, made by tools/micatro/split_mod_atlases.mjs): a cell is read
// from its block <dir>/_split/<name>/<bx>_<by>.png (~1.5 MB decoded) instead of the whole sheet (up to 213 MB).
const blockAtlases = new Map();     // block name -> {src, sheet}
const splitBroken = new Set();      // sheets with a block that failed to load (not deployed yet): drawn whole
const splitCache = new Map();       // image atlas name -> its manifest entry + src, or null
function sheetSplit(name) {
  if (splitCache.has(name)) return splitCache.get(name);
  const a = MODREG.atlases[name];
  let sp = null;
  if (a && a.src) {
    let path = a.src;
    try { path = decodeURIComponent(a.src); } catch (e) { /* as is */ }
    const m = path.match(/([^/]+\/assets\/2x\/.+\.png)$/);
    if (m && SPLIT_SHEETS[m[1]]) sp = { ...SPLIT_SHEETS[m[1]], src: a.src, empty: new Set(SPLIT_SHEETS[m[1]].empty || []) };
  }
  splitCache.set(name, sp);
  return sp;
}
/** The block that holds cell rect r of a pre-split sheet: {atlas (the block's name), sx, sy} or {empty}, else null. */
function blockOf(r, atlas) {
  if (splitBroken.has(r.atlas)) return null;
  const sp = sheetSplit(r.atlas);
  if (!sp) return null;
  // (a cell outside the sheet — a placeholder pos like Pokermon's {x: 99, y: 99} — has no block: the whole sheet draws
  // nothing there either, so it's empty, never a request for a block that doesn't exist)
  if (r.sx >= sp.w || r.sy >= sp.h || r.sx + r.sw <= 0 || r.sy + r.sh <= 0) return { empty: true };
  const bx = Math.floor(r.sx / sp.bw), by = Math.floor(r.sy / sp.bh);
  if (r.sx + r.sw > (bx + 1) * sp.bw || r.sy + r.sh > (by + 1) * sp.bh) return null;   // (straddles two blocks)
  const id = bx + '_' + by;
  if (sp.empty.has(id)) return { empty: true };
  const name = r.atlas + '#' + id;
  if (!blockAtlases.has(name)) {
    blockAtlases.set(name, { src: sp.src.replace(/\/([^/]+)\.png$/, '/_split/$1/' + id + '.png'), sheet: r.atlas });
    tileParents.set(name, atlas && atlas !== r.atlas ? [r.atlas, atlas] : [r.atlas]);   // (its listeners: the sheet's, a tiled atlas's)
  }
  return { atlas: name, sx: r.sx - bx * sp.bw, sy: r.sy - by * sp.bh };
}
const crops = new Map();            // 'image atlas|sx,sy,sw,sh' -> canvas
const cropSheets = new Set();       // sheets first loaded while crops were on
export function beginCellCrops(cap = 160) { cropping++; cropCap = Math.max(cropCap, cap); }
export function endCellCrops() { if (cropping && --cropping === 0) { releaseModSheets(); crops.clear(); cropSheets.clear(); cropCap = GAME_CROPS; } }
export function setCellCropCap(cap) { cropCap = Math.max(16, cap | 0); while (crops.size > cropCap) crops.delete(crops.keys().next().value); }
/** Let go of the (loaded) sheets that were first loaded while crops were on. */
export function releaseModSheets() {
  for (const name of [...cropSheets]) {
    if (!modImgs.has(name)) { cropSheets.delete(name); continue; }
    if (releaseImage(name)) { cropSheets.delete(name); keptBlocks.delete(name); }
  }
}
/** The decoded mod sheets + blocks alive now ({name, w, h}) and the crops: what the game keeps in memory (tests). */
export function modSheetStats() {
  const sheets = [];
  const blocks = [];
  for (const [name, e] of modImgs) if (e.state === 'ok' && e.img.naturalWidth) (blockAtlases.has(name) ? blocks : sheets).push({ name, w: e.img.naturalWidth, h: e.img.naturalHeight });
  const byImage = {};
  for (const k of crops.keys()) { const a = k.slice(0, k.indexOf('|')); byImage[a] = (byImage[a] || 0) + 1; }
  return { sheets, blocks, crops: crops.size, cropCap, cropping, byImage, splitBroken: [...splitBroken] };
}
/**
 * A mod font by key (a mod's content.fonts: {key: {src, family}} — SMODS.Font), loaded on first use; returns the
 * CSS family name (or null). AutumnCircus' Emojiokers write their names in Noto Emoji ({f:thac_emoji}).
 */
const modFonts = new Map();
export function modFont(key) {
  if (!key) return null;
  if (modFonts.has(key)) return modFonts.get(key);
  let fam = null;
  for (const m of Object.values(MODREG.mods || {})) {
    const f = m && m.content && m.content.fonts && m.content.fonts[key];
    if (!f) continue;
    fam = f.family || key;
    try { const ff = new FontFace(fam, 'url(' + f.src + ')'); document.fonts.add(ff); ff.load().catch(() => {}); } catch (e) { /* no FontFace here */ }
    break;
  }
  modFonts.set(key, fam);
  return fam;
}
/** CSS colour from a hex string ('#abc', 'abcdef') or Balatro rgba array ([r,g,b,a] 0..1). */
export function cssColour(c) {
  if (!c) return null;
  if (Array.isArray(c)) return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3] == null ? 1 : c[3]})`;
  const s = String(c).trim();
  if (/^#?[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(s)) return s[0] === '#' ? s : '#' + s;
  return /^(rgb|hsl)a?\(/i.test(s) ? s : null;
}
/** A mod consumable type by set name (case-insensitive), or null. */
export function modType(set) {
  if (!set) return null;
  const t = MODREG.types;
  if (t[set]) return t[set];
  const k = String(set).toLowerCase();
  for (const key of Object.keys(t)) if (key.toLowerCase() === k) return t[key];
  return null;
}
/** Is this card set a consumable (vanilla Tarot/Planet/Spectral or a mod type)? */
export const isConsumableSet = (set) => ['Tarot', 'Planet', 'Spectral'].includes(set) || !!modType(set);
