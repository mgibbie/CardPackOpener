// Menus and modal screens: main menu, new-run setup (deck + stake + seed),
// leaderboard, how-to-play, run info (poker hands / blinds / vouchers), options,
// deck viewer, game over / win. All draw from plain view data.
import { cellEl, drawCell, CENTERS, CARDS, BLINDS, LOC, STAKE_LIST, BACK_LIST, TAGS, MODREG, cssColour, drawModCell, onModAtlas } from './assets.js';
import { composeFace, FACE_W, FACE_H, soulLayer, drawSoul } from './cardsprite.js';
import { markup, fmt, esc, describeCenterFallback } from './markup.js';
import { sound } from './sound.js';
import { all as modAll } from './modui.js';
import { skinSuits, choicesFor, choiceFor, setSkin, drawSkinFront, onSkins } from './skins.js';
import { stickersShown, setStickersShown, onWinStickers, retiredStickers } from './stickers.js';
import { stickDeckCanvas } from './decksticker.js';
import { getProgress, badgePills, ACHIEVEMENTS, TYPES, typeStyle, typesBeaten, monoWins } from './progress.js';

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
  if (o.replays) bar.appendChild(btn('Replays', 'orange big b-replays', () => replaysList(o.replays)));
  if (o.challenges) bar.appendChild(btn('Chal&shy;lenges', 'red big b-challenges', () => challengesScreen(o)));
  bar.appendChild(btn('Achieve&shy;ments', 'green big b-achievements', () => achievementsScreen()));
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

/** What a mod UI module gets to draw its screens with (ui/modui.js: Pokermon's Pokédex). */
export function modApi() {
  return { modal, closeModal, cardCanvas: liveCard, markup, esc, fmt, btn };
}

/** A card canvas that redraws itself once its mod art has loaded (screens built before the atlas arrived). */
export function liveCard(d, cls, backKey) {
  const c = cardCanvas(d, cls, backKey);
  const want = new Set([d.atlas, d.front_atlas, d.back_atlas].filter(Boolean));
  if (want.size) {
    const off = onModAtlas((name) => {
      if (!c.isConnected && c._drawn) { off(); return; }
      if (want.has(name)) { c._drawn = true; drawStill(c.getContext('2d'), d, backKey); }
    });
  }
  return c;
}

export function cardCanvas(d, cls, backKey) {
  const c = document.createElement('canvas');
  c.width = FACE_W; c.height = FACE_H;
  c.className = 'mini-card ' + (cls || '');
  drawStill(c.getContext('2d'), d, backKey);
  return c;
}
/** A still card: the face plus its floating layer (legendaries, The Soul, a Mega Pokémon's sprite) flattened on. */
function drawStill(ctx, d, backKey) {
  composeFace(ctx, d, backKey, { collection: true });
  const soul = soulLayer(d);
  if (soul) drawSoul(ctx, soul);
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
// The custom deck picked for the next run ({id, def}; written by ui/deckeditor.js) — read without loading the editor.
function readCustomDeckSel() {
  try { const s = JSON.parse(localStorage.getItem('micatro_cdeck_sel') || 'null'); return s && s.def && typeof s.def === 'object' ? s : null; } catch (e) { return null; }
}
const deckEditor = () => import('./deckeditor.js');
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
  // Stakes: the 8 base stakes, then the stakes of the selected mods (passed to the engine by key).
  let stakes = STAKE_LIST.map((s, i) => ({ ...s, level: i + 1 }));
  const refreshStakes = (sel) => {
    const cur = stakes[si] && (stakes[si].level || stakes[si].key);
    const extra = modsApi && modsApi.stakes ? modsApi.stakes(sel.ids.filter((id) => modsApi.isLoaded(id))) : [];
    stakes = STAKE_LIST.map((s, i) => ({ ...s, level: i + 1 })).concat(extra);
    si = Math.max(0, stakes.findIndex((s) => (s.level || s.key) === cur));
  };
  let si = Math.max(0, Math.min(7, (typeof pref.stake === 'number' ? pref.stake : 1) - 1));
  refreshStakes(msel0);
  if (typeof pref.stake === 'string') si = Math.max(0, stakes.findIndex((s) => s.key === pref.stake));
  const el = h('div', 'new-run');
  const deckRow = h('div', 'nr-row nr-deck');
  const left = btn('‹', 'arrow red', () => { bi = (bi + backs.length - 1) % backs.length; draw(); });
  const right = btn('›', 'arrow red', () => { bi = (bi + 1) % backs.length; draw(); });
  const deckView = h('div', 'nr-deckview');
  const deckInfo = h('div', 'nr-info');
  deckRow.append(left, deckView, deckInfo, right);
  el.appendChild(deckRow);
  const stakeRow = h('div', 'nr-row nr-stake');
  const sl = btn('‹', 'arrow red', () => { si = (si + stakes.length - 1) % stakes.length; draw(); });
  const sr = btn('›', 'arrow red', () => { si = (si + 1) % stakes.length; draw(); });
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
    mrow.appendChild(btn('Mods', 'green b-mods', () => modsPanel(msel, () => { drawMods(); refreshBacks(msel); refreshStakes(msel); refreshSleeves(msel); draw(); })));
    el.appendChild(mrow);
  }
  function drawMods() {
    if (!modsSum) return;
    modsSum.innerHTML = msel.ids.length ? modBadges(msel.ids) : '<span class="muted">None (vanilla run)</span>';
  }
  drawMods();
  // custom deck (the native deck editor, ui/deckeditor.js, loaded on demand): the chosen deck replaces the deck above
  let csel = readCustomDeckSel();
  const crow = h('div', 'nr-mods nr-cdeck');
  crow.appendChild(h('span', 'nr-mods-l', 'Custom deck'));
  const csum = h('span', 'nr-mods-sum nr-cdeck-sum');
  const coff = btn('Off', 'grey b-cdeck-off', () => { csel = null; deckEditor().then((m) => m.setSelection(null)).catch(() => {}); drawC(); draw(); });
  const copen = btn('Decks', 'green b-cdecks', () => deckEditor().then((m) => m.openDeckList({
    net: o.net, modsApi, selectedMods: () => msel.ids,
    onPick: (entry) => { csel = entry; m.setSelection(entry); drawC(); draw(); },
  })).catch((e) => console.warn('micatro: deck editor unavailable', e)));
  crow.append(csum, coff, copen);
  el.appendChild(crow);
  function drawC() {
    csum.innerHTML = csel ? `<b class="attn">${esc(csel.def.name)}</b>` : '<span class="muted">Off (play a deck above)</span>';
    coff.style.display = csel ? '' : 'none';
    left.disabled = right.disabled = !!csel;
  }
  drawC();
  // deck sleeve (CardSleeves, engine/sleeve.js): a deck variant from the selected mods, put on top of the
  // deck above; part of the run recipe. The last pick is remembered per player.
  const SL_KEY = 'micatro_sleeve_v1:' + (o.me || 'guest');
  let slKey = null;
  try { slKey = localStorage.getItem(SL_KEY) || null; } catch (e) { slKey = null; }
  let sleeves = [];
  const srow = h('div', 'nr-row nr-sleeve');
  const cycle = (dir) => {
    const keys = [null, ...sleeves.map((x) => x.key)];
    const i = Math.max(0, keys.indexOf(slKey));
    slKey = keys[(i + dir + keys.length) % keys.length];
    drawS();
  };
  const sll = btn('‹', 'arrow red b-sleeve-prev', () => cycle(-1));
  const slr = btn('›', 'arrow red b-sleeve-next', () => cycle(1));
  const sleeveView = h('div', 'nr-sleeveview');
  const sleeveInfo = h('div', 'nr-info');
  srow.append(sll, sleeveView, sleeveInfo, slr);
  el.insertBefore(srow, deckRow.nextSibling);
  function refreshSleeves(sel) {
    const ids = modsApi ? sel.ids.filter((id) => modsApi.isLoaded(id)) : [];
    sleeves = o.sleeves && ids.length ? o.sleeves.list(modsApi.withRequirements(ids), sel.options) : [];
  }
  function drawS() {
    srow.style.display = sleeves.length && !csel ? '' : 'none';
    const s = sleeves.find((x) => x.key === slKey) || null;
    sleeveView.innerHTML = '';
    if (!s) {
      sleeveView.appendChild(h('div', 'nr-nosleeve', 'No<br>sleeve'));
      sleeveInfo.innerHTML = `<div class="nr-name">No Sleeve</div><div class="nr-desc">${sleeves.length} sleeve${sleeves.length === 1 ? '' : 's'} from your mods — put one on the deck for a variant.</div>`;
      return;
    }
    const info = o.sleeves.info(s, backs[bi] && backs[bi].key);
    const c = document.createElement('canvas');
    c.className = 'nr-sleeve-art'; c.width = 146; c.height = 190;
    const paint = () => { const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); drawModCell(ctx, s.atlas, s.pos, 0, 0, c.width, c.height); };
    paint();
    const off = onModAtlas((name) => { if (name === s.atlas) { paint(); off(); } });
    sleeveView.appendChild(c);
    sleeveInfo.innerHTML = `<div class="nr-name">${esc(info.name)}${info.alt ? ' <span class="mod-preview nr-alt" title="Paired with this deck">+ deck</span>' : ''} ${modBadges([s.mod])}</div><div class="nr-desc">${info.lines.map(markup).join('<br>')}</div>`;
  }
  refreshSleeves(msel);
  // decks of saved-on mods appear once those mods have loaded
  if (modsApi && msel.ids.length) Promise.resolve(modsApi.load(modsApi.withRequirements(msel.ids))).then(() => { refreshBacks(msel); refreshStakes(msel); refreshSleeves(msel); if (el.isConnected) draw(); }).catch(() => {});
  const play = btn('Play', 'blue big wide b-start', () => {
    const back = backs[bi].key;
    const st = stakes[si] || stakes[0];
    const stake = st.level || st.key;
    try { localStorage.setItem(PREF, JSON.stringify({ back, stake })); } catch (e) { /* ignore */ }
    const seed = seedOn.checked && seedIn.value ? seedIn.value : undefined;
    const mods = modsApi ? modsApi.withRequirements(msel.ids) : [];
    const modOptions = {};
    for (const id of mods) if (msel.options[id]) modOptions[id] = { ...msel.options[id] };
    closeAll();
    const cdeck = csel ? { customDeck: csel.def } : {};
    const sl = !csel && slKey && sleeves.some((x) => x.key === slKey) ? slKey : null;
    try { if (slKey) localStorage.setItem(SL_KEY, slKey); else localStorage.removeItem(SL_KEY); } catch (e) { /* ignore */ }
    if (sl) cdeck.sleeve = sl;
    o.onNew(mods.length ? { back, stake, seed, mods, modOptions, ...cdeck } : { back, stake, seed, ...cdeck });
  });
  el.appendChild(play);
  // (a special sticker's sprite arriving, or a sync bringing new ones: redraw the deck)
  const offStk = onWinStickers(() => { if (!el.isConnected) { offStk(); return; } draw(); });
  function draw() {
    drawS();
    const b = backs[bi];
    deckView.innerHTML = '';
    if (b.mod) {
      // a mod deck: its own atlas cell (redrawn when the art arrives)
      const c = document.createElement('canvas');
      c.className = 'nr-back'; c.width = 142; c.height = 190;
      const paint = () => { const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); if (!drawModCell(ctx, b.atlas, b.pos, 0, 0, c.width, c.height)) drawCell(ctx, 'centers', { x: 0, y: 2 }, 0, 0, c.width, c.height); stickDeckCanvas(c, b.key); };
      paint();
      const off = onModAtlas((name) => { if (name === b.atlas) { paint(); off(); } });
      deckView.appendChild(c);
    } else deckView.appendChild(cellEl('centers', b.pos, 'nr-back'));
    // the deck's win sticker (the highest stake won with it; Arceus / Ambipom / Aipom for Pokermon's badges)
    if (!b.mod) stickDeckCanvas(deckView.lastChild, b.key);
    const d = backDesc(b.key);
    deckInfo.innerHTML = `<div class="nr-name">${esc(d.name || b.name)}</div><div class="nr-desc">${(d.lines || []).map(markup).join('<br>')}</div>`;
    if (csel) {
      deckView.innerHTML = '';
      deckView.appendChild(cardCanvas({ facing: 'back' }, 'nr-back', csel.def.back));
      deckInfo.innerHTML = `<div class="nr-name">${esc(csel.def.name)}</div><div class="nr-desc">Custom deck${csel.def.desc ? '<br>' + esc(csel.def.desc) : ''}</div>`;
    }
    const s = stakes[si];
    stakeView.innerHTML = '';
    if (s && s.mod) {
      const c = document.createElement('canvas');
      c.className = 'nr-chip'; c.width = 58; c.height = 58;
      const paint = () => { const ctx = c.getContext('2d'); ctx.clearRect(0, 0, 58, 58); drawModCell(ctx, s.atlas, s.pos, 0, 0, 58, 58); };
      paint();
      const off = onModAtlas((name) => { if (name === s.atlas) { paint(); off(); } });
      stakeView.appendChild(c);
    } else if (s) stakeView.appendChild(cellEl('chips', s.pos, 'nr-chip'));
    const sd = s && (s.mod ? s.text : LOC.descriptions.Stake[s.key]);
    const sname = sd ? sd.name : (s && s.name) || 'Stake';
    stakeInfo.innerHTML = `<div class="nr-name">${esc(sname)}${s && s.mod ? ' <span class="mod-preview" style="background:#4f6367;color:#fff">' + esc(modsApi && modsApi.modName ? modsApi.modName(s.mod) : s.mod) + '</span>' : ''}</div><div class="nr-desc">${sd && sd.text ? sd.text.map(markup).join('<br>') : ''}</div>`;
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
          const mods = (Array.isArray(x.mods) && x.mods.length ? `<span class="lb-mods">${modBadges(x.mods)}</span>` : '') +
            (x.customDeck ? `<span class="lb-cdeck">Custom deck: ${esc(x.customDeck)}</span>` : '');
          // the row's run replay (a whole run, re-simulated in the viewer) — a ▶ beside the name
          const rp = typeof x.replay === 'string' && /^[a-f0-9]{8,20}$/.test(x.replay) ? `<a class="lb-replay b-lb-replay" href="/micatro/?replay=${x.replay}" title="Watch this run" aria-label="Watch ${esc(user)}'s run">▶</a>` : '';
          // a won Pokermon run's Nuzlocke / Monotype tag (client-reported, like the score)
          const rbs = lbBadges(x.badges);
          return `<div class="lb-row${hl && hl === user ? ' me' : ''}${mods ? ' modded' : ''}"><span>${x.rank || i + 1}</span><span>${rp}${esc(user)}${x.won ? ' <span class="won">★</span>' : ''}${rbs}${mods}</span><span class="chips">${lbScore(x)}</span><span>${x.ante || ''}</span><span>${esc(back)}${x.stake > 1 ? ' · ' + x.stake : ''}</span></div>`;
        }).join('');
      body.innerHTML = '';
      body.appendChild(tbl);
      if (r && r.you && r.you.rank && !rows.some((x) => (x.name || x.user) === hl)) body.appendChild(h('div', 'lb-you', `Your best: <b class="chips">${lbScore(r.you)}</b> · rank <b class="attn">#${r.you.rank}</b>`));
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
      // Every redeemed voucher, base and mod, in a list that scrolls once it's long (a run can redeem dozens
      // with BETMMA's bundles / B1G vouchers — Micatro's take on its Better Vouchers This Run UI).
      const modV = (k2) => { const m = MODREG.center(k2); return m && m.set === 'Voucher' ? m : null; };
      const vs = (view.vouchers || []).map((k2) => [k2, CENTERS[k2] || modV(k2)]).filter(([, c]) => c);
      const list = h('div', 'voucher-list');
      if (!vs.length) list.appendChild(h('div', 'muted', 'No vouchers redeemed yet.'));
      else body.appendChild(h('div', 'ri-note', `<b class="attn">${vs.length}</b> voucher${vs.length === 1 ? '' : 's'} redeemed`));
      if (vs.length > 6) { list.style.maxHeight = '58vh'; list.style.overflowY = 'auto'; list.style.overscrollBehavior = 'contain'; list.style.paddingRight = '6px'; }
      for (const [k2, c] of vs) {
        const it = h('div', 'voucher-item');
        let d, vals;
        if (c.mod) {
          const cv = document.createElement('canvas'); cv.width = FACE_W; cv.height = FACE_H; cv.className = 'v-ico';
          const draw = () => { const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, FACE_W, FACE_H); return drawModCell(ctx, c.atlas, c.pos, 0, 0, FACE_W, FACE_H); };
          if (!draw()) { const off = onModAtlas((name) => { if (name === c.atlas) { draw(); off(); } }); }
          it.appendChild(cv);
          const mod = MODREG.mods[c.mod];
          const ml = mod && mod.content && mod.content.loc && mod.content.loc.descriptions;
          const md = ml && ml.Voucher && ml.Voucher[k2];
          d = { name: (md && md.name) || c.name || k2, lines: (md && md.text) || [] };
          try { vals = (c.loc_vars && (c.loc_vars(c, [], { ability: JSON.parse(JSON.stringify(c.config || {})), config: { center: c }, fake: true }) || {}).vars) || []; } catch (e) { vals = []; }
        } else {
          it.appendChild(cellEl('Voucher', c.pos, 'v-ico'));
          d = describeCenterFallback(k2);
          vals = Object.values(c.config || {}).filter((x) => typeof x === 'number');
        }
        it.appendChild(h('div', 'v-text', `<div class="nr-name">${esc(d.name)}</div><div class="nr-desc">${(d.lines || []).map((l) => markup(String(l).replace(/#(\d+)#/g, (m, i) => (vals[i - 1] != null ? (typeof vals[i - 1] === 'number' ? fmt(vals[i - 1]) : String(vals[i - 1])) : '')))).join('<br>')}</div>`));
        list.appendChild(it);
      }
      body.appendChild(list);
    }
  };
  for (const [k, label] of [['hands', 'Poker Hands'], ['blinds', 'Blinds'], ['vouchers', 'Vouchers']]) {
    const b = btn(label, 'red tab', () => show(k)); b.dataset.k = k; tabs.appendChild(b);
  }
  // Mod tabs (view.mod_runinfo_tabs: [{key, label, kind: 'levels', rows: [{name, level, chips, mult, count, suit?}]}] —
  // AutumnMoodMechanics' "Suits": suit levels laid out like the poker hands list).
  for (const t of view.mod_runinfo_tabs || []) {
    const b = btn(t.label, 'red tab', () => {
      for (const x of tabs.children) x.classList.toggle('on', x === b);
      body.innerHTML = '';
      const list = h('div', 'hand-list');
      for (const r of t.rows || []) {
        const col = r.suit ? (SUIT_COL[r.suit] || '#4f6367') : '#4f6367';
        const asc = r.asc ? ' <b class="money">+' + r.asc + '</b>' : '';
        list.appendChild(h('div', 'hand-row', '<span class="hl-lvl" style="color:' + lvlCol(r.level) + '">lvl.' + r.level + asc + '</span><span class="hl-name" style="color:' + col + '">' + esc(r.name) +
          '</span><span class="hl-cxm"><span class="cx">' + fmt(r.chips) + '</span><b>X</b><span class="mx">' + fmt(r.mult) + '</span></span><span class="hl-played">#&nbsp;' + (r.count == null ? '' : r.count) + '</span>'));
      }
      if (!(t.rows || []).length) list.appendChild(h('div', 'muted', esc(t.empty || 'Nothing here yet.')));
      body.appendChild(list);
    });
    b.dataset.k = 'mod:' + t.key; tabs.appendChild(b);
  }
  // Mod UI tabs (ui/modui.js runInfoTabs: Pokermon's Pokédex — the controller's way in)
  for (const t of modAll('runInfoTabs', view)) {
    const b = btn(t.label, 'red tab b-ri-' + t.key, () => {
      for (const x of tabs.children) x.classList.toggle('on', x === b);
      body.innerHTML = '';
      try { t.render(body, modApi()); } catch (e) { console.warn('micatro: mod tab', e); body.innerHTML = '<div class="muted">Unavailable.</div>'; }
    });
    b.dataset.k = 'modui:' + t.key; tabs.appendChild(b);
  }
  // Pokermon runs: the live Nuzlocke / Monotype status + this player's record
  if (view.run_badges) {
    const b = btn('Badges', 'red tab b-ri-badges', () => {
      for (const x of tabs.children) x.classList.toggle('on', x === b);
      body.innerHTML = '';
      body.appendChild(runBadgesPanel(view.run_badges));
    });
    b.dataset.k = 'badges'; tabs.appendChild(b);
  }
  // the deck (+ its win sticker, like Balatro's deck select)
  if (view.back && !view.custom_deck && !view.challenge) {
    const dk = h('div', 'ri-deck'); // (not .ri-mods: tests and styles read the first .ri-mods as the mods row)
    const cv = cardCanvas({ facing: 'back' }, 'ri-back', view.back);
    dk.appendChild(cv);
    const st = stickDeckCanvas(cv, view.back);
    const bn = (CENTERS[view.back] || MODREG.center(view.back) || {}).name || view.back;
    dk.appendChild(h('span', '', `<span class="muted">Deck</span> <b class="attn">${esc(bn)}</b>${st ? ' <span class="muted">· ' + esc(st.label) + '</span>' : ''}`));
    el.appendChild(dk);
  }
  if (view.challenge) el.appendChild(h('div', 'ri-mods ri-challenge', `<span class="muted">Challenge</span> <b class="attn">${esc(view.challenge.name)}</b>`));
  if (view.sleeve) el.appendChild(h('div', 'ri-mods ri-sleeve', `<span class="muted">Sleeve</span> <b class="attn">${esc(view.sleeve.name)}</b>`));
  if (view.mods && view.mods.length) el.appendChild(h('div', 'ri-mods', `<span class="muted">Mods</span> ${modBadges(view.mods)}`));
  if (view.custom_deck) el.appendChild(h('div', 'ri-mods ri-cdeck', `<span class="muted">Custom deck</span> <b class="attn">${esc(view.custom_deck.name)}</b>`));
  el.append(tabs, body);
  show('hands');
  modal(el, { title: 'Run Info', cls: 'ri-modal' });
}
const SUIT_COL = { Spades: '#403995', Hearts: '#f03464', Clubs: '#235955', Diamonds: '#f06b3f' };
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
  // Balatro's "Display stickers": the jokers' win stickers on the table (ui/stickers.js)
  row('Stake stickers', [[true, 'On'], [false, 'Off']], stickersShown(), (v) => setStickersShown(v));
  const sk = skinsBox();
  if (sk) el.appendChild(sk);
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

// ------------------------------------------------------------ deck skins
// Options > Card skins (ui/skins.js): per suit, the face cards' art from the mods that ship skins
// (Pokermon's RBY / GSC sprites, Bunco's). Cosmetic, remembered per player; changes show at once.
const SUIT_PREVIEW = { Spades: 'S', Hearts: 'H', Clubs: 'C', Diamonds: 'D' };
function skinPreview(suit, rank) {
  const c = document.createElement('canvas');
  c.width = FACE_W; c.height = FACE_H; c.className = 'mini-card sk-card';
  const ctx = c.getContext('2d');
  drawCell(ctx, 'centers', { x: 1, y: 0 }, 0, 0, FACE_W, FACE_H);
  const L = SUIT_PREVIEW[suit];
  const d = L ? { front: L + '_' + rank } : { front: suit + '_' + rank, front_suit: suit };
  const pos = L && CARDS[d.front] ? CARDS[d.front].pos : null;
  if (!drawSkinFront(ctx, d, pos, FACE_W, FACE_H) && pos) drawCell(ctx, 'cards_1', pos, 0, 0, FACE_W, FACE_H);
  return c;
}
function skinsBox() {
  const box = h('div', 'skins-box');
  box.appendChild(h('div', 'am-title', 'Card skins'));
  const rows = h('div', 'sk-rows');
  box.appendChild(rows);
  const draw = () => {
    rows.innerHTML = '';
    box.style.display = skinSuits().length ? '' : 'none'; // (the lists load at boot; shown once they have)
    for (const { suit, name } of skinSuits()) {
      const ch = choicesFor(suit);
      const cur = choiceFor(suit);
      let i = Math.max(0, ch.findIndex((x) => cur && x.skin === cur.skin && x.palette === cur.palette));
      const r = h('div', 'sk-row');
      r.dataset.suit = suit;
      r.appendChild(h('div', 'sk-suit', esc(name)));
      const set = (j) => { const x = ch[(j + ch.length) % ch.length]; setSkin(suit, x.skin, x.palette); };
      const prev = btn('‹', 'grey sk-arrow b-skin-prev', () => set(i - 1));
      const next = btn('›', 'grey sk-arrow b-skin-next', () => set(i + 1));
      prev.dataset.k = 'skin-prev:' + suit; next.dataset.k = 'skin-next:' + suit;
      const mid = h('div', 'sk-mid');
      const cards = h('div', 'sk-cards');
      // (a mod suit's own default art comes with its mod; only a chosen skin is previewed for it)
      if (SUIT_PREVIEW[suit] || cur) for (const rk of ['K', 'Q', 'J']) cards.appendChild(skinPreview(suit, rk));
      mid.append(cards, h('div', 'sk-name', esc(ch[i].label)));
      r.append(prev, mid, next);
      rows.appendChild(r);
    }
  };
  draw();
  const off = onSkins(() => { if (!box.isConnected) { off(); return; } draw(); });
  return box;
}

// ------------------------------------------------------------ deck view
const SUIT_ORDER = ['S', 'H', 'C', 'D'];
const RANK_ORDER = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
export function deckView(view) {
  const el = h('div', 'deck-view');
  // Mod tabs beside the full deck (view.mod_deck_tabs: [{key, label, list, empty}] — AutumnMoodMechanics' Graveyard).
  const mt = view.mod_deck_tabs || [];
  if (mt.length) {
    const tabs = h('div', 'tabs');
    const body = h('div', 'tab-body');
    const show = (k) => {
      for (const b of tabs.children) b.classList.toggle('on', b.dataset.k === k);
      body.innerHTML = '';
      const t = mt.find((x) => x.key === k);
      body.appendChild(deckBody(view, t ? t.list || [] : view.deck_list || [], t));
    };
    for (const [k, label] of [['full', 'Full Deck'], ...mt.map((t) => [t.key, t.label])]) {
      const b = btn(label, 'red tab', () => show(k)); b.dataset.k = k; tabs.appendChild(b);
    }
    el.append(tabs, body);
    show('full');
    modal(el, { title: 'Deck', cls: 'dv-modal' });
    return;
  }
  el.appendChild(deckBody(view, view.deck_list || []));
  modal(el, { title: 'Deck', cls: 'dv-modal' });
}
/** One deck listing (the full deck, or a mod tab's cards). */
function deckBody(view, src, tab) {
  const el = h('div', 'deck-body');
  const list = (src || []).slice();
  if (tab && !list.length) { el.appendChild(h('div', 'muted', esc(tab.empty || 'Empty'))); return el; }
  const counts = { total: list.length, left: list.filter((x) => x[4]).length };
  const rankOf = (k) => (k || '').split('_')[1] || '';
  const suitOf = (k) => (k || '').split('_')[0] || '';
  const summary = h('div', 'dv-sum');
  const by = (f) => list.filter(f).length;
  summary.innerHTML = `<div>${tab ? `<b class="attn">${counts.total}</b> cards` : `<b class="attn">${counts.left}</b>/${counts.total} cards remaining`}</div>
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
  return el;
}

// ---------------------------------------------------------- game over
export function gameOver(view, o) {
  const won = !!o.won;
  const el = h('div', 'game-over' + (won ? ' win' : ''));
  el.appendChild(h('div', 'go-title', won ? (view.challenge ? 'Challenge Complete!' : 'You Win!') : 'Game Over'));
  if (view.challenge) el.appendChild(h('div', 'go-challenge', `Challenge: <b class="attn">${esc(view.challenge.name)}</b><br><span class="muted">Challenge runs post no high scores</span>`));
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
  // Pokermon: the Nuzlocke / Monotype badges this win earned (view.run_badges.earned)
  const earned = won && view.run_badges && view.run_badges.earned;
  if (earned && (earned.nuz || earned.mono)) el.appendChild(h('div', 'go-badges', `<span class="muted">Badges earned</span> ${badgePills({ nuz: earned.nuz, mono: earned.mono })}`));
  const rank = h('div', 'go-rank');
  el.appendChild(rank);
  if (o.rankPromise) o.rankPromise.then((r) => { if (r && r.rank) rank.innerHTML = `Leaderboard rank <b class="attn">#${r.rank}</b>`; else if (r && r.ok) rank.innerHTML = 'Score posted!'; }).catch(() => {});
  else if (o.guest && !view.challenge) rank.innerHTML = '<a class="login-link" href="/login/?next=%2Fmicatro%2F">Log in to post high scores</a>';
  // the WHOLE run's replay (never just this round): watch it, or copy its share link (signed in)
  if (o.replay) {
    const rb = h('div', 'go-replay');
    rb.appendChild(btn('▶ Watch replay', 'green b-watch-replay', () => o.replay.watch()));
    if (!o.replay.guest) {
      const cp = btn('🔗 Copy replay link', 'grey b-copy-replay', async () => {
        cp.disabled = true; cp.textContent = 'Uploading…';
        let url = null;
        try { url = await o.replay.link(); } catch (e) { url = null; }
        cp.textContent = url ? ((await copyText(url)) ? '✓ Link copied' : url) : 'Could not share it';
        cp.dataset.url = url || '';
        cp.disabled = false;
      });
      rb.appendChild(cp);
    }
    el.appendChild(rb);
  }
  const acts = h('div', 'go-acts');
  if (won && o.onEndless) acts.appendChild(btn('Endless Mode', 'orange big b-endless', () => { closeModal(); o.onEndless(); }));
  acts.appendChild(btn('New Run', 'blue big b-newrun', () => { closeAll(); o.onNewRun(); }));
  acts.appendChild(btn('Main Menu', 'red big b-mainmenu', () => { closeAll(); o.onMainMenu(); }));
  if (o.net && !view.challenge) acts.appendChild(btn('Leader<br>board', 'green big', () => leaderboard(o.net, o.me, { modded: !!((view.mods && view.mods.length) || view.custom_deck) })));
  el.appendChild(acts);
  modal(el, { cls: 'go-modal', noClose: true });
}

/** Copy text to the clipboard (false when the browser refuses). */
export async function copyText(text) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* fall back */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch (e) { return false; }
}

// ------------------------------------------------- Pokermon run badges + achievements
/** A board row / replay meta's badges {nuz, mono:'fire'} -> clean (unknown types dropped). */
function cleanBadges(b) {
  if (!b || typeof b !== 'object') return null;
  const t = typeof b.mono === 'string' ? TYPES.find((x) => x.toLowerCase() === b.mono.toLowerCase()) : null;
  return b.nuz === true || t ? { nuz: b.nuz === true, mono: t || null } : null;
}
function lbBadges(b) { const c = cleanBadges(b); return c ? badgePills(c, { short: true, cls: 'rb-sm' }) : ''; }
/** Run Info's Badges tab: the run's live status, then the record. */
function runBadgesPanel(rb) {
  const el = h('div', 'ri-rb');
  if (!rb.eligible) el.appendChild(h('div', 'rb-row muted', 'Seeded and challenge runs earn no badges.'));
  const why = (r) => (r ? `<span class="rb-off">Broken: ${esc(r)}</span>` : '');
  const tname = TYPES.includes(rb.type) ? rb.type : null;
  el.appendChild(h('div', 'rb-row', rb.nuz ? `${badgePills({ nuz: true })} <span>Intact: never sell a joker; at most one new joker per shop (${Math.min(9, +rb.window_gains || 0)}/1 this shop)</span>` : `<b>Nuzlocke</b> ${why(rb.nuz_reason)}`));
  el.appendChild(h('div', 'rb-row', rb.mono ? `${badgePills({ mono: tname || true })} <span>${tname ? 'Intact: start every round with only ' + tname + ' jokers' : 'The jokers you start your first round with set the type'}${rb.mono_at_risk ? ' <span class="rb-off">An off-type joker is in your row: sell it before the next round</span>' : ''}</span>` : `<b>Monotype</b> ${why(rb.mono_reason)}`));
  if (rb.earned) el.appendChild(h('div', 'rb-row', `<span class="won">★ Won</span> ${badgePills(cleanBadges({ nuz: rb.earned.nuz === true, mono: rb.earned.mono || null }) || {}) || '<span class="muted">no badges</span>'}`));
  el.appendChild(recordPanel());
  el.appendChild(btn('Achievements', 'green b-ri-ach', () => achievementsScreen()));
  return el;
}
/** The account's record: Nuzlocke wins, Monotype wins per type (12), Nuzlocke + Monotype. */
function recordPanel() {
  const p = getProgress();
  const el = h('div', 'rec');
  el.style.display = 'flex'; el.style.flexDirection = 'column'; el.style.gap = '10px';
  el.appendChild(h('div', 'rec-sum',
    `<div class="rec-stat"><b class="rec-nuz">${p.nuz || 0}</b><span>Nuzlocke wins</span></div>` +
    `<div class="rec-stat"><b class="rec-mono">${monoWins(p)}</b><span>Monotype wins · ${typesBeaten(p).length}/12 types</span></div>` +
    `<div class="rec-stat"><b class="rec-both">${p.both || 0}</b><span>Nuzlocke + Monotype</span></div>`));
  el.appendChild(h('div', 'rec-types', TYPES.map((t) => {
    const n = (p.mono || {})[t.toLowerCase()] || 0;
    return `<div class="rec-type${n ? '' : ' off'}" data-type="${t}" style="${typeStyle(t)}">${t}<small>${n ? n + ' win' + (n === 1 ? '' : 's') : '-'}</small></div>`;
  }).join('')));
  // win stickers on cards a mod upgrade removed (mods/aliases.js): kept, listed greyed out
  const ret = retiredStickers();
  if (ret.length) {
    const box = h('div', 'rec-retired');
    box.appendChild(h('div', 'muted', 'Retired cards (removed by a mod update; their win stickers are kept)'));
    for (const r of ret) {
      const row = h('div', 'retired-card', `${esc(r.name)} <small>retired card${r.sticker ? ' · ' + esc(r.sticker.label) : ''}</small>`);
      row.dataset.key = r.key;
      box.appendChild(row);
    }
    el.appendChild(box);
  }
  return el;
}
/** The Achievements screen (main menu, Run Info's Badges tab): the list + the record. */
export function achievementsScreen(tab = 'ach') {
  const el = h('div', 'ach-screen');
  const tabs = h('div', 'tabs');
  const body = h('div', 'tab-body');
  el.append(tabs, body);
  const show = (k) => {
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.k === k);
    body.innerHTML = '';
    const p = getProgress();
    if (k === 'ach') {
      const list = h('div', 'ach-list');
      for (const a of ACHIEVEMENTS) {
        const ts = (p.ach || {})[a.id];
        const when = ts ? `<div class="ach-when">Unlocked ${esc(new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }))}</div>` : '';
        const row = h('div', 'ach-row' + (ts ? ' on' : ''), `<div class="ach-ico">${ts ? '★' : '?'}</div><div><div class="ach-name">${esc(a.name)}</div><div class="ach-desc">${esc(a.desc)}</div>${when}</div>`);
        row.dataset.id = a.id;
        list.appendChild(row);
      }
      body.appendChild(list);
    } else {
      body.appendChild(recordPanel());
    }
    body.appendChild(h('div', 'rec-note', 'Pokermon runs only. A Nuzlocke never sells a joker and gains at most one new joker per shop (from one blind start to the next); a Monotype starts every round with jokers of only one Pokémon type. Win the run with either one intact to earn it. Seeded and challenge runs do not count.'));
  };
  for (const [k, label] of [['ach', 'Achievements'], ['rec', 'Record']]) {
    const b = btn(label, 'red tab b-ach-' + k, () => show(k)); b.dataset.k = k; tabs.appendChild(b);
  }
  show(tab);
  modal(el, { title: 'Achievements', cls: 'ach-modal' });
}

// ------------------------------------------------------------- resume prompt
/**
 * Asked before a saved run is resumed when it can't simply continue (mods/pins.js: a mod or the engine
 * changed since it was recorded; or it can't be rebuilt). Never decides on its own: Continue anyway /
 * Abandon run (a second press confirms) / Back (keeps the save as it is).
 * o: {title, html, onContinue?, onAbandon, onBack?}
 */
export function resumePrompt(o) {
  const el = h('div', 'resume-prompt');
  el.appendChild(h('div', 'rz-text', o.html));
  const acts = h('div', 'rz-acts');
  let decided = false;
  if (o.onContinue) acts.appendChild(btn('Continue anyway', 'blue big b-resume-continue', () => { decided = true; closeModal(); o.onContinue(); }));
  const ab = btn('Abandon run', 'red big b-resume-abandon', () => {
    if (ab.dataset.armed !== '1') { ab.dataset.armed = '1'; ab.innerHTML = 'Really abandon?'; return; }
    decided = true; closeModal(); o.onAbandon();
  });
  acts.appendChild(ab);
  el.appendChild(acts);
  return modal(el, { title: o.title, cls: 'resume-modal', onClose: () => { if (!decided && o.onBack) o.onBack(); } });
}

// ------------------------------------------------------------- replays
// The main menu's Replays: this device's last 10 FINISHED runs (whole runs — there are no per-round
// replays). api: {list() -> [{id, serverId?, meta, when, recipe}], watch(e), remove(e), link(e) -> url|null, loggedIn}
export function replaysList(api) {
  const el = h('div', 'replays');
  const body = h('div', 'rp-list');
  el.appendChild(h('div', 'rp-note muted', 'Your last 10 finished runs, from the first blind to the end. Signed in, a run you share stays online for 30 days.'));
  el.appendChild(body);
  const draw = () => {
    body.innerHTML = '';
    const list = api.list();
    if (!list.length) { body.appendChild(h('div', 'muted rp-empty', 'No finished runs yet — finish a run and its replay shows up here.')); return; }
    for (const e of list) {
      const m = e.meta || {};
      const row = h('div', 'rp-row');
      row.dataset.id = e.id;
      const backName = m.customDeck ? esc(m.customDeck) : esc(((CENTERS[m.back] || MODREG.center(m.back) || {}).name || '').replace(' Deck', ''));
      const res = m.won ? (m.endless ? `<span class="won">★ Won</span> + Endless` : '<span class="won">★ Won</span>') : 'Game over';
      const when = e.when ? new Date(e.when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
      row.appendChild(h('div', 'rp-info',
        `<div class="rp-top"><span class="chips">${fmt(m.score || 0)}</span> <span class="muted">best hand</span></div>` +
        `<div class="rp-sub">${res} · Ante <b class="attn">${m.ante || 1}</b> · ${backName}${m.stake > 1 ? ' · stake ' + esc(m.stake) : ''} · <span class="muted">${esc(when)} · ${m.actions || (e.recipe && e.recipe.actions ? e.recipe.actions.length : 0)} moves</span></div>` +
        (lbBadges(m.badges) ? `<div class="rp-badges">${badgePills(cleanBadges(m.badges))}</div>` : '') +
        (Array.isArray(m.mods) && m.mods.length ? `<div class="rp-mods">${modBadges(m.mods)}</div>` : '')));
      const acts = h('div', 'rp-acts');
      acts.appendChild(btn('▶', 'green rp-watch b-rp-watch', () => api.watch(e)));
      acts.lastChild.title = 'Watch'; acts.lastChild.setAttribute('aria-label', 'Watch this run');
      if (api.loggedIn || e.serverId) {
        const cp = btn('🔗', 'grey rp-link b-rp-link', async () => {
          cp.disabled = true;
          let url = null;
          try { url = await api.link(e); } catch (er) { url = null; }
          cp.disabled = false;
          cp.dataset.url = url || '';
          cp.textContent = url && (await copyText(url)) ? '✓' : url ? '🔗' : '✗';
          if (url) cp.title = url;
        });
        cp.title = 'Copy the share link'; cp.setAttribute('aria-label', 'Copy the share link');
        acts.appendChild(cp);
      }
      const del = btn('🗑', 'red rp-del b-rp-del', () => {
        if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Delete?'; return; }
        api.remove(e); draw();
      });
      del.title = 'Delete'; del.setAttribute('aria-label', 'Delete this replay');
      acts.appendChild(del);
      row.appendChild(acts);
      body.appendChild(row);
    }
  };
  draw();
  modal(el, { title: 'Replays', cls: 'rp-modal' });
}

// ----------------------------------------------------------- challenges
// One Challenges screen (Balatro's main menu > Challenges): Balatro's 20 challenges, then every ENABLED
// mod's (the mods chosen in New Run > Mods; their modules load when the screen opens). A challenge is a
// normal run with its rules (engine/challenge.js), recorded in the run recipe by id, so resume / replay /
// spectate rebuild it. Finished challenges are ticked per player ('micatro_challenges_v1:<user>').
// o.challenges: {list(modIds) -> Promise<[challenge + info]>, done() -> {id: ts}, start(ch, mods, modOptions)}
const CH_KEY = (me) => 'micatro_challenges_v1:' + (me || 'guest');
export function challengeDone(me) {
  try { const p = JSON.parse(localStorage.getItem(CH_KEY(me)) || '{}'); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; } catch (e) { return {}; }
}
export function markChallengeDone(me, id) {
  try { const p = challengeDone(me); if (!p[id]) { p[id] = Date.now(); localStorage.setItem(CH_KEY(me), JSON.stringify(p)); } } catch (e) { /* private mode: not remembered */ }
}
export function challengesScreen(o) {
  const api = o.challenges;
  const msel = loadModPrefs();
  const el = h('div', 'challenges');
  const top = h('div', 'ch-top');
  const topNote = h('span', 'ch-note');
  top.appendChild(topNote);
  if (modsApi && modsApi.list().length) top.appendChild(btn('Mods', 'green b-ch-mods', () => modsPanel(msel, () => reload())));
  const main = h('div', 'ch-main');
  const list = h('div', 'ch-list');
  const detail = h('div', 'ch-detail');
  main.append(list, detail);
  el.append(top, main);
  let all = [], cur = null, tab = 'rules', token = 0;
  const done = () => (api.done ? api.done() : {});
  const mini = (d, cls = '') => {
    const c = liveCard({ ...d, desc: undefined }, 'ch-card ' + cls);
    c.title = d.name || d.center;
    return c;
  };
  const cardRow = (cards, empty) => {
    const r = h('div', 'ch-cards');
    if (!cards.length) { r.appendChild(h('span', 'muted', empty || 'None')); return r; }
    for (const d of cards) {
      const w = h('div', 'ch-cardw');
      w.appendChild(mini(d));
      const tags = [d.eternal ? 'Eternal' : '', d.pinned ? 'Pinned' : '', d.edition ? d.edition[0].toUpperCase() + d.edition.slice(1) : ''].filter(Boolean);
      w.appendChild(h('div', 'ch-cname', esc(d.name || d.center) + (tags.length ? `<br><span class="ch-ctag">${esc(tags.join(' · '))}</span>` : '')));
      r.appendChild(w);
    }
    return r;
  };
  const sec = (title, node) => { const b = h('div', 'ch-sec'); b.appendChild(h('div', 'ch-sec-t', esc(title))); b.appendChild(node); return b; };
  const lines = (ls) => h('div', 'ch-lines', ls.length ? ls.map((l) => `<div>${markup(l)}</div>`).join('') : '<span class="muted">None</span>');
  function drawDetail() {
    detail.innerHTML = '';
    if (!cur) { detail.appendChild(h('div', 'muted ch-empty', 'Pick a challenge.')); return; }
    const i = cur.info;
    const head = h('div', 'ch-head');
    head.innerHTML = `<span class="ch-title">${esc(cur.name)}</span>${cur.mod ? ' ' + modBadges([cur.mod]) : ''}${done()[cur.id] ? ' <span class="ch-done" title="Completed">✓ Completed</span>' : ''}`;
    detail.appendChild(head);
    const tabs = h('div', 'tabs ch-tabs');
    const body = h('div', 'ch-body');
    for (const [k, label] of [['rules', 'Rules'], ['restrictions', 'Restrictions'], ['deck', 'Deck']]) {
      const b = btn(label, 'red tab b-ch-' + k, () => { tab = k; drawDetail(); });
      b.dataset.k = 'chtab:' + k;
      if (k === tab) b.classList.add('on');
      tabs.appendChild(b);
    }
    detail.append(tabs, body);
    if (tab === 'rules') {
      body.appendChild(sec('Custom rules', lines(i.rules)));
      body.appendChild(sec('Game modifiers', lines(i.modifiers)));
      body.appendChild(sec('Starting jokers', cardRow(i.jokers)));
      if (i.consumables.length) body.appendChild(sec('Starting consumables', cardRow(i.consumables)));
      if (i.vouchers.length) body.appendChild(sec('Starting vouchers', cardRow(i.vouchers)));
    } else if (tab === 'restrictions') {
      body.appendChild(sec('Banned cards', cardRow(i.banned_cards)));
      const chips = (arr) => h('div', 'ch-chips', arr.length ? arr.map((t) => `<span class="badge ch-chip">${esc(t.name)}</span>`).join('') : '<span class="muted">None</span>');
      body.appendChild(sec('Banned tags', chips(i.banned_tags)));
      body.appendChild(sec('Banned blinds', chips(i.banned_other)));
    } else {
      const row = h('div', 'ch-deckrow');
      row.appendChild(cardCanvas({ facing: 'back' }, 'ch-back', i.deck.back));
      row.appendChild(h('div', 'ch-lines', `<div class="nr-name">${esc((CENTERS[i.deck.back] && CENTERS[i.deck.back].name) || 'Challenge Deck')}</div>` + i.deck.lines.map((l) => `<div>${esc(l)}</div>`).join('')));
      body.appendChild(row);
      const grid = h('div', 'dv-grid ch-deckgrid');
      for (const S of ['S', 'H', 'C', 'D']) {
        const cards = i.deck.cards.filter((x) => x[0][0] === S).sort((a, b) => RANK_ORDER.indexOf(a[0].split('_')[1]) - RANK_ORDER.indexOf(b[0].split('_')[1]));
        if (!cards.length) continue;
        const r = h('div', 'dv-row');
        for (const [front, e, d, g] of cards) r.appendChild(cardCanvas({ front, center: e || 'c_base', edition: d || undefined, seal: g || undefined }, 'ch-dcard'));
        grid.appendChild(r);
      }
      body.appendChild(grid);
    }
    const play = btn('Start Challenge', 'blue big wide b-ch-start', () => {
      const ids = modsApi ? modsApi.withRequirements([...msel.ids, ...(cur.mod ? [cur.mod] : [])]) : (cur.mod ? [cur.mod] : []);
      const modOptions = {};
      for (const id of ids) if (msel.options[id]) modOptions[id] = { ...msel.options[id] };
      closeAll();
      api.start(cur, ids, modOptions);
    });
    detail.appendChild(play);
  }
  function drawList() {
    list.innerHTML = '';
    const d = done();
    const groups = [];
    for (const c of all) {
      const g = c.mod || '';
      let gr = groups.find((x) => x.mod === g);
      if (!gr) groups.push(gr = { mod: g, items: [] });
      gr.items.push(c);
    }
    for (const gr of groups) {
      list.appendChild(h('div', 'ch-group', gr.mod ? modBadges([gr.mod]) : '<span class="badge ch-base">Balatro</span>'));
      for (const c of gr.items) {
        const b = btn(`<span class="ch-iname">${esc(c.name)}</span>${d[c.id] ? '<span class="ch-tick" title="Completed">✓</span>' : ''}`, 'grey ch-item' + (cur && cur.id === c.id ? ' on' : ''), () => {
          cur = c; tab = 'rules';
          for (const x of list.querySelectorAll('.ch-item')) x.classList.toggle('on', x === b);
          drawDetail();
          if (document.body.classList.contains('portrait-ui') || (window.matchMedia && matchMedia('(orientation: portrait)').matches)) { try { detail.scrollIntoView({ block: 'start' }); } catch (e) { /* ignore */ } }
        });
        b.dataset.ch = c.id;
        b.dataset.k = 'ch:' + c.id;
        if (c.colour) b.style.setProperty('--chc', cssColour(c.colour) || '');
        list.appendChild(b);
      }
    }
  }
  async function reload() {
    const my = ++token;
    const ids = modsApi ? modsApi.withRequirements(msel.ids) : [];
    topNote.innerHTML = ids.length ? 'Loading mods…' : '';
    list.innerHTML = '<div class="muted">Loading…</div>';
    let res = [];
    try { res = await api.list(ids); } catch (e) { console.warn('micatro: challenges', e); }
    if (my !== token || !el.isConnected) return;
    all = res;
    const nMod = all.filter((c) => c.mod).length;
    topNote.innerHTML = `<b class="attn">${all.length}</b> challenges` + (ids.length ? ` · ${nMod} from your mods` : ' · <span class="muted">turn on mods for theirs</span>');
    if (!cur || !all.some((c) => c.id === cur.id)) cur = all[0] || null;
    else cur = all.find((c) => c.id === cur.id);
    drawList();
    drawDetail();
  }
  modal(el, { title: 'Challenges', cls: 'ch-modal' });
  reload();
  return el;
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
// A board row's score: its big text, or naneinf for a clamped Infinity (the server stores
// naneinf -- 1e1000 and above -- as Number.MAX_VALUE with no big text).
const lbScore = (x) => (x.big ? fmt(x.big) : (x.score || 0) >= Number.MAX_VALUE ? 'naneinf' : fmt(x.score || 0));
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
