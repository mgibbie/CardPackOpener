// A card on the table: a DOM element whose face is a canvas composed from the
// atlases (center + front + seal + stickers), run through the edition shaders
// each frame when it has an edition / debuff / dissolve. Position, rotation and
// scale ease toward a target set by the board layout; juice/flip/dissolve/
// shatter are local animations. Draws ONLY from view data (cardView objects).
import { drawCell, centerAtlas, CENTERS, CARDS, SEAL_POS, STICKER_POS, SOUL_POS } from './assets.js';
import { CardFX } from './gl.js';

export const FACE_W = 142, FACE_H = 190;
let FX = null;
const fx = () => (FX || (FX = new CardFX(FACE_W, FACE_H)));

const noGL = () => !fx().ok;

export function composeFace(ctx, d, backKey) {
  ctx.clearRect(0, 0, FACE_W, FACE_H);
  const center = CENTERS[d.center] || null;
  const back = CENTERS[backKey || 'b_red'] || CENTERS.b_red;
  if (d.facing === 'back') {
    drawCell(ctx, 'centers', back.pos, 0, 0, FACE_W, FACE_H);
    return;
  }
  const isPlaying = !!d.front || (center && (center.set === 'Default' || center.set === 'Enhanced'));
  if (isPlaying) {
    drawCell(ctx, 'centers', (center && center.pos) || { x: 1, y: 0 }, 0, 0, FACE_W, FACE_H);
    if (d.front && CARDS[d.front] && !(center && center.name === 'Stone Card')) drawCell(ctx, 'cards_1', CARDS[d.front].pos, 0, 0, FACE_W, FACE_H);
    if (d.seal && SEAL_POS[d.seal]) drawCell(ctx, 'centers', SEAL_POS[d.seal], 0, 0, FACE_W, FACE_H);
  } else if (center) {
    drawCell(ctx, centerAtlas(center), center.pos, 0, 0, FACE_W, FACE_H);
  } else {
    drawCell(ctx, 'centers', back.pos, 0, 0, FACE_W, FACE_H);
  }
  if (d.eternal) drawCell(ctx, 'stickers', STICKER_POS.eternal, 0, 0, FACE_W, FACE_H);
  if (d.perishable) drawCell(ctx, 'stickers', STICKER_POS.perishable, 0, 0, FACE_W, FACE_H);
  if (d.rental) drawCell(ctx, 'stickers', STICKER_POS.rental, 0, 0, FACE_W, FACE_H);
  if (d.debuff && noGL()) {
    ctx.fillStyle = 'rgba(200,40,40,.35)'; ctx.fillRect(0, 0, FACE_W, FACE_H);
    ctx.strokeStyle = 'rgba(255,60,60,.9)'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(FACE_W - 10, FACE_H - 10); ctx.moveTo(FACE_W - 10, 10); ctx.lineTo(10, FACE_H - 10); ctx.stroke();
  }
}
/** Which floating "soul" layer a card has (legendaries, The Soul, Hologram). */
export function soulLayer(d) {
  if (d.facing === 'back') return null;
  const c = CENTERS[d.center];
  if (!c) return null;
  if (c.soul_pos) return { atlas: 'Joker', pos: c.soul_pos };
  if (d.center === 'c_soul') return { atlas: 'centers', pos: SOUL_POS };
  return null;
}

const visKey = (d, backKey) => [d.center, d.front, d.edition, d.seal, d.facing, d.debuff, d.eternal, d.perishable, d.rental, backKey].join('|');

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
    this.T = { x: 0, y: 0, r: 0, s: 1, o: 1 };
    this.tgt = { x: 0, y: 0, r: 0, s: 1, o: 1 };
    this.z = 0;
    this.juice = null;
    this.hover = false;
    this.tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    this.dissolve = null; this.flipAnim = null; this.shattered = false;
    this.lastFx = 0;
    this.phase = Math.random() * 10;
    this.vkey = '';
    this.setData(data);
  }
  place(x, y, r = 0, s = 1) { this.T.x = this.tgt.x = x; this.T.y = this.tgt.y = y; this.T.r = this.tgt.r = r; this.T.s = this.tgt.s = s; }
  setData(d) {
    this.d = d || this.d;
    const k = visKey(this.d, this.board.backKey);
    if (k === this.vkey) return;
    this.vkey = k;
    composeFace(this.base.getContext('2d'), this.d, this.board.backKey);
    this.base._ver++;
    this.drawStatic();
    const soul = soulLayer(this.d);
    if (soul) {
      if (!this.soul) { this.soul = document.createElement('canvas'); this.soul.width = FACE_W; this.soul.height = FACE_H; this.soul.className = 'card-soul'; this.inner.appendChild(this.soul); }
      const sc = this.soul.getContext('2d'); sc.clearRect(0, 0, FACE_W, FACE_H);
      drawCell(sc, soul.atlas, soul.pos, 0, 0, FACE_W, FACE_H);
    } else if (this.soul) { this.soul.remove(); this.soul = null; }
    this.el.classList.toggle('is-joker', CENTERS[this.d.center] && CENTERS[this.d.center].set === 'Joker');
    this.el.classList.toggle('wee', this.d.center === 'j_wee');
  }
  needsFx() { return !!(this.dissolve || (this.d.facing !== 'back' && (this.d.edition || this.d.debuff))); }
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
  startFlip(newData, dur = 0.28) { this.flipAnim = { start: this.board.now, dur, data: newData, swapped: false }; }
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
      if (p >= 0.5 && !F.swapped) { F.swapped = true; this.setData(F.data); }
      if (p >= 1) this.flipAnim = null;
    }
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
    // shader pass
    if (this.dissolve) {
      const D = this.dissolve;
      let p = Math.min(1, (now - D.start) / D.dur);
      const amt = D.reverse ? 1 - p : p;
      fx().render(this.base, this.face, { edition: this.d.facing !== 'back' ? this.d.edition : null, debuff: this.d.debuff, dissolve: amt, t: now, fx: [now / 28 + this.tilt.y * 0.02, now] });
      if (p >= 1) {
        const cb = D.cb; this.dissolve = null;
        if (D.reverse) this.drawStatic();
        if (cb) cb();
      }
    } else if (this.needsFx() && !noGL() && now - this.lastFx > (this.board.lowFx ? 0.08 : 0.033)) {
      this.lastFx = now;
      fx().render(this.base, this.face, { edition: this.d.edition, debuff: this.d.debuff, dissolve: 0, t: now, fx: [now / 28 + (this.tilt.x + this.tilt.y) * 0.03 + T.r * 3, now] });
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
