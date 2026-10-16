// Micatro front end — boot + controller.
//   normal       : local Session (engine) -> act -> Player animates {view, events}
//                  -> broadcast to friends (net.startPublisher) when logged in
//   ?spectate=u  : read-only; net.startSpectate feeds snapshots {view, events}
//   ?direct=1    : launched from the overworld arcade (back goes to /overworld/)
import { loadImages, loadFont, bindModRegistry } from './assets.js';
import { Background } from './gl.js';
import { Board } from './board.js';
import { Player } from './player.js';
import { sound } from './sound.js';
import * as UI from './screens.js';
import { initPad } from './pad.js';

const params = new URLSearchParams(location.search);
const SPECTATE = (params.get('spectate') || '').trim();
const MODE = SPECTATE ? 'spectate' : 'normal';
const DIRECT = params.get('direct') === '1';
const EVENT_LOG_CAP = 3000, PUBLISH_CAP = 300;

let Engine = null;      // {Session, pokerInfo, G}
let net = null;         // ../net.js (optional)
let Mods = null;        // ../mods/index.js (AVAILABLE, loadMods + UI helpers), loaded on demand
let session = null;
let board, player, bg;
let publisher = null, chat = null, spectateHandle = null, pad = null;
let currentView = null;
const allEvents = [];
let pendingPublish = [];
let overHandled = false, winShown = false;

const stage = document.getElementById('stage');

async function loadEngine() {
  const [S, R] = await Promise.all([import('../engine/session.js'), import('../engine/run.js')]);
  let describeBack = null;
  try { describeBack = (await import('../engine/describe.js')).describeBack; } catch (e) { /* optional */ }
  return { Session: S.Session, pokerInfo: R.pokerInfo, G: R.G, describeBack };
}
// ------------------------------------------------------------------- mods
/** The mods manifest + loader (micatro/js/mods/index.js). Imported once; never throws. */
async function loadModsModule() {
  if (Mods) return Mods;
  try {
    Mods = await import('../mods/index.js');
    // test hook (like pad.js's __owFakePads): extra manifest entries injected before boot
    for (const m of (window.__micatroExtraMods || [])) if (m && m.id && !Mods.AVAILABLE.some((x) => x.id === m.id)) Mods.AVAILABLE.push(m);
    bindModRegistry(Mods);
  } catch (e) { console.warn('micatro: mods unavailable', e); Mods = null; }
  return Mods;
}
/** Register the given mods (+ requirements). Returns {ok, missing:[ids the site doesn't ship]}. */
async function ensureMods(ids) {
  ids = (ids || []).filter((x) => typeof x === 'string');
  if (!ids.length) return { ok: true, missing: [] };
  const M = await loadModsModule();
  if (!M) return { ok: false, missing: ids };
  const missing = ids.filter((id) => !M.manifest(id));
  try { await M.loadMods(ids.filter((id) => M.manifest(id))); } catch (e) { console.warn('micatro: a mod failed to load', e); return { ok: false, missing }; }
  bindModRegistry(M);
  return { ok: true, missing };
}
function modsApi() {
  if (!Mods) return null;
  const M = Mods;
  return {
    list: () => M.AVAILABLE,
    load: (ids) => M.loadMods(ids),
    isLoaded: (id) => !!M.MODS[id],
    optionList: (id) => M.modOptionList(id),
    withRequirements: (ids) => M.withRequirements(ids),
    dependentsOf: (id, ids) => M.dependentsOf(id, ids),
    modName: (id) => M.modName(id),
    backs: (ids, options) => (M.modBacks ? M.modBacks(ids, options) : []),
    stakes: (ids) => (M.modStakes ? M.modStakes(ids) : []),
  };
}

async function loadNet() {
  try { return await import('../net.js'); } catch (e) { console.warn('micatro: net.js unavailable', e); return null; }
}
const loggedIn = () => !!(net && net.isLoggedIn && net.isLoggedIn());
const myName = () => {
  if (net && net.myName) { const n = net.myName(); if (n) return n; }
  try { return (JSON.parse(localStorage.getItem('magepunk_mp_state_v1') || 'null') || {}).username || null; } catch (e) { return null; }
};

/** The session's view (+ the mod pack's kind, which view.js only reports for vanilla packs). */
function viewOf() {
  const v = session.view();
  if (v && !v.pack_kind && /^MOD_PACK/.test(v.state || '') && Engine && Engine.G && Engine.G.GAME) v.pack_kind = Engine.G.GAME.pack_kind || null;
  return v;
}

// ------------------------------------------------------------------ preview
/** Selected-cards preview (hand name + chips×mult) for the local player only. */
function getPreview(view) {
  if (view && view.preview !== undefined) return view.preview;
  if (MODE !== 'normal' || !Engine || !session || !view || view.state !== 'SELECTING_HAND') return null;
  try {
    const G = Engine.G;
    const hl = G.hand && G.hand.highlighted ? G.hand.highlighted.slice() : [];
    if (!hl.length) return null;
    const info = Engine.pokerInfo(hl);
    if (!info || info.text === 'NULL') return null;
    const hd = (view.hands || []).find((x) => x.name === info.text);
    return { name: info.loc_disp_text || info.disp_text || info.text, level: hd ? hd.level : 1, chips: hd ? hd.chips : 0, mult: hd ? hd.mult : 0 };
  } catch (e) { return null; }
}

// ------------------------------------------------------------------ actions
function onAction(a) {
  if (MODE !== 'normal' || !session) return { ok: false, error: 'read only' };
  if (!player.idle() && a.type !== 'highlight') return { ok: false, error: 'busy' };
  let r;
  try { r = session.act(a); } catch (e) { console.error('micatro: engine error on', a, e); board.toast('Engine error — see console'); return { ok: false, error: 'engine error' }; }
  if (!r.ok) return r;
  const view = viewOf();
  record(r.events);
  currentView = view;
  player.push(view, r.events);
  afterAct(view, r.events);
  return r;
}
function record(events) {
  for (const e of events || []) { allEvents.push(e); pendingPublish.push(e); }
  if (allEvents.length > EVENT_LOG_CAP) allEvents.splice(0, allEvents.length - EVENT_LOG_CAP);
  if (pendingPublish.length > PUBLISH_CAP) pendingPublish.splice(0, pendingPublish.length - PUBLISH_CAP);
}
function afterAct(view, events) {
  const won = (events || []).some((e) => e.type === 'win');
  if (won && !winShown) {
    winShown = true;
    whenIdle(() => showWin(view));
  }
  if (view.over && !overHandled) {
    overHandled = true;
    whenIdle(() => showGameOver(viewOf()));
  }
}
function whenIdle(fn) {
  if (player.idle()) { fn(); return; }
  const prev = player.onIdle;
  player.onIdle = () => { player.onIdle = prev; fn(); if (prev) prev(); };
}

// --------------------------------------------------------------- run setup
async function startRun({ seed, back = 'b_red', stake = 1, mods = [], modOptions = {} } = {}) {
  stopPublishing();
  if (mods && mods.length) {
    // a mod's code + data download only now (and are cached for the session)
    board.toast('Loading mods…');
    const r = await ensureMods(mods);
    if (!r.ok || r.missing.length) { board.toast(r.missing.length ? `Mod not available: ${r.missing.join(', ')}` : 'A mod failed to load'); UI.newRunScreen(menuOpts()); return; }
  }
  session = new Engine.Session();
  const evs = session.start(mods && mods.length ? { seed, back, stake, mods, modOptions } : { seed, back, stake });
  beginRun(evs);
}
async function continueRun() {
  const rec = Engine.Session.saved();
  if (!rec) { UI.mainMenu(menuOpts()); return; }
  stopPublishing();
  if (rec.mods && rec.mods.length) {
    const r = await ensureMods(rec.mods);
    if (r.missing.length) board.toast(`Mod no longer available: ${r.missing.join(', ')}`);
    else if (!r.ok) board.toast('A mod failed to load');
  }
  try { session = Engine.Session.fromRecipe(rec); } catch (e) { console.error(e); Engine.Session.clearSaved(); board.toast('Could not resume that run'); UI.mainMenu(menuOpts()); return; }
  beginRun([]);
}
function beginRun(events) {
  UI.closeAll();
  overHandled = false; winShown = !!(session.view().won);
  allEvents.length = 0; pendingPublish = [];
  record(events);
  currentView = viewOf();
  player.lastSeq = 0;
  player.push(currentView, [], { jump: true });
  sound.play('whoosh', 1, 0.6);
  startPublishing();
  if (currentView.over) { overHandled = true; whenIdle(() => showGameOver(currentView)); }
}

// -------------------------------------------------------------- broadcast
function startPublishing() {
  if (!loggedIn() || !net.startPublisher) return;
  publisher = net.startPublisher(
    () => {
      if (!currentView) return null;
      const snap = { view: currentView, events: pendingPublish.slice(-PUBLISH_CAP) };
      pendingPublish = [];
      return snap;
    },
    () => (currentView ? `Ante ${currentView.ante} · Round ${currentView.round} · $${currentView.dollars}` : 'Micatro'),
  );
  if (publisher.onWatchers) publisher.onWatchers((n, names) => setWatchers(n, names));
  if (!chat && net.mountChat) {
    try { chat = net.mountChat(chatWrap(), { runner: myName(), spectator: false }); } catch (e) { console.warn('micatro: chat', e); }
  }
}
function stopPublishing() {
  if (publisher) { try { publisher.stop(); } catch (e) { /* ignore */ } publisher = null; }
  setWatchers(0);
}
function setWatchers(n, names) {
  let el = document.getElementById('watchers');
  if (!el) { el = document.createElement('div'); el.id = 'watchers'; el.className = 'watchers'; document.body.appendChild(el); }
  el.style.display = n > 0 ? '' : 'none';
  el.textContent = `👁 ${n} watching`;
  el.title = (names || []).join(', ');
}
function chatWrap() {
  let el = document.getElementById('chat-wrap');
  if (!el) { el = document.createElement('div'); el.id = 'chat-wrap'; document.body.appendChild(el); }
  return el;
}

// ---------------------------------------------------------------- endings
function submit(view, won) {
  if (!loggedIn() || !net.submitScore) return null;
  return net.submitScore({ score: (view.stats && view.stats.best_hand) || 0, ante: view.ante, seed: view.seed, back: view.back, stake: view.stake, won: !!won, mods: view.mods || [] });
}
function showGameOver(view) {
  const won = !!view.won;
  const p = submit(view, won);
  if (publisher && publisher.finish) { publisher.finish({ won }).catch(() => {}); publisher = null; }
  UI.gameOver(view, {
    won: false, rankPromise: p, guest: !loggedIn(), net, me: myName(),
    onNewRun: () => UI.newRunScreen(menuOpts()), onMainMenu: () => UI.mainMenu(menuOpts()),
  });
}
function showWin(view) {
  const p = submit(view, true);
  UI.gameOver(view, {
    won: true, rankPromise: p, guest: !loggedIn(), net, me: myName(),
    onEndless: () => { onAction({ type: 'endless' }); },
    onNewRun: () => { if (publisher && publisher.finish) { publisher.finish({ won: true }).catch(() => {}); publisher = null; } Engine.Session.clearSaved(); UI.newRunScreen(menuOpts()); },
    onMainMenu: () => { if (publisher && publisher.finish) { publisher.finish({ won: true }).catch(() => {}); publisher = null; } Engine.Session.clearSaved(); UI.mainMenu(menuOpts()); },
  });
}

// ------------------------------------------------------------------- menus
function menuOpts() {
  return {
    saved: !!(Engine && Engine.Session.saved()), direct: DIRECT, loggedIn: loggedIn(), net, seed: params.get('seed') || '',
    onNew: (o) => startRun(o), onContinue: () => continueRun(),
  };
}
function onMenu(what) {
  const v = board.view;
  if (what === 'runinfo' && v) UI.runInfo(v);
  else if (what === 'deck' && v) UI.deckView(v);
  else if (what === 'options') {
    UI.options({
      speed: player.speed, onSpeed: (s) => player.setSpeed(s), direct: DIRECT,
      onNewRun: MODE === 'normal' ? () => UI.newRunScreen(menuOpts()) : null,
      onMainMenu: MODE === 'normal' ? () => UI.mainMenu(menuOpts()) : null,
      mods: v && v.mods && v.mods.length ? v.mods : null,
      modOptions: (session && session.recipe && session.recipe.modOptions) || {},
    });
  }
}

// ---------------------------------------------------------------- keyboard
function onKey(e) {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === 'Escape') { if (UI.modalOpen()) { if (!document.querySelector('.menu-modal, .go-modal')) UI.closeModal(); } else onMenu('options'); return; }
  if (UI.modalOpen() || MODE !== 'normal' || !board.view) return;
  const v = board.view, k = e.key.toLowerCase();
  const click = (sel) => { const b = stage.querySelector(sel); if (b && !b.disabled && b.offsetParent) { b.click(); return true; } return false; };
  if (k === 'v') return onMenu('deck');
  if (k === 'i') return onMenu('runinfo');
  if (v.state === 'SELECTING_HAND') {
    if (k === 'enter' || k === 'p') click('.b-play');
    else if (k === 'd' || k === 'delete' || k === 'backspace') click('.b-discard');
    else if (k === 'r') click('.b-rank');
    else if (k === 's') click('.b-suit');
    else if (/^[1-9]$/.test(k)) { const id = board.areas.hand[+k - 1]; if (id != null && player.idle()) { sound.play('cardSlide1', 1, 0.6); onAction({ type: 'highlight', id }); } }
    else if (k === 'escape' || k === 'c') onAction({ type: 'highlight', ids: [] });
  } else if (v.state === 'BLIND_SELECT') {
    if (k === 'enter' || k === ' ') click('.b-select');
    else if (k === 's') click('.b-skip:not([disabled])');
  } else if (v.state === 'ROUND_EVAL') {
    if (k === 'enter' || k === ' ') click('.b-cashout');
  } else if (v.state === 'SHOP') {
    if (k === 'n' || k === 'enter') click('.b-next');
    else if (k === 'r') click('.b-reroll');
  } else if (/_PACK(_HAND)?$/.test(v.state)) {
    if (k === 's' || k === 'escape') click('.b-skip-pack');
  }
  if (k === ' ' || k === 'enter') e.preventDefault();
}

// ---------------------------------------------------------------- spectate
function startSpectating() {
  const user = SPECTATE;
  if (!net) { board.setBanner(`Spectating needs the network layer — <a href="/micatro/">play instead</a>`); return; }
  if (!loggedIn()) { net.requireLogin(); return; }
  const back = DIRECT ? '<a href="/overworld/">← Overworld</a>' : '<a href="/">← Magepunk</a>';
  const banner = (status) => board.setBanner(`${back}<span class="watching">Watching <b>${escHtml(user)}</b></span>${status ? `<span class="spec-status">${status}</span>` : ''}`);
  banner('Connecting…');
  spectateHandle = net.startSpectate(user, {
    onSnapshot(snap, meta) {
      if (!snap || !snap.view) return;
      spectatorMods(snap.view.mods);
      currentView = snap.view;
      record(snap.events || []);
      player.ingest(snap.view, snap.events || []);
      if (meta && meta.watchers) setWatchers(meta.watchers, meta.watcherNames);
    },
    onStatus(status, info) {
      const S = {
        connecting: 'Connecting…', live: '● Live', 'not-live': `${escHtml(user)} isn't playing Micatro right now — waiting…`,
        full: 'Spectator slots are full — retrying…', over: (info && info.won) ? 'Run over — they won!' : 'Run over',
        forbidden: `You can only watch friends' runs`, login: 'Log in to watch', offline: 'Offline — retrying…',
      };
      banner(S[status] || status);
      if (info && info.watchers) setWatchers(info.watchers, info.watcherNames);
      if (status === 'login') net.requireLogin();
    },
  });
  if (net.mountChat) { try { chat = net.mountChat(chatWrap(), { runner: user, spectator: true }); } catch (e) { console.warn('micatro: chat', e); } }
}
// A spectator never runs the engine, but the runner's mods supply card art, names,
// badge + pack colours: register them, then redraw. Ids this site doesn't ship are
// skipped (cards fall back to placeholders); each id is tried once.
const specModsTried = new Set();
let specModsWarned = false;
function spectatorMods(ids) {
  const want = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && !specModsTried.has(id));
  if (!want.length) return;
  for (const id of want) specModsTried.add(id);
  ensureMods(want).then((r) => {
    if (r.missing.length && !specModsWarned) { specModsWarned = true; console.warn('micatro: spectating with mods this site does not have:', r.missing.join(', ')); }
    if (board) board.refreshModArt();
  }).catch(() => {});
}

const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// --------------------------------------------------------------------- boot
async function boot() {
  bg = new Background(document.getElementById('bg'));
  const loading = document.createElement('div');
  loading.className = 'loading'; loading.textContent = 'Loading…';
  stage.appendChild(loading);
  const [, , eng, nt] = await Promise.all([loadImages(), loadFont(), MODE === 'normal' ? loadEngine().catch((e) => { console.error('micatro: engine failed to load', e); return null; }) : null, loadNet(),
    MODE === 'normal' ? loadModsModule() : null]);
  Engine = eng; net = nt;
  loading.remove();
  board = new Board(stage, bg, { readOnly: MODE !== 'normal', onAction, onMenu, getPreview, onEvent: (ev) => { if (pad) pad.onGameEvent(ev); } });
  player = new Player(board);
  UI.initScreens(stage);
  if (Engine && Engine.describeBack) UI.setBackDescriber(Engine.describeBack);
  UI.setModsApi(modsApi());
  document.body.classList.add('mode-' + MODE);
  addEventListener('keydown', onKey);
  try { pad = initPad({ board, stage, UI, readOnly: MODE !== 'normal', onMenu, mainMenu: () => UI.mainMenu(menuOpts()) }); } catch (e) { console.warn('micatro: controller support unavailable', e); }
  window.__micatro = {
    get session() { return session; },
    view: () => (session ? viewOf() : board.view),
    loadMods: (ids) => ensureMods(ids),
    act: (a) => onAction(a),
    events: allEvents,
    mode: MODE,
    idle: () => player.idle(),
    board, player,
    newRun: (o) => startRun(o || {}),
    ready: true,
  };
  if (MODE === 'spectate') { startSpectating(); return; }
  if (!Engine) { board.toast('The game failed to load. Please refresh.'); return; }
  UI.mainMenu(menuOpts());
}
boot().catch((e) => { console.error('micatro boot failed', e); });
