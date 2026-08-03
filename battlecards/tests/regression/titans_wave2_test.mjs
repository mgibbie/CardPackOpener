// Group B — Titans (wave 2): the three "ongoing aura" Titans.
//   Golganneth — your first spell each turn costs (3) less
//   Amitus     — Taunt; your minions can't take more than 2 damage at a time
//   Argus      — minions to its left have Rush, to its right have Lifesteal
import fs from 'fs';
import * as E from '../../engine.js';
import { damageCreature } from '../../engine/damage.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 6) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'shaman', name: 'S', power: null }, { id: 'paladin', name: 'P', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[1].mana.max = 10; st.players[1].mana.cur = 10;
	return st;
};
const putBoard = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; c.summonedThisTurn = false; c.attacksUsed = 0; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummyDef = (a, h, name = 'Dummy') => ({ id: 'dm_' + name, name, type: 'creature', cost: 3, rarity: 'basic', attack: a, health: h });

for (const id of ['golganneth_the_thunderer', 'amitus_the_peacekeeper', 'argus_the_emerald_star']) {
	const c = cardsById[id];
	ok(`${id}: titan + 3 abilities`, c.titan && c.activated.length === 3, id);
}

// ---------- Golganneth: first spell each turn costs (3) less ----------
{
	const st = game();
	putBoard(st, 0, 'golganneth_the_thunderer');
	const spell = E.instantiate({ id: 'sp5', name: 'Spell', type: 'sorcery', cost: 5, rarity: 'common', effects: [] }, 0); spell.zone = 'hand'; st.players[0].hand.push(spell);
	st.players[0].spellsPlayedThisTurn = 0;
	ok('first spell of the turn costs 3 less (5 -> 2)', E.effectiveCost(st, 0, spell) === 2, E.effectiveCost(st, 0, spell));
	st.players[0].spellsPlayedThisTurn = 1;
	ok('a later spell that turn is full price (5)', E.effectiveCost(st, 0, spell) === 5, E.effectiveCost(st, 0, spell));

	// Roaring Oceans: 3 to all enemies + restore 6 to friendly characters
	const st2 = game(); const g = putBoard(st2, 0, 'golganneth_the_thunderer');
	const foe = putBoard(st2, 1, null, dummyDef(1, 9, 'Foe'));
	st2.players[0].life = 20;
	E.activateAbility(st2, 0, g.uid, 0, null); // Roaring Oceans
	ok('Roaring Oceans: 3 to all enemies', foe.damage === 3 && st2.players[1].life === 40 - 3, [foe.damage, st2.players[1].life]);
	ok('Roaring Oceans: restore 6 to your hero', st2.players[0].life === 26, st2.players[0].life);

	// Shargahn's Wrath: draw 3 Overload cards from deck
	const st3 = game(); const g3 = putBoard(st3, 0, 'golganneth_the_thunderer');
	const overloadIds = raw.cards.filter(c => (c.overload || 0) > 0 && c.type !== 'land' && !c.token && c.collectible !== false).slice(0, 4).map(c => c.id);
	st3.players[0].deck = overloadIds.slice();
	const hand0 = st3.players[0].hand.length;
	E.activateAbility(st3, 0, g3.uid, 2, null);
	ok('Shargahn\'s Wrath drew Overload cards', st3.players[0].hand.length > hand0 && st3.players[0].hand.every(c => (c.overload || 0) > 0), st3.players[0].hand.map(c => c.id));
}

// ---------- Amitus: Taunt + damage cap ----------
{
	const st = game();
	const am = putBoard(st, 0, 'amitus_the_peacekeeper');
	ok('Amitus has Taunt', am.keywords.includes('taunt'));
	const mine = putBoard(st, 0, null, dummyDef(3, 10, 'Mine'));
	const theirs = putBoard(st, 1, null, dummyDef(3, 10, 'Theirs'));
	damageCreature(st, mine, 8, null);
	ok('your minion takes at most 2 from a big hit (cap)', mine.damage === 2, mine.damage);
	damageCreature(st, theirs, 8, null);
	ok('the enemy minion (no Amitus) takes the full 8', theirs.damage === 8, theirs.damage);
	// even Amitus itself is capped
	damageCreature(st, am, 8, null);
	ok('Amitus itself is also capped to 2', am.damage === 2, am.damage);

	// Empowered: +2/+2 to your OTHER minions (not Amitus)
	const st2 = game(); const am2 = putBoard(st2, 0, 'amitus_the_peacekeeper'); const b = putBoard(st2, 0, null, dummyDef(2, 2, 'Buddy'));
	const amA = am2.attack;
	E.activateAbility(st2, 0, am2.uid, 1, null);
	ok('Empowered: other minion +2/+2, Amitus unchanged', b.attack === 4 && E.hp(b) === 4 && am2.attack === amA, [b.attack, E.hp(b), am2.attack]);

	// Pacified: set enemy minions to 2/2
	const st3 = game(); const am3 = putBoard(st3, 0, 'amitus_the_peacekeeper'); const big = putBoard(st3, 1, null, dummyDef(7, 7, 'Big'));
	E.activateAbility(st3, 0, am3.uid, 2, null);
	ok('Pacified: enemy minion set to 2/2', big.attack === 2 && E.hp(big) === 2, [big.attack, E.hp(big)]);

	// Reinforced: draw 2 minions, set them 2/2 cost 2
	const st4 = game(); const am4 = putBoard(st4, 0, 'amitus_the_peacekeeper');
	st4.players[0].hand = [];
	st4.players[0].deck = ['chillwind_yeti', 'boulderfist_ogre', 'wolfrider'].filter(id => cardsById[id]);
	E.activateAbility(st4, 0, am4.uid, 0, null);
	const drawn = st4.players[0].hand.filter(c => c.type === 'creature');
	ok('Reinforced: drew 2 minions set to 2/2 cost 2', drawn.length === 2 && drawn.every(c => c.attack === 2 && E.hp(c) === 2 && c.cost === 2), drawn.map(c => [c.id, c.attack, E.hp(c), c.cost]));
}

// ---------- Argus: positional Rush/Lifesteal aura ----------
{
	const st = game();
	const left = putBoard(st, 0, null, dummyDef(3, 3, 'Left'));
	const argus = putBoard(st, 0, 'argus_the_emerald_star'); // board: [Left, Argus]
	const right = putBoard(st, 0, null, dummyDef(3, 3, 'Right')); // board: [Left, Argus, Right]
	E.recomputeAuras(st);
	ok('minion to the LEFT of Argus has Rush', (left.keywords || []).includes('rush'), left.keywords);
	ok('minion to the RIGHT of Argus has Lifesteal', (right.keywords || []).includes('lifesteal'), right.keywords);
	ok('the left minion does NOT get Lifesteal, nor the right one Rush', !left.keywords.includes('lifesteal') && !right.keywords.includes('rush'));
	ok('Argus does not grant itself the keywords', !argus.keywords.includes('rush') && !argus.keywords.includes('lifesteal'));

	// Argunite Army: four 2/2 Elementals with Taunt
	const st2 = game(); const a2 = putBoard(st2, 0, 'argus_the_emerald_star');
	const before = st2.players[0].board.length;
	E.activateAbility(st2, 0, a2.uid, 2, null);
	const elems = st2.players[0].board.filter(c => c.name === 'Elemental');
	ok('Argunite Army summoned four 2/2 Elementals with Taunt', elems.length === 4 && elems.every(c => c.attack === 2 && E.hp(c) === 2 && c.keywords.includes('taunt')), elems.length);

	// Show of Force: hand minions cost (2) less (spells untouched)
	const st3 = game(); const a3 = putBoard(st3, 0, 'argus_the_emerald_star');
	const m = E.instantiate({ id: 'hm', name: 'HandMin', type: 'creature', cost: 5, rarity: 'common', attack: 1, health: 1 }, 0); m.zone = 'hand'; st3.players[0].hand.push(m);
	const sp = E.instantiate({ id: 'hs', name: 'HandSpell', type: 'sorcery', cost: 4, rarity: 'common', effects: [] }, 0); sp.zone = 'hand'; st3.players[0].hand.push(sp);
	E.activateAbility(st3, 0, a3.uid, 1, null);
	ok('Show of Force: hand minion -2, spell unchanged', m.cost === 3 && sp.cost === 4, [m.cost, sp.cost]);

	// Crystal Carving queues a Discover of a Deathrattle minion
	const st4 = game(); const a4 = putBoard(st4, 0, 'argus_the_emerald_star');
	E.activateAbility(st4, 0, a4.uid, 0, null);
	const pick = st4.pickQueue[st4.pickQueue.length - 1];
	ok('Crystal Carving: a Discover of Deathrattle minions is queued (costs 3 less)', pick && pick.costMod === -3 && pick.ids.every(id => (cardsById[id].keywords || []).includes('deathrattle') && cardsById[id].type === 'creature'), pick && pick.ids);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
