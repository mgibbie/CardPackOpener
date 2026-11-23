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
import { sweep, summary, loadData } from '../../tools/poketactica/sweep_moves.mjs';
import * as B from '../../poketactica/js/engine/battle.js';
import { dynPower, dynFixed, DYN_POWER, DYN_FIXED } from '../../poketactica/js/engine/dynpower.js';
import { tdKind } from '../../poketactica/js/td/effects.js';
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
	A(s.turn.nothing.length <= 162 && s.maze.nothing.length <= 162, `the moves that do nothing in a battle or the maze: ${s.turn.nothing.length} (never more; fewer means the table and this number move down)`, s.turn.nothing.length);
	A(s.td.nothing.length <= 165, `the moves of no use to a tower: ${s.td.nothing.length}`);
	A(s.differ.length <= 1, 'the maze does with a move what a battle does (the same engine): at most a roll of the dice apart', s.differ);
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
	A(B.RULES_REV === 4 && now.lost > 40 && now.log.includes('hit'), 'Return hits hard under today\'s rules', now.lost);
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
	A(tdKind('gyroball', mv) === 'damage' && tdKind('gyroball', mv, false) === 'none', 'a tower fires such a move (a Tower Defense run recorded before does not: its rules)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
