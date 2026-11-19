// save.js — this device's Pair of Pears save: the run in progress (resumed on the exact
// frame after a reload) and a few lifetime stats, in ONE localStorage row. The key is on the
// magepunk_ prefix, so site/account_silo.js keeps each signed-in account's save its own.
//
//   magepunk_pears_v1      {v, ts, run: <pear.serialize()> | null, stats: {runs, wins, bestLevel}, ...}
//   magepunk_pears_prev_v1 the save as this page found it: copied BEFORE a write whenever the stored
//                          save is not the one this page last wrote (the first write of a session, or
//                          another build / tab wrote it meanwhile); rollback() puts it back
//   magepunk_pears_bad_v1  a save that would not parse, kept as it was (never overwritten blind)
//   magepunk_pears_replays_v1  the last 10 finished runs' replays [{seed, actions, level, won, hearts, berries, stars, when}]
//                          (a replay is the run's recipe: pear.js replay(seed, actions); shared as ?replay=<seed>.<actions>)
//
// Writes keep every field they don't know (an older or newer build's data rides along
// untouched), so a save is never wiped or migrated: a run that can't be restored is simply
// not offered.
export const SAVE_KEY = 'magepunk_pears_v1';
export const PREV_KEY = 'magepunk_pears_prev_v1';
export const BAD_KEY = 'magepunk_pears_bad_v1';
export const REPLAYS_KEY = 'magepunk_pears_replays_v1';
const MAX_REPLAYS = 10;
const SEED_RE = /^[A-Za-z0-9_-]{1,24}$/, ACTS_RE = /^[A-Za-z0-9_-]{1,6000}$/;   // (the server's cap: SOLO_REPLAY_RE.pears)
export const SAVE_VERSION = 1;

const raw = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };

let lastWritten = null;   // the row this page last wrote
/** The parsed save ({} when there is none). A save that won't parse is copied to BAD_KEY first. */
export function readSave() {
	const r = raw(SAVE_KEY);
	if (r == null) return {};
	try {
		const o = JSON.parse(r);
		if (o && typeof o === 'object' && !Array.isArray(o)) return o;
	} catch (e) { /* below */ }
	if (raw(BAD_KEY) !== r) put(BAD_KEY, r);
	return {};
}
function write(patch) {
	const r = raw(SAVE_KEY);
	if (r != null && r !== lastWritten) put(PREV_KEY, r);   // not ours: it is the rollback point
	const cur = readSave();
	const next = JSON.stringify({ ...cur, ...patch, v: Math.max(SAVE_VERSION, +cur.v || 0), ts: Date.now() });
	const ok = put(SAVE_KEY, next);
	if (ok) lastWritten = next;
	return ok;
}

/** The saved run (an object for pear.restore) or null. */
export function loadRun() {
	const s = readSave();
	return s.run && typeof s.run === 'object' ? s.run : null;
}
export function saveRun(serialized) { return write({ run: serialized || null }); }
export function clearRun() { return write({ run: null }); }

export function stats() {
	const s = readSave().stats || {};
	return { runs: +s.runs || 0, wins: +s.wins || 0, bestLevel: +s.bestLevel || 0 };
}
/** Count a finished run (won = the harvest was completed). */
export function recordRun(level, won) {
	const s = stats();
	return write({ stats: { runs: s.runs + 1, wins: s.wins + (won ? 1 : 0), bestLevel: Math.max(s.bestLevel, level | 0) } });
}
/** Put back the save as it was before this page first wrote it (false: nothing to roll back to). */
export function rollback() {
	const p = raw(PREV_KEY);
	if (p == null) return false;
	return put(SAVE_KEY, p);
}

// ---------- replays (finished runs on this device; the run is its recipe, so a replay is tiny) ----------
export function listReplays() {
	let l = null;
	try { l = JSON.parse(raw(REPLAYS_KEY) || 'null'); } catch (e) { l = null; }
	return Array.isArray(l) ? l.filter((x) => x && SEED_RE.test(String(x.seed)) && ACTS_RE.test(String(x.actions))) : [];
}
/** Keep a finished (or abandoned) run's replay: r = {seed, actions, level, won, hearts, berries, stars}. */
export function addReplay(r) {
	if (!r || !SEED_RE.test(String(r.seed)) || !ACTS_RE.test(String(r.actions))) return false;
	const list = listReplays().filter((x) => !(x.seed === r.seed && x.actions === r.actions));
	list.unshift({ seed: r.seed, actions: r.actions, level: r.level | 0, won: !!r.won, hearts: +r.hearts || 0, berries: +r.berries || 0, stars: +r.stars || 0, when: Date.now() });
	return put(REPLAYS_KEY, JSON.stringify(list.slice(0, MAX_REPLAYS)));
}
/** ?replay=<seed>.<actions> */
export const replayParam = (seed, actions) => String(seed) + '.' + String(actions || '');
export function parseReplayParam(p) {
	const m = /^([A-Za-z0-9_-]{1,24})\.([A-Za-z0-9_-]{1,6000})$/.exec(String(p || '').trim());
	return m ? { seed: m[1], actions: m[2] } : null;
}
export const replayUrl = (seed, actions) => location.origin + '/pairofpears/?replay=' + replayParam(seed, actions);
