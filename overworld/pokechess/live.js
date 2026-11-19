// live.js — PokéChess spectating + replays (owner, 2026-11-19: "every mode of every game has live spectating
// and replays").
//
// Spectating reuses the site's generic single-player live channel (the one Scoundrel / Pair of Pears / Pocket
// Enhanced use), through Micatro's publisher / spectator loops (micatro/js/net.js):
//   publish-pokechess {snapshot?, label, seq, over, won, replay?} -> the player's view; presence 'pokechess:<label>'
//   pokechess-state   {username, seq}                             -> a FRIEND reads it (cap 10)
//
// Replays are a TAPE of what was shown, not a move list: a capture is decided by a real battle whose dice are not
// seeded, so re-running the moves could not rebuild the game. The tape is a list of views (the same view a spectator
// is sent): the starting board, the board after every move, and every step of every capture battle (both Pokémon,
// their HP, the message). A frame leaves the board out when it did not change since the frame before.
// The last 10 are kept in this browser; a signed-in player's finished game is also uploaded through the site's
// generic tape store (replay-put / replay-get: a packed 'G1.'/'R1.' code, 30 days, public to read) so a short
// link (/overworld/pokechess.html?replay=<id>) works and the game's spectators are offered it at the end.
// Nothing here throws into the game.
import * as MP from '/battlecards/mpmode.js';
import { startPublisher as micPublisher, startSpectate as micSpectate, mountChat } from '../../micatro/js/net.js';
import { packString, unpackString } from '../../battlecards/codec.js';
import { ChessBoard, KING } from './board.js';

export const isLoggedIn = () => MP.hasToken();
export const myName = () => MP.cachedState()?.username || null;
export { mountChat };
export const startPublisher = (getSnapshot, getLabel) => micPublisher(getSnapshot, getLabel, { action: 'publish-pokechess' });
export const startSpectate = (username, handlers) => micSpectate(username, { ...handlers, action: 'pokechess-state' });

export const TAPE_VERSION = 1;
const TAPE_FRAMES_MAX = 4000;   // a very long game (a few hundred plies + every battle step) stays well under this
const BATTLE_FRAMES_MAX = 150;  // steps kept from one capture battle (a stalling battle keeps its first 150 and its end)
const LOCAL_KEY = 'pokechess_replays_v1';
const LOCAL_MAX = 10;
export const REPLAY_ID_RE = /^[a-f0-9]{8,20}$/;
export const replayUrl = (id) => location.origin + '/overworld/pokechess.html?replay=' + encodeURIComponent(id);

// ---------------------------------------------------------------- views
// One piece as drawn: [piece, side, sprite, curHP, maxHP, name] (a King carries no Pokémon: [piece, side]).
function cellOf(p) {
	if (!p) return 0;
	const m = p.pokemon;
	if (!m) return [p.piece, p.side];
	return [p.piece, p.side, m.sprite || '', Math.max(0, Math.round(m.curHP)), m.maxHP, m.name || ''];
}
/** The 64 squares, row 1 first (a1..h1, a2..h2, ...). */
export function boardCells(board) {
	const out = [];
	for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) out.push(cellOf(board.board[r][c]));
	return out;
}
const monView = (m) => m ? { name: m.name || '', level: m.level || 0, sprite: m.sprite || '', curHP: Math.max(0, Math.round(m.curHP)), maxHP: m.maxHP } : null;
/** A capture battle as a spectator sees it: White's Pokémon, Black's, the message on screen, who attacked. */
export function battleView(battle, pending, WHITE) {
	const a = battle && battle.active;
	if (!a || !a.me || !a.foe) return null;
	return { w: monView(a.me), b: monView(a.foe), msg: String(a.msg || ''), atk: pending && pending.attacker ? pending.attacker.side === WHITE ? 'w' : 'b' : '' };
}
/** The whole view: what a spectator draws and what one replay frame holds. */
export function viewOf({ board, phase, message, battle, pending, WHITE, BLACK }) {
	if (!board) return null;
	return {
		v: TAPE_VERSION,
		board: boardCells(board),
		turn: board.turn,
		last: board.lastMove ? board.lastMove.slice() : null,
		cap: [board.capturedPieces[WHITE].length, board.capturedPieces[BLACK].length],
		phase: phase === 'gameover' || board.gameOver ? 'gameover' : phase === 'battle' ? 'battle' : phase === 'ai' ? 'ai' : 'player',
		result: board.gameOver ? board.result : null,
		msg: String(message || ''),
		bt: phase === 'battle' ? battleView(battle, pending, WHITE) : null,
	};
}
/** A board built back from a view (the scene draws it like the live one). */
export function boardFromView(v, WHITE, BLACK) {
	const b = new ChessBoard();
	const cells = Array.isArray(v && v.board) ? v.board : [];
	for (let i = 0; i < 64 && i < cells.length; i++) {
		const x = cells[i];
		if (!Array.isArray(x)) continue;
		const r = Math.floor(i / 8) + 1, c = (i % 8) + 1;
		const [piece, side, sprite, curHP, maxHP, name] = x;
		const pokemon = sprite || maxHP ? { sprite, curHP: +curHP || 0, maxHP: +maxHP || 1, name: name || '' } : null;
		b.board[r][c] = { piece, side, pokemon, isKing: piece === KING, hasMoved: true };
	}
	b.turn = v && v.turn === BLACK ? BLACK : WHITE;
	b.lastMove = v && Array.isArray(v.last) && v.last.length === 4 ? v.last.slice() : null;
	const cap = (v && v.cap) || [0, 0];
	b.capturedPieces = { [WHITE]: new Array(Math.max(0, cap[0] | 0)).fill(null), [BLACK]: new Array(Math.max(0, cap[1] | 0)).fill(null) };
	b.gameOver = !!(v && v.result);
	b.result = (v && v.result) || null;
	return b;
}

// ---------------------------------------------------------------- recording
// rec.add(view) keeps a view when it differs from the last one kept; rec.tape(meta) is the finished tape.
export function createRecorder() {
	const frames = [];
	let lastJson = '', lastBoardJson = '', battleFrames = 0, full = false;
	return {
		get frames() { return frames; },
		add(view) {
			if (!view || full) return false;
			const json = JSON.stringify(view);
			if (json === lastJson) return false;
			if (view.bt) { if (++battleFrames > BATTLE_FRAMES_MAX && view.phase === 'battle') return false; }
			else battleFrames = 0;
			if (frames.length >= TAPE_FRAMES_MAX - 1 && view.phase !== 'gameover') return false; // room is kept for the end
			if (frames.length >= TAPE_FRAMES_MAX) { full = true; return false; }
			lastJson = json;
			const bj = JSON.stringify(view.board);
			const f = { ...view };
			if (bj === lastBoardJson) delete f.board; // unchanged since the last frame
			lastBoardJson = bj;
			frames.push(f);
			return true;
		},
		tape(meta = {}) { return { v: TAPE_VERSION, game: 'pokechess', when: Date.now(), ...meta, frames: frames.slice() }; },
	};
}
/** The tape's frames as whole views (each with its board), or null when it is not a PokéChess tape. */
export function expandTape(tape) {
	if (!tape || typeof tape !== 'object' || tape.game !== 'pokechess' || !Array.isArray(tape.frames) || !tape.frames.length) return null;
	const out = [];
	let board = null;
	for (const f of tape.frames) {
		if (!f || typeof f !== 'object') return null;
		if (Array.isArray(f.board)) board = f.board;
		if (!board) return null;
		out.push({ ...f, board });
	}
	return out;
}
export const packTape = (tape) => packString(JSON.stringify(tape));
export async function unpackTape(code) {
	const text = await unpackString(String(code || ''));
	if (!text) return null;
	try { return JSON.parse(text); } catch { return null; }
}

// ---------------------------------------------------------------- the local list (last 10)
export function localReplays() {
	try { const a = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); return Array.isArray(a) ? a.filter(e => e && typeof e.code === 'string') : []; } catch { return []; }
}
export function saveLocalReplay(entry) {
	const list = localReplays();
	list.unshift(entry);
	// a full storage drops the oldest until it fits (the list is a convenience, never the game)
	for (let n = Math.min(list.length, LOCAL_MAX); n > 0; n--) {
		try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, n))); return true; } catch { /* too big: keep fewer */ }
	}
	return false;
}
export function setLocalReplayNet(when, id) {
	const list = localReplays();
	const e = list.find(x => x.when === when);
	if (!e) return;
	e.net = id;
	try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- the account copy
export async function uploadReplay(code) {
	if (!isLoggedIn()) return { error: 'not logged in' };
	try { const d = await MP.call('replay-put', { code: String(code || '') }); return d && REPLAY_ID_RE.test(String(d.id || '')) ? { ok: true, id: d.id } : { error: (d && d.error) || 'bad response' }; }
	catch { return { error: 'offline' }; }
}
export async function fetchReplay(id) {
	if (!REPLAY_ID_RE.test(String(id || ''))) return { error: 'bad id' };
	try { const d = await MP.call('replay-get', { id: String(id) }); return d && d.code ? { code: d.code } : { error: (d && d.error) || 'not found' }; }
	catch { return { error: 'offline' }; }
}
