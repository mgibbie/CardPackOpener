// Wave 33: Stardust Scythe — after your hero attacks, get a Void Soul. Void Soul
// summons a random 1-Cost Demon and improves your future Void Souls (+1 Cost each).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 4) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'demonhunter', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = 'demonhunter'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
const playVoidSoul = (st) => { const s = E.instantiate(cardsById.void_soul, 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10; const before = st.players[0].board.filter(c => c.type === 'creature').length; E.playCard(st, 0, s.uid, null, null, 0); const now = st.players[0].board.filter(c => c.type === 'creature'); return now[now.length - 1]; };

for (const id of ['void_soul', 'stardust_scythe']) ok(`${id} exists`, cardsById[id], id);

// Stardust Scythe: after the hero attacks, a Void Soul appears in hand
{
	const st = game();
	equip(st, 'stardust_scythe');
	const handBefore = st.players[0].hand.length;
	E.heroAttack(st, 0, { type: 'hero', player: 1 });
	ok('got a Void Soul after attacking', st.players[0].hand.some(c => c.id === 'void_soul'), st.players[0].hand.map(c => c.id));
	ok('hand grew by exactly one', st.players[0].hand.length === handBefore + 1, [handBefore, st.players[0].hand.length]);
}

// Void Soul summons a 1-Cost Demon, and each subsequent one costs +1 more
{
	const st = game();
	const d1 = playVoidSoul(st);
	ok('first Void Soul summoned a 1-Cost Demon', d1 && (cardsById[d1.id].cost === 1) && (cardsById[d1.id].tribe || '').includes('Demon'), d1 && [d1.id, cardsById[d1.id]?.cost, cardsById[d1.id]?.tribe]);
	ok('voidSoulImprove incremented to 1', st.players[0].voidSoulImprove === 1, st.players[0].voidSoulImprove);
	const d2 = playVoidSoul(st);
	ok('second Void Soul summoned a 2-Cost Demon', d2 && (cardsById[d2.id].cost === 2) && (cardsById[d2.id].tribe || '').includes('Demon'), d2 && [d2.id, cardsById[d2.id]?.cost]);
	const d3 = playVoidSoul(st);
	ok('third Void Soul summoned a 3-Cost Demon', d3 && (cardsById[d3.id].cost === 3) && (cardsById[d3.id].tribe || '').includes('Demon'), d3 && [d3.id, cardsById[d3.id]?.cost]);
	ok('voidSoulImprove is now 3', st.players[0].voidSoulImprove === 3, st.players[0].voidSoulImprove);
}

// End-to-end: attack twice, play both Void Souls -> 1-cost then 2-cost Demon
{
	const st = game();
	equip(st, 'stardust_scythe');
	E.heroAttack(st, 0, { type: 'hero', player: 1 });
	// refresh the attack for a second swing
	st.players[0].heroAttacksUsed = 0;
	E.heroAttack(st, 0, { type: 'hero', player: 1 });
	const souls = st.players[0].hand.filter(c => c.id === 'void_soul');
	ok('two hero attacks yielded two Void Souls', souls.length === 2, souls.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
