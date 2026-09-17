// Sixty-fourth batch from the wiki's owner inbox (owner_todo), 2026-09-11.
//   Vile Aggregate (wastes_vile_aggregate)   -> "Trample. Alliance: Gain +1 Attack." (summoned -> Alliance/creature-played)
//   Endbringer (wastes_endbringer)           -> "Battlecry: Draw a card & Deal 2 damage to any target." (1->2, creature->any)
//   Titan's Presence (wastes_titans_presence) -> "Destroy target creature or planeswalker. Planeshift & Discover an Eldrazi."
//   (the last one adds a new 'creature-or-walker' destroy target + walker-aware destroy handler)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById._v = { id: '_v', name: 'V', type: 'creature', cost: 1, attack: 2, health: 5, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(cardsById, seededRng(64), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v']; p.board = []; p.planeswalkers = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const cast = (st, pi, id, target) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, target ?? null, null); return c; };

// ---- 1) Vile Aggregate: Alliance ----
{
	const v = cardsById.wastes_vile_aggregate;
	ok('reworded "Trample. Alliance: Gain +1 Attack."', v.description === 'Trample.\nAlliance: Gain +1 Attack.', v.description);
	ok('the trigger is Alliance (creature-played)', v.ongoing && v.ongoing.on === 'creature-played' && v.ongoing.effects[0].type === 'buff-self' && v.ongoing.effects[0].attack === 1, JSON.stringify(v.ongoing));
	const st = fresh();
	const agg = put(st, 0, 'wastes_vile_aggregate');
	const a0 = agg.attack;
	cast(st, 0, '_v'); // play another creature -> Alliance
	ok('playing another creature gives it +1 Attack', agg.attack === a0 + 1, [a0, agg.attack]);
}

// ---- 2) Endbringer: Draw + 2 to any target ----
{
	const e = cardsById.wastes_endbringer;
	ok('reworded "Battlecry: Draw a card & Deal 2 damage to any target."', e.description === 'Battlecry: Draw a card & Deal 2 damage to any target.', e.description);
	ok('effects are draw 1 + 2 damage to any', e.effects[0].type === 'draw' && e.effects.some(x => x.type === 'damage' && x.value === 2 && x.target === 'any'), JSON.stringify(e.effects));
	const st = fresh();
	const h0 = st.players[0].hand.length, life0 = st.players[1].life;
	cast(st, 0, 'wastes_endbringer', { type: 'hero', player: 1 }); // aim the Battlecry at the enemy face
	ok('it drew a card + dealt 2 to the enemy hero', st.players[0].hand.length === h0 + 1 && st.players[1].life === life0 - 2, [h0, st.players[0].hand.length, life0, st.players[1].life].join(','));
}

// ---- 3) Titan's Presence: destroy creature OR planeswalker, Planeshift, Discover an Eldrazi ----
{
	const t = cardsById.wastes_titans_presence;
	ok('reworded destroy creature/walker + Planeshift + Discover Eldrazi', t.description === 'Destroy target creature or planeswalker.\nPlaneshift & Discover an Eldrazi.', t.description);
	ok('effects: destroy(creature-or-walker) + planeshift + discover Eldrazi', t.effects[0].type === 'destroy' && t.effects[0].target === 'creature-or-walker' && t.effects.some(x => x.type === 'planeshift') && t.effects.some(x => x.type === 'discover' && x.tribe === 'Eldrazi'), JSON.stringify(t.effects));
	// destroy a CREATURE
	{
		const st = fresh();
		const v = put(st, 1, '_v');
		const legal = E.legalTargets(st, 0, E.targetSpec(st, 0, E.instantiate(t, 0)));
		ok('an enemy creature is a legal target', legal.some(x => x.type === 'creature' && x.uid === v.uid), legal.map(x => x.type).join(','));
		cast(st, 0, 'wastes_titans_presence', { type: 'creature', uid: v.uid, player: 1 });
		ok('the targeted creature is destroyed', E.isDead(v) || !st.players[1].board.includes(v), st.players[1].board.length);
		ok('and the plane shifted', st.plane != null, st.plane);
		ok('and a Discover was queued (Eldrazi)', st.pickQueue.some(p => p.discover), st.pickQueue.map(p => p.mode || 'discover').join(','));
	}
	// destroy a PLANESWALKER (the new path)
	{
		const st = fresh();
		const pw = E.instantiate(cardsById.marshal_ironstar, 1); pw.zone = 'planeswalker'; st.players[1].planeswalkers.push(pw);
		const legal = E.legalTargets(st, 0, E.targetSpec(st, 0, E.instantiate(t, 0)));
		ok('an enemy planeswalker is a legal target', legal.some(x => x.type === 'walker' && x.uid === pw.uid), legal.map(x => x.type).join(','));
		cast(st, 0, 'wastes_titans_presence', { type: 'walker', uid: pw.uid, player: 1 });
		ok('the targeted planeswalker is destroyed', !st.players[1].planeswalkers.includes(pw), st.players[1].planeswalkers.length);
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
