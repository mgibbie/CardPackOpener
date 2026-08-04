// Missing HS weapons — wave 6: conditional dynamic attack (Armor/Overload),
// no-durability-loss conditions, deathrattle grant-to-all, hero-attacks cost cut.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 52) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[0].life = 30; st.players[1].life = 30;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h, ...extra });
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
const HAV = (st) => E.heroAttackValue(st, st.players[0]);

for (const id of ['rimefang_sword', 'likkim', 'spiked_wheel', 'stormhammer', 'climbing_hook', 'serrated_tooth'])
	ok(`${id} exists`, cardsById[id]?.type === 'weapon', id);

// Spiked Wheel: +3 Attack while your hero has Armor
{
	const st = game(); const w = equip(st, 'spiked_wheel'); const base = w.attack;
	st.players[0].armor = 0;
	ok('Spiked Wheel: base Attack with no Armor', HAV(st) === base, HAV(st));
	st.players[0].armor = 4;
	ok('Spiked Wheel: +3 Attack with Armor', HAV(st) === base + 3, HAV(st));
}
// Likkim: +2 Attack while you have Overloaded Mana Crystals
{
	const st = game(); const w = equip(st, 'likkim'); const base = w.attack;
	st.players[0].overloadLockedThisTurn = 0;
	ok('Likkim: base Attack without Overload', HAV(st) === base, HAV(st));
	st.players[0].overloadLockedThisTurn = 2;
	ok('Likkim: +2 Attack while Overloaded', HAV(st) === base + 2, HAV(st));
}
// Stormhammer: doesn't lose Durability while you control a Dragon
{
	const st = game(); const foe = put(st, 1, dummy(0, 5, 'Foe')); put(st, 0, dummy(2, 2, 'Drake', { tribe: 'Dragon' }));
	const w = equip(st, 'stormhammer'); const d0 = w.durability;
	st.players[0].heroAttacksUsed = 0; E.heroAttack(st, 0, { type: 'creature', uid: foe.uid, player: 1 });
	ok('Stormhammer kept full Durability (Dragon on board)', st.players[0].weapon.durability === d0, [d0, st.players[0].weapon?.durability]);
}
// Stormhammer DOES lose durability without a Dragon
{
	const st = game(); const foe = put(st, 1, dummy(0, 5, 'Foe'));
	const w = equip(st, 'stormhammer'); const d0 = w.durability;
	st.players[0].heroAttacksUsed = 0; E.heroAttack(st, 0, { type: 'creature', uid: foe.uid, player: 1 });
	ok('Stormhammer lost 1 Durability with no Dragon', st.players[0].weapon.durability === d0 - 1, st.players[0].weapon?.durability);
}
// Climbing Hook: no Durability loss while you control a 5+ Attack minion
{
	const st = game(); const foe = put(st, 1, dummy(0, 9, 'Foe')); put(st, 0, dummy(5, 5, 'Big'));
	const w = equip(st, 'climbing_hook'); const d0 = w.durability;
	st.players[0].heroAttacksUsed = 0; E.heroAttack(st, 0, { type: 'creature', uid: foe.uid, player: 1 });
	ok('Climbing Hook kept Durability (5-Attack minion)', st.players[0].weapon.durability === d0, [d0, st.players[0].weapon?.durability]);
}
// Serrated Tooth: Deathrattle give your minions Rush
{
	const st = game(); const a = put(st, 0, dummy(2, 2, 'A')); const b = put(st, 0, dummy(2, 2, 'B'));
	equip(st, 'serrated_tooth'); E.breakWeapon(st, 0);
	ok('Serrated Tooth gave all your minions Rush', (a.keywords || []).includes('rush') && (b.keywords || []).includes('rush'), [a.keywords, b.keywords]);
}
// Rimefang Sword: after hero attacks, reduce a hand spell's Cost by 1
{
	const st = game(); const foe = put(st, 1, dummy(0, 5, 'Foe'));
	const sp = E.instantiate({ id: 't_sp', name: 'Sp', type: 'sorcery', cost: 4, effects: [] }, 0); sp.zone = 'hand'; st.players[0].hand.push(sp);
	equip(st, 'rimefang_sword'); st.players[0].heroAttacksUsed = 0;
	E.heroAttack(st, 0, { type: 'creature', uid: foe.uid, player: 1 });
	ok('Rimefang Sword reduced a hand spell by 1 (4→3)', sp.cost === 3, sp.cost);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
