// Sixty-second batch from the wiki's owner inbox (owner_todo), 2026-09-11.
//   Sword of Fire and Ice (wastes_sword_of_fire_and_ice) -> "Swing: Draw a card & each opponent loses 2 Life." (reword; mechanic unchanged)
//   Boon of Erebos (boon_of_erebos)                       -> "Target creature gains +2/+2 & Lifesteal." (reword)
//   Scourgemark of Erebos (scourgemark_of_erebos)         -> "Draw a card & Target creature gains +1/+3." (health buff +2 -> +3)
//   Erebos's Titan (erebos_titan)                         -> 6/8 for 6, add the Undead tribe (keep Reborn & Trample)
//   Hazoret's Zeal (hazorets_zeal)                        -> "Target creature gains +2/+1 & Charge." (reword)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById._v = { id: '_v', name: 'V', type: 'creature', cost: 1, attack: 2, health: 3, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(cardsById, seededRng(62), null, 2,
		[{ id: 'paladin', name: 'A', power: null }, { id: 'paladin', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v']; p.board = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const cast = (st, pi, id, target) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, target ?? null, null); return c; };

// ---- 1) Sword of Fire and Ice: reworded, mechanic unchanged ----
{
	const w = cardsById.wastes_sword_of_fire_and_ice;
	ok('Sword reworded to "each opponent loses 2 Life"', w.description === 'Swing: Draw a card & each opponent loses 2 Life.', w.description);
	const st = fresh();
	const wp = E.instantiate(w, 0); wp.zone = 'weapon'; st.players[0].weapon = wp; st.players[0].heroAttacksUsed = 0;
	const life0 = st.players[1].life, h0 = st.players[0].hand.length;
	E.heroAttack(st, 0, { type: 'hero', player: 1 });
	// a real swing lands the 2-Attack weapon hit AND the ongoing (draw + 2 life loss) = 4 total
	ok('the swing draws + costs each opponent 2 Life (on top of the 2-Attack hit)', st.players[1].life === life0 - 4 && st.players[0].hand.length === h0 + 1, [life0, st.players[1].life, h0, st.players[0].hand.length].join(','));
}

// ---- 2) Boon of Erebos: reworded, +2/+2 & Lifesteal ----
{
	const b = cardsById.boon_of_erebos;
	ok('Boon reworded to "Target creature gains +2/+2 & Lifesteal."', b.description === 'Target creature gains +2/+2 & Lifesteal.', b.description);
	const st = fresh();
	const v = put(st, 0, '_v');
	cast(st, 0, 'boon_of_erebos', { type: 'creature', uid: v.uid, player: 0 });
	ok('gives +2/+2 and Lifesteal', v.attack === 4 && v.maxHealth === 5 && (v.keywords || []).includes('lifesteal'), [v.attack, v.maxHealth, v.keywords].join('|'));
}

// ---- 3) Scourgemark of Erebos: +1/+3 now ----
{
	const s = cardsById.scourgemark_of_erebos;
	ok('Scourgemark reworded, draw-first', s.description === 'Draw a card & Target creature gains +1/+3.', s.description);
	ok('the buff is +1/+3 (health raised from +2)', s.effects.some(e => e.type === 'buff' && e.attack === 1 && e.health === 3), JSON.stringify(s.effects));
	const st = fresh();
	const v = put(st, 0, '_v');
	const h0 = st.players[0].hand.length;
	cast(st, 0, 'scourgemark_of_erebos', { type: 'creature', uid: v.uid, player: 0 });
	ok('fires: +1/+3 on the target and a draw', v.attack === 3 && v.maxHealth === 6 && st.players[0].hand.length === h0 + 1, [v.attack, v.maxHealth, h0, st.players[0].hand.length].join(','));
}

// ---- 4) Erebos's Titan: 6/8 for 6, Undead ----
{
	const t = cardsById.erebos_titan;
	ok('Titan is a 6/8 for 6', t.cost === 6 && t.attack === 6 && t.health === 8, [t.cost, t.attack, t.health].join('/'));
	ok('Titan gained the Undead tribe', t.tribe === 'Undead', t.tribe);
	ok('Titan keeps Reborn & Trample', (t.keywords || []).includes('reborn') && (t.keywords || []).includes('trample'), JSON.stringify(t.keywords));
	const st = fresh();
	const c = put(st, 0, 'erebos_titan');
	E.execEffects(st, 0, [{ type: 'buff', target: 'friendly-creatures', tribe: 'Undead', attack: 1, health: 1 }], null, null);
	ok('Undead-tribal buffs now hit it', c.attack === 7 && c.maxHealth === 9, [c.attack, c.maxHealth].join('/'));
}

// ---- 5) Hazoret's Zeal: reworded, +2/+1 & Charge ----
{
	const z = cardsById.hazorets_zeal;
	ok('Zeal reworded to "Target creature gains +2/+1 & Charge."', z.description === 'Target creature gains +2/+1 & Charge.', z.description);
	const st = fresh();
	const v = put(st, 0, '_v');
	cast(st, 0, 'hazorets_zeal', { type: 'creature', uid: v.uid, player: 0 });
	ok('gives +2/+1 and Charge', v.attack === 4 && v.maxHealth === 4 && (v.keywords || []).includes('charge'), [v.attack, v.maxHealth, v.keywords].join('|'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
