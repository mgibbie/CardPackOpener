// Menus and modal screens: main menu, new-run setup (deck + stake + seed),
// leaderboard, how-to-play, run info (poker hands / blinds / vouchers), options,
// deck viewer, game over / win. All draw from plain view data.
import { cellEl, drawCell, CENTERS, BLINDS, LOC, STAKE_LIST, BACK_LIST, TAGS } from './assets.js';
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
  let bi = Math.max(0, BACK_LIST.findIndex((b) => b.key === pref.back));
  let stake = Math.min(8, Math.max(1, pref.stake || 1));
  const el = h('div', 'new-run');
  const deckRow = h('div', 'nr-row nr-deck');
  const left = btn('‹', 'arrow red', () => { bi = (bi + BACK_LIST.length - 1) % BACK_LIST.length; draw(); });
  const right = btn('›', 'arrow red', () => { bi = (bi + 1) % BACK_LIST.length; draw(); });
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
  const play = btn('Play', 'blue big wide b-start', () => {
    const back = BACK_LIST[bi].key;
    try { localStorage.setItem(PREF, JSON.stringify({ back, stake })); } catch (e) { /* ignore */ }
    const seed = seedOn.checked && seedIn.value ? seedIn.value : undefined;
    closeAll();
    o.onNew({ back, stake, seed });
  });
  el.appendChild(play);
  function draw() {
    const b = BACK_LIST[bi];
    deckView.innerHTML = '';
    deckView.appendChild(cellEl('centers', b.pos, 'nr-back'));
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
export async function leaderboard(net, highlight) {
  const el = h('div', 'leaders', '<div class="muted">Loading…</div>');
  modal(el, { title: 'Leaderboard', cls: 'lb-modal' });
  if (!net || !net.fetchLeaderboard) { el.innerHTML = '<div class="muted">The leaderboard is unavailable right now.</div>'; return; }
  try {
    if (net.isLoggedIn && !net.isLoggedIn()) {
      el.innerHTML = '<div class="muted">Log in to see the high scores and post your own.</div><a class="login-link" href="/login/?next=%2Fmicatro%2F">Log in</a>';
      return;
    }
    const r = await net.fetchLeaderboard({ limit: 50 });
    const rows = Array.isArray(r) ? r : (r && (r.top || r.rows || r.scores)) || [];
    highlight = highlight || (r && r.me);
    if (!rows.length) { el.innerHTML = `<div class="muted">${r && r.error && r.error !== 'not logged in' ? 'Could not load the leaderboard.' : 'No scores yet — be the first!'}</div>`; return; }
    const tbl = h('div', 'lb-table');
    tbl.innerHTML = '<div class="lb-row lb-h"><span>#</span><span>Player</span><span>Best hand</span><span>Ante</span><span>Deck</span></div>' +
      rows.map((x, i) => {
        const user = x.user || x.username || x.name || '?';
        const back = x.back && CENTERS[x.back] ? CENTERS[x.back].name.replace(' Deck', '') : '';
        return `<div class="lb-row${highlight && highlight === user ? ' me' : ''}"><span>${x.rank || i + 1}</span><span>${esc(user)}${x.won ? ' <span class="won">★</span>' : ''}</span><span class="chips">${fmt(x.score || 0)}</span><span>${x.ante || ''}</span><span>${esc(back)}${x.stake > 1 ? ' · ' + x.stake : ''}</span></div>`;
      }).join('');
    el.innerHTML = '';
    el.appendChild(tbl);
    if (r && r.you && r.you.rank && !rows.some((x) => (x.name || x.user) === highlight)) el.appendChild(h('div', 'lb-you', `Your best: <b class="chips">${fmt(r.you.score || 0)}</b> · rank <b class="attn">#${r.you.rank}</b>`));
  } catch (e) { el.innerHTML = '<div class="muted">Could not load the leaderboard.</div>'; }
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
  if (o.net) acts.appendChild(btn('Leader<br>board', 'green big', () => leaderboard(o.net, o.me)));
  el.appendChild(acts);
  modal(el, { cls: 'go-modal', noClose: true });
}
