// events.js — the weekly event (owner's second improvement list, 2026-11-18, "yes to all": "Weekly events. One special
// rule each week, like 'Basic Pokémon only', 'start with 3 Energy' or 'one type only'. Solo event battles would pay a
// special reward"). Pure. The week (UTC, Monday to Sunday) picks one rule for everyone; three event battles against
// Pocket's own decks that keep the rule; each battle's first win of the week pays a pack's stars, once (the solo progress
// notes it paid as 'e:<week>:<battle>', synced and merged like a solo battle's clear, and counted at one pack by
// solo.js paidTwice). A rule is a check on a deck and/or the match's options (engine.js opts: points, singles).
import { card, CARDS } from './data/cards.js';
import { THEME_DECKS } from './data/theme_decks.js';
import { STARTERS, starterDeck } from './decks.js';
import { finishDeck } from './deckhelp.js';
import * as E from './engine/engine.js';

const mons = deck => deck.map(card).filter(c => c && c.kind === 'pokemon');
export const EVENTS = Object.freeze([
	{ id: 'basics', name: 'Basic Training', rule: 'Basic Pokémon only: no evolutions in your deck.', card: c => c.kind !== 'pokemon' || c.stage === 0, deck: (d) => (mons(d).some(c => c.stage > 0) ? 'this week, Basic Pokémon only' : null) },
	{ id: 'mono', name: 'True Colours', rule: 'One Energy type only.', deck: (d, e) => (e.length !== 1 ? 'this week, one Energy type only' : null) },
	{ id: 'noex', name: 'No ex', rule: 'No Pokémon ex in your deck.', card: c => !c.ex, deck: (d) => (mons(d).some(c => c.ex) ? 'this week, no Pokémon ex' : null) },
	{ id: 'sprint', name: 'Sprint', rule: 'The first to 2 points wins (not 3).', opts: { points: 2 } },
	{ id: 'solo', name: 'One on One', rule: 'Singles: one Active Pokémon each.', opts: { singles: true } },
	{ id: 'apex', name: 'Genetic Apex Cup', rule: 'Genetic Apex cards only.', card: c => c.set === 'A1', deck: (d) => (d.some(id => !card(id) || card(id).set !== 'A1') ? 'this week, Genetic Apex cards only' : null) },
	{ id: 'notrainer', name: 'Pokémon Only', rule: 'No Trainer cards in your deck.', card: c => c.kind === 'pokemon' || !!(c.fx && c.fx.k === 'fossil'), deck: (d) => (d.some(id => card(id) && card(id).kind !== 'pokemon' && !(card(id).fx && card(id).fx.k === 'fossil')) ? 'this week, no Trainer cards' : null) },
].map(e => Object.freeze(e)));
export const EVENT_BATTLES = 3;

const DAY = 86400000, MONDAY0 = Date.UTC(2024, 0, 1);   // (1 Jan 2024 was a Monday: weeks are counted from it)
/** The week a moment falls in: its number (from MONDAY0) and a key 'w<number>'. */
export const weekOf = now => { const n = Math.floor((now - MONDAY0) / (7 * DAY)); return { n, key: 'w' + n, ends: MONDAY0 + (n + 1) * 7 * DAY }; };
/** This week's event. */
export const eventOf = now => EVENTS[((weekOf(now).n % EVENTS.length) + EVENTS.length) % EVENTS.length];
/** Why a deck does not keep the event's rule, or null. */
export const eventDeckError = (ev, deck, energy) => (ev.deck ? ev.deck(deck, energy) : null);
/** The decks the event battles are played against: Pocket's own that keep the rule, three chosen by the week. */
export function eventOpponents(ev, week) {
	const all = [...STARTERS.map(s => ({ name: s.name, ...starterDeck(s.id) })), ...THEME_DECKS.map(t => ({ name: t.name, deck: t.cards.slice(), energy: t.energy.slice() }))].filter(d => !eventDeckError(ev, d.deck, d.energy));
	let h = 0; for (const ch of week.key + ev.id) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
	if (all.length >= EVENT_BATTLES) return Array.from({ length: EVENT_BATTLES }, (_, i) => all[(h + i * 7919) % all.length]);
	// too few of Pocket's own keep the rule: decks built by the deck helper from the cards the rule allows, a type each
	const TYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'], allowed = new Set(CARDS.filter(c => !ev.card || ev.card(c)).map(c => c.id)), built = [];
	for (let k = 0; k < TYPES.length && built.length < EVENT_BATTLES; k++) {
		const t = TYPES[(h + k) % TYPES.length], d = finishDeck([], [t], id => (allowed.has(id) ? 2 : 0));
		if (!E.deckError(d.deck, d.energy) && !eventDeckError(ev, d.deck, d.energy)) built.push({ name: `${t} challenger`, deck: d.deck, energy: d.energy });
	}
	return built;
}
/** The match options the event plays with. */
export const eventOpts = ev => ({ ...(ev.opts || {}) });
/** The paid key of a battle of a week. */
export const eventKey = (week, i) => `e:${week.key}:${i}`;
