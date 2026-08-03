// Group E ("after you <action>" triggers) wave 1 — attack-again + attack-the-played.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 33) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'hunter', name: 'H', power: null }, { id: 'mage', name: 'M', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = []; st.players[0].life = 30; st.players[1].life = 30;
	return st;
};
const put = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; c.summonedThisTurn = false; c.attacksUsed = 0; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name = 'D') => ({ id: 'dm_' + name, name, type: 'creature', cost: 3, rarity: 'basic', attack: a, health: h });

for (const id of ['swamp_king_dred', 'giant_sand_worm', 'gonk_the_raptor'])
	ok(`${id} carries an ongoing trigger`, cardsById[id].ongoing, id);

// Swamp King Dred: after the OPPONENT plays a creature, attack it
{
	const st = game(); const dred = put(st, 0, 'swamp_king_dred'); // 9/9
	st.players[1].mana.max = 10; st.players[1].mana.cur = 10; st.current = 1;
	const c = E.instantiate(dummy(2, 4, 'Played'), 1); c.zone = 'hand'; st.players[1].hand.push(c);
	E.playCard(st, 1, c.uid, null, null, 0);
	ok('Swamp King Dred: attacked the just-played enemy creature', c.damage === 9 || E.isDead(c), c.damage);
	ok('Dred took the played creature\'s 2 back', dred.damage === 2, dred.damage);
}
// Giant Sand Worm: when it attacks and kills a minion, it may attack again
{
	const st = game(); const worm = put(st, 0, 'giant_sand_worm'); // 8/8
	const a = put(st, 1, null, dummy(1, 3, 'A')); const b = put(st, 1, null, dummy(1, 3, 'B'));
	st.current = 0;
	E.attack(st, 0, worm.uid, { type: 'creature', uid: a.uid, player: 1 });
	ok('Sand Worm killed the first target and refreshed its attack', E.isDead(a) && worm.attacksUsed === 0, [E.isDead(a), worm.attacksUsed]);
	// it can attack again
	ok('Sand Worm can attack again', E.canAttackWith(st, 0, worm));
	E.attack(st, 0, worm.uid, { type: 'creature', uid: b.uid, player: 1 });
	ok('Sand Worm killed the second target too', E.isDead(b), b.damage);
}
// Gonk, the Raptor: after your hero attacks and kills a creature, it may attack again
{
	const st = game(); put(st, 0, 'gonk_the_raptor');
	st.players[0].weapon = { id: 'wpn', name: 'W', type: 'weapon', attack: 5, durability: 5, keywords: [] };
	st.players[0].heroAttacksUsed = 0; st.current = 0;
	const a = put(st, 1, null, dummy(0, 3, 'A'));
	E.heroAttack(st, 0, { type: 'creature', uid: a.uid, player: 1 });
	ok('Gonk: hero killed the minion and hero-attack refreshed', E.isDead(a) && st.players[0].heroAttacksUsed === 0, [E.isDead(a), st.players[0].heroAttacksUsed]);
	ok('Gonk: the hero can attack again', E.canHeroAttack(st, 0));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
