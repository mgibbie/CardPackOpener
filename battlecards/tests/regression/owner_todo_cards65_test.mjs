// Sixty-fifth batch from the wiki's owner inbox (owner_todo), 2026-09-11.
//   Batterskull (wastes_batterskull) -> "Swing: Gain 4 Life. Deathrattle: Destroy a random creature you don't control."
//   Scour from Existence (wastes_scour_from_existence) -> "Exile target creature or artifact."
//   (Scour adds a new 'creature-or-artifact' target + artifact-aware exile handler.)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById._v = { id: '_v', name: 'V', type: 'creature', cost: 1, attack: 2, health: 3, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(cardsById, seededRng(65), null, 2,
		[{ id: 'paladin', name: 'A', power: null }, { id: 'paladin', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v']; p.board = []; p.artifacts = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const cast = (st, pi, id, target) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, target ?? null, null); return c; };

// ---- 1) Batterskull: Swing heal + Deathrattle destroy-a-random-enemy ----
{
	const b = cardsById.wastes_batterskull;
	ok('reworded to Swing + Deathrattle', b.description === 'Swing: Gain 4 Life.\nDeathrattle: Destroy a random creature you don\'t control.', b.description);
	ok('keeps the hero-attacks heal 4 ongoing', b.ongoing && b.ongoing.on === 'hero-attacks' && b.ongoing.effects[0].value === 4, JSON.stringify(b.ongoing));
	ok('has a destroy-random Deathrattle', Array.isArray(b.deathrattle) && b.deathrattle[0].type === 'destroy-random', JSON.stringify(b.deathrattle));
	// Swing still heals
	const st = fresh();
	const wp = E.instantiate(b, 0); wp.zone = 'weapon'; wp.durability = 3; st.players[0].weapon = wp;
	st.players[0].life = 20; st.players[0].heroAttacksUsed = 0;
	E.heroAttack(st, 0, { type: 'hero', player: 1 });
	ok('the swing still gains 4 Life (20 -> 24)', st.players[0].life === 24, st.players[0].life);
	// Deathrattle on break: destroy a random enemy creature
	const foe = put(st, 1, '_v');
	E.breakWeapon(st, 0, true);
	E.sweepDeaths(st);
	ok('breaking the weapon destroys an enemy creature', E.isDead(foe) || !st.players[1].board.includes(foe), st.players[1].board.length);
}

// ---- 2) Scour from Existence: exile creature OR artifact ----
{
	const s = cardsById.wastes_scour_from_existence;
	ok('reworded "Exile target creature or artifact."', s.description === 'Exile target creature or artifact.', s.description);
	ok('effect exiles a creature-or-artifact', s.effects[0].type === 'exile' && s.effects[0].target === 'creature-or-artifact', JSON.stringify(s.effects));
	// exile a CREATURE
	{
		const st = fresh();
		const v = put(st, 1, '_v');
		const legal = E.legalTargets(st, 0, E.targetSpec(st, 0, E.instantiate(s, 0)));
		ok('an enemy creature is a legal target', legal.some(x => x.type === 'creature' && x.uid === v.uid), legal.map(x => x.type).join(','));
		cast(st, 0, 'wastes_scour_from_existence', { type: 'creature', uid: v.uid, player: 1 });
		ok('the creature is exiled (gone from board, in exile)', !st.players[1].board.includes(v) && st.players[1].exile.some(x => x.uid === v.uid), [st.players[1].board.length, st.players[1].exile.length].join('/'));
	}
	// exile an ARTIFACT (the new path)
	{
		const st = fresh();
		const art = E.instantiate(cardsById.lucky_horseshoe, 1); art.zone = 'artifact'; st.players[1].artifacts.push(art); E.recomputeAuras(st);
		const legal = E.legalTargets(st, 0, E.targetSpec(st, 0, E.instantiate(s, 0)));
		ok('an enemy artifact is a legal target', legal.some(x => x.type === 'artifact' && x.uid === art.uid), legal.map(x => x.type).join(','));
		cast(st, 0, 'wastes_scour_from_existence', { type: 'artifact', uid: art.uid, player: 1 });
		ok('the artifact is exiled', !st.players[1].artifacts.includes(art) && st.players[1].exile.some(x => x.uid === art.uid), [st.players[1].artifacts.length, st.players[1].exile.length].join('/'));
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
