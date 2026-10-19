// Texture atlases + sprite lookup. Balatro's own atlas table (game.lua
// asset_atli / animation_atli) at 2x: every cell is twice the 1x px/py.
import DATA from '../../data/balatro_data.js';

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

export function loadFont() {
  try {
    const f = new FontFace('m6x11', `url(${assetUrl('fonts/m6x11plus.ttf')})`);
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
export const MODREG = { atlases: {}, types: {}, rarities: {}, mods: {}, loc: { descriptions: {}, misc: {} }, center: () => null, seal: () => null };
export function bindModRegistry(m) {
  if (!m) return;
  MODREG.atlases = m.ATLASES || MODREG.atlases;
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
/** 'ok' | 'loading' | 'missing' — kicks off the load on first ask. */
export function modAtlasState(name) {
  const a = MODREG.atlases[name];
  if (!a || !a.src) return 'missing';
  let e = modImgs.get(name);
  if (!e) {
    e = { img: new Image(), state: 'loading' };
    modImgs.set(name, e);
    e.img.crossOrigin = 'anonymous';
    const done = (st) => { e.state = st; for (const cb of modListeners) { try { cb(name); } catch (err) { /* ignore */ } } };
    e.img.onload = () => done('ok');
    e.img.onerror = () => { console.warn('micatro: mod atlas failed to load: ' + name); done('error'); };
    e.img.src = a.src;
  }
  return e.state === 'ok' ? 'ok' : e.state === 'error' ? 'missing' : 'loading';
}
/** Draw one cell of a mod atlas; false when the art isn't (yet) available. */
export function drawModCell(ctx, atlas, pos, dx, dy, dw, dh, frame = 0) {
  if (!pos || modAtlasState(atlas) !== 'ok') return false;
  const a = MODREG.atlases[atlas], im = modImgs.get(atlas).img;
  const sw = a.px * S, sh = a.py * S;
  try { ctx.drawImage(im, ((pos.x || 0) + frame) * sw, (pos.y || 0) * sh, sw, sh, dx, dy, dw ?? sw, dh ?? sh); } catch (e) { return false; }
  return true;
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
