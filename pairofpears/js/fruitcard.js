// fruitcard.js — a Pair of Pears card on Micatro's table: Micatro's own CardSprite (the
// easing, juice, hover tilt, flip, dissolve and the edition shaders) with a composed face of
// the game's fruit art on Balatro's blank card, and the Green Deck back face down.
//   view data: { facing: 'back' } | { facing: 'front', fruit, conds: [...], edition? }
// Conditions show as the game's own icons along the bottom; a Pear pair (Special) shines
// polychrome, a Golden one foil, a Juicy one holographic (looks only — the rules are pear.js).
import { CardSprite, FACE_W, FACE_H, drawBack } from '../../micatro/js/ui/cardsprite.js';
import { drawCell, CENTERS } from '../../micatro/js/ui/assets.js';
import { img } from './assets.js';
import { COND_INFO, cap } from './pear.js';

export const BACK = 'b_green';
const NAME_COL = '#4f6367';

/** The card's view data (what a CardSprite holds) for a card in the game's view. */
export function cardData(c) {
  if (!c || !c.fruit || (!c.up && !c.m)) return { facing: 'back', center: 'pp:back' };
  const conds = c.conds || [];
  const edition = conds.includes('special') ? 'polychrome' : conds.includes('golden') ? 'foil' : conds.includes('juicy') ? 'holo' : null;
  // (center carries everything the face shows, so CardSprite's cache key recomposes on any change)
  return { facing: 'front', center: 'pp:' + c.fruit + ':' + conds.join(','), fruit: c.fruit, conds, edition };
}

function drawSprite(ctx, key, cx, cy, box) {
  const im = img(key);
  if (!im || !im.complete || !im.naturalWidth) return false;
  const s = box / Math.max(im.naturalWidth, im.naturalHeight);
  const w = Math.round(im.naturalWidth * s), h = Math.round(im.naturalHeight * s);
  ctx.drawImage(im, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
  return true;
}

/** Compose a fruit card face into ctx (FACE_W x FACE_H). */
export function composeFruitFace(ctx, d) {
  ctx.clearRect(0, 0, FACE_W, FACE_H);
  if (d.facing === 'back') { drawBack(ctx, BACK); return; }
  ctx.imageSmoothingEnabled = false;
  drawCell(ctx, 'centers', CENTERS.c_base.pos, 0, 0, FACE_W, FACE_H);
  // the name, like a playing card's corner index
  ctx.save();
  ctx.fillStyle = NAME_COL; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = '22px m6x11, monospace';
  ctx.fillText(cap(d.fruit), FACE_W / 2, 13, FACE_W - 20);
  ctx.restore();
  // the fruit (soft shadow, then the sprite)
  ctx.save();
  ctx.globalAlpha = 0.18; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(FACE_W / 2, 128, 40, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  drawSprite(ctx, d.fruit, FACE_W / 2, 88, 84);
  // conditions along the bottom
  const conds = (d.conds || []).filter((k) => COND_INFO[k]);
  if (conds.length) {
    const sz = conds.length > 4 ? 20 : 24, gap = 3, total = conds.length * sz + (conds.length - 1) * gap;
    let x = FACE_W / 2 - total / 2 + sz / 2;
    for (const k of conds) {
      ctx.save(); ctx.fillStyle = 'rgba(79,99,103,.16)'; ctx.beginPath(); ctx.arc(x, 160, sz / 2 + 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      drawSprite(ctx, COND_INFO[k].icon, x, 160, sz);
      x += sz + gap;
    }
  }
}

export class FruitCard extends CardSprite {
  compose(fd) {
    const ctx = this.bctx || this.base.getContext('2d');
    try { composeFruitFace(ctx, fd); } catch (e) { /* a face always draws: the back */ try { drawBack(ctx, BACK); } catch (_) { /* no atlas */ } }
    this.base._ver++;
    this.blank = null;
  }
}
