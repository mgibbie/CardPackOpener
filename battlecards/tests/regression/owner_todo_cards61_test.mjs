// Sixty-first batch from the wiki's owner inbox (owner_todo), 2026-09-11.
//   Loxodon Warhammer (wastes_loxodon_warhammer) -> "Swing: Gain 3 Life." (reword; mechanic unchanged)
//   Dusk Legion Zealot (dusk_legion_zealot)      -> "Battlecry: Draw a card & lose 1 Life." (reword; mechanic unchanged)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(cardsById, seededRng(61), null, 2,
		[{ id: 'paladin', name: 'A', power: null }, { id: 'paladin', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v']; p.board = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	cardsById._v = { id: '_v', name: 'V', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };

// ---- 1) Loxodon Warhammer: "Swing: Gain 3 Life." ----
{
	const w = cardsById.wastes_loxodon_warhammer;
	ok('reworded to "Swing: Gain 3 Life."', w.description === 'Swing: Gain 3 Life.', w.description);
	ok('still a 3/3 weapon on the hero-attacks trigger', w.type === 'weapon' && w.attack === 3 && w.durability === 3 && w.ongoing?.on === 'hero-attacks', JSON.stringify(w.ongoing));
	const st = fresh();
	const wp = E.instantiate(w, 0); wp.zone = 'weapon'; st.players[0].weapon = wp;
	st.players[0].life = 20; st.players[0].heroAttacksUsed = 0;
	E.heroAttack(st, 0, { type: 'hero', player: 1 });
	ok('the swing still gains 3 Life (20 -> 23)', st.players[0].life === 23, st.players[0].life);
}

// ---- 2) Dusk Legion Zealot: "Battlecry: Draw a card & lose 1 Life." ----
{
	const z = cardsById.dusk_legion_zealot;
	ok('reworded to "Battlecry: Draw a card & lose 1 Life."', z.description === 'Battlecry: Draw a card & lose 1 Life.', z.description);
	ok('still draws + self-damages', (z.effects || []).some(e => e.type === 'draw') && (z.effects || []).some(e => e.type === 'damage' && e.target === 'own-hero'), JSON.stringify(z.effects));
	const st = fresh();
	st.players[0].life = 20;
	const c = E.instantiate(z, 0); c.zone = 'hand'; st.players[0].hand.push(c);
	const handBefore = st.players[0].hand.length; // includes the Zealot itself
	E.playCard(st, 0, c.uid, null, null);
	ok('the Battlecry drew a card', st.players[0].hand.length === handBefore, [handBefore, st.players[0].hand.length]); // -1 for the Zealot leaving hand, +1 drawn
	ok('and cost 1 Life (20 -> 19)', st.players[0].life === 19, st.players[0].life);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
