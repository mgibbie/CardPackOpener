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
