// Locations wave 2 (one-off tail): temp Spell Damage, cast-random-spell, Discover-Temporary.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 51) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[0].life = 30; st.players[1].life = 30;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const placeLoc = (st, id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'board'; c.sick = false; c.tapped = false; st.players[0].board.push(c); E.recomputeAuras(st); return c; };
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };

for (const id of ['magical_dollhouse', 'prison_of_yogg_saron', 'bloodpetal_biome', 'rune_dagger'])
	ok(`${id} exists`, cardsById[id], id);

// Magical Dollhouse: Gain Spell Damage +1 this turn (a Fireball-style spell hits harder)
{
	const st = game();
	cardsById.t_bolt = { id: 't_bolt', name: 'Bolt', type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 3, target: 'creature' }] };
	const foe = put(st, 1, { id: 'f', name: 'F', type: 'creature', cost: 2, attack: 0, health: 10 });
	const loc = placeLoc(st, 'magical_dollhouse');
	E.tapLand(st, 0, loc.uid, 0, null);
	ok('Magical Dollhouse gave Spell Damage +1 this turn', st.players[0].spellDamageThisTurn === 1, st.players[0].spellDamageThisTurn);
	const bolt = E.instantiate(cardsById.t_bolt, 0); bolt.zone = 'hand'; st.players[0].hand.push(bolt); st.players[0].mana.cur = 10;
	E.playCard(st, 0, bolt.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
	ok('a 3-damage spell dealt 4 with the bonus', foe.damage === 4, foe.damage);
}
// Rune Dagger: After your hero attacks, gain Spell Damage +1 this turn
{
	const st = game(); const foe = put(st, 1, { id: 'f2', name: 'F', type: 'creature', cost: 2, attack: 0, health: 8 });
	equip(st, 'rune_dagger'); st.players[0].heroAttacksUsed = 0;
	E.heroAttack(st, 0, { type: 'creature', uid: foe.uid, player: 1 });
	ok('Rune Dagger granted Spell Damage +1 after attacking', st.players[0].spellDamageThisTurn === 1, st.players[0].spellDamageThisTurn);
}
// Bloodpetal Biome: Discover a Temporary 1-Cost minion (opens a pick)
{
	const st = game();
	const loc = placeLoc(st, 'bloodpetal_biome');
	E.tapLand(st, 0, loc.uid, 0, null);
	ok('Bloodpetal Biome opened a Discover pick', (st.pickQueue || []).length >= 1, st.pickQueue?.length);
	ok('the discover is for a 1-Cost, Temporary creature', cardsById.bloodpetal_biome.taps[0].effects[0].makeTemporary === true && cardsById.bloodpetal_biome.taps[0].effects[0].cost === 1);
}
// Prison of Yogg-Saron: Cast 4 random spells
{
	const st = game(); st.players[1].life = 60; st.players[0].life = 60;
	const loc = placeLoc(st, 'prison_of_yogg_saron');
	const before = JSON.stringify(st.log?.length || 0);
	let threw = null;
	try { E.tapLand(st, 0, loc.uid, 0, { type: 'hero', player: 1 }); } catch (e) { threw = e.message; }
	ok('Prison of Yogg-Saron cast 4 random spells without crashing', threw === null, threw);
	ok('the tap is wired to cast-random-spell x4', cardsById.prison_of_yogg_saron.taps[0].effects[0].type === 'cast-random-spell' && cardsById.prison_of_yogg_saron.taps[0].effects[0].count === 4);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
