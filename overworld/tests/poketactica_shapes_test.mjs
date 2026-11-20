// poketactica_shapes_test.mjs — every move and every ability in the game has a Poketactica grid shape (owner,
// 2026-11-20), the shapes are well formed, and poketactica/data/*_shapes.json are what tools/poketactica/gen_shapes.mjs
// makes from the rules + shape_overrides.json (re-run it after changing either). Pure: reads files.
//   node overworld/tests/poketactica_shapes_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build, moveShape } from '../../tools/poketactica/gen_shapes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + extra : '')); } };

const ours = J('overworld/data/moves_battle.json');
const speciesAb = J('overworld/data/species_abilities.json');
const MS = J('poketactica/data/move_shapes.json');
const AS = J('poketactica/data/ability_shapes.json');
const OV = J('poketactica/data/shape_overrides.json');

// ---- coverage
const abIds = [...new Set(Object.values(speciesAb).flat().filter((a) => typeof a === 'string'))];
const noMove = Object.keys(ours).filter((id) => !MS[id]);
const noAb = abIds.filter((id) => !AS[id]);
A(!noMove.length, `every move has a shape (${Object.keys(MS).length}/${Object.keys(ours).length})`, noMove.join(' '));
A(!noAb.length, `every ability has a shape (${Object.keys(AS).length}/${abIds.length})`, noAb.join(' '));
A(Object.keys(MS).every((id) => ours[id]) && Object.keys(AS).every((id) => abIds.includes(id)), 'no shape for a move / ability the game doesn\'t have');
A(Object.keys(OV.moves).every((id) => ours[id]) && Object.keys(OV.abilities).every((id) => abIds.includes(id)), 'every override names a real move / ability');

// ---- well formed
const SHAPES = new Set(['one', 'line', 'cone', 'arc', 'cross', 'dia', 'burst', 'aura', 'dash', 'leap', 'trap', 'paint', 'map', 'swap', 'self']);
const SIZED = new Set(['line', 'cone', 'arc', 'cross', 'dia', 'burst', 'aura', 'dash', 'trap', 'paint']);
const bad = [];
for (const [id, m] of Object.entries(MS)) {
	const why = [];
	if (!SHAPES.has(m.s)) why.push('shape ' + m.s);
	if (SIZED.has(m.s) && !(m.n >= 1 && m.n <= 8)) why.push('size ' + m.n);
	if (!Array.isArray(m.r) || m.r.length !== 2 || !(m.r[0] >= 0 && m.r[0] <= m.r[1] && m.r[1] <= 8)) why.push('range ' + JSON.stringify(m.r));
	if (!['foe', 'ally', 'any', 'self', 'tile'].includes(m.t)) why.push('t ' + m.t);
	if (!['melee', 'lob', 'beam', 'any'].includes(m.h)) why.push('h ' + m.h);
	if (!(Number.isInteger(m.sp) && m.sp >= 1 && m.sp <= 60)) why.push('sp ' + m.sp);
	if (m.pp !== (ours[id].pp | 0)) why.push('pp ' + m.pp);
	const g = m.grow || {};
	if (!['power', 'area', 'reach', 'status', 'buff', 'field', 'fixed'].includes(g.track)) why.push('track ' + g.track);
	if (!(g.pow >= 1 && g.pow <= 3) || !(g.sp > 0 && g.sp <= 1) || !(g.acc >= 0 && g.acc <= 30)) why.push('grow numbers');
	if (!Array.isArray(g.at) || g.at.some(([lv, ch], i) => !(Number.isInteger(lv) && lv >= 2 && lv <= 99) || (i && lv <= g.at[i - 1][0]) || !ch || typeof ch !== 'object' || (ch.s && !SHAPES.has(ch.s)))) why.push('milestones');
	if (m.s === 'self' && (m.r[0] || m.r[1])) why.push('self with range');
	if (!m.note) why.push('no note');
	if (why.length) bad.push(id + ': ' + why.join(', '));
}
A(!bad.length, 'every move shape is well formed (shape, size, range, target, height rule, SP, PP, growth to level 99)', bad.slice(0, 12).join(' | '));
const badA = Object.entries(AS).filter(([, a]) => !['self', 'aura', 'burst', 'map', 'zone', 'pull', 'paint', 'trap'].includes(a.s) || !['always', 'enter', 'hit', 'contact', 'attack', 'ko', 'turn'].includes(a.on) || !['self', 'foe', 'ally', 'all'].includes(a.aff) || !a.note || (a.s !== 'self' && a.s !== 'map' && !(a.n >= 1 && a.n <= 5))).map(([k]) => k);
A(!badA.length, 'every ability shape is well formed (static: no growth)', badA.join(' '));
A(Object.values(AS).every((a) => !a.grow), 'abilities never level');

// ---- current
const now = build();
const diffM = Object.keys(now.moves).filter((id) => JSON.stringify(now.moves[id]) !== JSON.stringify(MS[id]));
const diffA = Object.keys(now.abilities).filter((id) => JSON.stringify(now.abilities[id]) !== JSON.stringify(AS[id]));
A(!diffM.length && !diffA.length, 'the shape files are current (node tools/poketactica/gen_shapes.mjs)', [...diffM, ...diffA].slice(0, 10).join(' '));

// ---- the rules translate Pokémon's own targeting (a few anchors)
const S = (id) => MS[id] || {};
A(S('earthquake').s === 'burst' && S('earthquake').ff === 1, 'Earthquake hits everyone around the user, allies too (Pokémon: all adjacent)');
A(S('hyperbeam').s === 'line' && S('rockslide').s === 'dia' && S('heatwave').s === 'cone', 'beams are lines, Rock Slide falls on an area, Heat Wave fans out');
A(S('quickattack').s === 'dash' && S('extremespeed').n > S('tackle').n, 'priority moves dash (Extreme Speed further than a plain melee hit)');
A(S('tackle').r[1] === 1 && S('tackle').h === 'melee' && S('thunderbolt').r[1] >= 3, 'contact moves are melee, special hits reach');
A(S('spikes').s === 'trap' && S('electricterrain').s === 'paint' && S('raindance').s === 'map' && S('reflect').s === 'aura', 'hazards are traps, terrains paint Geo colours, weather is map-wide, screens are auras');
A(S('uturn').piv > 0 && S('roar').kb > 0 && S('fly').s === 'leap' && S('swordsdance').s === 'self', 'U-turn moves on after hitting, Roar knocks back, Fly leaps, Swords Dance is on the user');
A(AS.intimidate.s === 'burst' && AS.intimidate.on === 'enter' && AS.lightningrod.s === 'pull' && AS.drought.s === 'map' && AS.arenatrap.s === 'zone' && AS.hugepower.s === 'self', 'Intimidate bursts on landing, Lightning Rod pulls, Drought covers the map, Arena Trap holds, Huge Power is the user\'s own');
A(moveShape('nosuchmove', { category: 'Physical', power: 50, acc: 100, pp: 10 }, null).s === 'one', 'a move with no Showdown data still gets a shape');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
