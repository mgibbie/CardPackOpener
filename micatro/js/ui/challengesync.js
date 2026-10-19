// Completed challenges (the ticks on the Challenges screen), per player, saved on the Magepunk account.
//   * localStorage 'micatro_challenges_v1:<user>' = {challengeId: first completion time} — the offline cache, as before.
//   * Signed in it is ACCOUNT-SAVED: micatro-challenges-get / -put (server/mp.mjs, row micatro_challenges:<user>). The
//     server MERGES each put (union; the earliest time per id), and so does the client, so a challenge completed on
//     one device shows on every other and nothing is ever un-completed. A push that fails is retried with backoff
//     (and on 'online' / a keepalive at 'pagehide'); the next boot's sync pushes anything still missing too.
//   * Guests keep localStorage only ('...:guest'). The first account that signs in on that browser takes the guest
//     ticks once (merged; 'micatro_challenges_guest_carried' remembers it, like the win stickers), so another account
//     signing in later never inherits them. Local data is never deleted.
const KEY = (u) => 'micatro_challenges_v1:' + (u || 'guest');
const GUEST_CARRIED_KEY = 'micatro_challenges_guest_carried';
const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const PUSH_DEBOUNCE_MS = 800, RETRY_MIN_MS = 2000, RETRY_MAX_MS = 60_000;

/** A stored / received map -> a clean {id: ts} (bad ids and times dropped). */
export function cleanDone(m) {
  const out = {};
  if (!m || typeof m !== 'object' || Array.isArray(m)) return out;
  for (const k of Object.keys(m)) if (ID_RE.test(k) && k !== '__proto__' && Number.isInteger(m[k]) && m[k] > 0) out[k] = m[k];
  return out;
}
/** a + b: the union, each id keeping its earliest time (the server's merge). */
export function mergeDone(a, b) {
  const out = cleanDone(a);
  const c = cleanDone(b);
  for (const k of Object.keys(c)) if (!out[k] || c[k] < out[k]) out[k] = c[k];
  return out;
}
/** Does `a` hold anything `b` lacks (an id it doesn't have, or an earlier time)? */
const ahead = (a, b) => Object.keys(a).some((k) => !b[k] || a[k] < b[k]);
const readLocal = (u) => { try { return cleanDone(JSON.parse(localStorage.getItem(KEY(u)) || '{}')); } catch (e) { return {}; } };
const writeLocal = (u, m) => { try { localStorage.setItem(KEY(u), JSON.stringify(m)); return true; } catch (e) { return false; } };

/** This player's completed challenges {id: ts} (the local cache; synced with the account when signed in). */
export function challengeDone(me) { return readLocal(me); }
/** A challenge was won: tick it (kept locally at once, then pushed to the account). */
export function markChallengeDone(me, id) {
  if (!ID_RE.test(String(id || ''))) return;
  const p = readLocal(me);
  if (p[id]) return;
  p[id] = Date.now();
  writeLocal(me, p);
  if (sess && !sess.dead && sess.user === (me || 'guest')) { sess.dirty = true; schedule(sess, PUSH_DEBOUNCE_MS); }
}

let sess = null;
/**
 * Load / sync this player's ticks. `account` (signed in): {fetch() -> {done}|{error}, push(done, {keepalive}) -> {done}|{error}}
 * (net.js fetchChallenges / saveChallenges); without it (a guest) they stay in this browser.
 */
export function initChallengeSync(username, account) {
  if (sess) { sess.dead = true; clearTimeout(sess.timer); }
  sess = null;
  const user = (username && String(username)) || 'guest';
  if (user === 'guest' || !account || typeof account.fetch !== 'function' || typeof account.push !== 'function') return null;
  // a guest's ticks in this browser move to the FIRST account that signs in here, once (never deleted)
  try {
    if (!localStorage.getItem(GUEST_CARRIED_KEY)) {
      const g = readLocal('guest');
      if (Object.keys(g).length && writeLocal(user, mergeDone(readLocal(user), g))) localStorage.setItem(GUEST_CARRIED_KEY, JSON.stringify({ to: user, at: Date.now() }));
    }
  } catch (e) { /* storage blocked: nothing to carry */ }
  sess = { user, account, dead: false, synced: false, dirty: false, inflight: false, timer: null, backoff: RETRY_MIN_MS };
  schedule(sess, 0);
  return sess;
}
function schedule(s, ms) {
  if (s.dead) return;
  clearTimeout(s.timer);
  s.timer = setTimeout(() => sync(s), ms);
}
async function sync(s) {
  if (s.dead || s.inflight) return;
  s.inflight = true;
  let ok = false;
  try {
    if (!s.synced) {
      const r = await s.account.fetch();
      if (s.dead) return;
      if (!r || r.error || !r.done) throw new Error('fetch');
      const local = readLocal(s.user);
      writeLocal(s.user, mergeDone(local, r.done));
      s.synced = true;
      if (ahead(local, cleanDone(r.done))) s.dirty = true; // this browser has ticks the account lacks
    }
    if (s.dirty) {
      s.dirty = false;
      const sent = readLocal(s.user);
      const r = await s.account.push(sent);
      if (s.dead) return;
      if (!r || r.error || !r.done) { s.dirty = true; throw new Error('push'); }
      const now = readLocal(s.user);
      writeLocal(s.user, mergeDone(now, r.done));
      if (ahead(now, cleanDone(r.done))) s.dirty = true; // ticked while the push was in flight
    }
    ok = true;
  } catch (e) { /* offline / server error: retried below; the local copy keeps the tick */ }
  finally { s.inflight = false; }
  if (s.dead) return;
  if (!ok) { schedule(s, s.backoff); s.backoff = Math.min(RETRY_MAX_MS, s.backoff * 2); return; }
  s.backoff = RETRY_MIN_MS;
  if (s.dirty) schedule(s, PUSH_DEBOUNCE_MS);
}
/** Debug / tests: the sync's state (null for a guest). */
export const challengeSyncState = () => (sess ? { user: sess.user, synced: sess.synced, dirty: sess.dirty, inflight: sess.inflight } : null);
try {
  addEventListener('pagehide', () => {
    const s = sess;
    if (s && !s.dead && s.dirty && !s.inflight) { try { s.account.push(readLocal(s.user), { keepalive: true }); } catch (e) { /* ignore */ } }
  });
  addEventListener('online', () => { const s = sess; if (s && !s.dead && (s.dirty || !s.synced)) { s.backoff = RETRY_MIN_MS; schedule(s, 0); } });
} catch (e) { /* no window */ }
