// mm/replay.js — a Mystery Maze run as a RECIPE (owner, 2026-11-23: spectating and replays are required). The run is
// exact (mm/turn.js), so it is
//   { v, kind: 'mm', rev, seed, dungeon (a mm/dungeons.js id), party: [slimmed figurine], bag, stars, acts (packed), n (how
//     many actions), floor, over?, label }
// and is re-run to any action. The same recipe is a replay (the site's tape store) and a resume (this device's saved
// run). A live broadcast is NOT the recipe: a spectator is sent only what the player sees (turn.js view), never the seed.
// Actions are packed into a string: a step is its direction's digit; wait, attack, stairs, take, pay and give up are a
// letter each; anything with more to say (a move, an item, a turn on the spot, a tactic) is its JSON in braces.
// Pure: node-tested (overworld/tests/poketactica_mm_replay_test.mjs).
import { slimFig } from '../replay.js';
import * as MM from './turn.js';
import { dungeonById, dungeonAt } from './dungeons.js';
import { ITEMS, BAG_MAX } from './items.js';

export const MM_REPLAY_V = 1, MM_ACTS_MAX = 60000, MM_PACKED_MAX = 400000;
const LETTER = { pass: 'p', attack: 'a', stairs: 's', quit: 'q', take: 't', pay: 'y' }, WORD = Object.fromEntries(Object.entries(LETTER).map(([k, v]) => [v, k]));

/** The leader's actions as a short string. */
export function packActs(acts) {
	let out = '';
	for (const a of acts) {
		if (a.t === 'step' && Number.isInteger(a.d) && a.d >= 0 && a.d < 8) out += a.d;
		else if (LETTER[a.t] && Object.keys(a).length === 1) out += LETTER[a.t];
		else out += JSON.stringify(a);
	}
	return out;
}
/** ... and back. -> the actions, or null when the string is not one packActs made. */
export function unpackActs(str) {
	if (typeof str !== 'string') return null;
	const out = [];
	for (let i = 0; i < str.length; i++) {
		const c = str[i];
		if (c >= '0' && c <= '7') out.push({ t: 'step', d: +c });
		else if (WORD[c]) out.push({ t: WORD[c] });
		else if (c === '{') {
			const j = str.indexOf('}', i);
			if (j < 0) return null;
			try { const a = JSON.parse(str.slice(i, j + 1)); if (!a || typeof a.t !== 'string') return null; out.push(a); } catch { return null; }
			i = j;
		} else return null;
		if (out.length > MM_ACTS_MAX) return null;
	}
	return out;
}

/**
 * A figurine as a run carries it: slim, but with EVERY move it knows (a battle's recipe keeps only the moves it has on;
 * in the maze it may change them: MM_RULES_REV 13).
 */
export const mmFig = (f) => ({ ...slimFig(f), pool: (f.pool || []).filter((p) => p && typeof p.id === 'string').slice(0, MM_POOL_MAX).map((p) => ({ id: p.id, lv: p.lv || 1, xp: 0 })) });
export const MM_POOL_MAX = 160;
/** The recipe of a run so far (or of a finished one). S: the run as it stands (for the floor and the end), or null. */
export function mmRecipe({ seed, dungeonId, party, bag = [], stars = 0, acts, S = null, ch = null, kit = null }) {
	const d = dungeonById(dungeonId), floor = S ? S.floorNo : 1;
	// (rev: the rules THE RUN is played by, not today's. A run begun under older rules and resumed after an update is
	// still that older run: stamped with today's revision its replay, and its next resume, would rebuild floors it never saw.)
	// (ch: the challenge rules the run was begun with, rules 24)
	return { v: MM_REPLAY_V, kind: 'mm', rev: (S && S.rev) || MM.MM_RULES_REV, seed: String(seed), dungeon: dungeonId, party: party.map(mmFig), bag: bag.map((it) => ({ id: it.id, ...(it.n > 1 ? { n: it.n } : {}), ...(it.sticky ? { sticky: true } : {}) })),
		stars: Math.max(0, stars | 0), ...(MM.cleanCh((S && S.ch) || ch).length ? { ch: MM.cleanCh((S && S.ch) || ch) } : {}), acts: packActs(acts), n: acts.length, floor, ...(S && S.over ? { over: { ...S.over } } : {}), ...(cleanKit(kit).length ? { kit: cleanKit(kit) } : {}),
		label: ('Mystery Maze · ' + (d ? d.name : dungeonId) + ' · B' + floor + 'F').slice(0, 64) };
}
/** The Abyss kit a run began with (dungeons.js abyssKit): item ids, the page's note of what must not be carried out. Not part of the rules. */
export const cleanKit = (k) => (Array.isArray(k) ? k.filter((id) => typeof id === 'string' && ITEMS[id]).slice(0, 8) : []);
export function validMmRecipe(r) {
	if (!r || r.kind !== 'mm' || r.v !== MM_REPLAY_V || typeof r.seed !== 'string' || !r.seed || !dungeonById(r.dungeon)) return false;
	const figOk = (f) => f && typeof f.species === 'string' && Number.isInteger(f.level) && Array.isArray(f.equipped) && f.equipped.length > 0 && Array.isArray(f.pool) && f.pool.length <= MM_POOL_MAX;
	if (!Array.isArray(r.party) || !r.party.length || r.party.length > MM.MM_PARTY_MAX || !r.party.every(figOk)) return false;
	if (!Array.isArray(r.bag) || r.bag.length > BAG_MAX || !r.bag.every((it) => it && ITEMS[it.id])) return false;
	if (!Number.isInteger(r.stars) || r.stars < 0 || !Number.isInteger(r.n) || r.n < 0 || r.n > MM_ACTS_MAX) return false;
	if (typeof r.acts !== 'string' || r.acts.length > MM_PACKED_MAX) return false;
	if (r.ch !== undefined && !(Array.isArray(r.ch) && r.ch.length <= MM.CHALLENGE_IDS.length && r.ch.every((id) => MM.CHALLENGES[id]))) return false;
	const acts = unpackActs(r.acts);
	return !!acts && acts.length === r.n;
}
/** A fresh run from a recipe's head (before any action). */
// (the dungeon as that run knew it: a run saved before a dungeon changed re-runs on the floors it was played on)
export const mmNewRun = (r, data) => MM.newRun(r.seed, { dungeon: dungeonAt(r.dungeon, r.rev || 1), party: r.party, bag: r.bag, stars: r.stars, rev: r.rev || 1, ...(r.ch ? { ch: r.ch } : {}) }, data);
/**
 * Drives a run from a recipe's actions, one at a time.
 *   d.S               the run             d.k        how many actions have been played
 *   d.step()          play the next action -> its events (null at the end)
 *   d.to(k, onEv?)    play on to action k (never back)       d.floorStart(n) -> the action index at which floor n began, once passed
 */
export function mmDriver(r, data) {
	const acts = unpackActs(r.acts) || [];
	const d = { S: mmNewRun(r, data), k: 0, acts, floors: { 1: 0 } };
	d.step = () => {
		if (d.k >= acts.length || d.S.over) return null;
		const ev = MM.act(d.S, acts[d.k++], data);
		if (d.floors[d.S.floorNo] == null) d.floors[d.S.floorNo] = d.k;
		return ev;
	};
	d.to = (k, onEv) => { while (d.k < Math.min(k, acts.length) && !d.S.over) { const ev = d.step(); if (onEv && ev) onEv(ev, d.S); } return d.S; };
	d.floorStart = (n) => d.floors[n];
	d.done = () => d.k >= acts.length || !!d.S.over;
	return d;
}
/** The run a recipe describes, after `k` actions (all of them when not given). */
export const mmRunTo = (r, k, data) => mmDriver(r, data).to(k == null ? Infinity : k);
