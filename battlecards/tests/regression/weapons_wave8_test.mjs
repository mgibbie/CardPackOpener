// Missing HS weapons — wave 8: weapon Overkill + Ice Breaker (destroy Frozen).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 54) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[0].life = 30; st.players[1].life = 30;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h, ...extra });
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
const swing = (st, foeUid) => { st.players[0].heroAttacksUsed = 0; E.heroAttack(st, 0, { type: 'creature', uid: foeUid, player: 1 }); };

for (const id of ['farraki_battleaxe', 'sul_thraze', 'ice_breaker'])
	ok(`${id} exists`, cardsById[id]?.type === 'weapon', id);

// Farraki Battleaxe (3 Attack): Overkill → give a hand minion +2/+2
{
	const st = game();
	const inHand = E.instantiate(dummy(2, 2, 'H'), 0); inHand.zone = 'hand'; st.players[0].hand.push(inHand);
	const foe = put(st, 1, dummy(0, 1, 'Foe')); // 1 health → 3 dmg is Overkill
	equip(st, 'farraki_battleaxe'); swing(st, foe.uid);
	ok('Farraki: Overkill buffed a hand minion +2/+2', inHand.attack === 4 && inHand.maxHealth === 4, [inHand.attack, inHand.maxHealth]);
}
// No Overkill (exact/under lethal) → no buff
{
	const st = game();
	const inHand = E.instantiate(dummy(2, 2, 'H'), 0); inHand.zone = 'hand'; st.players[0].hand.push(inHand);
	const foe = put(st, 1, dummy(0, 3, 'Foe')); // 3 health, 3 dmg = exact, NOT overkill
	equip(st, 'farraki_battleaxe'); swing(st, foe.uid);
	ok('Farraki: no Overkill on an exact-lethal swing', inHand.attack === 2, inHand.attack);
}
// Sul'thraze (4 Attack): Overkill → you may attack again
{
	const st = game();
	const foe = put(st, 1, dummy(0, 2, 'Foe')); // Overkill
	equip(st, 'sul_thraze'); swing(st, foe.uid);
	ok('Sul\'thraze: Overkill refreshed the hero attack', E.canHeroAttack(st, 0) && st.players[0].heroAttacksUsed === 0, st.players[0].heroAttacksUsed);
}
// Ice Breaker: destroy any Frozen minion it damages
{
	const st = game();
	const frozen = put(st, 1, dummy(0, 8, 'Frozen', { frozen: { turns: 1 } })); frozen.frozen = { turns: 1 };
	equip(st, 'ice_breaker'); swing(st, frozen.uid);
	ok('Ice Breaker destroyed the Frozen minion', E.isDead(frozen) || !st.players[1].board.some(c => c.uid === frozen.uid), frozen.damage);
}
// Ice Breaker does NOT destroy an un-frozen minion
{
	const st = game();
	const warm = put(st, 1, dummy(0, 8, 'Warm'));
	equip(st, 'ice_breaker'); swing(st, warm.uid);
	ok('Ice Breaker leaves an un-frozen minion alive', !E.isDead(warm) && st.players[1].board.some(c => c.uid === warm.uid));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
