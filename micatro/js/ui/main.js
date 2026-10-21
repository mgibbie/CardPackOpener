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
const seenJokers = new Set(); // this run's jokers seen so far (+ their sticker keys): a replay carries their stickers
/** The sticker keys a view shows: every joker's (its key, and a Pokermon disguise's own win_key) and the deck back. */
function stickerKeys(view, into = new Set()) {
  for (const list of Object.values((view && view.areas) || {})) for (const c of list || []) {
    if (!c || c.set !== 'Joker') continue;
    if (c.center) into.add(c.center);
    if (c.win_key) into.add(c.win_key);
  }
  if (view && view.back) into.add(view.back);
  return into;
}
let Progress = null;    // ui/progress.js (the Nuzlocke / Monotype record + achievements), once loaded
let RunSync = null;     // ui/runsync.js (the run in progress, saved on the account so it follows the player between devices)

const stage = document.getElementById('stage');

async function loadEngine() {
  const [S, R] = await Promise.all([import('../engine/session.js'), import('../engine/run.js')]);
  let describeBack = null, RP = null;
  try { describeBack = (await import('../engine/describe.js')).describeBack; } catch (e) { /* optional */ }
  try { RP = await import('../replays.js'); } catch (e) { console.warn('micatro: replays unavailable', e); }
  // challenges (Balatro's + the mods') and deck sleeves: the lists + their screen text
  let CH = null;
  try { CH = { ...(await import('../engine/challenge.js')), ...(await import('../engine/sleeve.js')) }; } catch (e) { console.warn('micatro: challenges unavailable', e); }
  // mod version pins (resume prompt, replay banner)
  const PN = await import('../mods/pins.js');
  return { Session: S.Session, pokerInfo: R.pokerInfo, G: R.G, describeBack, RP, CH, INSTANT_ACTIONS: S.INSTANT_ACTIONS, viewChecksum: S.viewChecksum, ENGINE_VERSION: S.ENGINE_VERSION, pins: PN };
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
  stickerKeys(view, seenJokers);
  if (RunSync) RunSync.track(session.recipe, view); // (pushed to the account when due: round checkpoints, idle, hide)
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
  // Pokermon's Nuzlocke / Monotype badges (view.run_badges.earned: only an eligible run's win — not seeded, not a
  // challenge) go into this player's record and may unlock achievements; the win stickers get their categories.
  const earned = winEv && view.run_badges && view.run_badges.earned;
  // The win stickers: categories ['win', 'poke'? (a Pokermon run), 'nuz'?, 'mono'?, 'both'?] (stickers.js recordWin({jokers, stake, categories}): Pikachu / Aipom /
  // Ambipom / Arceus over the stake sticker). The joker list is the engine's win event's (joker_win_keys, with previous evolutions).
  // The deck earns its sticker too (its back key joins the list; Balatro's deck stake stickers) — not a custom deck's
  // neutral back. Seeded and challenge runs earn none.
  // (seeded = the player typed the seed; a resumed run keeps the recipe's own flag — engine/session.js recipeSeeded)
  const deckKey = view.back && !view.custom_deck && /^[A-Za-z0-9_]{1,64}$/.test(view.back) ? view.back : null;
  if (winEv && Stickers && !view.challenge && !(Engine && Engine.G && Engine.G.GAME && Engine.G.GAME.seeded)) Stickers.recordWin({ ...winEv, jokers: [...(winEv.jokers || []), ...(deckKey ? [deckKey] : [])], categories: winCategoriesOf(earned, (view.mods || []).includes('pokermon')) });
  if (earned && Progress) {
    // (the win event, not view.stake: an Elite stake PLAYS at Gold's 8 but its win records 9 — winEv.sticker_level,
    // run.js win_sticker_level — the same level the win stickers record)
    const unlocked = Progress.recordRunWin(earned, { stake: view.stake, sticker_level: winEv.sticker_level }, Date.now(), runIdOf());
    if (unlocked.length) Progress.achievementToast(stage, unlocked);
  }
  // the run finished: the account's copy of it is cleared (that run only; a won run going on into Endless reopens it)
  if (RunSync && winEv && session) RunSync.endedRun('won', session.recipe);
  if (RunSync && view.over && !overHandled && session) RunSync.endedRun('lost', session.recipe);
  if (won && !winShown) {
    winShown = true;
    whenIdle(() => showWin(view));
  }
  if (view.over && !overHandled) {
    overHandled = true;
    whenIdle(() => showGameOver(viewOf()));
  }
}
/** The win stickers' categories (ui/progress.js winCategories; the same rule inline if that module failed to load). */
function winCategoriesOf(earned, pokermon) {
  if (Progress && Progress.winCategories) return Progress.winCategories(earned, pokermon);
  const c = ['win'];
  if (pokermon) c.push('poke');
  if (earned && earned.nuz) c.push('nuz');
  if (earned && earned.mono) c.push('mono');
  if (earned && earned.nuz && earned.mono) c.push('both');
  return c;
}
/** This run's id (its local replay id: stable across a resume) — a won run adds to the record once. */
function runIdOf() {
  try { return session && session.recipe && Engine && Engine.RP ? Engine.RP.localId(session.recipe) : null; } catch (e) { return null; }
}
function whenIdle(fn) {
  if (player.idle()) { fn(); return; }
  const prev = player.onIdle;
  player.onIdle = () => { player.onIdle = prev; fn(); if (prev) prev(); };
}

// --------------------------------------------------------------- run setup
/** Today's UTC date as DDMMYYYY (3.9.1's os.date("!%d%m%Y")): a daily challenge's day. */
function utcDayStamp(now = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return p(now.getUTCDate()) + p(now.getUTCMonth() + 1) + p(now.getUTCFullYear(), 4);
}
async function startRun({ seed, back = 'b_red', stake = 1, mods = [], modOptions = {}, customDeck = null, challenge = null, sleeve = null, daily = null } = {}) {
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
  if (challenge) { cd.challenge = challenge; if (daily) cd.daily = daily; }
  else if (sleeve && !customDeck) cd.sleeve = sleeve;
  const evs = session.start(mods && mods.length ? { seed, back, stake, mods, modOptions, ...cd } : { seed, back, stake, ...cd });
  beginRun(evs, { fresh: true });
}
/**
 * Resume the saved run. Its recipe re-simulates from the start, so when a mod (or the engine's rules) changed
 * since it was recorded (mods/pins.js pinDiff) the player is asked first: Continue anyway (rebuilt on the new
 * rules and re-pinned to them) or Abandon run. Neither ever happens silently, and both keep a backup of the
 * save first (Session.backupSaved). Back leaves the save untouched.
 */
async function continueRun() {
  const rec = Engine.Session.saved();
  if (!rec) { showMenu(); return; }
  stopPublishing();
  if (rec.mods && rec.mods.length) {
    const r = await ensureMods(rec.mods);
    if (r.missing.length) board.toast(`Mod no longer available: ${r.missing.join(', ')}`);
    else if (!r.ok) board.toast('A mod failed to load');
  }
  const abandon = (why) => {
    abandonSaved(why, rec);
    board.toast('Run abandoned');
    showMenu();
  };
  const resume = (repin) => {
    try { session = Engine.Session.fromRecipe(rec, { repin }); } catch (e) {
      console.error(e);
      // (never wiped without asking: the save stays until the player abandons it)
      UI.resumePrompt({ title: 'Could not resume', html: '<p>This run could not be rebuilt on this version of Micatro.</p><p>You can abandon it, or go back and keep it for now.</p>', onAbandon: () => abandon('resume failed: ' + (e && e.message)) });
      return;
    }
    if (repin) { session.save(); }
    beginRun([]);
    const st = session.stoppedAt;
    if (st) board.toast(`The run was rebuilt up to move ${st.index} of ${st.total} on the current rules`);
    else if (repin) board.toast('Resumed on the updated rules');
  };
  const diff = Engine.pins ? Engine.pins.pinDiff(rec) : [];
  if (!diff.length) { resume(false); return; }
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const changes = diff.map((d) => `<li><b>${esc(d.engine ? d.name + ' engine' : d.name)}</b> ${esc(d.engine ? d.recorded : Engine.pins.pinLabel(d.recorded))} → ${esc(d.current == null ? 'not available' : d.engine ? d.current : Engine.pins.pinLabel(d.current))}</li>`).join('');
  const one = diff.length === 1 && !diff[0].engine;
  UI.resumePrompt({
    title: one ? 'Mod updated' : 'Updated since this run started',
    html: `<p>${one ? 'A mod this run uses was updated' : 'This run was started on an older version'} since you started it:</p><ul class="rz-diff">${changes}</ul>` +
      '<p>Resuming replays your moves on the new rules, so the run may play differently from how you left it, or stop partway.</p>',
    onContinue: () => { Engine.Session.backupSaved('continue: ' + Engine.pins.diffText(diff)); resume(true); },
    onAbandon: () => abandon('abandon: ' + Engine.pins.diffText(diff)),
  });
}
/** The saved run is given up (abandoned, or restarted with R): a backup first (owner rule: never wipe a save
 *  without one — Session.backupSaved, micatro_run_backup_v1), then the save goes, and the account's run slot
 *  hears it ended (RunSync), so another device doesn't offer it again. */
function abandonSaved(why, rec = Engine.Session.saved()) {
  Engine.Session.backupSaved(why);
  Engine.Session.clearSaved();
  if (RunSync && rec) RunSync.endedRun('abandoned', rec);
}
/**
 * Hold R: start this run over (Balatro's restart) — the same deck, stake, mods + their options, custom deck,
 * sleeve and challenge, on a new random seed. A seeded run keeps its seed (Balatro: a seeded run restarts on
 * it), so it stays seeded; any other restart is unseeded, so its wins earn stickers and badges as usual.
 * The run left behind goes the abandon way (a backup first).
 */
function restartRun() {
  const r = session && session.recipe;
  if (MODE !== 'normal' || !r) return;
  const o = { back: r.back || 'b_red', stake: r.stake == null ? 1 : r.stake, mods: r.mods || [], modOptions: r.modOptions || {} };
  if (r.customDeck) o.customDeck = r.customDeck;
  if (r.challenge) o.challenge = r.challenge;
  if (r.sleeve) o.sleeve = r.sleeve;
  if (r.seeded === true) o.seed = r.seed;
  abandonSaved('restart (hold R)');
  return startRun(o);
}
function beginRun(events, { fresh = false } = {}) {
  UI.closeAll();
  overHandled = false; winShown = !!(session.view().won);
  allEvents.length = 0; pendingPublish = [];
  record(events);
  currentView = viewOf();
  seenJokers.clear(); stickerKeys(currentView, seenJokers);
  player.lastSeq = 0;
  player.push(currentView, [], { jump: true });
  sound.play('whoosh', 1, 0.6);
  startPublishing();
  // the account's copy: a new run replaces it (the old one backed up), a resumed one is pushed if it moved on
  if (RunSync) { if (fresh) RunSync.startedRun(session.recipe, currentView); else RunSync.track(session.recipe, currentView, { now: true }); }
  if (currentView.over) { overHandled = true; if (RunSync) RunSync.endedRun('lost', session.recipe); whenIdle(() => showGameOver(currentView)); }
}

/**
 * Continue (the main menu): this device's run, the account's (a run from another device, further along or the only
 * one: its recipe becomes this device's save, the old local copy backed up), or — two DIFFERENT runs — the player
 * picks one and the other is backed up (ui/runsync.js). Then the normal resume (the version pin prompt included).
 */
function continueFlow() {
  const o = RunSync ? RunSync.offer() : { kind: 'local' };
  if (o.kind === 'conflict') {
    UI.runChoicePrompt({
      local: o.local, account: o.account,
      onLocal: () => { RunSync.keepLocal(); continueRun(); },
      onAccount: () => { if (!RunSync.takeAccount()) { board.toast('Could not load that run'); showMenu(); return; } continueRun(); },
    });
    return;
  }
  if (o.kind === 'account' && RunSync && !RunSync.takeAccount()) { board.toast('Could not load that run'); showMenu(); return; }
  continueRun();
}
/** The main menu; signed in, the account's run is re-read and the menu redrawn if what is on offer changed. */
function showMenu() {
  UI.mainMenu(menuOpts());
  if (RunSync && loggedIn()) {
    const before = JSON.stringify(RunSync.offer());
    RunSync.reload().then((o) => { if (JSON.stringify(o) !== before) redrawMenu(); }).catch(() => {});
  }
}
/** Redraw the main menu if it is what is showing (nothing opened over it). */
function redrawMenu() {
  const top = document.querySelector('.modal-layer > .modal:last-child');
  if (top && top.classList.contains('menu-modal')) UI.mainMenu(menuOpts());
}
/** A push of this run was refused: say why (the run itself stays saved on this device). */
function runSyncHalted(why) {
  const msg = {
    behind: 'This run is further along on another device — open the main menu to continue from there.',
    other: 'Your account has a different run in progress from another device. This one is kept on this device — choose at the main menu.',
    ended: 'This run already finished on another device.',
    invalid: 'This run is too long to save on your account; it is still saved on this device.',
  }[why];
  if (msg && board) board.toast(msg);
}

// -------------------------------------------------------------- broadcast
function startPublishing() {
  if (!loggedIn() || !net.startPublisher) return;
  publisher = net.startPublisher(
    () => {
      if (!currentView) return null;
      // (the player's win stickers for the jokers and deck on the table: spectators draw these, not their own;
      // a win updates the record, so the next push shows the new stickers)
      // (+ win_stickers_revoked: the revocations of Pokermon twins among them, nearly always absent — stickers.js "Superseded")
      const view = Stickers ? withStickers({ ...currentView }, [...stickerKeys(currentView)]) : currentView;
      const snap = { view, events: pendingPublish.slice(-PUBLISH_CAP) };
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
  if (!el) {
    el = document.createElement('div'); el.id = 'watchers'; el.className = 'watchers'; document.body.appendChild(el);
    addEventListener('resize', placeWatchers);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', placeWatchers);
  }
  el.style.display = n > 0 ? '' : 'none';
  el.textContent = `👁 ${n} watching`;
  el.title = (names || []).join(', ');
  placeWatchers();
}
/** The "N watching" chip sits just LEFT of the site's settings / bell buttons (#mp-topbar), on their row: free
 *  space above the HUD at every size (under them it covered the portrait Round score box). No top bar: the CSS spot. */
function placeWatchers() {
  const el = document.getElementById('watchers');
  if (!el || el.style.display === 'none') return;
  const tb = document.getElementById('mp-topbar');
  const r = tb && tb.getBoundingClientRect();
  if (!r || r.width < 2) { el.style.top = el.style.right = ''; return; }
  el.style.right = Math.max(0, Math.round(innerWidth - r.left + 8)) + 'px';
  el.style.top = Math.max(0, Math.round(r.top + (r.height - el.offsetHeight) / 2)) + 'px';
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
  const badges = won && Progress && view.run_badges ? Progress.wireBadges(view.run_badges.earned) : null; // (Pokermon: the row's Nuzlocke / Monotype tag)
  return net.submitScore({ score: (view.stats && view.stats.best_hand) || 0, ante: view.ante, seed: view.seed, back: view.back, stake: view.stake, won: !!won, mods: view.mods || [], customDeck: view.custom_deck ? view.custom_deck.name : '', ...(replay ? { replay } : {}), ...(badges ? { badges } : {}) });
}
/** Put the player's win stickers for `keys` on `o` (a published view / a replay recipe): win_stickers, and
 * win_stickers_revoked only when a Pokermon twin among them has a revocation (stickers.js "Superseded add-on jokers"). */
function withStickers(o, keys) {
  o.win_stickers = Stickers.stickerMap(keys);
  const rv = Stickers.stickerRevokedMap ? Stickers.stickerRevokedMap(keys) : {};
  if (Object.keys(rv).length) o.win_stickers_revoked = rv;
  return o;
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
    // the player's win stickers for the jokers seen in the run and the deck: the replay draws these, not the viewer's
    if (Stickers) withStickers(recipe, [...stickerKeys(view, seenJokers)]);
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
    onNewRun: () => UI.newRunScreen(menuOpts()), onMainMenu: () => showMenu(),
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
    onMainMenu: () => { finishPublishing(true, rec); Engine.Session.clearSaved(); showMenu(); },
  });
}

// ------------------------------------------------------------------- menus
/** Is there a run to Continue (this device's, or the account's from another device), and where it came from. */
function savedOpts() {
  if (!Engine) return { saved: false, cloud: null };
  if (!RunSync) return { saved: !!Engine.Session.saved(), cloud: null };
  const o = RunSync.offer();
  return { saved: o.kind !== 'none', cloud: o };
}
function menuOpts() {
  return {
    ...savedOpts(), direct: DIRECT, loggedIn: loggedIn(), net, seed: params.get('seed') || '',
    onNew: (o) => startRun(o), onContinue: () => continueFlow(),
    replays: replaysApi(), me: myName(),
    challenges: challengesApi(), sleeves: sleevesApi(),
    progress: Progress,
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
    // (a daily challenge — Pokermon's Mystery Dungeon — gets today's UTC date, DDMMYYYY: its seed; the engine never reads the clock)
    start: (ch, mods, modOptions) => startRun({ challenge: ch.id, mods, modOptions, back: 'b_challenge', stake: 1, daily: ch.daily_seed ? utcDayStamp() : null }),
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
      onMainMenu: MODE === 'normal' ? () => showMenu() : null,
      mods: v && v.mods && v.mods.length ? v.mods : null,
      modOptions: (session && session.recipe && session.recipe.modOptions) || {},
    });
  }
}

// ---------------------------------------------------------------- keyboard
// R is a tap AND a hold (Balatro): a quick tap sorts the hand by rank / rerolls the shop; held ~1 s it restarts
// the run (a "Restarting…" bar fills; let go early to cancel). The tap's action waits for the key-up, and runs
// only on a quick release, so a hold never also sorts or rerolls.
const R_TAP_MS = 250, R_HOLD_MS = 1000, R_BAR_MS = 150;
let rHold = null; // {t0, raf, el, done}
/** Can R restart now: a live run of the player's own, nothing open over the table. */
const canRestart = () => MODE === 'normal' && !!(session && session.recipe && !session.over && board.view && !board.view.over) && !UI.modalOpen();
function rBar(frac) {
  let el = rHold.el;
  if (!el) {
    el = rHold.el = document.createElement('div');
    el.className = 'restart-hold';
    el.innerHTML = '<div class="rh-label">Restarting…</div><div class="rh-track"><div class="rh-fill"></div></div>';
    stage.appendChild(el);
  }
  el.querySelector('.rh-fill').style.width = Math.round(Math.min(1, frac) * 100) + '%';
}
function endRHold() {
  if (!rHold) return null;
  const h = rHold; rHold = null;
  cancelAnimationFrame(h.raf);
  if (h.el) h.el.remove();
  return h;
}
function startRHold() {
  rHold = { t0: performance.now(), raf: 0, el: null, done: false };
  const tick = () => {
    const h = rHold;
    if (!h || h.done) return;
    if (!canRestart()) { endRHold(); return; } // (something opened over the table: no restart, no tap)
    const t = performance.now() - h.t0;
    if (t >= R_HOLD_MS) { h.done = true; endRHold(); Promise.resolve(restartRun()).catch((err) => console.error('micatro: restart failed', err)); return; }
    if (t >= R_BAR_MS) rBar((t - R_BAR_MS) / (R_HOLD_MS - R_BAR_MS));
    h.raf = requestAnimationFrame(tick);
  };
  rHold.raf = requestAnimationFrame(tick);
}
function onKeyUp(e) {
  if ((e.key || '').toLowerCase() !== 'r' || !rHold) return;
  const h = endRHold();
  if (h && !h.done && performance.now() - h.t0 < R_TAP_MS) stateKey('r');
}
function onKey(e) {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === 'Escape') { if (UI.modalOpen()) { if (!document.querySelector('.menu-modal, .go-modal')) UI.closeModal(); } else onMenu('options'); return; }
  if (UI.modalOpen() || MODE !== 'normal' || !board.view) return;
  const k = e.key.toLowerCase();
  if (k === 'v') return onMenu('deck');
  // P: a mod's card view for the selected joker (Pokermon's Pokédex: its SMODS.Keybind "openPokedex")
  if (k === 'p' && board.sel != null) { const d = board.data.get(board.sel); if (d && modFirst('cardContext', d, UI.modApi())) return; }
  if (k === 'i') return onMenu('runinfo');
  if (k === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey && canRestart()) {
    // (the tap's sort / reroll waits for the key-up: onKeyUp; auto-repeat keydowns are the same hold)
    e.preventDefault();
    if (!rHold && !e.repeat) startRHold();
    return;
  }
  stateKey(k);
  if (k === ' ' || k === 'enter') e.preventDefault();
}
/** The keys that act on what's on the table now. */
function stateKey(k) {
  const v = board.view;
  if (!v || MODE !== 'normal' || UI.modalOpen()) return;
  const click = (sel) => { const b = stage.querySelector(sel); if (b && !b.disabled && b.offsetParent) { b.click(); return true; } return false; };
  // 1–9, 0: the nth card (0 = the 10th) — the hand's while it can be picked (also in Arcana / Spectral / a mod's
  // hand packs), else a pack's own cards; again on a picked card lets it go
  if (/^[0-9]$/.test(k)) { if (player.idle()) board.keyPick(k === '0' ? 9 : +k - 1); return; }
  if (v.state === 'SELECTING_HAND') {
    if (k === 'enter' || k === 'p') click('.b-play');
    else if (k === 'd' || k === 'delete' || k === 'backspace') click('.b-discard');
    else if (k === 'r') click('.b-rank');
    else if (k === 's') click('.b-suit');
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
    else if (k === 'c' && board.handSelectable()) onAction({ type: 'highlight', ids: [] });
  }
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
      // the runner's stickers (view.win_stickers); an older runner's snapshot without them: this viewer's own
      if (Stickers) Stickers.setStickerSource(snap.view.win_stickers || null, snap.view.win_stickers_revoked || null);
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
  // signed in: saved on the account (net.js fetchStickers / saveStickers; localStorage is the offline cache);
  // a guest: this browser only
  if (Stickers) Stickers.initWinStickers(myName(), loggedIn() && net.fetchStickers ? { fetch: () => net.fetchStickers(), push: (w, o) => net.saveStickers(w, o) } : null);
  // the Nuzlocke / Monotype record + achievements: this player's, synced with the account (ui/progress.js)
  Progress = await import('./progress.js').catch(() => null);
  // (an achievement the record already qualifies for unlocks now, with its toast — only the player's own live game shows it)
  if (Progress) Progress.initProgress(loggedIn() ? myName() : null, net, { onUnlock: (list) => { if (MODE === 'normal') Progress.achievementToast(stage, list); } });
  // completed challenges: this player's, synced with the account (ui/challengesync.js)
  if (MODE === 'normal') import('./challengesync.js').then((m) => m.initChallengeSync(loggedIn() ? myName() : null, loggedIn() && net && net.fetchChallenges ? { fetch: () => net.fetchChallenges(), push: (d, o) => net.saveChallenges(d, o) } : null)).catch((e) => console.warn('micatro: challenge sync unavailable', e));
  player = new Player(board);
  UI.initScreens(stage);
  if (Engine && Engine.describeBack) UI.setBackDescriber(Engine.describeBack);
  UI.setModsApi(modsApi());
  document.body.classList.add('mode-' + MODE);
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', () => endRHold()); // (the key-up may never come: no tap, no restart)
  // (replay: LB/RB step, secondary plays/pauses — the controller drives the viewer)
  const padReplay = MODE === 'replay' ? { toggle: () => replayCtrl && replayCtrl.toggle && replayCtrl.toggle(), step: (d) => replayCtrl && replayCtrl.ready && (d < 0 ? replayCtrl.stepBack() : replayCtrl.stepForward()) } : null;
  try { pad = initPad({ board, stage, UI, readOnly: MODE !== 'normal', onMenu, mainMenu: () => showMenu(), replay: padReplay }); } catch (e) { console.warn('micatro: controller support unavailable', e); }
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
    get progress() { return Progress; },
    get runSync() { return RunSync; },
    ready: true,
  };
  if (MODE === 'spectate') { startSpectating(); return; }
  if (MODE === 'replay') { startReplayMode(); return; }
  if (!Engine) { board.toast('The game failed to load. Please refresh.'); return; }
  // the run in progress: signed in, also saved on the account (ui/runsync.js) — read it before the menu offers
  // Continue (briefly: a slow network redraws the menu when it arrives)
  RunSync = await import('./runsync.js').catch((e) => { console.warn('micatro: run sync unavailable', e); return null; });
  if (RunSync) {
    const ready = RunSync.initRunSync({ me: loggedIn() ? myName() : null, net, Session: Engine.Session, onHalt: runSyncHalted });
    const first = await Promise.race([ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 3000))]);
    if (!first) ready.then(() => redrawMenu()).catch(() => {});
  }
  UI.mainMenu(menuOpts());
}
boot().catch((e) => { console.error('micatro boot failed', e); });
