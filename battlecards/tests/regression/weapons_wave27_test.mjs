// Wave 27: Sphere of Sapience — at the start of your turn, look at your top card;
// you MAY bottom it, and only then lose 1 Durability.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

cardsById.t_fill = { id: 't_fill', name: 'Fill', type: 'creature', cost: 1, attack: 1, health: 1 };
const game = (seed = 8) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = 'mage'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	st.players[0].deck = Array(12).fill('t_fill');
	st.players[1].deck = Array(12).fill('t_fill');
	return st;
};
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
const cycleTurn = (st) => { E.endTurn(st); E.endTurn(st); };

ok('sphere_of_sapience exists', cardsById.sphere_of_sapience);

// Start of your turn: a 1-card scry is queued
{
	const st = game();
	const w = equip(st, 'sphere_of_sapience');
	ok('equipped Sphere of Sapience at 0/4', w && w.durability === 4, w && w.durability);
	cycleTurn(st);
	ok('a 1-card scry was queued at turn start', st.scryQueue.length === 1 && st.scryQueue[0].ids.length === 1, st.scryQueue.length && st.scryQueue[0]?.ids.length);
}

// If you BOTTOM the card, the weapon loses 1 Durability (4 -> 3)
{
	const st = game();
	equip(st, 'sphere_of_sapience');
	cycleTurn(st);
	const topId = st.scryQueue[0].ids[0];
	E.resolveScry(st, [{ id: topId, bottom: true }]);
	ok('bottoming the card cost 1 Durability (4 -> 3)', st.players[0].weapon && st.players[0].weapon.durability === 3, st.players[0].weapon?.durability);
}

// If you KEEP the card on top, NO Durability is lost
{
	const st = game();
	equip(st, 'sphere_of_sapience');
	cycleTurn(st);
	const topId = st.scryQueue[0].ids[0];
	E.resolveScry(st, [{ id: topId, bottom: false }]);
	ok('keeping the card costs no Durability (still 4)', st.players[0].weapon && st.players[0].weapon.durability === 4, st.players[0].weapon?.durability);
}

// Over 4 bottoms the weapon wears out and breaks
{
	const st = game();
	equip(st, 'sphere_of_sapience');
	for (let i = 0; i < 4; i++) {
		cycleTurn(st);
		if (!st.scryQueue.length) break;
		const topId = st.scryQueue[0].ids[0];
		E.resolveScry(st, [{ id: topId, bottom: true }]);
	}
	ok('after 4 bottoms the weapon has broken (gone)', !st.players[0].weapon, st.players[0].weapon && st.players[0].weapon.durability);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
