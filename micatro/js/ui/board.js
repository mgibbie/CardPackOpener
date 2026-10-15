// The table: HUD sidebar, card areas, state overlays (blind select, cash out,
// shop, booster packs) and the status popups. Renders ONLY from a view-model
// (engine/view.js toView()) plus the UI event stream fed by the Player — never
// from the engine's G — so a spectator draws exactly what the runner sees.
import { CardSprite } from './cardsprite.js';
import { cellEl, drawCell, CENTERS, BLINDS, TAGS, LOC, onModAtlas, MODREG, modType, cssColour, isConsumableSet } from './assets.js';
import { backgroundFor } from './gl.js';
import { markup, fmt, esc, describePlaying, describeCenterFallback, BADGE_COL } from './markup.js';
import { sound } from './sound.js';

const VISIBLE = ['hand', 'play', 'jokers', 'consumeables', 'shop_jokers', 'shop_vouchers', 'shop_booster', 'pack_cards'];
const PACK_STATES = ['TAROT_PACK', 'PLANET_PACK', 'SPECTRAL_PACK', 'STANDARD_PACK', 'BUFFOON_PACK', 'MOD_PACK', 'MOD_PACK_HAND'];
// packs that show (and target) your hand: Arcana, Spectral and draw_hand mod packs
const HAND_PACK_STATES = ['TAROT_PACK', 'SPECTRAL_PACK', 'MOD_PACK_HAND'];
const HAND_STATES = ['SELECTING_HAND', 'HAND_PLAYED', 'DRAW_TO_HAND', 'NEW_ROUND', 'PLAY_TAROT'];
// the button-hint bar (controller) sits under the controls: keep room for it
const HINT_RESERVE = 46, HINT_RESERVE_P = 54;
const FAN = { landscape: { rot: 0.1, droop: 16 }, portrait: { rot: 0.07, droop: 10 } };
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const STATUS_COL = { chips: '#009dff', mult: '#fe5f55', h_mult: '#fe5f55', x_mult: '#fe5f55', h_x_mult: '#fe5f55', dollars: '#f3b958', debuff: '#fe5f55', swap: '#8867a5' };
const NAMED_COL = { red: '#fe5f55', mult: '#fe5f55', blue: '#009dff', chips: '#009dff', green: '#4bc292', money: '#f3b958', gold: '#eac058', attention: '#ff9a00', filter: '#ff9a00', purple: '#8867a5', tarot: '#a782d1', planet: '#13afce', spectral: '#4584fa', secondary_set: '#4f6367', black: '#374244', white: '#ffffff', edition: '#4ca893', dark_edition: '#5a4fcf' };

export class Board {
  constructor(stage, bg, opts = {}) {
    this.stage = stage;
    this.bg = bg;
    this.opts = opts;
    this.readOnly = !!opts.readOnly;
    this.sprites = new Map();
    this.data = new Map();
    this.pending = new Map();
    this.areas = Object.fromEntries(VISIBLE.map((k) => [k, []]));
    this.raised = new Set();
    this.sel = null;
    this.view = null;
    this.backKey = 'b_red';
    this.now = performance.now() / 1000;
    this.locked = false;
    this.speed = 1;
    this.hud = { dollars: 0, hands: 0, discards: 0, chips: 0, ante: 1, round: 0, hand: { name: '', level: '', chips: 0, mult: 0 } };
    this.shownScore = 0;
    this.build();
    this.resize();
    addEventListener('resize', () => this.resize());
    // a mod atlas arrived (or failed): recompose the cards drawn from it
    onModAtlas((name) => this.refreshModArt(name));
    const loop = () => { this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ DOM skeleton
  build() {
    const st = this.stage;
    st.innerHTML = '';
    this.hudEl = h('div', 'hud');
    this.hudEl.innerHTML = `
      <div class="hud-blind">
        <div class="hb-title"><span class="hb-name">Choose your next Blind</span></div>
        <div class="hb-body">
          <div class="hb-chip"></div>
          <div class="hb-info">
            <div class="hb-req-l">Score at least</div>
            <div class="hb-req"><span class="chip-ico"></span><span class="hb-target">0</span></div>
            <div class="hb-reward">Reward: <span class="money"></span></div>
          </div>
        </div>
        <div class="hb-desc"></div>
      </div>
      <div class="hud-score"><div class="hs-l">Round<br>score</div><div class="hs-v"><span class="chip-ico"></span><span class="hs-num">0</span></div></div>
      <div class="hud-hand">
        <div class="hh-name"><span class="hh-hand">&nbsp;</span><span class="hh-lvl"></span></div>
        <div class="hh-cxm"><div class="hh-chips">0</div><div class="hh-x">X</div><div class="hh-mult">0</div></div>
      </div>
      <div class="hud-stats">
        <div class="hs-btns"><button class="btn red b-runinfo" type="button">Run<br>Info</button><button class="btn orange b-options" type="button">Options</button></div>
        <div class="hs-grid">
          <div class="stat s-hands"><div class="stat-l">Hands</div><div class="stat-v blue">0</div></div>
          <div class="stat s-discards"><div class="stat-l">Discards</div><div class="stat-v red">0</div></div>
          <div class="stat s-dollars wide"><div class="stat-v money">$0</div></div>
          <div class="stat s-ante"><div class="stat-l">Ante</div><div class="stat-v orange"><span class="ante-n">1</span><small>/<span class="ante-w">8</span></small></div></div>
          <div class="stat s-round"><div class="stat-l">Round</div><div class="stat-v orange">0</div></div>
        </div>
      </div>
      <div class="hud-tags"></div>`;
    st.appendChild(this.hudEl);
    const $ = (s) => this.hudEl.querySelector(s);
    this.H = {
      blind: $('.hud-blind'), bName: $('.hb-name'), bChip: $('.hb-chip'), bTarget: $('.hb-target'), bReward: $('.hb-reward .money'),
      bDesc: $('.hb-desc'), bInfo: $('.hb-info'), score: $('.hs-num'), hand: $('.hh-hand'), lvl: $('.hh-lvl'), chips: $('.hh-chips'), mult: $('.hh-mult'),
      hands: $('.s-hands .stat-v'), discards: $('.s-discards .stat-v'), dollars: $('.s-dollars .stat-v'), ante: $('.ante-n'), anteW: $('.ante-w'),
      round: $('.s-round .stat-v'), tags: $('.hud-tags'), handBox: $('.hud-hand'),
    };
    $('.b-runinfo').addEventListener('click', () => { sound.play('button'); this.opts.onMenu && this.opts.onMenu('runinfo'); });
    $('.b-options').addEventListener('click', () => { sound.play('button'); this.opts.onMenu && this.opts.onMenu('options'); });
    this.H.blind.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && this.view && this.view.blind) this.showBlindTip(this.view.blind, this.H.blind); });
    this.H.blind.addEventListener('pointerleave', () => this.hideTip());

    this.areaLabels = h('div', 'area-labels');
    this.lblJokers = h('div', 'area-lbl'); this.lblCons = h('div', 'area-lbl');
    this.lblHand = h('div', 'area-lbl hand-lbl');
    this.areaBoxJ = h('div', 'area-box'); this.areaBoxC = h('div', 'area-box');
    this.areaLabels.append(this.areaBoxJ, this.areaBoxC, this.lblJokers, this.lblCons, this.lblHand);
    st.appendChild(this.areaLabels);

    this.overlay = h('div', 'overlay'); st.appendChild(this.overlay);
    this.layer = h('div', 'cards-layer'); st.appendChild(this.layer);

    this.deckEl = h('div', 'deck-pile');
    this.deckEl.innerHTML = '<div class="deck-stack"></div><div class="deck-count">52/52</div>';
    this.deckEl.addEventListener('click', () => { sound.play('button'); this.opts.onMenu && this.opts.onMenu('deck'); });
    st.appendChild(this.deckEl);

    this.controls = h('div', 'controls');
    this.controls.innerHTML = `
      <button class="btn blue big b-play" type="button">Play Hand</button>
      <div class="sortbox"><div class="sort-l">Sort Hand</div><div class="sort-b"><button class="btn orange b-rank" type="button">Rank</button><button class="btn orange b-suit" type="button">Suit</button></div></div>
      <button class="btn red big b-discard" type="button">Discard</button>`;
    st.appendChild(this.controls);
    this.C = { play: this.controls.querySelector('.b-play'), discard: this.controls.querySelector('.b-discard'), rank: this.controls.querySelector('.b-rank'), suit: this.controls.querySelector('.b-suit') };
    this.C.play.addEventListener('click', () => this.act({ type: 'play' }, 'button'));
    this.C.discard.addEventListener('click', () => this.act({ type: 'discard' }, 'button'));
    this.C.rank.addEventListener('click', () => this.act({ type: 'sort_hand', by: 'rank' }, 'cardSlide1'));
    this.C.suit.addEventListener('click', () => this.act({ type: 'sort_hand', by: 'suit' }, 'cardSlide1'));

    this.popLayer = h('div', 'pop-layer'); st.appendChild(this.popLayer);
    this.attention = h('div', 'attention'); st.appendChild(this.attention);
    this.tip = h('div', 'tip'); this.tip.style.display = 'none'; st.appendChild(this.tip);
    this.toastEl = h('div', 'toast'); st.appendChild(this.toastEl);
    this.banner = h('div', 'banner'); this.banner.style.display = 'none'; st.appendChild(this.banner);

    // deck stack visuals
    this.renderDeckStack();

    // pointer handling for cards
    this.layer.addEventListener('pointerdown', (e) => this.onDown(e));
    addEventListener('pointermove', (e) => this.onMove(e));
    addEventListener('pointerup', (e) => this.onUp(e));
    addEventListener('pointercancel', (e) => this.onUp(e, true));
    this.stage.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.card') && !e.target.closest('.card-btns') && !e.target.closest('.tip')) { if (this.sel != null) { this.sel = null; this.refreshSelection(); } this.hideTip(); }
    });
  }

  renderDeckStack() {
    const st = this.deckEl.querySelector('.deck-stack');
    st.innerHTML = '';
    const back = CENTERS[this.backKey] || CENTERS.b_red;
    for (let i = 0; i < 4; i++) {
      const c = cellEl('centers', back.pos, 'deck-card');
      c.style.transform = `translate(${-i * 3}px,${-i * 3}px)`;
      st.appendChild(c);
    }
  }

  // ----------------------------------------------------------------- layout
  resize() {
    const vw = innerWidth, vh = innerHeight;
    const portrait = vw < vh * 0.95;
    this.mode = portrait ? 'portrait' : 'landscape';
    let W, H;
    if (portrait) { W = 720; H = Math.max(1180, Math.min(1700, Math.round(720 * vh / vw))); }
    else { H = 900; W = Math.max(1360, Math.min(2100, Math.round(900 * vw / vh))); }
    this.W = W; this.SH = H;
    this.scale = Math.min(vw / W, vh / H);
    const st = this.stage;
    st.className = this.mode + (this.view ? '' : ' no-run');
    st.style.width = W + 'px'; st.style.height = H + 'px';
    st.style.left = Math.round((vw - W * this.scale) / 2) + 'px';
    st.style.top = Math.round((vh - H * this.scale) / 2) + 'px';
    st.style.transform = `scale(${this.scale})`;
    this.cw = portrait ? 112 : 128;
    this.ch = Math.round(this.cw * 95 / 71);
    st.style.setProperty('--cw', this.cw + 'px');
    st.style.setProperty('--ch', this.ch + 'px');
    this.lowFx = vw * vh < 500000;
    this.computeRegions();
    if (this.view) this.renderOverlay();
    this.layout();
  }
  computeRegions() {
    const W = this.W, H = this.SH, R = {};
    if (this.mode === 'landscape') {
      const X0 = 420, X1 = W - 16;
      const topY = 74;
      const jw = Math.round((X1 - X0) * 0.67);
      R.jokers = { x: X0, y: topY, w: jw, h: this.ch + 16 };
      R.consumeables = { x: X0 + jw + 24, y: topY, w: X1 - X0 - jw - 24, h: this.ch + 16 };
      // bottom-up: [hint-bar reserve] controls, hand counter, hand (+ fan droop) — never overlapping
      R.controls = { x: X0 + 20, y: H - 92 - HINT_RESERVE, w: X1 - X0 - 210, h: 92 };
      R.handLbl = { x: X0 + 20 + (X1 - X0 - 210) / 2, y: R.controls.y - 30 };
      R.hand = { x: X0 + 20, y: R.handLbl.y - 4 - FAN.landscape.droop - 8 - this.ch, w: X1 - X0 - 210, h: this.ch };
      R.deck = { x: X1 - 80, y: H - 180 };
      R.play = { x: X0 + 60, y: 300, w: X1 - X0 - 260, h: this.ch };
      R.overlay = { x: X0 + 10, y: R.jokers.y + R.jokers.h + 52, w: X1 - X0 - 200, h: H - (R.jokers.y + R.jokers.h + 52) - 14 };
    } else {
      const topY = 476;
      R.jokers = { x: 12, y: topY, w: 470, h: this.ch + 12 };
      R.consumeables = { x: 494, y: topY, w: 214, h: this.ch + 12 };
      R.controls = { x: 12, y: H - 100 - HINT_RESERVE_P, w: 560, h: 100 };
      R.deck = { x: 652, y: R.controls.y + 46 };
      R.handLbl = { x: 360, y: R.controls.y - 32 };
      R.hand = { x: 12, y: R.handLbl.y - 4 - FAN.portrait.droop - 6 - this.ch, w: 696, h: this.ch };
      const pTop = R.jokers.y + R.jokers.h + 26;
      R.play = { x: 30, y: pTop + Math.max(0, (R.hand.y - pTop - this.ch) / 2 - 30), w: 660, h: this.ch };
      R.overlay = { x: 10, y: R.jokers.y + R.jokers.h + 50, w: 700, h: H - (R.jokers.y + R.jokers.h + 50) - 10 };
    }
    this.R = R;
    const pos = (el, r) => { el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; if (r.w != null) el.style.width = r.w + 'px'; if (r.h != null) el.style.height = r.h + 'px'; };
    pos(this.controls, R.controls);
    pos(this.overlay, R.overlay);
    pos(this.areaBoxJ, { x: R.jokers.x - 6, y: R.jokers.y - 6, w: R.jokers.w + 12, h: R.jokers.h + 12 });
    pos(this.areaBoxC, { x: R.consumeables.x - 6, y: R.consumeables.y - 6, w: R.consumeables.w + 12, h: R.consumeables.h + 12 });
    pos(this.lblJokers, { x: R.jokers.x, y: R.jokers.y + R.jokers.h + 8 });
    pos(this.lblCons, { x: R.consumeables.x + R.consumeables.w - 60, y: R.consumeables.y + R.consumeables.h + 8 });
    pos(this.lblHand, R.handLbl);
    this.deckEl.style.left = (R.deck.x - this.cw / 2) + 'px';
    this.deckEl.style.top = (R.deck.y - this.ch / 2) + 'px';
  }
  deckPos() { return { x: this.R.deck.x, y: this.R.deck.y }; }

  rowTargets(ids, rect, opt = {}) {
    const n = ids.length, cw = this.cw;
    if (!n) return [];
    const maxGap = cw * (opt.gap || 1.08);
    const step = n > 1 ? Math.min(maxGap, (rect.w - cw) / (n - 1)) : 0;
    const total = step * (n - 1);
    const cx = rect.x + rect.w / 2, cy = rect.y + (rect.h || this.ch) / 2;
    return ids.map((id, i) => {
      const off = i - (n - 1) / 2;
      const t = { x: cx - total / 2 + step * i, y: cy, r: 0, s: opt.scale || 1, z: (opt.z || 10) + i };
      if (opt.fan) {
        // an even fan whose spread is fixed (it compresses with the card count instead of spilling)
        const F = opt.fan, u = n > 1 ? off / ((n - 1) / 2) : 0, k = Math.min(1, (n - 1) / 7);
        t.r = u * F.rot * k; t.y += u * u * F.droop * k;
      }
      return t;
    });
  }

  layout() {
    if (!this.R) return;
    const R = this.R, state = this.view ? this.view.state : null;
    const set = (id, t) => {
      const s = this.sprites.get(id);
      if (!s || s.dragging || s.leaving) return;
      s.tgt.x = t.x; s.tgt.y = t.y; s.tgt.r = t.r; s.tgt.s = t.s; s.z = t.z;
    };
    const hl = (id) => { const d = this.data.get(id); return d && d.hl; };
    const handIds = this.areas.hand;
    const handRect = R.hand;
    this.rowTargets(handIds, handRect, { fan: FAN[this.mode], z: 100, gap: 1.02 }).forEach((t, i) => {
      if (hl(handIds[i])) t.y -= this.ch * 0.3;
      set(handIds[i], t);
    });
    const playIds = this.areas.play;
    this.rowTargets(playIds, R.play, { z: 200, gap: 1.1 }).forEach((t, i) => { if (this.raised.has(playIds[i])) t.y -= this.ch * 0.2; set(playIds[i], t); });
    for (const k of ['jokers', 'consumeables']) {
      const ids = this.areas[k];
      this.rowTargets(ids, R[k], { z: k === 'jokers' ? 300 : 320, gap: 1.06 }).forEach((t, i) => { if (this.sel === ids[i]) t.y += this.mode === 'portrait' ? 10 : 14; set(ids[i], t); });
    }
    const S = this.shopRects;
    if (state !== 'SHOP') {
      // the shop slides away (e.g. while a booster from it is open)
      for (const k of ['shop_jokers', 'shop_vouchers', 'shop_booster']) this.areas[k].forEach((id, i) => set(id, { x: this.W / 2 + (i - 1) * this.cw * 1.2, y: this.SH + this.ch, r: 0, s: 1, z: 5 }));
    }
    if (state === 'SHOP' && S) {
      this.rowTargets(this.areas.shop_jokers, S.jokers, { z: 400, gap: 1.18 }).forEach((t, i) => set(this.areas.shop_jokers[i], t));
      this.rowTargets(this.areas.shop_vouchers, S.voucher, { z: 400 }).forEach((t, i) => set(this.areas.shop_vouchers[i], t));
      this.rowTargets(this.areas.shop_booster, S.boosters, { z: 400, gap: 1.18 }).forEach((t, i) => set(this.areas.shop_booster[i], t));
    }
    const packRect = this.packRect || R.play;
    this.rowTargets(this.areas.pack_cards, packRect, { z: 450, gap: 1.12 }).forEach((t, i) => { if (this.sel === this.areas.pack_cards[i]) t.y -= 16; set(this.areas.pack_cards[i], t); });
    this.positionCardButtons();
  }

  /** Recompose mod cards (all, or those drawn from one atlas) — e.g. once their art has loaded. */
  refreshModArt(atlas) {
    for (const s of this.sprites.values()) {
      const d = s.d || {};
      if (!d.mod && !d.atlas) continue;
      if (atlas && d.atlas !== atlas) continue;
      s.vkey = ''; s.setData(d);
    }
    if (!atlas && this.view) { this.renderOverlay(); this.layout(); this.setBackground(this.view); }
  }
  setBackground(view) {
    this.bg.set(backgroundFor(view.state, view.blind && { ...view.blind, showdown: view.blind && BLINDS[view.blind.key] && BLINDS[view.blind.key].boss && BLINDS[view.blind.key].boss.showdown }, view.won && view.state === 'ROUND_EVAL', packColours(view)));
  }

  // ------------------------------------------------------------- view sync
  /** Snap the table to a full view (end of an animation sequence, or a jump). */
  setView(view, opts = {}) {
    const first = !this.view;
    this.view = view;
    this.stage.classList.remove('no-run');
    if (view.back && view.back !== this.backKey) {
      this.backKey = view.back;
      this.renderDeckStack();
      for (const s of this.sprites.values()) { s.vkey = ''; s.setData(s.d); }
    }
    const seen = new Set();
    for (const k of VISIBLE) {
      const list = (view.areas && view.areas[k]) || [];
      this.areas[k] = list.map((c) => c.id);
      for (const c of list) { this.data.set(c.id, c); seen.add(c.id); }
    }
    this.pending.clear();
    // sprites that left every visible area
    for (const [id, s] of this.sprites) {
      if (seen.has(id) || s.leaving) continue;
      this.retire(id, opts.instant ? 'drop' : 'auto');
    }
    for (const k of VISIBLE) {
      for (const id of this.areas[k]) {
        let s = this.sprites.get(id);
        if (!s) s = this.spawn(id, k, first || opts.instant);
        else s.setData(this.data.get(id));
        s.area = k;
      }
    }
    if (this.sel != null && !seen.has(this.sel)) this.sel = null;
    this.raised.clear();
    // HUD
    const H = this.hud;
    H.dollars = view.dollars; H.hands = view.hands_left; H.discards = view.discards_left;
    H.ante = view.ante; H.round = view.round; H.chips = view.chips;
    this.shownScore = view.chips;
    this.hudHand(this.opts.getPreview ? this.opts.getPreview(view) : null);
    this.renderHud();
    this.renderOverlay();
    this.refreshSelection();
    this.layout();
    this.setBackground(view);
  }

  spawn(id, area, instant) {
    const d = this.data.get(id) || this.pending.get(id) || { id, facing: 'back' };
    const s = new CardSprite(id, d, this);
    s.area = area;
    this.sprites.set(id, s);
    this.layer.appendChild(s.el);
    this.attachCard(s);
    this.layout();
    if (instant) { s.place(s.tgt.x, s.tgt.y, s.tgt.r, s.tgt.s); }
    else if (area === 'hand' || area === 'play') {
      const p = this.deckPos(); s.place(p.x, p.y, 0.1, 1);
      if (d.facing !== 'back') { s.setData({ ...d, facing: 'back' }); s.startFlip(d, 0.3 / Math.max(1, this.speed * 0.7)); }
    }
    else { s.place(s.tgt.x, s.tgt.y, s.tgt.r, s.tgt.s); s.startMaterialize(0.45 / Math.max(1, this.speed * 0.6)); }
    return s;
  }
  /** Remove a sprite: playing cards fly to the deck, others dissolve. */
  retire(id, how = 'auto', dest) {
    const s = this.sprites.get(id);
    if (!s || s.leaving) return;
    s.leaving = true;
    const d = s.d || {};
    const playing = !!d.front || s.area === 'hand' || s.area === 'play';
    if (how === 'drop') { this.destroySprite(id); return; }
    if (how === 'deck' || how === 'discard' || (how === 'auto' && playing)) {
      const p = (how === 'discard' || dest === 'discard') ? { x: this.W + this.cw, y: this.R.hand.y + this.ch / 2 } : this.deckPos();
      s.tgt.x = p.x; s.tgt.y = p.y; s.tgt.r = how === 'discard' ? 0.4 : 0; s.z = 50;
      setTimeout(() => this.destroySprite(id), 650 / Math.max(1, this.speed * 0.7));
    } else {
      s.startDissolve(0.7 / Math.max(1, this.speed * 0.6), () => this.destroySprite(id));
    }
  }
  destroySprite(id) {
    const s = this.sprites.get(id);
    if (!s) return;
    s.destroy();
    this.sprites.delete(id);
  }

  // ---------------------------------------------------------------- HUD
  hudHand(p) {
    const H = this.hud.hand;
    if (p) { H.name = p.name; H.level = p.level; H.chips = p.chips; H.mult = p.mult; H.blocked = !!p.blocked; }
    else { H.name = ''; H.level = ''; H.chips = 0; H.mult = 0; H.blocked = false; }
    H.total = null;
  }
  renderHud() {
    const v = this.view, H = this.H, hud = this.hud;
    if (!v) return;
    H.dollars.textContent = '$' + fmt(hud.dollars);
    H.hands.textContent = hud.hands;
    H.discards.textContent = hud.discards;
    H.ante.textContent = hud.ante;
    H.anteW.textContent = v.win_ante || 8;
    H.round.textContent = hud.round;
    H.score.textContent = fmt(this.shownScore);
    this.renderHandBox();
    this.renderBlindPanel(v.blind, v.state);
    this.renderTagsEtc(v);
  }
  renderBlindPanel(b, state) {
    const H = this.H;
    const selecting = state === 'BLIND_SELECT' || state === 'SHOP' || !b || !b.key || b.key === 'bl_none';
    const col = b && b.key && !selecting ? (b.boss ? (b.colour || '#b44430') : '#50846e') : '#3f5154';
    H.blind.style.setProperty('--bcol', col);
    H.blind.classList.toggle('selecting', selecting);
    if (selecting) {
      H.bName.textContent = state === 'SHOP' ? 'Shop' : 'Choose your next Blind';
      H.bChip.innerHTML = ''; H.bInfo.style.visibility = 'hidden'; H.bDesc.innerHTML = '';
      this.chipAnim = null;
    } else {
      H.bName.textContent = b.name;
      H.bInfo.style.visibility = '';
      H.bTarget.textContent = fmt(b.chips);
      H.bReward.textContent = b.dollars > 0 ? '$'.repeat(Math.min(b.dollars, 8)) + '+' : '';
      if (b.dollars > 0) H.bReward.textContent = '$'.repeat(Math.min(b.dollars, 10));
      if (!this.chipAnim || this.chipAnim.key !== b.key) {
        H.bChip.innerHTML = '';
        const c = document.createElement('canvas'); c.width = 68; c.height = 68; c.className = 'blind-chip';
        H.bChip.appendChild(c);
        this.chipAnim = { key: b.key, canvas: c, pos: b.pos || (BLINDS[b.key] && BLINDS[b.key].pos) };
      }
      const desc = b.desc;
      H.bDesc.innerHTML = b.boss && desc ? (desc.lines || []).map((l) => markup(l)).join('<br>') + (b.disabled ? '<br><span style="color:#4bc292">Disabled</span>' : '') : '';
    }
  }
  renderTagsEtc(v) {
    const H = this.H;
    // tags
    const tags = v.tags || [];
    const key = tags.map((t) => t.key).join(',');
    if (key !== this._tagsKey) {
      this._tagsKey = key;
      H.tags.innerHTML = '';
      for (const t of tags) {
        const pos = TAGS[t.key] && TAGS[t.key].pos;
        if (!pos) continue;
        const c = cellEl('tags', pos, 'tag-ico');
        c.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.showTagTip(t, c); });
        c.addEventListener('pointerleave', () => this.hideTip());
        c.addEventListener('click', () => this.showTagTip(t, c));
        H.tags.appendChild(c);
      }
    }
    this.lblJokers.textContent = `${this.areas.jokers.length}/${v.joker_limit}`;
    this.lblCons.textContent = `${this.areas.consumeables.length}/${v.consumeable_limit}`;
    this.lblHand.textContent = HAND_STATES.includes(v.state) || HAND_PACK_STATES.includes(v.state) ? `${this.areas.hand.length}/${v.hand_limit}` : '';
    this.deckEl.querySelector('.deck-count').textContent = `${v.deck_count}/${v.deck_total}`;
    // controls
    const L = v.legal || {};
    const playing = HAND_STATES.includes(v.state) && !v.over;
    this.controls.style.display = playing ? '' : 'none';
    const busy = this.locked || this.readOnly;
    this.C.play.disabled = busy || !L.can_play;
    this.C.discard.disabled = busy || !L.can_discard;
    this.C.rank.disabled = this.C.suit.disabled = busy || v.state !== 'SELECTING_HAND';
    this.controls.classList.toggle('readonly', this.readOnly);
  }
  renderHandBox() {
    const hh = this.hud.hand, H = this.H;
    if (hh.total != null) { H.hand.textContent = fmt(hh.total); H.lvl.textContent = ''; H.handBox.classList.add('total'); }
    else {
      H.handBox.classList.remove('total');
      H.hand.innerHTML = hh.name ? esc(hh.name) : '&nbsp;';
      H.lvl.textContent = hh.level ? 'lvl.' + hh.level : '';
      H.lvl.style.color = levelColour(hh.level);
    }
    const num = (x) => (typeof x === 'number' ? fmt(x) : (x == null ? '0' : String(x)));
    H.chips.textContent = num(hh.chips);
    H.mult.textContent = num(hh.mult);
    H.handBox.classList.toggle('blocked', !!hh.blocked);
  }
  bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  // ------------------------------------------------------------- overlays
  renderOverlay() {
    const v = this.view;
    const ov = this.overlay;
    this.shopRects = null; this.packRect = null;
    ov.innerHTML = '';
    ov.className = 'overlay';
    if (!v) return;
    if (v.state === 'BLIND_SELECT') this.renderBlindSelect(ov, v);
    else if (v.state === 'ROUND_EVAL' && v.round_eval) this.renderCashOut(ov, v);
    else if (v.state === 'SHOP') this.renderShop(ov, v);
    else if (PACK_STATES.includes(v.state)) this.renderPack(ov, v);
  }

  renderBlindSelect(ov, v) {
    ov.classList.add('ov-blinds');
    const row = h('div', 'blind-row');
    for (const k of ['Small', 'Big', 'Boss']) {
      const c = v.choices && v.choices[k];
      if (!c) continue;
      const stateCls = String(c.state || 'Upcoming').toLowerCase();
      const col = h('div', `blind-col st-${stateCls} ${k === 'Boss' ? 'boss' : ''}`);
      col.style.setProperty('--bcol', k === 'Boss' ? (c.colour || '#b44430') : (k === 'Small' ? '#3b7fa8' : '#d68f28'));
      const head = h('div', 'blind-head');
      if (c.state === 'Select') {
        const b = h('button', 'btn orange b-select', 'Select');
        b.type = 'button';
        b.disabled = this.readOnly || this.locked;
        b.addEventListener('click', () => this.act({ type: 'select_blind' }, 'button'));
        head.appendChild(b);
      } else head.innerHTML = `<div class="blind-state">${esc({ Upcoming: 'Upcoming', Defeated: 'Defeated', Skipped: 'Skipped', Current: 'Current' }[c.state] || c.state)}</div>`;
      col.appendChild(head);
      const body = h('div', 'blind-body');
      body.innerHTML = `<div class="blind-name">${esc(c.name)}</div>`;
      const chip = document.createElement('canvas'); chip.width = 68; chip.height = 68; chip.className = 'blind-chip big';
      chip._pos = c.pos || (BLINDS[c.key] && BLINDS[c.key].pos);
      body.appendChild(chip);
      if (k === 'Boss' && c.desc) body.appendChild(h('div', 'blind-desc', (c.desc.lines || []).map(markup).join('<br>')));
      body.appendChild(h('div', 'blind-req', `<div class="req-l">Score at least</div><div class="req-v"><span class="chip-ico"></span>${fmt(c.chips)}</div>`));
      body.appendChild(h('div', 'blind-rew', c.dollars ? `Reward: <span class="money">${'$'.repeat(Math.min(10, c.dollars))}+</span>` : '<span class="muted">No reward money</span>'));
      col.appendChild(body);
      if (k !== 'Boss' && c.tag) {
        const sk = h('div', 'blind-skip');
        const pos = TAGS[c.tag] && TAGS[c.tag].pos;
        sk.innerHTML = '<div class="or">or</div>';
        const line = h('div', 'skip-line');
        if (pos) {
          const tc = cellEl('tags', pos, 'tag-ico');
          tc.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.showTagTip({ key: c.tag, desc: c.tagDesc }, tc); });
          tc.addEventListener('pointerleave', () => this.hideTip());
          tc.addEventListener('click', () => this.showTagTip({ key: c.tag, desc: c.tagDesc }, tc));
          line.appendChild(tc);
        }
        const b = h('button', 'btn red b-skip', 'Skip Blind'); b.type = 'button';
        b.disabled = this.readOnly || this.locked || c.state !== 'Select' || !(v.legal && v.legal.can_skip_blind);
        b.addEventListener('click', () => this.act({ type: 'skip_blind' }, 'button'));
        line.appendChild(b);
        sk.appendChild(line);
        col.appendChild(sk);
      } else if (k === 'Boss' && v.legal && v.legal.can_reroll_boss) {
        const rb = h('button', 'btn red b-reroll-boss', 'Reroll Boss <span class="money">$10</span>'); rb.type = 'button';
        rb.disabled = this.readOnly || this.locked;
        rb.addEventListener('click', () => this.act({ type: 'reroll_boss' }, 'button'));
        const sk = h('div', 'blind-skip'); sk.appendChild(rb); col.appendChild(sk);
      }
      col.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && k === 'Boss' && c.desc) this.showBlindTip({ ...c, boss: true }, col); });
      col.addEventListener('pointerleave', () => this.hideTip());
      row.appendChild(col);
    }
    ov.appendChild(row);
  }

  renderCashOut(ov, v) {
    ov.classList.add('ov-eval');
    const panel = h('div', 'eval-panel');
    const b = h('button', 'btn orange big b-cashout', `Cash Out: <span class="money">$${fmt(v.round_eval.total)}</span>`); b.type = 'button';
    b.disabled = this.readOnly || this.locked;
    b.addEventListener('click', () => this.act({ type: 'cash_out' }, 'coin1'));
    panel.appendChild(b);
    const rows = h('div', 'eval-rows');
    for (const r of v.round_eval.rows || []) {
      let label = '';
      if (r.name === 'blind1') {
        const key = r.blind || (v.blind && v.blind.key);
        const ch = Object.values(v.choices || {}).find((c) => c.key === key);
        const name = (ch && ch.name) || (BLINDS[key] && BLINDS[key].name) || (v.blind && v.blind.name) || 'Blind';
        const chips = (v.blind && v.blind.key === key && v.blind.chips) || (ch && ch.chips) || 0;
        label = `<span class="ev-blind">${esc(name)}</span><span class="ev-sub">Score at least ${fmt(chips)}</span>`;
      } else if (r.name === 'hands') label = `<b class="blue">${r.disp}</b> Remaining Hands <span class="ev-sub">($1 each)</span>`;
      else if (r.name === 'discards') label = `<b class="red">${r.disp}</b> Remaining Discards`;
      else if (r.name === 'interest') label = `<b class="money">${r.disp}</b> interest per <b class="money">$5</b> <span class="ev-sub">(${(v.interest_cap || 25) / 5} max)</span>`;
      else if (/^joker/.test(r.name)) label = esc((CENTERS[r.center] && CENTERS[r.center].name) || 'Joker');
      else if (/^tag/.test(r.name)) label = esc((TAGS[r.tag] && TAGS[r.tag].name) || 'Tag');
      else label = esc(r.name);
      const amt = r.dollars <= 0 ? '<span class="muted">-</span>' : (r.dollars <= 9 ? '$'.repeat(r.dollars) : '$' + fmt(r.dollars));
      const row = h('div', 'eval-row' + (r.name === 'blind1' ? ' first' : ''), `<div class="ev-l">${label}</div><div class="ev-r money">${amt}</div>`);
      rows.appendChild(row);
    }
    panel.appendChild(rows);
    ov.appendChild(panel);
  }

  renderShop(ov, v) {
    ov.classList.add('ov-shop');
    const W = this.R.overlay.w, Hh = this.R.overlay.h;
    const panel = h('div', 'shop-panel');
    const sign = document.createElement('canvas'); sign.width = 226; sign.height = 114; sign.className = 'shop-sign';
    this.shopSign = sign;
    panel.appendChild(sign);
    const btns = h('div', 'shop-btns');
    const nb = h('button', 'btn red big b-next', 'Next<br>Round'); nb.type = 'button';
    nb.disabled = this.readOnly || this.locked;
    nb.addEventListener('click', () => this.act({ type: 'next_round' }, 'button'));
    const rb = h('button', 'btn green big b-reroll', `Reroll<br><span class="money">$${v.reroll_cost}</span>`); rb.type = 'button';
    rb.disabled = this.readOnly || this.locked || !(v.legal && v.legal.can_reroll);
    rb.addEventListener('click', () => this.act({ type: 'reroll_shop' }, 'coin2'));
    btns.append(nb, rb);
    panel.appendChild(btns);
    const vl = h('div', 'shop-vlabel', `ANTE ${v.ante} VOUCHER`);
    panel.appendChild(vl);
    ov.appendChild(panel);
    // slot rects in stage coords (cards are positioned by layout())
    const ox = this.R.overlay.x, oy = this.R.overlay.y;
    if (this.mode === 'landscape') {
      const bw = 200;
      this.shopRects = {
        jokers: { x: ox + bw + 40, y: oy + 96, w: W - bw - 60, h: this.ch },
        voucher: { x: ox + 30, y: oy + Hh - this.ch - 60, w: this.cw + 40, h: this.ch },
        boosters: { x: ox + W * 0.45, y: oy + Hh - this.ch - 60, w: W * 0.5, h: this.ch },
      };
      vl.style.left = '30px'; vl.style.top = (Hh - 52) + 'px'; vl.style.width = (this.cw + 40) + 'px';
    } else {
      this.shopRects = {
        jokers: { x: ox + 190, y: oy + 120, w: W - 200, h: this.ch },
        voucher: { x: ox + 20, y: oy + 120 + this.ch + 120, w: this.cw + 40, h: this.ch },
        boosters: { x: ox + 210, y: oy + 120 + this.ch + 120, w: W - 220, h: this.ch },
      };
      vl.style.left = '20px'; vl.style.top = (120 + this.ch * 2 + 130) + 'px'; vl.style.width = (this.cw + 40) + 'px';
    }
  }

  renderPack(ov, v) {
    ov.classList.add('ov-pack');
    const kind = v.pack_kind || 'Booster';
    const name = packName(kind, v.state);
    const hd = h('div', 'pack-head', `<div class="pack-name">${esc(name)}</div><div class="pack-choose">Choose <b>${v.pack_choices || 1}</b></div>`);
    const sk = h('button', 'btn grey b-skip-pack', 'Skip'); sk.type = 'button';
    sk.disabled = this.readOnly || this.locked;
    sk.addEventListener('click', () => this.act({ type: 'skip_booster' }, 'button'));
    hd.appendChild(sk);
    ov.appendChild(hd);
    const showHand = v.state === 'MOD_PACK_HAND' || ((v.state === 'TAROT_PACK' || v.state === 'SPECTRAL_PACK') && (kind === 'Arcana' || kind === 'Spectral'));
    ov.classList.toggle('ov-mod-pack', /^MOD_PACK/.test(v.state));
    const R = this.R;
    if (showHand) this.packRect = { x: R.play.x, y: R.play.y - (this.mode === 'portrait' ? 6 : 10), w: R.play.w, h: this.ch };
    else this.packRect = { x: R.play.x, y: (R.play.y + R.hand.y) / 2, w: R.play.w, h: this.ch };
    hd.style.top = (this.packRect.y - R.overlay.y + this.ch + 46) + 'px';
  }

  // ------------------------------------------------- selection + buttons
  refreshSelection() {
    for (const s of this.sprites.values()) {
      if (s.btns && (s.id !== this.sel)) { s.btns.remove(); s.btns = null; }
      if (s.priceTag && !['shop_jokers', 'shop_vouchers', 'shop_booster'].includes(s.area)) { s.priceTag.remove(); s.priceTag = null; }
    }
    // price tags on shop items
    if (this.view && this.view.state === 'SHOP') {
      for (const k of ['shop_jokers', 'shop_vouchers', 'shop_booster']) for (const id of this.areas[k]) {
        const s = this.sprites.get(id); const d = this.data.get(id);
        if (!s || !d) continue;
        if (!s.priceTag) { s.priceTag = h('div', 'price-tag'); s.el.appendChild(s.priceTag); }
        s.priceTag.textContent = '$' + (d.cost != null ? d.cost : '?');
        s.priceTag.classList.toggle('poor', d.cost > this.hud.dollars);
      }
    }
    const s = this.sel != null ? this.sprites.get(this.sel) : null;
    if (s && !this.readOnly && !s.btns) {
      const btns = this.cardButtons(s);
      if (btns) { s.btns = btns; s.el.appendChild(btns); }
    }
    this.layout();
  }
  cardButtons(s) {
    const d = this.data.get(s.id) || s.d;
    const v = this.view;
    const wrap = h('div', 'card-btns');
    const add = (label, cls, action, snd) => {
      const b = h('button', 'btn ' + cls, label); b.type = 'button';
      b.disabled = this.locked;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.stopPropagation(); this.act(action, snd); });
      wrap.appendChild(b);
    };
    const consumable = isConsumableSet(d.set);
    if (s.area === 'jokers' || s.area === 'consumeables') {
      add(`Sell<br><span class="money">$${d.sell != null ? d.sell : 0}</span>`, 'green sell', { type: 'sell', id: s.id }, 'coin2');
      if (s.area === 'consumeables') add('Use', 'red use', { type: 'use', id: s.id, targets: this.handHighlighted() }, 'button');
      wrap.classList.add(s.area === 'jokers' ? 'side' : 'side');
    } else if (s.area === 'shop_jokers') {
      add(`Buy`, 'green buy', { type: 'buy', id: s.id }, 'coin1');
      if (consumable) add('Buy<br>&amp; Use', 'green buyuse', { type: 'buy', id: s.id, use: true }, 'coin1');
      wrap.classList.add('below');
    } else if (s.area === 'shop_vouchers') {
      add('Redeem', 'green buy', { type: 'buy', id: s.id }, 'coin1'); wrap.classList.add('below');
    } else if (s.area === 'shop_booster') {
      add('Open', 'green buy', { type: 'buy', id: s.id }, 'coin1'); wrap.classList.add('below');
    } else if (s.area === 'pack_cards') {
      add(consumable ? 'Use' : 'Select', 'green buy', { type: 'use', id: s.id, targets: this.handHighlighted() }, 'button'); wrap.classList.add('below');
    } else return null;
    if (v && !['SHOP'].includes(v.state) && s.area.startsWith('shop')) return null;
    return wrap;
  }
  handHighlighted() { return this.areas.hand.filter((id) => { const d = this.data.get(id); return d && d.hl; }); }
  positionCardButtons() { /* buttons live inside the card element; nothing to do */ }

  act(a, snd) {
    if (this.readOnly || this.locked) return;
    if (a.type === 'use' || a.type === 'sell' || a.type === 'buy') a = { ...a };
    if (a.type === 'use') a.targets = this.handHighlighted();
    if (snd) sound.play(snd);
    const r = this.opts.onAction ? this.opts.onAction(a) : null;
    if (r && !r.ok && r.error) {
      sound.play('cancel');
      this.toast(errorText(r.error));
      if (a.id != null) { const s = this.sprites.get(a.id); if (s) s.juiceUp(0.3, 0.3); }
    } else if (a.type === 'sell' || a.type === 'buy' || a.type === 'use') { this.sel = null; }
  }

  // -------------------------------------------------------- card pointer
  attachCard(s) {
    s.el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || this.drag) return;
      s.hover = true;
      if (!this.locked || this.readOnly) sound.play('paper1', 0.9 + Math.random() * 0.2, 0.35);
      this.showCardTip(s);
    });
    s.el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !s.hover) return;
      const r = s.el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      s.tilt.ty = nx * 22; s.tilt.tx = -ny * 22;
    });
    s.el.addEventListener('pointerleave', () => { s.hover = false; s.tilt.tx = s.tilt.ty = 0; if (this.tipFor === s.id && this.sel !== s.id) this.hideTip(); });
  }
  toStage(e) { const r = this.stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale }; }
  onDown(e) {
    const el = e.target.closest('.card');
    if (!el || e.target.closest('.card-btns')) return;
    const id = +el.dataset.id;
    const s = this.sprites.get(id);
    if (!s || s.leaving) return;
    e.preventDefault();
    const p = this.toStage(e);
    this.press = { id, x0: p.x, y0: p.y, t0: performance.now(), pointerId: e.pointerId, moved: false, long: false, type: e.pointerType };
    if (e.pointerType !== 'mouse') {
      this.press.timer = setTimeout(() => {
        if (!this.press || this.press.moved) return;
        this.press.long = true;
        s.hover = true;
        this.showCardTip(s, true);
        if (navigator.vibrate) try { navigator.vibrate(8); } catch (err) { /* ignore */ }
      }, 420);
    }
  }
  onMove(e) {
    const P = this.press;
    if (!P || P.pointerId !== e.pointerId) return;
    const p = this.toStage(e);
    const s = this.sprites.get(P.id);
    if (!s) return;
    if (!P.moved && Math.hypot(p.x - P.x0, p.y - P.y0) > 10) {
      P.moved = true;
      clearTimeout(P.timer);
      const area = s.area;
      const reorderable = !this.readOnly && !this.locked && ['hand', 'jokers', 'consumeables'].includes(area) && this.view &&
        (area !== 'hand' || this.view.state === 'SELECTING_HAND' || PACK_STATES.includes(this.view.state));
      if (reorderable) {
        this.drag = { id: P.id, area, start: this.areas[area].slice(), dx: s.T.x - P.x0, dy: s.T.y - P.y0 };
        s.dragging = true; s.z = 999; this.hideTip();
        if (P.long) s.hover = false;
      }
    }
    if (this.drag && this.drag.id === P.id) {
      s.tgt.x = p.x + this.drag.dx; s.tgt.y = p.y + this.drag.dy; s.tgt.r = 0;
      s.el.style.zIndex = 999;
      // live re-slot among siblings
      const ids = this.areas[this.drag.area];
      const others = ids.filter((x) => x !== P.id);
      let idx = others.length;
      for (let i = 0; i < others.length; i++) { const o = this.sprites.get(others[i]); if (o && s.tgt.x < o.T.x) { idx = i; break; } }
      others.splice(idx, 0, P.id);
      if (others.join() !== ids.join()) { this.areas[this.drag.area] = others; this.layout(); }
    }
  }
  onUp(e, cancel) {
    const P = this.press;
    if (!P || P.pointerId !== e.pointerId) return;
    clearTimeout(P.timer);
    this.press = null;
    const s = this.sprites.get(P.id);
    if (this.drag && this.drag.id === P.id) {
      const D = this.drag; this.drag = null;
      if (s) s.dragging = false;
      const now = this.areas[D.area];
      if (!cancel && now.join() !== D.start.join()) {
        sound.play('cardSlide2');
        const r = this.opts.onAction ? this.opts.onAction({ type: 'reorder', area: D.area, ids: now.slice() }) : null;
        if (r && !r.ok) this.areas[D.area] = D.start;
      }
      this.layout();
      return;
    }
    if (cancel || !s) return;
    if (P.long) { s.hover = false; return; }
    if (!P.moved) this.clickCard(s, P.type);
  }
  clickCard(s, ptype) {
    const v = this.view;
    if (!v) return;
    if (this.readOnly) { this.showCardTip(s, true); return; }
    if (s.area === 'hand') {
      if (this.locked) return;
      if (v.state === 'SELECTING_HAND' || HAND_PACK_STATES.includes(v.state)) {
        const d = this.data.get(s.id);
        sound.play(d && d.hl ? 'cardSlide2' : 'cardSlide1', 1, 0.6);
        const r = this.opts.onAction && this.opts.onAction({ type: 'highlight', id: s.id });
        if (r && r.ok === false) { s.juiceUp(0.2, 0.2); }
      }
      return;
    }
    if (['jokers', 'consumeables', 'shop_jokers', 'shop_vouchers', 'shop_booster', 'pack_cards'].includes(s.area)) {
      sound.play('cardSlide1', 1.1, 0.6);
      this.sel = this.sel === s.id ? null : s.id;
      this.refreshSelection();
      if (this.sel === s.id) { if (ptype !== 'mouse') this.showCardTip(s, true); s.juiceUp(0.12, 0.1); } else this.hideTip();
    }
  }

  // ---------------------------------------------------------- tooltips
  descFor(id, s) {
    const d = this.data.get(id) || (s && s.d) || {};
    if (d.desc) return d.desc;
    if (d.front || (CENTERS[d.center] && ['Default', 'Enhanced'].includes(CENTERS[d.center].set))) return describePlaying(d);
    return describeCenterFallback(d.center);
  }
  showCardTip(s, sticky) {
    const desc = this.descFor(s.id, s);
    if (!desc) return;
    const d = this.data.get(s.id) || s.d;
    let extra = '';
    if (d.perish_tally != null && d.perishable) extra += `<div class="tip-note">Perishable: ${d.perish_tally} rounds left</div>`;
    this.renderTip(desc, d, extra);
    this.tipFor = s.id;
    this.placeTip(s.T.x, s.T.y, s.area);
  }
  renderTip(desc, d, extra = '') {
    const all = desc.badges || [];
    const isMod = (b) => typeof b === 'object' && b && b.key === 'mod';
    const badges = all.filter((b) => !isMod(b)).map((b) => {
      const txt = typeof b === 'string' ? b : (b.label || b.text || b.name || b.key || '');
      const key = typeof b === 'object' && b.key ? b.key : String(txt).toLowerCase();
      return `<span class="badge${/^(foil|holographic|polychrome|negative)$/i.test(key) ? ' ed' : ''}" style="background:${badgeColour(b, key, txt)}">${esc(txt)}</span>`;
    }).join('');
    // the mod badge sits small under the card-type badges (Steamodded style)
    const modB = all.filter(isMod).map((b) => `<span class="badge mod-badge" style="background:${cssColour(b.colour || b.color) || '#4f6367'}">${esc(b.label || b.mod || 'Mod')}</span>`).join('');
    const body = (lines0, colours) => (lines0 || []).map((l) => (l === '' ? '<div class="tip-gap"></div>' : `<div>${markup(l, colours)}</div>`)).join('');
    const lines = body(desc.lines, desc.colours);
    const info = (desc.info || []).filter((x) => x && (x.lines || []).length).slice(0, 3)
      .map((x) => `<div class="tip-info"><div class="ti-name">${esc(x.name || '')}</div><div class="tip-body">${body(x.lines)}</div></div>`).join('');
    this.tip.innerHTML = `<div class="tip-main"><div class="tip-name">${esc(desc.name || (d && d.name) || '')}</div>${lines ? `<div class="tip-body">${lines}</div>` : ''}${extra}${badges ? `<div class="tip-badges">${badges}</div>` : ''}${modB ? `<div class="tip-modbadges">${modB}</div>` : ''}</div>${info}`;
    this.tip.style.display = '';
  }
  placeTip(x, y, area) {
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    let tx = x - tw / 2, ty;
    const below = area === 'jokers' || area === 'consumeables';
    if (below) ty = y + this.ch * 0.55 + 12; else ty = y - this.ch * 0.6 - th - 14;
    if (ty < 8) ty = y + this.ch * 0.55 + 12;
    if (ty + th > this.SH - 8) ty = Math.max(8, y - this.ch * 0.6 - th - 14);
    tx = Math.max(8, Math.min(this.W - tw - 8, tx));
    this.tip.style.transform = `translate(${tx}px,${ty}px)`;
  }
  elCenter(el) {
    const r = el.getBoundingClientRect(), sr = this.stage.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - sr.left) / this.scale, y: (r.top + r.height / 2 - sr.top) / this.scale, h: r.height / this.scale };
  }
  showTagTip(t, el) {
    const desc = t.desc || { name: (TAGS[t.key] && TAGS[t.key].name) || t.key, lines: (LOC.descriptions.Tag[t.key] && LOC.descriptions.Tag[t.key].text) || [] };
    this.renderTip(desc, null);
    const c = this.elCenter(el);
    this.tipFor = 'tag';
    this.placeTipAt(c.x, c.y, c.h);
  }
  showBlindTip(b, el) {
    const desc = b.desc || { name: b.name, lines: [] };
    this.renderTip({ name: desc.name || b.name, lines: desc.lines || [] }, null);
    const c = this.elCenter(el);
    this.tipFor = 'blind';
    this.placeTipAt(c.x, c.y, c.h);
  }
  placeTipAt(x, y, hh) {
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    let ty = y - hh / 2 - th - 10;
    if (ty < 8) ty = y + hh / 2 + 10;
    const tx = Math.max(8, Math.min(this.W - tw - 8, x - tw / 2));
    this.tip.style.transform = `translate(${tx}px,${ty}px)`;
  }
  hideTip() { this.tip.style.display = 'none'; this.tipFor = null; }

  // --------------------------------------------------- popups & feedback
  popup(id, text, colour, kind) {
    const s = this.sprites.get(id);
    let x, y, below = false;
    if (s) { x = s.T.x; below = s.area === 'jokers' || s.area === 'consumeables'; y = below ? s.T.y + this.ch * 0.5 + 6 : s.T.y - this.ch * 0.5 - 8; }
    else { x = this.R.play.x + this.R.play.w / 2; y = this.R.play.y; }
    const p = h('div', 'popup' + (below ? ' below' : '') + (kind ? ' ' + kind : ''));
    p.textContent = text;
    if (kind === 'dark-ed') p.classList.add('dark-ed'); else p.style.background = colour;
    p.style.left = x + 'px'; p.style.top = y + 'px';
    p.style.animationDuration = (0.95 / Math.max(0.5, this.speed * 0.75)) + 's';
    this.popLayer.appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }
  floatText(el, text, cls) {
    const c = this.elCenter(el);
    const p = h('div', 'popup float ' + (cls || ''));
    p.textContent = text;
    p.style.left = c.x + 'px'; p.style.top = (c.y - c.h / 2) + 'px';
    this.popLayer.appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }
  attn(text, colour) {
    const a = this.attention;
    a.textContent = text;
    a.style.color = colour || '#fff';
    a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
  }
  toast(msg) {
    const t = this.toastEl;
    t.textContent = msg;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  }
  setBanner(html) { if (!html) { this.banner.style.display = 'none'; return; } this.banner.innerHTML = html; this.banner.style.display = ''; }
  setLocked(on) {
    this.locked = !!on;
    this.stage.classList.toggle('locked', this.locked);
    if (this.view) this.renderHud();
    for (const b of this.overlay.querySelectorAll('button')) if (on) b.disabled = true;
    if (!on && this.view) { this.renderOverlay(); this.refreshSelection(); }
  }

  /** Tween the round score display. */
  tweenScore(to, dur) {
    const from = this.shownScore, t0 = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / (dur * 1000));
      this.shownScore = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      this.H.score.textContent = fmt(this.shownScore);
      if (p < 1) requestAnimationFrame(step);
    };
    step();
  }

  // ------------------------------------------------- sequence (event) API
  beginSequence(finalView) {
    this._finalView = finalView;
    for (const k of VISIBLE) for (const c of (finalView.areas && finalView.areas[k]) || []) this.pending.set(c.id, c);
    this.sel = null; this.refreshSelection(); this.hideTip();
  }
  areaOf(id) { for (const k of VISIBLE) if (this.areas[k].includes(id)) return k; return null; }
  removeFromAreas(id) { for (const k of VISIBLE) { const i = this.areas[k].indexOf(id); if (i >= 0) this.areas[k].splice(i, 1); } }

  /** Apply one UI event; returns how long (seconds at 1×) the player should wait after it. */
  applyEvent(ev) {
    const sp = this.speed;
    if (this.opts.onEvent) { try { this.opts.onEvent(ev); } catch (e) { /* feedback hooks never break playback */ } }
    switch (ev.type) {
      case 'move': {
        const id = ev.card, to = ev.to;
        const from = this.areaOf(id);
        this.removeFromAreas(id);
        if (VISIBLE.includes(to)) {
          let s = this.sprites.get(id);
          if (s && s.leaving) { this.destroySprite(id); s = null; }
          if (ev.front) this.areas[to].unshift(id); else this.areas[to].push(id);
          if (!s) {
            if (!this.data.has(id) && this.pending.has(id)) this.data.set(id, this.pending.get(id));
            if (!this.data.has(id)) this.data.set(id, { id, facing: 'back' });
            s = this.spawn(id, to, false);
          }
          s.area = to;
          if (to === 'play') { const d = this.data.get(id); if (d) this.data.set(id, { ...d, hl: false }); }
          this.layout();
          if (to === 'hand') { sound.play('card1', 0.9 + Math.random() * 0.2, 0.5); return from === 'play' ? 0.05 : 0.08; }
          if (to === 'play') { sound.play('cardSlide1', 1, 0.7); return 0.12; }
          if (to === 'jokers' || to === 'consumeables') { sound.play('card1'); return 0.2; }
          return 0.04;
        }
        if (this.sprites.has(id)) {
          this.retire(id, to === 'discard' ? 'discard' : 'deck');
          this.layout();
          return to === 'discard' ? 0.06 : 0.035;
        }
        return 0;
      }
      case 'scoring_hand': {
        this.raised = new Set(ev.cards || []);
        this.layout();
        this.hud.hand.name = ev.disp || ev.hand || ''; this.renderHandBox();
        return 0.25;
      }
      case 'hand_text': {
        const hh = this.hud.hand;
        hh.total = null;
        if (ev.handname != null) { hh.name = ev.handname; hh.level = ev.level; }
        if (ev.chips != null && ev.chips !== hh.chips) { hh.chips = ev.chips; this.bump(this.H.chips); }
        if (ev.mult != null && ev.mult !== hh.mult) { hh.mult = ev.mult; this.bump(this.H.mult); }
        this.renderHandBox();
        if (ev.modded) { this.bump(this.H.blind); return 0.3; }
        return ev.handname != null ? 0.35 : 0.02;
      }
      case 'status': return this.statusEvent(ev);
      case 'juice': { const s = this.sprites.get(ev.card); if (s) s.juiceUp(); return 0; }
      case 'hand_total': {
        this.hud.hand.chips = ev.chips; this.hud.hand.mult = ev.mult;
        this.hud.hand.total = ev.total; this.renderHandBox(); this.bump(this.H.handBox);
        sound.play('chips2', 1, 0.8);
        return 0.55;
      }
      case 'chips': {
        sound.play(ev.add ? 'chips1' : 'chips2', 1, ev.add ? 0.9 : 0.4);
        this.hud.chips = ev.total;
        this.tweenScore(ev.total, 0.5 / sp);
        if (ev.add) { this.bg.pulse(0.5); this.bump(this.H.score.parentNode); }
        this.hudHand(null); setTimeout(() => this.renderHandBox(), 300 / sp);
        return ev.add ? 0.6 : 0.05;
      }
      case 'dollars': {
        this.hud.dollars = ev.total;
        this.H.dollars.textContent = '$' + fmt(ev.total);
        this.bump(this.H.dollars);
        if (ev.mod) this.floatText(this.H.dollars, (ev.mod > 0 ? '+$' : '-$') + fmt(Math.abs(ev.mod)), ev.mod > 0 ? 'money' : 'red');
        if (ev.mod > 0) sound.play('coin' + (1 + Math.floor(Math.random() * 3)), 1, 0.5);
        return 0.12;
      }
      case 'hands': this.hud.hands = ev.total; this.H.hands.textContent = ev.total; this.bump(this.H.hands); return 0.05;
      case 'discards': this.hud.discards = ev.total; this.H.discards.textContent = ev.total; this.bump(this.H.discards); return 0.05;
      case 'round': this.hud.round = ev.total; this.H.round.textContent = ev.total; this.bump(this.H.round); return 0.1;
      case 'ante': this.hud.ante = ev.total; this.H.ante.textContent = ev.total; this.bump(this.H.ante); return 0.2;
      case 'level_up': {
        const hh = this.hud.hand;
        hh.total = null; hh.name = ev.hand; hh.level = ev.level; hh.chips = ev.chips; hh.mult = ev.mult;
        this.renderHandBox(); this.bump(this.H.handBox); this.bump(this.H.chips); this.bump(this.H.mult);
        sound.play('multhit1', 1.1, 0.6);
        if (ev.card != null) { const s = this.sprites.get(ev.card); if (s) s.juiceUp(); }
        return ev.instant ? 0.1 : 0.7;
      }
      case 'dissolve': {
        const s = this.sprites.get(ev.card);
        this.removeFromAreas(ev.card);
        if (s && !s.leaving) {
          s.leaving = true; s.juiceUp(0.2);
          sound.play('whoosh2', 1, 0.5); sound.play('crumple' + (1 + Math.floor(Math.random() * 5)), 1, 0.5);
          s.startDissolve(0.7 / Math.max(1, sp * 0.6), () => this.destroySprite(ev.card));
          this.layout();
          return ev.reason === 'sold' ? 0.15 : 0.35;
        }
        return 0;
      }
      case 'shatter': {
        const s = this.sprites.get(ev.card);
        this.removeFromAreas(ev.card);
        if (s && !s.leaving) { s.leaving = true; sound.play('glass' + (1 + Math.floor(Math.random() * 4))); s.shatter(this.popLayer, () => this.destroySprite(ev.card)); }
        this.layout();
        return 0.4;
      }
      case 'flip': {
        const s = this.sprites.get(ev.card);
        if (s) {
          const nd = { ...(this.pending.get(ev.card) || this.data.get(ev.card) || s.d), facing: ev.facing === 'back' ? 'back' : undefined };
          this.data.set(ev.card, nd);
          s.startFlip(nd, 0.28 / Math.max(1, sp * 0.7));
          sound.play('card1', 1.1, 0.4);
          return 0.06;
        }
        return 0;
      }
      case 'card_changed': case 'edition': case 'seal': {
        const s = this.sprites.get(ev.card);
        const nd = this.pending.get(ev.card);
        if (s && nd) {
          const cur = this.data.get(ev.card) || {};
          const merged = { ...nd, facing: cur.facing === 'back' && ev.type !== 'card_changed' ? 'back' : nd.facing, hl: cur.hl };
          this.data.set(ev.card, merged); s.setData(merged);
          if (ev.type !== 'card_changed') { s.juiceUp(0.3); return 0.35; }
          s.juiceUp(0.15);
        }
        return s ? 0.08 : 0;
      }
      case 'sound': sound.play(ev.sound, ev.per || 1, ev.vol == null ? 1 : ev.vol); return 0;
      case 'use': {
        const s = this.sprites.get(ev.card);
        if (s) { s.z = 900; s.tgt.x = this.R.play.x + this.R.play.w / 2; s.tgt.y = this.R.play.y + this.ch / 2; s.juiceUp(0.3); }
        sound.play('tarot1', 1, 0.6);
        return 0.45;
      }
      case 'bought': { const s = this.sprites.get(ev.card); if (s) { s.juiceUp(0.2); if (s.priceTag) { s.priceTag.remove(); s.priceTag = null; } } return 0.1; }
      case 'open_booster': { sound.play('cardFan2', 1, 0.7); const s = this.sprites.get(ev.card); if (s) s.juiceUp(0.4); return 0.35; }
      case 'redeem': { sound.play('coin1'); const s = this.sprites.get(ev.card); if (s) { s.juiceUp(0.5); s.tgt.s = 1.25; } this.attn('Voucher redeemed!', '#fd682b'); return 0.6; }
      case 'skip_blind': sound.play('whoosh1', 1, 0.6); return 0.35;
      case 'blind': {
        if (ev.action === 'set' && ev.key) {
          this.overlay.innerHTML = ''; this.overlay.className = 'overlay';
          const proto = BLINDS[ev.key] || {};
          const fin = this.pending.size && this._finalView && this._finalView.blind && this._finalView.blind.key === ev.key ? this._finalView.blind : null;
          this.renderBlindPanel({ key: ev.key, name: ev.name || proto.name, chips: ev.chips, dollars: ev.dollars, boss: !!ev.boss, colour: proto.boss_colour, pos: proto.pos, desc: fin && fin.desc }, 'SELECTING_HAND');
          this.bump(this.H.blind);
          this.bg.set(backgroundFor('SELECTING_HAND', { boss: !!ev.boss, colour: proto.boss_colour, showdown: ev.showdown }));
          this.bg.pulse(0.7);
          return 0.45;
        }
        if (ev.action === 'disable') { this.bump(this.H.blind); this.attn('Blind disabled!', '#4bc292'); return 0.5; }
        if (ev.action === 'defeat') { this.bump(this.H.blind); return 0.2; }
        return 0;
      }
      case 'blind_alert': this.bump(this.H.blind); return 0.2;
      case 'blind_hook': return 0.2;
      case 'explode': {
        const s = this.sprites.get(ev.card);
        this.removeFromAreas(ev.card);
        if (s && !s.leaving) { s.leaving = true; sound.play('explosion1', 1, 0.6); s.juiceUp(0.5); s.startDissolve(0.5, () => this.destroySprite(ev.card)); }
        this.layout();
        return 0.4;
      }
      case 'materialize': { const s = this.sprites.get(ev.card); if (s && !s.leaving) s.startMaterialize(0.4 / Math.max(1, sp * 0.6)); return 0.1; }
      case 'juice_until': { const s = this.sprites.get(ev.card); if (s) s.juiceUp(0.1, 0.1); return 0; }
      case 'nope': this.popup(ev.card, 'Nope!', '#4bc292'); return 0.6;
      case 'tag_yep': case 'tag_nope': case 'tag_juice': return 0.2;
      case 'balanced': this.hud.hand.chips = ev.chips; this.hud.hand.mult = ev.mult; this.renderHandBox(); this.bump(this.H.handBox); return 0.6;
      case 'redeemed': return 0.2;
      case 'pack_opened': return 0.2;
      case 'boss_rerolled': sound.play('whoosh2'); return 0.35;
      case 'attention': this.attn(ev.text); return 0.6;
      case 'blind_juice': this.bump(this.H.blind); return 0;
      case 'not_allowed': this.attn('Not Allowed!', '#fe5f55'); sound.play('cancel'); return 0.6;
      case 'no_space': this.toast('No space!'); return 0.2;
      case 'win': sound.play('win'); this.attn('You Win!', '#f3b958'); return 0.9;
      case 'game_over': sound.play('gong', 0.8, 0.6); return 0.4;
      case 'round_eval': sound.play('timpani', 1, 0.4); return 0.2;
      case 'highlight': {
        const ids = new Set(ev.ids || []);
        for (const id of this.areas.hand) { const d = this.data.get(id); if (d) this.data.set(id, { ...d, hl: ids.has(id) }); }
        this.layout(); return 0;
      }
      case 'sorted': {
        if (ev.area && this.areas[ev.area] && Array.isArray(ev.ids)) {
          const cur = new Set(this.areas[ev.area]);
          this.areas[ev.area] = ev.ids.filter((id) => cur.has(id)).concat(this.areas[ev.area].filter((id) => !ev.ids.includes(id)));
          this.layout();
        }
        return 0.05;
      }
      default: return 0;
    }
  }

  statusEvent(ev) {
    const t = ev.eval_type;
    const s = this.sprites.get(ev.card);
    let text = '', col = STATUS_COL[t] || '#ff9a00', snd = 'generic1', vol = 1, delay = 0.65, kind = '';
    const amt = ev.amt;
    if (t === 'debuff') { text = 'Debuffed!'; snd = 'cancel'; }
    else if (t === 'chips') { text = '+' + fmt(amt); snd = 'chips1'; delay = 0.6; }
    else if (t === 'mult' || t === 'h_mult') { text = '+' + fmt(amt) + ' Mult'; snd = 'multhit1'; }
    else if (t === 'x_mult' || t === 'h_x_mult') { text = 'X' + fmt(amt) + ' Mult'; snd = 'multhit2'; vol = 0.7; }
    else if (t === 'dollars') { text = (amt < 0 ? '-$' : '$') + fmt(Math.abs(amt)); snd = 'coin3'; if (amt < 0) col = '#fe5f55'; }
    else if (t === 'swap') { text = 'Swapped!'; }
    else {
      snd = ev.edition ? 'foil2' : ev.mult_mod ? 'multhit1' : (ev.Xmult_mod || ev.x_mult_mod) ? 'multhit2' : 'generic1';
      vol = ev.edition ? 0.3 : snd === 'multhit2' ? 0.7 : 1;
      delay = 0.75;
      text = ev.message != null ? String(ev.message) : '';
      if (!text) {
        if (ev.mult_mod) text = '+' + fmt(ev.mult_mod) + ' Mult';
        else if (ev.chip_mod) text = '+' + fmt(ev.chip_mod);
        else if (ev.Xmult_mod || ev.x_mult_mod) text = 'X' + fmt(ev.Xmult_mod || ev.x_mult_mod) + ' Mult';
        else if (ev.dollars) text = '$' + fmt(ev.dollars);
      }
      if (ev.colour && NAMED_COL[String(ev.colour).toLowerCase()]) col = NAMED_COL[String(ev.colour).toLowerCase()];
      else if (typeof ev.colour === 'string' && /^#/.test(ev.colour)) col = ev.colour;
      if (ev.edition) kind = 'dark-ed';
      else if (ev.mult_mod || ev.Xmult_mod || ev.x_mult_mod) col = '#fe5f55';
      if (ev.chip_mod && !ev.edition) col = '#009dff';
      if (ev.dollars && !ev.mult_mod && !ev.chip_mod) col = '#f3b958';
    }
    if (s) s.juiceUp(0.4);
    if (ev.source != null) { const so = this.sprites.get(ev.source); if (so) so.juiceUp(0.3); }
    if (text) this.popup(ev.card, text, col, kind);
    sound.play(snd, 0.9 + Math.random() * 0.2, vol);
    return text ? delay : 0.15;
  }

  // ------------------------------------------------------------- frame
  frame() {
    const t = performance.now() / 1000;
    const dt = Math.min(0.05, t - this.now);
    this.now = t;
    this.bg.draw(t, dt);
    for (const s of this.sprites.values()) s.frame(t, dt);
    // animated blind chips (21 frames per row at ~10fps)
    const f = Math.floor(t * 10) % 21;
    if (f !== this._chipFrame) {
      this._chipFrame = f;
      const draw = (c, pos) => { if (!c || !pos) return; const x = c.getContext('2d'); x.clearRect(0, 0, 68, 68); drawCell(x, 'blind_chips', { x: 0, y: pos.y }, 0, 0, 68, 68, f); };
      if (this.chipAnim) draw(this.chipAnim.canvas, this.chipAnim.pos);
      for (const c of this.overlay.querySelectorAll('canvas.blind-chip')) draw(c, c._pos);
      if (this.shopSign && this.shopSign.isConnected) { const x = this.shopSign.getContext('2d'); x.clearRect(0, 0, 226, 114); drawCell(x, 'shop_sign', { x: 0, y: 0 }, 0, 0, 226, 114, Math.floor(t * 4) % 4); }
    }
    if (this.tipFor != null && typeof this.tipFor === 'number') {
      const s = this.sprites.get(this.tipFor);
      if (s && !s.leaving) this.placeTip(s.T.x, s.T.y, s.area); else this.hideTip();
    }
  }
}

function levelColour(l) {
  const C = ['#fe5f55', '#efefef', '#95acff', '#65efaf', '#fae37e', '#ffc052', '#f87d75', '#caa0ef'];
  if (!l) return '#efefef';
  return C[Math.min(7, l)] || '#efefef';
}
function errorText(e) {
  return ({ 'not enough money': 'Not enough money', 'no joker space': 'No room for another Joker', 'cannot use now': "Can't use that right now", 'cannot play': "Can't play that", 'cannot discard': "Can't discard", 'busy': 'Hold on…', 'cannot sell now': "Can't sell that" })[e] || e;
}

/** Badge colour: the badge's own colour, a mod consumable type's, else the Balatro table. */
function badgeColour(b, key, txt) {
  const own = typeof b === 'object' && b ? cssColour(b.colour || b.color) : null;
  if (own) return own;
  if (BADGE_COL[key] || BADGE_COL[String(txt).toLowerCase()]) return BADGE_COL[key] || BADGE_COL[String(txt).toLowerCase()];
  const t = modType(key) || modType(txt);
  if (t) return cssColour(t.secondary_colour) || cssColour(t.primary_colour) || '#4f6367';
  const r = MODREG.rarities[key];
  if (r) return cssColour(r.badge_colour) || '#4f6367';
  return '#4f6367';
}
const VANILLA_PACK = { Arcana: 'Arcana Pack', Celestial: 'Celestial Pack', Spectral: 'Spectral Pack', Standard: 'Standard Pack', Buffoon: 'Buffoon Pack' };
/** "Energy" -> "Energy Pack"; a kind already ending in Pack/Box/... is shown as is. */
export function packName(kind, state) {
  if (VANILLA_PACK[kind]) return VANILLA_PACK[kind];
  if (!kind || kind === 'Booster') return 'Booster Pack';
  return /(pack|box|bundle|crate|bag)$/i.test(kind) ? kind : kind + ' Pack';
}
/** Background colours for a mod pack, from the mod consumable type named like the pack's kind
 *  (background_colour / primary_colour + secondary_colour); null = the neutral pack background. */
export function packColours(view) {
  if (!view || !/^MOD_PACK/.test(view.state)) return null;
  const kind = view.pack_kind;
  if (!kind) return null;
  const t = modType(kind);
  if (t) {
    const a = t.background_colour || t.primary_colour, b = t.secondary_colour;
    if (cssColour(a)) return { colour: a, special: b };
  }
  return null;
}
