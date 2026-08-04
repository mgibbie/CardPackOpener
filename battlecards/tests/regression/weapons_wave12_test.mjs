// Missing HS weapons — wave 12: Trueaim Crescent (minions pile on) + Dreadlord's Bite (Outcast AoE).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 58) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[0].life = 30; st.players[1].life = 30;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h, ...extra });
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };

for (const id of ['trueaim_crescent', 'dreadlord_s_bite']) ok(`${id} exists`, cardsById[id]?.type === 'weapon', id);

// Trueaim Crescent (1 Attack): after the hero attacks a minion, your minions attack it too
{
	const st = game();
	const a = put(st, 0, dummy(2, 2, 'A')); const b = put(st, 0, dummy(3, 2, 'B'));
	const foe = put(st, 1, dummy(0, 12, 'Foe'));
	const w = equip(st, 'trueaim_crescent'); st.players[0].heroAttacksUsed = 0;
	E.heroAttack(st, 0, { type: 'creature', uid: foe.uid, player: 1 });
	// hero(1) + A(2) + B(3) = 6 damage piled onto the foe
	ok('Trueaim Crescent: hero swing + both minions piled onto the target', foe.damage === 1 + 2 + 3, foe.damage);
	ok('the target survived at 12 − 6 = 6 Health', !E.isDead(foe) && E.hp(foe) === 6, E.hp(foe));
}
// Dreadlord's Bite: Outcast — deal 1 to all enemies (minions + hero)
{
	const st = game();
	const m1 = put(st, 1, dummy(0, 3, 'M1')); const m2 = put(st, 1, dummy(0, 3, 'M2'));
	// play it as the only card in hand → hand's edge → Outcast active
	const w = E.instantiate(cardsById.dreadlord_s_bite, 0); w.zone = 'hand'; st.players[0].hand = [w]; st.players[0].mana.cur = 10;
	E.playCard(st, 0, w.uid, null, null, 0);
	ok('Dreadlord\'s Bite Outcast dealt 1 to all enemy minions', m1.damage === 1 && m2.damage === 1, [m1.damage, m2.damage]);
	ok('Dreadlord\'s Bite Outcast dealt 1 to the enemy hero', st.players[1].life === 29, st.players[1].life);
}
// no Outcast when NOT played from the edge → no AoE
{
	const st = game();
	const m1 = put(st, 1, dummy(0, 3, 'M1'));
	const filler1 = E.instantiate({ id: 'f1', name: 'f', type: 'sorcery', cost: 0, effects: [] }, 0); filler1.zone = 'hand';
	const w = E.instantiate(cardsById.dreadlord_s_bite, 0); w.zone = 'hand';
	const filler2 = E.instantiate({ id: 'f2', name: 'f', type: 'sorcery', cost: 0, effects: [] }, 0); filler2.zone = 'hand';
	st.players[0].hand = [filler1, w, filler2]; st.players[0].mana.cur = 10; // w is in the middle → not Outcast
	E.playCard(st, 0, w.uid, null, null, 0);
	ok('no Outcast from the middle of hand: no AoE', m1.damage === 0, m1.damage);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
