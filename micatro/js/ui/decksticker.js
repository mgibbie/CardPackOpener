// Deck win stickers (Balatro shows the highest stake you've won with a deck as a sticker on the deck in deck
// select). A won run's back key is recorded in the same store as the jokers' win stickers (ui/stickers.js
// recordWin: main.js adds the back key to the win's `jokers` list; seeded / challenge / custom-deck runs earn
// none), with the same categories and priority: Arceus (Nuzlocke + Monotype) > Ambipom (Monotype) > Aipom
// (Nuzlocke) > the plain stake sticker, a special one in a ring of its stake's colour.
// Drawn on the deck back in the New Run deck select, Run Info and the deck pile on the table.
import { winStickerInfo, drawSpecialSticker, STICKER_POS } from './stickers.js';
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
  else if (STICKER_POS[st.stake]) drawCell(ctx, 'stickers', STICKER_POS[st.stake], 0, 0, FACE_W, FACE_H);
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
