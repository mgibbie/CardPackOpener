// poketactica_td_test.mjs — TOWER DEFENSE, the simulation (owner, 2026-11-23; Plans/POKETACTICA_TOWER_DEFENSE_PLAN.md):
// figurines as towers on free tiles off the path; enemies only walk; cooldowns by the user's Speed, SP that refills over
// time, PP refilled each wave; the battles' own damage and effects; endless seeded waves; slots, energy, lives. And it is
// EXACT: the same seed and inputs give the same run, and a snapshot taken mid-run continues identically (replays,
// spectating, resume). Pure: node only.
//   node overworld/tests/poketactica_td_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as TD from '../../poketactica/js/td/sim.js';
import { tdKind, TD_KINDS } from '../../poketactica/js/td/effects.js';
import { TD_MAPS, tdMapById } from '../../poketactica/js/td/maps.js';
import { buildMap } from '../../poketactica/js/campaign.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';
import { autoRun, squadAt, chooseOrders } from '../../tools/poketactica/td_auto.mjs';
import { TD_STAR_RATE } from '../../poketactica/js/td/rewards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
/** A figurine with exactly these moves equipped (added to its pool if it hasn't learned them). */
const fig = (sp, lv, moves, more = {}) => {
	let f = makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-td' + lv, shinyRate: 0 });
	if (moves) { const pool = [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))]; f = equip({ ...f, pool }, moves); }
	return { ...f, ...more };
};
const LOOP = tdMapById('td-loop');
/** Run `ticks` ticks; script: { tick: [inputs] } (tick = the run's tick when they are given). */
function run(S, ticks, script = {}, each) {
	for (let i = 0; i < ticks && !S.over; i++) { TD.step(S, script[S.tick] || [], data); if (each) each(S); }
	return S;
}
const unit = (S, uid) => S.B.units.find((u) => u.uid === uid);

try {
	// ---------- the maps
	{
		A(TD_MAPS.length === 3 && TD_MAPS.every((m) => TD.mapProblems(m, buildMap({ ...m, foes: [] })).length === 0), 'three maps, each with a sound path (on the board, tile to adjacent tile, ending at the base)', TD_MAPS.map((m) => TD.mapProblems(m, buildMap({ ...m, foes: [] }))));
		A(tdMapById('td-twin').paths.length === 2 && TD_MAPS.every((m) => m.paths.every((p) => p.every(([x, y]) => m.ground[y][x] === 'd'))), 'a map may have two gates; the road is drawn (dirt) on every path tile');
		A(TD.mapProblems({ ...LOOP, paths: [[[0, 0], [2, 0], [2, 1], [11, 8]]] }, buildMap({ ...LOOP, foes: [] })).length > 0, 'a path that jumps is a problem');
	}
	// ---------- waves: from the seed alone
	{
		const a = TD.waveOf('w', 7, data), b = TD.waveOf('w', 7, data), c = TD.waveOf('other', 7, data);
		A(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c), 'a wave is its seed and its number: the same again, another seed another wave');
		A(a.every((e) => e.lv === TD.waveLevel(7) && data.species[e.sp]) && a.every((e, i) => !i || e.at >= a[i - 1].at), 'its enemies: the wave\'s level, in spawn order');
		const boss = TD.waveOf('w', 10, data);
		A(TD.isBossWave(10) && !TD.isBossWave(11) && boss[0].boss && boss[0].lv === TD.waveLevel(10, true) && boss.filter((e) => e.boss).length === 1, 'every 10th wave is a boss wave: one boss, 5 levels up, with an escort', boss[0]);
		A(TD.waveOf('w', 3, data, 2).some((e) => e.gate === 1) || TD.waveOf('w', 4, data, 2).some((e) => e.gate === 1), 'with two gates, enemies come from both');
		A(TD.waveLevel(1) === 4 && TD.waveLevel(60) === 93 && TD.waveOf('w', 400, data).length <= 41, 'levels follow the Dungeon\'s curve; a wave never has more than 40 (+ a boss)');
		A(TD.slotsAfter(0) === 3 && TD.slotsAfter(3) === 4 && TD.slotsAfter(10) === 6 && TD.slotsAfter(999) === TD.SQUAD_MAX, 'slots: 3 at the start, more as waves are cleared, 12 at most');
	}
	// ---------- placing
	{
		const squad = [fig('pikachu', 20, ['thundershock']), fig('charmander', 20, ['ember']), fig('squirtle', 20, ['watergun']), fig('bulbasaur', 20, ['vinewhip'])];
		const S = TD.newRun('place', { map: LOOP, squad }, data);
		A(TD.applyInput(S, { t: 'place', fig: 0, x: 5, y: 1 }, data) === 'that is the path' && TD.applyInput(S, { t: 'place', fig: 0, x: 99, y: 1 }, data) === 'not a tile', 'not on the path, not off the board');
		A(TD.applyInput(S, { t: 'place', fig: 0, x: 5, y: 2 }, data) === null && S.towers.length === 1 && unit(S, 't0').x === 5, 'any free tile off the path takes a tower');
		A(TD.applyInput(S, { t: 'place', fig: 0, x: 6, y: 2 }, data) === 'already on the board' && TD.applyInput(S, { t: 'place', fig: 1, x: 5, y: 2 }, data) === 'a tower stands there', 'a figurine stands once; a tile holds one');
		TD.applyInput(S, { t: 'place', fig: 1, x: 6, y: 2 }, data); TD.applyInput(S, { t: 'place', fig: 2, x: 7, y: 2 }, data);
		A(TD.freeSlots(S) === 0 && TD.applyInput(S, { t: 'place', fig: 3, x: 8, y: 2 }, data) === 'no free slot', 'three slots at the start: the fourth figurine waits');
		// a recall rests its slot; a paid swap doesn't
		TD.applyInput(S, { t: 'recall', uid: 't2' }, data);
		A(S.towers.length === 2 && TD.freeSlots(S) === 0 && /resting/.test(TD.applyInput(S, { t: 'place', fig: 3, x: 8, y: 2 }, data)), 'a recalled tower\'s slot rests');
		run(S, TD.RECALL_LOCK_TICKS + 1);
		A(TD.freeSlots(S) === 1 && TD.applyInput(S, { t: 'place', fig: 3, x: 8, y: 2 }, data) === null, '…then takes the next figurine');
		S.energy = 100;
		A(TD.applyInput(S, { t: 'spend', kind: 'swap', uid: 't3' }, data) === null && TD.freeSlots(S) === 1 && S.energy === 100 - TD.ENERGY.swap, 'energy buys an instant swap (the slot is free at once)');
		A(TD.applyInput(S, { t: 'spend', kind: 'slot' }, data) === null && TD.slotsOf(S) === 4 && S.energy === 90 - TD.ENERGY.slot, '…and the next slot early');
		S.energy = 0;
		A(TD.applyInput(S, { t: 'spend', kind: 'slot' }, data) === 'not enough energy', 'not without the energy');
	}
	// ---------- a run: enemies only walk; towers fire on cooldown; lives, kills, energy, waves
	const squad = [fig('pikachu', 30, ['thundershock', 'quickattack']), fig('charmander', 30, ['ember']), fig('squirtle', 30, ['watergun'])];
	const script = { 0: [{ t: 'place', fig: 0, x: 5, y: 2 }, { t: 'place', fig: 1, x: 9, y: 2 }, { t: 'place', fig: 2, x: 5, y: 6 }, { t: 'call' }] };
	{
		const S = TD.newRun('run1', { map: LOOP, squad }, data);
		let uses = 0, hurtTower = false, overPay = false, spawned = 0;
		const sp0 = {};
		run(S, 20 * 60, script, (S) => {
			for (const e of S.ev) { if (e.t === 'use') uses++; if (e.t === 'spawn') spawned++; }
			for (const t of S.towers) { const u = unit(S, t.uid); if (u.hp !== u.maxHP || u.status) hurtTower = true; if (u.sp < 0 || Object.values(u.pp).some((n) => n < 0)) overPay = true; }
		});
		A(S.wave >= 2 && spawned > 5 && S.kills > 0 && uses > 10, 'a minute in: waves have come, towers have fired, enemies have fallen', { wave: S.wave, spawned, kills: S.kills, uses });
		A(!hurtTower, 'towers have no HP to lose and take no status (enemies only walk)');
		A(!overPay, 'no tower ever fires a move it can\'t pay for (SP and PP never below 0)');
		A(S.energy > 0 && S.stars === [...Array(S.cleared)].reduce((a, _, i) => a + TD.waveStars(i + 1), 0), 'kills earn energy; cleared waves bank their stars', { energy: S.energy, stars: S.stars, cleared: S.cleared });
		// exact: the same seed and inputs -> the same run
		const again = run(TD.newRun('run1', { map: LOOP, squad }, data), 20 * 60, script);
		A(TD.hashOf(again) === TD.hashOf(S), 'the same seed and inputs give the same run (hash)', [TD.hashOf(S), TD.hashOf(again)]);
		const other = run(TD.newRun('run2', { map: LOOP, squad }, data), 20 * 60, script);
		A(TD.hashOf(other) !== TD.hashOf(S), 'another seed, another run');
		// a snapshot taken mid-run continues identically
		const half = run(TD.newRun('run1', { map: LOOP, squad }, data), 500, script);
		const snap = JSON.parse(JSON.stringify(TD.toSnapshot(half)));
		const resumed = run(TD.fromSnapshot(snap), 700, script);
		A(resumed.tick === S.tick && TD.hashOf(resumed) === TD.hashOf(S), 'a snapshot taken mid-run (through JSON) continues to the very same state', [resumed.tick, S.tick]);
		A(JSON.stringify(TD.view(resumed)) === JSON.stringify(TD.view(S)), '…and the very same view');
	}
	// ---------- no towers: everything leaks, the base falls
	{
		const S = run(TD.newRun('leak', { map: LOOP, squad }, data), 20 * 600, { 0: [{ t: 'call' }] }, (S) => { if (S.phase === 'wait') TD.applyInput(S, { t: 'call' }, data); });
		A(S.over === 'lost' && S.lives === 0, 'with no towers the base falls: the run is over', { over: S.over, lives: S.lives, wave: S.wave });
		const t = S.tick; TD.step(S, [{ t: 'call' }], data);
		A(S.tick === t, 'nothing moves after the end');
	}
	// ---------- cooldowns: by SP cost and by the user's Speed
	{
		const mk = (sp) => B.makeUnit(fig(sp, 50, ['tackle', 'hyperbeam', 'quickattack']), 'x', 'p', 0, 0, 'hold', data);
		const fast = mk('jolteon'), slow = mk('snorlax');
		const cd = (u, id) => TD.cooldownTicks(u, B.moveOf(u, id, data));
		A(cd(fast, 'tackle') < cd(slow, 'tackle'), 'a faster Pokémon\'s cooldowns are shorter', [cd(fast, 'tackle'), cd(slow, 'tackle')]);
		A(cd(fast, 'hyperbeam') > cd(fast, 'tackle'), 'a costlier move\'s cooldown is longer', [cd(fast, 'hyperbeam'), cd(fast, 'tackle')]);
		A(cd(fast, 'quickattack') < cd(fast, 'tackle'), 'a priority move\'s is halved', [cd(fast, 'quickattack'), cd(fast, 'tackle')]);
		const lo = mk('jolteon'), hi = B.makeUnit(fig('jolteon', 500, ['tackle']), 'y', 'p', 0, 0, 'hold', data);
		A(Math.abs(cd(lo, 'tackle') - cd(hi, 'tackle')) <= 1, 'the same at Lv 50 and Lv 500 (Speed counts against its own level)', [cd(lo, 'tackle'), cd(hi, 'tackle')]);
		A(TD.cooldownTicks({ ...slow, stats: { ...slow.stats, spe: 1 } }, B.moveOf(slow, 'tackle', data)) <= Math.round((TD.CD_BASE + TD.CD_PER_SP * B.moveOf(slow, 'tackle', data).spCost) * TD.CD_MAX * TD.TPS), 'never more than twice the base');
	}
	// ---------- SP refills over time; PP refills when a wave is cleared
	{
		const S = TD.newRun('sp', { map: LOOP, squad: [fig('pikachu', 30, ['thunderbolt'])] }, data);
		TD.applyInput(S, { t: 'place', fig: 0, x: 5, y: 2 }, data);
		const u = unit(S, 't0');
		u.sp = 0;
		run(S, TD.TPS * 5);   // (no wave yet: nothing to fire at)
		A(u.sp === Math.floor(u.maxSP * TD.SP_REGEN_PCT * 5 / 100), `SP comes back ${TD.SP_REGEN_PCT}% of max a second`, [u.sp, u.maxSP]);
		u.pp.thunderbolt = 1;
		run(S, 20 * 120, {}, (S) => { if (S.phase === 'wait') TD.applyInput(S, { t: 'call' }, data); });
		A(S.cleared >= 1 && unit(S, 't0').pp.thunderbolt > 1, 'PP is refilled when a wave is cleared', { cleared: S.cleared, pp: unit(S, 't0').pp });
	}
	// ---------- statuses in real time; knockback; a tower's rule
	{
		// sleep: the enemy stops
		const S = TD.newRun('slp', { map: LOOP, squad: [fig('butterfree', 40, ['sleeppowder'])] }, data);
		TD.applyInput(S, { t: 'place', fig: 0, x: 3, y: 2 }, data); TD.applyInput(S, { t: 'call' }, data);
		let slept = null, stoodStill = false, woke = false;
		run(S, 20 * 40, {}, (S) => {
			for (const e of S.ev) if (e.t === 'status' && e.st === 'slp' && !slept) slept = { uid: e.uid, d: (S.enemies.find((x) => x.uid === e.uid) || {}).d, at: S.tick };
			if (slept) { const e = S.enemies.find((x) => x.uid === slept.uid); if (e && S.tick === slept.at + 20) stoodStill = e.d === slept.d; if (e && S.tick > slept.at + TD.STATUS_TICKS.slp + 5 && e.d > slept.d) woke = true; }
		});
		A(slept && stoodStill && woke, 'asleep = stopped for a few seconds, then it walks on', { slept, stoodStill, woke });
	}
	{
		const S = TD.newRun('kb', { map: LOOP, squad: [fig('pidgeot', 40, ['whirlwind'])] }, data);
		TD.applyInput(S, { t: 'place', fig: 0, x: 4, y: 2 }, data); TD.applyInput(S, { t: 'call' }, data);
		let pushed = false, last = {};
		run(S, 20 * 30, {}, (S) => { for (const e of S.enemies) { if (last[e.uid] != null && e.d < last[e.uid] - TD.SUB) pushed = true; last[e.uid] = e.d; } });
		A(pushed, 'a knockback move pushes an enemy back along the path');
	}
	{
		// the rule: First aims at the enemy furthest along, Last at the one furthest back
		const pick = (rule) => {
			const S = TD.newRun('rule', { map: LOOP, squad: [fig('pikachu', 5, ['thundershock'])] }, data);
			TD.applyInput(S, { t: 'place', fig: 0, x: 5, y: 2 }, data); TD.applyInput(S, { t: 'rule', uid: 't0', rule }, data); TD.applyInput(S, { t: 'call' }, data);
			let hit = null;
			run(S, 20 * 40, {}, (S) => { if (hit) return; const h = S.ev.find((e) => e.t === 'hit' || e.t === 'miss' && e.target); if (h && S.enemies.length > 1) { const ds = S.enemies.map((e) => e.d).sort((a, b) => b - a), me = S.enemies.find((e) => e.uid === h.target); if (me) hit = { d: me.d, first: ds[0], last: ds[ds.length - 1], n: ds.length }; } });
			return hit;
		};
		const f = pick('first'), l = pick('last');
		A(f && l && f.d >= l.d, 'a tower\'s target rule chooses who it aims at (First: the furthest along; Last: the furthest back)', { f, l });
	}
	// ---------- healing gives SP; a self buff is timed; weather; throw
	{
		const S = TD.newRun('heal', { map: LOOP, squad: [fig('chansey', 40, ['softboiled']), fig('pikachu', 40, ['thunderbolt'])] }, data);
		TD.applyInput(S, { t: 'place', fig: 0, x: 5, y: 2 }, data);
		const u = unit(S, 't0'); u.sp = 5;
		let got = 0;
		run(S, 40, {}, (S) => { for (const e of S.ev) if (e.t === 'sp') got += e.n; });
		A(got > 0 && u.sp > 5 && u.hp === u.maxHP, 'a healing move gives SP back (towers have no HP to heal)', { got, sp: u.sp });
	}
	{
		const S = TD.newRun('buff', { map: LOOP, squad: [fig('scyther', 40, ['swordsdance'])] }, data);
		TD.applyInput(S, { t: 'place', fig: 0, x: 5, y: 2 }, data); TD.applyInput(S, { t: 'call' }, data);
		let up = 0, upAt = 0, downAt = 0;
		run(S, 20 * 45, {}, (S) => { const b = unit(S, 't0').boosts.atk; if (b > up) { up = b; if (!upAt) upAt = S.tick; } if (upAt && !downAt && b === 0 && S.tick > upAt + 5) downAt = S.tick; if (S.phase === 'wait') TD.applyInput(S, { t: 'retire' }, data); });
		A(up === 2, 'a self buff lands once (+2), not stacked every cooldown', up);
	}
	{
		const S = TD.newRun('buff2', { map: tdMapById('td-ridge'), squad: [fig('scyther', 40, ['swordsdance'])] }, data);
		TD.applyInput(S, { t: 'place', fig: 0, x: 1, y: 5 }, data); TD.applyInput(S, { t: 'call' }, data);
		const u = unit(S, 't0');
		run(S, 60);
		const had = u.boosts.atk;
		S.buffs.forEach((b) => { b.until = S.tick + 2; }); u.pp.swordsdance = 0;
		run(S, 5);
		A(had === 2 && u.boosts.atk === 0, 'a self buff wears off when its time is up', [had, u.boosts.atk]);
	}
	{
		const S = TD.newRun('rain', { map: LOOP, squad: [fig('politoed', 40, ['raindance'])] }, data);
		TD.applyInput(S, { t: 'place', fig: 0, x: 5, y: 2 }, data); TD.applyInput(S, { t: 'call' }, data);
		run(S, 60);
		const on = S.B.field.weather && S.B.field.weather.kind;
		S.weatherUntil = S.tick + 2; unit(S, 't0').pp.raindance = 0;
		run(S, 5);
		A(on && !S.B.field.weather, 'a weather move sets the weather for a while, then it clears', on);
	}
	{
		const S = TD.newRun('throw', { map: LOOP, squad: [fig('machamp', 50, ['growl'])] }, data);
		TD.applyInput(S, { t: 'place', fig: 0, x: 5, y: 2 }, data); TD.applyInput(S, { t: 'toggle', uid: 't0', move: 'growl' }, data); TD.applyInput(S, { t: 'call' }, data);
		const u = unit(S, 't0');
		let done = null;
		run(S, 20 * 30, {}, (S) => { if (done) return; const e = S.enemies.find((x) => { const v = unit(S, x.uid); return Math.abs(v.x - u.x) + Math.abs(v.y - u.y) === 1; }); if (e) { const d0 = e.d; const why = TD.applyInput(S, { t: 'throw', uid: 't0', target: e.uid }, data); done = { why, d0, d1: e.d, again: TD.applyInput(S, { t: 'throw', uid: 't0', target: e.uid }, data) }; } });
		A(u.lift && done && done.why === null && done.d1 < done.d0 && done.again === 'not ready', 'a lifter throws the enemy next to it back toward the gate, on its own cooldown', done);
		A(S.ev.every((e) => e.t !== 'capture') && !S.B.captured, 'no catching in Tower Defense');
	}
	// ---------- every move has a kind (the full sweep is its own pass; this is the floor)
	{
		const u = B.makeUnit(fig('mew', 50, ['tackle']), 'x', 'p', 0, 0, 'hold', data);
		const kinds = {}, bad = [];
		for (const id of Object.keys(data.shapes)) { if (!data.moves[id]) continue; const m = B.moveOf({ ...u, fig: { ...u.fig, pool: [{ id, lv: 1, xp: 0 }] } }, id, data); const k = m && tdKind(id, m); if (!TD_KINDS.includes(k)) bad.push(id); else kinds[k] = (kinds[k] || 0) + 1; }
		A(!bad.length && kinds.damage > 400 && kinds.foe > 30 && kinds.buff > 20 && kinds.sp > 5 && kinds.weather >= 4, 'every move is classed for Tower Defense', { bad: bad.slice(0, 5), kinds });
		A(tdKind('protect', B.moveOf({ ...u, fig: { ...u.fig, pool: [{ id: 'protect', lv: 1, xp: 0 }] } }, 'protect', data)) === 'none', 'Protect has no use here');
	}
	// ---------- speed: a long run is quick to simulate (a replay viewer jumps through it)
	{
		const S = TD.newRun('long', { map: LOOP, squad: [fig('mewtwo', 200, ['psychic', 'swift']), fig('zapdos', 200, ['thunderbolt', 'discharge']), fig('blastoise', 200, ['surf', 'watergun'])] }, data);
		const t0 = performance.now();
		run(S, 20 * 60 * 10, { 0: [{ t: 'place', fig: 0, x: 5, y: 2 }, { t: 'place', fig: 1, x: 9, y: 2 }, { t: 'place', fig: 2, x: 5, y: 6 }] }, (S) => { if (S.phase === 'wait') TD.applyInput(S, { t: 'call' }, data); });
		const ms = performance.now() - t0;
		A(ms < 4000, `ten minutes of play simulate in well under four seconds (${ms.toFixed(0)} ms, wave ${S.wave})`, ms);
	}
} catch (e) { A(false, 'the run threw', e && e.stack); }
// ================================================================ the tuning, pinned with the auto-player
{
	// (tools/poketactica/td_auto.mjs: it places each figurine where it covers the most road, calls every wave, buys slots)
	const squad = squadAt(20, 12, data);
	const runs = [0, 1].map((k) => autoRun('pin-' + k, LOOP, squad, data, 40000));
	const waves = runs.map((r) => r.wave), mins = runs.map((r) => r.ticks / TD.TPS / 60), perMin = runs.map((r, i) => r.stars / mins[i]);
	A(runs.every((r) => r.over) && Math.min(...waves) >= 9 && Math.max(...waves) <= 22, `a squad of 12 at Lv 20, played by the auto-player on Meadow Loop, falls between waves 9 and 22 (the enemies' level catches the squad's): ${waves.join(', ')}`, runs);
	A(TD_STAR_RATE === 0.06 && Math.max(...perMin) <= 8 && Math.min(...perMin) >= 1.5, `and banks a few stars a minute at 1× (${perMin.map((n) => n.toFixed(1)).join(', ')}), not several times a Dungeon floor's`, perMin);
	const S = TD.newRun('orders', { map: LOOP, squad }, data), first = chooseOrders(S, data);
	A(first.some((a) => a.t === 'call') && first.some((a) => a.t === 'place' && !S.onPath[a.y * S.B.map.w + a.x]) && JSON.stringify(autoRun('pin-0', LOOP, squad, data, 40000)) === JSON.stringify(runs[0]), 'the auto-player calls the wave, places beside the road, and plays the same run from the same seed');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
