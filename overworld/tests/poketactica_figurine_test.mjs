// poketactica_figurine_test.mjs — Poketactica's FIGURINE (stage 2; owner, 2026-11-20): stats from species and level only
// (no EVs / IVs / natures), level 1-999, 1 ability from the species' own, 4 equipped moves from a move pool that never
// loses a move, the real learnset at its real levels, move levels 1-99 from move XP, SP, Move / Jump / evasion / lift.
// Every species in the game makes a figurine whose moves all have grid shapes. Pure: node only.
//   node overworld/tests/poketactica_figurine_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as F from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';
import { calcStat } from '../rules/stats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + extra : '')); } };

const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json') };
const SHAPES = J('poketactica/data/move_shapes.json');
const MOVES = J('overworld/data/moves_battle.json');

// ---- stats
const pk = data.species.pikachu;
const s50 = F.statsAt(pk.baseStats, 50);
A(s50.hp === calcStat(35, 0, 0, 50, true) && s50.spe === calcStat(90, 0, 0, 50, false), 'stats: the Pokémon formula with IV = EV = 0', JSON.stringify(s50));
const s999 = F.statsAt({ hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, 999);
A(s999.atk === Math.floor(200 * 999 / 100) + 5 && s999.hp === Math.floor(200 * 999 / 100) + 999 + 10, 'level 999: a base-100 stat is about 2,000 (no number bloat)', JSON.stringify(s999));
A(F.statsAt(pk.baseStats, 5000).atk === F.statsAt(pk.baseStats, 999).atk && F.statsAt(pk.baseStats, 0).atk === F.statsAt(pk.baseStats, 1).atk, 'levels clamp to 1-999');
const fig = F.makeFigurine('pikachu', 300, makeRng('fig-1'), data);
A(!('ivs' in fig) && !('evs' in fig) && !('nature' in fig), 'a figurine has no IVs, EVs or nature');

// ---- levels and EXP
A(F.expForLevel(1) === 0 && F.levelForExp(F.expForLevel(500)) === 500 && F.levelForExp(F.expForLevel(500) - 1) === 499 && F.levelForExp(1e15) === 999, 'EXP curve to level 999 and back');

// ---- the learnset at its real levels (owner, 2026-11-21: it was stretched x9.99, which left 2-3 moves for the campaign)
const ls = F.stretchedLearnset(pk);
const at = (id) => (ls.find(([, m]) => m === id) || [])[0];
A(at('thundershock') === 1 && at('thunderbolt') === 26, 'a move learned at Pokémon level 26 arrives at figurine level 26; level-1 moves at 1', JSON.stringify([at('thundershock'), at('thunderbolt')]));
A(F.learnLevel(100) === 100 && F.learnLevel(1) === 1, 'level 100 -> 100');
{ const mid = F.makeFigurine('charmander', 20, makeRng('mid'), data);
	A(mid.pool.length > 4 && mid.pool.some((p) => p.id === 'ember'), 'a campaign-level figurine (Lv 20) has more than 4 moves to choose from', mid.pool.map((p) => p.id).join(','));
	A(F.movesToCome(data.species.charmander, 20).every(([l]) => l > 20) && F.movesToCome(data.species.charmander, 20).some(([, id]) => id === 'flamethrower'), 'movesToCome lists the moves above its level'); }
// an older figurine (made under the x9.99 stretch): learnedTo adds the moves it has passed, never removes or changes one
{ const old = { v: 1, id: 'old-1', species: 'charmander', level: 24, exp: F.expForLevel(24), ability: null, shiny: false, pool: [{ id: 'scratch', lv: 7, xp: 900 }, { id: 'growl', lv: 1, xp: 0 }], equipped: ['scratch', 'growl'] };
	const up = F.learnedTo(old, data);
	A(up !== old && up.pool[0].lv === 7 && up.pool[0].xp === 900 && up.pool.slice(0, 2).every((p, i) => p.id === old.pool[i].id) && up.pool.some((p) => p.id === 'ember') &&JSON.stringify(up.equipped) === JSON.stringify(old.equipped), 'learnedTo: the passed moves join the pool (move levels and the equipped 4 kept)', up.pool.map((p) => p.id).join(','));
	A(up.pool.every((p) => F.stretchedLearnset(data.species.charmander).some(([l, id]) => id === p.id && l <= 24)), 'learnedTo adds nothing above its level');
	A(F.learnedTo(up, data) === up, 'learnedTo on an up-to-date figurine changes nothing (the same object)'); }

// ---- making one
const a1 = F.makeFigurine('pikachu', 300, makeRng('same'), data), a2 = F.makeFigurine('pikachu', 300, makeRng('same'), data);
A(JSON.stringify(a1) === JSON.stringify(a2), 'the same seed makes the same figurine (replays)');
A(data.abilities.pikachu.includes(fig.ability), '1 ability, one of its species\' own', fig.ability);
A(fig.pool.length > 4 && fig.equipped.length === 4 && fig.equipped.every((m) => fig.pool.some((p) => p.id === m)), '4 equipped moves, from its pool');
A(fig.pool.every((p) => (at(p.id) || 0) <= 300) && fig.pool.some((p) => p.id === 'thunderbolt'), 'its pool is every move learned up to its level');
// abilities across many seeds: always the species' own, and every one of them turns up
{ const seen = new Set(); for (let i = 0; i < 200; i++) seen.add(F.makeFigurine('pikachu', 10, makeRng('ab' + i), data).ability);
	A([...seen].every((x) => data.abilities.pikachu.includes(x)) && seen.size === data.abilities.pikachu.length, 'the ability is rolled from the species\' own (all of them turn up)', [...seen].join(',')); }

// ---- growing: the pool never loses a move
const low = F.makeFigurine('pikachu', 20, makeRng('grow'), data);
const g = F.gainExp(low, F.expForLevel(400) - low.exp, data);
A(g.fig.level === 400 && g.gained === 380, 'EXP levels it up', JSON.stringify([g.fig.level, g.gained]));
A(low.pool.every((p) => g.fig.pool.some((q) => q.id === p.id)) && g.newMoves.includes('thunderbolt') && g.fig.pool.length === low.pool.length + g.newMoves.length, 'new moves join the pool; no move is ever lost', g.newMoves.join(','));
A(JSON.stringify(g.fig.equipped) === JSON.stringify(low.equipped), 'levelling up doesn\'t change the equipped 4 (the player swaps between battles)');
A(F.gainExp(g.fig, 1e15, data).fig.level === 999, 'level 999 is the cap (no reincarnation)');

// ---- equipping
const eq = F.equip(g.fig, ['thunderbolt', 'quickattack', 'thundershock']);
A(eq.equipped.length === 3 && eq.pool.length === g.fig.pool.length, 'equip from the pool (the pool keeps everything)');
let threw = 0; for (const bad of [['nosuchmove'], ['thunderbolt', 'quickattack', 'thundershock', 'growl', 'tailwhip'], []]) { try { F.equip(g.fig, bad); } catch (e) { threw++; } }
A(threw === 3, 'equip refuses a move outside the pool, more than 4, or none');

// ---- move levels 1-99
A(F.moveLevelForXp(0) === 1 && F.moveLevelForXp(F.moveXpFor(50)) === 50 && F.moveLevelForXp(1e12) === 99, 'move levels 1-99 from move XP');
A(F.moveXpFromUse({ damage: 120 }) === 120 && F.moveXpFromUse({ statusTargets: 3 }) === 3 * F.STATUS_XP_PER_TARGET, 'move XP: the damage it dealt, or per target a status move affected (owner\'s rule)');
const mx = F.gainMoveXp(g.fig, 'thunderbolt', 1e12);
A(mx.pool.find((p) => p.id === 'thunderbolt').lv === 99 && mx.pool.find((p) => p.id === 'quickattack').lv === 1, 'move XP levels that move only, to 99');
const tb1 = F.moveAt(SHAPES.thunderbolt, MOVES.thunderbolt.power, MOVES.thunderbolt.acc, 1), tb99 = F.moveAt(SHAPES.thunderbolt, MOVES.thunderbolt.power, MOVES.thunderbolt.acc, 99);
A(tb1.power === 90 && tb99.power === 90 * SHAPES.thunderbolt.grow.pow && tb99.spCost < tb1.spCost, 'Thunderbolt at move level 99: power x2 and cheaper', JSON.stringify([tb1.power, tb99.power, tb1.spCost, tb99.spCost]));
const eq1 = F.moveAt(SHAPES.earthquake, 100, 100, 1), eq30 = F.moveAt(SHAPES.earthquake, 100, 100, 30), eq99 = F.moveAt(SHAPES.earthquake, 100, 100, 99);
A(eq1.n < eq30.n && eq30.n < eq99.n, 'Earthquake\'s area grows at its milestones', JSON.stringify([eq1.n, eq30.n, eq99.n]));
const sd99 = F.moveAt(SHAPES.swordsdance, 0, true, 99);
A(SHAPES.swordsdance.s === 'self' && sd99.s === 'aura' && sd99.n === 1, 'a level-99 Swords Dance shares with adjacent allies (owner, kept)');

// ---- SP, Move, Jump, evasion, lift
A(F.spMax(1) === F.SP_BASE && F.spMax(999) > F.spMax(100), 'the SP pool grows with level');
A(F.moveRange(45, null) === 3 && F.moveRange(130, null) === 6 && F.moveRange(45, 'haste') === 5, 'Move from Speed tiers; Haste +2 (owner)');
A(F.jumpOf(['Flying'], null) === Infinity && F.jumpOf(['Normal'], 'levitate') === Infinity && F.jumpOf(['Rock'], null) === 3 && F.jumpOf(['Water'], null) === 2, 'Jump from type: Flying / Levitate ignore height');
A(F.speedAccuracyMult(100, 100) === 1 && F.speedAccuracyMult(1000, 10) === F.EVADE_MAX && F.speedAccuracyMult(10, 1000) === F.EVADE_MIN, 'evasion: Speed vs Speed, capped both ways');
A(F.canLift(data.species.machamp, data.extra.machamp) && F.canLift(data.species.alakazam, data.extra.alakazam) && !F.canLift(data.species.magikarp, data.extra.magikarp), 'Fighting types and strong Psychics lift; Magikarp doesn\'t');
const bs = F.battleStats(fig, data);
A(bs.maxHP > 0 && bs.sp === F.spMax(300) && bs.move >= 3 && Number.isFinite(bs.throw), 'battleStats gathers it all', JSON.stringify(bs));

// ---- every species in the game makes a figurine whose moves all have grid shapes
{
	const bad = [], noShape = new Set();
	for (const id of Object.keys(data.species)) {
		if (!data.species[id].baseStats) continue;
		for (const L of [1, 500, 999]) {
			try {
				const f = F.makeFigurine(id, L, makeRng(id + L), data);
				for (const p of f.pool) if (!SHAPES[p.id]) noShape.add(p.id);
				const b = F.battleStats(f, data);
				if (!(b.maxHP > 0 && b.move >= 3)) bad.push(id + '@' + L);
			} catch (e) { bad.push(id + '@' + L + ': ' + e.message); }
		}
	}
	A(!bad.length, `every species makes a figurine at 1, 500 and 999 (${Object.keys(data.species).length} species)`, bad.slice(0, 5).join(' | '));
	A(!noShape.size, 'every move a figurine can learn has a grid shape', [...noShape].slice(0, 10).join(' '));
}
// pure
const src = fs.readFileSync(path.join(ROOT, 'poketactica/js/figurine.js'), 'utf8').replace(/\/\/.*$/gm, '');
A(!/\b(window|document|localStorage)\b|Math\.random/.test(src), 'figurine.js is pure (no DOM, storage or Math.random)');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
