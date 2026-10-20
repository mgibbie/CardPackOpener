// The run in progress, saved on the Magepunk account so it follows the player between devices (PC <-> phone).
//
// This device keeps saving the run locally on EVERY action, exactly as before (engine/session.js, 'micatro_run_v1').
// Signed in, the same recipe is also pushed to the account (server/mp.mjs micatro-run-get / -put / -clear, the row
// micatro_run:<user> holding ONE active run), debounced to keep D1 writes modest:
//   * when the run starts (or is resumed / carried over), once;
//   * at the round checkpoints — entering the blind select or the shop — at most one push per MIN_GAP_MS;
//   * otherwise at most once a minute while there are unsent moves;
//   * when the tab is hidden (an iPhone switching apps) and on 'pagehide' (a keepalive request when it fits).
//   An 8-ante run (~24 rounds, ~860 moves) is ~45-55 writes, plus one clear at the end.
// A run's id is seed + ':' + started. The server's put is compare-and-set on the row's `rev` and refuses a put
// that would lose anything (a DIFFERENT run stored, or the same run further along, or a finished run): see mp.mjs.
//
// When the run finishes — a win, a game over, an abandon — the account's copy is cleared (only that same run; the
// server leaves a tombstone so a late push can't bring it back). A clear that can't reach the server is remembered in
// localStorage and retried at the next boot before anything is offered.
//
// What the main menu offers (decide()):
//   * only a local run, or the same run with this device further along: Continue it (and push it: a guest's run is
//     carried into the account on the first sign-in this way, when the account has none);
//   * the account's run (no local one, or the same run further along on the account): "Continue run from another
//     device: Ante 4 · Round 11" — taking it backs up the local copy first (owner rule: never wipe a save without a
//     backup) and writes the account's recipe as this device's save, then resumes through the normal path (so the
//     mod version pin prompt still applies);
//   * two DIFFERENT runs: Continue asks which one to keep playing; the other is backed up to 'micatro_run_backup_v1'
//     before anything changes (and the account's slot is only replaced on that explicit choice);
//   * a local run the account says FINISHED (won / lost / abandoned on another device): not offered; it is moved to
//     the backup slot.
// Guests keep local-only runs (nothing here runs for them). Spectating and replays never touch any of this.
const DEVICE_KEY = 'micatro_device_v1';
const OWNER_KEY = 'micatro_run_owner_v1';
const META_KEY = 'micatro_run_meta_v1';      // {id, ante, round, back, at}: the local run's progress, for the menu text
const PENDING_KEY = 'micatro_run_sync_v1';   // {user, clear: {id, outcome, actions}}: a clear still to send
let MIN_GAP_MS = 20_000, IDLE_PUSH_MS = 60_000;
/** Tests: shorten the push timing (a real run keeps the defaults). */
export function setSyncTiming({ minGap, idle } = {}) { if (minGap >= 0) MIN_GAP_MS = minGap; if (idle >= 0) IDLE_PUSH_MS = idle; }
const RETRY_MIN_MS = 3000, RETRY_MAX_MS = 60_000, KEEPALIVE_MAX = 60_000;
const CHECKPOINTS = new Set(['BLIND_SELECT', 'SHOP']);

export const runIdOf = (r) => (r && typeof r.seed === 'string' && r.seed ? r.seed + ':' + (Number.isInteger(r.started) ? r.started : 0) : null);
export const actionsOf = (r) => (r && Array.isArray(r.actions) ? r.actions.length : 0);
const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const writeJSON = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

/** This browser's device id + a rough label ('phone' / 'tablet' / 'PC'), made once. */
export function device() {
  let d = readJSON(DEVICE_KEY);
  if (!d || !/^[a-z0-9]{6,24}$/.test(String(d.id || ''))) {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const label = /iPad|Tablet/i.test(ua) ? 'tablet' : /iPhone|Android|Mobile/i.test(ua) ? 'phone' : 'PC';
    d = { id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4), label };
    writeJSON(DEVICE_KEY, d);
  }
  return d;
}

/**
 * Pure: what to offer, given this device's saved run and the account's row.
 *   local: the local recipe | null; localOwner: who it was last played as ('guest' / a username / null)
 *   account: {rev, run: {id, recipe, progress, device} | null, ended: [{id, actions, outcome}]} | null (not fetched)
 * -> {kind: 'none' | 'local' | 'account' | 'conflict', push: bool (send the local run to the account),
 *     dropLocal: null | reason (the local run finished elsewhere: back it up and clear it), restore: bool, wonAt}
 */
export function decide({ local, localOwner = null, me = null, account = null, deviceId = null }) {
  const lid = runIdOf(local), ln = actionsOf(local);
  const out = { kind: 'none', push: false, dropLocal: null, restore: false, wonAt: null, fromOtherDevice: false };
  if (!account) { if (local) out.kind = 'local'; return out; }
  const arun = account.run && account.run.recipe && runIdOf(account.run.recipe) ? account.run : null;
  const foreign = !!(local && localOwner && localOwner !== 'guest' && me && localOwner !== me); // another account's run on this browser
  let L = local && !foreign ? local : null;
  if (L) {
    const tomb = (account.ended || []).find((e) => e && e.id === lid);
    if (tomb && !(arun && arun.id === lid)) {
      if (tomb.outcome === 'won' && ln >= (tomb.actions || 0)) out.wonAt = { id: lid, actions: tomb.actions || 0 }; // this device's own won run (Endless may follow)
      else if (tomb.outcome === 'replaced') out.restore = true;                         // another device started a new run over it
      else { out.dropLocal = 'finished on another device (' + tomb.outcome + ')'; L = null; }
    }
  }
  if (out.dropLocal) { if (arun) { out.kind = 'account'; out.fromOtherDevice = !!(arun.device && arun.device.id && arun.device.id !== deviceId); } return out; }
  if (L && arun) {
    if (arun.id === lid) {
      const an = actionsOf(arun.recipe);
      if (an > ln) { out.kind = 'account'; out.fromOtherDevice = !!(arun.device && arun.device.id && arun.device.id !== deviceId); }
      else { out.kind = 'local'; out.push = ln > an; }
    } else out.kind = 'conflict';
    return out;
  }
  if (L) { out.kind = 'local'; out.push = !out.wonAt; return out; }
  if (arun) { out.kind = 'account'; out.fromOtherDevice = !!(arun.device && arun.device.id && arun.device.id !== deviceId); return out; }
  if (local) out.kind = 'local'; // another account's run on this browser: still yours to continue here, as before
  return out;
}

// ------------------------------------------------------------------ the sync
let st = null;
/**
 * Start syncing for this page. opts: {me (null = a guest: nothing syncs), net (net.js), Session (engine/session.js),
 * onHalt(why, info) (a push was refused: 'behind' | 'other' | 'ended'), onChange() (the offer changed: redraw the menu)}.
 * Returns a promise that settles once the account's run was read (or that failed).
 */
export function initRunSync({ me = null, net = null, Session = null, onHalt = null, onChange = null } = {}) {
  if (st) { st.dead = true; clearTimeout(st.timer); }
  st = {
    me: me || null, net, Session, onHalt, onChange, dead: false,
    account: null, fetched: false, rev: 0, offer: null,
    recipe: null, progress: { ante: 0, round: 0 }, lastState: null,
    dirty: false, inflight: false, timer: null, lastPushAt: 0, backoff: RETRY_MIN_MS,
    acked: null, flags: {}, halted: null, wonAt: null, clearing: false, endedIds: new Set(),
  };
  const s = st;
  const signedIn = !!(me && net && net.fetchRun && net.saveRun);
  if (!signedIn) { s.ready = Promise.resolve(offer()); return s.ready; }
  s.ready = (async () => {
    await flushClear(s);
    await refresh(s);
    return offer();
  })();
  return s.ready;
}
const alive = (s) => s && s === st && !s.dead;
const signedIn = (s) => !!(s && s.me && s.net && s.net.saveRun);

/** Re-read the account's run and work out what to offer (pushing a local run that is ahead / carried over). */
async function refresh(s) {
  const r = await s.net.fetchRun();
  if (!alive(s)) return;
  if (!r || r.error) { s.fetched = false; return; }
  s.account = r; s.rev = r.rev || 0; s.fetched = true;
  const local = s.Session && s.Session.saved();
  const d = decide({ local, localOwner: readJSON(OWNER_KEY), me: s.me, account: r, deviceId: device().id });
  if (d.dropLocal && local) {
    s.Session.backupRecipe(local, d.dropLocal);
    s.Session.clearSaved();
    writeJSON(META_KEY, null);
  }
  if (d.wonAt) s.wonAt = d.wonAt;
  if (d.restore) s.flags.restore = true;
  s.offer = d;
  if (d.push && local) {
    // (this device's run is ahead of the account's copy, or the account has none: a guest's run carried over)
    s.recipe = local;
    const m = readJSON(META_KEY);
    if (m && m.id === runIdOf(local)) s.progress = { ante: m.ante || 0, round: m.round || 0 };
    writeJSON(OWNER_KEY, s.me);
    s.dirty = true;
    await push(s);
  }
}

/** What the main menu offers: {kind, local: {id, actions, ante, round, back, at}|null, account: {...}|null, fromOtherDevice}. */
export function offer() {
  const s = st;
  const local = s && s.Session ? s.Session.saved() : null;
  const d = s && s.offer ? s.offer : decide({ local, localOwner: readJSON(OWNER_KEY), me: s && s.me, account: null });
  // (re-checked against what is saved NOW: a run started / cleared since the account was read)
  let kind = d.kind;
  const arun = s && s.account && s.account.run && s.account.run.recipe ? s.account.run : null;
  if (kind === 'conflict' && (!local || !arun || runIdOf(local) === arun.id)) kind = local ? 'local' : arun ? 'account' : 'none';
  if (kind === 'account' && !arun) kind = local ? 'local' : 'none';
  if (kind === 'local' && !local) kind = arun ? 'account' : 'none';
  if (kind === 'none' && local) kind = 'local';
  const m = readJSON(META_KEY);
  const lsum = local ? { id: runIdOf(local), actions: actionsOf(local), back: local.back || null, at: (m && m.at) || null, ...(m && m.id === runIdOf(local) ? { ante: m.ante, round: m.round } : {}) } : null;
  const asum = arun ? { id: arun.id, actions: actionsOf(arun.recipe), back: arun.recipe.back || null, at: arun.updatedAt || null, ante: arun.progress && arun.progress.ante, round: arun.progress && arun.progress.round, device: arun.device || null } : null;
  return { kind, local: lsum, account: asum, fromOtherDevice: !!d.fromOtherDevice && kind === 'account' };
}

/**
 * The player chose to continue the ACCOUNT's run: back up this device's run (if any), make the account's recipe this
 * device's save. The caller then resumes it through the normal path (the version pin prompt included).
 */
export function takeAccount() {
  const s = st;
  if (!alive(s) || !s.account || !s.account.run || !s.account.run.recipe) return false;
  const local = s.Session.saved();
  const rec = s.account.run.recipe;
  if (local && !(runIdOf(local) === runIdOf(rec) && actionsOf(local) === actionsOf(rec))) {
    s.Session.backupRecipe(local, runIdOf(local) === runIdOf(rec) ? 'replaced by the account copy (further along)' : 'chose the run from the other device');
  }
  if (!s.Session.writeSaved(rec)) return false;
  writeJSON(OWNER_KEY, s.me);
  writeJSON(META_KEY, { id: runIdOf(rec), ante: (s.account.run.progress || {}).ante || 0, round: (s.account.run.progress || {}).round || 0, back: rec.back || null, at: Date.now() });
  s.acked = { id: runIdOf(rec), actions: actionsOf(rec) };
  s.offer = { kind: 'local', push: false, dropLocal: null, restore: false, wonAt: null, fromOtherDevice: false };
  s.halted = null;
  return true;
}
/** The player chose to continue THIS device's run over a different one on the account: back the account's up, and let
 *  the next push replace it (explicitly naming it, so a newer one from yet another device is still never overwritten). */
export function keepLocal() {
  const s = st;
  if (!alive(s)) return false;
  const arun = s.account && s.account.run && s.account.run.recipe ? s.account.run : null;
  if (arun) {
    s.Session.backupRecipe(arun.recipe, 'chose the run on this device over the other device\'s');
    s.flags.replace = arun.id;
  }
  s.offer = { kind: 'local', push: true, dropLocal: null, restore: !!s.flags.restore, wonAt: null, fromOtherDevice: false };
  s.halted = null;
  return true;
}

/**
 * A NEW run started on this device (it replaces whatever was saved here). If the account holds a different run, it is
 * backed up on this device first, then replaced (the player started a new run knowing Continue was on offer).
 */
export function startedRun(recipe, view) {
  const s = st;
  if (!alive(s)) return;
  const arun = s.account && s.account.run && s.account.run.recipe ? s.account.run : null;
  const id = runIdOf(recipe);
  if (signedIn(s) && arun && arun.id !== id) {
    s.Session.backupRecipe(arun.recipe, 'a new run was started on another device');
    s.flags.replace = arun.id;
  }
  s.wonAt = null; s.halted = null; s.flags.endless = false; s.flags.restore = false;
  s.lastState = null;
  track(recipe, view, { now: true });
}

/** After every action (and when a run begins / resumes): remember the progress, push when due. */
export function track(recipe, view, { now = false } = {}) {
  const s = st;
  if (!alive(s) || !recipe) return;
  const id = runIdOf(recipe);
  if (view) {
    s.progress = { ante: +view.ante || 0, round: +view.round || 0 };
    writeJSON(META_KEY, { id, ante: s.progress.ante, round: s.progress.round, back: recipe.back || null, at: Date.now() });
  }
  if (!signedIn(s)) { if (readJSON(OWNER_KEY) !== 'guest') writeJSON(OWNER_KEY, 'guest'); return; }
  if (readJSON(OWNER_KEY) !== s.me) writeJSON(OWNER_KEY, s.me);
  if (s.recipe !== recipe) { s.recipe = recipe; s.lastState = null; if (!s.acked || s.acked.id !== id) now = true; }
  if (s.halted && s.halted.id === id) return;     // refused: this device stops pushing this run (see onHalt)
  if (s.acked && s.acked.id === id && s.acked.actions === actionsOf(recipe)) return;
  s.dirty = true;
  const state = view && view.state;
  const checkpoint = state && state !== s.lastState && CHECKPOINTS.has(state);
  if (state) s.lastState = state;
  if (now) return schedule(s, 0);
  if (checkpoint) return schedule(s, Math.max(0, s.lastPushAt + MIN_GAP_MS - Date.now()), true);
  if (!s.timer) schedule(s, Math.max(0, s.lastPushAt + IDLE_PUSH_MS - Date.now()));
}
/** Push in `ms` — or keep the push already planned when it is due sooner (`sooner`: may move a later one earlier). */
function schedule(s, ms, sooner = false) {
  if (!alive(s)) return;
  const due = Date.now() + Math.max(0, ms);
  if (s.timer && (!sooner || s.due <= due)) return;
  clearTimeout(s.timer);
  s.due = due;
  s.timer = setTimeout(() => { s.timer = null; push(s); }, Math.max(0, ms));
}

async function push(s, { keepalive = false } = {}) {
  if (!alive(s) || !signedIn(s) || !s.recipe || !s.dirty) return;
  if (s.inflight) { s.again = true; return; }
  const recipe = s.recipe, id = runIdOf(recipe), n = actionsOf(recipe);
  if (!id || (s.halted && s.halted.id === id)) { s.dirty = false; return; }
  if (s.acked && s.acked.id === id && s.acked.actions === n) { s.dirty = false; return; }
  const body = { recipe, rev: s.rev, device: device(), progress: { ...s.progress } };
  if (s.flags.replace) body.replace = s.flags.replace;
  if (s.flags.restore) body.restore = true;
  if (s.wonAt && s.wonAt.id === id) body.endless = true;
  if (keepalive) {
    let size = 0;
    try { size = JSON.stringify(body).length; } catch (e) { return; }
    if (size > KEEPALIVE_MAX) keepalive = false; // (a keepalive body is capped at ~64 KB: send it normally and hope)
  }
  s.inflight = true; s.dirty = false; s.again = false; s.lastPushAt = Date.now();
  s.pushes = (s.pushes || 0) + 1;
  let r = null;
  try { r = await s.net.saveRun(body, keepalive ? { keepalive: true } : {}); } catch (e) { r = { error: 'offline' }; }
  s.inflight = false;
  if (!alive(s)) return;
  if (typeof (r && r.rev) === 'number') s.rev = r.rev;
  const stored = r && r.run;
  if (r && r.ok) {
    s.acked = { id, actions: n };
    s.flags.replace = null; s.flags.restore = false;
    s.backoff = RETRY_MIN_MS;
    if (s.account) s.account = { ...s.account, rev: s.rev, run: { ...(stored || {}), id, recipe, progress: { ...s.progress, actions: n } } };
    if (actionsOf(s.recipe) !== n || runIdOf(s.recipe) !== id || s.again) { s.dirty = true; schedule(s, Math.max(0, s.lastPushAt + IDLE_PUSH_MS - Date.now())); }
    return;
  }
  const err = (r && r.error) || 'offline';
  if (err === 'stale') {
    // the row moved on since we last read it: decide again with what it holds now
    const sn = stored && stored.progress ? stored.progress.actions || 0 : 0;
    if (!stored || (stored.id === id && sn <= n) || (s.flags.replace && stored.id === s.flags.replace)) { s.dirty = true; return schedule(s, 0, true); }
    return halt(s, stored.id === id ? 'behind' : 'other', id, stored);
  }
  if (err === 'behind' || err === 'other') return halt(s, err, id, stored);
  if (err === 'ended') {
    // (this device's own clear landed first: a push still in flight at the win / game over)
    if ((s.wonAt && s.wonAt.id === id && n <= s.wonAt.actions) || s.endedIds.has(id)) { s.acked = { id, actions: n }; return; }
    return halt(s, 'ended', id, stored);
  }
  if (/not a run recipe|too large|too many/.test(err)) return halt(s, 'invalid', id, null);
  // offline / 5xx / 'slow down': keep it and retry with backoff
  s.dirty = true;
  schedule(s, s.backoff, true);
  s.backoff = Math.min(RETRY_MAX_MS, s.backoff * 2);
}
function halt(s, why, id, stored) {
  s.halted = { id, why };
  s.dirty = false;
  if (s.account && stored) s.account = { ...s.account, run: s.account.run && s.account.run.id === stored.id ? s.account.run : null };
  s.offer = null; // the next main menu re-reads the account
  try { if (s.onHalt) s.onHalt(why, { stored }); } catch (e) { /* ignore */ }
}

/** The run finished on this device ('won' | 'lost' | 'abandoned'): clear the account's copy (that run only). */
export function endedRun(outcome, recipe) {
  const s = st;
  if (!alive(s) || !recipe) return;
  const id = runIdOf(recipe), n = actionsOf(recipe);
  if (!id) return;
  if (outcome !== 'won') s.endedIds.add(id);
  if (outcome === 'won') s.wonAt = { id, actions: n };
  else if (s.recipe && runIdOf(s.recipe) === id) { s.recipe = null; s.dirty = false; clearTimeout(s.timer); s.timer = null; }
  if (outcome !== 'won') writeJSON(META_KEY, null);
  if (!signedIn(s)) return;
  // (a refused copy is not ours to clear: another run holds the slot, or another device is further along in this one)
  if (s.halted && s.halted.id === id) return;
  if (outcome === 'won') { s.acked = { id, actions: n }; s.dirty = false; }
  writeJSON(PENDING_KEY, { user: s.me, clear: { id, outcome, actions: n } });
  if (s.account && s.account.run && s.account.run.id === id) s.account = { ...s.account, run: null, ended: [...(s.account.ended || []), { id, actions: n, outcome }] };
  s.offer = null;
  flushClear(s);
}
async function flushClear(s) {
  if (!alive(s) || !signedIn(s) || !s.net.clearRun || s.clearing) return;
  const p = readJSON(PENDING_KEY);
  if (!p || !p.clear || p.user !== s.me) return;
  s.clearing = true;
  let r = null;
  try { r = await s.net.clearRun(p.clear); } catch (e) { r = { error: 'offline' }; }
  s.clearing = false;
  if (!alive(s)) return;
  if (typeof (r && r.rev) === 'number') s.rev = r.rev;
  const cur = readJSON(PENDING_KEY);
  const same = cur && cur.clear && cur.clear.id === p.clear.id && cur.clear.outcome === p.clear.outcome;
  if (r && (r.ok || r.error === 'other' || r.error === 'behind' || r.error === 'bad run id')) { if (same) writeJSON(PENDING_KEY, null); else if (cur) flushClear(s); return; }
  setTimeout(() => flushClear(s), s.backoff); // offline: retried (and at the next boot, before anything is offered)
}

/** Debug / tests. */
export const runSyncState = () => (st ? { me: st.me, fetched: st.fetched, rev: st.rev, dirty: st.dirty, inflight: st.inflight, halted: st.halted, acked: st.acked, pushes: st.pushes || 0, wonAt: st.wonAt, flags: { ...st.flags }, offer: offer(), pendingClear: readJSON(PENDING_KEY) } : null);
/** Re-read the account (the main menu does this when it opens again). */
export async function reload() { const s = st; if (!alive(s) || !signedIn(s)) return offer(); await flushClear(s); await refresh(s); return offer(); }

try {
  // leaving: one last push (keepalive when it fits); hidden (a phone switching apps): push now
  addEventListener('pagehide', () => { const s = st; if (alive(s) && s.dirty && !s.inflight) push(s, { keepalive: true }); });
  addEventListener('visibilitychange', () => { const s = st; if (alive(s) && document.visibilityState === 'hidden' && s.dirty) push(s); });
  addEventListener('online', () => { const s = st; if (alive(s) && s.dirty) { s.backoff = RETRY_MIN_MS; schedule(s, 0, true); } });
} catch (e) { /* no window */ }
