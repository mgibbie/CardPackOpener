// Sixty-third batch from the wiki's owner inbox (owner_todo), 2026-09-11.
//   Grafted Wargear (wastes_grafted_wargear)     -> renamed "Truesteel Scimitar"
//   Spatial Contortion (wastes_spatial_contortion) -> "Deal 2 damage to any target & Planeshift."
//   Endless Atlas (wastes_endless_atlas)         -> "Draw 2 cards, Gaze 1 & Advance."
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById._v = { id: '_v', name: 'V', type: 'creature', cost: 1, attack: 2, health: 5, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(cardsById, seededRng(63), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const cast = (st, pi, id, target) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, target ?? null, null); return c; };

// ---- 1) Grafted Wargear -> Truesteel Scimitar ----
{
	const w = cardsById.wastes_grafted_wargear;
	ok('renamed "Truesteel Scimitar" (id unchanged)', w.name === 'Truesteel Scimitar', w.name);
	ok('still a 3/2 Swing weapon', w.type === 'weapon' && w.attack === 3 && w.durability === 2 && w.ongoing?.on === 'hero-attacks');
	const st = fresh();
	const c = put(st, 0, '_v');
	const wp = E.instantiate(w, 0); wp.zone = 'weapon'; st.players[0].weapon = wp; st.players[0].heroAttacksUsed = 0;
	E.heroAttack(st, 0, { type: 'hero', player: 1 });
	ok('the swing still buffs your creatures +1 Attack', c.attack === 3, c.attack);
}

// ---- 2) Spatial Contortion: 2 to any target & Planeshift ----
{
	const s = cardsById.wastes_spatial_contortion;
	ok('reworded "Deal 2 damage to any target & Planeshift."', s.description === 'Deal 2 damage to any target & Planeshift.', s.description);
	ok('deals 2 to ANY target now (was creature-only)', s.effects.some(e => e.type === 'damage' && e.value === 2 && e.target === 'any'), JSON.stringify(s.effects));
	ok('and Planeshifts', s.effects.some(e => e.type === 'planeshift'), JSON.stringify(s.effects));
	// FIRE at the enemy hero (proof "any target" reaches the face) + it shifts the plane
	const st = fresh();
	const life0 = st.players[1].life;
	const planeBefore = st.plane || null;
	cast(st, 0, 'wastes_spatial_contortion', { type: 'hero', player: 1 });
	ok('2 damage lands on the enemy hero', st.players[1].life === life0 - 2, [life0, st.players[1].life]);
	ok('a plane is now active (Planeshift fired)', st.plane != null && st.plane !== planeBefore, st.plane);
	// also legal on a creature
	const st2 = fresh();
	const v = put(st2, 1, '_v');
	const legal = E.legalTargets(st2, 0, E.targetSpec(st2, 0, E.instantiate(s, 0)));
	ok('an enemy creature is also a legal target', legal.some(t => t.uid === v.uid), legal.map(t => t.uid ?? t.type).join(','));
}

// ---- 3) Endless Atlas: Draw 2, Gaze 1 & Advance ----
{
	const a = cardsById.wastes_endless_atlas;
	ok('reworded "Draw 2 cards, Gaze 1 & Advance."', a.description === 'Draw 2 cards, Gaze 1 & Advance.', a.description);
	ok('the effect list is draw 2 + gaze 1 + advance', a.effects.length === 3 && a.effects[0].type === 'draw' && a.effects[0].value === 2 && a.effects[1].type === 'gaze' && a.effects[1].value === 1 && a.effects[2].type === 'advance', JSON.stringify(a.effects));
	const st = fresh();
	const h0 = st.players[0].hand.length;
	cast(st, 0, 'wastes_endless_atlas', null);
	ok('it drew 2 cards', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]);
	// Gaze queues a scry-style look; the remaining effects (Advance) defer until it resolves
	ok('Gaze queued a look', st.scryQueue.length === 1, st.scryQueue.length);
	E.resolveScry(st, []); // keep the looked-at card on top
	ok('after the Gaze resolves, Advance queues a dungeon-enter pick', st.pickQueue.some(p => p.mode === 'advance'), st.pickQueue.map(p => p.mode).join(','));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
