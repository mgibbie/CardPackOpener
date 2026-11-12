// tester_cards_nov12_test.mjs — three tester reports (instinctgauntlet, 2026-11-11 / 12) where a card did less than it
// says, each with the REAL card played through the engine.
//
//  1. bug:1794449052176 — Book of Specters: "Draw 3 cards. Discard any spells drawn." drew three and kept them all
//     (its effect was only a draw). Fungal Fortunes ("Discard any creatures drawn") had the same gap.
//  2. bug:1794450229620 — Burning Wit (a Heist hero power): "Reduce the Cost of a random card in your hand by (2)" only
//     ever chose creatures, so with a hand of spells it did nothing. The same on Nazmani Bloodweaver, Sindragosa's
//     Triumph and the Heist boss Xur'ios, whose texts all say "a random card".
//  3. bug:1794505541206 — Heist "Tell a Story" twice on the same card: a copy DRAWN in a fight had only one of the two
//     + 2 / + 2 (a copy in the opening hand had both).
//   node battlecards/tests/regression/tester_cards_nov12_test.mjs
import fs from 'fs';
import * as E from '../../engine.js';
import * as H from '../../heist.js';
import { Scenario } from '../helpers/scenario.mjs';
import { validateGameState } from '../../engine/validate.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l, extra ?? ''); } };
const ids = (list) => list.map((c) => c.id).join();
const playFirst = (state, pi, id, target = null) => { const c = state.players[pi].hand.find((x) => x.id === id); return E.playCard(state, pi, c.uid, target); };
/** A plain game with test cards beside the real ones. The deck is drawn from its END (top), so list it bottom-first. */
const game = (o) => {
	const S = new Scenario(byId)
		.def('t_spell', { type: 'sorcery', cost: 3, effects: [{ type: 'gain-life', value: 1 }] })
		.def('t_spell2', { type: 'instant', cost: 4, effects: [{ type: 'gain-life', value: 1 }] })
		.def('t_crea', { type: 'creature', cost: 3, attack: 2, health: 2 })
		.def('t_crea2', { type: 'creature', cost: 5, attack: 4, health: 4 })
		.def('t_ench', { type: 'enchantment', cost: 2 })
		.mana(0, 10);
	if (o.hand) S.hand(0, o.hand);
	if (o.deck) S.deck(0, o.deck);
	if (o.board) S.board(0, o.board);
	return S.run().state;
};
/** Which end of the deck a draw takes from (so the tests below say which cards are "the top three"). */
const topFirst = (() => { const s = game({ hand: [], deck: ['t_crea', 't_spell'] }); E.drawCards(s, 0, 1); return s.players[0].hand[0].id === 't_spell' ? (l) => l.slice().reverse() : (l) => l.slice(); })();

// ---------------------------------------------------------------- 1. Book of Specters, Fungal Fortunes
{
	ok('the cards say what they do: Book of Specters discards the spells it draws, Fungal Fortunes the creatures',
		byId.book_of_specters.description === 'Draw 3 cards. Discard any spells drawn.' && byId.book_of_specters.effects[0].discardDrawn === 'spells' && byId.fungal_fortunes.description === 'Draw 3 cards. Discard any creatures drawn.' && byId.fungal_fortunes.effects[0].discardDrawn === 'creatures');
	// three spells drawn: all three are discarded; the spell already in hand stays
	let s = game({ hand: ['book_of_specters', 't_spell'], deck: topFirst(['t_spell', 't_spell2', 't_spell', 't_crea']) });
	const held = s.players[0].hand.find((c) => c.id === 't_spell'), g0 = s.players[0].graveyard.length;
	playFirst(s, 0, 'book_of_specters');
	ok('Book of Specters, three spells on top: all three are discarded, and the spell you already held stays',
		s.players[0].hand.length === 1 && s.players[0].hand[0] === held && s.players[0].deck.length === 1 && s.players[0].graveyard.filter((c) => /^t_spell/.test(c.id)).length === 3, [ids(s.players[0].hand), ids(s.players[0].graveyard), s.players[0].deck]);
	ok('…they are discards (three "discard" entries in the player\'s log), and the game is whole', s.players[0].discardLogIds.filter((id) => /^t_spell/.test(id)).length === 3 && validateGameState(s).length === 0 && s.players[0].graveyard.length === g0 + 4, [s.players[0].discardLogIds, validateGameState(s).slice(0, 2)]);
	// a mix: creatures (and an enchantment, which is not a spell here) are kept
	s = game({ hand: ['book_of_specters'], deck: topFirst(['t_crea', 't_spell', 't_ench', 't_crea2']) });
	playFirst(s, 0, 'book_of_specters');
	ok('a creature, a spell and an enchantment on top: only the spell is discarded', ids(s.players[0].hand).split(',').sort().join() === 't_crea,t_ench' && s.players[0].graveyard.some((c) => c.id === 't_spell') && s.players[0].deck.join() === 't_crea2', [ids(s.players[0].hand), s.players[0].deck]);
	// the tester's own draw: Ice Block, Arcane Missiles, Ice Block
	s = game({ hand: ['book_of_specters'], deck: topFirst(['ice_block', 'arcane_missiles', 'ice_block']) });
	const types = ['ice_block', 'arcane_missiles'].map((id) => byId[id] && byId[id].type);
	playFirst(s, 0, 'book_of_specters');
	ok(`the tester's draw (Ice Block, Arcane Missiles, Ice Block: ${types.join(' / ')}): none is kept`, !!byId.ice_block && !!byId.arcane_missiles && s.players[0].hand.length === 0, ids(s.players[0].hand));
	// two cards left in the deck: nothing else is discarded
	s = game({ hand: ['book_of_specters', 't_spell2', 't_crea'], deck: topFirst(['t_crea2', 't_spell']) });
	playFirst(s, 0, 'book_of_specters');
	ok('with two cards left: it draws those two, discards the one spell, and touches nothing you held', ids(s.players[0].hand).split(',').sort().join() === 't_crea,t_crea2,t_spell2' && s.players[0].deck.length === 0, ids(s.players[0].hand));
	// Fungal Fortunes
	s = game({ hand: ['fungal_fortunes', 't_crea'], deck: topFirst(['t_crea', 't_spell', 't_crea2']) });
	const mine = s.players[0].hand.find((c) => c.id === 't_crea');
	playFirst(s, 0, 'fungal_fortunes');
	ok('Fungal Fortunes: the two creatures drawn are discarded, the spell is kept, the creature you held stays', s.players[0].hand.length === 2 && s.players[0].hand.includes(mine) && s.players[0].hand.some((c) => c.id === 't_spell') && s.players[0].graveyard.filter((c) => c.type === 'creature').length === 2, ids(s.players[0].hand));
	// a plain draw discards nothing
	s = game({ hand: [], deck: topFirst(['t_spell', 't_spell2', 't_crea']) });
	E.drawCards(s, 0, 3);
	ok('an ordinary draw of three keeps all three', s.players[0].hand.length === 3);
}

// ---------------------------------------------------------------- 2. "a random card in your hand"
{
	const bw = byId.dala_burning_wit;
	ok('Burning Wit says "a random card", and now means any card', /Reduce the Cost of a random card in your hand by \(2\)/.test(bw.description) && bw.power.effects[0].anyCard === true);
	// the tester's hand: spells only
	const picks = [{ id: 'm', name: 'Mage', power: bw.power }, { id: 'b', name: 'Boss', power: { name: 'y', cost: 2, effects: [], text: '' } }];
	let hits = 0, runs = 0; const kinds = new Set();
	for (let seed = 1; seed <= 30; seed++) {
		const state = E.createGame(byId, seededRng(seed), null, 2, picks), p = state.players[0];
		p.hand = ['t_a', 't_b'].map((id, i) => E.instantiate({ id, name: id, type: i ? 'instant' : 'sorcery', cost: 4 + i, rarity: 'common', description: 'x', effects: [{ type: 'gain-life', value: 1 }] }, 0));
		for (const c of p.hand) c.zone = 'hand';
		p.mana = { ...p.mana, cur: 10, max: 10 }; state.current = 0;
		const before = p.hand.map((c) => c.cost);
		E.useHeroPower(state, 0, p.heroPowers[0].uid, null);
		const after = p.hand.map((c) => c.cost), changed = after.filter((v, i) => v !== before[i]).length;
		runs++; if (changed === 1 && before.reduce((a, b) => a + b) - after.reduce((a, b) => a + b) === 2) { hits++; kinds.add(after[0] !== before[0] ? 'sorcery' : 'instant'); }
	}
	ok(`Burning Wit with a hand of two spells: one of them costs (2) less, every time (${hits} of ${runs}), either one over the seeds`, hits === runs && kinds.size === 2, [hits, [...kinds]]);
	// a mixed hand: creatures can still be picked
	const seen = new Set();
	for (let seed = 1; seed <= 40; seed++) {
		const state = E.createGame(byId, seededRng(seed), null, 2, picks), p = state.players[0];
		p.hand = [['t_s', 'sorcery'], ['t_c', 'creature']].map(([id, type]) => { const c = E.instantiate({ id, name: id, type, cost: 5, attack: 1, health: 1, rarity: 'common', description: 'x' }, 0); c.zone = 'hand'; return c; });
		p.mana = { ...p.mana, cur: 10, max: 10 }; state.current = 0;
		E.useHeroPower(state, 0, p.heroPowers[0].uid, null);
		for (const c of p.hand) if (c.cost === 3) seen.add(c.type);
	}
	ok('with a spell and a creature in hand it picks either', seen.size === 2, [...seen]);
	for (const id of ['nazmani_bloodweaver', 'sindragosas_triumph']) {
		const c = byId[id]; let fx = null; const walk = (x) => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) { x.forEach(walk); return; } if (x.type === 'reduce-random-hand-cost') fx = x; for (const k in x) walk(x[k]); }; walk(c);
		ok(`${c.name} says "a random card" and means any card too`, /random card in your hand/.test(c.description) && fx && fx.anyCard === true, c.description);
	}
	const xur = H.BOSSES.xur_ios.power;
	ok('the Heist boss Xur\'ios ("A random card in your hand costs (2) less"): any card', /A random card in your hand costs \(2\) less/.test(xur.text) && xur.effects.some((e) => e.type === 'reduce-random-hand-cost' && e.anyCard === true));
	// the cards whose text says "creature" still pick creatures only
	const sat = byId.imprisoned_satyr; let sfx = null; (function walk(x) { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) { x.forEach(walk); return; } if (x.type === 'reduce-random-hand-cost') sfx = x; for (const k in x) walk(x[k]); })(sat);
	ok('Imprisoned Satyr ("a random creature") is unchanged: creatures only', /random creature in your hand/.test(sat.description) && sfx && !sfx.anyCard);
}

// ---------------------------------------------------------------- 3. Tell a Story, twice on the same card
{
	const CREA = 'cave_hydra', base = byId[CREA];
	const boot = (deckIds, seed = 7) => E.createGame(byId, seededRng(seed), [...deckIds], 2, [{ id: 'm', name: 'Hunter', power: { name: 'x', cost: 2, effects: [], text: '' } }, { id: 'b', name: 'Boss', power: { name: 'y', cost: 2, effects: [], text: '' } }]);
	const filler = raw.cards.filter((c) => c.type === 'creature' && c.collectible && c.id !== CREA && !c.token).slice(0, 29).map((c) => c.id);
	ok('Cave Hydra is a real card (2 / 4), as in the report', !!base && base.attack === 2 && base.health === 4, base && [base.attack, base.health]);
	// one copy, two stories: wherever the copy starts (hand or deck), it is 6 / 8
	const where = { hand: 0, deck: 0 }, bad = [];
	for (let seed = 1; seed <= 30; seed++) {
		const run = { deck: [CREA, ...filler], deckBuffs: [{ id: CREA, attack: 2, health: 2, cost: 0 }, { id: CREA, attack: 2, health: 2, cost: 0 }] };
		const state = boot(run.deck, seed), p = state.players[0];
		H.applyRunMods(state, 0, run);
		let c = p.hand.find((x) => x.id === CREA);
		if (c) where.hand++; else { where.deck++; let guard = 0; while (!c && p.deck.length && guard++ < 60) { p.hand.length = 0; E.drawCards(state, 0, 1); c = p.hand.find((x) => x.id === CREA); } }
		if (!c || c.attack !== base.attack + 4 || c.maxHealth !== base.health + 4) bad.push(`seed ${seed}: ${c ? c.attack + '/' + c.maxHealth : 'never drawn'}`);
	}
	ok(`two Tell a Story on Cave Hydra: the copy is 6 / 8 whether it starts in hand (${where.hand} seeds) or is drawn later (${where.deck})`, bad.length === 0 && where.deck > 0, bad.slice(0, 4));
	// two copies, two stories: both copies get both
	{
		const run = { deck: [CREA, CREA, ...filler.slice(0, 28)], deckBuffs: [{ id: CREA, attack: 2, health: 2, cost: 0 }, { id: CREA, attack: 2, health: 2, cost: 0 }] };
		const state = boot(run.deck, 3), p = state.players[0]; H.applyRunMods(state, 0, run);
		const got = p.hand.filter((x) => x.id === CREA); let guard = 0;
		while (got.length < 2 && p.deck.length && guard++ < 60) { const n = p.hand.length; E.drawCards(state, 0, 1); if (p.hand.length > n && p.hand[p.hand.length - 1].id === CREA) got.push(p.hand[p.hand.length - 1]); if (p.hand.length >= 9) p.hand.splice(0, p.hand.length - 1 - (p.hand[p.hand.length - 1].id === CREA ? 0 : 0)); }
		ok('two copies in the deck: both come out 6 / 8, and no buff is left over', got.length === 2 && got.every((c) => c.attack === 6 && c.maxHealth === 8) && !(p.deckIdBuffs || []).some((b) => b.id === CREA), [got.map((c) => c.attack + '/' + c.maxHealth), (p.deckIdBuffs || []).length]);
	}
	// one story is still one + 2 / + 2, and a story on another card is its own
	{
		const other = filler[0], run = { deck: [CREA, ...filler], deckBuffs: [{ id: CREA, attack: 2, health: 2, cost: 0 }, { id: other, attack: 2, health: 2, cost: 0 }] };
		const state = boot(run.deck, 5), p = state.players[0]; H.applyRunMods(state, 0, run);
		const all = () => p.hand.slice(); const seen = {}; for (const c of all()) seen[c.id] = c; let guard = 0;
		while ((!seen[CREA] || !seen[other]) && p.deck.length && guard++ < 60) { p.hand.length = 0; E.drawCards(state, 0, 1); const c = p.hand[0]; if (c) seen[c.id] = seen[c.id] || c; }
		ok('one story each on two cards: each is + 2 / + 2, no more', seen[CREA] && seen[CREA].attack === 4 && seen[CREA].maxHealth === 6 && seen[other] && seen[other].attack === byId[other].attack + 2 && seen[other].maxHealth === byId[other].health + 2, [seen[CREA] && [seen[CREA].attack, seen[CREA].maxHealth], seen[other] && [seen[other].attack, seen[other].maxHealth]]);
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
