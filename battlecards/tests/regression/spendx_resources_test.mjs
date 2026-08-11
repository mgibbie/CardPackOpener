// Spend-X resources family: Reckless Flurry + Shellnado + Part Scrapper (armor),
// Crescendo (fatigue), Corpse Farm (corpses), Overdraft (overload).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

byId.t_armor = { id: 't_armor', name: 'Plate', type: 'sorcery', cost: 0, effects: [{ type: 'armor', value: 4 }] };
byId.t_tank = { id: 't_tank', name: 'Tank', type: 'creature', cost: 1, attack: 1, health: 9 };
byId.t_shielded = { id: 't_shielded', name: 'Shieldy', type: 'creature', cost: 1, attack: 1, health: 9, keywords: ['divine_shield'] };
byId.t_mech = { id: 't_mech', name: 'Mechy', type: 'creature', cost: 5, attack: 3, health: 3, tribe: 'Mech' };

function game() {
	const st = E.createGame(byId, seededRng(21), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.board = []; p.deck = ['t_tank', 't_tank', 't_tank']; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
}
function put(st, pi, id) {
	const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false;
	st.players[pi].board.push(c); E.recomputeAuras(st); return c;
}
function cast(st, id, tgt = null) {
	const sp = E.instantiate(byId[id], 0); sp.zone = 'hand';
	st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, tgt, null, 0); return sp;
}

// --- Reckless Flurry: all armor -> that much damage to ALL minions ---
{
	const st = game();
	cast(st, 't_armor'); // +4 armor
	const mine = put(st, 0, 't_tank'), theirs = put(st, 1, 't_tank');
	cast(st, 'reckless_flurry');
	ok('flurry: armor all spent', st.players[0].armor === 0, st.players[0].armor);
	ok('flurry: friendly minion took 4', E.hp(mine) === 5, E.hp(mine));
	ok('flurry: enemy minion took 4', E.hp(theirs) === 5, E.hp(theirs));
}
// --- Reckless Flurry with 0 armor: nothing happens ---
{
	const st = game();
	const m = put(st, 1, 't_tank');
	cast(st, 'reckless_flurry');
	ok('flurry @0 armor: no damage', E.hp(m) === 9, E.hp(m));
}
// --- Shellnado: caps at 5, per-point hits pop Divine Shield then keep damaging ---
{
	const st = game();
	cast(st, 't_armor'); cast(st, 't_armor'); // 8 armor
	const sh = put(st, 1, 't_shielded'); sh.shield = true;
	cast(st, 'shellnado');
	ok('shellnado: spent only 5 of 8 armor', st.players[0].armor === 3, st.players[0].armor);
	ok('shellnado: shield popped by a point-hit', sh.shield === false);
	ok('shellnado: took the remaining 4 as singles', E.hp(sh) === 5, E.hp(sh));
}
// --- Part Scrapper: armor -> your next Mech discount, consumed once ---
{
	const st = game();
	cast(st, 't_armor'); // 4 armor
	cast(st, 'part_scrapper'); // spends up to 5 -> 4
	ok('scrapper: armor spent', st.players[0].armor === 0, st.players[0].armor);
	const mech = E.instantiate(byId.t_mech, 0); mech.zone = 'hand'; st.players[0].hand.push(mech);
	ok('scrapper: next Mech costs 4 less', E.effectiveCost(st, 0, mech) === 1, E.effectiveCost(st, 0, mech));
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, mech.uid, null, null, 0);
	const mech2 = E.instantiate(byId.t_mech, 0); mech2.zone = 'hand'; st.players[0].hand.push(mech2);
	ok('scrapper: discount consumed by the first Mech', E.effectiveCost(st, 0, mech2) === 5, E.effectiveCost(st, 0, mech2));
}
// --- Crescendo: escalating fatigue to self, that much to ALL enemies ---
{
	const st = game();
	const em = put(st, 1, 't_tank');
	const myLife = st.players[0].life, theirLife = st.players[1].life;
	cast(st, 'crescendo');
	ok('crescendo 1: took 1 fatigue', st.players[0].fatigue === 1 && st.players[0].life === myLife - 1, [st.players[0].fatigue, st.players[0].life]);
	ok('crescendo 1: enemies took 1', st.players[1].life === theirLife - 1 && E.hp(em) === 8, [st.players[1].life, E.hp(em)]);
	cast(st, 'crescendo');
	ok('crescendo 2: escalates to 2', st.players[0].fatigue === 2 && st.players[0].life === myLife - 3 && st.players[1].life === theirLife - 3, [st.players[0].fatigue, st.players[0].life]);
	ok('crescendo 2: minion at 6', E.hp(em) === 6, E.hp(em));
}
// --- Corpse Farm: spend up to 8 corpses, create a random minion of that cost ---
{
	const st = game();
	st.players[0].corpses = 5;
	cast(st, 'corpse_farm');
	ok('corpse farm: corpses spent', st.players[0].corpses === 0, st.players[0].corpses);
	const made = st.players[0].board[0];
	ok('corpse farm: created a 5-cost minion', !!made && (byId[made.id]?.cost ?? made.cost) === 5, made && made.id);
}
// --- Overdraft: unlock locked+pending crystals, deal that much to the target ---
{
	const st = game();
	st.players[0].overloadLockedThisTurn = 2; st.players[0].overloadPending = 1;
	const theirLife = st.players[1].life;
	const sp = E.instantiate(byId.overdraft, 0); sp.zone = 'hand'; st.players[0].hand.push(sp);
	st.players[0].mana.cur = 5;
	E.playCard(st, 0, sp.uid, { type: 'hero', player: 1 }, null, 0);
	ok('overdraft: dealt 3 (2 locked + 1 pending) to the enemy hero', st.players[1].life === theirLife - 3, theirLife - st.players[1].life);
	ok('overdraft: crystals unlocked', st.players[0].overloadLockedThisTurn === 0 && st.players[0].overloadPending === 0);
	ok('overdraft: freed mana returned', st.players[0].mana.cur === 5 - 1 + 2, st.players[0].mana.cur);
	ok('overdraft is tradeable', byId.overdraft.tradeable === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
