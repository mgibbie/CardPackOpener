// Menus and modal screens: main menu, new-run setup (deck + stake + seed),
// leaderboard, how-to-play, run info (poker hands / blinds / vouchers), options,
// deck viewer, game over / win. All draw from plain view data.
import { cellEl, drawCell, CENTERS, BLINDS, LOC, STAKE_LIST, BACK_LIST, TAGS, MODREG, cssColour, drawModCell, onModAtlas } from './assets.js';
import { composeFace, FACE_W, FACE_H } from './cardsprite.js';
import { markup, fmt, esc, describeCenterFallback } from './markup.js';
import { sound } from './sound.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const btn = (label, cls, fn) => { const b = h('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', (e) => { sound.play('button'); fn(e); }); return b; };

let layer = null;
export function initScreens(stage) {
  layer = h('div', 'modal-layer');
  stage.appendChild(layer);
  return layer;
}
const stack = [];
export function closeModal() { const m = stack.pop(); if (m) { m.el.remove(); if (m.onClose) m.onClose(); } layer.classList.toggle('open', stack.length > 0); }
export function closeAll() { while (stack.length) closeModal(); }
export const modalOpen = () => stack.length > 0;
export function modal(content, { title, cls = '', onClose, noClose } = {}) {
  const wrap = h('div', 'modal ' + cls);
  const box = h('div', 'modal-box');
  if (title) box.appendChild(h('div', 'modal-title', esc(title)));
  box.appendChild(content);
  if (!noClose) {
    const back = btn('Back', 'orange wide b-back', () => closeModal());
    box.appendChild(back);
  }
  wrap.appendChild(box);
  wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap && !noClose) closeModal(); });
  layer.appendChild(wrap);
  layer.classList.add('open');
  const rec = { el: wrap, onClose };
  stack.push(rec);
  return wrap;
}

// ------------------------------------------------------------ main menu
export function mainMenu(o) {
  closeAll();
  const el = h('div', 'main-menu');
  const logo = h('div', 'logo', '<span class="l1">MICATRO</span>');
  el.appendChild(logo);
  const card = cardCanvas({ center: 'j_joker' }, 'menu-joker');
  el.appendChild(card);
  const bar = h('div', 'menu-bar');
  bar.appendChild(btn('Play', 'blue big b-menu-play', () => newRunScreen(o)));
  if (o.saved) bar.appendChild(btn('Continue', 'orange big b-continue', () => o.onContinue()));
  bar.appendChild(btn('Leader<br>board', 'green big b-leaders', () => leaderboard(o.net)));
  bar.appendChild(btn('How to<br>play', 'red big b-howto', () => howTo()));
  el.appendChild(bar);
  const foot = h('div', 'menu-foot');
  foot.appendChild(h('a', 'back-link', o.direct ? '← Back to the overworld' : '← Magepunk'));
  foot.lastChild.href = o.direct ? '/overworld/' : '/';
  if (!o.loggedIn) {
    const a = h('a', 'login-link', 'Log in to let friends watch &amp; post high scores');
    a.href = '/login/?next=' + encodeURIComponent('/micatro/' + location.search);
    foot.appendChild(a);
  }
  el.appendChild(foot);
  modal(el, { cls: 'menu-modal', noClose: true });
  let t0 = performance.now();
  const spin = () => {
    if (!card.isConnected) return;
    const t = (performance.now() - t0) / 1000;
    card.style.transform = `perspective(600px) rotateY(${Math.sin(t * 0.9) * 18}deg) rotate(${Math.sin(t * 1.3) * 4}deg) translateY(${Math.sin(t * 1.7) * 6}px)`;
    requestAnimationFrame(spin);
  };
  requestAnimationFrame(spin);
}

export function cardCanvas(d, cls, backKey) {
  const c = document.createElement('canvas');
  c.width = FACE_W; c.height = FACE_H;
  c.className = 'mini-card ' + (cls || '');
  composeFace(c.getContext('2d'), d, backKey);
  return c;
}

// ------------------------------------------------------- new run setup
let backDescFn = null;
export function setBackDescriber(fn) { backDescFn = fn; }
function backDesc(key) {
  try { if (backDescFn) { const d = backDescFn(key); if (d) return d; } } catch (e) { /* fall through */ }
  const c = CENTERS[key] || {};
  const d = LOC.descriptions.Back[key] || { name: c.name, text: [] };
  const cfg = c.config || {};
  const vals = Object.values(cfg).filter((v) => typeof v === 'number');
  return { name: d.name, lines: (d.text || []).map((l) => String(l).replace(/#(\d)#/g, (m, i) => (vals[i - 1] != null ? Math.abs(vals[i - 1]) : '')).replace(/\{[^}]*T:[^}]*\}/g, '{C:attention}')) };
}
const PREF = 'micatro_newrun';
export function newRunScreen(o) {
  let pref = {};
  try { pref = JSON.parse(localStorage.getItem(PREF) || '{}'); } catch (e) { /* ignore */ }
  // Base decks + the decks of the mods selected below (refreshed when the mod selection changes).
  const msel0 = loadModPrefs();
  let backs = BACK_LIST;
  const refreshBacks = (sel) => {
    const cur = backs[bi] && backs[bi].key;
    const extra = modsApi && modsApi.backs ? modsApi.backs(sel.ids.filter((id) => modsApi.isLoaded(id)), sel.options) : [];
    backs = BACK_LIST.concat(extra.map((c) => ({ ...c, key: c.key })));
    bi = Math.max(0, backs.findIndex((b) => b.key === cur));
  };
  let bi = 0;
  refreshBacks(msel0);
  bi = Math.max(0, backs.findIndex((b) => b.key === pref.back));
  let stake = Math.min(8, Math.max(1, pref.stake || 1));
  const el = h('div', 'new-run');
  const deckRow = h('div', 'nr-row nr-deck');
  const left = btn('‹', 'arrow red', () => { bi = (bi + backs.length - 1) % backs.length; draw(); });
  const right = btn('›', 'arrow red', () => { bi = (bi + 1) % backs.length; draw(); });
  const deckView = h('div', 'nr-deckview');
  const deckInfo = h('div', 'nr-info');
  deckRow.append(left, deckView, deckInfo, right);
  el.appendChild(deckRow);
  const stakeRow = h('div', 'nr-row nr-stake');
  const sl = btn('‹', 'arrow red', () => { stake = stake > 1 ? stake - 1 : 8; draw(); });
  const sr = btn('›', 'arrow red', () => { stake = stake < 8 ? stake + 1 : 1; draw(); });
  const stakeView = h('div', 'nr-stakeview');
  const stakeInfo = h('div', 'nr-info');
  stakeRow.append(sl, stakeView, stakeInfo, sr);
  el.appendChild(stakeRow);
  const seedRow = h('div', 'nr-seed');
  seedRow.innerHTML = '<label><input type="checkbox" class="seed-on"> Seeded run</label><input class="seed-in" maxlength="8" placeholder="SEED" autocomplete="off" spellcheck="false">';
  const seedOn = seedRow.querySelector('.seed-on'), seedIn = seedRow.querySelector('.seed-in');
  seedIn.style.visibility = 'hidden';
  if (o.seed) { seedOn.checked = true; seedIn.value = String(o.seed).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); seedIn.style.visibility = ''; }
  seedOn.addEventListener('change', () => { seedIn.style.visibility = seedOn.checked ? '' : 'hidden'; if (seedOn.checked) seedIn.focus(); });
  seedIn.addEventListener('input', () => { seedIn.value = seedIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); });
  seedIn.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.appendChild(seedRow);
  // mods: a summary row + the Mods panel (hidden when the site ships no mods)
  const msel = loadModPrefs();
  let modsSum = null;
  if (modsApi && modsApi.list().length) {
    const mrow = h('div', 'nr-mods');
    mrow.appendChild(h('span', 'nr-mods-l', 'Mods'));
    modsSum = h('span', 'nr-mods-sum');
    mrow.appendChild(modsSum);
    mrow.appendChild(btn('Mods', 'green b-mods', () => modsPanel(msel, () => { drawMods(); refreshBacks(msel); draw(); })));
    el.appendChild(mrow);
  }
  function drawMods() {
    if (!modsSum) return;
    modsSum.innerHTML = msel.ids.length ? modBadges(msel.ids) : '<span class="muted">None (vanilla run)</span>';
  }
  drawMods();
  // decks of saved-on mods appear once those mods have loaded
  if (modsApi && msel.ids.length) Promise.resolve(modsApi.load(modsApi.withRequirements(msel.ids))).then(() => { refreshBacks(msel); if (el.isConnected) draw(); }).catch(() => {});
  const play = btn('Play', 'blue big wide b-start', () => {
    const back = backs[bi].key;
    try { localStorage.setItem(PREF, JSON.stringify({ back, stake })); } catch (e) { /* ignore */ }
    const seed = seedOn.checked && seedIn.value ? seedIn.value : undefined;
    const mods = modsApi ? modsApi.withRequirements(msel.ids) : [];
    const modOptions = {};
    for (const id of mods) if (msel.options[id]) modOptions[id] = { ...msel.options[id] };
    closeAll();
    o.onNew(mods.length ? { back, stake, seed, mods, modOptions } : { back, stake, seed });
  });
  el.appendChild(play);
  function draw() {
    const b = backs[bi];
    deckView.innerHTML = '';
    if (b.mod) {
      // a mod deck: its own atlas cell (redrawn when the art arrives)
      const c = document.createElement('canvas');
      c.className = 'nr-back'; c.width = 142; c.height = 190;
      const paint = () => { const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); if (!drawModCell(ctx, b.atlas, b.pos, 0, 0, c.width, c.height)) drawCell(ctx, 'centers', { x: 0, y: 2 }, 0, 0, c.width, c.height); };
      paint();
      const off = onModAtlas((name) => { if (name === b.atlas) { paint(); off(); } });
      deckView.appendChild(c);
    } else deckView.appendChild(cellEl('centers', b.pos, 'nr-back'));
    const d = backDesc(b.key);
    deckInfo.innerHTML = `<div class="nr-name">${esc(d.name || b.name)}</div><div class="nr-desc">${(d.lines || []).map(markup).join('<br>')}</div>`;
    const s = STAKE_LIST[stake - 1];
    stakeView.innerHTML = '';
    if (s) stakeView.appendChild(cellEl('chips', s.pos, 'nr-chip'));
    const sd = s && LOC.descriptions.Stake[s.key];
    stakeInfo.innerHTML = `<div class="nr-name">${esc(sd ? sd.name : 'Stake ' + stake)}</div><div class="nr-desc">${sd ? sd.text.map(markup).join('<br>') : ''}</div>`;
  }
  draw();
  modal(el, { title: 'New Run', cls: 'nr-modal' });
}

// ------------------------------------------------------- leaderboard
export async function leaderboard(net, highlight, opts = {}) {
  const el = h('div', 'leaders');
  const tabs = h('div', 'tabs lb-tabs');
  const body = h('div', 'lb-body', '<div class="muted">Loading…</div>');
  el.append(tabs, body);
  modal(el, { title: 'Leaderboard', cls: 'lb-modal' });
  let token = 0;
  // Vanilla and Modded runs are separate boards (a modded run's score isn't comparable)
  const show = async (k) => {
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.k === k);
    const my = ++token;
    body.innerHTML = '<div class="muted">Loading…</div>';
    if (!net || !net.fetchLeaderboard) { body.innerHTML = '<div class="muted">The leaderboard is unavailable right now.</div>'; return; }
    try {
      if (net.isLoggedIn && !net.isLoggedIn()) {
        body.innerHTML = '<div class="muted">Log in to see the high scores and post your own.</div><a class="login-link" href="/login/?next=%2Fmicatro%2F">Log in</a>';
        return;
      }
      const modded = k === 'modded';
      const r = await net.fetchLeaderboard({ limit: 50, modded });
      if (my !== token) return;
      const rows = Array.isArray(r) ? r : (r && (r.top || r.rows || r.scores)) || [];
      const hl = highlight || (r && r.me);
      if (!rows.length) { body.innerHTML = `<div class="muted">${r && r.error && r.error !== 'not logged in' ? 'Could not load the leaderboard.' : modded ? 'No modded scores yet. Turn on a mod in New Run and be the first!' : 'No scores yet — be the first!'}</div>`; return; }
      const tbl = h('div', 'lb-table');
      tbl.innerHTML = '<div class="lb-row lb-h"><span>#</span><span>Player</span><span>Best hand</span><span>Ante</span><span>Deck</span></div>' +
        rows.map((x, i) => {
          const user = x.user || x.username || x.name || '?';
          const mc = !CENTERS[x.back] && x.back ? MODREG.center(x.back) : null;
          const back = x.back && CENTERS[x.back] ? CENTERS[x.back].name.replace(' Deck', '') : mc ? String(mc.name || '').replace(' Deck', '') : '';
          const mods = Array.isArray(x.mods) && x.mods.length ? `<span class="lb-mods">${modBadges(x.mods)}</span>` : '';
          return `<div class="lb-row${hl && hl === user ? ' me' : ''}${mods ? ' modded' : ''}"><span>${x.rank || i + 1}</span><span>${esc(user)}${x.won ? ' <span class="won">★</span>' : ''}${mods}</span><span class="chips">${fmt(x.score || 0)}</span><span>${x.ante || ''}</span><span>${esc(back)}${x.stake > 1 ? ' · ' + x.stake : ''}</span></div>`;
        }).join('');
      body.innerHTML = '';
      body.appendChild(tbl);
      if (r && r.you && r.you.rank && !rows.some((x) => (x.name || x.user) === hl)) body.appendChild(h('div', 'lb-you', `Your best: <b class="chips">${fmt(r.you.score || 0)}</b> · rank <b class="attn">#${r.you.rank}</b>`));
    } catch (e) { if (my === token) body.innerHTML = '<div class="muted">Could not load the leaderboard.</div>'; }
  };
  for (const [k, label] of [['vanilla', 'Vanilla'], ['modded', 'Modded']]) {
    const b = btn(label, 'red tab b-lb-' + k, () => show(k)); b.dataset.k = k; tabs.appendChild(b);
  }
  return show(opts.modded ? 'modded' : 'vanilla');
}

export function howTo() {
  const el = h('div', 'howto');
  el.innerHTML = `
    <p>Each round you face a <b class="attn">Blind</b>: score at least its target before you run out of <b class="blue">Hands</b>.</p>
    <p>Select up to <b class="attn">5 cards</b> and <b class="blue">Play</b> a poker hand. Its score is <b class="blue">Chips</b> <b>×</b> <b class="red">Mult</b>: the hand's base value plus the chips of each scoring card, boosted by your Jokers.</p>
    <p><b class="red">Discard</b> unwanted cards to draw new ones (limited per round).</p>
    <p>Beat a blind to earn <b class="money">$</b> — plus $1 per unused hand and interest on your savings — then spend it in the <b class="attn">Shop</b> on <b class="attn">Jokers</b>, <b style="color:#a782d1">Tarot</b>, <b style="color:#13afce">Planet</b> and <b style="color:#4584fa">Spectral</b> cards, Vouchers and booster packs.</p>
    <p>Each <b class="attn">Ante</b> is a Small Blind, a Big Blind and a <b class="red">Boss Blind</b> with a nasty twist. Skip a blind to take its <b class="attn">Tag</b> instead. Beat the Ante 8 boss to win.</p>
    <p class="muted">Tap a card to select it · drag to reorder · long-press (or hover) for details.<br>Keys: Enter play · D discard · R/S sort · 1–9 pick cards · V deck · I run info · Esc options</p>`;
  modal(el, { title: 'How to play', cls: 'howto-modal' });
}

// ------------------------------------------------------------ run info
export function runInfo(view) {
  const el = h('div', 'run-info');
  const tabs = h('div', 'tabs');
  const body = h('div', 'tab-body');
  const show = (k) => {
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.k === k);
    body.innerHTML = '';
    if (k === 'hands') {
      const list = h('div', 'hand-list');
      for (const hd of view.hands || []) {
        if (!hd.visible && !hd.played) continue;
        const desc = (LOC.misc.poker_hand_descriptions[hd.name] || []).join(' ');
        const row = h('div', 'hand-row', `<span class="hl-lvl" style="color:${lvlCol(hd.level)}">lvl.${hd.level}</span><span class="hl-name">${esc(LOC.misc.poker_hands[hd.name] || hd.name)}</span><span class="hl-cxm"><span class="cx">${fmt(hd.chips)}</span><b>X</b><span class="mx">${fmt(hd.mult)}</span></span><span class="hl-played">#&nbsp;${hd.played}</span>`);
        row.title = desc;
        list.appendChild(row);
      }
      body.appendChild(list);
    } else if (k === 'blinds') {
      const row = h('div', 'ri-blinds');
      for (const kk of ['Small', 'Big', 'Boss']) {
        const c = view.choices && view.choices[kk];
        if (!c) continue;
        const col = h('div', 'ri-blind');
        const chip = document.createElement('canvas'); chip.width = 68; chip.height = 68; chip.className = 'blind-chip big';
        const pos = c.pos || (BLINDS[c.key] && BLINDS[c.key].pos);
        if (pos) drawCell(chip.getContext('2d'), 'blind_chips', { x: 0, y: pos.y }, 0, 0, 68, 68);
        col.appendChild(chip);
        col.appendChild(h('div', 'ri-bname', esc(c.name)));
        col.appendChild(h('div', 'ri-breq', `Score at least <b class="red">${fmt(c.chips)}</b>`));
        col.appendChild(h('div', 'ri-brew', c.dollars ? `Reward <b class="money">$${c.dollars}</b>` : 'No reward'));
        if (c.desc && kk === 'Boss') col.appendChild(h('div', 'ri-bdesc', (c.desc.lines || []).map(markup).join('<br>')));
        if (c.tag && TAGS[c.tag]) { const t = h('div', 'ri-tag'); t.appendChild(cellEl('tags', TAGS[c.tag].pos, 'tag-ico')); t.appendChild(h('span', '', 'Skip: ' + esc(TAGS[c.tag].name))); col.appendChild(t); }
        row.appendChild(col);
      }
      body.appendChild(row);
      body.appendChild(h('div', 'ri-note', `Ante <b class="attn">${view.ante}</b> / ${view.win_ante || 8} · Round <b class="attn">${view.round}</b> · Seed <b>${esc(view.seed)}</b> · Stake ${view.stake}`));
    } else {
      const list = h('div', 'voucher-list');
      if (!(view.vouchers || []).length) list.appendChild(h('div', 'muted', 'No vouchers redeemed yet.'));
      for (const k2 of view.vouchers || []) {
        const c = CENTERS[k2];
        if (!c) continue;
        const it = h('div', 'voucher-item');
        it.appendChild(cellEl('Voucher', c.pos, 'v-ico'));
        const d = describeCenterFallback(k2);
        const cfg = c.config || {};
        const vals = Object.values(cfg).filter((x) => typeof x === 'number');
        it.appendChild(h('div', 'v-text', `<div class="nr-name">${esc(d.name)}</div><div class="nr-desc">${(d.lines || []).map((l) => markup(String(l).replace(/#(\d)#/g, (m, i) => (vals[i - 1] != null ? vals[i - 1] : '')))).join('<br>')}</div>`));
        list.appendChild(it);
      }
      body.appendChild(list);
    }
  };
  for (const [k, label] of [['hands', 'Poker Hands'], ['blinds', 'Blinds'], ['vouchers', 'Vouchers']]) {
    const b = btn(label, 'red tab', () => show(k)); b.dataset.k = k; tabs.appendChild(b);
  }
  if (view.mods && view.mods.length) el.appendChild(h('div', 'ri-mods', `<span class="muted">Mods</span> ${modBadges(view.mods)}`));
  el.append(tabs, body);
  show('hands');
  modal(el, { title: 'Run Info', cls: 'ri-modal' });
}
const lvlCol = (l) => ['#fe5f55', '#efefef', '#95acff', '#65efaf', '#fae37e', '#ffc052', '#f87d75', '#caa0ef'][Math.min(7, l || 1)];

// ------------------------------------------------------- pause (Start)
export function pauseMenu(o) {
  const el = h('div', 'pause');
  el.appendChild(btn('Resume', 'blue big wide b-resume', () => closeModal()));
  el.appendChild(btn('Run Info', 'red big wide', () => { closeModal(); o.onMenu('runinfo'); }));
  el.appendChild(btn('Deck', 'orange big wide', () => { closeModal(); o.onMenu('deck'); }));
  el.appendChild(btn('Options', 'orange big wide', () => { closeModal(); o.onMenu('options'); }));
  if (o.readOnly && o.chat) el.appendChild(btn('Chat', 'green big wide', () => { closeModal(); o.chat(); }));
  if (!o.readOnly && o.mainMenu) el.appendChild(btn('Main Menu', 'red big wide', () => { closeAll(); o.mainMenu(); }));
  modal(el, { title: 'Paused', cls: 'pause-modal', noClose: true });
}

// ------------------------------------------------------------- options
export function options(o) {
  const el = h('div', 'options');
  const row = (label, choices, cur, fn) => {
    const r = h('div', 'opt-row');
    r.appendChild(h('div', 'opt-l', label));
    const g = h('div', 'opt-g');
    for (const [val, text] of choices) {
      const b = btn(text, 'grey opt', () => { fn(val); for (const x of g.children) x.classList.toggle('on', x === b); });
      if (val === cur) b.classList.add('on');
      g.appendChild(b);
    }
    r.appendChild(g);
    el.appendChild(r);
  };
  row('Game speed', [[1, '1×'], [2, '2×'], [4, '4×']], o.speed, o.onSpeed);
  row('Sound', [[true, 'On'], [false, 'Off']], sound.sfx, (v) => sound.setSfx(v));
  row('Music', [[true, 'On'], [false, 'Off']], sound.music, (v) => sound.setMusic(v));
  if (o.mods && o.mods.length) el.appendChild(activeModsBox(o.mods, o.modOptions || {}));
  const acts = h('div', 'opt-acts');
  if (o.onNewRun) acts.appendChild(btn('New Run', 'blue wide', () => { closeAll(); o.onNewRun(); }));
  if (o.onMainMenu) acts.appendChild(btn('Main Menu', 'orange wide', () => { closeAll(); o.onMainMenu(); }));
  const back = h('a', 'back-link', o.direct ? '← Back to the overworld' : '← Leave to Magepunk');
  back.href = o.direct ? '/overworld/' : '/';
  acts.appendChild(back);
  el.appendChild(acts);
  modal(el, { title: 'Options', cls: 'opt-modal' });
}

// ------------------------------------------------------------ deck view
const SUIT_ORDER = ['S', 'H', 'C', 'D'];
const RANK_ORDER = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
export function deckView(view) {
  const el = h('div', 'deck-view');
  const list = (view.deck_list || []).slice();
  const counts = { total: list.length, left: list.filter((x) => x[4]).length };
  const rankOf = (k) => (k || '').split('_')[1] || '';
  const suitOf = (k) => (k || '').split('_')[0] || '';
  const summary = h('div', 'dv-sum');
  const by = (f) => list.filter(f).length;
  summary.innerHTML = `<div><b class="attn">${counts.left}</b>/${counts.total} cards remaining</div>
    <div>Aces <b>${by((x) => rankOf(x[0]) === 'A')}</b> · Faces <b>${by((x) => 'KQJ'.includes(rankOf(x[0]) || 'x'))}</b> · Numbers <b>${by((x) => /^[2-9T]$/.test(rankOf(x[0])))}</b></div>
    <div><span style="color:#403995">♠</span> ${by((x) => suitOf(x[0]) === 'S')} <span style="color:#f03464">♥</span> ${by((x) => suitOf(x[0]) === 'H')} <span style="color:#235955">♣</span> ${by((x) => suitOf(x[0]) === 'C')} <span style="color:#f06b3f">♦</span> ${by((x) => suitOf(x[0]) === 'D')}</div>`;
  el.appendChild(summary);
  const grid = h('div', 'dv-grid');
  for (const s of SUIT_ORDER) {
    const row = h('div', 'dv-row');
    const cards = list.filter((x) => suitOf(x[0]) === s).sort((a, b) => RANK_ORDER.indexOf(rankOf(a[0])) - RANK_ORDER.indexOf(rankOf(b[0])));
    for (const x of cards) {
      const c = cardCanvas({ front: x[0], center: x[1], edition: x[2] || undefined, seal: x[3] || undefined, debuff: !!x[5] }, x[4] ? '' : 'used', view.back);
      row.appendChild(c);
    }
    if (cards.length) grid.appendChild(row);
  }
  el.appendChild(grid);
  modal(el, { title: 'Deck', cls: 'dv-modal' });
}

// ---------------------------------------------------------- game over
export function gameOver(view, o) {
  const won = !!o.won;
  const el = h('div', 'game-over' + (won ? ' win' : ''));
  el.appendChild(h('div', 'go-title', won ? 'You Win!' : 'Game Over'));
  const most = (view.hands || []).reduce((a, b) => (b.played > (a ? a.played : -1) ? b : a), null);
  const st = view.stats || {};
  const rows = [
    ['Best hand', `<span class="chips">${fmt(st.best_hand || 0)}</span>${st.best_hand_name ? ' <span class="muted">(' + esc(st.best_hand_name) + ')</span>' : ''}`],
    ['Most played hand', most && most.played ? `${esc(most.name)} <span class="muted">(${most.played})</span>` : '-'],
    ['Ante', `<span class="attn">${won ? Math.min(view.ante, view.win_ante || 8) : view.ante}</span>`],
    ['Round', `<span class="attn">${view.round}</span>`],
    ['Seed', `<b>${esc(view.seed)}</b>`],
  ];
  if (!won && view.blind && view.blind.name) rows.push(['Defeated by', esc(view.blind.name)]);
  const tbl = h('div', 'go-stats', rows.map(([a, b]) => `<div class="go-row"><span>${a}</span><span>${b}</span></div>`).join(''));
  el.appendChild(tbl);
  const rank = h('div', 'go-rank');
  el.appendChild(rank);
  if (o.rankPromise) o.rankPromise.then((r) => { if (r && r.rank) rank.innerHTML = `Leaderboard rank <b class="attn">#${r.rank}</b>`; else if (r && r.ok) rank.innerHTML = 'Score posted!'; }).catch(() => {});
  else if (o.guest) rank.innerHTML = '<a class="login-link" href="/login/?next=%2Fmicatro%2F">Log in to post high scores</a>';
  const acts = h('div', 'go-acts');
  if (won && o.onEndless) acts.appendChild(btn('Endless Mode', 'orange big b-endless', () => { closeModal(); o.onEndless(); }));
  acts.appendChild(btn('New Run', 'blue big b-newrun', () => { closeAll(); o.onNewRun(); }));
  acts.appendChild(btn('Main Menu', 'red big b-mainmenu', () => { closeAll(); o.onMainMenu(); }));
  if (o.net) acts.appendChild(btn('Leader<br>board', 'green big', () => leaderboard(o.net, o.me, { modded: !!(view.mods && view.mods.length) })));
  el.appendChild(acts);
  modal(el, { cls: 'go-modal', noClose: true });
}

// ---------------------------------------------------------------- mods
// The Mods panel (New Run) and the read-only "Active mods" boxes. All mod
// knowledge comes through `modsApi` (built by main.js over micatro/js/mods/index.js):
//   list() -> manifest [{id, name, by, requires, description?, size?}]
//   load(ids) -> Promise (registers the mod modules, so their options are known)
//   isLoaded(id), optionList(id) -> [{key, default, label, type, choices}]
//   withRequirements(ids), dependentsOf(id, ids), modName(id)
let modsApi = null;
export function setModsApi(api) { modsApi = api; }
const MOD_PREF = 'micatro_mods';
/** The player's last mod selection {ids, options}; ids the site no longer ships are dropped. */
export function loadModPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(MOD_PREF) || '{}') || {}; } catch (e) { p = {}; }
  const known = new Set(modsApi ? modsApi.list().map((m) => m.id) : []);
  const ids = Array.isArray(p.ids) ? p.ids.filter((id) => known.has(id)) : [];
  const options = p.options && typeof p.options === 'object' && !Array.isArray(p.options) ? p.options : {};
  return { ids: modsApi ? modsApi.withRequirements(ids) : ids, options };
}
function saveModPrefs(sel) {
  try { localStorage.setItem(MOD_PREF, JSON.stringify({ ids: sel.ids, options: sel.options })); } catch (e) { /* private mode: just not remembered */ }
}
const modLabel = (id) => (modsApi ? modsApi.modName(id) : (MODREG.mods[id] && MODREG.mods[id].name) || id);
/** Small mod badges (HTML) for a list of mod ids. */
export function modBadges(ids) {
  return (ids || []).map((id) => {
    const m = MODREG.mods[id];
    const col = (m && cssColour(m.badge_colour)) || '#4f6367';
    return `<span class="badge mod-badge" data-mod="${esc(id)}" style="background:${col}">${esc(modLabel(id))}</span>`;
  }).join('');
}
const fmtOpt = (v) => (v === true ? 'On' : v === false ? 'Off' : v == null ? '-' : String(v));
const choiceVal = (c) => (c && typeof c === 'object' ? c.value : c);
const choiceLabel = (c) => (c && typeof c === 'object' ? (c.label != null ? c.label : c.value) : c);
function activeModsBox(ids, modOptions) {
  const box = h('div', 'active-mods');
  box.appendChild(h('div', 'am-title', 'Active mods'));
  for (const id of ids) {
    const r = h('div', 'am-row');
    r.innerHTML = modBadges([id]);
    const list = modsApi ? modsApi.optionList(id) : [];
    const vals = modOptions[id] || {};
    const parts = list.map((op) => `${esc(op.label)}: <b>${esc(fmtOpt(vals[op.key] !== undefined ? vals[op.key] : op.default))}</b>`);
    if (parts.length) r.appendChild(h('span', 'am-opts', parts.join(' · ')));
    box.appendChild(r);
  }
  return box;
}

/** The Mods panel: a toggle + options for every available mod. Edits `sel` ({ids, options}) in place. */
export function modsPanel(sel, onChange) {
  const el = h('div', 'mods-panel');
  const list = h('div', 'mods-list');
  const note = h('div', 'mods-note');
  el.append(list, note);
  const loading = new Set(), failed = new Set();
  const expanded = new Set(); // mods whose long option lists are open (collapsed by default)
  const changed = () => { saveModPrefs(sel); if (onChange) onChange(sel); };
  const say = (t) => { note.textContent = t || ''; note.style.display = t ? '' : 'none'; };
  say('');
  // load mod modules (lazily) so their options are known; a mod that can't load is turned off
  async function ensure(ids) {
    const want = ids.filter((id) => !modsApi.isLoaded(id) && !loading.has(id) && !failed.has(id));
    if (!want.length) return;
    for (const id of want) loading.add(id);
    draw();
    for (const id of want) {
      try { await modsApi.load([id]); if (!modsApi.isLoaded(id)) throw new Error('did not register'); } catch (e) { console.warn('micatro: mod failed to load', id, e); failed.add(id); }
      loading.delete(id);
    }
    const bad = sel.ids.filter((id) => failed.has(id));
    if (bad.length) {
      sel.ids = sel.ids.filter((id) => !modsApi.withRequirements([id]).some((x) => failed.has(x)));
      say(`Couldn't load ${bad.map(modLabel).join(', ')}, so it was turned off.`);
      changed();
    }
    if (el.isConnected) draw();
  }
  function toggle(id) {
    if (sel.ids.includes(id)) {
      const deps = modsApi.dependentsOf(id, sel.ids);
      sel.ids = sel.ids.filter((x) => x !== id && !deps.includes(x));
      say(deps.length ? `Also turned off ${deps.map(modLabel).join(', ')} (needs ${modLabel(id)}).` : '');
    } else {
      for (const x of modsApi.withRequirements([id])) failed.delete(x);
      const before = new Set(sel.ids);
      sel.ids = modsApi.withRequirements([...sel.ids, id]);
      const added = sel.ids.filter((x) => x !== id && !before.has(x));
      say(added.length ? `Also turned on ${added.map(modLabel).join(', ')} (required by ${modLabel(id)}).` : '');
      ensure(sel.ids);
    }
    changed();
    draw();
  }
  function setOpt(id, key, v) {
    sel.options[id] = { ...(sel.options[id] || {}), [key]: v };
    changed();
    draw();
  }
  function draw() {
    const act = document.activeElement;
    const focusKey = act && act.dataset && el.contains(act) ? act.dataset.k : null;
    list.innerHTML = '';
    for (const m of modsApi.list()) {
      const on = sel.ids.includes(m.id);
      const row = h('div', 'mod-row' + (on ? ' on' : ''));
      row.dataset.mod = m.id;
      const head = h('div', 'mod-head');
      const title = h('div', 'mod-title');
      const by = m.by || m.author;
      title.innerHTML = `<span class="mod-name">${esc(m.name || m.id)}</span>${m.preview ? ' <span class="mod-preview">PREVIEW</span>' : ''}${by ? ` <span class="mod-by">by ${esc(by)}</span>` : ''}${m.size ? ` <span class="mod-size">${esc(m.size)}</span>` : ''}`;
      head.appendChild(title);
      const t = btn(on ? 'On' : 'Off', 'mod-toggle ' + (on ? 'green on' : 'grey'), () => toggle(m.id));
      t.dataset.k = 'toggle:' + m.id;
      t.setAttribute('aria-pressed', on ? 'true' : 'false');
      t.setAttribute('aria-label', `${m.name || m.id}: ${on ? 'on' : 'off'}`);
      head.appendChild(t);
      row.appendChild(head);
      const desc = m.description || m.desc;
      if (desc) row.appendChild(h('div', 'mod-desc', esc(desc)));
      if ((m.requires || []).length) row.appendChild(h('div', 'mod-req', 'Requires ' + m.requires.map((r) => `<b>${esc(modLabel(r))}</b>`).join(', ')));
      if (on) {
        const opts = h('div', 'mod-opts');
        if (loading.has(m.id)) opts.appendChild(h('div', 'muted', 'Loading…'));
        else if (failed.has(m.id)) opts.appendChild(h('div', 'red', "Couldn't load this mod."));
        else {
          const optList = modsApi.optionList(m.id);
          // Long option lists (e.g. a per-card toggle for every joker) start collapsed.
          const LONG = 6;
          const collapsed = optList.length > LONG && !expanded.has(m.id);
          if (optList.length > LONG) {
            const tg = btn(collapsed ? `Options (${optList.length}) ▸` : `Options (${optList.length}) ▾`, 'grey opt mod-opts-toggle', () => { if (expanded.has(m.id)) expanded.delete(m.id); else expanded.add(m.id); draw(); });
            tg.dataset.k = 'opts:' + m.id;
            tg.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            opts.appendChild(tg);
          }
          for (const op of (collapsed ? [] : optList)) {
            const cur = sel.options[m.id] && sel.options[m.id][op.key] !== undefined ? sel.options[m.id][op.key] : op.default;
            const r = h('div', 'mod-opt');
            r.appendChild(h('div', 'mod-opt-l', esc(op.label)));
            const g = h('div', 'opt-g');
            if (op.type === 'bool') {
              const b = btn(cur ? 'On' : 'Off', 'grey opt mod-opt-b' + (cur ? ' on' : ''), () => setOpt(m.id, op.key, !cur));
              b.dataset.k = `opt:${m.id}:${op.key}`; b.dataset.opt = op.key;
              b.setAttribute('aria-pressed', cur ? 'true' : 'false');
              g.appendChild(b);
            } else if (op.type === 'choice' && op.choices) {
              for (const c of op.choices) {
                const val = choiceVal(c);
                const b = btn(esc(String(choiceLabel(c))), 'grey opt mod-opt-c' + (val === cur ? ' on' : ''), () => setOpt(m.id, op.key, val));
                b.dataset.k = `opt:${m.id}:${op.key}:${val}`; b.dataset.opt = op.key; b.dataset.val = String(val);
                g.appendChild(b);
              }
            } else g.appendChild(h('span', 'mod-opt-v', esc(fmtOpt(cur))));
            r.appendChild(g);
            opts.appendChild(r);
          }
        }
        if (opts.childNodes.length) row.appendChild(opts);
      }
      list.appendChild(row);
    }
    // keep keyboard focus on the control that was pressed (the list was rebuilt)
    if (focusKey) { const f = [...list.querySelectorAll('[data-k]')].find((x) => x.dataset.k === focusKey); if (f) f.focus(); }
  }
  draw();
  modal(el, { title: 'Mods', cls: 'mods-modal' });
  ensure(sel.ids);
  return el;
}
