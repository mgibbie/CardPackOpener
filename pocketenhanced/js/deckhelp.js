// deckhelp.js — the deck builder's help (owner's second improvement list, 2026-11-18, "yes to all": "Deck builder help.
// 'Finish this deck for me' fills a half-built deck from cards you own, and a deck screen warns you about problems like too
// few Basic Pokémon or Energy that doesn't match the deck"). Pure: cards by id in, advice / a deck out. main.js deckBuilder.
import { card, CARDS } from './data/cards.js';
import { LIMITS } from './engine/engine.js';

const isBasic = c => !!c && (c.kind === 'pokemon' ? c.stage === 0 : !!(c.fx && c.fx.k === 'fossil'));
const isTrainer = c => !!c && c.kind !== 'pokemon';
const needs = c => [...new Set((c.attacks || []).flatMap(a => a.cost || []).filter(t => t !== 'Colorless'))];
/** Can this Pokémon use at least one of its attacks with this deck's Energy? (a Pokémon with no attacks: yes) */
const payable = (c, energy) => !(c.attacks || []).length || c.attacks.some(a => (a.cost || []).every(t => t === 'Colorless' || energy.includes(t)));
const best = c => Math.max(0, ...(c.attacks || []).map(a => a.damage || 0));
const strength = c => (c.hp || 0) + 2 * best(c) + (c.ex ? 50 : 0);

/** What to look at in a deck, worst first: short sentences (none for a deck with no problem the help knows of). */
export function deckAdvice(deck, energy) {
	const cards = (deck || []).map(card).filter(Boolean), out = [], names = new Set(cards.map(c => c.name));
	const mons = cards.filter(c => c.kind === 'pokemon'), basics = cards.filter(isBasic).length;
	if (cards.length && !basics) out.push('No Basic Pokémon yet: a deck needs at least one, and 5 or more is better.');
	else if (cards.length && basics < 4) out.push(`Only ${basics} Basic Pokémon: aim for 5 or more, so there is something to put down early and on the Bench.`);
	const seen = new Set();
	for (const c of mons) if (c.stage > 0 && c.evolvesFrom && !names.has(c.evolvesFrom) && !seen.has(c.name)) { seen.add(c.name); out.push(`${c.name} evolves from ${c.evolvesFrom}, which is not in the deck.`); }
	if (energy && energy.length) {
		const off = new Set();
		for (const c of mons) if (!payable(c, energy) && !off.has(c.name)) { off.add(c.name); out.push(`${c.name}'s attacks need ${needs(c).join(' or ')} Energy, and this deck makes ${energy.join(', ')}.`); }
		if (energy.length > 1) { const used = new Set(mons.flatMap(needs)); for (const t of energy) if (mons.length && !used.has(t)) out.push(`No Pokémon here uses ${t} Energy: one type fewer makes the right Energy come more often.`); }
	}
	if (cards.length >= 10 && !cards.some(isTrainer)) out.push('No Trainer cards: Poké Ball and Professor\'s Research help every deck.');
	return out;
}

// the Trainers a deck takes first (by name), when they are owned; Rare Candy only with a Stage 2 in the deck
const STAPLES = ["Professor's Research", 'Poké Ball', 'Rare Candy', 'Potion', 'X Speed', 'Giovanni', 'Sabrina', 'Cyrus', 'Red Card', 'Leaf'];
const POKEMON_TARGET = 13;

/**
 * Fill a deck to 20 from what the player owns: the missing earlier stages of its evolutions first, then the strongest
 * evolution lines of its Energy types, then the staple Trainers, then anything else owned that fits.
 * @param {string[]} deck  card ids already in it
 * @param {string[]} energy  its Energy types (none: chosen from its Pokémon, or from the type owned most)
 * @param {(id: string) => number} owned  how many cards of this one's NAME the player owns
 * @returns {{deck: string[], energy: string[], added: string[]}}
 */
export function finishDeck(deck, energy, owned) {
	const out = (deck || []).filter(id => card(id)).slice(), added = [];
	const byName = n => out.filter(id => card(id).name === n).length;
	const room = () => out.length < LIMITS.deck;
	const can = c => room() && byName(c.name) < LIMITS.copies && byName(c.name) < owned(c.id);
	const add = (c, n = 1) => { let k = 0; while (k < n && can(c)) { out.push(c.id); added.push(c.id); k++; } return k; };
	const ownedCards = CARDS.filter(c => owned(c.id) > 0);
	// the Energy: as chosen; else the type most of its Pokémon are; else the type the player owns the most strength in
	let en = (energy || []).slice();
	if (!en.length) {
		const tally = new Map(), bump = (t, n) => { if (t && t !== 'Colorless' && t !== 'Dragon') tally.set(t, (tally.get(t) || 0) + n); };
		for (const id of out) { const c = card(id); if (c.kind === 'pokemon') bump(c.cardType, 1000); }
		if (!tally.size) for (const c of ownedCards) if (c.kind === 'pokemon') bump(c.cardType, strength(c));
		const top = [...tally].sort((a, b) => b[1] - a[1])[0];
		en = top ? [top[0]] : ['Grass'];
	}
	const fits = c => c.kind === 'pokemon' ? payable(c, en) : true;
	// 1. what the deck's evolutions evolve from (again until nothing more: a Stage 2 needs its Stage 1 and that its Basic)
	for (let changed = true; changed && room();) {
		changed = false;
		for (const id of out.slice()) {
			const c = card(id); if (c.kind !== 'pokemon' || !c.stage || !c.evolvesFrom || byName(c.evolvesFrom)) continue;
			const pre = ownedCards.filter(x => x.name === c.evolvesFrom).sort((a, b) => strength(b) - strength(a))[0];
			if (pre && add(pre, Math.max(1, byName(c.name)))) changed = true;
		}
	}
	// 2. evolution lines of the deck's types, strongest top card first
	const lineOf = b => { const line = [b]; for (let cur = b; ;) { const next = ownedCards.filter(x => x.kind === 'pokemon' && x.evolvesFrom === cur.name && fits(x)).sort((p, q) => strength(q) - strength(p))[0]; if (!next) break; line.push(next); cur = next; } return line; };
	const lines = ownedCards.filter(c => c.kind === 'pokemon' && c.stage === 0 && (en.includes(c.cardType) || c.cardType === 'Colorless') && fits(c))
		.map(lineOf).sort((a, b) => strength(b[b.length - 1]) - strength(a[a.length - 1]) || b.length - a.length);
	const monCount = () => out.filter(id => card(id).kind === 'pokemon' || isBasic(card(id))).length;
	for (const line of lines) {
		if (monCount() >= POKEMON_TARGET || !room()) break;
		if (out.length + line.length * 2 > LIMITS.deck - 4 && line.length > 1) continue;   // (room for a few Trainers)
		for (const c of line) add(c, 2);
	}
	// 3. the staple Trainers
	const stage2 = out.some(id => card(id).stage === 2);
	for (const n of STAPLES) {
		if (!room()) break;
		if (n === 'Rare Candy' && !stage2) continue;
		const c = ownedCards.find(x => x.name === n && isTrainer(x)); if (c) add(c, 2);
	}
	// 4. anything else that fits: Basics of the deck's types, then other Trainers
	for (const c of ownedCards.filter(x => isBasic(x) && x.kind === 'pokemon' && (en.includes(x.cardType) || x.cardType === 'Colorless') && fits(x)).sort((a, b) => strength(b) - strength(a))) { if (!room()) break; add(c, 2); }
	for (const c of ownedCards.filter(x => isTrainer(x) && !(x.fx && x.fx.k === 'fossil'))) { if (!room()) break; add(c, 1); }
	return { deck: out, energy: en, added };
}
