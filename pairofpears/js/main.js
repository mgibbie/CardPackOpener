// Pair of Pears — the web front end. A sibling of Micatro and Scoundrel: it draws with Micatro's
// own UI pieces (the Balatro card base + back and the card shaders through FruitCard, the swirling
// background, the m6x11 font, the palette / buttons / panels / tooltips / popups / modals in
// micatro.css, its sounds, its publisher + spectator loops) around the owner's card game (pear.js).
//
//   normal      : a local run (pear.js) -> an action -> render(view) -> friends watch (publish-pears)
//   ?spectate=u : read-only; a friend's published view snapshots, the same renderer
//   ?direct=1   : launched from the overworld's arcade box: "back" returns to /overworld/
//
// The table renders ONLY from pear.view() objects (which never carry a face-down card's fruit),
// so the runner and a spectator draw the same thing.
import * as P from './pear.js';
import * as SV from './save.js';
import { loadAll, src as artSrc } from './assets.js';
import { FruitCard, cardData, BACK } from './fruitcard.js';
import { loadImages, loadFont } from '../../micatro/js/ui/assets.js';
import { Background, C as BGC, hex } from '../../micatro/js/ui/gl.js';
import { sound } from '../../micatro/js/ui/sound.js';
import { SOUNDS } from '../../micatro/js/mods/registry.js';
import { esc } from '../../micatro/js/ui/markup.js';
import { buttonLabel } from '/site/gamepad.js';
import { startInput, keyLabel, isTyping } from '/site/input.js';

const params = new URLSearchParams(location.search);
const SPECTATE = (params.get('spectate') || '').trim().toLowerCase();
const MODE = SPECTATE ? 'spectate' : 'normal';
const DIRECT = params.has('direct');            // from the overworld's arcade box
const HOME = DIRECT ? { href: '/overworld/', text: '← Overworld' } : { href: '/', text: '← Magepunk' };

// The Meadows Theme (the owner's music) plays through Micatro's sound engine as its music track:
// it starts on the first tap / key (autoplay rules), at Micatro's music volume, and Options' Music toggle mutes it.
SOUNDS.pears_meadows = { src: new URL('../assets/audio/meadows_theme.ogg', import.meta.url).href, music: true };
sound.setTrack('pears_meadows');

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const btn = (label, cls, fn) => { const b = h('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', (e) => { sound.play('button'); fn(e); }); return b; };
const ico = (key, cls = 'pp-ico') => `<img class="${cls}" src="${artSrc(key)}" alt="">`;
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const heartsText = (x) => String(Math.round(x * 100) / 100);
const upFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ------------------------------------------------------------------ the stage (Micatro's fixed design canvas, scaled)
const stage = document.getElementById('stage');
let bg = null;
let W = 1360, SH = 900, portrait = false, scale = 1;
const T = { now: performance.now() / 1000, cw: 120, ch: 160, backKey: BACK, areas: {}, data: new Map(), lowFx: false }; // the "board" a CardSprite reads
const sprites = new Map();   // card id -> FruitCard on the table
const leaving = new Set();   // sprites animating out (matched / a finished level)
const gone = new Set();      // ids of matched cards already taken off the table
let V = null;                // the view on the table
let net = null, publisher = null, chat = null, pad = null;
let shownFx = 0, overShown = false, dealQueue = 0, recorded = false;
const el = {};

// The visible part of the window (micatro/js/ui/board.js visibleBox: Safari's toolbars, the notch).
let insetProbe = null;
function visibleBox() {
  let w = innerWidth, hh = innerHeight;
  const vv = window.visualViewport;
  if (vv && Math.abs((vv.scale || 1) - 1) < 0.01) { if (vv.width > 50) w = Math.min(w, Math.round(vv.width)); if (vv.height > 50) hh = Math.min(hh, Math.round(vv.height)); }
  let s = { t: 0, r: 0, b: 0, l: 0 };
  try {
    if (!insetProbe) {
      insetProbe = document.createElement('div');
      insetProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      document.body.appendChild(insetProbe);
    }
    const cs = getComputedStyle(insetProbe), n = (v) => Math.max(0, parseFloat(v) || 0);
    s = { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) };
  } catch (e) { /* no insets */ }
  return { x: s.l, y: s.t, w: Math.max(100, w - s.l - s.r), h: Math.max(100, hh - s.t - s.b) };
}

function resize() {
  const box = visibleBox(), vw = box.w, vh = box.h;
  portrait = vw < vh * 0.95;
  if (portrait) { W = 720; SH = Math.max(1100, Math.min(1600, Math.round(720 * vh / vw))); }
  else { SH = 900; W = Math.max(1360, Math.min(2100, Math.round(900 * vw / vh))); }
  scale = Math.min(vw / W, vh / SH);
  stage.className = (portrait ? 'portrait' : 'landscape') + (V ? '' : ' no-run') + (MODE !== 'normal' ? ' readonly' : '');
  stage.style.width = W + 'px'; stage.style.height = SH + 'px';
  stage.style.left = Math.round(box.x + (vw - W * scale) / 2) + 'px';
  stage.style.top = Math.round(box.y + (vh - SH * scale) / 2) + 'px';
  stage.style.transform = `scale(${scale})`;
  T.lowFx = vw * vh < 500000;
  layout();
  updateBanner();
}

// ------------------------------------------------------------------ geometry (design px)
function geo() {
  if (portrait) {
    const sw = 4 * 100 + 3 * 14, top = 452;
    const cardsTop = top + 100 + 62;
    return { cx: W / 2, slots: { x: W / 2 - sw / 2, y: top, w: sw, h: 100 }, cards: { x: 14, y: cardsTop, w: W - 28, h: SH - cardsTop - 64 },
      shop: { x: 10, y: top + 100 + 58, w: W - 20, h: SH - (top + 100 + 58) - 14 }, hintY: SH - 46, deal: { x: W / 2, y: SH + 160 } };
  }
  const x0 = 416, tw = W - x0 - 16, cx = x0 + tw / 2, sw = 4 * 110 + 3 * 16;
  // (the bottom 64px: the hint line, or the spectator banner / watcher badge)
  return { cx, slots: { x: cx - sw / 2, y: 24, w: sw, h: 110 }, cards: { x: x0 + 10, y: 206, w: tw - 20, h: SH - 206 - 66 },
    shop: { x: x0 + 6, y: 196, w: tw - 12, h: SH - 196 - 72 }, hintY: SH - 44, deal: { x: cx, y: SH + 160 } };
}
/** Where card i of the view sits, and the card size for this level's grid. */
function cardLayout(v) {
  const g = geo();
  let [cols, rows] = v.grid || [4, 3];
  if (portrait && cols > rows) [cols, rows] = [rows, cols];
  const gapR = 0.15, R = 95 / 71;
  const cwW = g.cards.w / (cols + (cols - 1) * gapR);
  const cwH = g.cards.h / (rows * R + (rows - 1) * gapR);
  const cw = Math.floor(Math.min(portrait ? 150 : 158, cwW, cwH)), ch = Math.round(cw * R), gp = cw * gapR;
  const gw = cols * cw + (cols - 1) * gp, gh = rows * ch + (rows - 1) * gp;
  const x0 = g.cards.x + (g.cards.w - gw) / 2 + cw / 2, y0 = g.cards.y + (g.cards.h - gh) / 2 + ch / 2;
  return { cw, ch, cols, rows, pos: (i) => ({ x: x0 + (i % cols) * (cw + gp), y: y0 + Math.floor(i / cols) * (ch + gp) }), box: { x: x0 - cw / 2 - 18, y: y0 - ch / 2 - 18, w: gw + 36, h: gh + 36 } };
}
function setCardSize(cw, ch) {
  if (T.cw === cw && T.ch === ch) return;
  T.cw = cw; T.ch = ch;
  stage.style.setProperty('--cw', cw + 'px'); stage.style.setProperty('--ch', ch + 'px');
}

// ------------------------------------------------------------------ DOM skeleton
function build() {
  stage.innerHTML = '';
  el.hud = h('div', 'hud pp-hud');
  el.hud.innerHTML = `
    <div class="hud-blind pp-lvl"><div class="hb-title"><span class="pp-lname">Level 1</span></div>
      <div class="pp-lbody"><img class="pp-licon" src="${artSrc('pear')}" alt=""><div class="pp-linfo"><div class="hb-req-l">Pairs found</div><div class="pp-pairs">0/3</div><div class="pp-next muted"></div></div></div></div>
    <div class="pp-hearts"><div class="pp-hearts-l"><span>Hearts</span><b class="pp-hv">3</b></div><div class="pp-hrow"></div></div>
    <div class="hud-stats">
      <div class="hs-btns"></div>
      <div class="hs-grid">
        <div class="stat"><div class="stat-l">Berries</div><div class="stat-v money">${ico('berry')}<span class="pp-berries">0</span></div></div>
        <div class="stat"><div class="stat-l">Stars</div><div class="stat-v">${ico('star')}<span class="pp-stars">0</span></div></div>
        <div class="stat"><div class="stat-l">Misses</div><div class="stat-v pp-misses">0</div></div>
        <div class="stat"><div class="stat-l">Level</div><div class="stat-v pp-lv">1<small>/${P.MAX_LEVEL}</small></div></div>
      </div>
    </div>
    <div class="pp-boosts"></div>`;
  const hb = el.hud.querySelector('.hs-btns');
  hb.appendChild(btn('How to<br>play', 'red b-howto', () => howTo()));
  hb.appendChild(btn('Opt&shy;ions', 'orange b-options', () => optionsMenu()));
  stage.appendChild(el.hud);
  el.labels = h('div', 'area-labels');
  el.slotBox = h('div', 'area-box'); el.labels.appendChild(el.slotBox);
  el.cardBox = h('div', 'area-box'); el.labels.appendChild(el.cardBox);
  el.charmLbl = h('div', 'area-lbl pp-charmlbl', 'Charms'); el.labels.appendChild(el.charmLbl);
  stage.appendChild(el.labels);
  el.slots = h('div', 'pp-slots');
  for (let i = 0; i < 4; i++) { const s = h('div', 'pp-slot', 'Empty'); s.dataset.i = i; el.slots.appendChild(s); }
  stage.appendChild(el.slots);
  wireSlots();
  el.hint = h('div', 'pp-hint'); stage.appendChild(el.hint);
  el.cards = h('div', 'cards-layer'); stage.appendChild(el.cards);
  el.clear = h('div', 'overlay pp-clear'); stage.appendChild(el.clear);
  el.shop = h('div', 'overlay pp-shop'); stage.appendChild(el.shop);
  el.pop = h('div', 'pop-layer'); stage.appendChild(el.pop);
  el.attn = h('div', 'attention'); stage.appendChild(el.attn);
  el.toast = h('div', 'toast'); stage.appendChild(el.toast);
  el.tip = h('div', 'tip'); el.tip.style.display = 'none'; stage.appendChild(el.tip);
  el.banner = h('div', 'banner pp-banner'); el.banner.style.display = 'none'; stage.appendChild(el.banner);
  el.ghost = h('img', 'pp-ghost'); el.ghost.alt = ''; el.ghost.style.display = 'none'; stage.appendChild(el.ghost);
  el.modals = h('div', 'modal-layer'); stage.appendChild(el.modals);
}

function place(e, r) { e.style.left = r.x + 'px'; e.style.top = r.y + 'px'; if (r.w != null) e.style.width = r.w + 'px'; if (r.h != null) e.style.height = r.h + 'px'; }
function layout() {
  if (!el.hud) return;
  const g = geo();
  place(el.slots, { x: g.slots.x, y: g.slots.y });
  place(el.slotBox, { x: g.slots.x - 14, y: g.slots.y - 12, w: g.slots.w + 28, h: g.slots.h + 24 });
  el.charmLbl.style.left = g.cx + 'px'; el.charmLbl.style.top = (g.slots.y + g.slots.h + 18) + 'px';
  el.hint.style.left = g.cx + 'px'; el.hint.style.top = g.hintY + 'px';
  place(el.shop, g.shop);
  stage.style.setProperty('--tcx', g.cx + 'px');
  const cw = 660;
  el.clear.style.left = (g.cx - cw / 2) + 'px'; el.clear.style.top = (portrait ? g.cards.y + 40 : 250) + 'px';
  if (V) { const L = cardLayout(V); setCardSize(L.cw, L.ch); place(el.cardBox, L.box); placeCards(true); }
}

// ------------------------------------------------------------------ cards
function spawn(c, x, y, faceUp) {
  const s = new FruitCard(c.id, faceUp ? cardData(c) : { facing: 'back', center: 'pp:back' }, T);
  s.place(x, y);
  s.card = c;
  attach(s);
  el.cards.appendChild(s.el);
  sprites.set(c.id, s);
  return s;
}
function placeCards(instant) {
  const L = cardLayout(V);
  V.cards.forEach((c, i) => {
    const s = sprites.get(c.id);
    if (!s || s.dealAt) return;
    const p = L.pos(i);
    s.tgt.x = p.x; s.tgt.y = p.y;
    if (instant) { s.T.x = p.x; s.T.y = p.y; }
  });
}
/** Bring the table to view v: new cards are dealt in, flips turn, matched cards dissolve away. */
function syncCards(prev, v, instant) {
  const L = cardLayout(v);
  setCardSize(L.cw, L.ch);
  place(el.cardBox, L.box);
  el.cardBox.style.display = v.phase === 'play' || v.phase === 'clear' ? '' : 'none';
  const ids = new Set(v.cards.map((c) => c.id));
  for (const [id, s] of [...sprites]) if (!ids.has(id)) { sprites.delete(id); retire(s, instant ? 'now' : 'fade', 0); }
  let k = 0, stagger = 0;
  v.cards.forEach((c, i) => {
    const p = L.pos(i);
    let s = sprites.get(c.id);
    if (c.m) {
      if (gone.has(c.id)) return;
      gone.add(c.id);
      if (!s) { if (instant) return; s = spawn(c, p.x, p.y, false); }
      sprites.delete(c.id);
      const d = cardData(c);
      if (s.dealAt) { s.dealAt = 0; dealQueue = Math.max(0, dealQueue - 1); s.tgt.x = p.x; s.tgt.y = p.y; }
      if (s.d.facing !== 'front') s.startFlip(d); else s.updateData(d);
      s.juiceUp(0.35);
      retire(s, instant ? 'now' : 'fade', 520 + 45 * stagger++);
      return;
    }
    if (!s) {
      if (instant) s = spawn(c, p.x, p.y, true);
      else {
        s = spawn(c, v.phase === 'play' ? geo().deal.x : p.x, v.phase === 'play' ? geo().deal.y : p.y, false);
        s.dealAt = T.now + 0.05 * k++;
        dealQueue++;
      }
    } else {
      const d = cardData(c);
      if (!s.dealAt) {
        if (s.d.facing !== d.facing) s.startFlip(d);
        else if (s.d.center !== d.center) s.updateData(d);
        s.tgt.x = p.x; s.tgt.y = p.y;
        if (instant) { s.T.x = p.x; s.T.y = p.y; }
      }
    }
    s.card = c; s.idx = i;
  });
}
/** A card leaves the table: dissolve (Micatro's shader) after `delay` ms, or at once. */
function retire(s, how, delay) {
  s.leaving = true; leaving.add(s);
  s.hover = false;
  s.el.style.pointerEvents = 'none';
  if (tipFor === s) hideTip();
  const done = () => { s.destroy(); leaving.delete(s); };
  if (how === 'now') { done(); return; }
  setTimeout(() => {
    s.baseZ = 40;
    s.startDissolve(0.7, done);
    setTimeout(() => { if (leaving.has(s)) done(); }, 1200);
  }, delay || 0);
}
function attach(s) {
  const e = s.el;
  let press = null;
  e.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse' && !s.leaving) { s.hover = true; if (s.card && s.card.up) showCardTip(s); } });
  e.addEventListener('pointerleave', () => { s.hover = false; s.tilt.tx = s.tilt.ty = 0; if (tipFor === s) hideTip(); });
  e.addEventListener('pointermove', (ev) => {
    if (!s.hover) return;
    const r = e.getBoundingClientRect();
    s.tilt.ty = ((ev.clientX - r.left) / r.width - 0.5) * 22;
    s.tilt.tx = -((ev.clientY - r.top) / r.height - 0.5) * 22;
  });
  e.addEventListener('pointerdown', (ev) => {
    press = { t: performance.now(), long: false };
    if (ev.pointerType !== 'mouse') press.timer = setTimeout(() => { if (press && s.card && s.card.up) { press.long = true; s.hover = true; showCardTip(s); } }, 420);
  });
  const end = () => { if (press && press.timer) clearTimeout(press.timer); };
  e.addEventListener('pointercancel', () => { end(); press = null; });
  e.addEventListener('pointerup', (ev) => {
    end();
    const p = press; press = null;
    if (!p) return;
    if (p.long) { setTimeout(() => { s.hover = false; if (tipFor === s) hideTip(); }, 1600); return; }
    if (ev.pointerType !== 'mouse') hideTip();
    clickCard(s);
  });
}
function clickCard(s) {
  if (MODE !== 'normal' || !V || s.leaving || !s.card) return;
  act('reveal', s.card.id);
}

// ------------------------------------------------------------------ tooltips (Micatro's tip panel)
let tipFor = null;
function condLines(conds) {
  return (conds || []).filter((k) => P.COND_INFO[k]).map((k) => `<div class="pp-tipcond">${ico(P.COND_INFO[k].icon, '')}<span><b>${P.COND_INFO[k].name}:</b> ${esc(P.COND_INFO[k].desc)}</span></div>`).join('');
}
function showTipAt(html, x, y, w, hgt) {
  el.tip.innerHTML = html;
  el.tip.style.display = 'flex';
  const tw = el.tip.offsetWidth || 300, th = el.tip.offsetHeight || 160;
  let tx = x + w / 2 + 14, ty = y - th / 2;
  if (tx + tw > W - 10) tx = x - w / 2 - 14 - tw;
  if (portrait) { tx = Math.max(10, Math.min(W - tw - 10, x - tw / 2)); ty = y - hgt / 2 - th - 24; if (ty < 100) ty = y + hgt / 2 + 24; }
  el.tip.style.transform = `translate(${Math.round(tx)}px, ${Math.round(Math.max(10, Math.min(SH - th - 10, ty)))}px)`;
}
function showCardTip(s) {
  const c = s.card;
  if (!c || !c.fruit) return;
  tipFor = s;
  const body = (c.conds && c.conds.length ? condLines(c.conds) : '<div>No conditions</div>');
  showTipAt(`<div class="tip-main"><div class="tip-name pc"><span class="tip-pc">${esc(P.cap(c.fruit))}</span></div><div class="tip-body">${body}</div></div>`, s.tgt.x, s.tgt.y, T.cw, T.ch);
}
function showCharmTip(i, ch) {
  const def = P.CHARMS[ch.id];
  if (!def) return;
  tipFor = 'slot' + i;
  const r = slotCenter(i);
  showTipAt(`<div class="tip-main"><div class="tip-name">${esc(def.name)}</div><div class="tip-body">${esc(def.desc)}<div class="tip-gap"></div><span class="money">Sell value: ${ch.sell} berries</span></div></div>` + infoBoxes(def.desc), r.x, r.y, 110, 110);
}
// Micatro's side boxes (its info_queue): every condition a text NAMES gets its own explanation beside the tip, so
// "grant Juicy to a random fruit" or "4 Tart Kiwi cards" reads on its own. A text that only says "condition" gets
// one box saying what a condition is. (At most two boxes: the tip must fit the table.)
const COND_PRIMER = 'A mark on every card of one fruit. It changes what matching that pair does. Look closely at a face-up card to read its conditions.';
function infoBox(name, icon, desc) {
  return `<div class="tip-info"><div class="ti-name">${icon ? ico(icon, '') + ' ' : ''}${esc(name)}</div><div class="tip-body">${esc(desc)}</div></div>`;
}
function infoBoxes(text, skip) {
  const named = P.COND_ORDER.filter((k) => k !== skip && new RegExp('\\b' + P.COND_INFO[k].name + '\\b').test(text || '')).slice(0, 2);
  if (named.length) return named.map((k) => infoBox(P.COND_INFO[k].name, P.COND_INFO[k].icon, P.COND_INFO[k].desc)).join('');
  return /\bconditions?\b/i.test(text || '') ? infoBox('Conditions', '', COND_PRIMER) : '';
}
// a tip beside any element of the table (a shop offer, a deck-boost chip): its rect, in design px
function showTipAtEl(html, e) {
  const r = e.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  showTipAt(html, (r.left + r.width / 2 - sr.left) / scale, (r.top + r.height / 2 - sr.top) / scale, r.width / scale, r.height / scale);
}
// a shop offer, read closely (hover; tap the tile; the pad's ring on its Buy button)
function showOfferTip(i) {
  const o = V && V.offers && V.offers[i], tile = el.shop.querySelector('.pp-offer[data-i="' + i + '"]');
  if (!o || !tile || o.kind === 'sell') return;
  tipFor = 'offer' + i;
  const cost = '<div class="tip-gap"></div><span class="money">Costs ' + o.cost + ' berries</span>';
  if (o.kind === 'charm') {
    const d = P.CHARMS[o.id];
    if (!d) return hideTip();
    showTipAtEl('<div class="tip-main"><div class="tip-name">' + esc(d.name) + '</div><div class="tip-body">' + esc(d.desc) + cost + '</div></div>' + infoBoxes(d.desc), tile);
  } else {
    const c = P.COND_INFO[o.cond];
    if (!c) return hideTip();
    const fruit = esc(P.cap(o.fruit));
    showTipAtEl('<div class="tip-main"><div class="tip-name">' + esc(c.name) + ' ' + fruit + '</div><div class="tip-body">' + condLines([o.cond])
      + '<div class="tip-gap"></div>Every ' + fruit + ' in your deck gets it, for the rest of the run.' + cost + '</div></div>' + infoBox('Conditions', '', COND_PRIMER), tile);
  }
}
// a deck boost (a condition the whole deck carries for one fruit): what it does
function showBoostTip(chip) {
  const c = P.COND_INFO[chip.dataset.c];
  if (!c) return;
  tipFor = 'boost' + chip.dataset.f + '|' + chip.dataset.c;
  const n = +chip.dataset.n || 1, fruit = esc(P.cap(chip.dataset.f));
  showTipAtEl('<div class="tip-main"><div class="tip-name">' + esc(c.name) + ' ' + fruit + (n > 1 ? ' ×' + n : '') + '</div><div class="tip-body">' + condLines([chip.dataset.c])
    + '<div class="tip-gap"></div>Every ' + fruit + ' in your deck has it.' + (n > 1 ? ' A second copy adds nothing.' : '') + '</div></div>', chip);
}
const tipIs = (prefix) => typeof tipFor === 'string' && tipFor.startsWith(prefix);
function hideTip() { tipFor = null; el.tip.style.display = 'none'; }

// ------------------------------------------------------------------ charm slots (drag, or pick + drop)
function slotCenter(i) { const g = geo(), sw = portrait ? 100 : 110, gp = portrait ? 14 : 16; return { x: g.slots.x + i * (sw + gp) + sw / 2, y: g.slots.y + sw / 2 }; }
const inShopPhase = () => !!V && V.phase === 'shop';
let drag = null;   // {pointerId, x0, y0, moved}
function toStage(ev) { const r = stage.getBoundingClientRect(); return { x: (ev.clientX - r.left) / scale, y: (ev.clientY - r.top) / scale }; }
function dropTargetAt(ev) {
  const hit = document.elementsFromPoint(ev.clientX, ev.clientY);
  for (const e of hit) {
    const sl = e.closest && e.closest('.pp-slot'); if (sl) return { slot: +sl.dataset.i };
    const sell = e.closest && e.closest('.pp-sell'); if (sell) return { sell: true };
  }
  return null;
}
function wireSlots() {
  for (const s of el.slots.children) {
    const i = +s.dataset.i;
    s.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse' && V && V.charms[i] && !drag) showCharmTip(i, V.charms[i]); });
    s.addEventListener('pointerleave', () => { if (tipFor === 'slot' + i) hideTip(); });
    s.addEventListener('pointerdown', (ev) => {
      if (!V) return;
      if (MODE !== 'normal' || !inShopPhase()) {   // outside the shop a charm is just read (tap: its tooltip)
        if (V.charms[i]) { if (tipFor === 'slot' + i) hideTip(); else showCharmTip(i, V.charms[i]); }
        return;
      }
      ev.preventDefault();
      hideTip();
      if (V.held) { act('drop', i); return; }          // a picked-up charm lands here (swapping)
      if (!V.charms[i]) return;
      if (act('pick', i)) { drag = { pointerId: ev.pointerId, x0: ev.clientX, y0: ev.clientY, moved: false }; moveGhost(ev); }
    });
  }
  addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    if (Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) > 8) drag.moved = true;
    moveGhost(ev);
    const t = dropTargetAt(ev);
    for (const s of el.slots.children) s.classList.toggle('target', !!t && t.slot === +s.dataset.i);
    const sell = el.shop.querySelector('.pp-sell'); if (sell) sell.classList.toggle('target', !!t && !!t.sell);
  });
  const up = (ev) => {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const d = drag; drag = null;
    for (const s of el.slots.children) s.classList.remove('target');
    const sell = el.shop.querySelector('.pp-sell'); if (sell) sell.classList.remove('target');
    if (!d.moved) { renderGhost(); return; }   // a click: the charm stays picked up (tap a slot or Sell next)
    const t = ev.type === 'pointercancel' ? null : dropTargetAt(ev);
    if (t && t.sell) act('sell');
    else act('drop', t ? t.slot : -1);
  };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  // a press anywhere else while a charm is picked up puts it back
  stage.addEventListener('pointerdown', (ev) => {
    if (MODE !== 'normal' || !V || !V.held || drag) return;
    if (ev.target.closest('.pp-slot, .pp-sell, .modal-layer, .b-sell')) return;
    act('drop', -1);
  }, true);
}
function moveGhost(ev) {
  if (!V || !V.held) return;
  const p = toStage(ev);
  el.ghost.src = artSrc(V.held.id);
  el.ghost.style.display = '';
  el.ghost.style.left = p.x + 'px'; el.ghost.style.top = p.y + 'px';
}
function renderGhost() {
  if (!V || !V.held) { el.ghost.style.display = 'none'; return; }
  if (drag && drag.moved) return;   // following the pointer
  const c = slotCenter(V.held.origin);
  el.ghost.src = artSrc(V.held.id);
  el.ghost.style.display = '';
  el.ghost.style.left = c.x + 'px'; el.ghost.style.top = (c.y - 12) + 'px';
}
function renderCharms(v) {
  const shop = v.phase === 'shop';
  let n = 0;
  for (const s of el.slots.children) {
    const i = +s.dataset.i, ch = v.charms[i];
    const k = (ch ? ch.id + ':' + ch.sell : '') + (v.held && v.held.origin === i ? ':held' : '');
    s.classList.toggle('full', !!ch);
    s.classList.toggle('holding', !!v.held && !ch);
    if (s.dataset.k === k) continue;
    s.dataset.k = k;
    if (ch) { n++; s.innerHTML = `<img src="${artSrc(ch.id)}" alt="${esc(P.CHARMS[ch.id] ? P.CHARMS[ch.id].name : ch.id)}">` + (shop ? `<span class="pp-sv">${ch.sell}</span>` : ''); }
    else s.textContent = v.held && v.held.origin === i ? '' : 'Empty';
  }
  n = v.charms.filter(Boolean).length + (v.held ? 1 : 0);
  el.charmLbl.textContent = 'Charms ' + n + '/4' + (shop && MODE === 'normal' ? (v.held ? ' · drop it on a slot or Sell' : ' · drag one to Sell') : '');
  for (const s of el.slots.children) { const i = +s.dataset.i; const sv = s.querySelector('.pp-sv'); if (sv && !shop) sv.remove(); if (!sv && shop && v.charms[i]) s.insertAdjacentHTML('beforeend', `<span class="pp-sv">${v.charms[i].sell}</span>`); }
  renderGhost();
}

// ------------------------------------------------------------------ HUD
function renderHud(v, prev, instant) {
  const q = (s) => el.hud.querySelector(s);
  q('.pp-lname').textContent = 'Level ' + v.level;
  q('.pp-pairs').textContent = v.pairs + '/' + v.pairsTotal;
  q('.pp-next').textContent = v.level >= v.maxLevel ? 'The last level!' : v.next ? 'Next level adds ' + v.next : '';
  q('.pp-hv').textContent = heartsText(v.hearts) + ' / ' + v.maxHearts;
  const full = Math.floor(v.hearts + 1e-9), half = v.hearts - full >= 0.5 - 1e-9;
  const slots = Math.max(5, Math.ceil((full + (half ? 1 : 0)) / 5) * 5);
  const hk = full + ':' + half + ':' + slots;
  const row = q('.pp-hrow');
  if (row.dataset.k !== hk) {
    row.dataset.k = hk;
    let html = '';
    for (let i = 0; i < slots; i++) {
      if (i < full) html += `<div class="pp-heart">${ico('heart', '')}</div>`;
      else if (i === full && half) html += `<div class="pp-heart half empty">${ico('heart', '')}<div class="pp-hfill">${ico('heart', '')}</div></div>`;
      else html += `<div class="pp-heart empty">${ico('heart', '')}</div>`;
    }
    row.innerHTML = html;
    row.querySelectorAll('.pp-hfill img').forEach((im) => { im.style.filter = 'drop-shadow(0 3px 0 rgba(0,0,0,.35))'; im.style.opacity = '1'; });
  }
  q('.pp-berries').textContent = v.berries;
  q('.pp-stars').textContent = v.stars;
  q('.pp-misses').textContent = v.mismatches;
  q('.pp-lv').innerHTML = v.level + `<small>/${v.maxLevel}</small>`;
  // the deck's stored conditions (bought in the shop, Pineapple, Mango)
  const bk = JSON.stringify(v.deckConds || {});
  const boosts = q('.pp-boosts');
  if (boosts.dataset.k !== bk) {
    boosts.dataset.k = bk;
    const parts = [];
    for (const [fruit, cs] of Object.entries(v.deckConds || {})) for (const [cond, n] of Object.entries(cs)) if (P.COND_INFO[cond]) parts.push(`<span class="pp-bt" data-f="${esc(fruit)}" data-c="${esc(cond)}" data-n="${n}" aria-label="${esc(P.COND_INFO[cond].name + ' ' + P.cap(fruit) + ': ' + P.COND_INFO[cond].desc)}">${ico(fruit, '')}${ico(P.COND_INFO[cond].icon, '')}${n > 1 ? '×' + n : ''}</span>`);
    if (tipIs('boost')) hideTip();
    boosts.innerHTML = parts.length ? '<div class="muted">Deck boosts</div>' + parts.join('') : '';
    boosts.querySelectorAll('.pp-bt').forEach((chip) => {
      const key = 'boost' + chip.dataset.f + '|' + chip.dataset.c;
      chip.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') showBoostTip(chip); });
      chip.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse' && tipFor === key) hideTip(); });
      chip.addEventListener('pointerup', (ev) => { if (ev.pointerType !== 'mouse') { if (tipFor === key) hideTip(); else showBoostTip(chip); } });
    });
  }
  if (!instant && prev && prev.level === v.level) {
    if (v.hearts !== prev.hearts) { const b = q('.pp-hearts'); floatAt(b, (v.hearts > prev.hearts ? '+' : '') + heartsText(v.hearts - prev.hearts) + ' ♥', v.hearts > prev.hearts ? '' : 'red'); bumpEl(b); }
  }
  if (!instant && prev && v.berries !== prev.berries) bumpEl(q('.pp-berries').parentNode);
  if (!instant && prev && v.level !== prev.level) bumpEl(q('.pp-lvl'));
}
function bumpEl(e) { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }

function renderHint(v) {
  let t = '';
  if (v.phase === 'play') t = v.busy ? '' : v.pairs === 0 && v.mismatches === 0 ? 'Flip two cards to find a pair — matching the Pears wins the level' : '';
  if (MODE === 'spectate' && v.phase === 'play') t = '';
  el.hint.textContent = t;
}

// ------------------------------------------------------------------ the "level complete" panel + the shop
function renderClear(v, prev, instant) {
  const on = v.phase === 'clear';
  if (!on) { el.clear.style.display = 'none'; el.clear.innerHTML = ''; el.clear.dataset.k = ''; return; }
  const k = 'c' + v.level + ':' + v.n;
  if (el.clear.dataset.k === k) return;
  el.clear.dataset.k = k;
  const clr = [...(v.fx || [])].reverse().find((f) => f.kind === 'clear');
  const byPear = !!(clr && clr.pear);
  const last = v.level >= v.maxLevel;
  const nf = v.next ? v.next.toLowerCase() : null;
  el.clear.innerHTML = `<div class="pp-cl-box">
    <div class="pp-cl-title">${byPear ? 'A Pair of Pears!' : 'Level ' + v.level + ' Complete!'}</div>
    ${byPear ? `<div class="pp-cl-sub">The Pears win Level ${v.level}</div>` : ''}
    <div class="pp-cl-row"><div class="stat"><div class="stat-l">Hearts</div><div class="stat-v red">${heartsText(v.hearts)}</div></div>
      <div class="stat"><div class="stat-l">Berries</div><div class="stat-v money">${v.berries}</div></div>
      <div class="stat"><div class="stat-l">Pairs found</div><div class="stat-v">${v.pairs}</div></div></div>
    ${last ? '<div class="pp-cl-new">The last level — the harvest is in!</div>' : nf ? `<div class="pp-cl-new">Next level adds 2 ${ico(nf, '')} <b>${esc(v.next)}</b></div>` : ''}</div>`;
  const box = el.clear.firstChild;
  if (MODE === 'normal') box.appendChild(btn(last ? 'Finish Run' : 'To the Shop', 'green big wide b-continue-clear', () => act('continue')));
  else box.appendChild(h('div', 'pp-cl-wait muted', 'Waiting for ' + esc(SPECTATE) + '…'));
  // let the last cards dissolve before the panel rises
  if (!instant && prev && prev.phase === 'play') { el.clear.style.display = 'none'; setTimeout(() => { if (V && V.phase === 'clear') el.clear.style.display = ''; }, 900); }
  else el.clear.style.display = '';
}
function offerHtml(o, i, v) {
  if (!o) return `<div class="pp-offer sold" data-i="${i}"><div class="pp-of-card"></div><div class="pp-of-name">Sold</div><div class="pp-of-desc muted">Bought this level</div></div>`;
  if (o.kind === 'charm') {
    const d = P.CHARMS[o.id];
    return `<div class="pp-offer" data-i="${i}"><div class="pp-of-card">${ico(o.id, '')}</div><div class="pp-of-name">${esc(d.name)}</div><div class="pp-of-desc">${esc(d.desc)}</div></div>`;
  }
  if (o.kind === 'condition') {
    const c = P.COND_INFO[o.cond];
    return `<div class="pp-offer" data-i="${i}"><div class="pp-of-card">${ico(o.fruit, '')}<div class="pp-of-on">${ico(c.icon, '')}</div></div><div class="pp-of-name">${esc(c.name)} ${esc(P.cap(o.fruit))}</div><div class="pp-of-desc">${esc(c.desc)} Every ${esc(P.cap(o.fruit))} in your deck gets it.</div></div>`;
  }
  const held = v.held;
  return `<div class="pp-offer pp-sell" data-i="${i}"><div class="pp-of-name">Sell a Charm</div><div class="pp-sell-big">${held ? '+' + held.sell + ' ' + ico('berry', '') : ico('berry', '')}</div><div class="pp-of-desc">${held ? 'Sell the ' + esc(P.CHARMS[held.id] ? P.CHARMS[held.id].name : held.id) + ' for ' + held.sell + ' berries.' : 'Drag a charm here, or tap one and then Sell, for its sell value.'}</div></div>`;
}
function renderShop(v) {
  const on = v.phase === 'shop';
  el.shop.style.display = on ? '' : 'none';
  if (!on) { if (tipIs('offer')) hideTip(); el.shop.innerHTML = ''; el.shop.dataset.k = ''; el.shop.dataset.lv = ''; return; }
  const k = JSON.stringify([v.offers, v.berries, v.held, v.charms.filter(Boolean).length]);
  if (el.shop.dataset.k === k && el.shop.dataset.lv === String(v.level)) return;
  el.shop.dataset.k = k;
  const last = v.level >= v.maxLevel;
  // the panel rises once per visit (Micatro's risein); a buy / sell only refreshes what is inside it
  if (el.shop.dataset.lv !== String(v.level)) {
    el.shop.dataset.lv = String(v.level);
    el.shop.innerHTML = `<div class="shop-panel"><div class="pp-sh-head"><div class="pp-sh-title">Level Shop</div>
        <div class="pp-sh-wallet"><div class="stat"><div class="stat-l">Berries</div><div class="stat-v money">${ico('berry', '')}<span class="pp-sh-b"></span></div></div></div></div>
      <div class="pp-offers"></div>
      <div class="pp-sh-help">${MODE === 'normal' ? 'Buy charms (4 slots) and conditions for your deck · drag a charm onto Sell for Berries' : esc(SPECTATE) + ' is shopping…'}</div>
      <div class="pp-sh-foot"></div></div>`;
    const foot = el.shop.querySelector('.pp-sh-foot');
    if (MODE === 'normal') foot.appendChild(btn(last ? 'Finish Run' : 'Next Level', 'green big b-nextlevel', () => act('next')));
  }
  el.shop.querySelector('.pp-sh-b').textContent = v.berries;
  const grid = el.shop.querySelector('.pp-offers');
  if (tipIs('offer')) hideTip();
  grid.innerHTML = [0, 1, 2, 3].map((i) => offerHtml(v.offers[i], i, v)).join('');
  grid.querySelectorAll('.pp-offer').forEach((tile) => {
    const i = +tile.dataset.i, o = v.offers[i];
    if (!o) return;
    if (o.kind !== 'sell') {   // read an offer closely: hover it, or tap the tile (not its Buy button)
      tile.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse' && !drag) showOfferTip(i); });
      tile.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse' && tipFor === 'offer' + i) hideTip(); });
      tile.addEventListener('pointerup', (ev) => { if (ev.pointerType !== 'mouse' && !ev.target.closest('.btn')) { if (tipFor === 'offer' + i) hideTip(); else showOfferTip(i); } });
    }
    if (o.kind === 'sell') {
      const b = btn('Sell', 'orange b-sell', () => act('sell'));
      b.disabled = !v.held || MODE !== 'normal';
      tile.appendChild(b);
      tile.addEventListener('pointerup', (ev) => { if (MODE === 'normal' && V && V.held && !drag && !ev.target.closest('.btn')) act('sell'); });
      return;
    }
    const why = MODE === 'normal' ? P.buyRefusal(i) : 'spectating';
    const b = btn(`Buy · ${ico('berry', '')}${o.cost}`, 'blue b-buy', () => act('buy', i));
    b.dataset.i = i;
    // (full charm slots: the button stays live and says why when pressed)
    b.disabled = MODE !== 'normal' || (!!why && why !== 'your charm slots are full');
    tile.appendChild(b);
  });
}

// ------------------------------------------------------------------ popups (micatro.css .attention / .popup / .toast)
function attn(text, colour) {
  const a = el.attn;
  a.textContent = text; a.style.color = colour || '#fff';
  a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
}
function floatAt(target, text, cls) {
  const r = target.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  popAt((r.left + r.width / 2 - sr.left) / scale, (r.top - sr.top) / scale, text, cls);
}
function popAt(x, y, html, cls) {
  const p = h('div', 'popup float ' + (cls || ''), html);
  p.style.left = x + 'px'; p.style.top = y + 'px';
  el.pop.appendChild(p);
  setTimeout(() => p.remove(), 1200);
}
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove('show'); void el.toast.offsetWidth; el.toast.classList.add('show');
}
function cardsMid(ids) {
  const L = V ? cardLayout(V) : null;
  const pts = [];
  for (const id of ids || []) { const i = V ? V.cards.findIndex((c) => c.id === id) : -1; if (i >= 0 && L) pts.push(L.pos(i)); }
  if (!pts.length) return { x: geo().cx, y: SH / 2 };
  return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: Math.min(...pts.map((p) => p.y)) - T.ch / 2 };
}

/** One step of the game happened (pear.js fx): sound, call-outs, popups. */
function playFx(f, v) {
  switch (f.kind) {
    case 'flip': sound.play('card1', 1 + Math.random() * 0.1, 0.7); break;
    case 'flipback': sound.play('cardSlide2', 0.9, 0.6); break;
    case 'match': {
      const m = cardsMid(f.ids);
      if (f.rotten) { popAt(m.x, m.y, 'Rotten!', 'red'); sound.play('crumple1'); break; }
      const bits = [];
      if (f.gain) bits.push('+' + f.gain + ' ' + ico('berry', 'pp-ico'));
      if (f.hearts) bits.push('+' + heartsText(f.hearts) + ' ♥');
      if (f.stars) bits.push('+' + f.stars + ' ★');
      if (bits.length) popAt(m.x, m.y, bits.join(' '), 'money');
      sound.play('chips1', 1 + Math.min(0.6, v.pairs * 0.06));
      break;
    }
    case 'mismatch': {
      const m = cardsMid(f.ids);
      for (const id of f.ids || []) { const s = sprites.get(id); if (s) s.juiceUp(0.25); }
      const bits = [];
      if (f.hearts) bits.push(heartsText(f.hearts) + ' ♥');
      if (f.berries) bits.push((f.berries > 0 ? '+' : '') + f.berries + ' ' + ico('berry', 'pp-ico'));
      if (!bits.length && f.saved) bits.push(P.cap(f.saved) + ' Charm!');
      if (bits.length) popAt(m.x, m.y, bits.join(' '), f.hearts ? 'red' : 'money');
      sound.play('multhit1', 0.8, 0.7);
      break;
    }
    case 'flutter': { const m = cardsMid(f.ids); popAt(m.x, m.y, 'Flutter!', ''); sound.play('whoosh1'); break; }
    case 'clear': attn(f.pear ? 'A Pair of Pears!' : 'Level ' + v.level + ' Complete!', f.pear ? '#eac058' : '#4bc292'); sound.play(f.pear ? 'holo1' : 'win'); if (bg) bg.pulse(0.8); break;
    case 'shop': sound.play('cardFan2'); break;
    case 'level': attn('Level ' + f.level, '#fff'); sound.play('cardFan2'); if (bg) bg.pulse(0.5); break;
    case 'newrun': sound.play('cardFan2'); break;
    case 'buy': sound.play('coin3'); { const w = el.shop.querySelector('.pp-sh-wallet'); if (w) floatAt(w, '-' + (f.cond ? P.CONDITION_COST : (P.CHARMS[f.id] || {}).cost || 0), 'red'); } break;
    case 'sell': sound.play('coin1'); { const w = el.shop.querySelector('.pp-sh-wallet'); if (w) floatAt(w, '+' + f.value, 'money'); } break;
    case 'swap': sound.play('cardSlide1'); break;
    case 'charmgone': toast('The ' + (P.CHARMS[f.id] || {}).name + ' vanished'); sound.play('crumple2'); break;
    case 'persimmon': attn('The Persimmon saves you!', '#fda200'); sound.play('holo1'); break;
    case 'gameover': attn('Out of Hearts!', '#fe5f55'); sound.play('crumpleLong1'); break;
    case 'won': attn('Harvest Complete!', '#eac058'); sound.play('win'); if (bg) bg.pulse(1); break;
    default: break;
  }
}

// ------------------------------------------------------------------ background (Balatro's ease_background_colour)
const PEAR = hex('7aa64f');
function bgFor(v) {
  if (!v) return { new_colour: PEAR, special_colour: BGC.GOLD, tertiary_colour: [0.12, 0.17, 0.12, 1], contrast: 1.4 };
  if (v.phase === 'won') return { new_colour: BGC.GOLD, special_colour: BGC.GREEN, contrast: 2 };
  if (v.phase === 'over') return { new_colour: hex('2a1f24'), special_colour: BGC.RED, contrast: 2.5 };
  if (v.phase === 'clear') return { new_colour: BGC.WON, special_colour: BGC.GOLD, contrast: 1.6 };
  if (v.phase === 'shop') return { new_colour: hex('5a7a3c'), special_colour: BGC.ORANGE, contrast: 1.4 };
  if (v.hearts <= 1) return { new_colour: hex('6b2f33'), special_colour: BGC.RED, contrast: 2 };
  const depth = Math.min(1, (v.level - 1) / 12);
  const mix = (a, b, p) => a.map((x, i) => x * (1 - p) + b[i] * p);
  return { new_colour: mix(BGC.SMALL, hex('3d5a2a'), depth), contrast: 1 + depth * 0.6 };
}

// ------------------------------------------------------------------ render
function render(v, { instant = false } = {}) {
  const prev = V;
  V = v;
  stage.classList.toggle('no-run', !v);
  if (!v) {
    for (const s of [...sprites.values()]) { sprites.delete(s.id); retire(s, 'now'); }
    gone.clear(); hideTip(); el.ghost.style.display = 'none';
    if (bg) bg.set(bgFor(null));
    updateBanner();
    return;
  }
  if (prev && prev.level !== v.level) gone.clear();
  if (instant) gone.clear();
  hideTipIfStale();
  syncCards(prev, v, instant);
  renderHud(v, prev, instant);
  renderCharms(v);
  renderClear(v, prev, instant);
  renderShop(v);
  renderHint(v);
  if (bg) bg.set(bgFor(v));
  const fx = v.fx || [];
  const top = fx.length ? fx[fx.length - 1].seq : 0;
  if (top < shownFx) shownFx = 0;   // (a reloaded run / another run: its fx count restarted)
  if (!instant && prev) for (const f of fx) if (f.seq > shownFx) playFx(f, v);
  shownFx = Math.max(shownFx, top);
  if (v.phase === 'over' || v.phase === 'won') {
    if (!overShown) { overShown = true; setTimeout(() => { if (V && (V.phase === 'over' || V.phase === 'won')) gameOver(V); }, instant ? 0 : 1300); }
  } else overShown = false;
  updateBanner();
  if (pad) pad.refresh();
}
function hideTipIfStale() { if (tipFor && typeof tipFor === 'object' && (!tipFor.card || !tipFor.card.up)) hideTip(); }

// ------------------------------------------------------------------ the runner's actions
function act(kind, arg) {
  if (MODE !== 'normal' || !P.run()) return false;
  let ok = false, why = null;
  if (kind === 'reveal') { why = P.revealRefusal(arg); if (!why) ok = P.reveal(arg); else if (/already|wait/.test(why)) why = null; }
  else if (kind === 'continue') ok = P.continueClear();
  else if (kind === 'next') ok = P.nextLevel();
  else if (kind === 'buy') { why = P.buyRefusal(arg); if (!why) ok = P.buy(arg); }
  else if (kind === 'pick') ok = P.pickCharm(arg);
  else if (kind === 'drop') ok = P.dropCharm(arg);
  else if (kind === 'sell') { ok = P.sellHeld(); if (!ok && inShopPhase()) why = 'pick up a charm to sell first'; }
  if (!ok) { if (why) { toast(upFirst(why)); sound.play('cancel'); } return false; }
  changed();
  return true;
}
/** The run moved: save it (every step: a reload resumes on this frame), draw it, and settle a finished run. */
function changed() {
  const ph = P.phase();
  if (ph === 'over' || ph === 'won') {
    if (!recorded) { recorded = true; SV.recordRun(P.run().level, ph === 'won'); }
    SV.clearRun();
  } else SV.saveRun(P.serialize());
  render(P.view());
  if ((ph === 'over' || ph === 'won') && publisher) { const p = publisher; publisher = null; setTimeout(() => p.finish({ won: ph === 'won' }).catch(() => {}), 1500); }
}
function startRun({ resumed = false } = {}) {
  closeAll();
  recorded = false; overShown = false;
  shownFx = P.view().fx.length ? P.view().fx[P.view().fx.length - 1].seq : 0;
  if (!resumed) SV.saveRun(P.serialize());
  render(P.view(), { instant: resumed });
  if (!resumed) for (const f of P.view().fx) { playFx(f, P.view()); shownFx = Math.max(shownFx, f.seq); }
  startBroadcast();
}
function newRun() {
  for (const s of [...sprites.values()]) { sprites.delete(s.id); retire(s, 'fade', 0); }
  V = null; gone.clear();
  P.startNewRun();
  startRun();
}
function resumeRun() {
  const r = SV.loadRun();
  if (!r || !P.restore(r)) return false;
  const ph = P.phase();
  if (ph === 'over' || ph === 'won') { P.reset(); return false; }
  for (const s of [...sprites.values()]) { sprites.delete(s.id); retire(s, 'now'); }
  V = null; gone.clear();
  startRun({ resumed: true });
  return true;
}

// ------------------------------------------------------------------ live broadcast (signed in)
function startBroadcast() {
  if (MODE !== 'normal' || !net || !net.isLoggedIn()) return;
  if (publisher) publisher.stop();
  publisher = net.startPublisher(() => (P.run() ? P.view() : null), () => P.label());
  publisher.onWatchers((n, names) => { watchers = { n, names }; updateBanner(); });
  if (!chat) chat = net.mountChat(null, { runner: net.myName() });
}
let watchers = { n: 0, names: [] };
let specStatus = '', specMeta = {};
function updateBanner() {
  const b = el.banner;
  if (!b) return;
  if (MODE === 'spectate') {
    b.style.display = '';
    const st = { connecting: 'Connecting…', live: '● Live', 'not-live': 'Not playing right now — waiting…', full: 'Too many watchers — retrying…', over: 'Run over — waiting for the next one…', forbidden: 'Only friends can watch', login: 'Log in to watch friends', offline: 'Offline — retrying…' }[specStatus] || '';
    b.innerHTML = `<span class="watching">Watching <b>${esc(SPECTATE)}</b></span><span class="spec-status">${esc(st)}</span>`
      + (specMeta.watchers ? `<span class="pp-watch">👁 ${specMeta.watchers} watching</span>` : '') + `<a href="/pairofpears/">Play</a>`;
  } else {
    b.style.display = watchers.n && V ? '' : 'none';
    b.innerHTML = watchers.n ? `<span class="pp-watch" title="${esc(watchers.names.join(', '))}">👁 <b>${watchers.n}</b> watching</span>` : '';
  }
  stage.classList.toggle('has-banner', b.style.display !== 'none');
}

// ------------------------------------------------------------------ modals (micatro's .modal / .modal-box)
const mstack = [];
function modal(content, { title, cls = '', noClose = false, onClose } = {}) {
  const wrap = h('div', 'modal ' + cls), box = h('div', 'modal-box');
  if (title) box.appendChild(h('div', 'modal-title', esc(title)));
  box.appendChild(content);
  if (!noClose) box.appendChild(btn('Back', 'orange wide b-back', () => closeModal()));
  wrap.appendChild(box);
  wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap && !noClose) closeModal(); });
  el.modals.appendChild(wrap); el.modals.classList.add('open');
  mstack.push({ el: wrap, onClose });
  hideTip();
  if (pad) pad.refresh(true);
  return wrap;
}
function closeModal() { const m = mstack.pop(); if (m) { m.el.remove(); if (m.onClose) m.onClose(); } el.modals.classList.toggle('open', mstack.length > 0); if (pad) pad.refresh(true); }
function closeAll() { while (mstack.length) closeModal(); }
const topModal = () => (mstack.length ? mstack[mstack.length - 1].el : null);

function mainMenu() {
  closeAll();
  if (publisher) { publisher.stop(); publisher = null; }
  P.reset();
  render(null);
  const m = h('div', 'main-menu pp-menu');
  m.appendChild(h('div', 'logo pp-logo', '<span class="l0">A PAIR OF</span><span class="l1">PEARS</span>'));
  const mid = h('div', 'pp-menu-mid');
  mid.innerHTML = `<div class="pp-menu-pears"><img src="${artSrc('pear')}" alt=""><img src="${artSrc('pear')}" alt=""></div>
    <div class="pp-menu-sub">A memory card game · match the fruit, mind your hearts</div>
    <div class="pp-menu-fruit">${P.FRUITS.filter((f) => f !== 'pear').map((f, i) => `<img src="${artSrc(f)}" style="animation-delay:${-i * 0.25}s" alt="">`).join('')}</div>`;
  const st = SV.stats();
  if (st.runs) mid.appendChild(h('div', 'pp-menu-stats muted', `Best: Level ${st.bestLevel} of ${P.MAX_LEVEL} · ${plural(st.wins, 'harvest')} · ${plural(st.runs, 'run')}`));
  m.appendChild(mid);
  const bar = h('div', 'menu-bar');
  const saved = SV.loadRun();
  let resumable = null;
  if (saved && P.restore(saved)) { const ph = P.phase(); if (ph !== 'over' && ph !== 'won') resumable = P.view(); P.reset(); }
  if (resumable) bar.appendChild(btn(`Continue<small>Level ${resumable.level} · ${heartsText(resumable.hearts)} ♥</small>`, 'orange big b-continue', () => resumeRun()));
  bar.appendChild(btn('New<br>Run', 'blue big b-new', () => (resumable ? confirmNew(resumable) : newRun())));
  bar.appendChild(btn('How to<br>play', 'red big b-howto', () => howTo()));
  bar.appendChild(btn('Opt&shy;ions', 'green big b-options', () => optionsMenu()));
  m.appendChild(bar);
  const foot = h('div', 'menu-foot');
  const back = h('a', 'back-link', HOME.text); back.href = HOME.href; foot.appendChild(back);
  if (!(net && net.isLoggedIn())) { const a = h('a', 'login-link', 'Log in to let friends watch you play'); a.href = '/login/?next=' + encodeURIComponent('/pairofpears/' + location.search); foot.appendChild(a); }
  m.appendChild(foot);
  modal(m, { cls: 'menu-modal', noClose: true });
  if (bg) bg.set(bgFor(null));
}
function confirmNew(r) {
  const b = h('div', 'pause');
  b.appendChild(h('p', 'pp-confirm', `Abandon your run (Level ${r.level}) and start a new one?`));
  b.appendChild(btn('Abandon &amp; start over', 'red wide b-confirm', () => { if (P.run() || P.restore(SV.loadRun())) { recorded = false; SV.recordRun(P.run().level, false); } newRun(); }));
  modal(b, { title: 'New run', cls: 'pp-modal' });
}

function howTo() {
  const b = h('div', 'pp-howto');
  b.innerHTML = `
  <p>Every level deals a grid of face-down fruit cards, two of each fruit. Flip two at a time: a <span class="green">pair</span> stays matched and pays
  ${ico('berry')} <b>Berries</b>; a <span class="red">mismatch</span> costs ½ ${ico('heart')} and the cards turn back. Run out of Hearts and the run is over.</p>
  <ul>
  <li>The two <b>Pears</b> ${ico('pear')} are special: matching them wins the level on the spot.</li>
  <li>Clearing a level heals 2 ${ico('heart')} (up to ${P.MAX_HEARTS}). Each level adds a new fruit — ${P.MAX_LEVEL} levels make the harvest.</li>
  <li>After each level the <b>Level Shop</b> sells <b>charms</b> (4 slots, they change the rules in your favour) and <b>conditions</b>
  that stick to a fruit in your deck. Drag a charm onto <b>Sell</b> to get Berries back.</li>
  </ul>
  <div class="pp-conds">${P.COND_ORDER.map((k) => `<div>${ico(P.COND_INFO[k].icon)}<span><b>${P.COND_INFO[k].name}</b> — ${esc(P.COND_INFO[k].desc)}</span></div>`).join('')}</div>
  <p class="muted">Keys: arrows / WASD move · Z (or Enter / Space) picks a card, charm or button · X or Esc backs out · C sells the charm you hold · V (or N) continues / next level · O options. Controllers and touch work too (long-press a card or charm for its details).</p>`;
  modal(b, { title: 'How to play', cls: 'pp-modal' });
}

function optionsMenu() {
  const b = h('div', 'pause');
  const sfx = btn('Sound: ' + (sound.sfx ? 'on' : 'off'), 'blue wide b-sfx', () => { sound.setSfx(!sound.sfx); sfx.textContent = 'Sound: ' + (sound.sfx ? 'on' : 'off'); });
  const mus = btn('Music: ' + (sound.music ? 'on' : 'off'), 'blue wide b-music', () => { sound.setMusic(!sound.music); mus.textContent = 'Music: ' + (sound.music ? 'on' : 'off'); });
  b.appendChild(sfx); b.appendChild(mus);
  b.appendChild(btn('How to play', 'red wide', () => howTo()));
  if (MODE === 'normal' && P.run()) {
    b.appendChild(btn('New run', 'orange wide b-restart', () => confirmNew(P.view())));
    b.appendChild(btn('Main menu', 'grey wide b-mainmenu', () => mainMenu()));
  }
  modal(b, { title: 'Options', cls: 'pp-modal' });
}

function gameOver(v) {
  if (topModal() && topModal().classList.contains('pp-over-modal')) return;
  const won = v.phase === 'won';
  const b = h('div', 'pp-over');
  b.innerHTML = `<div class="pp-over-t ${won ? 'money' : 'red'}">${won ? 'HARVEST COMPLETE!' : 'OUT OF HEARTS'}</div>
    <div class="pp-over-s">${won ? 'Every level cleared — the orchard is yours.' : 'The run ends on Level ' + v.level + '.'}</div>
    <div class="pp-over-grid">
      <div class="stat"><div class="stat-l">Level</div><div class="stat-v">${v.level}<small>/${v.maxLevel}</small></div></div>
      <div class="stat"><div class="stat-l">Berries</div><div class="stat-v money">${v.berries}</div></div>
      <div class="stat"><div class="stat-l">Stars</div><div class="stat-v">${v.stars}</div></div>
      <div class="stat"><div class="stat-l">Charms</div><div class="stat-v">${v.charms.filter(Boolean).length}</div></div>
    </div>`;
  const acts = h('div', 'pp-over-acts');
  if (MODE === 'normal') {
    acts.appendChild(btn('New Run', 'blue big b-again', () => newRun()));
    acts.appendChild(btn('Main menu', 'grey big b-tomenu', () => mainMenu()));
  } else acts.appendChild(btn('Play Pair of Pears', 'blue big b-play', () => { location.href = '/pairofpears/'; }));
  b.appendChild(acts);
  modal(b, { cls: 'pp-modal pp-over-modal', noClose: MODE === 'normal' });
}

// ------------------------------------------------------------------ spectating
let spec = null;
function startSpectating() {
  stage.classList.add('readonly');
  updateBanner();
  if (!net) { specStatus = 'offline'; updateBanner(); return; }
  let first = true;
  const go = () => {
    spec = net.startSpectate(SPECTATE, {
      onSnapshot: (snap, meta) => {
        specMeta = meta || {};
        if (!snap || snap.game !== 'pears' || !Array.isArray(snap.cards)) return;
        const fresh = first || !V || (snap.level !== V.level && Math.abs(snap.n - V.n) > 40) || snap.n < V.n;
        if (fresh && topModal()) closeAll();
        render(snap, { instant: fresh });
        first = false;
      },
      onStatus: (st, info) => {
        specStatus = st; if (info && info.watchers != null) specMeta = { ...specMeta, ...info };
        updateBanner();
        // a finished run: keep checking for the friend's next one
        if (st === 'over') setTimeout(() => { if (spec) spec.stop(); first = true; go(); }, 5000);
      },
    });
  };
  go();
  if (net.isLoggedIn()) chat = net.mountChat(null, { runner: SPECTATE, spectator: true });
}

// ------------------------------------------------------------------ keyboard + controller (site/gamepad.js) + focus reticle
function makePad() {
  const ret = h('div', 'pad-reticle'); ret.style.display = 'none'; ret.style.position = 'fixed';
  document.body.appendChild(ret);
  const hints = h('div'); hints.id = 'pad-hints'; hints.style.display = 'none'; document.body.appendChild(hints);
  let focus = null, ringOn = false, kind = 'generic';
  const shown = (e) => { const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && !e.disabled; };
  function stops() {
    const m = topModal();
    if (m) return [...m.querySelectorAll('.btn, a')].filter(shown);
    const out = [];
    if (V && MODE === 'normal' && V.phase === 'play') for (const c of V.cards) { const s = sprites.get(c.id); if (s && !s.leaving && !c.up && !c.m) out.push(s.el); }
    if (V && MODE === 'normal' && V.phase === 'shop') for (const s of el.slots.children) if (V.charms[+s.dataset.i] || V.held) out.push(s);
    for (const e of stage.querySelectorAll('.btn')) if (!e.closest('.modal-layer') && shown(e)) out.push(e);
    return out;
  }
  const center = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  function home(list) {
    const m = topModal();
    if (m) return list.find((e) => e.matches('.b-continue, .b-again, .b-new, .blue')) || list[0];
    if (V && V.phase === 'clear') return stage.querySelector('.b-continue-clear') || list[0];
    if (V && V.phase === 'shop') return list.find((e) => e.matches('.b-buy:not(:disabled)')) || stage.querySelector('.b-nextlevel') || list[0];
    return list.find((e) => e.classList.contains('card')) || list[0];
  }
  function setFocus(e) {
    if (focus && focus.classList.contains('card')) { const s = sprites.get(+focus.dataset.id); if (s) { s.hover = false; if (tipFor === s) hideTip(); } }
    if (focus && focus.classList.contains('pp-slot') && tipFor === 'slot' + focus.dataset.i) hideTip();
    if (focus && focus.classList.contains('b-buy') && tipFor === 'offer' + focus.dataset.i) hideTip();
    focus = e || null;
    if (focus && focus.classList.contains('card')) { const s = sprites.get(+focus.dataset.id); if (s) s.hover = true; }
    if (focus && focus.classList.contains('pp-slot') && V && V.charms[+focus.dataset.i]) showCharmTip(+focus.dataset.i, V.charms[+focus.dataset.i]);
    if (focus && focus.classList.contains('b-buy') && ringOn) showOfferTip(+focus.dataset.i);   // (only while the ring is steering: a mouse / touch player isn't shown a tip unasked)
    draw();
  }
  function draw() {
    if (!ringOn || !focus || !focus.isConnected) { ret.style.display = 'none'; return; }
    const r = focus.getBoundingClientRect();
    Object.assign(ret.style, { display: '', left: (r.left - 6) + 'px', top: (r.top - 6) + 'px', width: (r.width + 12) + 'px', height: (r.height + 12) + 'px' });
    ret.classList.toggle('holding', !!(V && V.held));
  }
  function ensure(reset) {
    const list = stops();
    if (reset || !focus || !list.includes(focus)) setFocus(home(list));
    else draw();
  }
  function move(dir) {
    ringOn = true;
    const list = stops();
    if (!focus || !list.includes(focus)) { setFocus(home(list)); return; }
    const a = center(focus);
    let best = null, bd = Infinity;
    for (const e of list) {
      if (e === focus) continue;
      const b = center(e), dx = b.x - a.x, dy = b.y - a.y;
      const main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (main <= 4) continue;
      const d = main + side * 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) { setFocus(best); sound.play('cardSlide2', 1.2, 0.5); }
  }
  // the focus is on a live stop and the player can see it (the ring is showing)
  const seen = () => ringOn && focus && focus.isConnected && stops().includes(focus);
  function confirm() {
    // the first press (or after the mouse) only shows where the focus is
    if (!seen()) { ringOn = true; ensure(true); return; }
    if (focus.classList.contains('card')) { const s = sprites.get(+focus.dataset.id); if (s) clickCard(s); requestAnimationFrame(() => ensure()); }
    else if (focus.classList.contains('pp-slot')) { const i = +focus.dataset.i; if (V && V.held) act('drop', i); else if (V && V.charms[i]) act('pick', i); }
    else focus.click();
  }
  function cancel() {
    if (topModal()) { if (topModal().querySelector('.b-back')) closeModal(); return; }
    if (V && V.held) act('drop', -1);
  }
  function context() {
    if (topModal() || MODE !== 'normal' || !V) return;
    if (V.phase === 'clear') act('continue');
    else if (V.phase === 'shop') act('next');
  }
  // C / the X button: sell the charm you are holding (the shop's Sell)
  function secondary() {
    if (topModal() || MODE !== 'normal' || !V || V.phase !== 'shop') return;
    if (V.held) act('sell'); else toast('Pick up a charm to sell first');
  }
  // Start opens Options. Enter (a DOM game: Enter stays "pick") picks what the ring shows;
  // with no ring it opens Options too.
  function menu(source) {
    if (source === 'key' && (topModal() || seen())) { confirm(); return; }
    if (!topModal()) optionsMenu();
  }
  let src = 'pad';
  const lbl = (a) => (src === 'key' ? keyLabel(a) : buttonLabel(a, kind));
  const showHints = () => {
    hints.style.display = '';
    const k = (a) => `<span class="pk">${esc(lbl(a))}</span>`;
    const shop = V && V.phase === 'shop' && !topModal();
    hints.innerHTML = `${k('confirm')}Select<span class="sep"></span>${k('cancel')}Back<span class="sep"></span>` +
      `${shop ? k('secondary') + 'Sell<span class="sep"></span>' : ''}${k('context')}Continue<span class="sep"></span>${src === 'key' ? '<span class="pk">O</span>' : k('menu')}Options`;
  };
  // one handler for the keyboard (site/input.js: arrows / WASD, Z X C V, Enter) and a controller
  const onAction = (a, info) => {
    src = info.source === 'key' ? 'key' : 'pad';
    if (['up', 'down', 'left', 'right'].includes(a)) { move(a); showHints(); return true; }
    if (a === 'confirm') confirm();
    else if (a === 'cancel') cancel();
    else if (a === 'secondary') secondary();
    else if (a === 'context') context();
    else if (a === 'menu') {
      // a controller's Start acts on its RELEASE, and only alone: Start + Select together
      // open the Games switcher (site/switcher.js), and Options must not open under it
      if (src === 'pad') { startAlone = !(inp && inp.held('select')); return true; }
      menu(src);
    } else if (a === 'select') { startAlone = false; return true; }
    else return false;
    showHints();
    return true;
  };
  let startAlone = false, inp = null;
  const onRelease = (a, info) => {
    if (a !== 'menu' || info.source !== 'pad') return;
    const go = startAlone && !info.forced; startAlone = false;
    if (go) { src = 'pad'; menu('pad'); showHints(); }
  };
  try {
    inp = window.__pearsInput = startInput({
      onAction,
      onRelease,
      pad: true,
      padOptions: { onConnect: (info) => { kind = (info && info.kind) || 'generic'; } },
    });
  } catch (e) { /* no input support */ }
  // the keys the scheme leaves to the game: Esc (a quick tap; a held Esc opens the Games
  // switcher), Space pick, N continue, O options
  addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || isTyping(ev.target && ev.target.tagName ? ev.target : undefined)) return;
    const k = ev.key;
    if (k === 'Escape') { cancel(); return; }
    if (k === ' ') { ev.preventDefault(); src = 'key'; confirm(); showHints(); return; }
    if (k === 'n' || k === 'N') { context(); return; }
    if ((k === 'o' || k === 'O') && !topModal()) optionsMenu();
  });
  addEventListener('pointerdown', () => { ringOn = false; draw(); hints.style.display = 'none'; }, true);
  addEventListener('resize', () => draw());
  let lastScreen = null;
  return { refresh(reset) { const scr = (V && V.phase) || null; if (scr !== lastScreen) { lastScreen = scr; reset = true; } if (ringOn) requestAnimationFrame(() => { ensure(reset); if (hints.style.display !== 'none') showHints(); }); }, draw, get focus() { return focus; }, get ringOn() { return ringOn; } };
}

// ------------------------------------------------------------------ frame loop
let last = performance.now() / 1000;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now() / 1000, dt = Math.min(0.1, now - last);
  last = now; T.now = now;
  if (bg) bg.draw(now, dt);
  if (MODE === 'normal' && P.run() && P.update(dt)) changed();
  const L = V && V.cards.length ? cardLayout(V) : null;
  for (const s of sprites.values()) {
    if (s.dealAt && now >= s.dealAt) {
      s.dealAt = 0; dealQueue = Math.max(0, dealQueue - 1);
      const i = V ? V.cards.findIndex((c) => c.id === s.id) : -1;
      if (i >= 0 && L) { const p = L.pos(i); s.tgt.x = p.x; s.tgt.y = p.y; const d = cardData(V.cards[i]); if (d.facing === 'front') s.startFlip(d); }
      sound.play('cardSlide1', 1 + Math.random() * 0.1, 0.4);
    }
    s.z = s.hover && !s.leaving ? 60 : 20 + (s.idx || 0);
    try { s.frame(now, dt); } catch (e) { /* one card never stops the table */ }
  }
  for (const s of leaving) { s.z = 40; try { s.frame(now, dt); } catch (e) { /* ignore */ } }
  if (pad && pad.focus && pad.focus.classList.contains('card')) pad.draw();
}
const settled = () => dealQueue === 0 && leaving.size === 0 && [...sprites.values()].every((s) => !s.dealAt && Math.abs(s.T.x - s.tgt.x) < 2 && Math.abs(s.T.y - s.tgt.y) < 2 && !s.flipAnim);

// ------------------------------------------------------------------ boot
window.__pears = {
  ready: false, mode: MODE,
  view: () => V,
  act: (kind, arg) => act(kind, arg),
  newRun: () => newRun(),
  mainMenu: () => mainMenu(),
  idle: () => settled(),
  focus: () => (pad && pad.ringOn ? pad.focus : null),   // (tests: what the ring shows)
  tip: () => (el.tip && el.tip.style.display !== 'none' ? { for: typeof tipFor === 'string' ? tipFor : 'card', text: el.tip.textContent, boxes: el.tip.querySelectorAll('.tip-info').length } : null),   // (tests: the tip on screen)
  engine: P, save: SV,
};
async function boot() {
  try { bg = new Background(document.getElementById('bg')); } catch (e) { bg = null; }
  await Promise.all([loadImages(), loadFont(), loadAll()]);
  try { net = await import('./net.js'); } catch (e) { console.warn('pairofpears: net unavailable', e); net = null; }
  build();
  resize();
  addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  requestAnimationFrame(frame);
  pad = makePad();
  document.getElementById('boot-loading')?.remove();
  if (MODE === 'spectate') startSpectating();
  else mainMenu();
  // a hidden tab still saves the frame it is on (every action already did)
  addEventListener('pagehide', () => { if (MODE === 'normal' && P.run() && P.phase() !== 'over' && P.phase() !== 'won') SV.saveRun(P.serialize()); });
  window.__pears.ready = true;
}
boot().catch((e) => { console.error(e); const l = document.getElementById('boot-loading'); if (l) l.textContent = 'Pair of Pears failed to load: ' + e.message; });
