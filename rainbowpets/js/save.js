// save.js — this device's Rainbow Pets: the solo match in progress (its recipe: setup + actions, so a reload resumes it on
// the same move), the Painter's Path progress, the last team picked, a few stats, and the last finished matches' replays.
// The key is on the magepunk_ prefix, so site/account_silo.js keeps each signed-in account's save its own.
//
//   magepunk_rpets_v1          {v, ts, run: {setup, actions, mode, stage?} | null, path: {cleared: [stage id]}, team: [pet id],
//                              stats: {played, won}}
//   magepunk_rpets_prev_v1     the save as this page found it, copied before the first write of a session (a rollback point)
//   magepunk_rpets_replays_v1  the last 10 finished matches: [{p (the ?replay= param), won, how, players, turns, when}]
// Writes keep every field they don't know, so a save is never wiped or migrated.
export const SAVE_KEY = 'magepunk_rpets_v1';
export const PREV_KEY = 'magepunk_rpets_prev_v1';
export const REPLAYS_KEY = 'magepunk_rpets_replays_v1';
const MAX_REPLAYS = 10;
export const PARAM_MAX = 12000;   // (the server's cap: SOLO_REPLAY_RE.rpets in server/mp.mjs)
const PARAM_RE = /^[A-Za-z0-9_-]{8,12000}$/;

const raw = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
let lastWritten = null;
export function readSave() {
	try { const o = JSON.parse(raw(SAVE_KEY) || 'null'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
}
function write(patch) {
	const r = raw(SAVE_KEY);
	if (r != null && r !== lastWritten && raw(PREV_KEY) !== r) put(PREV_KEY, r);
	const next = JSON.stringify({ ...readSave(), ...patch, v: 1, ts: Date.now() });
	if (put(SAVE_KEY, next)) { lastWritten = next; return true; }
	return false;
}
export const loadRun = () => { const s = readSave().run; return s && s.setup && Array.isArray(s.actions) ? s : null; };
export const saveRun = (run) => write({ run: run || null });
export const clearRun = () => write({ run: null });
export const pathCleared = () => { const c = (readSave().path || {}).cleared; return Array.isArray(c) ? c.filter((x) => typeof x === 'string') : []; };
export const markCleared = (id) => { const c = pathCleared(); if (!c.includes(id)) c.push(id); return write({ path: { cleared: c } }); };
export const lastTeam = () => { const t = readSave().team; return Array.isArray(t) ? t.filter((x) => typeof x === 'string').slice(0, 5) : []; };
export const saveTeam = (t) => write({ team: t.slice(0, 5) });
export const stats = () => { const s = readSave().stats || {}; return { played: +s.played || 0, won: +s.won || 0 }; };
export const recordMatch = (won) => { const s = stats(); return write({ stats: { played: s.played + 1, won: s.won + (won ? 1 : 0) } }); };

// ---------------------------------------------------------------- replays (?replay=<param>)
// A match is its setup and its actions, packed small: each action a short array, the whole as base64url JSON.
const PACK = { paint: (a) => ['p', a.pet, a.slot, a.card], move: (a) => ['m', a.pet], throw: (a) => ['t', a.from, a.slot, a.to, a.toSlot], extra: (a) => ['x', a.pet, a.spot],
	heal: (a) => ['h', a.pet, a.card], pass: () => ['.'], let: () => ['l'], paper: (a) => ['n', a.card], concede: () => ['c'] };
const UNPACK = { p: (x) => ({ t: 'paint', pet: x[1], slot: x[2], card: x[3] }), m: (x) => ({ t: 'move', pet: x[1] }), t: (x) => ({ t: 'throw', from: x[1], slot: x[2], to: x[3], toSlot: x[4] }),
	x: (x) => ({ t: 'extra', pet: x[1], spot: x[2] }), h: (x) => ({ t: 'heal', pet: x[1], card: x[2] }), '.': () => ({ t: 'pass' }), l: () => ({ t: 'let' }), n: (x) => ({ t: 'paper', card: x[1] }), c: () => ({ t: 'concede' }) };
const SEATS = 'abcd';
const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))));
/** { setup, actions: [[seat, action]] } -> a ?replay= param (null if it would be too long). */
export function packReplay(rec) {
	const s = rec.setup, out = { v: 1, s: { seed: s.seed, o: Object.keys(s.opts || {}).filter((k) => s.opts[k]), p: s.seats.map((x) => [x.name, x.pets, x.cpu || 0]), ...(s.tagTeam ? { t: 1 } : {}) },
		a: rec.actions.map(([seat, a]) => [SEATS.indexOf(seat), ...(PACK[a.t] ? PACK[a.t](a) : ['.'])]) };
	const p = b64(JSON.stringify(out));
	return p.length <= PARAM_MAX ? p : null;
}
/** A ?replay= param -> { setup, actions } or null. */
export function unpackReplay(p) {
	if (!PARAM_RE.test(String(p || ''))) return null;
	try {
		const o = JSON.parse(unb64(String(p)));
		if (!o || o.v !== 1 || !o.s || !Array.isArray(o.s.p) || !Array.isArray(o.a)) return null;
		const opts = {}; for (const k of o.s.o || []) opts[String(k)] = true;
		const setup = { seed: String(o.s.seed || ''), opts, ...(o.s.t === 1 ? { tagTeam: true } : {}), seats: o.s.p.map((x) => ({ name: String(x[0] || ''), pets: Array.isArray(x[1]) ? x[1].map(String) : [], ...(x[2] ? { cpu: x[2] } : {}) })) };
		const actions = o.a.filter((x) => Array.isArray(x) && SEATS[x[0]] && UNPACK[x[1]]).map((x) => [SEATS[x[0]], UNPACK[x[1]](x.slice(1))]);
		return { setup, actions };
	} catch (e) { return null; }
}
export function listReplays() {
	try { const l = JSON.parse(raw(REPLAYS_KEY) || '[]'); return Array.isArray(l) ? l.filter((x) => x && PARAM_RE.test(String(x.p))) : []; } catch (e) { return []; }
}
export function addReplay(r) {
	if (!r || !PARAM_RE.test(String(r.p))) return false;
	const list = listReplays().filter((x) => x.p !== r.p);
	list.unshift({ p: r.p, won: !!r.won, how: String(r.how || ''), players: (r.players || []).slice(0, 4).map(String), turns: r.turns | 0, when: Date.now() });
	return put(REPLAYS_KEY, JSON.stringify(list.slice(0, MAX_REPLAYS)));
}
export const replayUrl = (p) => location.origin + '/rainbowpets/?replay=' + p;
