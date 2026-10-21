// A card on the table: a DOM element whose face is a canvas composed from the
// atlases (center + front + seal + stickers), run through the edition shaders
// each frame when it has an edition / debuff / dissolve. Position, rotation and
// scale ease toward a target set by the board layout; juice/flip/dissolve/
// shatter are local animations. Draws ONLY from view data (cardView objects).
import { drawCell, centerAtlas, CENTERS, CARDS, TAGS, SEAL_POS, STICKER_POS, SOUL_POS, MODREG, drawModCell, modAtlasState } from './assets.js';
import { CardFX } from './gl.js';
import { first as modFirst, all as modAll, hasModUI } from './modui.js';
import { drawSkinFront, skinVer } from './skins.js';
import { winStickerInfo, drawSpecialSticker, drawOwnSticker, STICKER_POS as WIN_POS, stickerVer } from './stickers.js';

export const FACE_W = 142, FACE_H = 190;
let FX = null;
const fx = () => (FX || (FX = new CardFX(FACE_W, FACE_H)));

const noGL = () => !fx().usable();

// A card face must always draw. Its optional layers (seal, stickers, a win sticker, a mod's overlay) each draw
// inside layer(): one that throws (a sticker sprite that won't decode, a mod's bad cell) is skipped and
// logged once per layer, instead of aborting the compose and leaving the card blank.
const warned = new Set();
export function warnOnce(what, e) {
  if (warned.has(what)) return;
  warned.add(what);
  try { console.warn('micatro: card face ' + what + ' failed:', e && e.message ? e.message : e); } catch (_) { /* no console */ }
}
const d0 = (d) => 'card ' + (d && (d.center || d.front || d.id));
function layer(what, fn) {
  try { fn(); } catch (e) { warnOnce(what, e); }
}

/** opts.collection: a collection-style view (the Pokédex, Challenges): win stickers always show. */
export function composeFace(ctx, d, backKey, opts) {
  ctx.clearRect(0, 0, FACE_W, FACE_H);
  const center = CENTERS[d.center] || null;
  if (d.facing === 'back') {
    // a mod's own back for this card (Reverie: face-down vouchers / tags / boosters in an Adrifting shop)
    if (d.back_atlas && (d.tag_card ? drawTagCell(ctx, d.back_atlas, d.back_pos, d.tag_card) : drawModCell(ctx, d.back_atlas, d.back_pos, 0, 0, FACE_W, FACE_H))) return;
    drawBack(ctx, backKey);
    return;
  }
  if (d.tag_card) {
    // a Tag sold / packed as a card (Reverie): the square tag sprite, small in the shop, big in packs
    const tg = TAGS[d.tag || d.center];
    if (!drawTagCell(ctx, d.atlas || (tg && tg.atlas), (d.atlas && d.pos) || (tg && tg.pos), d.tag_card)) placeholderFace(ctx, d, d.atlas && modAtlasState(d.atlas) === 'loading');
    return;
  }
  // A mod's "blind card" (Bunco's Blind Packs): the blind's chip, square in the card's place.
  if (d.blind_card) { drawBlindCard(ctx, d.blind_card); return; }
  const modCard = !!(d.mod || d.atlas);
  try { composeBase(ctx, d, backKey, center, modCard); } catch (e) {
    // (the card's own art failed: a stand-in face, never a blank one)
    warnOnce('art', e);
    layer('placeholder', () => { ctx.clearRect(0, 0, FACE_W, FACE_H); placeholderFace(ctx, d, false); });
  }
  composeOverlays(ctx, d, center, modCard, opts);
}
/** The card itself: its art, a playing card's rank / suit (the seal is an overlay: composeOverlays). */
function composeBase(ctx, d, backKey, center, modCard) {
  const isPlaying = !!d.front || (center && (center.set === 'Default' || center.set === 'Enhanced')) || (modCard && (d.set === 'Default' || d.set === 'Enhanced'));
  if (isPlaying) {
    // a mod enhancement draws its own base; the rank/suit goes on top as usual
    if (!(modCard && d.atlas && drawModCell(ctx, d.atlas, d.pos, 0, 0, FACE_W, FACE_H))) drawCell(ctx, 'centers', (center && center.pos) || { x: 1, y: 0 }, 0, 0, FACE_W, FACE_H);
    // (a mod suit's card — Bunco's Fleurons / Halberds — draws from its mod atlas)
    // (a deck skin the player chose for this suit draws instead — ui/skins.js, cosmetic only)
    // (a Stone card, or a mod enhancement that replaces the rank and suit — SMODS replace_base_card: Pokermon's
    // Hazard, MoreFluff's Gemstone — shows no rank / suit)
    const noBase = (center && center.name === 'Stone Card') || !!(d.enh && d.enh.replace);
    if (d.front_atlas && !noBase) { if (!drawSkinFront(ctx, d, null, FACE_W, FACE_H)) drawModCell(ctx, d.front_atlas, d.front_pos, 0, 0, FACE_W, FACE_H); }
    else if (d.front && CARDS[d.front] && !noBase) { if (!drawSkinFront(ctx, d, CARDS[d.front].pos, FACE_W, FACE_H)) drawCell(ctx, 'cards_1', CARDS[d.front].pos, 0, 0, FACE_W, FACE_H); }
  } else if (modCard) {
    if (!drawModCell(ctx, d.atlas, d.pos, 0, 0, FACE_W, FACE_H)) placeholderFace(ctx, d, d.atlas && modAtlasState(d.atlas) === 'loading');
  } else if (center) {
    drawCell(ctx, centerAtlas(center), center.pos, 0, 0, FACE_W, FACE_H);
  } else {
    drawBack(ctx, backKey);
  }
}
/** The optional layers over the card, each on its own (layer): one failing never takes the card or the rest. */
function composeOverlays(ctx, d, center, modCard, opts) {
  const isPlaying = !!d.front || (center && (center.set === 'Default' || center.set === 'Enhanced')) || (modCard && (d.set === 'Default' || d.set === 'Enhanced'));
  // (a mod seal — Pokermon's Pink / Silver — draws its cell from the mod's atlas: engine/view.js seal_atlas / seal_pos)
  if (isPlaying && d.seal) layer('seal', () => {
    if (d.seal_atlas) drawModCell(ctx, d.seal_atlas, d.seal_pos, 0, 0, FACE_W, FACE_H);
    else if (SEAL_POS[d.seal]) drawCell(ctx, 'centers', SEAL_POS[d.seal], 0, 0, FACE_W, FACE_H);
  });
  if (d.eternal) layer('eternal sticker', () => drawCell(ctx, 'stickers', STICKER_POS.eternal, 0, 0, FACE_W, FACE_H));
  // mod stickers (view_card mod_stickers: [{atlas, pos}]) and a linked group's chain (view_card group: Bunco)
  for (const st of d.mod_stickers || []) layer('mod sticker ' + (st && st.atlas), () => drawModCell(ctx, st.atlas, st.pos, 0, 0, FACE_W, FACE_H));
  if (d.group) layer('link', () => drawModCell(ctx, 'bunco_link', { x: (d.group - 1) % 5, y: 0 }, 0, 0, FACE_W, FACE_H));
  if (d.perishable) layer('perishable sticker', () => drawCell(ctx, 'stickers', STICKER_POS.perishable, 0, 0, FACE_W, FACE_H));
  if (d.rental) layer('rental sticker', () => drawCell(ctx, 'stickers', STICKER_POS.rental, 0, 0, FACE_W, FACE_H));
  // the joker's win sticker: the highest stake this player has won with it (ui/stickers.js; Balatro's sticker_run),
  // or a Pokermon run's special one (Nuzlocke Aipom / Monotype Ambipom / both Arceus, ringed in its stake's colour)
  if ((center && center.set === 'Joker') || (modCard && d.set === 'Joker')) layer('win sticker', () => {
    const st = winStickerInfo(d.win_key || d.center, opts && opts.collection);
    if (st && st.special) {
      // (its own save/restore is skipped when its sprite throws: the context's state is put back here)
      ctx.save();
      try { drawSpecialSticker(ctx, st); } finally { ctx.restore(); }
    } else if (st && !drawOwnSticker(ctx, st, FACE_W, FACE_H) && WIN_POS[st.stake]) drawCell(ctx, 'stickers', WIN_POS[st.stake], 0, 0, FACE_W, FACE_H);   // (Elite: its own art)
  });
  if (d.debuff && noGL()) layer('debuff', () => {
    ctx.fillStyle = 'rgba(200,40,40,.35)'; ctx.fillRect(0, 0, FACE_W, FACE_H);
    ctx.strokeStyle = 'rgba(255,60,60,.9)'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(FACE_W - 10, FACE_H - 10); ctx.moveTo(FACE_W - 10, 10); ctx.lineTo(10, FACE_H - 10); ctx.stroke();
  });
}
/** Did a compose leave the face empty? (a face-up card always draws something; a row through the middle is
 *  enough: every face — art, placeholder, tag square, blind chip — covers it). A canvas that can't be read is
 *  taken as drawn. */
export function faceLooksBlank(ctx) {
  try {
    const px = ctx.getImageData(0, FACE_H >> 1, FACE_W, 1).data;
    for (let i = 3; i < px.length; i += 4) if (px[i] !== 0) return false;
    return true;
  } catch (e) { return false; }
}
/** A tag cell (base 'tags' atlas, or a mod atlas) as a square centred on the card face. */
function drawTagCell(ctx, atlas, pos, size) {
  if (!pos) return false;
  const w = FACE_W * (size === 'big' ? 1 : 0.8), x = (FACE_W - w) / 2, y = (FACE_H - w) / 2;
  if (atlas && MODREG.atlases[atlas]) return drawModCell(ctx, atlas, pos, x, y, w, w);
  return drawCell(ctx, 'tags', pos, x, y, w, w);
}
/** A blind chip drawn as a card face (frame 0 of the blind's animated atlas). */
function drawBlindCard(ctx, b) {
  const sz = FACE_W, y = (FACE_H - sz) / 2;
  if (b.atlas && drawModCell(ctx, b.atlas, b.pos, 0, y, sz, sz)) return;
  drawCell(ctx, 'blind_chips', b.pos || { x: 0, y: 0 }, 0, y, sz, sz);
}
/** Every mod atlas a card's face uses (to recompose it once one has loaded). */
export function modAtlasesOf(d) {
  const out = [];
  if (d.atlas) out.push(d.atlas);
  if (d.front_atlas) out.push(d.front_atlas);
  if (d.seal_atlas) out.push(d.seal_atlas);
  if (d.blind_card && d.blind_card.atlas) out.push(d.blind_card.atlas);
  if (d.group) out.push('bunco_link');
  for (const st of d.mod_stickers || []) out.push(st.atlas);
  return out;
}
/** A deck back: vanilla from the Enhancers atlas, a mod deck from its own atlas. */
export function drawBack(ctx, backKey) {
  const key = backKey || 'b_red';
  if (CENTERS[key]) { drawCell(ctx, 'centers', CENTERS[key].pos, 0, 0, FACE_W, FACE_H); return; }
  const mc = MODREG.center(key);
  if (mc && mc.atlas && drawModCell(ctx, mc.atlas, mc.pos, 0, 0, FACE_W, FACE_H)) return;
  drawCell(ctx, 'centers', CENTERS.b_red.pos, 0, 0, FACE_W, FACE_H);
}
/** A clean stand-in for a mod card whose art is missing (or still loading): frame + name. */
export function placeholderFace(ctx, d, loading) {
  const W = FACE_W, H = FACE_H, r = 12;
  ctx.save();
  const rr = (x, y, w, h, rad) => { ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad); ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath(); };
  rr(2, 2, W - 4, H - 4, r); ctx.fillStyle = '#e8ecee'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#4f6367'; ctx.stroke();
  rr(12, 12, W - 24, H - 24, 8); ctx.fillStyle = loading ? '#c9d2d5' : '#bfc7d5'; ctx.fill();
  ctx.fillStyle = '#4f6367'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const words = String(d.name || d.center || '?').split(/\s+/);
  const lines = []; let cur = '';
  ctx.font = '26px m6x11, monospace';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > W - 34 && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 4);
  shown.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + (i - (shown.length - 1) / 2) * 26, W - 30));
  ctx.restore();
}
/** Which floating "soul" layer a card has (legendaries, The Soul, Hologram, mod soul_pos). */
export function soulLayer(d) {
  if (d.facing === 'back') return null;
  if (d.soul_pos && (d.soul_atlas || d.atlas)) return { mod: true, atlas: d.soul_atlas || d.atlas, pos: d.soul_pos };
  const c = CENTERS[d.center];
  if (!c) return null;
  if (c.soul_pos) return { atlas: 'Joker', pos: c.soul_pos };
  if (d.center === 'c_soul') return { atlas: 'centers', pos: SOUL_POS };
  return null;
}
/** Draw a soul layer (vanilla or mod atlas). */
export function drawSoul(ctx, soul) {
  if (soul.mod) return drawModCell(ctx, soul.atlas, soul.pos, 0, 0, FACE_W, FACE_H);
  return drawCell(ctx, soul.atlas, soul.pos, 0, 0, FACE_W, FACE_H);
}

const visKey = (d, backKey) => [d.front ? skinVer : 0, d.set === 'Joker' || d.mod ? stickerVer : 0, d.center, d.front, d.edition, d.seal, d.facing, d.debuff, d.eternal, d.perishable, d.rental, backKey, d.atlas, d.pos && d.pos.x, d.pos && d.pos.y, d.soul_pos && d.soul_pos.x, d.soul_pos && d.soul_pos.y, d.tag_card, d.back_atlas,
  d.front_atlas, d.blind_card && d.blind_card.key, d.group, (d.mod_stickers || []).map((s) => s.atlas + s.pos.x + ',' + s.pos.y).join(';')].join('|');

export class CardSprite {
  constructor(id, data, board) {
    this.id = id;
    this.board = board;
    this.d = data || {};
    const el = this.el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = id;
    this.shadow = document.createElement('div'); this.shadow.className = 'card-shadow';
    this.inner = document.createElement('div'); this.inner.className = 'card-inner';
    this.face = document.createElement('canvas'); this.face.width = FACE_W; this.face.height = FACE_H; this.face.className = 'card-face';
    this.inner.appendChild(this.face);
    el.appendChild(this.shadow); el.appendChild(this.inner);
    this.base = document.createElement('canvas'); this.base.width = FACE_W; this.base.height = FACE_H; this.base._ver = 0;
    this.bctx = this.base.getContext('2d');
    this.blank = null;   // {at, n}: the last compose drew nothing — retried from frame()
    this.fxGen = -1;
    this.T = { x: 0, y: 0, r: 0, s: 1, o: 1 };
    this.tgt = { x: 0, y: 0, r: 0, s: 1, o: 1 };
    this.z = 0;
    this.juice = null;
    this.hover = false;
    this.tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    this.dissolve = null; this.flipAnim = null; this.flipNext = null; this.shattered = false;
    this.lastFx = 0;
    this.phase = Math.random() * 10;
    this.vkey = '';
    this.setData(data);
  }
  place(x, y, r = 0, s = 1) { this.T.x = this.tgt.x = x; this.T.y = this.tgt.y = y; this.T.r = this.tgt.r = r; this.T.s = this.tgt.s = s; }
  /** What the face shows: the card, or a mod UI's stand-in (Zorua's disguise, ...) — ui/modui.js face(). */
  faceData() {
    const d = this.d;
    if (!d.mod || !hasModUI()) return d;
    const b = this.board;
    const jokers = b.areas && b.areas.jokers ? b.areas.jokers.map((id) => b.data.get(id)).filter(Boolean) : [];
    return modFirst('face', d, { jokers, area: this.area }) || d;
  }
  setData(d) {
    this.d = d || this.d;
    const fd = this.faceData();
    this.anim = fd.mod && hasModUI() ? modFirst('anim', fd) : null;
    const deco = this.d.mod && hasModUI() ? modFirst('decorate', this.d) : null;
    const k = visKey(fd, this.board.backKey) + '|' + (fd === this.d ? '' : 'f') + (deco ? deco.key : '');
    if (k === this.vkey) return;
    this.vkey = k;
    this.fd = fd;
    this.animIdx = -1;
    this.compose(fd);
    this.drawStatic();
    this.setDeco(deco);
    const soul = soulLayer(fd);
    if (soul) {
      if (!this.soul) { this.soul = document.createElement('canvas'); this.soul.width = FACE_W; this.soul.height = FACE_H; this.soul.className = 'card-soul'; this.inner.appendChild(this.soul); }
      const sc = this.soul.getContext('2d'); sc.clearRect(0, 0, FACE_W, FACE_H);
      drawSoul(sc, soul);
    } else if (this.soul) { this.soul.remove(); this.soul = null; }
    this.el.classList.toggle('is-joker', (CENTERS[this.d.center] && CENTERS[this.d.center].set === 'Joker') || (!!this.d.mod && this.d.set === 'Joker'));
    this.el.classList.toggle('is-mod', !!this.d.mod);
    this.el.classList.toggle('is-tag', !!this.d.tag_card);
    this.el.classList.toggle('wee', this.d.center === 'j_wee');
  }
  /** Compose the face into the base canvas. It never throws, and a compose that drew nothing (a face-up card
   *  whose art wasn't drawable just then: an atlas image the browser couldn't decode under memory pressure, an
   *  iPhone in a long Pokermon run) is retried from frame() with a backoff, instead of staying blank for the rest
   *  of the run (the face is cached by vkey, so nothing else would redraw it). */
  compose(fd) {
    const ctx = this.bctx || this.base.getContext('2d');
    try { composeFace(ctx, fd, this.board.backKey); } catch (e) { warnOnce('compose', e); }
    this.base._ver++;
    // (checked for mod art only: a mod atlas is the image that can be "loaded" yet draw nothing — Pokermon's
    // 4260x13110 joker sheet on an iPhone; the base atlases are small, and a read-back per compose isn't free)
    if (fd.facing !== 'back' && modAtlasesOf(fd).length && faceLooksBlank(ctx)) {
      const n = this.blank ? this.blank.n + 1 : 0;
      this.blank = { at: (this.board.now || 0) + Math.min(4, 0.25 * Math.pow(2, n)), n };
      if (n === 0) warnOnce('art (drew nothing; retrying)', d0(fd));
    } else this.blank = null;
  }
  /** A mod UI's DOM decorations over the face (Pokermon's type pill + energy pips). */
  setDeco(deco) {
    if (!deco || !deco.html) { if (this.deco) { this.deco.remove(); this.deco = null; } return; }
    if (!this.deco) { this.deco = document.createElement('div'); this.deco.className = 'card-deco'; this.inner.appendChild(this.deco); }
    if (this.deco.dataset.k !== deco.key) { this.deco.innerHTML = deco.html; this.deco.dataset.k = deco.key; }
  }
  /** An animated sheet (ui/modui.js anim): recompose the face (and soul) when the frame changes. */
  animStep(now) {
    const a = this.anim;
    if (!a || !a.frames || this.d.facing === 'back') return;
    const idx = Math.floor(now * (a.fps || 10)) % a.frames;
    if (idx === this.animIdx) return;
    this.animIdx = idx;
    const fpr = a.fpr || a.frames;
    const pos = { x: idx % fpr, y: Math.floor(idx / fpr) };
    // (a soul-only animation — Nacho 1.7.9's Terapagos-Stellar — leaves the card itself as it is)
    if (!a.soulOnly) {
      try { composeFace(this.bctx || this.base.getContext('2d'), { ...this.fd, atlas: a.atlas || this.fd.atlas, pos }, this.board.backKey); } catch (e) { warnOnce('animation frame', e); }
      this.base._ver++;
      if (!this.needsFx() || noGL()) this.drawStatic();
    }
    if (this.soul && a.soulAtlas) {
      const sc = this.soul.getContext('2d'); sc.clearRect(0, 0, FACE_W, FACE_H);
      drawModCell(sc, a.soulAtlas, pos, 0, 0, FACE_W, FACE_H);
    }
  }
  needsFx() { return !!(this.dissolve || (this.d.facing !== 'back' && (this.d.edition || this.d.debuff || (this.extra && this.extra.length)))); }
  drawStatic() {
    if (this.needsFx() && !noGL()) { this.lastFx = 0; return; }
    const c = this.face.getContext('2d');
    c.clearRect(0, 0, FACE_W, FACE_H);
    c.drawImage(this.base, 0, 0);
  }
  juiceUp(amount = 0.4, rot) {
    const now = this.board.now;
    this.juice = { start: now, end: now + 0.4, amt: amount, ramt: rot != null ? rot : (Math.random() < 0.5 ? 0.6 : -0.6) * amount };
    this.T.s = this.tgt.s * (1 - 0.6 * amount * 0.5);
  }
  startDissolve(dur = 0.7, cb) { this.dissolve = { start: this.board.now, dur, cb }; this.el.classList.add('dissolving'); }
  /** Flip over to `newData` (its face swaps in at the half-way point). A flip asked for while one is still
   *  turning waits for it, so a flip over and straight back (The Empress at 4x) still shows both halves. */
  startFlip(newData, dur = 0.28) {
    if (this.flipAnim) { this.flipNext = { data: newData, dur }; return; }
    this.flipAnim = { start: this.board.now, dur, data: newData, swapped: false };
  }
  /** New data for the card: lands now, or, mid-flip, as the face the flip turns to (an Empress's Mult
   *  arrives while the card is turning face down; setting it now would undo when the flip swaps). */
  updateData(d) {
    if (this.flipNext) this.flipNext.data = d;
    else if (this.flipAnim && !this.flipAnim.swapped) this.flipAnim.data = d;
    else this.setData(d);
  }
  startMaterialize(dur = 0.5) { this.dissolve = { start: this.board.now, dur, reverse: true }; this.lastFx = 0; }
  frame(now, dt) {
    const T = this.T, g = this.tgt;
    const k = 1 - Math.exp(-dt * (this.dragging ? 30 : 11));
    T.x += (g.x - T.x) * k; T.y += (g.y - T.y) * k;
    T.r += (g.r - T.r) * k; T.s += (g.s - T.s) * Math.min(1, k * 1.3);
    T.o += (g.o - T.o) * k;
    let js = 0, jr = 0;
    if (this.juice) {
      const J = this.juice;
      if (now > J.end) this.juice = null;
      else {
        const f = (J.end - now) / (J.end - J.start);
        js = J.amt * Math.sin(50.8 * (now - J.start)) * Math.pow(Math.max(0, f), 3);
        jr = J.ramt * Math.sin(40.8 * (now - J.start)) * Math.pow(Math.max(0, f), 2);
      }
    }
    let sx = 1;
    if (this.flipAnim) {
      const F = this.flipAnim, p = Math.min(1, (now - F.start) / F.dur);
      sx = Math.abs(Math.cos(Math.PI * p));
      if (p >= 0.5 && !F.swapped) { F.swapped = true; try { this.setData(F.data); } catch (e) { warnOnce('flip', e); } }
      if (p >= 1) {
        this.flipAnim = null;
        if (this.flipNext) { const N = this.flipNext; this.flipNext = null; this.startFlip(N.data, N.dur); }
      }
    }
    // a compose that drew nothing: try again (backoff up to 4 s) until the art draws
    if (this.blank && now >= this.blank.at && !this.flipAnim) { const fd = this.fd || this.d; this.compose(fd); this.drawStatic(); }
    // the card shaders' WebGL context was lost or came back: repaint from the composed face (a lost context
    // renders nothing, so every edition / dissolving card would otherwise stay blank)
    const gen = fx().gen;
    if (gen !== this.fxGen) { const was = this.fxGen; this.fxGen = gen; if (was !== -1) { this.lastFx = 0; if (noGL()) this.drawStatic(); } }
    // ambient sway + hover tilt (Balatro's tilt_var)
    const amb = this.hover ? 0 : 0.012 * Math.sin(now * 1.3 + this.phase);
    this.tilt.x += (this.tilt.tx - this.tilt.x) * Math.min(1, dt * 12);
    this.tilt.y += (this.tilt.ty - this.tilt.y) * Math.min(1, dt * 12);
    const w = this.board.cw, h = this.board.ch;
    const s = T.s * (1 + js) * (this.hover && !this.dragging ? 1.06 : 1);
    this.el.style.transform = `translate3d(${(T.x - w / 2).toFixed(1)}px,${(T.y - h / 2).toFixed(1)}px,0) rotate(${(T.r + jr * 0.35 + amb).toFixed(4)}rad) scale(${(s * sx).toFixed(4)},${s.toFixed(4)})`;
    this.el.style.zIndex = this.z;
    if (Math.abs(T.o - 1) > 0.01 || g.o !== 1) this.el.style.opacity = T.o.toFixed(3);
    this.inner.style.transform = `perspective(700px) rotateX(${this.tilt.x.toFixed(2)}deg) rotateY(${this.tilt.y.toFixed(2)}deg)`;
    if (this.soul) {
      const t = now + this.phase;
      this.soul.style.transform = `translateY(${(-4 - 3 * Math.sin(t * 1.9)).toFixed(1)}px) scale(${(1.04 + 0.025 * Math.sin(t * 2.4)).toFixed(3)}) rotate(${(1.6 * Math.sin(t * 1.4)).toFixed(2)}deg)`;
    }
    // mod UI: an animation frame, extra shader passes (Pokermon's evolution / Zorua shadow)
    if (this.anim) this.animStep(now);
    const hadExtra = !!(this.extra && this.extra.length);
    this.extra = this.d.mod && this.d.facing !== 'back' && hasModUI() ? modAll('fx', this.d, this, now) : null;
    if (hadExtra && !(this.extra && this.extra.length) && !this.needsFx()) this.drawStatic();
    // shader pass
    if (this.dissolve) {
      const D = this.dissolve;
      let p = Math.min(1, (now - D.start) / D.dur);
      const amt = D.reverse ? 1 - p : p;
      this.renderFx({ edition: this.d.facing !== 'back' ? this.d.edition : null, debuff: this.d.debuff, dissolve: amt, t: now, fx: [now / 28 + this.tilt.y * 0.02, now], extra: this.extra });
      if (p >= 1) {
        const cb = D.cb; this.dissolve = null;
        if (D.reverse) this.drawStatic();
        if (cb) cb();
      }
    } else if (this.needsFx() && !noGL() && now - this.lastFx > (this.board.lowFx ? 0.08 : 0.033)) {
      this.lastFx = now;
      this.renderFx({ edition: this.d.edition, debuff: this.d.debuff, dissolve: 0, t: now, fx: [now / 28 + (this.tilt.x + this.tilt.y) * 0.03 + T.r * 3, now], extra: this.extra });
    }
  }
  /** The face through the card shaders; a shader pass that throws draws the plain face instead (never none). */
  renderFx(opts) {
    try { fx().render(this.base, this.face, opts); } catch (e) {
      warnOnce('shader', e);
      const c = this.face.getContext('2d');
      c.clearRect(0, 0, FACE_W, FACE_H);
      c.globalAlpha = 1 - (opts.dissolve || 0); c.drawImage(this.base, 0, 0); c.globalAlpha = 1;
    }
  }
  /** Glass shatter: shards fly apart from the card's spot (Canvas2D overlay). */
  shatter(layer, cb) {
    this.shattered = true;
    const w = this.board.cw, h = this.board.ch, now0 = this.board.now;
    const cv = document.createElement('canvas');
    const W = w * 3, H = h * 3;
    cv.width = W; cv.height = H; cv.className = 'shards';
    cv.style.transform = `translate(${this.T.x - W / 2}px,${this.T.y - H / 2}px)`;
    layer.appendChild(cv);
    const ctx = cv.getContext('2d');
    const shards = [];
    const n = 4, m = 5;
    const jx = (i, j) => (i === 0 || i === n ? 0 : (Math.sin(i * 12.9 + j * 78.2) * 0.3)) * (w / n);
    const jy = (i, j) => (j === 0 || j === m ? 0 : (Math.cos(i * 39.3 + j * 11.1) * 0.3)) * (h / m);
    const P = (i, j) => [i * w / n + jx(i, j), j * h / m + jy(i, j)];
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      for (const tri of [[a, b, c], [a, c, d]]) {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        const dx = cx - w / 2, dy = cy - h / 2;
        shards.push({ tri, cx, cy, vx: dx * 4 + (Math.random() - 0.5) * 120, vy: dy * 3 - 120 - Math.random() * 120, vr: (Math.random() - 0.5) * 8 });
      }
    }
    this.el.style.visibility = 'hidden';
    const step = () => {
      const t = this.board.now - now0;
      ctx.clearRect(0, 0, W, H);
      if (t > 0.9) { cv.remove(); if (cb) cb(); return; }
      ctx.globalAlpha = Math.max(0, 1 - t / 0.9);
      for (const s of shards) {
        ctx.save();
        ctx.translate(W / 2 - w / 2 + s.cx + s.vx * t, H / 2 - h / 2 + s.cy + s.vy * t + 520 * t * t);
        ctx.rotate(s.vr * t);
        ctx.beginPath();
        ctx.moveTo(s.tri[0][0] - s.cx, s.tri[0][1] - s.cy); ctx.lineTo(s.tri[1][0] - s.cx, s.tri[1][1] - s.cy); ctx.lineTo(s.tri[2][0] - s.cx, s.tri[2][1] - s.cy);
        ctx.closePath(); ctx.clip();
        ctx.drawImage(this.face, -s.cx, -s.cy, w, h);
        ctx.restore();
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  destroy() { this.el.remove(); }
}
