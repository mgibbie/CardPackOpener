// Deck win stickers (Balatro shows the highest stake you've won with a deck as a sticker on the deck in deck
// select). A won run's back key is recorded in the same store as the jokers' win stickers (ui/stickers.js
// recordWin: main.js adds the back key to the win's `jokers` list; seeded / challenge / custom-deck runs earn
// none), with the same categories and priority: Arceus (Nuzlocke + Monotype) > Ambipom (Monotype) > Aipom
// (Nuzlocke) > Pikachu (any Pokermon win) > the plain stake sticker, a special one in a ring of its stake's colour.
// Drawn on the deck back in the New Run deck select, Run Info and the deck pile on the table.
import { winStickerInfo, drawSpecialSticker, drawOwnSticker, STICKER_POS } from './stickers.js';
import { drawCell } from './assets.js';
import { FACE_W, FACE_H } from './cardsprite.js';

/**
 * Draw `backKey`'s win sticker over a deck back drawn at (x, y, w, h) of `ctx`. `collection`: always (the deck
 * select / Run Info); else only while Options > "Stake stickers" is on (the table). Returns the sticker info or null.
 */
export function drawDeckSticker(ctx, backKey, x = 0, y = 0, w = FACE_W, h = FACE_H, collection = true) {
  const st = backKey ? winStickerInfo(backKey, collection) : null;
  if (!st) return null;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / FACE_W, h / FACE_H);
  if (st.special) drawSpecialSticker(ctx, st);
  else if (!drawOwnSticker(ctx, st, FACE_W, FACE_H) && STICKER_POS[st.stake]) drawCell(ctx, 'stickers', STICKER_POS[st.stake], 0, 0, FACE_W, FACE_H);
  ctx.restore();
  return st;
}
/** Draw it onto a deck-back canvas and tag the canvas (data-sticker="<category>:<stake>", for tests / a11y). */
export function stickDeckCanvas(canvas, backKey, collection = true) {
  if (!canvas || !canvas.getContext) return null;
  const st = drawDeckSticker(canvas.getContext('2d'), backKey, 0, 0, canvas.width, canvas.height, collection);
  if (st) { canvas.dataset.sticker = st.category + ':' + st.stake; canvas.title = st.label; }
  else delete canvas.dataset.sticker;
  return st;
}

// the sticker's drawn box on a FACE_W x FACE_H back, learnt from the first sticker whose pixels can be read (every
// category is drawn in the same spot); a mod's sticker sprite from another origin taints the scratch canvas, so
// it reuses this box
let stickerBox = null;
function readBox(off) {
  let px;
  try { px = off.getContext('2d').getImageData(0, 0, FACE_W, FACE_H).data; } catch (e) { return null; }
  let x0 = FACE_W, y0 = FACE_H, x1 = -1, y1 = -1;
  for (let y = 0; y < FACE_H; y++) for (let x = 0; x < FACE_W; x++) if (px[(y * FACE_W + x) * 4 + 3] > 8) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 >= x0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
}
/**
 * The Achievements > Decks tab: the same sticker, drawn LARGE in the middle of the deck back (`size`: its longer
 * side as a fraction of the back's width). Its normal drawn box is scaled into the centre (drawn straight onto
 * `canvas` through a transform and a clip, so no pixels are copied). Tags the canvas like stickDeckCanvas.
 */
export function stickDeckCanvasCentred(canvas, backKey, size = 0.62) {
  if (!canvas || !canvas.getContext) return null;
  const off = document.createElement('canvas');
  off.width = FACE_W; off.height = FACE_H;
  const st = drawDeckSticker(off.getContext('2d'), backKey, 0, 0, FACE_W, FACE_H, true);
  if (!st) { delete canvas.dataset.sticker; return null; }
  const box = readBox(off) || stickerBox;
  if (!box) return stickDeckCanvas(canvas, backKey);   // nothing measured yet: the normal corner sticker
  if (!stickerBox) stickerBox = box;
  const W = canvas.width, H = canvas.height, sx = W / FACE_W, sy = H / FACE_H;
  const k = (W * size) / (Math.max(box.w, box.h) * sx);
  const dw = box.w * sx * k, dh = box.h * sy * k, dx = (W - dw) / 2, dy = (H - dh) / 2;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.imageSmoothingEnabled = false;   // pixel art: keep it crisp
  ctx.beginPath(); ctx.rect(dx, dy, dw, dh); ctx.clip();
  ctx.translate(dx - box.x * sx * k, dy - box.y * sy * k);
  ctx.scale(k, k);
  drawDeckSticker(ctx, backKey, 0, 0, W, H, true);
  ctx.restore();
  canvas.dataset.sticker = st.category + ':' + st.stake; canvas.title = st.label;
  return st;
}
