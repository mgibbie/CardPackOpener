// Micatro front end — boot + controller.
//   normal       : local Session (engine) -> act -> Player animates {view, events}
//                  -> broadcast to friends (net.startPublisher) when logged in
//   ?spectate=u  : read-only; net.startSpectate feeds snapshots {view, events}
//   ?replay=id   : read-only; a FINISHED RUN re-simulated from its recipe (ui/replayview.js) —
//                  a server id (/mr/<id>, public) or local:<id> (this device's last 10 runs)
//   ?direct=1    : launched from the overworld arcade (back goes to /overworld/)
import { loadImages, loadFont, bindModRegistry } from './assets.js';
import { Background } from './gl.js';
import { Board } from './board.js';
import { Player } from './player.js';
import { sound } from './sound.js';
import * as UI from './screens.js';
import { initPad } from './pad.js';
import { first as modFirst } from './modui.js';
import { installZoomGuard } from './zoomguard.js';

const params = new URLSearchParams(location.search);
const SPECTATE = (params.get('spectate') || '').trim();
const REPLAY = (params.get('replay') || '').trim();
const MODE = REPLAY ? 'replay' : SPECTATE ? 'spectate' : 'normal';
const DIRECT = params.get('direct') === '1';
const EVENT_LOG_CAP = 3000, PUBLISH_CAP = 300;

let Engine = null;      // {Session, pokerInfo, G, RP (replays.js), ...}
let net = null;         // ../net.js (optional)
let Mods = null;        // ../mods/index.js (AVAILABLE, loadMods + UI helpers), loaded on demand
let session = null;
let board, player, bg;
let publisher = null, chat = null, spectateHandle = null, pad = null;
let currentView = null;
const allEvents = [];
let pendingPublish = [];
let overHandled = false, winShown = false;
let runReplay = null;   // this run's replay once it finished: {localId, local, serverId, upload: Promise<serverId|null>}
let replayCtrl = null;  // MODE 'replay': the viewer (ui/replayview.js)
let Stickers = null;    // ui/stickers.js (the jokers' win stickers), once loaded

const stage = document.getElementById('stage');

async function loadEngine() {
  const [S, R] = await Promise.all([import('../engine/session.js'), import('../engine/run.js')]);
  let describeBack = null, RP = null;
  try { describeBack = (await import('../engine/describe.js')).describeBack; } catch (e) { /* optional */ }
  try { RP = await import('../replays.js'); } catch (e) { console.warn('micatro: replays unavailable', e); }
  // challenges (Balatro's + the mods') and deck sleeves: the lists + their screen text
  let CH = null;
  try { CH = { ...(await import('../engine/challenge.js')), ...(await import('../engine/sleeve.js')) }; } catch (e) { console.warn('micatro: challenges unavailable', e); }
  return { Session: S.Session, pokerInfo: R.pokerInfo, G: R.G, describeBack, RP, CH, INSTANT_ACTIONS: S.INSTANT_ACTIONS, viewChecksum: S.viewChecksum, ENGINE_VERSION: S.ENGINE_VERSION };
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
function viewOf() { return decorateView(session.view()); }
/** (the engine's live view — the session's, or the replay stepper's) */
function decorateView(v) {
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
  // Balatro's set_joker_win: the run's jokers (+ a mod's extra keys) earn this stake's sticker — not in a
  // seeded or a challenge run (win_game skips it). Only the player's own live run records (never a replay).
  const winEv = (events || []).find((e) => e.type === 'win');
  if (winEv && Stickers && !view.challenge && !(Engine && Engine.G && Engine.G.GAME && Engine.G.GAME.seeded)) Stickers.recordWin(winEv);
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
async function startRun({ seed, back = 'b_red', stake = 1, mods = [], modOptions = {}, customDeck = null, challenge = null, sleeve = null } = {}) {
  stopPublishing();
  // a custom deck (the deck editor) brings the mods its content needs
  const needMods = [...new Set([...(mods || []), ...((customDeck && Array.isArray(customDeck.mods)) ? customDeck.mods : [])])];
  if (needMods.length) {
    // a mod's code + data download only now (and are cached for the session)
    board.toast('Loading mods…');
    const r = await ensureMods(needMods);
    if (!r.ok || r.missing.length) { board.toast(r.missing.length ? `Mod not available: ${r.missing.join(', ')}` : 'A mod failed to load'); UI.newRunScreen(menuOpts()); return; }
  }
  session = new Engine.Session();
  const cd = customDeck ? { customDeck } : {};
  // a challenge (by id: the recipe replays it) or a deck sleeve
  if (challenge) cd.challenge = challenge;
  else if (sleeve && !customDeck) cd.sleeve = sleeve;
  const evs = session.start(mods && mods.length ? { seed, back, stake, mods, modOptions, ...cd } : { seed, back, stake, ...cd });
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
function submit(view, won, replay) {
  if (!loggedIn() || !net.submitScore) return null;
  if (view.challenge) return null; // (Balatro: challenge runs post no high scores — the replay is still kept)
  return net.submitScore({ score: (view.stats && view.stats.best_hand) || 0, ante: view.ante, seed: view.seed, back: view.back, stake: view.stake, won: !!won, mods: view.mods || [], customDeck: view.custom_deck ? view.custom_deck.name : '', ...(replay ? { replay } : {}) });
}
/**
 * The run just finished (game over, or the win): keep its WHOLE-RUN replay. Saved locally (the last 10
 * runs) and, signed in, uploaded — the score is posted only after, with the replay's id, so the board
 * row links to it. A win that goes on into Endless calls this again at the game over: the same local
 * entry and the same server id are extended to cover the whole run.
 */
function recordReplay(view) {
  const RP = Engine && Engine.RP;
  if (!RP || !session || !session.recipe) return null;
  try {
    const recipe = JSON.parse(JSON.stringify(session.recipe));
    const meta = RP.buildMeta(recipe, view, { username: myName() });
    const entry = RP.save(recipe, meta);
    const localId = RP.localId(recipe);
    const prev = runReplay && runReplay.localId === localId ? runReplay : null;
    const rec = { localId, local: !!entry, serverId: (entry && entry.serverId) || (prev && prev.serverId) || null, recipe, meta };
    rec.upload = !(loggedIn() && net.uploadReplay) ? Promise.resolve(null) : (async () => {
      try {
        const prevId = prev ? await prev.upload : rec.serverId;
        const code = await RP.packRecipe(recipe);
        if (code.length > RP.PACKED_MAX) return null;
        const r = await net.uploadReplay({ code, meta, id: prevId || null });
        if (r && r.id) { rec.serverId = r.id; if (rec.local) RP.setServerId(localId, r.id); }
        return rec.serverId || null;
      } catch (e) { console.warn('micatro: replay upload failed', e); return null; }
    })();
    runReplay = rec;
    return rec;
  } catch (e) { console.warn('micatro: could not keep the replay', e); return null; }
}
/** The game-over / win modal's replay buttons. */
function replayButtons(rec) {
  if (!rec || !Engine || !Engine.RP) return null;
  const RP = Engine.RP;
  const go = (url) => { location.href = url + (DIRECT ? '&direct=1' : ''); };
  return {
    guest: !loggedIn(),
    watch: async () => {
      if (rec.local) return go(RP.watchUrl(rec.localId, { local: true }));
      const id = await rec.upload;
      if (id) return go(RP.watchUrl(id));
      board.toast('This replay could not be saved (storage full).');
    },
    link: async () => {
      const id = await rec.upload;
      return id ? RP.shareUrl(id) : null;
    },
  };
}
/** Spectators of this run get "Watch the full run" once its replay is up. */
function finishPublishing(won, rec) {
  if (!publisher || !publisher.finish) return;
  const pub = publisher; publisher = null;
  Promise.resolve(rec ? rec.upload : null).catch(() => null).then((id) => pub.finish({ won, replay: id || null })).catch(() => {});
}
function showGameOver(view) {
  const won = !!view.won;
  const rec = recordReplay(view);
  const p = loggedIn() && net.submitScore ? Promise.resolve(rec ? rec.upload : null).catch(() => null).then((id) => submit(view, won, id)) : null;
  finishPublishing(won, rec);
  UI.gameOver(view, {
    won: false, rankPromise: p, guest: !loggedIn(), net, me: myName(), replay: replayButtons(rec),
    onNewRun: () => UI.newRunScreen(menuOpts()), onMainMenu: () => UI.mainMenu(menuOpts()),
  });
}
function showWin(view) {
  if (view.challenge) UI.markChallengeDone(myName(), view.challenge.id);
  const rec = recordReplay(view);
  const p = loggedIn() && net.submitScore ? Promise.resolve(rec ? rec.upload : null).catch(() => null).then((id) => submit(view, true, id)) : null;
  UI.gameOver(view, {
    won: true, rankPromise: p, guest: !loggedIn(), net, me: myName(), replay: replayButtons(rec),
    onEndless: () => { onAction({ type: 'endless' }); },
    onNewRun: () => { finishPublishing(true, rec); Engine.Session.clearSaved(); UI.newRunScreen(menuOpts()); },
    onMainMenu: () => { finishPublishing(true, rec); Engine.Session.clearSaved(); UI.mainMenu(menuOpts()); },
  });
}

// ------------------------------------------------------------------- menus
function menuOpts() {
  return {
    saved: !!(Engine && Engine.Session.saved()), direct: DIRECT, loggedIn: loggedIn(), net, seed: params.get('seed') || '',
    onNew: (o) => startRun(o), onContinue: () => continueRun(),
    replays: replaysApi(), me: myName(),
    challenges: challengesApi(), sleeves: sleevesApi(),
  };
}
/** The Challenges screen: Balatro's 20 + the enabled mods' (their modules load first). */
function challengesApi() {
  const CH = Engine && Engine.CH;
  if (!CH) return null;
  return {
    async list(ids) {
      if (ids && ids.length) { const r = await ensureMods(ids); if (!r.ok) board.toast('A mod failed to load'); }
      const on = new Set(ids || []);
      return CH.allChallenges().filter((c) => !c.mod || on.has(c.mod)).map((c) => ({ ...c, info: CH.challengeInfo(c) }));
    },
    done: () => UI.challengeDone(myName()),
    start: (ch, mods, modOptions) => startRun({ challenge: ch.id, mods, modOptions, back: 'b_challenge', stake: 1 }),
  };
}
/** New Run's sleeve picker: the sleeves of the selected (loaded) mods, honouring a sleeve's mod option. */
function sleevesApi() {
  const CH = Engine && Engine.CH;
  if (!CH) return null;
  const optOn = (options, s) => {
    if (!s.mod_option) return true;
    const o = (options || {})[s.mod] || {};
    if (o[s.mod_option] !== undefined) return !!o[s.mod_option];
    const m = Mods && Mods.MODS[s.mod];
    return !!(m && m.options && m.options[s.mod_option] && m.options[s.mod_option].default);
  };
  return {
    list: (ids, options) => CH.allSleeves().filter((s) => (ids || []).includes(s.mod) && optOn(options, s)),
    info: (s, back) => CH.sleeveInfo(s, back),
  };
}
/** The main menu's Replays list: this device's last 10 finished runs. */
function replaysApi() {
  const RP = Engine && Engine.RP;
  if (!RP) return null;
  return {
    list: () => RP.list(),
    loggedIn: loggedIn(),
    watch: (e) => { location.href = RP.watchUrl(e.id, { local: true }) + (DIRECT ? '&direct=1' : ''); },
    remove: (e) => RP.remove(e.id),
    // the share link (uploads the replay first if it never was — e.g. it finished offline)
    link: async (e) => {
      if (e.serverId) return RP.shareUrl(e.serverId);
      if (!loggedIn() || !net.uploadReplay) return null;
      const code = await RP.packRecipe(e.recipe);
      if (code.length > RP.PACKED_MAX) return null;
      const r = await net.uploadReplay({ code, meta: e.meta || {} });
      if (!r || !r.id) return null;
      RP.setServerId(e.id, r.id); e.serverId = r.id;
      return RP.shareUrl(r.id);
    },
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
  // P: a mod's card view for the selected joker (Pokermon's Pokédex: its SMODS.Keybind "openPokedex")
  if (k === 'p' && board.sel != null) { const d = board.data.get(board.sel); if (d && modFirst('cardContext', d, UI.modApi())) return; }
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
      let text = S[status] || status;
      // the runner's final push carries their run's replay id: watch the whole run from the start
      if (status === 'over' && info && typeof info.replay === 'string' && /^[a-f0-9]{8,20}$/.test(info.replay)) text += ` · <a class="b-watch-full" href="/micatro/?replay=${info.replay}">▶ Watch the full run</a>`;
      banner(text);
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

// ------------------------------------------------------------------ replay
async function startReplayMode() {
  if (!Engine || !Engine.RP) { board.setBanner('<a href="/micatro/">← Micatro</a><span class="spec-status">The replay viewer failed to load. Please refresh.</span>'); return; }
  try {
    const { startReplay } = await import('./replayview.js');
    const { fmt } = await import('./markup.js');
    replayCtrl = await startReplay({
      spec: REPLAY, Engine, RP: Engine.RP, net, board, player, UI, ensureMods, decorateView, direct: DIRECT, fmt,
      autoplay: params.get('autoplay') !== '0',
    });
  } catch (e) {
    console.error('micatro: replay viewer failed', e);
    board.setBanner('<a href="/micatro/">← Micatro</a><span class="spec-status">This replay could not be played.</span>');
  }
}

const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// --------------------------------------------------------------------- boot
async function boot() {
  // iPhone Safari: never stay zoomed into part of the board (ui/zoomguard.js)
  try { window.__micatroZoomGuard = installZoomGuard(window); } catch (e) { /* no visualViewport */ }
  bg = new Background(document.getElementById('bg'));
  const loading = document.createElement('div');
  loading.className = 'loading'; loading.textContent = 'Loading…';
  stage.appendChild(loading);
  const [, , eng, nt] = await Promise.all([loadImages(), loadFont(), MODE !== 'spectate' ? loadEngine().catch((e) => { console.error('micatro: engine failed to load', e); return null; }) : null, loadNet(),
    MODE !== 'spectate' ? loadModsModule() : null]);
  Engine = eng; net = nt;
  loading.remove();
  board = new Board(stage, bg, { readOnly: MODE !== 'normal', onAction, onMenu, getPreview, onEvent: (ev) => { if (pad) pad.onGameEvent(ev); }, uiApi: () => UI.modApi() });
  // deck skins: this player's choices (cosmetic, ui/skins.js)
  import('./skins.js').then((m) => m.initSkins(myName())).catch((e) => console.warn('micatro: skins unavailable', e));
  // the jokers' win stickers: this player's record (ui/stickers.js)
  Stickers = await import('./stickers.js').catch(() => null);
  if (Stickers) Stickers.initWinStickers(myName());
  player = new Player(board);
  UI.initScreens(stage);
  if (Engine && Engine.describeBack) UI.setBackDescriber(Engine.describeBack);
  UI.setModsApi(modsApi());
  document.body.classList.add('mode-' + MODE);
  addEventListener('keydown', onKey);
  // (replay: LB/RB step, secondary plays/pauses — the controller drives the viewer)
  const padReplay = MODE === 'replay' ? { toggle: () => replayCtrl && replayCtrl.toggle && replayCtrl.toggle(), step: (d) => replayCtrl && replayCtrl.ready && (d < 0 ? replayCtrl.stepBack() : replayCtrl.stepForward()) } : null;
  try { pad = initPad({ board, stage, UI, readOnly: MODE !== 'normal', onMenu, mainMenu: () => UI.mainMenu(menuOpts()), replay: padReplay }); } catch (e) { console.warn('micatro: controller support unavailable', e); }
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
    get replay() { return replayCtrl; },
    ready: true,
  };
  if (MODE === 'spectate') { startSpectating(); return; }
  if (MODE === 'replay') { startReplayMode(); return; }
  if (!Engine) { board.toast('The game failed to load. Please refresh.'); return; }
  UI.mainMenu(menuOpts());
}
boot().catch((e) => { console.error('micatro boot failed', e); });
