// ow_worldcast.js — the player's side of exploration spectating and replays (owner, 2026-11-19: "Live follow + replay:
// a friend can watch you walk around live (camera follows you, read-only, with your battles and minigames shown as they
// happen). Each play session is also recorded as a position/scene tape you can scrub through later.").
//
// 1. LIVE FOLLOW (publish-world / world-state in server/mp.mjs). Most of a session nobody watches, so it costs almost
//    nothing then: every WATCH_CHECK_MS, and only while signed in with a friend, the page asks the server how many
//    friends follow it (a read, no write). While one does, it sends the world snapshot below about once a second (only
//    when it changed, else a keep-alive every KEEP_MS), and the viewer (ow_follow.js, /overworld/?follow=<you>) draws it.
//    The world snapshot is { map, name, x, y, f, surf?, bike?, scene? } — scene is ow_scenes.js currentScene().
// 2. SESSION TAPES ("journeys"). From the page load until leaving (or J_IDLE_MS without a change) the same snapshot is
//    sampled four times a second and a frame is kept when it changed: { t, s } where s holds only the fields that
//    changed (the first frame holds them all). Kept on this device (the last MAX_JOURNEYS, a size cap well under 1 MB),
//    listed in START > REPLAYS beside the battle replays, played in the same read-only viewer as live follow
//    (/overworld/?journey=local:<key>); signed in, C shares one (owreplay-put, kind 'journey' -> /overworld/?journey=<id>).
import * as MP from '../battlecards/mpmode.js';
import { packString } from '../battlecards/codec.js';
import { player, world } from './ow_core.js';
import { S } from './ow_state.js';
import { currentScene } from './ow_scenes.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { MP_ON } from './main.js';

/** Where the player is and what is on their screen, as a friend's viewer needs it. */
export function worldSnapshot() {
	if (!world.current) return null;
	const s = { map: world.current.name, name: String((world.current.map && world.current.map.name) || '').slice(0, 32), x: player.tx, y: player.ty, f: player.facing || 'down' };
	if (player.surfing) s.surf = 1;
	if (player.biking) s.bike = 1;
	const sc = currentScene();
	if (sc) s.scene = sc;
	return s;
}

// ---- 1. live follow
export const WATCH_CHECK_MS = 10_000, KEEP_MS = 4000;
export const worldCast = { watchers: 0, watcherNames: [], seq: 0, lastJson: '', lastWrite: 0, lastCheck: 0, busy: false };
export async function worldCastTick(now = Date.now()) {
	const c = worldCast;
	if (!MP_ON || c.busy || S.loading || !world.current) return;
	if (typeof document !== 'undefined' && document.hidden) return;
	// no friends: nobody can follow (the friends poll fills S.friends)
	if (!Array.isArray(S.friends) || !S.friends.length) { c.watchers = 0; return; }
	let body;
	if (c.watchers > 0) {
		const snap = worldSnapshot(), j = JSON.stringify(snap);
		if (j === c.lastJson && now - c.lastWrite < KEEP_MS) return;
		if (j !== c.lastJson) c.seq++;
		body = { snapshot: snap, seq: c.seq }; c.lastJson = j;
	} else {
		if (now - c.lastCheck < WATCH_CHECK_MS) return;
		body = {};
	}
	c.lastCheck = now; c.busy = true;
	try {
		const r = await MP.call('publish-world', body);
		if (r && typeof r.watchers === 'number') {
			const was = c.watchers;
			c.watchers = r.watchers; c.watcherNames = Array.isArray(r.watcherNames) ? r.watcherNames : [];
			if (body.snapshot && r.wrote) c.lastWrite = now;
			if (!was && c.watchers) { c.lastJson = ''; c.lastWrite = 0; }   // (someone started following: send the board at once)
		}
	} catch (e) { /* the next tick tries again */ } finally { c.busy = false; }
}
export function startWorldCast() { setInterval(() => { worldCastTick(); }, 1000); }

// ---- 2. session tapes
export const JOURNEYS_KEY = 'magepunk_ow_journeys_v1';
export const MAX_JOURNEYS = 10, J_MAX_FRAMES = 3000, J_MAX_CHARS = 200_000, J_STORE_CHARS = 400_000;
export const J_SAMPLE_MS = 250, J_IDLE_MS = 30 * 60_000, J_GAP_MS = 3000, J_SAVE_MS = 15_000;
const FIELDS = ['map', 'name', 'x', 'y', 'f', 'surf', 'bike', 'scene'];
const ID_RE = /^[a-f0-9]{8,20}$/;
const same = (a, b) => a === b || (a && b && typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b));

/** The state after a tape's frames 0..i, for every i (a frame holds only what changed). */
export function foldFrames(frames) {
	const out = []; let st = {};
	for (const fr of frames || []) {
		st = { ...st };
		for (const k of FIELDS) if (fr && fr.s && Object.prototype.hasOwnProperty.call(fr.s, k)) { if (fr.s[k] == null) delete st[k]; else st[k] = fr.s[k]; }
		out.push(st);
	}
	return out;
}

let jrec = null;
export function journeyNow() { return jrec; }
function openJourney(now) {
	return { key: now.toString(36), when: now, t: 0, lastNow: now, lastActive: now, savedAt: now, frames: [], chars: 0, state: null, maps: [], id: null, idFrames: 0 };
}
export function journeyTick(now = Date.now()) {
	if (S.loading || !world.current) return;
	const w = worldSnapshot(); if (!w) return;
	if (jrec && now - jrec.lastActive > J_IDLE_MS) closeJourney();
	const prev = jrec && jrec.state, d = {};
	for (const k of FIELDS) {
		const a = prev ? prev[k] : undefined, b = w[k];
		if (!same(a, b)) { if (b == null) { if (prev && a != null) d[k] = null; } else d[k] = b; }
	}
	if (!Object.keys(d).length) return;
	if (!jrec) { jrec = openJourney(now); Object.assign(d, w); }   // (a tape's first frame holds everything)
	const t = jrec.frames.length ? jrec.t + Math.min(now - jrec.lastNow, J_GAP_MS) : 0;   // (a long pause plays as a short one)
	const fr = { t, s: d };
	jrec.frames.push(fr); jrec.t = t; jrec.lastNow = now; jrec.lastActive = now; jrec.state = w;
	jrec.chars += JSON.stringify(fr).length + 1;
	if (w.name && jrec.maps[jrec.maps.length - 1] !== w.name && jrec.maps.length < 40) jrec.maps.push(w.name);
	if (jrec.frames.length >= J_MAX_FRAMES || jrec.chars >= J_MAX_CHARS) closeJourney();   // (full: the next change starts the next tape)
	else if (now - jrec.savedAt >= J_SAVE_MS) saveJourney();
}
const worthKeeping = r => r && (r.frames.length >= 2 || r.frames.some(f => f.s && f.s.scene));
function journeyLabel(r) {
	const m = r.maps.filter(Boolean), first = m[0] || 'Somewhere', last = m[m.length - 1];
	return ('Journey · ' + first + (m.length > 1 ? ' → ' + last : '')).slice(0, 48);
}
function tapeOf(r) { return { v: 1, kind: 'journey', key: r.key, label: journeyLabel(r), when: r.when, dur: r.t, frames: r.frames, id: r.id, idFrames: r.idFrames }; }
/** Keep the session so far on this device (every J_SAVE_MS, when it closes, and when the page goes away). */
export function saveJourney() {
	const r = jrec; if (!r) return false;
	r.savedAt = Date.now();
	if (!worthKeeping(r)) return false;
	const l = listJourneys().filter(t => t.key !== r.key);
	return keepJourneys([tapeOf(r), ...l]);
}
export function closeJourney() { const r = jrec; if (!r) return; saveJourney(); jrec = null; }
let cache = { raw: null, list: [] };
export function listJourneys() {
	try {
		const raw = localStorage.getItem(JOURNEYS_KEY) || '[]';
		if (raw !== cache.raw) { const l = JSON.parse(raw); cache = { raw, list: Array.isArray(l) ? l.filter(t => t && Array.isArray(t.frames) && t.frames.length) : [] }; }
		return cache.list;
	} catch (e) { return []; }
}
function keepJourneys(list) {
	let l = list.slice(0, MAX_JOURNEYS);
	while (l.length > 1 && JSON.stringify(l).length > J_STORE_CHARS) l = l.slice(0, -1);   // (the oldest go first)
	try { localStorage.setItem(JOURNEYS_KEY, JSON.stringify(l)); return true; } catch (e) { return false; }
}
export function startJourneys() {
	setInterval(() => { try { journeyTick(); } catch (e) { /* a replay is never worth a crash */ } }, J_SAMPLE_MS);
	try { addEventListener('pagehide', () => { try { saveJourney(); } catch (e) { } }); } catch (e) { }
}
/** Signed in: put a journey on the account (a month, like the battle replays) -> its share link, or null. A journey
 *  still growing is uploaded again when it has new frames since the last time. */
export async function shareJourney(key) {
	if (!MP_ON) return null;
	if (jrec && jrec.key === key) saveJourney();
	const l = listJourneys(), t = l.find(x => x.key === key);
	if (!t) return null;
	if (!(t.id && ID_RE.test(t.id) && (t.idFrames || 0) >= t.frames.length)) {
		try {
			const code = await packString(JSON.stringify({ v: 1, kind: 'journey', label: t.label, when: t.when, dur: t.dur, frames: t.frames }));
			const r = await MP.call('owreplay-put', { code, meta: { label: t.label, kind: 'journey' } });
			if (!r || !ID_RE.test(String(r.id || ''))) return null;
			const n = t.frames.length;
			if (jrec && jrec.key === key) { jrec.id = r.id; jrec.idFrames = n; saveJourney(); }
			else { const l2 = listJourneys().map(x => x.key === key ? { ...x, id: r.id, idFrames: n } : x); keepJourneys(l2); }
			t.id = r.id;
		} catch (e) { return null; }
	}
	return location.origin + '/overworld/?journey=' + t.id;
}
