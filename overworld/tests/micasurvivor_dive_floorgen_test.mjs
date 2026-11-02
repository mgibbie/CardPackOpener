// micasurvivor_dive_floorgen_test.mjs — MicaSurvivor Dive V1: the floor generator (micasurvivor/js/expedition/dive-gen.js),
// PokéDive's cellular-automaton floors (Plans/MICASURVIVOR_DIVE_MODE_PLAN.md 2.3). Node only (no browser): the generator is
// pure. Over 8 routes x 1..60 floors x several seeds:
//   - deterministic: the same {seed, route, floor} gives the same floor (a guest / replay / spectator rebuilds it)
//   - the grid is 56 x 40, walled all round; >= 45 % open (30 % a maze) once the retries are spent
//   - stairs reachable ON FOOT from the spawn (lakes never cut the path), at >= 90 % of the longest walk where carved
//   - the lost Pokémon on every non-guardian floor, reachable, 35-80 % of the stairs' walk
//   - foe groups >= 16 steps from the spawn; chests 1-3 on floor tiles, >= 10 apart
//   - the cadence: an alpha arena every 5th (a clearing), the guardian's oval arena every 25th, the rope on 10 / 20 / 25s
//   node overworld/tests/micasurvivor_dive_floorgen_test.mjs
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', '..', 'micasurvivor', 'js', 'expedition', 'dive-gen.js');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + extra : '')); } };
const t0 = Date.now();

const ctx = { G: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: SRC });
const D = ctx.G.DiveGen;
A(D && typeof D.layout === 'function' && D.ROUTE_IDS.length === 8, 'G.DiveGen loads on its own with 8 routes', D && D.ROUTE_IDS.join(','));

// BFS over floor tiles only (what you can walk)
function walk(L, from) {
	const { w, h, kind } = L, d = new Int32Array(w * h).fill(-1), q = [from[1] * w + from[0]];
	d[q[0]] = 0;
	for (let k = 0; k < q.length; k++) {
		const i = q[k], x = i % w, y = (i / w) | 0;
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const xx = x + dx, yy = y + dy, j = yy * w + xx;
			if (xx < 0 || yy < 0 || xx >= w || yy >= h || d[j] >= 0 || kind[j] !== 0) continue;
			d[j] = d[i] + 1; q.push(j);
		}
	}
	return d;
}

const errs = { det: [], size: [], border: [], open: [], stairs: [], far: [], rescue: [], groups: [], chests: [], cadence: [] };
let n = 0, shapes = {};
for (const route of D.ROUTE_IDS) for (let floor = 1; floor <= 60; floor++) for (const seed of [1, 777, 123456789]) {
	const L = D.layout({ seed, route, floor }), tag = `${route}/${floor}/${seed}`;
	n++; shapes[L.shape] = (shapes[L.shape] || 0) + 1;
	if (floor % 7 === 0) {
		const L2 = D.layout({ seed, route, floor });
		if (Buffer.compare(Buffer.from(L.kind), Buffer.from(L2.kind)) || Buffer.compare(Buffer.from(L.prop), Buffer.from(L2.prop)) || JSON.stringify([L.stairs, L.rescue, L.groups, L.chests, L.landmark]) !== JSON.stringify([L2.stairs, L2.rescue, L2.groups, L2.chests, L2.landmark])) errs.det.push(tag);
	}
	if (L.w !== 56 || L.h !== 40 || L.kind.length !== 56 * 40) errs.size.push(tag);
	for (let x = 0; x < L.w; x++) if (L.kind[x] !== 1 || L.kind[(L.h - 1) * L.w + x] !== 1) { errs.border.push(tag); break; }
	for (let y = 0; y < L.h; y++) if (L.kind[y * L.w] !== 1 || L.kind[y * L.w + L.w - 1] !== 1) { errs.border.push(tag); break; }
	if (L.shape !== 'guardian' && L.open < (L.shape === 'maze' ? 0.3 : 0.45)) errs.open.push(tag + ' ' + L.shape + ' ' + L.open);
	const d = walk(L, L.spawn), di = p => d[p[1] * L.w + p[0]];
	if (!(di(L.stairs) > 0) || di(L.stairs) !== L.stairsSteps) errs.stairs.push(tag);
	if (L.shape !== 'guardian') {
		// (the stairs are picked on the carved floor, before the lakes: the path is >= 90 % of its longest walk)
		if (!(L.farSteps > 0) || L.path.length - 1 < 0.9 * L.farSteps) errs.far.push(tag + ` ${L.path.length - 1}/${L.farSteps}`);
		const r = L.rescue ? di(L.rescue) : -1;
		if (!(r > 0) || r < 0.35 * L.stairsSteps - 1 || r > 0.8 * L.stairsSteps + 1) errs.rescue.push(tag + ` ${r}/${L.stairsSteps}`);
		if (!L.groups.length || L.groups.some(g => !(di(g.at) >= 16))) errs.groups.push(tag);
		if (L.chests.length < 1 || L.chests.length > 3 || L.chests.some(c => L.kind[c[1] * L.w + c[0]] !== 0)
			|| L.chests.some((c, i) => L.chests.some((o, j) => j > i && Math.abs(c[0] - o[0]) + Math.abs(c[1] - o[1]) < 10))) errs.chests.push(tag);
	}
	const c = L.cadence;
	if (c.arena !== (floor % 5 === 0) || c.guardian !== (floor % 25 === 0) || c.rope !== (floor % 10 === 0 || floor % 25 === 0)
		|| (c.guardian ? L.shape !== 'guardian' : c.arena ? L.shape !== 'clearing' : L.shape === 'guardian')
		|| (c.arena && L.landmark)) errs.cadence.push(tag + ' ' + L.shape);
}
const show = k => errs[k].slice(0, 5).join(', ');
A(!errs.det.length, 'deterministic: the same seed + route + floor rebuilds the same floor', show('det'));
A(!errs.size.length && !errs.border.length, `every floor is 56 x 40 and walled all round (${n} floors)`, show('size') + ' ' + show('border'));
A(!errs.open.length, '>= 45 % of the inner grid open (a maze: 30 %)', show('open'));
A(!errs.stairs.length, 'the stairs are reachable on foot from the spawn on every floor (lakes never cut the path)', show('stairs'));
A(!errs.far.length, 'the stairs are far: the path is about the longest walk on the floor', show('far'));
A(!errs.rescue.length, 'every non-guardian floor has its lost Pokémon, reachable, 35-80 % of the way to the stairs', show('rescue'));
A(!errs.groups.length, 'foe groups on every carved floor, none within 16 steps of the spawn', show('groups'));
A(!errs.chests.length, '1-3 chests on floor tiles, >= 10 tiles apart', show('chests'));
A(!errs.cadence.length, 'the cadence: alpha arena every 5th, guardian arena every 25th, rope on 10 / 20 / 25s, no landmark on an arena', show('cadence'));
A(['caves', 'clearing', 'islands', 'maze', 'guardian'].every(s => shapes[s] > 0), 'all the shapes appear (caves, clearing, islands, maze, guardian)', JSON.stringify(shapes));
A(D.layout({ seed: 5, route: 'crater', floor: 3 }).shape !== 'islands' && D.ROUTES.crater.noIslands, 'the crater never rolls islands');
const ms = (Date.now() - t0) / n;
A(ms < 40, `fast enough to build on the stairs (${ms.toFixed(1)} ms a floor)`);
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
