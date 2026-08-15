// replayrec.js — record a tape of game-state snapshots during a match so recent
// games can be rewatched (replay.html).
//
// We store the ACTUAL states that happened — one frame per changed state,
// deduped by digest — NOT a seed + action log. That means replays are faithful
// for EVERY mode (solo / dungeon / heist / tombs / duels / arena / multiplayer)
// with zero dependence on RNG determinism (most modes seed with Math.random and
// couldn't be re-simulated). Playback just deserializes each frame back into a
// live state and hands it to game.js's existing renderer.
//
// Tapes are gzipped (snapshots are highly repetitive across frames) and kept in
// a small localStorage ring buffer, quota-guarded via safestore.
import * as E from './engine/index.js';
import * as MPX from './mpmode.js';
import { safeLoad, safeSave } from './safestore.js';
import { packString, unpackString } from './codec.js';

const KEY = 'magepunk_replays_v1';
const MAX_REPLAYS = 10;   // ring buffer of recent games
const MAX_FRAMES = 600;   // per-game safety cap (a long game is ~100-150 frames)

let tape = null, lastDigest = null;

// toSnapshot returns LIVE references (it clones only on JSON.stringify), so we
// must deep-copy each frame the instant we capture it — the state keeps mutating.
const freeze = obj => JSON.parse(JSON.stringify(obj));

export function startRecording(meta) { tape = { v: 1, meta: { ...(meta || {}) }, frames: [] }; lastDigest = null; }
export function isRecording() { return !!tape; }
export function cancel() { tape = null; lastDigest = null; }

// Capture the current state as a frame, if it changed since the last one.
// `caption` is a short human line for the scrubber (e.g. "Turn 4 — Player").
export function capture(state, caption) {
	if (!tape || !state || !Array.isArray(state.players) || tape.frames.length >= MAX_FRAMES) return;
	let dg = null; try { dg = E.stateDigest(state); } catch { /* unrenderable — skip digest */ }
	if (dg && dg === lastDigest) return; // nothing changed since last frame
	lastDigest = dg;
	try { tape.frames.push({ snap: freeze(E.toSnapshot(state)), cap: caption || '', turn: state.turnNumber | 0, cur: state.current | 0 }); } catch { /* skip a bad frame */ }
}

// Finalize + persist the tape. `extra` merges into meta (winner, result, etc.).
// Returns the new replay id, or null if the game was too short to keep.
export async function finish(extra) {
	const t = tape; tape = null; lastDigest = null;
	if (!t || t.frames.length < 2) return null;
	Object.assign(t.meta, extra || {});
	t.meta.frames = t.frames.length;
	t.meta.when = Date.now();
	return save(t);
}

function loadIndex() { const a = safeLoad(KEY, null); return Array.isArray(a) ? a : []; }

async function save(t) {
	let code;
	try { code = await packString(JSON.stringify(t)); } catch { return null; }
	const id = 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	const list = loadIndex();
	list.unshift({ id, meta: t.meta, code });   // plaintext meta for fast listing; code is the packed tape
	while (list.length > MAX_REPLAYS) list.pop();
	// quota-safe: if the write is rejected, drop the oldest replay and retry until it fits
	while (list.length && !safeSave(KEY, list)) list.pop();
	return id;
}

// Lightweight index for the list UI (no tape decode).
export function listReplays() { return loadIndex().map(({ id, meta }) => ({ id, meta })); }
export function deleteReplay(id) { safeSave(KEY, loadIndex().filter(r => r.id !== id)); }
export function clearReplays() { safeSave(KEY, []); }

// Decode a full tape ({ v, meta, frames:[{snap,cap,turn,cur}] }) for playback.
export async function getReplay(id) {
	const rec = loadIndex().find(r => r.id === id);
	if (!rec) return null;
	const json = await unpackString(rec.code);
	try { return json ? JSON.parse(json) : null; } catch { return null; }
}

// ---- sharing: the packed tape string is the portable "replay code" ----
// exportCode returns the stored packed string; importCode validates a pasted
// code and saves it locally under a fresh id (a copy), returning that id or null.
export function exportCode(id) { const rec = loadIndex().find(r => r.id === id); return rec ? rec.code : null; }
export async function importCode(code) {
	const json = await unpackString((code || '').trim());
	let tape = null; try { tape = json ? JSON.parse(json) : null; } catch { tape = null; }
	if (!tape || !Array.isArray(tape.frames) || !tape.frames.length) return null;
	tape.meta = { ...(tape.meta || {}), imported: true };
	return save(tape); // re-packs under a new id
}

// ---- server-backed share links (the packed tape is too big for a URL) ----
// uploadReplay pushes a local tape to the backend (login required — a logged-out
// caller gets null so the UI falls back to copying the code) and returns a short
// share id for the ?rshare= link. fetchSharedReplay pulls one back (public).
export async function uploadReplay(id) {
	if (!MPX.mpMode()) return null; // not logged in → caller copies the code instead (no 401/logout)
	const code = exportCode(id);
	if (!code) return null;
	try { const r = await MPX.call('replay-put', { code }); return (r && r.id) || null; } catch { return null; }
}
export async function fetchSharedReplay(shareId) {
	try {
		const r = await MPX.call('replay-get', { id: shareId });
		if (!r || !r.code) return null;
		const json = await unpackString(r.code);
		return json ? JSON.parse(json) : null;
	} catch { return null; }
}
