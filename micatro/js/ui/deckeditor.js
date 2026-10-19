// The native deck editor (Deck Creator rebuilt as a Micatro feature) — the UI side.
//
//   openDeckList(o)   "Custom Decks": your saved decks + the built-in examples; Use / Edit /
//                     Copy / Share / Delete, New deck, Import a share code
//   openEditor(...)   one deck: Deck (name, back art, starting numbers) · Cards (the starting
//                     deck: presets, add / duplicate / remove cards with rank, suit, enhancement,
//                     edition, seal) · Items (starting jokers, consumables, vouchers, tags) ·
//                     Bans · Rules (Deck Creator's options in collapsible groups) · Share
//
// Every control is a plain <button> / <input> inside the modal, so mouse, touch (phone
// portrait) and the controller's focus reticle (pad.js) all reach it. A definition is
// validated by the engine (engine/customdeck.js validateDeck) before it's saved or played.
// Saved decks: on the player's account (server/mp.mjs micatro-decks-get / -put, row
// `micatrodecks:<user>`) when logged in, else in this browser's localStorage.
// Loaded on demand by screens.js (the New Run screen's "Custom deck" row).
import { modal, closeModal, cardCanvas } from './screens.js';
import { composeFace, FACE_W, FACE_H, modAtlasesOf } from './cardsprite.js';
import { CENTERS, LOC, BACK_LIST, MODREG, onModAtlas, cssColour } from './assets.js';
import { esc } from './markup.js';
import { sound } from './sound.js';
import * as CD from '../engine/customdeck.js';
import { P_CENTERS, P_TAGS, P_BLINDS, P_CARDS, P_CENTER_POOLS } from '../engine/core.js';
import { MOD_LOC, CONSUMABLE_TYPES, isRetiredKey } from '../mods/registry.js';
import { retiredName } from '../mods/aliases.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const btn = (label, cls, fn, k) => {
  const b = h('button', 'btn ' + cls, label); b.type = 'button';
  if (k) b.dataset.k = k;
  b.addEventListener('click', (e) => { sound.play('button'); fn(e); });
  return b;
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const SEL_KEY = 'micatro_cdeck_sel';
const LOCAL_KEY = 'micatro_decks_v1';
const MAX_DECKS = 30;

// ------------------------------------------------------------- the selection
/** The custom deck chosen on the New Run screen ({id, def}) or null. */
export function getSelection() {
  try { const s = JSON.parse(localStorage.getItem(SEL_KEY) || 'null'); return s && s.def ? { id: s.id || null, def: CD.validateDeck(s.def) } : null; } catch (e) { return null; }
}
export function setSelection(entry) {
  try { if (entry) localStorage.setItem(SEL_KEY, JSON.stringify({ id: entry.id || null, def: entry.def })); else localStorage.removeItem(SEL_KEY); } catch (e) { /* private mode */ }
}

// ------------------------------------------------------------------ storage
// {source: 'server' | 'local', rev, decks: [{id, def, updated}]}
let store = null;
const newId = () => 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
function readLocal() {
  try { const r = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); return Array.isArray(r && r.decks) ? r.decks : []; } catch (e) { return []; }
}
function writeLocal(decks) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ decks })); } catch (e) { /* full / private: not remembered */ } }
const tidy = (list) => (list || []).filter((d) => d && d.id && d.def).map((d) => ({ id: String(d.id), def: CD.validateDeck(d.def), updated: d.updated || 0 }));
/** Load the player's decks (server when logged in, else this browser). */
export async function loadDecks(net) {
  if (net && net.isLoggedIn && net.isLoggedIn() && net.fetchDecks) {
    const r = await net.fetchDecks();
    if (!r.error) { store = { source: 'server', rev: r.rev, decks: tidy(r.decks) }; writeLocal(store.decks); return store; }
    store = { source: 'offline', rev: null, decks: tidy(readLocal()) };
    return store;
  }
  store = { source: 'local', rev: 0, decks: tidy(readLocal()) };
  return store;
}
/** Apply fn(decks) -> decks and persist. A stale server revision re-reads and re-applies (never clobbers). */
async function mutate(net, fn) {
  if (!store) await loadDecks(net);
  if (store.source === 'server') {
    for (let tries = 0; tries < 4; tries++) {
      const next = fn(clone(store.decks)).slice(0, MAX_DECKS);
      const r = await net.saveDecks(next, store.rev);
      if (r && r.ok) { store = { source: 'server', rev: r.rev, decks: next }; writeLocal(next); return { ok: true }; }
      if (r && r.error === 'stale') { store = { source: 'server', rev: r.rev, decks: tidy(r.decks) }; continue; }
      return { ok: false, error: (r && r.error) || 'offline' };
    }
    return { ok: false, error: 'busy' };
  }
  if (store.source === 'offline') return { ok: false, error: 'offline' };
  store.decks = fn(clone(store.decks)).slice(0, MAX_DECKS);
  writeLocal(store.decks);
  return { ok: true };
}
export async function saveDeck(net, entry) {
  const def = CD.validateDeck(entry.def);
  const id = entry.id || newId();
  const r = await mutate(net, (decks) => {
    const i = decks.findIndex((d) => d.id === id);
    const row = { id, def, updated: Date.now() };
    if (i >= 0) decks[i] = row; else decks.push(row);
    return decks;
  });
  return { ...r, id };
}
export async function deleteDeck(net, id) { return mutate(net, (decks) => decks.filter((d) => d.id !== id)); }

// ----------------------------------------------------------------- content
/** Display name of any center / tag / blind key. */
function nameOf(key) {
  const c = P_CENTERS[key] || P_TAGS[key] || P_BLINDS[key];
  if (!c) return isRetiredKey(key) ? retiredName(key) : key;   // (a card a mod update removed: mods/aliases.js)
  const set = P_TAGS[key] ? 'Tag' : P_BLINDS[key] ? 'Blind' : c.set;
  const base = LOC.descriptions[set] && LOC.descriptions[set][key];
  const mod = MOD_LOC.descriptions[set] && MOD_LOC.descriptions[set][key];
  return (base && base.name) || (mod && mod.name) || c.name || key;
}
/** The face data cardCanvas / composeFace draws for a key. */
function faceOf(key) {
  if (P_TAGS[key]) { const t = P_TAGS[key]; return { center: key, tag: key, tag_card: 'big', atlas: t.mod ? t.atlas : undefined, pos: t.pos }; }
  if (P_BLINDS[key]) { const b = P_BLINDS[key]; return { blind_card: { key, atlas: b.mod ? b.atlas : undefined, pos: b.pos ? { x: 0, y: b.pos.y } : { x: 0, y: 0 } } }; }
  const c = P_CENTERS[key];
  if (!c) return { center: key, name: key, mod: 'x' };
  if (c.mod) return { center: key, mod: c.mod, atlas: c.atlas, pos: c.pos, set: c.set, name: nameOf(key) };
  return { center: key };
}
// thumbnails waiting for a mod atlas: recomposed when it loads
const live = new Set();
let atlasHooked = false;
function thumb(d, cls, backKey) {
  const c = cardCanvas(d, cls || 'cd-thumb', backKey);
  const atl = modAtlasesOf(d);
  if (d.facing === 'back' && MODREG.center(backKey) && MODREG.center(backKey).atlas) atl.push(MODREG.center(backKey).atlas);
  if (atl.length) {
    live.add({ c, d, atl, backKey });
    if (!atlasHooked) {
      atlasHooked = true;
      onModAtlas((name) => { for (const t of [...live]) { if (!t.c.isConnected) { live.delete(t); continue; } if (t.atl.includes(name)) composeFace(t.c.getContext('2d'), t.d, t.backKey); } });
    }
  }
  return c;
}
const itemThumb = (key, cls) => thumb(faceOf(key), cls);

/** Every center a picker offers: base content + the given (loaded) mods'. */
function pickable(kind, modSet) {
  const ok = (c) => !c.mod || modSet.has(c.mod);
  const centers = Object.values(P_CENTERS);
  const by = (a, b) => (a.mod ? 1 : 0) - (b.mod ? 1 : 0) || (a.order || 0) - (b.order || 0);
  const consumableSets = new Set(['Tarot', 'Planet', 'Spectral', ...Object.keys(CONSUMABLE_TYPES)]);
  let list;
  if (kind === 'joker') list = centers.filter((c) => c.set === 'Joker' && ok(c) && !c.unported);
  else if (kind === 'consumable') list = centers.filter((c) => c.consumeable && consumableSets.has(c.set) && ok(c) && !c.unported);
  else if (kind === 'voucher') list = centers.filter((c) => c.set === 'Voucher' && ok(c) && !c.unported);
  else if (kind === 'booster') list = centers.filter((c) => c.set === 'Booster' && ok(c) && !c.unported);
  else if (kind === 'tag') list = Object.values(P_TAGS).filter((t) => ok(t));
  else if (kind === 'blind') list = Object.values(P_BLINDS).filter((b) => b.boss && ok(b));
  else list = [];
  return list.sort(by).map((c) => c.key);
}
const KIND_LABEL = { joker: 'Joker', consumable: 'Consumable', voucher: 'Voucher', tag: 'Tag', blind: 'Boss Blind', booster: 'Booster Pack' };

/** The picker: search + a grid of tiles; tapping a tile calls onPick(key). Stays open for more picks. */
function picker(kind, modSet, onPick, { title, multi = true } = {}) {
  const all = pickable(kind, modSet);
  const el = h('div', 'cd-picker');
  const top = h('div', 'cd-pick-top');
  const q = h('input', 'cd-input cd-search');
  q.placeholder = 'Search'; q.autocomplete = 'off'; q.spellcheck = false; q.maxLength = 40;
  q.addEventListener('pointerdown', (e) => e.stopPropagation());
  const note = h('div', 'cd-pick-note muted');
  top.append(q, note);
  const grid = h('div', 'cd-pick-grid');
  const more = btn('More', 'grey b-cd-more', () => { shown += PAGE; draw(); }, 'pick:more');
  el.append(top, grid, more);
  const PAGE = 48;
  let shown = PAGE;
  function draw() {
    const s = q.value.trim().toLowerCase();
    const list = s ? all.filter((k) => nameOf(k).toLowerCase().includes(s) || k.toLowerCase().includes(s)) : all;
    grid.innerHTML = '';
    for (const k of list.slice(0, shown)) {
      const t = h('button', 'cd-tile');
      t.type = 'button'; t.dataset.k = 'pick:' + k; t.dataset.key = k;
      t.appendChild(itemThumb(k));
      const c = P_CENTERS[k] || P_TAGS[k] || P_BLINDS[k];
      t.appendChild(h('span', 'cd-tile-n', esc(nameOf(k)) + (c && c.mod ? ` <span class="cd-modtag">${esc(MODREG.mods[c.mod] ? MODREG.mods[c.mod].name : c.mod)}</span>` : '')));
      t.addEventListener('click', () => {
        sound.play('button');
        onPick(k);
        note.textContent = `Added ${nameOf(k)}`;
        if (!multi) closeModal();
      });
      grid.appendChild(t);
    }
    if (!list.length) grid.appendChild(h('div', 'muted', 'Nothing matches.'));
    more.style.display = list.length > shown ? '' : 'none';
    note.textContent = note.textContent || `${list.length} ${KIND_LABEL[kind] || ''}${list.length === 1 ? '' : 's'}`;
  }
  q.addEventListener('input', () => { shown = PAGE; note.textContent = ''; draw(); });
  draw();
  modal(el, { title: title || ('Add ' + (KIND_LABEL[kind] || kind)), cls: 'cd-pick-modal' });
}

// ------------------------------------------------------------- small widgets
/** A number stepper: [-] [input] [+] (the input opens the on-screen keyboard on a controller). */
function stepper(k, value, { min, max, step = 1 }, onChange) {
  const w = h('div', 'cd-step');
  const fix = (v) => { v = Number(v); if (!Number.isFinite(v)) return value; v = Math.min(max, Math.max(min, v)); return step < 1 ? Math.round(v * 100) / 100 : Math.round(v); };
  const inc = step < 1 ? (value >= 1 ? 0.25 : step) : step;
  const minus = btn('−', 'grey cd-sb', () => onChange(fix(value - inc)), k + ':-');
  const plus = btn('+', 'grey cd-sb', () => onChange(fix(value + inc)), k + ':+');
  const inp = h('input', 'cd-input cd-num');
  inp.value = String(value); inp.inputMode = 'decimal'; inp.maxLength = 8; inp.dataset.k = k + ':v'; inp.autocomplete = 'off';
  inp.addEventListener('pointerdown', (e) => e.stopPropagation());
  inp.addEventListener('change', () => onChange(fix(inp.value)));
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  minus.disabled = value <= min; plus.disabled = value >= max;
  w.append(minus, inp, plus);
  return w;
}
function toggle(k, on, onChange, labels = ['On', 'Off']) {
  const b = btn(on ? labels[0] : labels[1], 'cd-tog ' + (on ? 'green on' : 'grey'), () => onChange(!on), k);
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  return b;
}
/** A button that cycles through [value, label] choices. */
function cycle(k, choices, cur, onChange) {
  const i = Math.max(0, choices.findIndex(([v]) => v === cur));
  return btn(esc(choices[i][1]), 'grey cd-cyc', () => onChange(choices[(i + 1) % choices.length][0]), k);
}
const EDITIONS = [[null, 'No edition'], ['foil', 'Foil'], ['holo', 'Holographic'], ['polychrome', 'Polychrome'], ['negative', 'Negative']];
const ENHS = [[0, 'No enhancement'], ...['m_bonus', 'm_mult', 'm_wild', 'm_glass', 'm_steel', 'm_stone', 'm_gold', 'm_lucky'].map((k) => [k, (CENTERS[k] && CENTERS[k].name) || k])];
const SEALS = [[0, 'No seal'], ['Red', 'Red Seal'], ['Blue', 'Blue Seal'], ['Gold', 'Gold Seal'], ['Purple', 'Purple Seal']];
const SUITS = [['S', 'Spades', '♠'], ['H', 'Hearts', '♥'], ['C', 'Clubs', '♣'], ['D', 'Diamonds', '♦']];
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const rankName = (r) => ({ A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: '10' })[r] || r;

// ---------------------------------------------------------------- deck list
/**
 * The deck list. o: {net, modsApi, selectedMods: () => ids, onPick(entry|null)} — onPick fires when the
 * player taps Use (the New Run screen then plays that deck).
 */
export async function openDeckList(o) {
  const el = h('div', 'cd-list');
  const status = h('div', 'cd-status muted', 'Loading…');
  const acts = h('div', 'cd-acts');
  acts.append(
    btn('New deck', 'blue b-cd-new', () => openEditor({ id: null, def: CD.validateDeck({ name: 'My Deck' }) }, o, refresh), 'list:new'),
    btn('Import code', 'orange b-cd-import', () => importDialog(o, refresh), 'list:import'),
  );
  const mine = h('div', 'cd-rows');
  const ex = h('div', 'cd-rows');
  el.append(status, acts, h('div', 'cd-h', 'Your decks'), mine, h('div', 'cd-h', 'Examples'), ex);
  modal(el, { title: 'Custom Decks', cls: 'cd-list-modal' });
  const row = (entry, { example } = {}) => {
    const d = entry.def;
    const r = h('div', 'cd-row');
    r.dataset.deck = entry.id || ('example:' + entry.example);
    r.appendChild(thumb({ facing: 'back' }, 'cd-back', d.back));
    const info = h('div', 'cd-row-info');
    const n = d.cards ? d.cards.reduce((a, c) => a + c[4], 0) : 52;
    const bits = [`${n} cards`];
    if (d.jokers.length) bits.push(`${d.jokers.reduce((a, j) => a + j.n, 0)} jokers`);
    if (d.vouchers.length) bits.push(`${d.vouchers.length} vouchers`);
    const rules = Object.keys(d.rules).length;
    if (rules) bits.push(`${rules} rules`);
    info.innerHTML = `<div class="cd-row-name">${esc(d.name)}${example ? ` <span class="cd-by">by ${esc(entry.by)}</span>` : ''}</div>` +
      `<div class="cd-row-sub">${esc(bits.join(' · '))}${d.mods.length ? ' · needs ' + d.mods.map((m) => `<b>${esc((MODREG.mods[m] && MODREG.mods[m].name) || (o.modsApi && o.modsApi.modName ? o.modsApi.modName(m) : m))}</b>`).join(', ') : ''}</div>`;
    r.appendChild(info);
    const b = h('div', 'cd-row-btns');
    const key = entry.id || ('ex-' + entry.example);
    b.appendChild(btn('Use', 'green b-cd-use', () => { closeModal(); if (o.onPick) o.onPick({ id: entry.id || null, def: d }); }, 'use:' + key));
    if (!example) b.appendChild(btn('Edit', 'blue b-cd-edit', () => openEditor(entry, o, refresh), 'edit:' + key));
    b.appendChild(btn(example ? 'Copy & edit' : 'Copy', 'orange b-cd-copy', () => openEditor({ id: null, def: { ...clone(d), name: (d.name + (example ? '' : ' copy')).slice(0, 32) } }, o, refresh), 'copy:' + key));
    b.appendChild(btn('Share', 'grey b-cd-share', () => shareDialog(d), 'share:' + key));
    if (!example) b.appendChild(btn('Delete', 'red b-cd-del', () => confirmBox(`Delete “${d.name}”?`, async () => { const res = await deleteDeck(o.net, entry.id); if (!res.ok) say('Could not delete: ' + res.error); refresh(); }), 'del:' + key));
    r.appendChild(b);
    return r;
  };
  const say = (t) => { status.textContent = t; };
  async function refresh() {
    const s = await loadDecks(o.net);
    if (!el.isConnected) return;
    say(s.source === 'server' ? 'Saved to your account.' : s.source === 'offline' ? 'Offline — showing this browser\'s copy (read only).' : 'Saved in this browser. Log in to keep them on your account.');
    mine.innerHTML = '';
    for (const e of s.decks) mine.appendChild(row(e));
    if (!s.decks.length) mine.appendChild(h('div', 'muted cd-empty', 'No decks yet — make one with New deck.'));
    ex.innerHTML = '';
    for (const e of CD.EXAMPLE_DECKS) ex.appendChild(row({ example: e.id, by: e.by, def: CD.validateDeck(e.def) }, { example: true }));
  }
  await refresh();
  return el;
}

function confirmBox(text, onYes) {
  const el = h('div', 'cd-confirm');
  el.appendChild(h('div', 'cd-confirm-t', esc(text)));
  const a = h('div', 'cd-acts');
  a.append(btn('Yes', 'red b-cd-yes', () => { closeModal(); onYes(); }, 'confirm:yes'), btn('No', 'grey b-cd-no', () => closeModal(), 'confirm:no'));
  el.appendChild(a);
  modal(el, { title: 'Are you sure?', cls: 'cd-confirm-modal', noClose: true });
}

async function shareDialog(def) {
  const el = h('div', 'cd-share');
  el.appendChild(h('div', 'muted', 'Anyone can paste this code into Custom Decks → Import code.'));
  const inp = h('input', 'cd-input cd-code');
  inp.readOnly = true; inp.value = 'Making the code…'; inp.dataset.k = 'share:code';
  inp.addEventListener('pointerdown', (e) => e.stopPropagation());
  inp.addEventListener('focus', () => inp.select());
  const msg = h('div', 'cd-msg');
  const copy = btn('Copy', 'blue b-cd-copycode', async () => {
    try { await navigator.clipboard.writeText(inp.value); msg.textContent = 'Copied!'; } catch (e) { inp.select(); msg.textContent = 'Select the code and copy it.'; }
  }, 'share:copy');
  el.append(inp, copy, msg);
  modal(el, { title: 'Share “' + def.name + '”', cls: 'cd-share-modal' });
  inp.value = await CD.encodeDeck(def);
}

function importDialog(o, refresh) {
  const el = h('div', 'cd-share');
  el.appendChild(h('div', 'muted', 'Paste a deck code (it starts with MCD1.).'));
  const inp = h('input', 'cd-input cd-code cd-import-in');
  inp.placeholder = 'MCD1.…'; inp.autocomplete = 'off'; inp.spellcheck = false; inp.maxLength = 140000; inp.dataset.k = 'import:code';
  inp.addEventListener('pointerdown', (e) => e.stopPropagation());
  const msg = h('div', 'cd-msg');
  el.append(inp, btn('Import', 'blue b-cd-doimport', async () => {
    const def = await CD.decodeDeck(inp.value);
    if (!def) { msg.textContent = "That isn't a deck code."; return; }
    closeModal();
    openEditor({ id: null, def }, o, refresh);
  }, 'import:go'), msg);
  modal(el, { title: 'Import a deck', cls: 'cd-share-modal' });
}

// ------------------------------------------------------------------- editor
const TABS = [['deck', 'Deck'], ['cards', 'Cards'], ['items', 'Items'], ['bans', 'Bans'], ['rules', 'Rules'], ['share', 'Share']];
const expanded = new Set(); // open rule groups (collapsed by default)

/** Edit one deck. entry {id|null, def}; refresh() is called after a save. */
export function openEditor(entry, o, refresh) {
  const draft = CD.validateDeck(clone(entry.def));
  let id = entry.id || null;
  let tab = 'deck';
  let dirty = false;
  const el = h('div', 'cd-editor');
  const head = h('div', 'cd-head');
  const name = h('input', 'cd-input cd-name');
  name.value = draft.name; name.maxLength = CD.LIMITS.name; name.placeholder = 'Deck name'; name.dataset.k = 'name'; name.autocomplete = 'off';
  name.addEventListener('pointerdown', (e) => e.stopPropagation());
  name.addEventListener('input', () => { draft.name = name.value; dirty = true; });
  head.appendChild(name);
  const tabs = h('div', 'tabs cd-tabs');
  for (const [k, label] of TABS) { const b = btn(label, 'red tab b-cd-tab-' + k, () => { tab = k; render(); }, 'tab:' + k); b.dataset.tab = k; tabs.appendChild(b); }
  const body = h('div', 'cd-body');
  const msg = h('div', 'cd-msg');
  const foot = h('div', 'cd-acts cd-foot');
  const save = btn('Save', 'blue big b-cd-save', async () => {
    const def = CD.validateDeck(draft);
    save.disabled = true;
    const r = await saveDeck(o.net, { id, def });
    save.disabled = false;
    if (!r.ok) { msg.textContent = 'Could not save: ' + r.error; return; }
    id = r.id; dirty = false;
    msg.textContent = 'Saved!';
    if (refresh) refresh();
  }, 'save');
  const use = btn('Save & use', 'green big b-cd-saveuse', async () => {
    const def = CD.validateDeck(draft);
    const r = await saveDeck(o.net, { id, def });
    if (!r.ok) { msg.textContent = 'Could not save: ' + r.error; return; }
    id = r.id; dirty = false;
    if (refresh) refresh();
    closeModal(); // the editor
    closeModal(); // the deck list
    if (o.onPick) o.onPick({ id, def });
  }, 'saveuse');
  foot.append(save, use);
  el.append(head, tabs, body, msg, foot);
  modal(el, { title: 'Deck Editor', cls: 'cd-editor-modal' });
  const box = el.closest('.modal-box');

  // the mods whose content the pickers offer: this deck's + the New Run selection
  const modSet = () => new Set([...(draft.mods || []), ...((o.selectedMods && o.selectedMods()) || [])]);
  const ensureMods = async () => {
    const ids = [...modSet()];
    if (ids.length && o.modsApi) { try { await o.modsApi.load(o.modsApi.withRequirements(ids)); } catch (e) { /* the picker shows what loaded */ } }
  };
  const needMod = (key) => { const c = P_CENTERS[key] || P_TAGS[key] || P_BLINDS[key]; if (c && c.mod && !draft.mods.includes(c.mod)) draft.mods.push(c.mod); };
  const change = () => { dirty = true; msg.textContent = ''; render(); };

  function render() {
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.tab === tab);
    const act = document.activeElement;
    const focusKey = act && act.dataset && el.contains(act) ? act.dataset.k : null;
    const top = box ? box.scrollTop : 0;
    body.innerHTML = '';
    ({ deck: deckTab, cards: cardsTab, items: itemsTab, bans: bansTab, rules: rulesTab, share: shareTab })[tab]();
    if (box) box.scrollTop = top;
    if (focusKey) { const f = [...el.querySelectorAll('[data-k]')].find((x) => x.dataset.k === focusKey); if (f) f.focus({ preventScroll: true }); }
  }
  const section = (title, cls) => { const s = h('div', 'cd-sec ' + (cls || '')); if (title) s.appendChild(h('div', 'cd-sec-t', title)); body.appendChild(s); return s; };
  const line = (label, ctl, k) => { const r = h('div', 'cd-line'); if (k) r.dataset.line = k; r.append(h('div', 'cd-l', esc(label)), ctl); return r; };

  // ---- Deck: description, back art, starting numbers
  function deckTab() {
    const s = section('About');
    const desc = h('input', 'cd-input cd-desc');
    desc.value = draft.desc; desc.maxLength = CD.LIMITS.desc; desc.placeholder = 'Description'; desc.dataset.k = 'desc'; desc.autocomplete = 'off';
    desc.addEventListener('pointerdown', (e) => e.stopPropagation());
    desc.addEventListener('input', () => { draft.desc = desc.value; dirty = true; });
    s.appendChild(desc);
    const backs = BACK_LIST.map((b) => b.key);
    const bi = Math.max(0, backs.indexOf(draft.back));
    const art = h('div', 'cd-art');
    art.append(
      btn('‹', 'arrow red b-cd-back-prev', () => { draft.back = backs[(bi + backs.length - 1) % backs.length]; change(); }, 'back:prev'),
      thumb({ facing: 'back' }, 'cd-back big', draft.back),
      h('div', 'cd-art-n', `Card back<br><b>${esc(nameOf(draft.back))}</b><div class="muted cd-small">Art only — the rules are yours.</div>`),
      btn('›', 'arrow red b-cd-back-next', () => { draft.back = backs[(bi + 1) % backs.length]; change(); }, 'back:next'),
    );
    s.appendChild(art);
    if (draft.mods.length) {
      const m = h('div', 'cd-line');
      m.append(h('div', 'cd-l', 'Needs mods'), h('div', 'cd-mods', draft.mods.map((x) => `<span class="badge mod-badge" style="background:${cssColour(MODREG.mods[x] && MODREG.mods[x].badge_colour) || '#4f6367'}">${esc((MODREG.mods[x] && MODREG.mods[x].name) || x)}</span>`).join('') +
        ' ' + '<span class="muted cd-small">(turned on when you play it)</span>'));
      m.lastChild.appendChild(btn('Clear', 'grey cd-sb b-cd-clearmods', () => { draft.mods = []; change(); }, 'mods:clear'));
      s.appendChild(m);
    }
    for (const [group, list] of CD.PARAM_GROUPS) {
      const g = section(group);
      for (const [key, label, def, min, max, step] of list) {
        const v = draft.params[key];
        const st = stepper('p:' + key, v, { min, max, step }, (nv) => { draft.params[key] = nv; change(); });
        const r = line(label + (v !== def ? ' •' : ''), st, 'p:' + key);
        if (v !== def) r.classList.add('changed');
        g.appendChild(r);
      }
    }
  }

  // ---- Cards: the starting deck
  function cardsTab() {
    const cards = draft.cards || CD.standardCards();
    const total = cards.reduce((a, c) => a + c[4], 0);
    const s = section(`${total} card${total === 1 ? '' : 's'}${draft.cards ? '' : ' (standard 52)'}`);
    const pre = h('div', 'cd-wrap');
    for (const p of CD.CARD_PRESETS) pre.appendChild(btn(esc(p.name), 'grey cd-preset', () => { draft.cards = p.cards(); change(); }, 'preset:' + p.id));
    s.append(h('div', 'cd-l', 'Presets'), pre);
    const add = btn('+ Add card', 'blue b-cd-addcard', () => cardDialog(null), 'cards:add');
    s.appendChild(add);
    // bulk: give every card an enhancement / edition / seal
    const bulk = h('div', 'cd-wrap cd-bulk');
    const bs = bulkState;
    bulk.append(
      cycle('bulk:enh', ENHS, bs.e, (v) => { bs.e = v; render(); }),
      cycle('bulk:ed', EDITIONS.map(([v, l]) => [v || 0, l]), bs.d, (v) => { bs.d = v; render(); }),
      cycle('bulk:seal', SEALS, bs.g, (v) => { bs.g = v; render(); }),
      btn('Apply to all', 'orange b-cd-bulk', () => { const list = draft.cards || CD.standardCards(); for (const c of list) { c[1] = bs.e; c[2] = bs.d; c[3] = bs.g; } draft.cards = list; change(); }, 'bulk:apply'),
    );
    s.append(h('div', 'cd-l', 'Apply to every card'), bulk);
    const grid = h('div', 'cd-cards');
    const suitOf = (f) => f.slice(0, f.lastIndexOf('_'));
    const groups = [...SUITS.map(([k]) => k), ...new Set(cards.map((c) => suitOf(c[0])).filter((x) => !['S', 'H', 'C', 'D'].includes(x)))];
    cards.forEach((c, i) => { c._i = i; });
    for (const g of groups) {
      const list = cards.filter((c) => suitOf(c[0]) === g).sort((a, b) => RANKS.indexOf(a[0].slice(a[0].lastIndexOf('_') + 1)) - RANKS.indexOf(b[0].slice(b[0].lastIndexOf('_') + 1)));
      if (!list.length) continue;
      const rowEl = h('div', 'cd-cardrow');
      for (const c of list) {
        const t = h('button', 'cd-pc');
        t.type = 'button'; t.dataset.k = 'card:' + c._i; t.dataset.card = c[0];
        t.appendChild(thumb({ front: c[0], center: c[1] || 'c_base', edition: c[2] || undefined, seal: c[3] || undefined }, 'cd-pcimg'));
        if (c[4] > 1) t.appendChild(h('span', 'cd-count', '×' + c[4]));
        const idx = c._i;
        t.addEventListener('click', () => { sound.play('button'); cardDialog(idx); });
        rowEl.appendChild(t);
      }
      grid.appendChild(rowEl);
    }
    for (const c of cards) delete c._i;
    if (!cards.length) grid.appendChild(h('div', 'muted', 'No cards — add some, or pick a preset.'));
    s.appendChild(grid);
  }
  const bulkState = { e: 0, d: 0, g: 0 };
  /** Add (idx null) or edit one card entry: rank, suit, enhancement, edition, seal, copies. */
  function cardDialog(idx) {
    if (!draft.cards) draft.cards = CD.standardCards();
    const isNew = idx == null;
    const c = isNew ? ['S_A', 0, 0, 0, 1] : draft.cards[idx].slice();
    const el2 = h('div', 'cd-carddlg');
    const pv = h('div', 'cd-cardpv');
    const opts = h('div', 'cd-cardopts');
    el2.append(pv, opts);
    const draw = () => {
      pv.innerHTML = '';
      pv.appendChild(thumb({ front: c[0], center: c[1] || 'c_base', edition: c[2] || undefined, seal: c[3] || undefined }, 'cd-pcimg big'));
      opts.innerHTML = '';
      const sep = c[0].lastIndexOf('_');
      const suit = c[0].slice(0, sep), rank = c[0].slice(sep + 1);
      const rr = h('div', 'cd-wrap');
      for (const r of RANKS) { const b = btn(rankName(r), 'grey cd-chip' + (r === rank ? ' on' : ''), () => { if (P_CARDS[suit + '_' + r]) c[0] = suit + '_' + r; draw(); }, 'cd:rank:' + r); rr.appendChild(b); }
      const sr = h('div', 'cd-wrap');
      for (const [k, n, sym] of SUITS) { const b = btn(sym + ' ' + n, 'grey cd-chip' + (k === suit ? ' on' : ''), () => { c[0] = k + '_' + rank; draw(); }, 'cd:suit:' + k); sr.appendChild(b); }
      opts.append(line('Rank', rr), line('Suit', sr),
        line('Enhancement', cycle('cd:enh', ENHS, c[1], (v) => { c[1] = v; draw(); })),
        line('Edition', cycle('cd:ed', EDITIONS.map(([v, l]) => [v || 0, l]), c[2], (v) => { c[2] = v; draw(); })),
        line('Seal', cycle('cd:seal', SEALS, c[3], (v) => { c[3] = v; draw(); })),
        line('Copies', stepper('cd:n', c[4], { min: 1, max: 52 }, (v) => { c[4] = v; draw(); })));
      const a = h('div', 'cd-acts');
      a.appendChild(btn(isNew ? 'Add' : 'Done', 'blue b-cd-carddone', () => {
        if (isNew) draft.cards.push(c.slice()); else draft.cards[idx] = c.slice();
        closeModal(); change();
      }, 'cd:done'));
      if (!isNew) {
        a.appendChild(btn('Duplicate', 'orange b-cd-carddup', () => { draft.cards[idx] = c.slice(); draft.cards.splice(idx + 1, 0, c.slice()); closeModal(); change(); }, 'cd:dup'));
        a.appendChild(btn('Remove', 'red b-cd-cardrm', () => { draft.cards.splice(idx, 1); closeModal(); change(); }, 'cd:rm'));
      }
      opts.appendChild(a);
    };
    draw();
    modal(el2, { title: isNew ? 'Add a card' : 'Edit card', cls: 'cd-card-modal' });
  }

  // ---- Items: starting jokers, consumables, vouchers, tags
  function itemsTab() {
    const list = (title, kind, items, rowFn, addFn) => {
      const s = section(title);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const key = typeof it === 'string' ? it : it.key;
        const retired = isRetiredKey(key);   // removed by a mod update: kept, greyed out, skipped in play
        const r = h('div', 'cd-item' + (retired ? ' retired' : ''));
        r.dataset.item = kind + ':' + key;
        r.appendChild(itemThumb(key, 'cd-ithumb'));
        const mid = h('div', 'cd-item-mid');
        mid.appendChild(h('div', 'cd-item-n', esc(nameOf(key)) + (P_CENTERS[key] || P_TAGS[key] ? '' : retired ? ' <span class="retired-tag">(retired card)</span>' : ' <span class="red">(not available)</span>')));
        if (rowFn) rowFn(mid, it, i);
        r.appendChild(mid);
        r.appendChild(btn('✕', 'red cd-x', () => { items.splice(i, 1); change(); }, `rm:${kind}:${i}`));
        s.appendChild(r);
      }
      s.appendChild(btn('+ Add ' + KIND_LABEL[kind], 'blue b-cd-add-' + kind, async () => { await ensureMods(); picker(kind, modSet(), (k) => { addFn(k); needMod(k); dirty = true; render(); }); }, 'add:' + kind));
    };
    list('Starting Jokers', 'joker', draft.jokers, (mid, j, i) => {
      const w = h('div', 'cd-wrap');
      w.append(
        cycle(`j:${i}:ed`, [...EDITIONS, ['random', 'Random edition']], j.edition || null, (v) => { if (v) j.edition = v; else delete j.edition; change(); }),
        ...['eternal', 'perishable', 'rental', 'pinned'].map((f) => toggle(`j:${i}:${f}`, !!j[f], (on) => { if (on) j[f] = true; else delete j[f]; if (f === 'eternal' && on) delete j.perishable; if (f === 'perishable' && on) delete j.eternal; change(); }, [f[0].toUpperCase() + f.slice(1), f[0].toUpperCase() + f.slice(1)])),
        stepper(`j:${i}:n`, j.n, { min: 1, max: CD.LIMITS.jokers }, (v) => { j.n = v; change(); }),
      );
      mid.appendChild(w);
    }, (k) => draft.jokers.push({ key: k, n: 1 }));
    list('Starting Consumables', 'consumable', draft.consumables, (mid, c, i) => {
      const w = h('div', 'cd-wrap');
      w.append(cycle(`c:${i}:ed`, [[null, 'No edition'], ['negative', 'Negative'], ['random', 'Random edition']], c.edition || null, (v) => { if (v) c.edition = v; else delete c.edition; change(); }),
        stepper(`c:${i}:n`, c.n, { min: 1, max: CD.LIMITS.consumables }, (v) => { c.n = v; change(); }));
      mid.appendChild(w);
    }, (k) => draft.consumables.push({ key: k, n: 1 }));
    list('Starting Vouchers', 'voucher', draft.vouchers, null, (k) => { if (!draft.vouchers.includes(k)) draft.vouchers.push(k); });
    list('Starting Tags', 'tag', draft.tags, (mid, t, i) => { mid.appendChild(stepper(`t:${i}:n`, t.n, { min: 1, max: CD.LIMITS.tags }, (v) => { t.n = v; change(); })); }, (k) => draft.tags.push({ key: k, n: 1 }));
  }

  // ---- Bans
  function bansTab() {
    body.appendChild(h('div', 'muted cd-note', 'Banned items never appear in the shop, packs, tags or as the Boss.'));
    for (const [k, kind, title] of [['jokers', 'joker', 'Banned Jokers'], ['consumables', 'consumable', 'Banned Consumables'], ['vouchers', 'voucher', 'Banned Vouchers'], ['tags', 'tag', 'Banned Tags'], ['blinds', 'blind', 'Banned Boss Blinds'], ['boosters', 'booster', 'Banned Booster Packs']]) {
      const s = section(title);
      const list = draft.bans[k];
      const w = h('div', 'cd-wrap');
      list.forEach((key, i) => {
        const b = btn(esc(nameOf(key)) + (isRetiredKey(key) ? ' <small>(retired)</small>' : '') + ' ✕', 'grey cd-chip cd-ban' + (isRetiredKey(key) ? ' retired' : ''), () => { list.splice(i, 1); change(); }, `unban:${k}:${i}`);
        w.appendChild(b);
      });
      if (!list.length) w.appendChild(h('span', 'muted', 'None'));
      s.appendChild(w);
      s.appendChild(btn('+ Ban a ' + KIND_LABEL[kind], 'blue b-cd-ban-' + kind, async () => { await ensureMods(); picker(kind, modSet(), (key) => { if (!list.includes(key)) list.push(key); needMod(key); dirty = true; render(); }, { title: 'Ban a ' + KIND_LABEL[kind] }); }, 'ban:' + kind));
    }
  }

  // ---- Rules: Deck Creator's options, grouped + collapsible
  function rulesTab() {
    body.appendChild(h('div', 'muted cd-note', 'Deck Creator\'s rules. A run with a custom deck counts as modded.'));
    for (const [group, list] of CD.RULE_GROUPS) {
      const changed = list.filter(([k]) => draft.rules[k] !== undefined).length;
      const open = expanded.has(group);
      const s = section(null, 'cd-rgroup' + (open ? ' open' : ''));
      s.dataset.group = group;
      s.appendChild(btn(`${open ? '▾' : '▸'} ${esc(group)} <span class="muted">(${list.length}${changed ? `, <b class="attn">${changed} changed</b>` : ''})</span>`, 'grey cd-rhead', () => { if (open) expanded.delete(group); else expanded.add(group); render(); }, 'rg:' + group));
      if (!open) continue;
      for (const [key, label, kind, def, min, max] of list) {
        const v = CD.ruleOf(draft, key);
        const set = (nv) => { if (nv === def) delete draft.rules[key]; else draft.rules[key] = nv; change(); };
        const ctl = kind === 'bool' ? toggle('r:' + key, v, set) : stepper('r:' + key, v, { min: min ?? 0, max: max ?? 100 }, set);
        const r = line(label + (kind === 'pct' ? ' (%)' : ''), ctl, 'r:' + key);
        if (v !== def) r.classList.add('changed');
        s.appendChild(r);
      }
    }
    const sk = section('Not ported');
    sk.appendChild(h('div', 'cd-small muted', CD.SKIPPED_OPTIONS.map(([k, why]) => `<b>${esc(k)}</b> — ${esc(why)}`).join('<br>')));
  }

  // ---- Share: export / import a code
  function shareTab() {
    const s = section('Export');
    const out = h('input', 'cd-input cd-code cd-export');
    out.readOnly = true; out.placeholder = 'Press “Make code”'; out.dataset.k = 'sharetab:code';
    out.addEventListener('pointerdown', (e) => e.stopPropagation());
    out.addEventListener('focus', () => out.select());
    const m = h('div', 'cd-msg');
    s.append(btn('Make code', 'blue b-cd-makecode', async () => { out.value = await CD.encodeDeck(draft); m.textContent = `${out.value.length} characters`; }, 'sharetab:make'), out,
      btn('Copy', 'grey b-cd-copy2', async () => { try { await navigator.clipboard.writeText(out.value); m.textContent = 'Copied!'; } catch (e) { out.select(); } }, 'sharetab:copy'), m);
    const s2 = section('Import (replaces this deck\'s contents)');
    const inp = h('input', 'cd-input cd-code cd-import2');
    inp.placeholder = 'MCD1.…'; inp.maxLength = 140000; inp.dataset.k = 'sharetab:in'; inp.autocomplete = 'off';
    inp.addEventListener('pointerdown', (e) => e.stopPropagation());
    const m2 = h('div', 'cd-msg');
    s2.append(inp, btn('Load code', 'orange b-cd-loadcode', async () => {
      const def = await CD.decodeDeck(inp.value);
      if (!def) { m2.textContent = "That isn't a deck code."; return; }
      for (const k of Object.keys(draft)) delete draft[k];
      Object.assign(draft, def);
      name.value = draft.name;
      tab = 'deck';
      change();
      msg.textContent = 'Loaded — press Save to keep it.';
    }, 'sharetab:load'), m2);
  }

  render();
  ensureMods().then(() => { if (el.isConnected) render(); });
  return { el, draft, get id() { return id; }, get dirty() { return dirty; } };
}
