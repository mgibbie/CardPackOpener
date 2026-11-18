// draft.js — Draft (owner's second improvement list, 2026-11-18, "yes to all": "Draft and Sealed. Open a few packs on the
// spot, build a 20-card deck from only those cards, then play a short run against the computer"). Pure: the run's state
// and its rules; main.js draws it and plays its matches.
//   A run: pay the entry in stars, choose a booster, open DRAFT.PACKS of it on the spot (the POOL: these cards are for
//   this run only, they do not join the collection), build a 20-card deck from the pool (two of a name at most, never
//   more than the pool holds), play DRAFT.MATCHES matches against computer players whose decks are built the same way
//   from their own packs, and be paid by the wins (DRAFT.PAY), once, when the last match ends.
import { card } from './data/cards.js';
import { rollPack, printInfo, BOOSTERS, SPECIAL_PACKS } from './collection.js';
import { finishDeck } from './deckhelp.js';
import * as E from './engine/engine.js';

export const DRAFT = Object.freeze({ FEE: 200, PACKS: 8, MATCHES: 3, PAY: Object.freeze([50, 150, 300, 600]), VERSION: 1 });
// the boosters a draft can be of: the regular ones (a special pack, First Partners or a promo, holds too few cards for a deck)
export const DRAFT_BOOSTERS = Object.freeze(BOOSTERS.filter(b => !SPECIAL_PACKS[b.id]));

/** A seeded random (the run's own: the same seed opens the same packs and builds the same opponents). */
export function seeded(seed) {
	let a = 0; for (const ch of String(seed)) a = (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0;
	return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** The cards (ids) of `n` packs of a booster. */
export function openPool(booster, seed, n = DRAFT.PACKS) {
	const rand = seeded(seed), out = [];
	for (let i = 0; i < n; i++) for (const p of rollPack(booster, rand)) { const info = printInfo(p); if (info && card(info.card)) out.push(info.card); }
	return out;
}
/** How many of this card's NAME the pool holds (what a draft deck may use). */
export const poolCount = (pool, id) => { const n = card(id) && card(id).name; return n ? pool.filter(x => card(x).name === n).length : 0; };
/** A deck from a pool: the deck helper's, from these cards alone. A pool is spread over many types, so its Energy is the
 *  pool's two most-used Pokémon types (unless chosen), and what the helper leaves empty is filled with the pool's other
 *  cards (legal, if less suited): a draft deck is always 20 when the pool allows it. */
export function poolDeck(pool, deck = [], energy = []) {
	let en = energy.slice();
	if (!en.length) {
		const tally = new Map(); for (const id of pool) { const c = card(id); if (c.kind === 'pokemon' && c.cardType && c.cardType !== 'Colorless' && c.cardType !== 'Dragon') tally.set(c.cardType, (tally.get(c.cardType) || 0) + 1 + (c.ex ? 2 : 0)); }
		en = [...tally].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
		if (!en.length) en = ['Grass'];
	}
	const r = finishDeck(deck, en, id => poolCount(pool, id)), out = r.deck.slice(), added = r.added.slice();
	const byName = n => out.filter(x => card(x).name === n).length;
	// what is left: Basics first (a deck needs one), then the rest of the pool
	const rest = [...new Set(pool)].sort((x, y) => (card(y).kind === 'pokemon' && card(y).stage === 0 ? 1 : 0) - (card(x).kind === 'pokemon' && card(x).stage === 0 ? 1 : 0));
	for (const id of rest) { while (out.length < 20 && byName(card(id).name) < Math.min(2, poolCount(pool, id))) { out.push(id); added.push(id); } }
	return { deck: out, energy: r.energy, added };
}
/** Why a draft deck is not playable, or null: legal, and only cards the pool holds (as many as it holds). */
export function draftDeckError(pool, deck, energy) {
	const e = E.deckError(deck, energy); if (e) return e;
	const names = new Map(); for (const id of deck) { const n = card(id).name; names.set(n, (names.get(n) || 0) + 1); }
	for (const [n, k] of names) { const id = deck.find(x => card(x).name === n); if (k > poolCount(pool, id)) return `your packs hold ${poolCount(pool, id)} ${n}`; }
	return null;
}
/** A new run (the entry already paid). */
export function newRun(booster, seed) {
	if (!DRAFT_BOOSTERS.some(b => b.id === booster)) throw new Error('no such booster');
	const pool = openPool(booster, seed);
	return { v: DRAFT.VERSION, booster, seed: String(seed), pool, deck: [], energy: [], results: [], paid: 0 };
}
/** The computer player of match `i`: their own packs of the same booster, a deck built from them. */
export function opponent(run, i) {
	const pool = openPool(run.booster, run.seed + ':cpu' + i), d = poolDeck(pool);
	return { name: ['Draft rival', 'Draft ace', 'Draft champion'][i] || 'Draft rival', deck: d.deck, energy: d.energy };
}
export const wins = run => run.results.filter(r => r === 'won').length;
export const over = run => run.results.length >= DRAFT.MATCHES;
/** A match ended: its result noted; the run's stars once it is over -> { run, pay } (pay 0 until then, and once). */
export function recordResult(run, result) {
	if (over(run)) return { run, pay: 0 };
	const next = { ...run, results: [...run.results, result === 'won' ? 'won' : result === 'drawn' ? 'drawn' : 'lost'] };
	if (!over(next) || next.paid) return { run: next, pay: 0 };
	const pay = DRAFT.PAY[wins(next)] || 0;
	return { run: { ...next, paid: pay }, pay };
}
/** Whatever was stored: a run, or null. */
export function readRun(x) {
	if (!x || typeof x !== 'object' || x.v !== DRAFT.VERSION || !DRAFT_BOOSTERS.some(b => b.id === x.booster) || !Array.isArray(x.pool) || !x.pool.every(id => card(id))) return null;
	const deck = Array.isArray(x.deck) ? x.deck.filter(id => card(id)).slice(0, 20) : [], energy = Array.isArray(x.energy) ? x.energy.filter(t => typeof t === 'string').slice(0, 3) : [];
	const results = Array.isArray(x.results) ? x.results.filter(r => ['won', 'lost', 'drawn'].includes(r)).slice(0, DRAFT.MATCHES) : [];
	return { v: DRAFT.VERSION, booster: x.booster, seed: String(x.seed || ''), pool: x.pool.slice(0, 80), deck, energy, results, paid: Number.isInteger(x.paid) && x.paid > 0 ? x.paid : 0 };
}
