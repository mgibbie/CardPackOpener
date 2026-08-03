// Group E wave 5 — Harried Herdsman: after you cast a Fire spell, each Beast you
// control attacks a random enemy creature.
//
// This is the last easily-wired Group E one-off. The rest (melted_maker/Forge,
// misplaced_pyromancer/Shatter, sanctum_spellbender/spell-redirect,
// the_harvester_of_envy/copied-provenance, auctioneer_jaxon/Discover-to-draw,
// service_ace/self-gains-attack, neptulon/Colossal-Hands) each need a new
// subsystem, not card wiring.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 37) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = []; st.players[0].life = 30; st.players[1].life = 30;
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const put = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; c.summonedThisTurn = false; c.attacksUsed = 0; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name = 'D', extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 3, rarity: 'basic', attack: a, health: h, ...extra });
// a Fire spell (school lives on the `tribe` field) and a non-Fire spell
const fireSpell = { id: 't_fire', name: 'Ember', type: 'sorcery', cost: 1, rarity: 'basic', tribe: 'Fire', effects: [{ type: 'armor', value: 0 }] };
const frostSpell = { id: 't_frost', name: 'Chill', type: 'sorcery', cost: 1, rarity: 'basic', tribe: 'Frost', effects: [{ type: 'armor', value: 0 }] };
cardsById.t_fire = fireSpell; cardsById.t_frost = frostSpell;
const cast = (st, id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'hand'; st.players[0].hand.push(c); st.players[0].mana.cur = 10; E.playCard(st, 0, c.uid, null, null, 0); };

ok('Harried Herdsman carries a Fire-spell → beasts-attack trigger', cardsById.harried_herdsman.ongoing?.on === 'spell-played' && cardsById.harried_herdsman.ongoing.if?.school === 'Fire' && cardsById.harried_herdsman.ongoing.effects?.[0]?.type === 'beasts-attack-random');

// Fire spell → each friendly Beast swings at a random enemy creature
{
	const st = game();
	put(st, 0, 'harried_herdsman'); // 4/5 Human Ranger (not a Beast — should not swing itself)
	const wolf = put(st, 0, null, dummy(3, 3, 'Wolf', { tribe: 'Beast' }));
	const bear = put(st, 0, null, dummy(2, 4, 'Bear', { tribe: 'Beast' }));
	const foeA = put(st, 1, null, dummy(0, 3, 'FoeA')); // 0-attack so it never trades back
	const foeB = put(st, 1, null, dummy(0, 3, 'FoeB'));
	cast(st, 't_fire');
	const dmgDealt = (foeA.damage || 0) + (foeB.damage || 0);
	ok('the two Beasts dealt their Attack into enemy creatures (3+2=5 total)', dmgDealt === 5, [foeA.damage, foeB.damage]);
	ok('all damage landed on enemy CREATURES, never the enemy hero', st.players[1].life === 30, st.players[1].life);
	ok('the Beasts took no damage (0-attack foes) and survived', E.hp(wolf) === 3 && E.hp(bear) === 4, [E.hp(wolf), E.hp(bear)]);
}

// non-Fire spell does nothing
{
	const st = game();
	put(st, 0, 'harried_herdsman');
	const wolf = put(st, 0, null, dummy(3, 3, 'Wolf', { tribe: 'Beast' }));
	const foe = put(st, 1, null, dummy(0, 3, 'Foe'));
	cast(st, 't_frost');
	ok('a Frost spell does not trigger the Herdsman', (foe.damage || 0) === 0 && wolf.attacksUsed === 0, [foe.damage, wolf.attacksUsed]);
}

// no enemy creatures → no-op (no crash, Beasts don't hit the hero)
{
	const st = game();
	put(st, 0, 'harried_herdsman');
	const wolf = put(st, 0, null, dummy(3, 3, 'Wolf', { tribe: 'Beast' }));
	const lifeBefore = st.players[1].life;
	cast(st, 't_fire');
	ok('no enemy creatures: Beast stays home, enemy hero untouched', st.players[1].life === lifeBefore && wolf.attacksUsed === 0, [st.players[1].life, wolf.attacksUsed]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
