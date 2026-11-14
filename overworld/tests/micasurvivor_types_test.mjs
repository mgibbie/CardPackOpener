// micasurvivor_types_test.mjs — MicaSurvivor's type chart is the Pokémon games' own, numbers and all
// (Plans/MICASURVIVOR_TYPES_VFX_PLAN.md, part A; the owner, 2026-11-13: "I want all 3 games to use the full typing
// system of effectiveness from the full Pokemon game"). In node, with the game's own scripts.
//   * all 324 pairs equal the overworld battle engine's chart (overworld/battle.js): x2, x0.5, x0
//   * two types multiply, with no cap: x4, x0.25, and x0 whatever the other type is
//   * the labels: 'super', 'weak', 'immune', none
//   * the 2D game: a hit on an immune enemy does nothing and carries nothing (no damage, no burn); a hit you are immune
//     to does nothing to you
//   * the 3D modes (Expedition and Dive share m3d/combat.js): the same, and the hit's event says so; a watcher's frame
//     carries the five cases
//   * no dead end: when NONE of your moves can hurt an enemy, your hits on it are a Struggle (x0.25); with one move
//     that can, the others really do x0
//   node overworld/tests/micasurvivor_types_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeRoom } from '../../micasurvivor/m3d/sim.js';
import { newWorld, addEnemy, dataFrom, land, hurtPlayer } from '../../micasurvivor/m3d/combat.js';
import { keepEvents } from '../../micasurvivor/m3d/net.js';
import { loadG } from './m3d_data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };

// the 2D game's scripts, with what its hit code talks to stood in for
const shown = [];
const G = loadG(['systems/combat.js', 'entities/player.js'], { pre(G) {
	G.FX = { dmgText: (x, y, s) => shown.push(s), spark() { }, burst() { } };
	G.Status = { SLEEP_BONUS: 1.3, PARA_ELECTRIC: 1.35, wake() { }, apply() { } };
	G.DmgLog = { as: (k, fn) => fn(), keyOf: () => 'x', note() { } };
	G.Hooks = { reduce: (n, v) => v, call() { }, count: () => 0 };
} });
G.Weather.mult = () => 1; G.Items.outK = () => 1;
const T = G.Types, data = dataFrom(G);

// ---------- the chart
{
	const src = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8'), i = src.indexOf('const CHART = {'), j = src.indexOf('\n};', i);
	const BATTLE = new Function(src.slice(i, j + 3).replace('const CHART =', 'return'))();
	const cap = (s) => s[0].toUpperCase() + s.slice(1), types = Object.keys(T.CHART), bad = [];
	for (const a of types) for (const d of types) { const want = BATTLE[cap(a)][cap(d)] ?? 1, got = T.mult(a, [d]); if (got !== want) bad.push(`${a}>${d}: ${got}, the games ${want}`); }
	A(types.length === 18 && Object.keys(BATTLE).length === 18 && !bad.length, 'all 324 pairs are the battle engine\'s: x2, x0.5, x0', bad.slice(0, 6));
	A(T.mult('fire', ['grass']) === 2 && T.mult('fire', ['water']) === 0.5 && T.mult('electric', ['ground']) === 0 && T.mult('normal', ['normal']) === 1, 'x2, x0.5, x0, x1 (not the softened x1.6 / x0.6 / x0.3)', [T.mult('fire', ['grass']), T.mult('fire', ['water']), T.mult('electric', ['ground'])]);
	A(T.mult('ice', ['dragon', 'flying']) === 4 && T.mult('fire', ['water', 'dragon']) === 0.25 && T.mult('electric', ['water', 'ground']) === 0 && T.mult('fire', ['grass', 'water']) === 1, 'two types multiply, with no cap: x4, x0.25, x0 whatever the other is, x2 x 0.5 = x1');
	A(T.label(4) === 'super' && T.label(2) === 'super' && T.label(0.5) === 'weak' && T.label(0.25) === 'weak' && T.label(0) === 'immune' && T.label(1) === null, 'the labels: super, weak, immune, none');
	A(T.noAnswer([{ type: 'electric', kind: 'projectile' }, { type: 'electric', kind: 'chain' }, { type: 'normal', kind: 'buff' }], ['ground']) && !T.noAnswer([{ type: 'electric', kind: 'chain' }, { type: 'normal', kind: 'melee' }], ['ground']) && !T.noAnswer([], ['ground']),
		'"no answer": every damaging move you hold is x0 against it (a buff does not count; one move that can hurt it is an answer)');
}

// ---------- the 2D game
{
	const foe = (types) => ({ types, hp: 1000, burned: 0, x: 0, y: 0, bodyH: 10, sleepT: 0, paraT: 0, dead: false, hurt(d) { this.hp -= Math.max(1, Math.round(d)); }, applyBurn(n) { this.burned += n; }, applyPoison() { }, applySlow() { } });
	const pika = { moves: [{ type: 'electric', kind: 'projectile' }], af: false }, both = { moves: [{ type: 'electric', kind: 'projectile' }, { type: 'normal', kind: 'melee' }], af: false };
	const shot = { type: 'electric', kind: 'projectile', burn: 2 };
	let e = foe(['ground']); shown.length = 0;
	const d0 = G.Combat.land(e, 100, '#fff', 1, 0, 50, shot, false, both);
	A(d0 === 0 && e.hp === 1000 && e.burned === 0 && shown.join() === 'Inmune', '2D: an Electric hit on a Ground enemy does nothing and carries nothing; "Immune" is written over it', { d0, hp: e.hp, burned: e.burned, shown });
	G.Combat.land(e, 100, '#fff', 1, 0, 50, shot, false, both);
	A(shown.length === 1, '2D: …written once, not for every hit of a volley', shown);
	e = foe(['ground']);
	const d1 = G.Combat.land(e, 100, '#fff', 1, 0, 50, shot, false, pika);
	A(d1 === 100 * T.STRUGGLE && T.STRUGGLE === 0.25 && e.hp === 975, '2D: with no move that can hurt it, the hit is a Struggle: x0.25', { d1, hp: e.hp });
	e = foe(['water', 'flying']);
	A(G.Combat.land(e, 100, '#fff', 1, 0, 50, shot, false, pika) === 400 && e.hp === 600, '2D: Electric on Water / Flying is x4', e.hp);
	const me = { invuln: 0, dead: false, hp: 100, mon: { types: ['ghost'] }, x: 0, y: 0, bodyH: 10 };
	let threw = null; shown.length = 0;
	try { G.Player.prototype.hurt.call(me, 30, 'normal'); } catch (err) { threw = err.message; }
	A(!threw && me.hp === 100 && me.invuln === 0 && shown.join() === 'Inmune', '2D: a Normal hit on a Ghost player does nothing (no damage, no moment of grace spent)', { threw, hp: me.hp, shown });
}

// ---------- the 3D modes
{
	const room = makeRoom(20, 20, 0);
	const fight = (moves) => { const w = newWorld(room, data, { dex: 25, moves, seed: 3, afDmg: 1, weather: false }); const e = addEnemy(w, 27, 12, 12, { dummy: true }); e.hp = e.maxHp = 100000; return [w, e]; };   // (Sandshrew: Ground)
	const src = { type: 'electric', kind: 'projectile', burn: 2, id: 'x' };
	let [w, e] = fight(['thunder-shock', 'quick-attack']);
	A(e.types.join() === 'ground' && w.pl.moves.some((m) => m.type === 'normal'), 'a Pikachu with an Electric and a Normal move, a Sandshrew', [e.types, w.pl.moves.map((m) => m.type)]);
	const d0 = land(w, e, 100, 1, 0, 50, src), ev = w.events[w.events.length - 1];
	A(d0 === 0 && e.hp === 100000 && !e.burn && ev.k === 'hit' && ev.eff === 0 && ev.d === 0, '3D: the Electric hit does nothing and carries nothing; its event says eff 0', { d0, hp: e.hp, burn: e.burn, ev });
	const d2 = land(w, e, 100, 1, 0, 0, { type: 'normal', kind: 'melee', id: 'y' });
	A(d2 === 100, '3D: …and the Normal move hits it as ever', d2);
	[w, e] = fight(['thunder-shock']);
	const d1 = land(w, e, 100, 1, 0, 0, src), ev1 = w.events[w.events.length - 1];
	A(d1 === 25 && ev1.eff === 0.25, '3D: with no move that can hurt it, the hit is a Struggle: x0.25', { d1, eff: ev1.eff });
	e.types = ['water', 'flying'];
	A(land(w, e, 100, 1, 0, 0, src) === 400 && w.events[w.events.length - 1].eff === 4, '3D: Electric on Water / Flying is x4');
	const g = newWorld(room, data, { dex: 92, moves: [], seed: 3, weather: false }), hp = g.pl.hp;   // (Gastly: Ghost / Poison)
	A(hurtPlayer(g, 30, 'normal') === 0 && g.pl.hp === hp && g.pl.invuln === 0 && g.events.some((q) => q.k === 'immune'), '3D: a Normal hit on a Ghost player does nothing, and says so', { hp: g.pl.hp, inv: g.pl.invuln });
	A(hurtPlayer(g, 30, 'ghost') > 30 && g.pl.hp < hp, '3D: …and a Ghost hit on it is super effective', g.pl.hp);
	const kept = keepEvents([], [0, 0.25, 0.5, 1, 2, 4].map((eff) => ({ k: 'hit', x: 1, y: 2, z: 3, d: 5, crit: false, eff })));
	A(kept.map((q) => q.eff).join() === '3,0,0,1,2,4', 'a watcher\'s frame carries the cases: immune 3, resisted 0, plain 1, super 2, doubly super 4', kept.map((q) => q.eff));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
