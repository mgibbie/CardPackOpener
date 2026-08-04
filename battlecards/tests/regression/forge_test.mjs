// Forge mechanic + Melted Maker. Forge upgrades a card in hand for its cost
// (default 2), fires the `forged` event, and (mostly) spends the ability.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 42) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = []; st.players[0].life = 30; st.players[1].life = 30;
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const toHand = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };

// data sanity
ok('Cyclopian Crusher has a +3/+2 Forge', JSON.stringify(cardsById.cyclopian_crusher.forge) === JSON.stringify({ buff: { attack: 3, health: 2 } }));
ok('Storm Giant Forges endlessly for -2 cost', cardsById.storm_giant.forge.costDelta === -2 && cardsById.storm_giant.forge.endless === true);
ok('Melted Maker listens to the forged event', cardsById.melted_maker.ongoing?.on === 'forged');

// Cyclopian Crusher: Forge → +3/+2, ability spent, 2 mana gone
{
	const st = game();
	const cc = toHand(st, 0, 'cyclopian_crusher'); // 3/3
	st.players[0].mana.cur = 5;
	ok('canForge when you can pay', E.canForge(st, 0, cc));
	const done = E.forgeCard(st, 0, cc.uid);
	ok('forgeCard succeeded', done === true);
	ok('Cyclopian is now 6/5', cc.attack === 6 && cc.maxHealth === 5, [cc.attack, cc.maxHealth]);
	ok('it spent 2 mana', st.players[0].mana.cur === 3, st.players[0].mana.cur);
	ok('it is marked forged and the ability is spent', cc.forged === true && cc.forge === null);
	ok('cannot Forge it again', !E.canForge(st, 0, cc) && E.forgeCard(st, 0, cc.uid) === false);
}
// cost gate
{
	const st = game();
	const cc = toHand(st, 0, 'cyclopian_crusher');
	st.players[0].mana.cur = 1; st.players[0].mana.bonus = 0;
	ok('cannot Forge with < 2 mana', !E.canForge(st, 0, cc) && E.forgeCard(st, 0, cc.uid) === false);
	ok('the card is untouched (still 3/3, unforged)', cc.attack === 3 && !cc.forged);
}
// Storm Giant: endless, -2 cost each time
{
	const st = game();
	const sg = toHand(st, 0, 'storm_giant'); // cost 8
	st.players[0].mana.cur = 10;
	E.forgeCard(st, 0, sg.uid);
	ok('Storm Giant now costs 6', sg.cost === 6, sg.cost);
	ok('Storm Giant keeps its Forge (endless)', !!sg.forge && sg.forged === true);
	E.forgeCard(st, 0, sg.uid);
	ok('Forged again → costs 4', sg.cost === 4, sg.cost);
}
// Lab Constructor: Forge grants Magnetic
{
	const st = game();
	const lc = toHand(st, 0, 'lab_constructor');
	st.players[0].mana.cur = 5;
	E.forgeCard(st, 0, lc.uid);
	ok('Lab Constructor gained Magnetic', lc.magnetic === true);
}
// Muscle-o-Tron: Forge replaces the battlecry (+1/+1 → +2/+2)
{
	const st = game();
	const mt = toHand(st, 0, 'muscle_o_tron');
	const ally = toHand(st, 0, 'cyclopian_crusher'); // a 3/3 minion in hand to buff
	st.players[0].mana.cur = 10;
	E.forgeCard(st, 0, mt.uid);
	ok('Muscle-o-Tron battlecry is now +2/+2', mt.effects[0].attack === 2 && mt.effects[0].health === 2, mt.effects);
	E.playCard(st, 0, mt.uid, null, null, 0);
	ok('the forged battlecry gave the hand minion +2/+2', ally.attack === 5 && ally.maxHealth === 5, [ally.attack, ally.maxHealth]);
}
// Watcher of the Sun: Forge APPENDS a heal to the battlecry
{
	const st = game();
	const w = toHand(st, 0, 'watcher_of_the_sun');
	st.players[0].mana.cur = 10; st.players[0].life = 20;
	E.forgeCard(st, 0, w.uid);
	ok('Watcher battlecry now has the extra heal appended', w.effects.some(e => e.type === 'heal' && e.value === 6));
	E.playCard(st, 0, w.uid, null, null, 0);
	ok('playing the forged Watcher healed the hero 6', st.players[0].life === 26, st.players[0].life);
}

// Melted Maker: after you Forge, get a copy of the forged card
{
	const st = game();
	put(st, 0, 'melted_maker');
	const cc = toHand(st, 0, 'cyclopian_crusher'); // 3/3
	st.players[0].mana.cur = 5;
	const handBefore = st.players[0].hand.length; // just the crusher
	E.forgeCard(st, 0, cc.uid);
	ok('a copy of the forged card entered your hand', st.players[0].hand.length === handBefore + 1, st.players[0].hand.length);
	const copy = st.players[0].hand.find(c => c.id === 'cyclopian_crusher' && c.uid !== cc.uid);
	ok('the copy is the UPGRADED 6/5 version', copy && copy.attack === 6 && copy.maxHealth === 5, copy && [copy.attack, copy.maxHealth]);
	ok('the copy is already forged (cannot be re-forged)', copy && copy.forged === true && copy.forge === null);
}
// no Melted Maker → forging makes no copy
{
	const st = game();
	const cc = toHand(st, 0, 'cyclopian_crusher');
	st.players[0].mana.cur = 5;
	E.forgeCard(st, 0, cc.uid);
	ok('without Melted Maker, no copy is made', st.players[0].hand.length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
