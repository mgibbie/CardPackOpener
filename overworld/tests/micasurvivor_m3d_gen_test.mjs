// micasurvivor_m3d_gen_test.mjs — MicaSurvivor 3D, P2 (Plans/MICASURVIVOR_3D_PLAN.md): level generation, in node
// (micasurvivor/m3d/gen.js). The generator is seeded and pure; a level is a sim.js room.
//   * the same seed gives the same level, bit for bit (replays, co-op guests and spectators rebuild a level from its
//     seed): 50 seeds' fingerprints are PINNED here — a change to the generator that moves any of them is a change to
//     every recorded level, and must be made on purpose (node …gen_test.mjs --print prints the new table)
//   * the invariants, over 50 seeds of each biome: every tile and the exit can be reached from the spawn ON FOOT (no
//     jump needed), everything you can reach on foot you can walk back from (no pits to be stuck in), no holes, no
//     slope too steep to stand on, the spawn and the exit far apart
//   * the check has teeth: wall the exit in, dig a pit, steepen a ramp — validate() says so each time
//   * the check agrees with the RULES: the real controller (sim.js step), holding only a direction, walks the level's
//     own route from the spawn to the exit, up ramps and through ponds, without ever pressing jump
//   * the shape: height levels joined by ramps of 20.6°, cliffs you can drop off, blocks one jump high, and biomes that
//     really differ (marsh is wet and flat, peaks are high and icy); ?size= makes bigger and smaller levels
//   node overworld/tests/micasurvivor_m3d_gen_test.mjs
import { K, CELL, step, newState, noInput, groundAt, waterAt } from '../../micasurvivor/m3d/sim.js';
import { generate, validate, footPath, hashRoom, BIOMES, TS, LEVEL } from '../../micasurvivor/m3d/gen.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1), NAMES = Object.keys(BIOMES);

// ---------------------------------------------------------------- determinism: 50 pinned fingerprints
const PINNED = 'b21b2a8f 10c6314e 8aab1460 43e12374 d8e2f4b9 d9385f00 4f708ff0 34066181 51dd20c6 ce23aa50 eddb5347 835535ae 54be8041 aaf0b229 9ee1bc70 0b0362ad f9392f9b 77db48c5 b27a7ab4 e3453d6d 439818c0 385022c2 de1cc38c 887054a8 04885e82 849aeeb9 3b4ce721 bca243dd 75bac70f 1c01fd33 a20ca64e ae6f3bae da7b9489 d282e254 fbf85027 b0a9d8a6 b4ead112 00ee5afe 928625b6 d0fa5a3b 0d42112e c38bf4fa 19714205 8a71f238 df0e7f3a a4b212fa 07f4daf1 8e374310 503404e6 803233be';
{
	const now = SEEDS.map((s) => hashRoom(generate(s, 'meadow'))).join(' ');
	if (process.argv.includes('--print')) console.log(now);
	A(now === PINNED, 'seeds 1-50 (meadow) build exactly the levels they always have (50 pinned fingerprints)', now);
	A(new Set(now.split(' ')).size === 50, '...and they are 50 different levels');
	const again = SEEDS.every((s) => NAMES.every((b) => hashRoom(generate(s, b)) === hashRoom(generate(s, b))));
	A(again, 'the same seed and biome give the same level every time, in every biome');
	A(hashRoom(generate(7, 'meadow')) !== hashRoom(generate(7, 'peaks')) && hashRoom(generate(7, 'meadow')) !== hashRoom(generate(7, 'marsh')), 'the same seed in another biome is another level');
	const a = generate(7, 'meadow'), b = generate(7, 'meadow');
	A(JSON.stringify(a.scatter) === JSON.stringify(b.scatter) && JSON.stringify(a.tiles) === JSON.stringify(b.tiles) && a.scatter.length > 5, 'the plan and the scatter are part of that (same seed, same decorations)');
}

// ---------------------------------------------------------------- the invariants, 50 seeds × every biome
for (const b of NAMES) {
	const bad = [], P = BIOMES[b]; let repaired = 0, near = 1e9, reach = 0;
	for (const s of SEEDS) {
		const r = generate(s, b), v = validate(r);
		if (!v.ok) bad.push([s, v.problems.slice(0, 2)]);
		repaired += r.repaired; reach += v.reach / v.cells;
		near = Math.min(near, Math.hypot(r.exit[0] - r.spawn[0], r.exit[2] - r.spawn[2]));
		if (r.w !== P.size * TS + 2 || r.h !== r.w || r.tiles.length !== P.size * P.size) bad.push([s, 'size']);
		if (groundAt(r, r.spawn[0], r.spawn[2]) !== r.spawn[1] || groundAt(r, r.exit[0], r.exit[2]) !== r.exit[1]) bad.push([s, 'spawn / exit not on the floor']);
		for (let i = 0; i < r.w; i++) if (r.cells[i] < r.rimH || r.cells[(r.h - 1) * r.w + i] < r.rimH || r.cells[i * r.w] < r.rimH || r.cells[i * r.w + r.w - 1] < r.rimH) { bad.push([s, 'a gap in the rim']); break; }
	}
	A(bad.length === 0, `${b}: 50 levels, every one passes: all tiles and the exit reachable on foot, no traps, no holes, no too-steep slope, a whole rim`, bad.slice(0, 4));
	A(near >= 2 * TS * CELL * 0.99, `${b}: the exit is never near the spawn (closest in 50 levels: ${near.toFixed(0)} m; two tiles or more)`, near);
	A(reach / 50 > 0.75, `${b}: most of a level is floor you can walk (${(reach / 0.5).toFixed(0)} % of its cells; the rest is the rim, block tops and ridges)`, reach / 50);
}

// ---------------------------------------------------------------- the check has teeth
{
	const wallIn = generate(3, 'meadow'), ex = Math.floor(wallIn.exit[0] / CELL), ez = Math.floor(wallIn.exit[2] / CELL);
	for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) { const i = (ez + dz) * wallIn.w + ex + dx; wallIn.cells[i] = wallIn.exit[1] + 3; wallIn.slopes.delete(i); }
	const v1 = validate(wallIn);
	A(!v1.ok && v1.problems.some((p) => /exit is not reachable/.test(p)), 'wall the exit in: the check says the exit is not reachable on foot', v1.problems);
	const pit = generate(3, 'meadow'), t = pit.tiles.find((q) => q.piece === 'plain' && q.dist > 0), px = Math.floor(t.centre[0] / CELL) + 1, pz = Math.floor(t.centre[2] / CELL) + 1;
	pit.cells[pz * pit.w + px] = t.centre[1] - 2;
	const v2 = validate(pit);
	A(!v2.ok && v2.problems.some((p) => /1 cells you can reach on foot but not walk back from/.test(p)), 'dig a 2 m pit: the check says there is a cell you cannot walk back out of', v2.problems);
	const steep = generate(3, 'meadow'), [si, ss] = [...steep.slopes][0];
	steep.slopes.set(si, { ax: ss.ax, rise: 2.4 });
	const v3 = validate(steep);
	A(!v3.ok && v3.problems.some((p) => /too steep/.test(p)), 'steepen a ramp to 50°: the check says it is too steep to stand on', v3.problems);
	const hole = generate(3, 'meadow'); hole.cells[40] = NaN;
	A(!validate(hole).ok, 'a hole in the floor is caught');
	A(validate(generate(3, 'meadow')).ok, '(the untouched level passes)');
}

// ---------------------------------------------------------------- the check agrees with the rules: walk it
/** Walk a level's own route from the spawn to a point with the real controller: a direction only, never jump. */
function walk(room, to, limit = 60 * 240) {
	const path = footPath(room, to); if (!path) return { ok: false, why: 'no path' };
	const s = newState(room); let k = 1, jumped = 0, swam = 0, climbed = 0, y0 = s.y;
	for (let n = 0; n < limit; n++) {
		const last = k >= path.length - 1, tx = last ? to[0] : (path[k][0] + 0.5) * CELL, tz = last ? to[2] : (path[k][1] + 0.5) * CELL;
		const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
		if (d < (last ? 0.6 : 0.45)) { if (last) return { ok: true, ticks: n, swam, climbed, jumped, s }; k++; continue; }
		step(s, { ...noInput(), mx: dx / d, mz: dz / d }, room);
		if (s.jumped) jumped++; if (s.swimming) swam++; if (s.y > y0 + 0.01) climbed += s.y - y0; y0 = s.y;
		if (s.respawns) return { ok: false, why: 'fell out of the world', k };
	}
	return { ok: false, why: 'stuck', k, of: path.length, at: [s.x, s.y, s.z], cell: path[k] };
}
{
	const stuck = []; let n = 0, swam = 0, climbed = 0, slow = 0;
	for (const b of NAMES) for (const s of SEEDS.slice(0, 20)) {
		const r = generate(s, b), w = walk(r, r.exit); n++;
		if (!w.ok || w.jumped) stuck.push([b, s, w.why, w.k, w.of, w.at, w.cell]); else { if (w.swam) swam++; if (w.climbed > 1) climbed++; slow = Math.max(slow, w.ticks / 60); }
	}
	A(stuck.length === 0, `the real controller walks from the spawn to the exit in ${n} levels (20 of each biome) holding only a direction: never a jump`, stuck.slice(0, 3));
	A(climbed > n * 0.5, `...up ramps on the way in most of them (${climbed} of ${n})`, climbed);
	console.log(`     (${swam} of those routes go through a pond; the longest walk took ${slow.toFixed(0)} s)`);
	// every tile of a level, not only the exit; and through ponds on purpose
	const r = generate(11, 'marsh'), all = r.tiles.map((t) => walk(r, t.centre));
	A(all.every((w) => w.ok && !w.jumped), 'and to the middle of every one of a marsh level\'s 25 tiles', all.map((w, i) => (w.ok ? '' : i + ':' + w.why)).filter(Boolean));
	const ponds = r.tiles.filter((t) => t.piece === 'pond'), wp = ponds.map((t) => { const w = walk(r, t.centre); if (w.ok) for (let n = 0; n < 90; n++) { step(w.s, noInput(), r); if (w.s.swimming) w.swam++; } return w; });
	A(ponds.length >= 3 && wp.every((w) => w.ok && w.swam > 0 && w.s.swimming && Math.abs(w.s.y - (waterAt(r, w.s.x, w.s.z) - K.SWIM_DEPTH)) < 0.05), `a pond's middle is deep: you swim to it (${ponds.length} ponds in this level), floating at the surface`, wp.map((w) => [w.ok, w.swam]));
}

// ---------------------------------------------------------------- the shape
{
	// ramps: 0.75 m a cell, in pairs across a tile boundary, three cells wide; they join tiles one level apart
	let ramps = 0, wrong = 0, links = 0, cliffs = 0, ridges = 0, far = 0;
	for (const s of SEEDS) {
		const r = generate(s, 'meadow'), N = r.size;
		for (const [, sl] of r.slopes) { ramps++; if (Math.abs(Math.abs(sl.rise) - LEVEL / 2) > 1e-9) wrong++; }
		let need = 0;
		for (const t of r.tiles) for (const [d, dx, dz] of [['e', 1, 0], ['s', 0, 1]]) {
			if (t.tx + dx >= N || t.tz + dz >= N) continue;
			const o = r.tiles[(t.tz + dz) * N + t.tx + dx], gap = Math.abs(o.level - t.level);
			if (t.link[d]) { links++; if (gap > 1) far++; if (gap === 1) need += 6; } else if (gap) cliffs++; else if (t.ridge[d]) ridges++;
		}
		if (r.slopes.size !== need) wrong++;
	}
	A(ramps > 2000 && wrong === 0, `ramps: every slope cell rises 0.75 m (20.6°), and each link between two levels has exactly its 6 (${ramps} slope cells in 50 levels)`, [ramps, wrong]);
	A(far === 0 && links >= 50 * 24, 'tiles are only ever linked a level apart or less; every level has its spanning tree (24 links) or more', [far, links]);
	A(cliffs > 300 && ridges > 100, `unlinked tiles meet at cliffs (${cliffs}) and ridges (${ridges})`, [cliffs, ridges]);
}
{
	// a block is one jump high: the real controller jumps onto one
	let done = null;
	for (const s of SEEDS) {
		const r = generate(s, 'meadow');
		for (const t of r.tiles) {
			if (t.piece !== 'blocks') continue;
			const cx = Math.floor(t.centre[0] / CELL), cz = Math.floor(t.centre[2] / CELL), h = t.centre[1];
			// a low block straight east of the tile's middle row? (cells cx+1.. in the row above the middle: quadrant rows)
			for (const dz of [-2, -1, 1, 2]) for (const dx of [1, 2]) {
				if (done || Math.abs(r.cells[(cz + dz) * r.w + cx + dx] - (h + LEVEL)) > 1e-9 || r.cells[(cz + dz) * r.w + cx] !== h || r.cells[(cz + dz) * r.w + cx + dx - 1] !== h) continue;
				const st = newState(r); st.x = (cx + dx - 1 + 0.3) * CELL; st.z = (cz + dz + 0.5) * CELL; st.y = h;
				let top = false;
				for (let n = 0; n < 90; n++) { step(st, { ...noInput(), mx: 1, jump: n > 2 && n < 30 }, r); if (st.grounded && Math.abs(st.y - (h + LEVEL)) < 1e-6) top = true; }
				done = { seed: s, top, y: st.y, want: h + LEVEL };
			}
		}
	}
	A(done && done.top, 'a block is one jump high (1.5 m): the controller jumps up onto one', done);
}
{
	// biomes differ, and the pieces are all really made
	const sum = {};
	for (const b of NAMES) {
		const o = sum[b] = { water: 0, ice: 0, mud: 0, bounce: 0, top: 0, pieces: new Set(), scatter: 0 };
		for (const s of SEEDS) { const r = generate(s, b); o.water += r.water.size; for (const m of r.mats.values()) o[m]++; for (const t of r.tiles) { o.pieces.add(t.piece); o.top = Math.max(o.top, t.level); } o.scatter += r.scatter.length; }
	}
	A(sum.marsh.water > sum.meadow.water * 2 && sum.marsh.mud > sum.meadow.mud * 2 && sum.marsh.top === 1, 'marsh is wet, muddy and flat (two height levels)', [sum.marsh.water, sum.meadow.water, sum.marsh.mud, sum.meadow.mud, sum.marsh.top]);
	A(sum.peaks.top === 4 && sum.peaks.ice > 0 && sum.meadow.ice === 0 && sum.meadow.top === 2, 'peaks are high (five levels) and icy; a meadow has three levels and no ice', [sum.peaks.top, sum.peaks.ice, sum.meadow.top]);
	A(['plain', 'blocks', 'pond', 'mud', 'bounce', 'mound'].every((p) => sum.meadow.pieces.has(p)) && sum.meadow.bounce > 10, 'a meadow has every one of its set pieces somewhere in 50 levels: blocks, ponds, mud, bounce pads, mounds', [...sum.meadow.pieces]);
	A(NAMES.every((b) => sum[b].scatter > 500), 'every biome scatters decorations on its plain floor', NAMES.map((b) => sum[b].scatter));
	const sc = generate(5, 'meadow'), off = sc.scatter.filter((o) => groundAt(sc, o.x, o.z) !== o.y || sc.water.has(Math.floor(o.z / CELL) * sc.w + Math.floor(o.x / CELL)));
	A(off.length === 0, 'a decoration always sits on dry flat floor at its own height', off.slice(0, 3));
}
{
	// sizes
	const sizes = [3, 4, 6, 8].map((n) => { const r = generate(9, 'meadow', { size: n }); return { n, w: r.w, ok: validate(r).ok, tiles: r.tiles.length }; });
	A(sizes.every((o) => o.ok && o.w === o.n * TS + 2 && o.tiles === o.n * o.n), 'a level can be 3 to 8 tiles a side, and passes the check at every size', sizes);
	const big = generate(9, 'meadow', { size: 8 }), w = walk(big, big.exit, 60 * 600);
	A(w.ok && !w.jumped, 'the controller walks an 8 × 8 level from the spawn to the exit too', [w.why, w.k]);
	const t0 = Date.now(); for (let s = 100; s < 150; s++) generate(s, 'peaks');
	const ms = (Date.now() - t0) / 50;
	A(ms < 60, `building a level is quick (${ms.toFixed(1)} ms each here, checked and all)`, ms);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
