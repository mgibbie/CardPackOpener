// twinspell_cycle_test.mjs (2026-09-11)
//
// Owner ruling: a Twinspell's generated copy must NOT be a token — both the
// original and the conjured copy go to the graveyard and cycle back when the
// graveyard reshuffles into the deck. Applies to ALL twinspell cards.
//
// Locks in: (1) every twinspell base conjures its `<id>_ii` copy; (2) each copy
// is a real, non-token, uncollectible card that does not re-conjure (no loop);
// (3) a copy left in the graveyard reshuffles back into the deck (a token would
// be filtered out — negative control proves the test bites); (4) the base spell
// itself cycles; (5) end-to-end: casting a base drops its copy in hand and both
// the base and the cast copy reach the graveyard.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 11) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.graveyard = []; } st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};

// The 8 twinspell base -> copy pairs.
const PAIRS = [
	['rapid_fire', 'rapid_fire_ii'], ['fresh_scent', 'fresh_scent_ii'],
	['lightforged_blessing', 'lightforged_blessing_ii'], ['me_aragorn_rally', 'me_aragorn_rally_ii'],
	['conjurers_calling', 'conjurers_calling_ii'], ['air_raid', 'air_raid_ii'],
	['desperate_measures', 'desperate_measures_ii'], ['rising_winds', 'rising_winds_ii'],
];

// every card that says "Twinspell" must be one of the pairs above (no silent broken ones)
{
	const twinspellCards = raw.cards.filter(c => /twinspell/i.test(c.description || '') && !/_ii$/.test(c.id));
	const covered = new Set(PAIRS.map(p => p[0]));
	const uncovered = twinspellCards.filter(c => !covered.has(c.id)).map(c => c.id);
	ok('every Twinspell card is a known base (none left without a copy)', uncovered.length === 0, uncovered);
}

const conjuresCopy = (base, ii) => base.choices
	? base.choices.every(ch => (ch.effects || []).some(e => e.type === 'conjure-id' && e.id === ii))
	: (base.effects || []).some(e => e.type === 'conjure-id' && e.id === ii);
const reConjures = twin => twin.choices
	? twin.choices.some(ch => (ch.effects || []).some(e => e.type === 'conjure-id'))
	: (twin.effects || []).some(e => e.type === 'conjure-id');

for (const [b, ii] of PAIRS) {
	const base = cardsById[b], twin = cardsById[ii];
	ok(`${b} exists and names Twinspell`, base && /twinspell/i.test(base.description || ''), base && base.description);
	ok(`${b} is not a token (base cycles)`, base && !base.token, base && base.token);
	ok(`${b} conjures ${ii}`, base && conjuresCopy(base, ii), base && JSON.stringify(base.effects || base.choices));
	ok(`${ii} exists`, !!twin, 'missing copy');
	if (!twin) continue;
	ok(`${ii} is NOT a token (so it reaches the graveyard)`, !twin.token, twin.token);
	ok(`${ii} is uncollectible (generated, not draftable)`, twin.collectible === false, twin.collectible);
	ok(`${ii} does not re-conjure (no Twinspell loop)`, !reConjures(twin), JSON.stringify(twin.effects || twin.choices));
	ok(`${ii} name matches its base`, twin.name === base.name, [twin.name, base.name]);

	// the copy left in the graveyard reshuffles back into the deck
	const st = game();
	st.players[0].deck = [];
	st.players[0].graveyard = [E.instantiate(twin, 0)];
	E.drawCards(st, 0, 1);
	const cameBack = st.players[0].hand.some(c => c.id === ii) || st.players[0].deck.includes(ii);
	ok(`${ii} reshuffles from graveyard back into the deck`, cameBack, { hand: st.players[0].hand.map(c => c.id), deck: st.players[0].deck });
}

// negative control: a genuine token in the graveyard is filtered out on reshuffle
{
	const tokenId = Object.values(cardsById).find(c => c.token && c.type && /sorcery|instant|spell|creature/.test(c.type))?.id
		|| Object.values(cardsById).find(c => c.token)?.id;
	ok('a token card exists to use as a control', !!tokenId, tokenId);
	if (tokenId) {
		const st = game();
		st.players[0].deck = [];
		st.players[0].graveyard = [E.instantiate(cardsById[tokenId], 0)];
		E.drawCards(st, 0, 1);
		const back = st.players[0].hand.some(c => c.id === tokenId) || st.players[0].deck.includes(tokenId);
		ok('a token does NOT reshuffle back (control passes)', !back, tokenId);
	}
}

// end-to-end: casting a base drops its copy in hand; base and cast copy both hit the graveyard, then cycle
{
	const st = game();
	// give player 0 a friendly creature so Rally has a target for its buff
	const g = E.instantiate({ id: 'grunt', name: 'Grunt', type: 'creature', cost: 1, attack: 1, health: 3 }, 0);
	g.zone = 'board'; g.sick = false; st.players[0].board.push(g);
	const base = E.instantiate(cardsById.me_aragorn_rally, 0); base.zone = 'hand'; st.players[0].hand.push(base);
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, base.uid, null, null, 0);
	ok('casting the base conjured me_aragorn_rally_ii into hand', st.players[0].hand.some(c => c.id === 'me_aragorn_rally_ii'), st.players[0].hand.map(c => c.id));
	ok('the base spell went to the graveyard', st.players[0].graveyard.some(c => c.id === 'me_aragorn_rally'), st.players[0].graveyard.map(c => c.id));
	const copy = st.players[0].hand.find(c => c.id === 'me_aragorn_rally_ii');
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, copy.uid, null, null, 0);
	ok('the cast copy went to the graveyard (not exile)', st.players[0].graveyard.some(c => c.id === 'me_aragorn_rally_ii'), st.players[0].graveyard.map(c => c.id));
	ok('the copy is not in exile', !st.players[0].exile.some(c => c.id === 'me_aragorn_rally_ii'), st.players[0].exile.map(c => c.id));
	// reshuffle: both cycle back
	st.players[0].deck = [];
	E.drawCards(st, 0, 2);
	const ids = st.players[0].hand.map(c => c.id).concat(st.players[0].deck);
	ok('both base and copy cycle back after reshuffle', ids.includes('me_aragorn_rally') && ids.includes('me_aragorn_rally_ii'), ids);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
