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
// The owner's calls of 2026-11-14:
//   * x0 is on ENEMIES only: you are never fully immune (what would be x0 on you is x0.25)
//   * STAB: a move of one of your own types does x1.5
//   * ability immunities: an enemy with Levitate takes nothing from Ground (Water Absorb: Water, Volt Absorb:
//     Electric, Flash Fire: Fire, Sap Sipper: Grass); you, with one of them, take a quarter
//   node overworld/tests/micasurvivor_types_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeRoom } from '../../micasurvivor/m3d/sim.js';
import { newWorld, addEnemy, dataFrom, land, hurtPlayer, matchupOf } from '../../micasurvivor/m3d/combat.js';
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
	A(T.multIn('normal', ['ghost']) === 0.25 && T.multIn('ground', ['flying', 'water']) === 0.25 && T.multIn('fire', ['grass']) === 2 && T.multIn('fire', ['water', 'dragon']) === 0.25 && T.PLAYER_MIN === 0.25, 'an attack ON YOU is never x0: what would be immune is x0.25 (the rest of the chart as it is)');
	const src = fs.readFileSync(path.join(ROOT, 'micasurvivor/js/entities/player.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'micasurvivor/js/systems/localcoop.js'), 'utf8');
	A((src.match(/G\.Types\.multIn\(type, /g) || []).length === 2 && !/G\.Types\.mult\(type, /.test(src), '2D: a hit on you, and one on your downed partner\'s stand-in, go through that rule');
	const char = { moves: [{ type: 'fire', kind: 'projectile' }], mon: { types: ['fire'] }, af: false };
	e = foe(['normal']);
	A(G.Combat.land(e, 100, '#fff', 1, 0, 0, { type: 'fire', kind: 'projectile' }, false, char) === 150 && G.Combat.land(e, 100, '#fff', 1, 0, 0, { type: 'normal', kind: 'melee' }, false, char) === 100 && T.STAB === 1.5, '2D: STAB: a Fire move from a Fire type does x1.5; its Normal move does not');
	e = foe(['ghost', 'poison']); e.dex = 92; const dig = { moves: [{ type: 'ground', kind: 'aura' }, { type: 'normal', kind: 'melee' }, { type: 'dark', kind: 'melee' }], af: false };
	A(T.mult('ground', ['ghost', 'poison']) === 2 && T.mult('ground', ['ghost', 'poison'], 92) === 0 && G.Abilities.of(92) === 'levitate' && G.Combat.land(e, 100, '#fff', 1, 0, 0, { type: 'ground', kind: 'aura' }, false, dig) === 0 && e.hp === 1000, '2D: a Gastly has Levitate: Ground would be x2 on its types, and does nothing to it');
	A(['waterabsorb:water', 'voltabsorb:electric', 'flashfire:fire', 'sapsipper:grass', 'levitate:ground'].every((q) => { const [ab, ty] = q.split(':'), fx = G.Abilities.FX[ab].fx; return T.ABILITY_IMMUNE[ab] === ty && fx.resist.includes(ty) && fx.resist_k === 0.25; }), 'the five abilities: an enemy with one is immune to its type; YOU with one take a quarter of it');
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
	A(d1 === 25 * 1.5 && ev1.eff === 0.25, '3D: with no move that can hurt it, the hit is a Struggle: x0.25 (and x1.5, an Electric move from a Pikachu)', { d1, eff: ev1.eff });
	e.types = ['water', 'flying'];
	A(land(w, e, 100, 1, 0, 0, src) === 600 && w.events[w.events.length - 1].eff === 4, '3D: Electric on Water / Flying is x4, and with STAB x6');
	e.types = ['normal'];
	A(land(w, e, 100, 1, 0, 0, src) === 150 && land(w, e, 100, 1, 0, 0, { type: 'normal', kind: 'melee', id: 'y' }) === 100, '3D: STAB: Pikachu\'s Electric move does x1.5, a Normal one does not');
	const lev = addEnemy(w, 92, 14, 14, { dummy: true }); lev.hp = lev.maxHp = 1000; w.pl.moves.push({ id: 'z', type: 'normal', kind: 'melee' });
	A(land(w, lev, 100, 1, 0, 0, { type: 'ground', kind: 'aura', id: 'g' }) === 0 && lev.hp === 1000 && data.typeMult('ground', lev.types) === 2, '3D: a Gastly\'s Levitate: a Ground hit does nothing to it');
	const g = newWorld(room, data, { dex: 92, moves: [], seed: 3, weather: false }), hp = g.pl.hp;   // (Gastly: Ghost / Poison)
	const dn = hurtPlayer(g, 30, 'normal');
	A(dn > 0 && Math.abs(dn - 30 * 0.25) < 1e-9 && g.pl.hp < hp, '3D: a Normal hit on a Ghost player is x0.25, not nothing', dn);
	g.pl.invuln = 0; const dg = hurtPlayer(g, 30, 'ghost');
	A(Math.abs(dg - 60) < 1e-9, '3D: …and a Ghost hit on it is x2', dg);
	const kept = keepEvents([], [0, 0.25, 0.5, 1, 2, 4].map((eff) => ({ k: 'hit', x: 1, y: 2, z: 3, d: 5, crit: false, eff })));
	A(kept.map((q) => q.eff).join() === '3,0,0,1,2,4', 'a watcher\'s frame carries the cases: immune 3, resisted 0, plain 1, super 2, doubly super 4', kept.map((q) => q.eff));
}

// ---------- a zone's types against yours, as it begins (3D: m3d/combat.js matchupOf)
{
	const w = newWorld(makeRoom(20, 20, 0), data, { dex: 25, moves: ['thunder-shock'], seed: 3, weather: false });
	const q = matchupOf(w, [27, 27, 7, 1, 92]);   // (Sandshrew twice, Squirtle, Bulbasaur, Gastly)
	A(q.kinds === 4 && q.strong === 1 && q.walled === 1 && q.top.length === 2 && /^Mostly /.test(q.text) && /strong against 1 of its 4 kinds/.test(q.text) && /1 kind your moves cannot hurt/.test(q.text),
		'Thunder Shock against Sandshrew (twice), Squirtle, Bulbasaur, Gastly: 4 kinds, strong against 1 (Squirtle), 1 it cannot hurt (Sandshrew)', q);
	w.pl.moves.push(data.move('water-gun'));
	const q2 = matchupOf(w, [27, 7, 1, 92]);
	A(q2.walled === 0 && q2.strong === 2 && !/cannot hurt/.test(q2.text), 'with Water Gun as well: strong against 2, none it cannot hurt', q2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
