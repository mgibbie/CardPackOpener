// Per-joker win stickers (Balatro's set_joker_win / get_joker_win_sticker): winning a run marks every joker
// in it — and, with Pokermon's previous_evo_stickers, a Pokémon's earlier stages (the engine's `win` event
// lists the keys: run.js joker_win_keys) — with the highest stake it has won on. The joker then wears that
// stake's sticker (stickers.png: White, Red, Green, Black, Blue, Purple, Orange, Gold) and its tooltip says so.
//   * Per CATEGORY of win: {jokerKey: {win, poke, nuz, mono, both}}, each the highest stake level (1..8) won at:
//       win  — any win (the plain stake sticker)
//       nuz  — a Nuzlocke run             -> an Aipom sticker
//       mono — a Monotype run             -> an Ambipom sticker
//       both — Nuzlocke AND Monotype      -> an Arceus sticker
//       poke — any win with Pokermon on   -> a Pikachu sticker
//     recordWin({jokers, stake, categories}) (categories default ['win']; the Pokermon runs pass theirs).
//     The joker wears ONE sticker: both > mono > nuz > poke > win — any special beats a plain one, whatever the
//     stakes (a White-stake Aipom shows instead of a Gold plain sticker). A special is the Pokémon in a ring
//     of its category's stake colour (Balatro's G.C.STAKES). The old flat format {jokerKey: level} (an
//     older cache / account row) means {win: level}.
//   * Saved on the Magepunk account for a signed-in player (server/mp.mjs micatro-stickers-get / -put, row
//     `micatro_stickers:<user>`), with localStorage ('micatro_joker_wins_v1:<user>') as the offline cache.
//     On load the local and account records merge (max per key and category), so stickers won in this
//     browser before they were saved on the account move to it once, and local data is never deleted; a win
//     updates the cache at once and is pushed (debounced, retried with backoff on failure). The server merges
//     by max too, so a stale or second device can never lower or drop a sticker.
//   * REVOKED stickers (one granted by mistake): the only way a sticker leaves. The admin adds `revoked` to the account
//     row (server/mp.mjs; {key: true | [cats] | {cats, at}}); the server strips those from every put and returns them,
//     and this browser deletes them from its record (applyRevoked: before it merges the account's, on load and after
//     every push), so it never pushes them back. Re-earn: recordWin stamps each category's earn time
//     ('micatro_joker_earned_v1:<user>'); a category earned AFTER the revocation's `at` is kept here and pushed with
//     its time (`earned`, for revoked keys only), and the server accepts it. Without `at` the key stays revoked.
//   * Guests keep localStorage only ('...:guest'). The first account that signs in on that browser takes the
//     guest record once (merge by max; 'micatro_joker_wins_guest_carried' remembers it — like MicaSurvivor's
//     guest carry-over), so another account signing in later never inherits it.
//   * A spectator / replay viewer sees the WATCHED player's stickers, never their own: the published view carries
//     the player's records for the cards on the table and the deck (view.win_stickers, main.js publisher), and a
//     replay's recipe carries them for the jokers seen during the run (recipe.win_stickers). setStickerSource() makes
//     every sticker drawn on that page come from that map (an old snapshot / replay without one: the viewer's own).
//     It never touches the viewer's own record, and a replay or a spectated win records nothing.
//   * Like Balatro, seeded and challenge runs earn no stickers (win_game skips set_joker_win).
//   * Collection-style screens (the Pokédex, the Challenges screen) always show them; on the table they show
//     while Options > "Stake stickers" is on (Balatro's "Display stickers"; on by default here, since Micatro
//     has no collection screen to see them in otherwise).
//   * Mod upgrades (mods/aliases.js): a sticker stored under a key the mod RENAMED counts for the new key (read-time:
//     the stored record is never rewritten, so the account's max-merge is untouched); one under a REMOVED key
//     stays stored and is listed greyed out as a "retired card" (retiredStickers), never dropped.
//   * Superseded add-on jokers (mods/superseded.js; Pokermon PORTING.md "Add-on dedupe"): a legacy Nacho / Pokermon+ key
//     that base Pokermon took over (j_nacho_ralts -> j_poke_ralts) keeps its own record, and that record also counts
//     toward its Pokermon twin when READ (max per category; nothing stored is rewritten) — except a category revoked on
//     the twin: a revocation of j_poke_ralts stays one whatever j_nacho_ralts holds. A NEW win with a legacy card is
//     recorded on both keys (recordWin), so the twin's own record, its earn time (the re-earn rule) and the account row
//     carry it. A spectator / replay gets the merged records (stickerMap) plus the twins' revocations (stickerRevokedMap,
//     passed to setStickerSource), so its own merge of a legacy card on the same table can't bring a revoked one back.
import { aliasesOf, isRetired, retiredName } from '../mods/aliases.js';
import { supersededBy, supersededFrom } from '../mods/superseded.js';
export const STICKER_NAMES = ['White', 'Red', 'Green', 'Black', 'Blue', 'Purple', 'Orange', 'Gold'];
/** stickers.png cells (game.lua G.shared_stickers). */
export const STICKER_POS = {
  White: { x: 1, y: 0 }, Red: { x: 2, y: 0 }, Green: { x: 3, y: 0 }, Black: { x: 0, y: 1 },
  Blue: { x: 4, y: 0 }, Purple: { x: 1, y: 1 }, Orange: { x: 2, y: 1 }, Gold: { x: 3, y: 1 },
};
/** Balatro's stake colours (globals.lua G.C.STAKES: WHITE, RED, GREEN, BLACK, BLUE, PURPLE, ORANGE, GOLD). */
export const STAKE_COLOURS = {
  White: '#ffffff', Red: '#fe5f55', Green: '#4bc292', Black: '#374244',
  Blue: '#009dff', Purple: '#8867a5', Orange: '#fda200', Gold: '#eac058',
};
/** The win categories, and which one a joker shows (first earned wins). */
export const CATEGORIES = ['win', 'poke', 'nuz', 'mono', 'both'];
export const PRIORITY = ['both', 'mono', 'nuz', 'poke', 'win'];
const CATEGORY_LABEL = { win: 'Win', poke: 'Pokermon', nuz: 'Nuzlocke', mono: 'Monotype', both: 'Nuzlocke Monotype' };
/** The special stickers: a Pokémon sprite (micatro/assets/textures/winstickers/<img>.png) in a stake-coloured ring. */
export const SPECIAL = {
  both: { pokemon: 'Arceus', num: 493, img: 'arceus' },
  mono: { pokemon: 'Ambipom', num: 424, img: 'ambipom' },
  nuz: { pokemon: 'Aipom', num: 190, img: 'aipom' },
  poke: { pokemon: 'Pikachu', num: 25, img: 'pikachu' },
};
const SHOW_KEY = 'micatro_stake_stickers';
const GUEST_CARRIED_KEY = 'micatro_joker_wins_guest_carried';
const KEY_RE = /^[A-Za-z0-9_]{1,64}$/;
const PUSH_DEBOUNCE_MS = 1500;
const RETRY_MIN_MS = 2000, RETRY_MAX_MS = 60_000;
let user = 'guest';
let wins = Object.create(null);   // {jokerKey: {win?, poke?, nuz?, mono?, both?}}
let show = true;
let sess = null;         // the account sync for the current user (null: a guest / no account API)
let earned = Object.create(null);   // {jokerKey: {cat: ms}} when each category was last won here (the re-earn rule)
let revoked = Object.create(null);  // the account's revocations, last seen: {jokerKey: {cats: [cat], at: ms | null}}
export let stickerVer = 0;
const listeners = new Set();
const keyFor = (u) => 'micatro_joker_wins_v1:' + u;
const earnedKeyFor = (u) => 'micatro_joker_earned_v1:' + u;
const key = () => keyFor(user);
const bump = () => { stickerVer++; for (const cb of listeners) { try { cb(); } catch (e) { /* ignore */ } } };
const levelOf = (v) => (Number.isInteger(v) && v >= 1 && v <= 8 ? v : 0);
/** One joker's record in either format -> {cat: level} (the old flat level = {win}); null when empty. */
export function normRecord(v) {
  if (typeof v === 'number') { const lv = levelOf(v); return lv ? { win: lv } : null; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  for (const c of CATEGORIES) { const lv = levelOf(v[c]); if (lv) out[c] = lv; }
  return Object.keys(out).length ? out : null;
}
/** A stored / received map (either format) -> a clean {key: {cat: level}} (bad keys and levels dropped). */
export function cleanWins(m) {
  const out = Object.create(null);
  if (!m || typeof m !== 'object' || Array.isArray(m)) return out;
  for (const k of Object.keys(m)) {
    if (!KEY_RE.test(k) || k === '__proto__') continue;
    const r = normRecord(m[k]);
    if (r) out[k] = r;
  }
  return out;
}
function readLocal(u) { try { return cleanWins(JSON.parse(localStorage.getItem(keyFor(u)) || '{}')); } catch (e) { return Object.create(null); } }
function saveLocal() { try { localStorage.setItem(key(), JSON.stringify(wins)); return true; } catch (e) { return false; /* not remembered */ } }
/** {key: {cat: ms}} cleaned (positive finite times, known keys and categories). */
function cleanEarned(m) {
  const out = Object.create(null);
  if (!m || typeof m !== 'object' || Array.isArray(m)) return out;
  for (const k of Object.keys(m)) {
    if (!KEY_RE.test(k) || k === '__proto__' || !m[k] || typeof m[k] !== 'object') continue;
    for (const c of CATEGORIES) { const t = m[k][c]; if (Number.isFinite(t) && t > 0) (out[k] || (out[k] = {}))[c] = Math.floor(t); }
  }
  return out;
}
function readEarned(u) { try { return cleanEarned(JSON.parse(localStorage.getItem(earnedKeyFor(u)) || '{}')); } catch (e) { return Object.create(null); } }
function saveEarned() { try { localStorage.setItem(earnedKeyFor(user), JSON.stringify(earned)); } catch (e) { /* not remembered */ } }
function mergeEarned(m) {
  const c = cleanEarned(m);
  for (const k of Object.keys(c)) for (const cat of Object.keys(c[k])) if (((earned[k] && earned[k][cat]) || 0) < c[k][cat]) (earned[k] || (earned[k] = {}))[cat] = c[k][cat];
}
/** The server's `revoked` ({key: {cats, at}}; also the admin forms true | [cats]) -> {key: {cats, at: ms | null}}. */
export function cleanRevoked(m) {
  const out = Object.create(null);
  if (!m || typeof m !== 'object' || Array.isArray(m)) return out;
  for (const k of Object.keys(m)) {
    if (!KEY_RE.test(k) || k === '__proto__') continue;
    let v = m[k], at = null;
    if (v && typeof v === 'object' && !Array.isArray(v)) { if (Number.isFinite(v.at) && v.at > 0) at = Math.floor(v.at); v = 'cats' in v ? v.cats : true; }
    const cats = v === true ? CATEGORIES.slice() : Array.isArray(v) ? CATEGORIES.filter((c) => v.includes(c)) : [];
    if (cats.length) out[k] = { cats, at };
  }
  return out;
}
/**
 * The account revoked these (`rv`, the server's `revoked`): delete them from this browser's record, except a
 * category won here after the revocation (its earn time > `at`), and remember the list. Saves and redraws when
 * something went. Returns how many categories were dropped.
 */
function applyRevoked(rv) {
  revoked = cleanRevoked(rv);
  const n = revokeFrom(wins, earned, revoked);
  if (n) { saveLocal(); saveEarned(); bump(); }
  return n;
}
/** Delete the cleaned revocations `rv` from a {key: {cat: level}} record `w` and its earn times `e` (in place), except a
 * category earned after the revocation's `at`. Returns how many categories went. */
function revokeFrom(w, e, rv) {
  let n = 0;
  for (const k of Object.keys(rv)) {
    const { cats, at } = rv[k];
    const cur = w[k];
    for (const c of cats) {
      const t = (e[k] && e[k][c]) || 0;
      if (at != null && t > at) continue;   // re-earned after the revocation: it stays
      if (cur && cur[c]) { delete cur[c]; n++; }
      if (e[k]) delete e[k][c];
    }
    if (cur && !Object.keys(cur).length) delete w[k];
    if (e[k] && !Object.keys(e[k]).length) delete e[k];
  }
  return n;
}
/**
 * A stored / received record (an account row's `wins`, either format) with its revocations applied, as this browser
 * applies them (the re-earn rule included): a clean copy, the input untouched. For read-only viewers of a record
 * (the design wiki's Micatro pages draw the signed-in player's stickers with it + setStickerSource).
 */
export function withoutRevoked(m, rv, earnedMap) {
  const w = cleanWins(m);
  revokeFrom(w, cleanEarned(earnedMap), cleanRevoked(rv));
  return w;
}
/** The earn times a push carries: only for revoked keys (what the server's re-earn check needs). */
function earnedForPush() {
  const out = {};
  for (const k of Object.keys(revoked)) if (earned[k]) out[k] = { ...earned[k] };
  return out;
}
/** Raise `wins` to `m` (max per key and category). Returns how many jokers rose. */
function mergeIn(m) {
  let n = 0;
  const c = cleanWins(m);
  for (const k of Object.keys(c)) {
    const cur = wins[k] || (wins[k] = {});
    let rose = false;
    for (const cat of Object.keys(c[k])) if ((cur[cat] || 0) < c[k][cat]) { cur[cat] = c[k][cat]; rose = true; }
    if (rose) n++;
  }
  return n;
}
/** Does `wins` hold anything `m` lacks (a key or category it doesn't have, or a higher level)? */
function ahead(m) {
  const c = cleanWins(m);
  return Object.keys(wins).some((k) => Object.keys(wins[k]).some((cat) => wins[k][cat] > ((c[k] && c[k][cat]) || 0)));
}
const copyWins = () => JSON.parse(JSON.stringify(wins));

/**
 * Load this player's stickers. `account` (signed in): {fetch() -> Promise<{wins}|{error}>,
 * push(wins, {keepalive}) -> Promise<{wins}|{error}>} (net.js fetchStickers / saveStickers): the record is then
 * synced with the account; without it (a guest) it stays in this browser only.
 */
export function initWinStickers(username, account) {
  if (sess) { sess.dead = true; clearTimeout(sess.timer); }
  sess = null;
  user = (username && String(username)) || 'guest';
  wins = readLocal(user);
  earned = readEarned(user);
  revoked = Object.create(null);
  try { const s = localStorage.getItem(SHOW_KEY); show = s == null ? true : s === '1'; } catch (e) { show = true; }
  if (user !== 'guest' && account && typeof account.fetch === 'function' && typeof account.push === 'function') {
    // a guest record in this browser moves to the FIRST account that signs in here, once (never deleted)
    try {
      if (!localStorage.getItem(GUEST_CARRIED_KEY)) {
        const g = readLocal('guest');
        if (Object.keys(g).length) {
          mergeIn(g);
          mergeEarned(readEarned('guest'));
          saveEarned();
          if (saveLocal()) localStorage.setItem(GUEST_CARRIED_KEY, JSON.stringify({ to: user, at: Date.now() }));
        }
      }
    } catch (e) { /* storage blocked: nothing to carry */ }
    sess = { account, dead: false, synced: false, dirty: false, inflight: false, again: false, timer: null, backoff: RETRY_MIN_MS, attempts: 0 };
    schedule(sess, 0);
  }
  bump();
}
function schedule(s, ms) {
  if (s.dead) return;
  clearTimeout(s.timer);
  s.timer = setTimeout(() => sync(s), ms);
}
/** One sync pass: fetch the account record once (merge it in; push if this browser is ahead), then push while dirty. */
async function sync(s) {
  if (s.dead) return;
  if (s.inflight) { s.again = true; return; }
  s.inflight = true; s.again = false; s.attempts++;
  let ok = false;
  try {
    if (!s.synced) {
      const r = await s.account.fetch();
      if (s.dead) return;
      if (!r || r.error || !r.wins) throw new Error('fetch');
      applyRevoked(r.revoked);   // first: a revoked sticker held here goes (then the account's record merges in)
      mergeEarned(r.earned); saveEarned();
      if (mergeIn(r.wins)) { saveLocal(); bump(); }
      s.synced = true;
      if (ahead(r.wins)) s.dirty = true;   // this browser has stickers the account lacks: move them there
    }
    if (s.dirty) {
      s.dirty = false;
      const r = await s.account.push(copyWins(), { earned: earnedForPush() });
      if (s.dead) return;
      if (!r || r.error || !r.wins) { s.dirty = true; throw new Error('push'); }
      applyRevoked(r.revoked);
      mergeEarned(r.earned); saveEarned();
      if (mergeIn(r.wins)) { saveLocal(); bump(); }
      if (ahead(r.wins)) s.dirty = true;   // a win landed while this push was in flight
    }
    ok = true;
  } catch (e) { /* offline / server error: retried below; the local copy keeps the sticker */ }
  finally { s.inflight = false; }
  if (s.dead) return;
  if (!ok) { schedule(s, s.backoff); s.backoff = Math.min(RETRY_MAX_MS, s.backoff * 2); return; }
  s.backoff = RETRY_MIN_MS;
  if (s.dirty || s.again) schedule(s, s.dirty ? PUSH_DEBOUNCE_MS : 0);
}
/** Debug / tests: the account sync's state for the current player (null for a guest). */
export const stickerSyncState = () => (sess ? { user, synced: sess.synced, dirty: sess.dirty, inflight: sess.inflight, attempts: sess.attempts, revoked: Object.keys(revoked) } : null);
// leaving the page with an unsent win: one last keepalive push (the next load re-syncs anyway); back online: retry now
try {
  addEventListener('pagehide', () => {
    const s = sess;
    if (s && !s.dead && s.dirty && !s.inflight) { try { s.account.push(copyWins(), { keepalive: true, earned: earnedForPush() }); } catch (e) { /* ignore */ } }
  });
  addEventListener('online', () => { const s = sess; if (s && !s.dead && (s.dirty || !s.synced)) { s.backoff = RETRY_MIN_MS; schedule(s, 0); } });
} catch (e) { /* no window */ }

export function onWinStickers(cb) { listeners.add(cb); return () => listeners.delete(cb); }
/** A stake level (1..8; a mod stake's higher level counts as Gold) -> its sticker name. */
export const stickerName = (level) => (level > 0 ? STICKER_NAMES[Math.min(8, Math.max(1, Math.floor(level))) - 1] : null);
/**
 * The win event ({jokers: [keys], stake, categories?: ['win', 'poke', 'nuz', 'mono', 'both']}) -> stored (each listed
 * category raised to this stake). Returns how many jokers improved.
 */
export function recordWin(ev) {
  if (!ev || !Array.isArray(ev.jokers)) return 0;
  const lv = Math.min(8, Math.max(1, Math.floor(Number(ev.stake) || 1)));
  let cats = Array.isArray(ev.categories) ? [...new Set(ev.categories.filter((c) => CATEGORIES.includes(c)))] : [];
  if (!cats.length) cats = ['win'];
  let n = 0, stamped = false;
  const now = Date.now();
  // a superseded legacy add-on joker wins for its Pokermon twin too (both keep a record: see the header)
  const keys = [...new Set(ev.jokers.flatMap((k) => (supersededBy(k) ? [k, supersededBy(k)] : [k])))];
  for (const k of keys) {
    if (typeof k !== 'string' || !KEY_RE.test(k) || k === '__proto__') continue;
    const cur = wins[k] || {};
    let rose = false;
    for (const c of cats) {
      if ((cur[c] || 0) > lv) continue;   // a higher level stays as it was won (and when)
      if ((cur[c] || 0) < lv) { cur[c] = lv; rose = true; }
      (earned[k] || (earned[k] = {}))[c] = now; stamped = true;   // the re-earn rule's time: a revocation before it can't strip it
    }
    if (rose) { wins[k] = cur; n++; }
  }
  if (stamped) saveEarned();
  if (n) {
    saveLocal();
    bump();
    if (sess && !sess.dead) { sess.dirty = true; if (!sess.inflight) schedule(sess, PUSH_DEBOUNCE_MS); }
  }
  return n;
}
/**
 * A key's stored record merged (max per category) with its renamed-from keys' and with the legacy add-on keys it
 * supersedes (minus the categories `rv` — the revocations that apply to `from` — revokes on it), or undefined.
 */
function recordOf(centerKey, from = wins, rv = revoked) {
  if (!centerKey) return undefined;
  const olds = aliasesOf(centerKey), legacy = supersededFrom(centerKey);
  if (!olds.length && !legacy.length) return from[centerKey];
  let out = null;
  const raise = (r, skip) => {
    if (!r) return;
    out = out || {};
    for (const c of Object.keys(r)) if (!(skip && skip.includes(c)) && (out[c] || 0) < r[c]) out[c] = r[c];
  };
  for (const k of [centerKey, ...olds]) raise(from[k]);
  const no = rv && rv[centerKey] ? rv[centerKey].cats : null;   // revoked on the twin: a legacy win can't restore it
  for (const k of legacy) for (const l of [k, ...aliasesOf(k)]) raise(from[l], no);
  return out && Object.keys(out).length ? out : undefined;
}
/** This joker's full record: {win?, poke?, nuz?, mono?, both?} (a copy; {} when it has none). */
export const winRecord = (centerKey) => ({ ...(recordOf(centerKey) || {}) });
/** The highest stake level this joker has won on, in any category (0 = none). */
export const winLevel = (centerKey) => { const r = recordOf(centerKey); return r ? Math.max(0, ...Object.values(r)) : 0; };
/** Stickers kept on RETIRED cards (a mod upgrade removed them): [{key, name, sticker}] — listed greyed out. */
export function retiredStickers() {
  return Object.keys(wins).filter((k) => isRetired(k)).sort().map((k) => ({ key: k, name: retiredName(k), sticker: stickerFor(wins[k]) }));
}
/** Which sticker a record shows: both > mono > nuz > poke > win (null when none). Pure (tests use it). */
export function stickerFor(rec) {
  const r = normRecord(rec);
  if (!r) return null;
  const category = PRIORITY.find((c) => r[c]);
  const level = r[category], stake = stickerName(level);
  const sp = SPECIAL[category] || null;
  return {
    category, level, stake, colour: STAKE_COLOURS[stake],
    special: sp ? { ...sp } : null,
    label: (category === 'win' ? 'Win' : CATEGORY_LABEL[category] + ' win') + ' — ' + stake + ' Stake',
  };
}
/** The sticker to draw on this joker (stickerFor), or null. `collection`: always (else only with the option on). */
export function winStickerInfo(centerKey, collection) {
  if (!collection && !show) return null;
  return source ? stickerFor(recordOf(centerKey, source, sourceRevoked)) : stickerFor(recordOf(centerKey));
}

// ---------------------------------------------------------------- a watched player's stickers
let source = null;     // spectating / a replay: the player's {key: {cat: level}} (null: this viewer's own record)
let sourceRevoked = Object.create(null);   // that player's revocations (only the superseded merge reads them)
let sourceJson = 'null';
/**
 * Draw the stickers from `map` (the watched player's records: a spectated view's win_stickers, a replay's
 * recipe.win_stickers) instead of this viewer's own; null / not an object = back to the own record. Cleaned like
 * a stored record; only redraws when it changed. The viewer's own record (and its storage) is never touched.
 * `revoked` (optional; the server's `revoked` format, or stickerRevokedMap's): that player's revocations, so a legacy
 * add-on key's record never brings back a category revoked on its Pokermon twin (the superseded merge, recordOf).
 */
export function setStickerSource(map, revoked = null) {
  const next = map && typeof map === 'object' && !Array.isArray(map) ? cleanWins(map) : null;
  const rv = next ? cleanRevoked(revoked) : Object.create(null);
  const json = next ? JSON.stringify([next, rv]) : 'null';
  if (json === sourceJson) return;
  source = next; sourceRevoked = rv; sourceJson = json;
  bump();
}
export const stickerSource = () => (source ? JSON.parse(sourceJson)[0] : null);
/**
 * This player's records for `keys` (the jokers and deck back on the table / seen in a run), compact: only keys
 * with a record — {key: {win?, poke?, nuz?, mono?, both?}}, each as it READS here (recordOf: renamed-from and
 * superseded legacy keys merged in, revocations respected). What the publisher / a replay sends viewers.
 */
export function stickerMap(keys) {
  const out = {};
  for (const k of keys || []) {
    if (typeof k !== 'string' || !KEY_RE.test(k) || k === '__proto__' || out[k]) continue;
    const r = recordOf(k);
    if (r && Object.keys(r).length) out[k] = { ...r };
  }
  return out;
}
/**
 * This player's revocations of the superseding (Pokermon twin) keys among `keys` ({key: {cats, at}}; nearly always
 * {}): sent with stickerMap, so a viewer's merge of a legacy card on the same table respects them (setStickerSource).
 */
export function stickerRevokedMap(keys) {
  const out = {};
  for (const k of keys || []) {
    if (typeof k === 'string' && revoked[k] && supersededFrom(k).length) out[k] = { cats: revoked[k].cats.slice(), at: revoked[k].at };
  }
  return out;
}
/** The stake name of the sticker this joker shows, or null. `collection`: always (else only with the option on). */
export function winSticker(centerKey, collection) {
  const i = winStickerInfo(centerKey, collection);
  return i ? i.stake : null;
}
export const stickersShown = () => show;
export function setStickersShown(on) {
  show = !!on;
  try { localStorage.setItem(SHOW_KEY, show ? '1' : '0'); } catch (e) { /* ignore */ }
  bump();
}

// ---------------------------------------------------------------- the special stickers' art
// Loaded on first use; a sprite arriving recomposes the jokers (onWinStickers listeners).
const specialImgs = {};
/** The loaded sprite for a special sticker ('aipom' | 'ambipom' | 'arceus'), or null (and starts loading it). */
export function specialImage(name) {
  if (!name || typeof Image === 'undefined') return null;
  let e = specialImgs[name];
  if (!e) {
    e = specialImgs[name] = { img: new Image(), ok: false };
    e.img.onload = () => { e.ok = true; bump(); };
    e.img.onerror = () => { console.warn('micatro: missing win-sticker sprite ' + name); };
    e.img.src = new URL('../../assets/textures/winstickers/' + name + '.png', import.meta.url).href;
  }
  return e.ok ? e.img : null;
}
/** The stake sticker's spot on a 142x190 card face (stickers.png puts the chip at about (111, 30), r 18). */
export const SPECIAL_SPOT = { x: 111, y: 30, r: 21 };
/**
 * Draw a special sticker on a card face: a stake-coloured ring with the Pokémon inside. Returns true when the
 * sprite was drawn (the ring is always drawn, so a still-loading sprite still shows the sticker's stake).
 */
export function drawSpecialSticker(ctx, info, spot = SPECIAL_SPOT) {
  if (!info || !info.special) return false;
  const { x, y, r } = spot;
  ctx.save();
  // the ring: a dark outline, the stake colour, a pale disc inside
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#4f6367'; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r - 2, 0, Math.PI * 2); ctx.fillStyle = info.colour; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r - 7, 0, Math.PI * 2); ctx.fillStyle = '#f2f4f5'; ctx.fill();
  const im = specialImage(info.special.img);
  if (im) {
    // fit the sprite into the ring's pale centre
    const box = (r - 6) * 2, s = Math.min(box / im.width, box / im.height);
    const w = im.width * s, h = im.height * s;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(im, x - w / 2, y - h / 2, w, h);
  }
  ctx.restore();
  return !!im;
}
