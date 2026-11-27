// poketactica_duel_arenas_test.mjs — VERSUS, MAPS MADE FOR TWO (Plans/POKETACTICA_MODES_PLAN.md item V4). Three small
// boards for two players, the same from either seat; and the lobby offers a friend's shared map by its code.
// (Every arena's own soundness, these three included, is poketactica_pvp_test.mjs's.)
// Pure: node only.   node overworld/tests/poketactica_duel_arenas_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ARENAS, arenaById, arenaSeats, arenaSetup } from '../../poketactica/js/arenas.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { STARTERS } from '../../poketactica/js/figcol.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const team = (tag) => STARTERS.slice(0, 3).map((sp, i) => makeFigurine(sp, 50, makeRng(tag + i), data, { id: tag + '-' + i, shinyRate: 0 }));

const duels = ARENAS.filter((a) => a.two), old = ARENAS.filter((a) => !a.two);
A(duels.map((a) => a.id).join() === 'duel-hill,duel-moat,duel-prism' && old.length === 3 && ARENAS.indexOf(duels[0]) === 3, 'three arenas made for two, after the three that seat four');
A(duels.every((a) => arenaSeats(a) === 2) && old.every((a) => arenaSeats(a) === 4) && arenaSeats(null) === 4, 'a duel arena seats two; the others four');
A(duels.every((a) => a.rows.length === 8 && a.rows.every((r) => r.length === 8) && a.ground.length === 8 && /^Made for two\./.test(a.tip) && a.name), 'each is 8 by 8 and says it is made for two');
A(new Set(ARENAS.map((a) => a.name)).size === ARENAS.length, 'no two arenas share a name');
// the same from either seat: every mirror and turn of the board is the board
{
	const n = 8, ops = [(x, y) => [n - 1 - x, n - 1 - y], (x, y) => [n - 1 - x, y], (x, y) => [x, n - 1 - y], (x, y) => [y, x], (x, y) => [n - 1 - y, x]];
	const keeps = (grid, f) => !grid || grid.every((row, y) => [...row].every((c, x) => { const [u, v] = f(x, y); return grid[v][u] === c; }));
	A(duels.every((a) => ops.every((f) => keeps(a.rows, f) && keeps(a.ground, f) && keeps(a.geo, f))), 'heights, ground and Geo are the same under every mirror and turn: no seat has a better side');
	A(duels.every((a) => (a.symbols || []).every((g) => ops.every((f) => { const [u, v] = f(g.x, g.y); return a.symbols.some((h) => h.x === u && h.y === v); }))), 'and so are the places of the Geo Symbols');
	const pr = arenaById('duel-prism'), eff = (x, y) => pr.symbols.find((g) => g.x === x && g.y === y).effect.stat;
	A(eff(1, 1) === eff(6, 6) && eff(6, 1) === eff(1, 6) && eff(1, 1) !== eff(6, 1), 'Prism Court: each seat has the same symbol to its left and to its right as the other does (a half turn keeps the effects)');
}
// the two bases are nearer than on a four-seat arena, and a battle is made on each
{
	const far = (a) => Math.abs(a.bases[0][0] - a.bases[1][0]) + Math.abs(a.bases[0][1] - a.bases[1][1]);
	A(duels.every((a) => far(a) === 14) && old.every((a) => far(a) >= 18), 'the two start 14 tiles apart (18 or more on the four-seat arenas)', [duels.map(far), old.map(far)]);
	const bad = [];
	for (const a of duels) {
		try {
			const S = B.newBattle('duel-' + a.id, { ...arenaSetup(a, [{ team: team('a') }, { team: team('b') }]), rev: B.RULES_REV }, data);
			if (!S.pvp || S.pvp.sides.length !== 2 || S.units.length !== 6) bad.push(a.id + ': seats');
		} catch (e) { bad.push(a.id + ': ' + e.message); }
	}
	A(bad.length === 0, 'the engine makes a two-seat battle on each', bad);
}
// the lobby and the server
{
	const hub = fs.readFileSync(path.join(ROOT, 'poketactica/js/hub.js'), 'utf8'), srv = fs.readFileSync(path.join(ROOT, 'server/ptpvp.mjs'), 'utf8');
	A(/arenaSeats\(arenaById\(arena\)\) < size\) return json\(\{ error: 'that arena is made for two players' \}, 400\)/.test(srv), 'the server will not make a three- or four-player match on a duel arena');
	A(/if \(a\.two\) \{ o\.size = 2; o\.cpus = Math\.min\(o\.cpus, 1\); \}/.test(hub) && /This arena is made for two/.test(hub) && /Made for two<\/span>/.test(hub), 'picking a duel arena makes the match a two-player one, the other sizes are greyed out, and its panel says so');
	A(/A shared map <small>by its code<\/small>/.test(hub) && /const id = await fetchCode\(\)/.test(hub) && /async function loadCode\(\) \{ const id = await fetchCode\(\); if \(id\) maps\(id\); \}/.test(hub), 'the lobby offers a shared map by its code (the Map Maker\'s own loader), which joins your maps and is picked');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
