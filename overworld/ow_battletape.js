// ow_battletape.js — every overworld battle is kept as a REPLAY (owner, 2026-11-19: "make sure every single mode of every
// game type has spectation and replays"; the owner chose replays as SNAPSHOT TAPES: what the screen showed, step by step,
// played back — not a re-run of the battle, whose dice are not seeded).
//
// While a battle is on (a wild or trainer battle, a contest's or the Safari's, a Battle Frontier run, a live or mail match
// against a friend) the board is sampled four times a second and a frame is kept whenever it changed: the same snapshot a
// spectator is sent (ow_frontier.js factorySnapshot; pvpSnapshot below for a match against a friend). When it ends the tape
// is kept on this device (the last 20) and, signed in, on the account for a month (owreplay-put), which gives it a short
// link (/overworld/?owreplay=<id>) and lets the friends who watched it live watch it again. START > REPLAYS lists them;
// a tape plays in the battle spectator view (factoryspec.js playTape).
import * as MP from '../battlecards/mpmode.js';
import { packString, unpackString } from '../battlecards/codec.js';
import { battle, factorySpec, pvp } from './ow_core.js';
import { castable, factorySnapshot, battleLabel, frontier, noteReplay } from './ow_frontier.js';
import { drawVertical } from './ow_menus.js';
import { listJourneys, saveJourney, shareJourney } from './ow_worldcast.js';
import { saveBeforeLeave } from './ow_leaveguard.js';

export const TAPES_KEY = 'magepunk_ow_battle_tapes_v1';
export const MAX_TAPES = 20, MAX_FRAMES = 3000, SAMPLE_MS = 250, MAX_STORED_CHARS = 800_000;   // (a share of the browser's store: the save comes first, and party.js drops these to make room)
const ID_RE = /^[a-f0-9]{8,20}$/;
const MP_ON = () => { try { return MP.mpMode(); } catch (e) { return false; } };

/** A match against a friend, as a spectator would see it (the same shape as factorySnapshot's). */
export function pvpSnapshot() {
	const a = pvp.active; if (!a || !a.match || !Array.isArray(a.match.sides)) return null;
	const bottom = a.spectator ? 0 : a.mySide, top = 1 - bottom, sides = a.match.sides;
	const mon = (s, hp) => { const sd = sides[s], m = sd && sd.party && sd.party[sd.active]; return m ? { name: m.name, level: m.level, species: m.speciesId, curHP: Math.round(hp ?? m.curHP), maxHP: m.maxHP, status: m.status || null, types: m.types || [] } : null; };
	const team = s => ((sides[s] && sides[s].party) || []).map(m => ({ curHP: m.curHP, maxHP: m.maxHP }));
	const opp = sides[top] && sides[top].name;
	return { kind: 'pvp', facility: (a.async ? 'Mail battle' : 'Battle') + (opp ? ' vs ' + String(opp).slice(0, 24) : ''), me: mon(bottom, a.dispHP && a.dispHP[bottom]), foe: mon(top, a.dispHP && a.dispHP[top]), meTeam: team(bottom), foeTeam: team(top), msg: a.msg || '' };
}
const current = () => castable() ? factorySnapshot() : pvp.active && !pvp.active.spectator ? pvpSnapshot() : null;

// ---- the recorder
let rec = null;
export function tapeTick(now = Date.now()) {
	const s = current();
	if (s && !rec) rec = { start: now, frames: [], last: '', label: '', kind: s.kind || (frontier.active ? 'frontier' : 'battle') };
	if (!rec) return;
	if (s) {
		if (s.facility && !s.waiting) rec.label = s.facility;
		const j = JSON.stringify(s);
		if (j !== rec.last && rec.frames.length < MAX_FRAMES) { rec.frames.push({ t: now - rec.start, s }); rec.last = j; }
		return;
	}
	const done = rec; rec = null;
	if (done.frames.some(f => f.s && f.s.me && f.s.foe)) finishTape(done, now);   // (a battle seen on screen: even one that ended at once)
}
export function startTapes() { setInterval(() => { try { tapeTick(); } catch (e) { /* a replay is never worth a crash */ } }, SAMPLE_MS); }

// ---- the tapes on this device
export function listTapes() { try { const l = JSON.parse(localStorage.getItem(TAPES_KEY) || '[]'); return Array.isArray(l) ? l.filter(t => t && Array.isArray(t.frames)) : []; } catch (e) { return []; } }
function keepTapes(list) {
	let l = list.slice(0, MAX_TAPES);
	while (l.length > 1 && JSON.stringify(l).length > MAX_STORED_CHARS) l = l.slice(0, -1);   // (oldest go first)
	try { localStorage.setItem(TAPES_KEY, JSON.stringify(l)); return true; } catch (e) { return false; }
}
async function finishTape(r, now) {
	const tape = { v: 1, key: now.toString(36), kind: r.kind, label: r.label || 'Battle', when: now, dur: now - r.start, frames: r.frames, id: null };
	keepTapes([tape, ...listTapes()]);
	const id = await uploadTape(tape);
	if (id) { const l = listTapes(), t = l.find(x => x.key === tape.key); if (t) { t.id = id; keepTapes(l); } noteReplay(id); }
	return tape;
}
/** Signed in: the tape on the account for a month (a short link; friends who watched get it). -> its id, or null. */
export async function uploadTape(tape) {
	if (!MP_ON()) return null;
	try { const code = await packString(JSON.stringify({ v: 1, kind: tape.kind, label: tape.label, when: tape.when, dur: tape.dur, frames: tape.frames })), r = await MP.call('owreplay-put', { code, meta: { label: tape.label, kind: tape.kind } }); return r && ID_RE.test(String(r.id || '')) ? r.id : null; } catch (e) { return null; }
}
/** A tape kept on the account (anyone may watch it). -> the tape, or null. */
export async function fetchTape(id) {
	if (!ID_RE.test(String(id || ''))) return null;
	try { const r = await MP.call('owreplay-get', { id }); const t = r && r.code ? JSON.parse(await unpackString(r.code)) : null; return t && Array.isArray(t.frames) ? t : null; } catch (e) { return null; }
}

// ---- START > REPLAYS: the battles, and the journeys (whole play sessions: ow_worldcast.js), newest first
export const replayMenu = { open: false, idx: 0, flash: '' };
const when = t => { const d = new Date(t.when); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
/** Every replay START > REPLAYS lists: { ...tape, journey: bool }, newest first. */
export function replayEntries() {
	const j = listJourneys().map(t => ({ ...t, journey: true }));
	return [...j, ...listTapes()].sort((a, b) => (b.when || 0) - (a.when || 0));
}
export function openReplays() { replayMenu.open = true; replayMenu.idx = 0; replayMenu.flash = ''; }
export function replayKey(k) {
	const l = replayEntries(), n = l.length + 1;   // (+ BACK)
	if (k === 'ArrowUp') replayMenu.idx = (replayMenu.idx + n - 1) % n;
	if (k === 'ArrowDown') replayMenu.idx = (replayMenu.idx + 1) % n;
	if (k === 'x' || k === 'Escape') { replayMenu.open = false; return; }
	// C copies the short link of a replay kept on the account (a journey goes up to the account the first time)
	if (k === 'c') {
		const t = l[replayMenu.idx];
		const copy = url => { try { navigator.clipboard.writeText(url); replayMenu.flash = 'Link copied.'; } catch (e) { replayMenu.flash = url; } };
		if (t && t.journey) {
			if (!MP_ON()) { replayMenu.flash = 'Only kept on this device (sign in to share).'; return; }
			replayMenu.flash = 'Sharing…';
			shareJourney(t.key).then(url => { if (url) copy(url); else replayMenu.flash = 'That journey could not be shared right now.'; });
			return;
		}
		if (t && t.id) copy(location.origin + '/overworld/?owreplay=' + t.id); else replayMenu.flash = t ? 'Only kept on this device (sign in to share).' : '';
		return;
	}
	if (k === 'z' || k === 'Enter') {
		const t = l[replayMenu.idx];
		if (!t) { replayMenu.open = false; return; }
		replayMenu.open = false;
		// a journey plays in the read-only viewer, its own page (the game is saved first, like any page it leaves for)
		if (t.journey) { saveJourney(); try { saveBeforeLeave(); } catch (e) { } location.href = '/overworld/?journey=local:' + encodeURIComponent(t.key); return; }
		factorySpec.playTape(t, () => { replayMenu.open = true; });
	}
}
export function drawReplayMenu(W, H) {
	const l = replayEntries(), labels = [...l.map(t => `${t.journey ? '\u{1F9ED} ' : ''}${t.label}  ·  ${when(t)}${t.journey || t.id ? '' : '  (this device)'}`), 'BACK'];
	drawVertical(W, H, H / 480, 'REPLAYS', replayMenu.flash || (l.length ? 'Z = watch  ·  C = copy the link  ·  your battles and journeys' : 'Your battles and journeys are kept here to watch again.'), labels, Math.min(replayMenu.idx, labels.length - 1), 'replays');
}
