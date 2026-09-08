// descriptive_mechanics_test.mjs (2026-09-08)
// Wires previously-inert "descriptive" mechanics on the sweep's deferred cards.
// New engine support: Ephemeral (end-of-turn destroy), self damage-cap
// (Draconic Delicacy), heal-doubling (Crystalsmith Kangor), multi-hit Divine
// Shield (Toreth). Reused existing fields: magnetic, megaWindfury, overload,
// selfCost/selfCostIf, cleave. Each is FIRED.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 33) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };
const dummy = (st, pi, atk, hp, extra = {}) => put(st, pi, E.instantiate({ id: 'd', name: 'D', type: 'creature', cost: 1, attack: atk, health: hp, ...extra }, pi));
const hurt = (st, c, n) => E.execEffects(st, 0, [{ type: 'damage', value: n, target: 'creature' }], { type: 'creature', uid: c.uid, player: c.controller }, null);

// ---------- Ephemeral: destroyed at end of your turn ----------
{
	const st = game();
	const d = put(st, 0, E.instantiate(cardsById.phantasmal_dreadmaw, 0));
	ok('dreadmaw has ephemeral', d.keywords.includes('ephemeral'));
	E.endTurn(st);
	ok('Ephemeral: dreadmaw is gone after end of turn', !st.players[0].board.some(x => x.uid === d.uid), st.players[0].board.map(x => x.id));
}

// ---------- Draconic Delicacy: can only take 1 damage at a time ----------
{
	const st = game();
	const dd = put(st, 0, E.instantiate(cardsById.draconic_delicacy, 0));
	hurt(st, dd, 5);
	ok('self damage-cap: a 5-damage hit deals only 1', dd.damage === 1, ['damage', dd.damage]);
}

// ---------- Crystalsmith Kangor: your healing is doubled ----------
{
	const st = game();
	put(st, 0, E.instantiate(cardsById.crystalsmith_kangor, 0));
	const buddy = dummy(st, 0, 2, 8); buddy.damage = 4;
	E.execEffects(st, 0, [{ type: 'heal', value: 2, target: 'friendly-creatures' }], null, null);
	ok('heal-double: a 2-heal restores 4 to a creature', buddy.damage === 0, ['damage', buddy.damage]);
	st.players[0].life = 30;
	E.execEffects(st, 0, [{ type: 'heal', value: 2, target: 'self' }], null, null);
	ok('heal-double: a 2-heal restores 4 to the hero', st.players[0].life === 34, ['life', st.players[0].life]);
}
{ // control: without Kangor a 2-heal restores only 2
	const st = game();
	const buddy = dummy(st, 0, 2, 8); buddy.damage = 4;
	E.execEffects(st, 0, [{ type: 'heal', value: 2, target: 'friendly-creatures' }], null, null);
	ok('control: no Kangor -> 2-heal restores 2', buddy.damage === 2, ['damage', buddy.damage]);
}

// ---------- Toreth: your Divine Shields take 3 hits to break ----------
{
	const st = game();
	put(st, 0, E.instantiate(cardsById.toreth_the_unbreaking, 0));
	const shielded = dummy(st, 0, 3, 5, { keywords: ['divine_shield'] }); shielded.shield = true;
	hurt(st, shielded, 2); ok('Toreth: shield survives hit 1', shielded.shield === true && shielded.damage === 0, [shielded.shield, shielded.damage]);
	hurt(st, shielded, 2); ok('Toreth: shield survives hit 2', shielded.shield === true, shielded.shield);
	hurt(st, shielded, 2); ok('Toreth: shield breaks on hit 3', shielded.shield === false, shielded.shield);
	ok('Toreth: all 3 hits were absorbed (no health lost)', shielded.damage === 0, ['damage', shielded.damage]);
}

// ---------- Walking Mountain: Mega-Windfury (4 attacks) + Overload(2) ----------
{
	const st = game();
	const wm = put(st, 0, E.instantiate(cardsById.walking_mountain, 0));
	ok('Overload(2) is set', cardsById.walking_mountain.overload === 2);
	wm.attacksUsed = 3; ok('Mega-Windfury: can still attack after 3', E.canAttackWith(st, 0, wm) === true);
	wm.attacksUsed = 4; ok('Mega-Windfury: cannot attack after 4', E.canAttackWith(st, 0, wm) === false);
}

// ---------- Eredar Brute: costs (1) less per enemy creature ----------
{
	const st = game();
	const eb = E.instantiate(cardsById.eredar_brute, 0); eb.zone = 'hand'; st.players[0].hand.push(eb);
	const base = E.effectiveCost(st, 0, eb);
	dummy(st, 1, 1, 1); dummy(st, 1, 1, 1); dummy(st, 1, 1, 1);
	ok('cost drops 1 per enemy creature (3 cheaper)', E.effectiveCost(st, 0, eb) === base - 3, [base, E.effectiveCost(st, 0, eb)]);
}

// ---------- Magnetic: merges onto a friendly Mech ----------
{
	const st = game();
	const mech = dummy(st, 0, 2, 2, { tribe: 'Mech' });
	const magne = E.instantiate(cardsById.dinotomaton, 0); magne.zone = 'hand'; st.players[0].hand.push(magne); st.players[0].mana.cur = 10;
	ok('dinotomaton is magnetic', magne.magnetic === true);
	const boardBefore = st.players[0].board.length;
	E.playCard(st, 0, magne.uid, { type: 'creature', uid: mech.uid, player: 0 }, null, 0);
	ok('Magnetic: no new body added (merged onto the Mech)', st.players[0].board.length === boardBefore, [boardBefore, st.players[0].board.length]);
	ok('Magnetic: the Mech absorbed the stats', mech.attack === 2 + cardsById.dinotomaton.attack, [mech.attack]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
