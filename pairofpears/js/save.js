// save.js — this device's Pair of Pears save: the run in progress (resumed on the exact
// frame after a reload) and a few lifetime stats, in ONE localStorage row. The key is on the
// magepunk_ prefix, so site/account_silo.js keeps each signed-in account's save its own.
//
//   magepunk_pears_v1      {v, ts, run: <pear.serialize()> | null, stats: {runs, wins, bestLevel}, ...}
//   magepunk_pears_prev_v1 the save as this page found it: copied BEFORE a write whenever the stored
//                          save is not the one this page last wrote (the first write of a session, or
//                          another build / tab wrote it meanwhile); rollback() puts it back
//   magepunk_pears_bad_v1  a save that would not parse, kept as it was (never overwritten blind)
//
// Writes keep every field they don't know (an older or newer build's data rides along
// untouched), so a save is never wiped or migrated: a run that can't be restored is simply
// not offered.
export const SAVE_KEY = 'magepunk_pears_v1';
export const PREV_KEY = 'magepunk_pears_prev_v1';
export const BAD_KEY = 'magepunk_pears_bad_v1';
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
