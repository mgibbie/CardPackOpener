// Scoundrel — the web front end. A sibling of Micatro: it draws with Micatro's own UI
// pieces (the Balatro card sprites + shaders, the swirling background, the m6x11 font,
// the palette / buttons / panels / tooltips / popups in micatro.css, its sounds, its
// publisher + spectator loops) around the owner's Scoundrel rules (./engine.js).
//
//   normal      : a local run (engine state S) -> act(a) -> render(view) -> friends watch (publish-scoundrel)
//   ?spectate=u : read-only; a friend's published view snapshots, the same renderer
//   ?replay=<seed>.<actions> : read-only; a finished run re-simulated step by step
//   ?seed=X     : start (or offer) a run on that seed
//
// The table renders ONLY from engine.view() objects, so the runner, a spectator and a
// replay all draw the same thing.
import * as E from './engine.js';
import * as SV from './save.js';
import { loadImages, loadFont } from '../../micatro/js/ui/assets.js';
import { Background, C as BGC, hex } from '../../micatro/js/ui/gl.js';
import { CardSprite, drawBack, FACE_W, FACE_H } from '../../micatro/js/ui/cardsprite.js';
import { sound } from '../../micatro/js/ui/sound.js';
import { esc } from '../../micatro/js/ui/markup.js';
import { startGamepad, buttonLabel } from '/site/gamepad.js';

const params = new URLSearchParams(location.search);
const SPECTATE = (params.get('spectate') || '').trim().toLowerCase();
const REPLAY = SV.parseReplayParam(params.get('replay'));
const MODE = REPLAY ? 'replay' : SPECTATE ? 'spectate' : 'normal';
const SEED_PARAM = SV.cleanSeed(params.get('seed'));
const ICON = { sword: 'assets/sword.png', potion: 'assets/healingpotion.png', monster: 'assets/monster.png', unarmed: 'assets/unarmed.png' };
const KIND_ICON = { monster: ICON.monster, weapon: ICON.sword, potion: ICON.potion };
const SUIT_L = { Hearts: 'H', Diamonds: 'D', Clubs: 'C', Spades: 'S' };
const SUIT_SYM = { Hearts: '♥', Diamonds: '♦', Clubs: '♣', Spades: '♠' };
const RANK_NAME = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };
const ACT_COL = { heal: '#4bc292', equip: '#009dff', weapon: '#fda200', unarmed: '#fe5f55', run: '#fda200', stuck: '#fda200', cleared: '#4bc292', descend: '#eac058' };
const ACT_SND = { heal: 'tarot1', equip: 'foil1', weapon: 'slice1', unarmed: 'multhit2', run: 'whoosh', stuck: 'cancel', cleared: 'win', descend: 'gong' };

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const btn = (label, cls, fn) => { const b = h('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', (e) => { sound.play('button'); fn(e); }); return b; };
const cardName = (c) => (RANK_NAME[c.rank] || c.rank) + ' of ' + c.suit;
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const scoreText = (r) => plural(r.dungeons, 'dungeon') + ' cleared · final ' + (r.final > 0 ? '+' : '') + r.final;

// ------------------------------------------------------------------ the stage (Micatro's fixed design canvas, scaled)
const stage = document.getElementById('stage');
let bg = null;
let W = 1360, SH = 900, portrait = false, scale = 1;
const T = { now: performance.now() / 1000, cw: 148, ch: 198, backKey: 'b_red', areas: {}, data: new Map(), lowFx: false }; // the "board" a CardSprite reads
const sprites = new Map();   // card id -> CardSprite (on the table)
const leaving = new Set();   // sprites animating out
let V = null;                // the view on the table
let S = null;                // MODE normal: the engine state
let runStarted = 0;
let net = null, publisher = null, chat = null, pad = null;
let shownAction = 0, overShown = false, dealQueue = 0;
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
  T.cw = portrait ? 150 : 148; T.ch = Math.round(T.cw * 95 / 71);
  stage.style.setProperty('--cw', T.cw + 'px'); stage.style.setProperty('--ch', T.ch + 'px');
  T.lowFx = vw * vh < 500000;
  layout();
}

// ------------------------------------------------------------------ geometry (design px)
function geo() {
  const cw = T.cw, ch = T.ch;
  if (portrait) {
    // the HUD ends near y 440; the room block (labels + icons + cards + Run!) and the weapon row share what is left
    const top = 440, block = 104 + ch + 120 + 44 + ch + 50;
    const gap = Math.max(16, (SH - top - 30 - block) / 3);
    const RY = top + gap + 104 + ch / 2;
    const BY = RY + ch / 2 + 120 + gap + 44 + ch / 2;
    return { cx: W / 2, RY, sp: cw + 14, BY, wx: 24 + cw / 2, deckX: W - 24 - cw / 2, ctrlY: RY + ch / 2 + 22, killStep: 42 };
  }
  const x0 = 416, tw = W - x0 - 16, cx = x0 + tw / 2;
  const RY = 330, BY = 690;
  return { cx, RY, sp: cw + 30, BY, wx: x0 + 40 + cw / 2, deckX: W - 56 - cw / 2, ctrlY: RY + ch / 2 + 30, killStep: 46 };
}
function roomX(i, n) { const g = geo(); return g.cx - ((n - 1) * g.sp) / 2 + i * g.sp; }
function deckPos() { const g = geo(); return { x: g.deckX, y: g.BY }; }

// ------------------------------------------------------------------ DOM skeleton
function build() {
  stage.innerHTML = '';
  el.hud = h('div', 'hud sc-hud');
  el.hud.innerHTML = `
    <div class="hud-blind sc-dungeon"><div class="hb-title"><span class="sc-dname">Dungeon 1</span></div>
      <div class="sc-dbody"><img class="sc-dicon" src="${ICON.monster}" alt=""><div class="sc-dinfo"><div class="hb-req-l">Max HP</div><div class="sc-maxhp">20</div><div class="sc-dnext muted"></div></div></div></div>
    <div class="sc-hp"><div class="sc-hp-l">Health</div><div class="sc-hp-bar"><div class="sc-hp-fill"></div><div class="sc-hp-v">20 / 20</div></div></div>
    <div class="hud-stats">
      <div class="hs-btns"></div>
      <div class="hs-grid">
        <div class="stat"><div class="stat-l">Room</div><div class="stat-v sc-room">1</div></div>
        <div class="stat"><div class="stat-l">Played</div><div class="stat-v sc-played">0<small>/3</small></div></div>
        <div class="stat"><div class="stat-l">Slain</div><div class="stat-v sc-slain">0</div></div>
        <div class="stat"><div class="stat-l">Potions</div><div class="stat-v sc-potions">0</div></div>
        <div class="stat wide"><div class="stat-l">Dungeons cleared</div><div class="stat-v sc-ncleared">0</div></div>
      </div>
    </div>
    <div class="sc-seed muted"></div>`;
  const hb = el.hud.querySelector('.hs-btns');
  hb.appendChild(btn('Run<br>Info', 'red b-info', () => runInfo()));
  hb.appendChild(btn('Opt&shy;ions', 'orange b-menu', () => optionsMenu()));
  stage.appendChild(el.hud);
  el.labels = h('div', 'area-labels');
  el.roomBox = h('div', 'area-box sc-roombox'); el.labels.appendChild(el.roomBox);
  el.roomLbl = h('div', 'area-lbl sc-roomlbl'); el.labels.appendChild(el.roomLbl);
  el.weaponLbl = h('div', 'area-lbl sc-weaponlbl', 'Weapon'); el.labels.appendChild(el.weaponLbl);
  el.limitLbl = h('div', 'area-lbl sc-limitlbl'); el.labels.appendChild(el.limitLbl);
  el.deckLbl = h('div', 'area-lbl sc-decklbl', 'Dungeon'); el.labels.appendChild(el.deckLbl);
  el.slot = h('div', 'sc-slot', 'Empty'); el.labels.appendChild(el.slot);
  stage.appendChild(el.labels);
  el.deck = h('div', 'deck-pile sc-deck'); el.deckStack = h('div', 'deck-stack'); el.deckCount = h('div', 'deck-count');
  el.deck.appendChild(el.deckStack); el.deck.appendChild(el.deckCount);
  el.deck.addEventListener('click', () => { if (V) toast(plural(V.deckCount, 'card') + ' left in this dungeon'); });
  stage.appendChild(el.deck);
  el.icons = h('div', 'sc-icons'); stage.appendChild(el.icons);
  el.cards = h('div', 'cards-layer'); stage.appendChild(el.cards);
  el.ctrl = h('div', 'controls sc-controls');
  el.run = btn('Run!', 'orange big b-run', () => act('r'));
  el.hint = h('div', 'sc-hint');
  el.ctrl.appendChild(el.run); el.ctrl.appendChild(el.hint);
  stage.appendChild(el.ctrl);
  el.fight = h('div', 'sc-fight');
  el.fightQ = h('div', 'area-lbl sc-fightq', 'How do you fight?');
  el.fightW = btn('', 'blue b-weapon', () => act('w'));
  el.fightB = btn('', 'red b-unarmed', () => act('b'));
  el.fight.appendChild(el.fightW); el.fight.appendChild(el.fightB);
  stage.appendChild(el.fightQ); stage.appendChild(el.fight);
  el.cleared = h('div', 'overlay sc-cleared'); stage.appendChild(el.cleared);
  el.pop = h('div', 'pop-layer'); stage.appendChild(el.pop);
  el.attn = h('div', 'attention'); stage.appendChild(el.attn);
  el.toast = h('div', 'toast'); stage.appendChild(el.toast);
  el.tip = h('div', 'tip'); el.tip.style.display = 'none'; stage.appendChild(el.tip);
  el.banner = h('div', 'banner sc-banner'); el.banner.style.display = 'none'; stage.appendChild(el.banner);
  el.modals = h('div', 'modal-layer'); stage.appendChild(el.modals);
  renderDeckStack(6);
}
function renderDeckStack(n) {
  const k = Math.max(0, Math.min(6, n));
  if (el.deckStack.childElementCount === k) return;
  el.deckStack.innerHTML = '';
  for (let i = k - 1; i >= 0; i--) {
    const c = h('canvas', 'deck-card'); c.width = FACE_W; c.height = FACE_H;
    drawBack(c.getContext('2d'), T.backKey);
    c.style.transform = `translate(${-i * 2}px, ${-i * 2}px)`;
    el.deckStack.appendChild(c);
  }
}

function place(e, x, y, w, hgt) { e.style.left = x + 'px'; e.style.top = y + 'px'; if (w != null) e.style.width = w + 'px'; if (hgt != null) e.style.height = hgt + 'px'; }
function layout() {
  if (!el.hud) return;
  const g = geo(), cw = T.cw, ch = T.ch;
  const n = Math.max(1, V ? V.room.length : 4);
  const bw = 4 * g.sp - (g.sp - cw) + 40;
  place(el.roomBox, g.cx - bw / 2, g.RY - ch / 2 - 64, bw, ch + 84);
  el.roomLbl.style.left = g.cx + 'px'; el.roomLbl.style.top = (g.RY - ch / 2 - 104) + 'px';
  place(el.slot, g.wx - cw / 2, g.BY - ch / 2, cw, ch);
  el.weaponLbl.style.left = g.wx + 'px'; el.weaponLbl.style.top = (g.BY - ch / 2 - 40) + 'px';
  el.limitLbl.style.left = g.wx + 'px'; el.limitLbl.style.top = (g.BY + ch / 2 + 14) + 'px';
  place(el.deck, g.deckX - cw / 2, g.BY - ch / 2);
  el.deckLbl.style.left = g.deckX + 'px'; el.deckLbl.style.top = (g.BY - ch / 2 - 40) + 'px';
  el.ctrl.style.left = (g.cx - 260) + 'px'; el.ctrl.style.width = '520px'; el.ctrl.style.top = g.ctrlY + 'px';
  el.cleared.style.left = (g.cx - 330) + 'px'; el.cleared.style.top = (portrait ? g.RY - ch / 2 - 40 : 140) + 'px';
  if (V) placeCards(true);
  layoutFight();
  void n;
}

// ------------------------------------------------------------------ cards
const cardData = (c, enabled = true) => ({ front: SUIT_L[c.suit] + '_' + (c.rank === '10' ? 'T' : c.rank), center: 'c_base', facing: 'front', debuff: !enabled });
function spawn(c, x, y, faceUp) {
  const s = new CardSprite(c.id, faceUp ? cardData(c, c.enabled !== false) : { ...cardData(c), facing: 'back' }, T);
  s.place(x, y);
  s.card = c;
  attach(s);
  el.cards.appendChild(s.el);
  sprites.set(c.id, s);
  return s;
}
/** Where every card on the table belongs: {id: {x, y, z, s, card, where}} */
function targets(v) {
  const g = geo(), out = new Map();
  v.room.forEach((c, i) => out.set(c.id, { x: roomX(i, v.room.length), y: g.RY, z: 20 + i, card: c, where: 'room' }));
  if (v.weapon) out.set(v.weapon.id, { x: g.wx, y: g.BY, z: 10, card: v.weapon, where: 'weapon' });
  const room = Math.min(g.killStep, (g.deckX - g.wx - T.cw - 20) / Math.max(1, v.weaponKills.length));
  v.weaponKills.forEach((c, i) => out.set(c.id, { x: g.wx + 52 + i * room, y: g.BY + 18, z: 11 + i, card: c, where: 'kill' }));
  return out;
}
function placeCards(instant) {
  const tg = targets(V);
  for (const [id, t] of tg) {
    const s = sprites.get(id);
    if (!s || s.dealAt) continue;
    s.tgt.x = t.x; s.tgt.y = t.y; s.baseZ = t.z;
    if (instant) { s.T.x = t.x; s.T.y = t.y; }
  }
}
/** Bring the table to view v: cards that left animate out by how they left; new ones are dealt from the deck. */
function syncCards(prev, v, instant) {
  const tg = targets(v);
  const kind = v.lastAction && (!prev || !prev.lastAction || v.lastAction.n !== prev.lastAction.n) ? v.lastAction.kind : null;
  const dp = deckPos();
  for (const [id, s] of [...sprites]) {
    if (tg.has(id)) continue;
    sprites.delete(id);
    retire(s, instant ? 'now' : kind === 'run' || kind === 'stuck' ? 'deck' : kind === 'heal' ? 'heal' : 'fade');
  }
  let k = 0;
  for (const [id, t] of tg) {
    let s = sprites.get(id);
    if (!s) {
      if (instant) { s = spawn(t.card, t.x, t.y, true); }
      else {
        s = spawn(t.card, dp.x, dp.y, false);
        s.dealAt = T.now + 0.12 * k++;   // deal.lua's 0.12 s between cards
        dealQueue++;
      }
    } else {
      const d = cardData(t.card, t.card.enabled !== false);
      if (!s.dealAt && (s.d.facing !== 'front' || s.d.debuff !== d.debuff)) s.updateData(d);
      if (!s.dealAt) { s.tgt.x = t.x; s.tgt.y = t.y; }
      if (instant && !s.dealAt) { s.T.x = t.x; s.T.y = t.y; }
    }
    s.card = t.card; s.baseZ = t.z; s.where = t.where;
    if (t.where !== 'room') s.hover = false;
  }
}
function retire(s, how) {
  s.leaving = true; leaving.add(s);
  s.el.style.pointerEvents = 'none';
  s.baseZ = s.z = 40;
  const done = () => { s.destroy(); leaving.delete(s); };
  if (how === 'now') { done(); return; }
  if (how === 'deck') {
    const dp = deckPos();
    s.tgt.x = dp.x; s.tgt.y = dp.y; s.baseZ = s.z = 5;
    s.startFlip({ ...s.d, facing: 'back' });
    setTimeout(done, 520);
    return;
  }
  if (how === 'heal') { s.tgt.y -= 90; s.tgt.s = 1.08; }
  else s.juiceUp(0.5);
  s.startDissolve(0.7, done);
  s.tgt.o = 0;
  setTimeout(() => { if (leaving.has(s)) done(); }, 1100);
}
function attach(s) {
  const e = s.el;
  let press = null;
  e.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse' && s.where === 'room') { s.hover = true; showTip(s); } });
  e.addEventListener('pointerleave', () => { s.hover = false; s.tilt.tx = s.tilt.ty = 0; if (tipFor === s) hideTip(); });
  e.addEventListener('pointermove', (ev) => {
    if (!s.hover) return;
    const r = e.getBoundingClientRect();
    s.tilt.ty = ((ev.clientX - r.left) / r.width - 0.5) * 22;
    s.tilt.tx = -((ev.clientY - r.top) / r.height - 0.5) * 22;
  });
  e.addEventListener('pointerdown', (ev) => {
    press = { t: performance.now(), long: false };
    if (ev.pointerType !== 'mouse') {
      press.timer = setTimeout(() => { if (press) { press.long = true; s.hover = true; showTip(s); } }, 420);
    }
  });
  const end = () => { if (press && press.timer) clearTimeout(press.timer); };
  e.addEventListener('pointercancel', () => { end(); press = null; });
  e.addEventListener('pointerup', (ev) => {
    end();
    const p = press; press = null;
    if (!p) return;
    if (p.long) { setTimeout(() => { s.hover = false; if (tipFor === s) hideTip(); }, 1600); return; }
    if (ev.pointerType !== 'mouse') { hideTip(); }
    clickCard(s);
  });
}
function clickCard(s) {
  if (MODE !== 'normal' || !V || s.where !== 'room') return;
  if (V.state === E.STATE.FIGHT_CHOICE) { act('c'); return; }   // (main.lua: a click anywhere else cancels the choice)
  const i = V.room.findIndex((c) => c.id === s.id);
  if (i >= 0) act(String(i));
}

// ------------------------------------------------------------------ tooltip (main.lua drawTooltip, in Micatro's tip panel)
let tipFor = null;
function tipLines(c, v) {
  const lines = [];
  if (c.kind === 'monster') {
    lines.push('Monster (value ' + c.value + ')');
    if (v.weapon && (v.weaponLimit == null || c.value <= v.weaponLimit)) {
      lines.push('Weapon: <span class="red">-' + Math.max(0, c.value - v.weapon.value) + ' HP</span>');
      lines.push('Unarmed: <span class="red">-' + c.value + ' HP</span>');
      lines.push('Click to choose');
    } else {
      if (v.weapon) lines.push('<span class="red">Weapon can\'t target this!</span>');
      lines.push('Unarmed: <span class="red">-' + c.value + ' HP</span>');
    }
  } else if (c.kind === 'potion') {
    lines.push('Potion (heal ' + c.value + ')');
    if (v.potionUsed) { lines.push('<span class="red">Already used one this room!</span>'); lines.push('Will be wasted'); }
    else lines.push('Will restore <span class="green">' + Math.min(c.value, v.maxHp - v.hp) + ' HP</span>');
  } else if (c.kind === 'weapon') {
    lines.push('Weapon (power ' + c.value + ')');
    if (v.weapon) lines.push('Replaces current weapon');
  }
  return lines;
}
function showTip(s) {
  if (!V || !s.card || s.where !== 'room') return;
  const c = s.card;
  tipFor = s;
  el.tip.innerHTML = `<div class="tip-main"><div class="tip-name pc"><span class="tip-pc">${esc(cardName(c))} <span class="${c.suit === 'Hearts' || c.suit === 'Diamonds' ? 'red' : ''}">${SUIT_SYM[c.suit]}</span></span></div>`
    + `<div class="tip-body">${tipLines(c, V).join('<br>')}</div></div>`;
  el.tip.style.display = 'flex';
  const tw = el.tip.offsetWidth || 300, th = el.tip.offsetHeight || 160;
  let x = s.tgt.x + T.cw / 2 + 14, y = s.tgt.y - th / 2;
  if (x + tw > W - 10) x = s.tgt.x - T.cw / 2 - 14 - tw;
  if (portrait) { x = Math.max(10, Math.min(W - tw - 10, s.tgt.x - tw / 2)); y = s.tgt.y - T.ch / 2 - th - 30; }
  el.tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(Math.max(10, y))}px)`;
}
function hideTip() { tipFor = null; el.tip.style.display = 'none'; }

// ------------------------------------------------------------------ HUD + table chrome
function renderHud(v, prev, instant) {
  const q = (s) => el.hud.querySelector(s);
  q('.sc-dname').textContent = 'Dungeon ' + v.dungeon;
  q('.sc-maxhp').textContent = v.maxHp;
  q('.sc-dnext').textContent = v.maxHp > 1 ? 'next dungeon: ' + (v.maxHp - 1) : 'the last dungeon';
  const ratio = Math.max(0, v.hp / v.maxHp);
  const fill = q('.sc-hp-fill');
  fill.style.width = (ratio * 100).toFixed(1) + '%';
  fill.style.background = ratio > 0.6 ? 'var(--green)' : ratio > 0.3 ? 'var(--orange)' : 'var(--red)';
  q('.sc-hp-v').textContent = v.hp + ' / ' + v.maxHp;
  q('.sc-room').textContent = v.roomNo;
  q('.sc-played').innerHTML = v.resolved + '<small>/3</small>';
  q('.sc-slain').textContent = v.slain;
  q('.sc-potions').textContent = v.potions;
  q('.sc-ncleared').textContent = v.cleared;
  q('.sc-seed').textContent = 'Seed ' + v.seed;
  if (!instant && prev && prev.dungeon === v.dungeon && v.hp !== prev.hp) {
    const d = v.hp - prev.hp, bar = q('.sc-hp');
    floatAt(bar, (d > 0 ? '+' : '') + d, d > 0 ? 'green' : 'red');
    bar.classList.remove('bump'); void bar.offsetWidth; bar.classList.add('bump');
  }
  if (!instant && prev && v.dungeon !== prev.dungeon) { const d = q('.sc-dungeon'); d.classList.remove('bump'); void d.offsetWidth; d.classList.add('bump'); }
}
function renderTable(v) {
  el.roomLbl.textContent = v.state === E.STATE.CLEARED || v.over ? '' : 'Room ' + v.roomNo + (v.resolved > 0 ? '  (' + v.resolved + '/3 played)' : '');
  el.slot.style.display = v.weapon ? 'none' : '';
  el.limitLbl.textContent = v.weapon ? (v.weaponLimit != null ? 'Max target: ' + v.weaponLimit : 'Any monster') : '';
  el.limitLbl.classList.toggle('limited', v.weaponLimit != null);
  renderDeckStack(v.deckCount);
  el.deckCount.textContent = v.deckCount ? String(v.deckCount) : 'Empty';
  const live = v.state === E.STATE.CHOOSING;
  el.ctrl.style.display = v.state === E.STATE.CLEARED || v.over ? 'none' : '';
  el.run.disabled = !v.canRun || MODE !== 'normal';
  el.hint.textContent = v.canRun ? (MODE === 'normal' && !portrait ? '[Space] — the room goes under the deck' : '') : v.ranLastRoom ? 'You ran from the last room' : v.state === E.STATE.FIGHT_CHOICE ? '' : live ? '' : '';
  if (v.potionUsed && live) el.hint.textContent = (el.hint.textContent ? el.hint.textContent + ' · ' : '') + 'Potion used this room';
  // type icons over the room cards (sprites.lua getCardTypeIcon)
  const want = v.room.map((c) => c.id).join(',');
  if (el.icons.dataset.k !== want) {
    el.icons.dataset.k = want;
    el.icons.innerHTML = '';
    for (const c of v.room) { const im = h('img', 'sc-kind'); im.src = KIND_ICON[c.kind]; im.alt = c.kind; im.dataset.id = c.id; el.icons.appendChild(im); }
  }
  renderCleared(v);
  layoutFight();
}
function layoutFight() {
  const v = V;
  const on = !!v && v.state === E.STATE.FIGHT_CHOICE && v.pending != null && v.room[v.pending];
  el.fight.style.display = on ? 'flex' : 'none';
  el.fightQ.style.display = on ? '' : 'none';
  stage.classList.toggle('fighting', !!on);
  if (!on) return;
  const c = v.room[v.pending], g = geo();
  const x = roomX(v.pending, v.room.length);
  const wd = Math.max(0, c.value - v.weapon.value);
  el.fightW.innerHTML = `<img src="${ICON.sword}" alt=""><span>Weapon<small>-${wd} HP</small></span>`;
  el.fightB.innerHTML = `<img src="${ICON.unarmed}" alt=""><span>Unarmed<small>-${c.value} HP</small></span>`;
  el.fightW.disabled = el.fightB.disabled = MODE !== 'normal';
  const fw = 360;
  el.fight.style.width = fw + 'px';
  el.fight.style.left = Math.max(12, Math.min(W - fw - 12, x - fw / 2)) + 'px';
  el.fight.style.top = (g.RY + T.ch / 2 + 22) + 'px';
  el.fightQ.style.left = x + 'px'; el.fightQ.style.top = (g.RY - T.ch / 2 - 104) + 'px';
}
function renderCleared(v) {
  const on = v.state === E.STATE.CLEARED;
  el.cleared.style.display = on ? '' : 'none';
  if (!on) { el.cleared.innerHTML = ''; return; }
  const last = v.history[v.history.length - 1] || { score: 0, hp: v.hp };
  const k = 'c' + v.dungeon + ':' + v.n;
  if (el.cleared.dataset.k === k) return;
  el.cleared.dataset.k = k;
  el.cleared.innerHTML = `<div class="sc-cl-box">
    <div class="sc-cl-title">Dungeon ${v.dungeon} cleared!</div>
    <div class="sc-cl-row"><div class="stat"><div class="stat-l">Health left</div><div class="stat-v">${last.hp}<small>/${last.maxHp}</small></div></div>
      <div class="stat"><div class="stat-l">Dungeon score</div><div class="stat-v money">${last.score}</div></div>
      <div class="stat"><div class="stat-l">Cleared</div><div class="stat-v">${v.cleared}</div></div></div>
    <div class="sc-cl-next">Next: <b>Dungeon ${v.dungeon + 1}</b> · Max HP <span class="red">${v.maxHp - 1}</span> <span class="muted">(−1)</span>, at full health</div></div>`;
  const box = el.cleared.firstChild;
  if (MODE === 'normal') box.appendChild(btn('Descend', 'green big wide b-descend', () => act('d')));
  else box.appendChild(h('div', 'sc-cl-wait muted', MODE === 'spectate' ? 'Waiting for ' + esc(SPECTATE) + ' to descend…' : ''));
}

// ------------------------------------------------------------------ popups (micatro.css .attention / .popup / .toast)
function attn(text, colour) {
  const a = el.attn;
  a.textContent = text; a.style.color = colour || '#fff';
  a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
}
function floatAt(target, text, cls) {
  const r = target.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const p = h('div', 'popup float ' + (cls || ''), esc(text));
  p.style.left = ((r.left + r.width / 2 - sr.left) / scale) + 'px';
  p.style.top = ((r.top - sr.top) / scale) + 'px';
  el.pop.appendChild(p);
  setTimeout(() => p.remove(), 1200);
}
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove('show'); void el.toast.offsetWidth; el.toast.classList.add('show');
}

// ------------------------------------------------------------------ background (Balatro's ease_background_colour)
function bgFor(v) {
  if (!v) return { new_colour: BGC.RED, special_colour: BGC.BLUE, tertiary_colour: [0.13, 0.16, 0.16, 1], contrast: 1.4 };
  if (v.over) return v.result && v.result.reason === 'complete' ? { new_colour: BGC.GOLD, special_colour: BGC.GREEN, contrast: 2 } : { new_colour: hex('2a1f24'), special_colour: BGC.RED, contrast: 2.5 };
  if (v.state === E.STATE.CLEARED) return { new_colour: BGC.WON, special_colour: BGC.GOLD, contrast: 1.6 };
  if (v.state === E.STATE.FIGHT_CHOICE) return { new_colour: hex('6b2f33'), special_colour: BGC.RED, contrast: 2 };
  // deeper dungeons darken toward the boss colours
  const depth = Math.min(1, (v.dungeon - 1) / 12);
  const mix = (a, b, p) => a.map((x, i) => x * (1 - p) + b[i] * p);
  return { new_colour: mix(BGC.SMALL, hex('4a3a5a'), depth), contrast: 1 + depth };
}

// ------------------------------------------------------------------ render
function render(v, { instant = false } = {}) {
  const prev = V;
  V = v;
  stage.classList.toggle('no-run', !v);
  if (!v) { for (const s of [...sprites.values()]) { sprites.delete(s.id); retire(s, 'now'); } bg && bg.set(bgFor(null)); return; }
  hideTip();
  syncCards(prev, v, instant);
  renderHud(v, prev, instant);
  renderTable(v);
  bg && bg.set(bgFor(v));
  const la = v.lastAction;
  if (la && la.n !== shownAction) {
    const fresh = !instant && prev && prev.n !== v.n;
    shownAction = la.n;
    if (fresh) {
      attn(la.text, ACT_COL[la.kind]);
      if (ACT_SND[la.kind]) sound.play(ACT_SND[la.kind]);
      if (la.kind === 'cleared' || la.kind === 'descend') bg && bg.pulse(0.8);
    }
  }
  if (v.over) {
    if (!instant && prev && !prev.over) sound.play(v.result.reason === 'dead' ? 'crumpleLong1' : 'win');
    if (!overShown) { overShown = true; setTimeout(() => { if (V && V.over) gameOver(V); }, instant ? 0 : 1100); }
  } else overShown = false;
  updateBanner();
  if (pad) pad.refresh();
}

// ------------------------------------------------------------------ the runner's actions
function act(a) {
  if (MODE !== 'normal' || !S) return false;
  const why = E.refusal(S, a);
  if (why) { toast(why[0].toUpperCase() + why.slice(1)); sound.play('cancel'); return false; }
  E.apply(S, a);
  if (!/[wbc]/.test(a)) sound.play('card1');
  SV.saveRun(S, runStarted);   // every action: a reload resumes on this exact frame
  render(E.view(S));
  if (S.state === E.STATE.OVER) finishRun();
  return true;
}
function startRun(state, started, { instant = true } = {}) {
  closeAll();
  S = state; runStarted = started || Date.now();
  overShown = false; shownAction = S.lastAction ? S.lastAction.n : 0;
  SV.saveRun(S, runStarted);
  render(E.view(S), { instant });
  startBroadcast();
}
function newRun(seed) {
  const s = E.newRun(SV.cleanSeed(seed) || SV.randomSeed());
  for (const sp of [...sprites.values()]) { sprites.delete(sp.id); retire(sp, 'fade'); }
  V = null;
  startRun(s, Date.now(), { instant: false });
  sound.play('cardFan2');
}
async function finishRun() {
  const s = S;
  SV.addReplay(s);
  SV.clearRun();
  if (publisher) { const p = publisher; publisher = null; p.finish({ won: s.result.reason === 'complete' }).catch(() => {}); }
  if (net && net.isLoggedIn()) {
    const r = await net.submitScore({ dungeons: s.result.dungeons, final: s.result.final, seed: s.seed });
    lastSubmit = r;
    const line = document.querySelector('.sc-over-rank');
    if (line) line.innerHTML = rankLine(r);
  }
}
let lastSubmit = null;
const rankLine = (r) => !r ? '' : r.error ? '' : (r.better ? '<span class="money">New personal best!</span> ' : '') + (r.rank ? 'Leaderboard rank <b>#' + r.rank + '</b>' : '');

// ------------------------------------------------------------------ live broadcast (signed in)
function startBroadcast() {
  if (MODE !== 'normal' || !net || !net.isLoggedIn()) return;
  if (publisher) publisher.stop();
  publisher = net.startPublisher(() => (V && S ? V : null), () => (S ? E.label(S) : ''));
  publisher.onWatchers((n, names) => { watchers = { n, names }; updateBanner(); });
  if (!chat) chat = net.mountChat(null, { runner: net.myName() });
}
let watchers = { n: 0, names: [] };
let specStatus = '', specMeta = {};
function updateBanner() {
  const b = el.banner;
  if (MODE === 'spectate') {
    b.style.display = '';
    const st = { connecting: 'Connecting…', live: '● Live', 'not-live': 'Not playing right now — waiting…', full: 'Too many watchers — retrying…', over: 'Run over', forbidden: 'Only friends can watch', login: 'Log in to watch friends', offline: 'Offline — retrying…' }[specStatus] || '';
    b.innerHTML = `<span class="watching">Watching <b>${esc(SPECTATE)}</b></span><span class="spec-status">${esc(st)}</span>`
      + (specMeta.watchers ? `<span class="sc-watch">👁 ${specMeta.watchers} watching</span>` : '') + `<a href="/scoundrel/">Play</a>`;
  } else if (MODE === 'normal') {
    b.style.display = watchers.n ? '' : 'none';
    b.innerHTML = watchers.n ? `<span class="sc-watch" title="${esc(watchers.names.join(', '))}">👁 <b>${watchers.n}</b> watching</span>` : '';
  }
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
  if (pad) pad.refresh(true);
  return wrap;
}
function closeModal() { const m = mstack.pop(); if (m) { m.el.remove(); if (m.onClose) m.onClose(); } el.modals.classList.toggle('open', mstack.length > 0); if (pad) pad.refresh(true); }
function closeAll() { while (mstack.length) closeModal(); }
const topModal = () => (mstack.length ? mstack[mstack.length - 1].el : null);

function mainMenu() {
  closeAll();
  const m = h('div', 'main-menu sc-menu');
  m.appendChild(h('div', 'logo sc-logo', '<span class="l1">SCOUNDREL</span>'));
  const mid = h('div', 'sc-menu-mid');
  mid.innerHTML = `<img class="sc-menu-monster" src="${ICON.monster}" alt=""><div class="sc-menu-sub">A solo dungeon card game · a roguelike of dungeons</div>
    <div class="sc-menu-icons">${['sword', 'potion', 'monster', 'unarmed'].map((k, i) => `<img src="${ICON[k]}" style="animation-delay:${-i * 0.4}s" alt="">`).join('')}</div>`;
  m.appendChild(mid);
  const bar = h('div', 'menu-bar');
  const saved = SV.resumeRun();
  bar.appendChild(btn('New<br>Run', 'blue big b-new', () => newRun(SEED_PARAM)));
  if (saved) {
    const s = saved.state;
    const c = btn(`Continue<small>Dungeon ${s.dungeon} · ${s.hp}/${s.maxHp} HP</small>`, 'orange big b-continue', () => startRun(s, saved.started));
    bar.insertBefore(c, bar.firstChild);
  }
  bar.appendChild(btn('Leader<br>board', 'green big b-leaders', () => leaderboard()));
  bar.appendChild(btn('How to<br>play', 'red big b-howto', () => howTo()));
  bar.appendChild(btn('Replays', 'orange big b-replays', () => replaysList()));
  m.appendChild(bar);
  const foot = h('div', 'menu-foot');
  const back = h('a', 'back-link', '← Magepunk'); back.href = '/'; foot.appendChild(back);
  if (!(net && net.isLoggedIn())) { const a = h('a', 'login-link', 'Log in to let friends watch &amp; post high scores'); a.href = '/login/?next=' + encodeURIComponent('/scoundrel/' + location.search); foot.appendChild(a); }
  m.appendChild(foot);
  modal(m, { cls: 'menu-modal', noClose: true });
  bg && bg.set(bgFor(null));
}

function howTo() {
  const b = h('div', 'sc-howto');
  b.innerHTML = `
  <p>The dungeon is a 44-card deck: every <b>club</b> and <b>spade</b> is a <span class="red">monster</span> (2–10, J 11, Q 12, K 13, A 14),
  the <b>diamonds</b> 2–10 are <span class="blue">weapons</span> and the <b>hearts</b> 2–10 are <span class="green">potions</span>. The red faces and red aces are gone.</p>
  <p>Each <b>room</b> is 4 cards. Play <b>3</b> of them, one at a time; the 4th stays and starts the next room.</p>
  <ul>
  <li><span class="green">Potion</span>: heal its value, up to your max HP. Only <b>one potion per room</b> — the other potions are locked.</li>
  <li><span class="blue">Weapon</span>: equip it (your old weapon is discarded).</li>
  <li><span class="red">Monster</span>: fight it. <b>Unarmed</b> you take its full value. With a <b>weapon</b> you take monster − weapon (never below 0) —
  but the weapon then only fights monsters <b>no stronger</b> than the last one it slew.</li>
  <li><b>Run!</b> sends the room's cards to the bottom of the deck. You can't run from two rooms in a row.</li>
  </ul>
  <p>Empty the deck to clear the dungeon. At 0 HP the run is over.</p>
  <p><b>The run:</b> every dungeon you clear starts the next one with <b>1 less max HP</b> (20, 19, 18 …), at full health. How deep can you go?
  Your score is the number of dungeons cleared, then the last dungeon's Scoundrel score (HP left, or minus the monsters left when you died).</p>
  <p class="muted">Keys: 1–4 pick a card · W weapon · B bare-handed · Esc cancel · Space run · Enter descend · R new run. Controllers and touch work too (long-press a card for its details).</p>`;
  modal(b, { title: 'How to play', cls: 'sc-modal' });
}

function runInfo() {
  if (!V) return;
  const b = h('div', 'sc-info');
  const rows = V.history.map((d) => `<tr><td>${d.dungeon}</td><td>${d.maxHp}</td><td>${d.hp}</td><td>${d.rooms}</td><td>${d.slain}</td><td>${d.score}</td></tr>`).join('');
  b.innerHTML = `<div class="sc-info-now">Dungeon <b>${V.dungeon}</b> · <span class="red">${V.hp}/${V.maxHp} HP</span> · ${plural(V.deckCount, 'card')} left · seed ${esc(V.seed)}</div>
    <table class="sc-table"><thead><tr><th>Dungeon</th><th>Max HP</th><th>HP left</th><th>Rooms</th><th>Slain</th><th>Score</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="muted">No dungeon cleared yet</td></tr>'}</tbody></table>
    <div class="muted">Run totals: ${plural(V.totals.rooms, 'room')} · ${V.totals.slain} slain · ${plural(V.totals.potions, 'potion')}</div>`;
  modal(b, { title: 'Run info', cls: 'sc-modal' });
}

function optionsMenu() {
  const b = h('div', 'pause');
  const sfx = btn('Sound: ' + (sound.sfx ? 'on' : 'off'), 'blue wide b-sfx', () => { sound.setSfx(!sound.sfx); sfx.textContent = 'Sound: ' + (sound.sfx ? 'on' : 'off'); });
  const mus = btn('Music: ' + (sound.music ? 'on' : 'off'), 'blue wide b-music', () => { sound.setMusic(!sound.music); mus.textContent = 'Music: ' + (sound.music ? 'on' : 'off'); });
  b.appendChild(sfx); b.appendChild(mus);
  b.appendChild(btn('How to play', 'red wide', () => howTo()));
  if (MODE === 'normal') {
    b.appendChild(btn('New run', 'orange wide b-restart', () => confirmRestart()));
    b.appendChild(btn('Main menu', 'grey wide b-mainmenu', () => mainMenu()));
  }
  modal(b, { title: 'Options', cls: 'sc-modal' });
}
function confirmRestart() {
  if (!S || S.state === E.STATE.OVER) { newRun(); return; }
  const b = h('div', 'pause');
  b.appendChild(h('p', 'sc-confirm', 'Abandon this run (Dungeon ' + S.dungeon + ') and start a new one?'));
  b.appendChild(btn('Abandon &amp; start over', 'red wide b-confirm', () => { SV.addReplay(S); newRun(); }));
  modal(b, { title: 'New run', cls: 'sc-modal' });
}

async function leaderboard() {
  const b = h('div', 'sc-lb', '<div class="muted">Loading…</div>');
  modal(b, { title: 'Leaderboard', cls: 'sc-modal' });
  if (!net || !net.isLoggedIn()) { b.innerHTML = '<div class="muted">Log in to see the leaderboard and post your runs.</div>'; return; }
  const r = await net.fetchLeaderboard();
  const top = (r && r.top) || [];
  const me = net.myName();
  b.innerHTML = `<div class="muted sc-lb-how">Most dungeons cleared, then the last dungeon's score</div>
    <table class="sc-table"><thead><tr><th>#</th><th>Player</th><th>Dungeons</th><th>Final</th></tr></thead><tbody>${
    top.map((e, i) => `<tr class="${e.name === me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(e.name)}</td><td>${e.dungeons}</td><td>${e.final}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No runs yet — be the first</td></tr>'}</tbody></table>`
    + (r && r.you ? `<div class="sc-lb-you">Your best: ${esc(scoreText(r.you))}${r.you.rank ? ' · #' + r.you.rank : ''}</div>` : '');
}

function replaysList() {
  const list = SV.listReplays();
  const b = h('div', 'sc-replays');
  if (!list.length) b.innerHTML = '<div class="muted">Finished runs on this device show up here.</div>';
  for (const r of list) {
    const row = h('div', 'sc-rp');
    row.innerHTML = `<div class="sc-rp-t">${r.result ? esc(scoreText(r.result)) : 'Abandoned run'}<div class="muted">${new Date(r.when).toLocaleString()} · seed ${esc(r.seed)}</div></div>`;
    row.appendChild(btn('Watch', 'green', () => { location.href = '/scoundrel/?replay=' + SV.replayParam(r.seed, r.actions); }));
    b.appendChild(row);
  }
  modal(b, { title: 'Replays', cls: 'sc-modal' });
}

function gameOver(v) {
  if (topModal() && topModal().classList.contains('sc-over-modal')) return;
  const r = v.result, dead = r.reason === 'dead';
  const b = h('div', 'sc-over');
  b.innerHTML = `<div class="sc-over-t ${dead ? 'red' : 'green'}">${dead ? 'DEFEATED' : 'RUN COMPLETE!'}</div>
    <div class="sc-over-s">${dead ? 'The dungeon claims another soul…' : 'You cleared every dungeon down to 1 max HP!'}</div>
    <div class="sc-over-grid">
      <div class="stat"><div class="stat-l">Dungeons cleared</div><div class="stat-v">${r.dungeons}</div></div>
      <div class="stat"><div class="stat-l">Final dungeon score</div><div class="stat-v ${r.final < 0 ? 'red' : 'money'}">${r.final}</div></div>
      <div class="stat"><div class="stat-l">Rooms</div><div class="stat-v">${v.totals.rooms}</div></div>
      <div class="stat"><div class="stat-l">Monsters slain</div><div class="stat-v">${v.totals.slain}</div></div>
      <div class="stat"><div class="stat-l">Potions</div><div class="stat-v">${v.totals.potions}</div></div>
    </div>
    <div class="sc-over-rank">${rankLine(lastSubmit)}</div>`;
  const acts = h('div', 'sc-over-acts');
  if (MODE === 'normal') {
    acts.appendChild(btn('New Run', 'blue big b-again', () => newRun()));
    acts.appendChild(btn('Watch replay', 'green big b-watch-replay', () => { location.href = '/scoundrel/?replay=' + SV.replayParam(v.seed, S.actions); }));
    acts.appendChild(btn('Copy replay link', 'orange big b-copy', async () => { try { await navigator.clipboard.writeText(SV.replayUrl(v.seed, S.actions)); toast('Replay link copied'); } catch (e) { toast('Could not copy'); } }));
    acts.appendChild(btn('Main menu', 'grey big', () => mainMenu()));
  } else if (MODE === 'replay') {
    acts.appendChild(btn('Play Scoundrel', 'blue big', () => { location.href = '/scoundrel/'; }));
  } else acts.appendChild(btn('Play Scoundrel', 'blue big', () => { location.href = '/scoundrel/'; }));
  b.appendChild(acts);
  modal(b, { cls: 'sc-modal sc-over-modal', noClose: MODE === 'normal' });
}

// ------------------------------------------------------------------ spectating
function startSpectating() {
  stage.classList.add('readonly');
  updateBanner();
  if (!net) { specStatus = 'offline'; updateBanner(); return; }
  let first = true;
  net.startSpectate(SPECTATE, {
    onSnapshot: (snap, meta) => {
      specMeta = meta || {};
      if (!snap || !snap.room) return;
      render(snap, { instant: first || (V && snap.seed !== V.seed) });
      first = false;
    },
    onStatus: (st, info) => { specStatus = st; if (info && info.watchers != null) specMeta = { ...specMeta, ...info }; updateBanner(); },
  });
  if (net.isLoggedIn()) chat = net.mountChat(null, { runner: SPECTATE, spectator: true });
}

// ------------------------------------------------------------------ replays (?replay=<seed>.<actions>)
const RP = { k: 0, playing: false, timer: null, speed: 1 };
function startReplay() {
  stage.classList.add('readonly');
  const { seed, actions } = REPLAY;
  const full = E.replay(seed, actions);
  const total = full.actions.length;
  const bar = h('div', 'sc-replay-bar');
  document.body.classList.add('has-replay-bar');
  const lbl = h('div', 'sc-rp-lbl');
  const go = (k, instant) => { RP.k = Math.max(0, Math.min(total, k)); render(E.view(E.replay(seed, full.actions, RP.k)), { instant }); lbl.textContent = 'Replay · seed ' + seed + ' · move ' + RP.k + '/' + total; };
  const tick = () => { if (!RP.playing) return; if (RP.k >= total) { RP.playing = false; playB.textContent = '▶ Play'; return; } go(RP.k + 1, false); RP.timer = setTimeout(tick, 900 / RP.speed); };
  const playB = btn('▶ Play', 'green b-rp-play', () => { RP.playing = !RP.playing; playB.textContent = RP.playing ? '⏸ Pause' : '▶ Play'; clearTimeout(RP.timer); if (RP.playing) tick(); });
  bar.appendChild(btn('⏮', 'grey b-rp-start', () => go(0, true)));
  bar.appendChild(btn('◀', 'grey b-rp-back', () => go(RP.k - 1, true)));
  bar.appendChild(playB);
  bar.appendChild(btn('▶|', 'grey b-rp-step', () => go(RP.k + 1, false)));
  const sp = btn('×1', 'orange b-rp-speed', () => { RP.speed = RP.speed >= 4 ? 1 : RP.speed * 2; sp.textContent = '×' + RP.speed; });
  bar.appendChild(sp);
  bar.appendChild(lbl);
  stage.appendChild(bar);
  go(0, true);
  window.__scoundrel.replayTo = (k) => go(k, true);
  window.__scoundrel.replayTotal = total;
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
    if (V && MODE === 'normal' && V.state === E.STATE.CHOOSING) for (const c of V.room) { const s = sprites.get(c.id); if (s && c.enabled) out.push(s.el); }
    for (const e of stage.querySelectorAll('.btn')) if (!e.closest('.modal-layer') && shown(e)) out.push(e);
    return out;
  }
  const center = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  function home(list) {
    const m = topModal();
    if (m) return list.find((e) => e.matches('.b-continue, .b-again, .b-descend, .blue')) || list[0];
    if (V && V.state === E.STATE.FIGHT_CHOICE) return el.fightW;
    if (V && V.state === E.STATE.CLEARED) return stage.querySelector('.b-descend') || list[0];
    return list.find((e) => e.classList.contains('card')) || list[0];
  }
  function setFocus(e) {
    if (focus && focus.classList.contains('card')) { const s = sprites.get(+focus.dataset.id); if (s) { s.hover = false; if (tipFor === s) hideTip(); } }
    focus = e || null;
    if (focus && focus.classList.contains('card')) { const s = sprites.get(+focus.dataset.id); if (s) { s.hover = true; showTip(s); } }
    draw();
  }
  function draw() {
    if (!ringOn || !focus || !focus.isConnected) { ret.style.display = 'none'; return; }
    const r = focus.getBoundingClientRect();
    Object.assign(ret.style, { display: '', left: (r.left - 6) + 'px', top: (r.top - 6) + 'px', width: (r.width + 12) + 'px', height: (r.height + 12) + 'px' });
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
  function confirm() {
    ringOn = true;
    if (!focus || !focus.isConnected) { ensure(true); return; }
    if (focus.classList.contains('card')) { const s = sprites.get(+focus.dataset.id); if (s) clickCard(s); }
    else focus.click();
  }
  function cancel() {
    if (topModal()) { if (topModal().querySelector('.b-back')) closeModal(); return; }
    if (V && V.state === E.STATE.FIGHT_CHOICE) act('c');
  }
  const showHints = () => {
    hints.style.display = '';
    const k = (a) => `<span class="pk">${esc(buttonLabel(a, kind))}</span>`;
    hints.innerHTML = `${k('confirm')}Select<span class="sep"></span>${k('cancel')}Back<span class="sep"></span>${k('context')}Run!<span class="sep"></span>${k('menu')}Options`;
  };
  try {
    startGamepad({
      onPress: (a) => {
        showHints();
        if (['up', 'down', 'left', 'right'].includes(a)) move(a);
        else if (a === 'confirm') confirm();
        else if (a === 'cancel') cancel();
        else if (a === 'context') act('r');
        else if (a === 'menu') { if (!topModal() && MODE === 'normal') optionsMenu(); }
      },
      onConnect: (info) => { kind = (info && info.kind) || 'generic'; },
    });
  } catch (e) { /* no gamepad support */ }
  addEventListener('keydown', (ev) => {
    if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) return;
    const k = ev.key;
    if (k.startsWith('Arrow')) { ev.preventDefault(); move(k.slice(5).toLowerCase()); return; }
    if (k === 'Escape') { cancel(); return; }
    if (k === 'Enter') {
      if (ringOn && focus) { ev.preventDefault(); confirm(); return; }
      if (!topModal() && V && V.state === E.STATE.CLEARED) act('d');
      return;
    }
    if (topModal() || MODE !== 'normal' || !V) return;
    if (/^[1-4]$/.test(k)) act(String(+k - 1));
    else if (k === 'w' || k === 'W') act('w');
    else if (k === 'b' || k === 'B' || k === 'u' || k === 'U') act('b');
    else if (k === ' ') { ev.preventDefault(); act('r'); }
    else if (k === 'r' || k === 'R') confirmRestart();
  });
  addEventListener('pointerdown', () => { ringOn = false; draw(); }, true);
  addEventListener('resize', () => draw());
  return { refresh(reset) { if (ringOn) requestAnimationFrame(() => ensure(reset)); }, draw };
}

// ------------------------------------------------------------------ frame loop
let last = performance.now() / 1000;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now() / 1000, dt = Math.min(0.1, now - last);
  last = now; T.now = now;
  if (bg) bg.draw(now, dt);
  const iconBy = new Map();
  for (const im of el.icons.children) iconBy.set(+im.dataset.id, im);
  for (const s of sprites.values()) {
    if (s.dealAt && now >= s.dealAt) {
      s.dealAt = 0; dealQueue = Math.max(0, dealQueue - 1);
      const t = V && targets(V).get(s.id);
      if (t) { s.tgt.x = t.x; s.tgt.y = t.y; s.startFlip(cardData(t.card, t.card.enabled !== false)); sound.play('cardSlide1', 1 + Math.random() * 0.1, 0.6); }
    }
    s.z = s.hover && !s.leaving ? 60 : s.baseZ || 0;
    try { s.frame(now, dt); } catch (e) { /* one card never stops the table */ }
    const im = iconBy.get(s.id);
    if (im) {
      const show = !s.dealAt && Math.abs(s.T.y - s.tgt.y) < 30;
      im.style.opacity = show ? (V && V.state === E.STATE.FIGHT_CHOICE && V.room[V.pending] && V.room[V.pending].id !== s.id ? '0.35' : '0.9') : '0';
      im.style.transform = `translate(${(s.T.x - 20).toFixed(1)}px, ${(s.T.y - T.ch / 2 - 52).toFixed(1)}px)`;
    }
  }
  if (V && V.state === E.STATE.FIGHT_CHOICE) for (const s of sprites.values()) s.tgt.o = s.where === 'room' && V.room[V.pending] && V.room[V.pending].id !== s.id ? 0.45 : 1;
  else for (const s of sprites.values()) s.tgt.o = 1;
  for (const s of leaving) { try { s.frame(now, dt); } catch (e) { /* ignore */ } }
}
const settled = () => dealQueue === 0 && leaving.size === 0 && [...sprites.values()].every((s) => !s.dealAt && Math.abs(s.T.x - s.tgt.x) < 2 && Math.abs(s.T.y - s.tgt.y) < 2 && !s.flipAnim);

// ------------------------------------------------------------------ boot
window.__scoundrel = {
  ready: false, mode: MODE,
  view: () => V, state: () => S,
  act: (a) => act(String(a)),
  newRun: (o = {}) => newRun(o.seed),
  idle: () => settled(),
  recipe: () => (S ? { seed: S.seed, actions: S.actions } : null),
  engine: E,
};
async function boot() {
  try { bg = new Background(document.getElementById('bg')); } catch (e) { bg = null; }
  await Promise.all([loadImages(), loadFont()]);
  try { net = await import('./net.js'); } catch (e) { console.warn('scoundrel: net unavailable', e); net = null; }
  build();
  resize();
  addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  requestAnimationFrame(frame);
  pad = makePad();
  document.getElementById('boot-loading')?.remove();
  if (MODE === 'spectate') startSpectating();
  else if (MODE === 'replay') startReplay();
  else {
    const saved = SV.resumeRun();
    if (SEED_PARAM && !saved) newRun(SEED_PARAM);
    else mainMenu();
  }
  window.__scoundrel.ready = true;
}
boot().catch((e) => { console.error(e); const l = document.getElementById('boot-loading'); if (l) l.textContent = 'Scoundrel failed to load: ' + e.message; });
