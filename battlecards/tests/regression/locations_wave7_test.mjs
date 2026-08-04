// Wave 36 (locations): Clutch of Corruption — choose a friendly Dragon; summon a
// 0/2 Egg that hatches into a copy of it.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.test_dragon = { id: 'test_dragon', name: 'Test Dragon', type: 'creature', cost: 4, attack: 3, health: 4, tribe: 'Dragon' };
cardsById.test_ox = { id: 'test_ox', name: 'Ox', type: 'creature', cost: 2, attack: 2, health: 2 };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 5) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'warrior', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = 'warrior'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const placeLoc = (st, id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'board'; c.sick = false; c.tapped = false; st.players[0].board.push(c); E.recomputeAuras(st); return c; };
const put = (st, id) => { const m = E.instantiate(cardsById[id], 0); m.zone = 'board'; m.sick = false; st.players[0].board.push(m); return m; };
const killEgg = (st) => { const egg = st.players[0].board.find(c => c.id === 'token_corrupted_egg'); if (egg) { egg.damage = egg.maxHealth; E.sweepDeaths(st); } return egg; };

ok('clutch_of_corruption exists', cardsById.clutch_of_corruption);

// Tap targeting a friendly Dragon -> a 0/2 Egg with a hatch Deathrattle
{
	const st = game();
	const dragon = put(st, 'test_dragon');
	const loc = placeLoc(st, 'clutch_of_corruption');
	E.tapLand(st, 0, loc.uid, 0, { type: 'creature', uid: dragon.uid, player: 0 });
	const egg = st.players[0].board.find(c => c.id === 'token_corrupted_egg');
	ok('a 0/2 Egg was summoned', egg && egg.attack === 0 && E.hp(egg) === 2, egg && [egg.attack, E.hp(egg)]);
	ok('the Egg has a Deathrattle', egg && (egg.deathrattle || []).length > 0 && egg.keywords.includes('deathrattle'), egg && egg.deathrattle);
}

// The Egg hatches into a copy of the chosen Dragon
{
	const st = game();
	const dragon = put(st, 'test_dragon');
	const loc = placeLoc(st, 'clutch_of_corruption');
	E.tapLand(st, 0, loc.uid, 0, { type: 'creature', uid: dragon.uid, player: 0 });
	killEgg(st);
	const hatched = st.players[0].board.filter(c => c.id === 'test_dragon');
	ok('a copy of the Dragon hatched', hatched.length === 2, hatched.length); // original + hatched
	const copy = hatched.find(c => c.uid !== dragon.uid);
	ok('the hatched copy is a 3/4 Dragon', copy && copy.attack === 3 && E.hp(copy) === 4 && (copy.tribe || '').includes('Dragon'), copy && [copy.attack, E.hp(copy), copy.tribe]);
}

// A buffed Dragon hatches into a copy with the buffed stats
{
	const st = game();
	const dragon = put(st, 'test_dragon');
	dragon.attack += 2; dragon.maxHealth += 2; // now 5/6
	const loc = placeLoc(st, 'clutch_of_corruption');
	E.tapLand(st, 0, loc.uid, 0, { type: 'creature', uid: dragon.uid, player: 0 });
	killEgg(st);
	const copy = st.players[0].board.filter(c => c.id === 'test_dragon').find(c => c.uid !== dragon.uid);
	ok('hatched copy matches the buffed 5/6 stats', copy && copy.attack === 5 && E.hp(copy) === 6, copy && [copy.attack, E.hp(copy)]);
}

// The tap requires a friendly Dragon (can't tap with none)
{
	const st = game();
	put(st, 'test_ox'); // a non-Dragon
	const loc = placeLoc(st, 'clutch_of_corruption');
	ok('cannot tap without a friendly Dragon', !E.canTapLand(st, 0, loc, 0), 'tappable?');
	// with a Dragon present, it becomes tappable
	put(st, 'test_dragon');
	ok('tappable once a friendly Dragon exists', E.canTapLand(st, 0, loc, 0));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
