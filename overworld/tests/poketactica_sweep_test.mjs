// poketactica_sweep_test.mjs — THE MOVES SWEEP, pinned (owner, 2026-11-23: every move checked in every mode). The table
// in poketactica/data/move_sweep.json says what each of the 882 moves DOES when it is really used in a turn-based battle,
// in Mystery Maze, and as a tower's move (tools/poketactica/sweep_moves.mjs fires each one on a board and compares the
// board before and after). This suite runs the sweep again and holds the table to it, cell by cell: a move that stops
// working (or starts) fails here until the table is rewritten on purpose (`node tools/poketactica/sweep_moves.mjs --write`).
// Also: the moves with a worked-out power (engine/dynpower.js, RULES_REV 4), which all failed before. Pure: node only.
//   node overworld/tests/poketactica_sweep_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sweep, summary, loadData, mazeRun } from '../../tools/poketactica/sweep_moves.mjs';
import * as MM from '../../poketactica/js/mm/turn.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { dynPower, dynFixed, DYN_POWER, DYN_FIXED } from '../../poketactica/js/engine/dynpower.js';
import { tdKind } from '../../poketactica/js/td/effects.js';
import { EXTRA, EXTRA6, answerDamage } from '../../poketactica/js/engine/statusfx.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const data = loadData();
const TABLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'poketactica/data/move_sweep.json'), 'utf8'));

// ---------- the sweep, again, against the table
{
	const R = sweep(data), ids = Object.keys(R), s = summary(R);
	A(ids.length === Object.keys(data.moves).length && ids.length === Object.keys(TABLE).length && ids.length >= 882, `every move is in the table (${ids.length})`);
	for (const k of ['turn', 'maze', 'td']) {
		const off = ids.filter((id) => JSON.stringify(R[id][k]) !== JSON.stringify((TABLE[id] || {})[k]));
		A(!off.length, `${k}: each move does what the table says it does`, off.slice(0, 12).map((id) => `${id}: now ${JSON.stringify(R[id][k])}, table ${JSON.stringify((TABLE[id] || {})[k])}`));
	}
	A(!s.turn.error.length && !s.maze.error.length, 'no move throws when it is used', [s.turn.error, s.maze.error]);
	A(!s.turn.chip.length && !s.maze.chip.length, 'no attacking move lands for a token 1 or 2 HP (a power the engine does not know)', [s.turn.chip, s.maze.chip]);
	// the ones that work in a situation the sweep cannot stage (a foe that has moved, a held item, an ally with Plus ...): each has its own check, and the wiki shows them as working
	const CHECKED = JSON.parse(fs.readFileSync(path.join(ROOT, 'poketactica/data/move_sweep_checked.json'), 'utf8'));
	A(CHECKED.length === 34 && CHECKED.every((id) => s.turn.nothing.includes(id)) && s.turn.nothing.length - CHECKED.length === 22, `${CHECKED.length} moves work where the sweep cannot see, so ${s.turn.nothing.length - CHECKED.length} really do nothing`, CHECKED.filter((id) => !s.turn.nothing.includes(id)));
	A(s.turn.nothing.length <= 56 && s.maze.nothing.length <= 60, `the moves that do nothing in a battle or the maze: ${s.turn.nothing.length} (never more; fewer means the table and this number move down)`, s.turn.nothing.length);
	A(s.td.nothing.length <= 125, `the moves of no use to a tower: ${s.td.nothing.length}`);
	// (the four entry hazards are a battle's and Tower Defense's: the maze has its own traps. A knockback move pushes in both; in the battle scene another foe stands behind the target.)
	const BY_DESIGN = ['spikes', 'toxicspikes', 'stealthrock', 'stickyweb', 'circlethrow', 'dragontail'], apart = s.differ.filter((id) => !BY_DESIGN.includes(id));
	A(apart.length <= 3 && BY_DESIGN.slice(0, 4).every((id) => s.differ.includes(id)), 'the maze does with a move what a battle does (the same engine): at most a roll of the dice apart, but for the entry hazards', apart);
	const status2 = ['bellydrum', 'filletaway', 'clangoroussoul', 'noretreat', 'geomancy', 'charge', 'tidyup', 'takeheart', 'stockpile', 'swallow', 'acupressure', 'focusenergy', 'dragoncheer', 'coaching', 'aromaticmist', 'decorate', 'nobleroar', 'partingshot', 'spicyextract', 'memento', 'strengthsap', 'speedswap', 'powersplit', 'guardsplit', 'painsplit', 'healbell', 'aromatherapy', 'refresh', 'purify', 'psychoshift', 'soak', 'magicpowder', 'camouflage', 'forestscurse', 'trickortreat', 'reflecttype', 'conversion', 'counter', 'mirrorcoat', 'metalburst', 'comeuppance', 'bide', 'spitup'];
	const bad2 = status2.filter((id) => !R[id].turn.did.length || !R[id].maze.did.length);
	A(!bad2.length, `the ${status2.length} moves of the second pass (status moves the tables lacked, Counter's kin, Spit Up) do something in a battle and in the maze`, bad2);
	const revived = ['return', 'frustration', 'veeveevolley', 'pikapapow', 'gyroball', 'electroball', 'flail', 'reversal', 'wringout', 'crushgrip', 'hardpress', 'punishment', 'trumpcard', 'lowkick', 'grassknot', 'heavyslam', 'heatcrash', 'magnitude', 'present', 'beatup', 'psywave', 'finalgambit'];
	const bad = revived.filter((id) => !R[id].turn.did.includes('damage') || !R[id].maze.did.includes('damage') || R[id].td !== 'damage');
	A(!bad.length, `the ${revived.length} moves with a worked-out power deal damage in all three (they all failed before)`, bad);
}

// ---------- worked-out powers
{
	const fig = (sp, lv) => makeFigurine(sp, lv, makeRng(sp), data, { id: sp, shinyRate: 0 });
	const duel = (rev) => { const S = B.newBattle('d', { map: { w: 5, h: 5, height: Array(25).fill(0), base: { x: 0, y: 0 } }, noBonus: true, rev, player: [fig('mew', 60)], enemy: [{ fig: fig('squirtle', 50), x: 2, y: 1, ai: 'hold' }] }, data); S.units[0].x = 2; S.units[0].y = 2; return S; };
	const use = (rev, id) => { const S = duel(rev), v = S.units[1], log = B.useMoveAt(S, S.units[0], { move: id, x: 2, y: 1 }, data); return { lost: v.maxHP - v.hp, log: log.map((e) => e.t), S }; };
	const now = use(B.RULES_REV, 'return'), old = use(3, 'return');
	A(B.RULES_REV >= 4 && now.lost > 40 && now.log.includes('hit'), 'Return hits hard under today\'s rules', now.lost);
	A(old.lost === 0 && old.log.includes('fail'), 'a battle recorded under the old rules (rev 3) replays as it went: Return fails there', old);
	const f = B.forecast(duel(B.RULES_REV), duel(B.RULES_REV).units[0], 'return', 2, 1, data);
	A(f && f.targets[0] && f.targets[0].min > 40 && f.targets[0].max >= f.targets[0].min, 'and the forecast shows its damage before you commit', f && f.targets[0]);
	const u = { hp: 100, maxHP: 100, level: 50, stats: { spe: 100 }, pp: { trumpcard: 5 } }, v = { hp: 50, maxHP: 100, stats: { spe: 50 }, boosts: { atk: 2, def: -1 } };
	const m = (id, level = 1) => ({ id, level, grow: { pow: 2 } }), mid = () => 0.5;
	A(dynPower(m('return'), u, v, mid) === 102 && dynPower(m('return', 99), u, v, mid) === 204, 'Return: 102, doubling by the move\'s top level as a listed power does');
	A(dynPower(m('gyroball'), u, v, mid) === 13 && dynPower(m('gyroball'), { ...u, stats: { spe: 10 } }, v, mid) === 126, 'Gyro Ball: stronger the slower the user is than its target');
	A(dynPower(m('electroball'), u, v, mid) === 80 && dynPower(m('electroball'), u, { ...v, stats: { spe: 200 } }, mid) === 40, 'Electro Ball: stronger the faster the user is');
	A(dynPower(m('flail'), u, v, mid) === 20 && dynPower(m('reversal'), { ...u, hp: 3 }, v, mid) === 200, 'Flail / Reversal: stronger the less HP the user has left');
	A(dynPower(m('wringout'), u, v, mid) === 60 && dynPower(m('hardpress'), u, { ...v, hp: 100 }, mid) === 100, 'Wring Out / Crush Grip / Hard Press: stronger the more HP the target has');
	A(dynPower(m('punishment'), u, v, mid) === 100, 'Punishment: +20 for each stage the target has raised');
	A(dynPower(m('trumpcard'), u, v, mid) === 40 && dynPower(m('trumpcard'), { ...u, pp: { trumpcard: 0 } }, v, mid) === 200, 'Trump Card: stronger as its PP run out');
	A(dynPower(m('magnitude'), u, v, () => 0.01) === 10 && dynPower(m('magnitude'), u, v, () => 0.99) === 150 && dynPower(m('present'), u, v, () => 0.95) === 120, 'Magnitude and Present roll their power');
	A(dynPower(m('beatup'), u, v, mid, 0) === 10 && dynPower(m('beatup'), u, v, mid, 3) === 55, 'Beat Up: stronger with each ally on the board');
	A(dynPower(m('tackle'), u, v, mid) === 0 && DYN_POWER.size === 20 && DYN_FIXED.size === 3, 'a move with a listed power is not one of these');
	A(dynFixed('psywave', u, v, () => 0) === 25 && dynFixed('psywave', u, v, () => 0.999) === 75 && dynFixed('endeavor', { ...u, hp: 10 }, v, mid) === 40 && dynFixed('endeavor', u, v, mid) === 0, 'Psywave: half to one and a half times the user\'s level; Endeavor: down to the user\'s HP (nothing if it has more)');
	const fg = use(B.RULES_REV, 'finalgambit');
	A(fg.lost > 0 && fg.S.units[0].hp === 0, 'Final Gambit: the user\'s HP as damage, and the user faints', [fg.lost, fg.S.units[0].hp]);
	const mv = B.moveOf(duel(B.RULES_REV).units[0], 'gyroball', data);
	A(tdKind('gyroball', mv) === 'damage' && tdKind('gyroball', mv, 3) === 'none' && tdKind('counter', B.moveOf(duel(B.RULES_REV).units[0], 'counter', data)) === 'none' && tdKind('counter', B.moveOf(duel(B.RULES_REV).units[0], 'counter', data), 4) === 'damage', 'a tower fires such a move (a Tower Defense run recorded before does not: its rules)');
}

// ---------- the second pass: status moves the tables lacked, and the moves that answer a hit (RULES_REV 5)
{
	const fig = (sp, lv) => makeFigurine(sp, lv, makeRng(sp), data, { id: sp, shinyRate: 0 });
	const duel = (rev, foe = 'squirtle', seed = 'd2') => { const S = B.newBattle(seed, { map: { w: 5, h: 5, height: Array(25).fill(0), base: { x: 0, y: 0 } }, noBonus: true, rev, player: [fig('machamp', 50)], enemy: [{ fig: fig(foe, 50), x: 2, y: 1, ai: 'hold' }] }, data); S.units[0].x = 2; S.units[0].y = 2; return S; };
	const use = (S, id, x = 2, y = 1) => B.useMoveAt(S, S.units[0], { move: id, x, y }, data).map((e) => e.t);
	{
		const S = duel(5), u = S.units[0], hp = u.hp;
		use(S, 'bellydrum', 2, 2);
		A(u.boosts.atk === 6 && u.hp === hp - Math.floor(u.maxHP / 2), 'Belly Drum: half the user\'s HP for maximum Attack', [u.boosts.atk, hp, u.hp]);
		u.hp = 5; u.boosts.atk = 0;
		A(use(S, 'bellydrum', 2, 2).includes('noeffect') && u.hp === 5 && u.boosts.atk === 0, 'and it fails if the user cannot pay');
		const old = duel(4), ou = old.units[0];
		A(use(old, 'bellydrum', 2, 2).includes('noeffect') && ou.boosts.atk === 0 && ou.hp === ou.maxHP, 'a battle recorded under rev 4 replays as it went: Belly Drum does nothing there');
	}
	{
		const S = duel(5), u = S.units[0], v = S.units[1];
		v.boosts.atk = 2; v.boosts.def = -1;
		use(S, 'psychup'); A(u.boosts.atk === 2 && u.boosts.def === -1, 'Psych Up copies the target\'s stages');
		use(S, 'topsyturvy'); A(v.boosts.atk === -2 && v.boosts.def === 1, 'Topsy-Turvy turns them upside down');
		use(S, 'haze', 2, 2); A(!Object.values(u.boosts).some(Boolean) && !Object.values(v.boosts).some(Boolean), 'Haze clears everyone\'s');
		u.boosts.atk = 3; use(S, 'powerswap'); A(u.boosts.atk === 0 && v.boosts.atk === 3, 'Power Swap trades Attack stages');
		u.boosts.eva = 1; use(S, 'heartswap'); A(u.boosts.atk === 3 && v.boosts.eva === 1 && v.boosts.atk === 0, 'Heart Swap trades them all');
		const a = u.stats.atk, d = u.stats.def; use(S, 'powertrick', 2, 2); A(u.stats.atk === d && u.stats.def === a && a !== d, 'Power Trick swaps the user\'s own Attack and Defense');
		A(!use(S, 'venomdrench').includes('boost'), 'Venom Drench does nothing to a foe that is not poisoned');
		v.status = 'psn'; const b0 = v.boosts.spe; use(S, 'venomdrench'); A(v.boosts.spe === b0 - 1, 'and lowers a poisoned one');
		use(S, 'soak'); A(v.types.length === 1 && v.types[0] === 'Water', 'Soak makes the target a Water type');
		use(S, 'forestscurse'); A(v.types.includes('Grass') && v.types.includes('Water'), 'Forest\'s Curse adds Grass');
		const d0 = v.boosts.def; use(S, 'flowershield', 2, 2); A(v.boosts.def === d0 + 1 && u.boosts.def === 0, 'Flower Shield then raises its Defense (Grass types only: not the user\'s)', [v.boosts.def, d0]);
	}
	{
		const S = duel(5), u = S.units[0], v = S.units[1];
		A(use(S, 'counter').includes('fail'), 'Counter fails with nothing to answer');
		B.useMoveAt(S, v, { move: 'tackle', x: 2, y: 2 }, data);
		const took = u.lastHit && u.lastHit.n, hp = v.hp;
		A(took > 0 && u.lastHit.phys === true, 'a hit taken is remembered (how much, and that it was physical)', u.lastHit);
		A(use(duelCopy(S), 'mirrorcoat').includes('fail'), 'Mirror Coat does not answer a physical hit');
		use(S, 'counter');
		A(hp - v.hp === Math.min(hp, took * 2) && u.lastHit === null, 'Counter gives a physical hit back doubled, once', [took, hp - v.hp]);
		A(answerDamage('metalburst', { lastHit: { n: 20, phys: false } }) === 30 && answerDamage('mirrorcoat', { lastHit: { n: 20, phys: false } }) === 40 && answerDamage('counter', { lastHit: { n: 20, phys: false } }) === 0, 'Metal Burst answers any hit at one and a half times; Mirror Coat a special one doubled');
	}
	{
		const S = duel(5), u = S.units[0], v = S.units[1];
		A(use(S, 'spitup').includes('fail'), 'Spit Up fails with nothing stockpiled');
		use(S, 'stockpile', 2, 2); use(S, 'stockpile', 2, 2);
		A(u.stock === 2 && u.boosts.def === 2 && u.boosts.spd === 2, 'Stockpile: +1 Defense and Sp. Def each time, up to three');
		const hp = v.hp; use(S, 'spitup');
		A(v.hp < hp && u.stock === 0, 'Spit Up spends the stockpile as damage');
		A(Object.keys(EXTRA).length === 47, 'the second pass\'s status rules: 47 moves', Object.keys(EXTRA).length);
	}
	function duelCopy(S) { const C = structuredClone(S); return C; }
}

// ---------- the third pass: marks that last (RULES_REV 6)
{
	const fig = (sp, lv) => makeFigurine(sp, lv, makeRng(sp), data, { id: sp, shinyRate: 0 });
	const duel = (rev, foe = 'squirtle') => { const S = B.newBattle('d3', { map: { w: 5, h: 5, height: Array(25).fill(0), base: { x: 0, y: 0 } }, noBonus: true, rev, player: [fig('machamp', 50)], enemy: [{ fig: fig(foe, 50), x: 2, y: 1, ai: 'hold' }] }, data); S.units[0].x = 2; S.units[0].y = 2; return S; };
	const use = (S, id, x = 2, y = 1, by = 0) => B.useMoveAt(S, S.units[by], { move: id, x, y }, data).map((e) => e.t);
	const turn = (S, u) => B.upkeepUnit(S, u, data);
	const third = ['reflect', 'lightscreen', 'auroraveil', 'safeguard', 'luckychant', 'taunt', 'healblock', 'foresight', 'odorsleuth', 'leechseed', 'yawn', 'nightmare', 'aquaring', 'ingrain', 'wish', 'endure', 'lockon', 'mindreader', 'laserfocus', 'helpinghand', 'gastroacid', 'worryseed', 'simplebeam', 'entrainment', 'roleplay', 'doodle', 'skillswap'];
	A(third.every((id) => TABLE[id].turn.did.length && TABLE[id].maze.did.length) && Object.keys(EXTRA6).length === 28, `the ${third.length} moves of the third pass do something in a battle and in the maze (and Spite, below)`, third.filter((id) => !TABLE[id].turn.did.length));
	{
		// a screen halves the hit (the same dice with and without it)
		const hit = (screen, rev = 6) => { const S = duel(rev), u = S.units[0], v = S.units[1]; if (screen) use(S, screen, 2, 2); S.rng = makeRng('same').state(); const hp = u.hp; B.useMoveAt(S, v, { move: 'tackle', x: 2, y: 2 }, data); return hp - u.hp; };
		const bare = hit(null), behind = hit('reflect'), wrong = hit('lightscreen');
		A(bare > 4 && behind <= Math.ceil(bare / 2) && behind >= Math.floor(bare / 2) - 1 && wrong === bare, 'Reflect halves a physical hit for 5 turns (Light Screen does not: that is for special hits)', [bare, behind, wrong]);
		A(hit('reflect', 5) === bare, 'a battle recorded under rev 5 replays as it went: Reflect does nothing there');
		const S = duel(6), u = S.units[0];
		use(S, 'reflect', 2, 2);
		for (let i = 0; i < 4; i++) turn(S, u);
		const still = !!(u.fx && u.fx.reflect); turn(S, u);
		A(still && !(u.fx && u.fx.reflect), 'and it wears off after its 5 turns');
	}
	{
		const S = duel(6), u = S.units[0], v = S.units[1];
		use(S, 'taunt');
		A(/taunted/.test(B.heldBlock(v, 'growl', data) || '') && B.heldBlock(v, 'tackle', data) === null && B.heldBlock(u, 'growl', data) === null, 'Taunt: the target is refused its status moves (not its attacks, and not the user)');
		turn(S, v); turn(S, v); turn(S, v);
		A(B.heldBlock(v, 'growl', data) === null, 'for 3 turns');
		use(S, 'leechseed'); v.hp = v.maxHP; u.hp = 50;
		turn(S, v);
		const n = Math.floor(v.maxHP / 8);
		A(v.seed === u.uid && v.hp === v.maxHP - n && u.hp === 50 + n, 'Leech Seed: every turn an eighth of the target\'s HP goes to whoever planted it', [v.hp, u.hp, n]);
		const G = duel(6, 'bulbasaur'); use(G, 'leechseed');
		A(!G.units[1].seed, 'a Grass type cannot be seeded');
		use(S, 'yawn'); turn(S, v); const awake = v.status !== 'slp'; turn(S, v);
		A(awake && v.status === 'slp', 'Yawn: asleep at the end of its next turn, not before');
		use(S, 'nightmare'); const hp = v.hp; v.seed = null; turn(S, v);
		A(hp - v.hp === Math.floor(v.maxHP / 4), 'Nightmare: a sleeper loses a quarter of its HP each turn', [hp, v.hp]);
		u.hp = 10; use(S, 'wish', 2, 2); turn(S, u); const before = u.hp; turn(S, u);
		A(before === 10 && u.hp === 10 + Math.floor(u.maxHP / 2), 'Wish: half the user\'s HP, two turns on');
		use(S, 'aquaring', 2, 2); const h0 = u.hp; turn(S, u);
		A(u.hp === h0 + Math.floor(u.maxHP / 16), 'Aqua Ring: a sixteenth back every turn');
	}
	{
		const S = duel(6), u = S.units[0], v = S.units[1];
		u.hp = 3; use(S, 'endure', 2, 2);
		B.useMoveAt(S, v, { move: 'tackle', x: 2, y: 2 }, data); B.useMoveAt(S, v, { move: 'tackle', x: 2, y: 2 }, data);
		A(u.hp === 1, 'Endure: the user hangs on with 1 HP this turn', u.hp);
		u.hp = u.maxHP; use(S, 'safeguard', 2, 2);
		B.useMoveAt(S, v, { move: 'thunderwave', x: 2, y: 2 }, data);
		A(u.status === null, 'Safeguard: a foe\'s status move is turned away');
		use(S, 'healblock'); v.hp = 10; B.useMoveAt(S, v, { move: 'recover', x: 2, y: 1 }, data);
		A(v.hp === 10, 'Heal Block: the target cannot heal');
		v.hp = v.maxHP;
		use(S, 'lockon'); A(u.fx.sureHit > 0, '(Lock-On marks the user)'); use(S, 'tackle');
		A(!u.fx.sureHit, 'Lock-On: the next attack cannot miss, and that spends it');
		const ab = v.ability, mine = u.ability;
		use(S, 'skillswap'); A(u.ability === ab && v.ability === mine, 'Skill Swap trades abilities');
		use(S, 'gastroacid'); A(v.ability === null, 'Gastro Acid takes the target\'s ability away');
		const id = Object.keys(v.pp)[0], pp = v.pp[id]; use(S, 'spite');
		A(v.pp[id] === Math.max(0, pp - 4), 'Spite: 4 PP off one of the target\'s moves');
	}
	{
		// the maze: a mark's turn is every 10th turn of the unit's own
		const S = mazeRun(data), L = MM.leaderOf(S);
		for (let i = S.units.length - 1; i >= 0; i--) if (S.units[i].side !== 'p') S.units.splice(i, 1);
		L.hp = 10; L.fx = { wish: 1 };
		for (let i = 0; i < 9; i++) MM.act(S, { t: 'pass' }, data);
		const mid = L.hp; MM.act(S, { t: 'pass' }, data); MM.act(S, { t: 'pass' }, data);
		A(mid < 10 + Math.floor(L.maxHP / 2) && L.hp >= 10 + Math.floor(L.maxHP / 2), 'in the maze a mark\'s turn is every 10th turn of the unit\'s own: a Wish comes true there too', [mid, L.hp]);
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
