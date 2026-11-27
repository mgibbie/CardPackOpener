// poketactica_mm_arena_test.mjs — MYSTERY MAZE, BOSS ARENAS (Plans/POKETACTICA_MODES_PLAN.md item M4; rules 26). A boss
// stood wherever the plain layout put the stairs. Its floor now has an arena cut round the stairs: 9 by 7, four pillars,
// ground of the boss's own kind. Walls become floor; nothing that was open is closed.
// Pure: node only.   node overworld/tests/poketactica_mm_arena_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W as W, MM_H as H, T_WALL, T_FLOOR } from '../../poketactica/js/mm/gen.js';
import { DUNGEONS } from '../../poketactica/js/mm/dungeons.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const party = [makeFigurine('machamp', 80, makeRng('m'), data, { id: 'm-a', shinyRate: 0 })];
/** A run walked down to its boss floor (the stairs put under the leader each time). */
function toBoss(d, seed, rev) {
	const S = MM.newRun(seed, { dungeon: d, party, ...(rev ? { rev } : {}) }, data), last = d.floors.length;
	for (let k = 0; k < last + 2 && S.floorNo < last && !S.over; k++) { const L = MM.leaderOf(S); S.F.stairs = [L.x, L.y]; MM.act(S, { t: 'stairs' }, data); }
	return S;
}
const kindOf = (F, x, y) => F.terrain[y * W + x] & 3;

A(MM.MM_RULES_REV >= 26 && MM.ARENA_REV === 26 && MM.ARENA_W === 9 && MM.ARENA_H === 7, 'rules 26: a boss arena is 9 by 7');
A(MM.arenaKind(['Fire', 'Flying']) === 'fire' && MM.arenaKind(['Ice']) === 'ice' && MM.arenaKind(['Water']) === 'ice' && MM.arenaKind(['Grass']) === 'moss' && MM.arenaKind(['Bug']) === 'moss' && MM.arenaKind(['Rock']) === 'stone' && MM.arenaKind([]) === 'stone', 'its ground is the boss\'s kind: fire, ice (Ice or Water), moss (Grass or Bug), or stone');

const story = DUNGEONS.filter((d) => !d.endless && d.floors[d.floors.length - 1].boss);
A(story.length >= 8, 'the story dungeons end on a boss floor', story.map((d) => d.id));
const kinds = new Set();
for (const d of story) {
	const S = toBoss(d, 'arena-' + d.id), F = S.F, a = F.arena, boss = S.units.find((u) => u.boss), fl = d.floors[d.floors.length - 1];
	if (!a) { A(false, d.name + ': its boss floor has an arena', [S.floorNo, d.floors.length]); continue; }
	kinds.add(a.kind);
	let walls = 0, open = 0;
	for (let y = a.y0; y <= a.y1; y++) for (let x = a.x0; x <= a.x1; x++) { if (kindOf(F, x, y) === T_WALL) walls++; else open++; }
	const [sx, sy] = F.stairs, inside = (x, y) => x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1;
	A(a.x1 - a.x0 + 1 === 9 && a.y1 - a.y0 + 1 === 7 && a.x0 >= 1 && a.y0 >= 1 && a.x1 <= W - 2 && a.y1 <= H - 2 && inside(sx, sy) && walls <= 4 && open >= 59 && kindOf(F, sx, sy) !== T_WALL,
		`${d.name}: an arena 9 by 7 round the stairs, inside the map, open but for its pillars (${walls})`, [a, walls, open]);
	A(boss && inside(boss.x, boss.y) && a.kind === MM.arenaKind(data.species[fl.boss.species].types) && MM.view(S).arena.kind === a.kind, `${d.name}: ${fl.boss.species} stands in it, on ${a.kind} ground (the view says so, for the page)`, [boss && [boss.x, boss.y], a.kind]);
	// nothing that was open is closed, and the party can still walk to the stairs
	const old = toBoss(d, 'arena-' + d.id, 25);
	let closed = 0;
	for (let i = 0; i < W * H; i++) if ((old.F.terrain[i] & 3) !== T_WALL && (F.terrain[i] & 3) === T_WALL) closed++;
	const L = MM.leaderOf(S), seen = new Set([L.y * W + L.x]), q = [[L.x, L.y]];
	while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, i = ny * W + nx; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(i) || kindOf(F, nx, ny) !== T_FLOOR) continue; seen.add(i); q.push([nx, ny]); } }
	A(!old.F.arena && closed === 0 && seen.has(sy * W + sx), `${d.name}: under rules 25 there is no arena; nothing that was open is closed, and the stairs can be walked to`, [closed, seen.has(sy * W + sx)]);
}
A(kinds.size >= 3, 'the dungeons\' arenas are not all one kind', [...kinds]);
// ---------- only the boss's floor
{
	const d = story[0], S = MM.newRun('plain', { dungeon: d, party }, data);
	A(!S.F.arena && !MM.view(S).arena, 'a floor with no boss has no arena');
	const a = toBoss(d, 'same'), b = toBoss(d, 'same');
	A(MM.hashOf(a) === MM.hashOf(b), 'the same seed makes the same arena');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
